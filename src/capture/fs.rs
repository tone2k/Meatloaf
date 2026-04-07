// Capture types are exercised by unit tests today and consumed by the
// daemon run loop in Slice 11a. Allow until that wiring lands.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use crate::capture::sink::{CapturedEvent, EventSink};
use crate::storage::models::FileEventType;

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
