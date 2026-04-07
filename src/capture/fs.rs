// Capture types are exercised by unit tests today and consumed by the
// daemon run loop in Slice 11a. Allow until that wiring lands.
#![allow(dead_code)]

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

use anyhow::{Context, Result};
use crossbeam_channel::{Receiver, Sender, bounded, select};
use notify::{EventKind, RecursiveMode};
use notify_debouncer_full::{DebounceEventResult, DebouncedEvent, new_debouncer};

use crate::capture::ignore::IgnoreMatcher;
use crate::capture::sink::{CapturedEvent, EventSink, StorageSink};
use crate::storage::Storage;
use crate::storage::models::FileEventType;

/// Capacity of the channel between the notify callback thread and our writer
/// thread. Bounded so a slow writer back-pressures notify instead of growing
/// without bound under bursts.
const EVENT_CHANNEL_CAPACITY: usize = 1024;
/// Debounce window forwarded to notify-debouncer-full.
const DEBOUNCE_WINDOW: Duration = Duration::from_secs(1);

/// Internal representation of a raw filesystem notification, decoupled from
/// the `notify` crate so unit tests can drive [`handle_event`] without
/// constructing OS-specific event types.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RawEventKind {
    Create,
    Modify,
    Remove,
    /// Anything we don't translate (rename source, metadata-only, etc.).
    Other,
}

/// Translate a single raw filesystem notification into one or more
/// [`CapturedEvent`]s and forward them to `sink`. Paths are rewritten to be
/// relative to `project_root` so downstream consumers (storage, TUI) never
/// see absolute filesystem paths.
pub fn handle_event(
    sink: &dyn EventSink,
    project_root: &Path,
    kind: RawEventKind,
    paths: &[PathBuf],
) {
    let Some(file_event_kind) = translate_kind(kind) else {
        return;
    };

    for path in paths {
        let relative = path
            .strip_prefix(project_root)
            .map(Path::to_path_buf)
            .unwrap_or_else(|_| path.clone());
        sink.record(CapturedEvent::FileChanged {
            path: relative,
            kind: file_event_kind,
        });
    }
}

fn translate_kind(kind: RawEventKind) -> Option<FileEventType> {
    match kind {
        RawEventKind::Create => Some(FileEventType::Create),
        RawEventKind::Modify => Some(FileEventType::Modify),
        RawEventKind::Remove => Some(FileEventType::Delete),
        RawEventKind::Other => None,
    }
}

/// Map a notify [`EventKind`] into our internal [`RawEventKind`].
fn raw_event_kind_from_notify(kind: &EventKind) -> RawEventKind {
    match kind {
        EventKind::Create(_) => RawEventKind::Create,
        EventKind::Modify(_) => RawEventKind::Modify,
        EventKind::Remove(_) => RawEventKind::Remove,
        EventKind::Access(_) | EventKind::Any | EventKind::Other => RawEventKind::Other,
    }
}

/// Single batch of debounced events handed off from the notify thread to the
/// writer thread.
struct EventBatch {
    events: Vec<DebouncedEvent>,
}

/// Spin up the file watcher for `project_root`. Returns a JoinHandle for the
/// writer thread; sending on `shutdown_rx` triggers a clean drain + exit.
///
/// The notify watcher itself runs on its own thread inside the debouncer; we
/// spawn one additional writer thread that consumes batches from a bounded
/// channel and forwards them through `handle_event` into a [`StorageSink`].
pub fn spawn(
    project_root: PathBuf,
    storage: Arc<Storage>,
    session_id: String,
    shutdown_rx: Receiver<()>,
) -> Result<JoinHandle<()>> {
    let (tx, rx): (Sender<EventBatch>, Receiver<EventBatch>) = bounded(EVENT_CHANNEL_CAPACITY);

    let mut debouncer =
        new_debouncer(DEBOUNCE_WINDOW, None, move |result: DebounceEventResult| {
            match result {
                Ok(events) => {
                    if let Err(err) = tx.send(EventBatch { events }) {
                        tracing::warn!(error = %err, "writer channel closed; dropping batch");
                    }
                }
                Err(errors) => {
                    for err in errors {
                        tracing::warn!(error = %err, "notify watcher error");
                    }
                }
            }
        })
        .context("creating notify debouncer")?;

    debouncer
        .watch(&project_root, RecursiveMode::Recursive)
        .with_context(|| format!("watching {}", project_root.display()))?;

    let sink = StorageSink::new(storage, session_id, project_root.clone());
    let writer_root = project_root.clone();
    let matcher = IgnoreMatcher::new(&project_root).context("loading ignore matcher")?;

    let handle = thread::Builder::new()
        .name("watcher-fs-writer".into())
        .spawn(move || {
            // The debouncer must outlive the writer thread; move it in.
            let _debouncer = debouncer;
            let mut matcher = matcher;
            writer_loop(&writer_root, &sink, &mut matcher, rx, shutdown_rx);
        })
        .context("spawning writer thread")?;

    Ok(handle)
}

fn writer_loop(
    project_root: &Path,
    sink: &dyn EventSink,
    matcher: &mut IgnoreMatcher,
    rx: Receiver<EventBatch>,
    shutdown_rx: Receiver<()>,
) {
    loop {
        select! {
            recv(rx) -> msg => match msg {
                Ok(batch) => process_batch(sink, project_root, matcher, batch),
                Err(_) => return,
            },
            recv(shutdown_rx) -> _ => {
                // Drain anything still pending so we don't lose events at exit.
                while let Ok(batch) = rx.try_recv() {
                    process_batch(sink, project_root, matcher, batch);
                }
                return;
            }
        }
    }
}

fn process_batch(
    sink: &dyn EventSink,
    project_root: &Path,
    matcher: &mut IgnoreMatcher,
    batch: EventBatch,
) {
    for debounced in batch.events {
        let raw_kind = raw_event_kind_from_notify(&debounced.event.kind);
        if debounced.event.paths.is_empty() {
            continue;
        }

        // If any path in this batch is one of the ignore source files, refresh
        // the matcher before applying its rules.
        if debounced
            .event
            .paths
            .iter()
            .any(|p| matcher.is_source_file(p))
            && let Err(err) = matcher.reload()
        {
            tracing::warn!(error = %err, "failed to reload ignore matcher");
        }

        let kept: Vec<PathBuf> = debounced
            .event
            .paths
            .into_iter()
            .filter(|p| !matcher.is_ignored(p))
            .collect();
        if kept.is_empty() {
            continue;
        }

        handle_event(sink, project_root, raw_kind, &kept);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::capture::sink::{CapturedEvent, TestSink};
    use std::time::Duration;

    #[test]
    fn handle_event_emits_relative_file_changed_for_modify() {
        let (sink, rx) = TestSink::new();
        let project_root = PathBuf::from("/proj");
        let absolute = project_root.join("src").join("main.rs");

        handle_event(&sink, &project_root, RawEventKind::Modify, &[absolute]);

        let evt = rx
            .recv_timeout(Duration::from_millis(100))
            .expect("test sink should have one event");
        assert_eq!(
            evt,
            CapturedEvent::FileChanged {
                path: PathBuf::from("src/main.rs"),
                kind: FileEventType::Modify,
            }
        );
        assert!(rx.is_empty(), "no extra events expected");
    }
}
