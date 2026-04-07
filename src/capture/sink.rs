// Capture sinks are exercised by unit tests today and wired into the
// daemon writer thread in Slice 11a. Allow until that lands.
#![allow(dead_code)]

use std::path::PathBuf;
use std::sync::Arc;

use anyhow::Context;
use crossbeam_channel::{Receiver, Sender, unbounded};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::storage::Storage;
use crate::storage::models::{FileEvent, FileEventType};

/// Translated, sink-ready capture event.
///
/// `capture::fs::handle_event` produces these from raw notify events; sinks
/// either persist them (`StorageSink`, added next slice) or buffer them in
/// memory (`TestSink`, used by unit tests).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CapturedEvent {
    FileChanged {
        /// Path of the file *relative to* the project root.
        path: PathBuf,
        kind: FileEventType,
    },
}

/// Anything that wants to consume captured events from the watcher.
pub trait EventSink: Send + Sync {
    fn record(&self, event: CapturedEvent);
}

/// In-memory sink used by unit tests.
pub struct TestSink {
    tx: Sender<CapturedEvent>,
}

impl TestSink {
    pub fn new() -> (Self, Receiver<CapturedEvent>) {
        let (tx, rx) = unbounded();
        (Self { tx }, rx)
    }
}

impl EventSink for TestSink {
    fn record(&self, event: CapturedEvent) {
        // Tests own the receiver; a SendError here would mean the test
        // dropped the channel early, which is fine to swallow.
        let _ = self.tx.send(event);
    }
}

/// Sink that persists every captured event into [`Storage`].
///
/// Each event gets the current UTC timestamp and is stamped with the
/// session id minted by `daemon::run()`.
pub struct StorageSink {
    storage: Arc<Storage>,
    session_id: String,
}

impl StorageSink {
    pub fn new(storage: Arc<Storage>, session_id: String) -> Self {
        Self {
            storage,
            session_id,
        }
    }
}

impl EventSink for StorageSink {
    fn record(&self, event: CapturedEvent) {
        if let Err(err) = self.try_record(event) {
            tracing::warn!(error = %err, "failed to persist captured event");
        }
    }
}

impl StorageSink {
    fn try_record(&self, event: CapturedEvent) -> anyhow::Result<()> {
        match event {
            CapturedEvent::FileChanged { path, kind } => {
                let timestamp = OffsetDateTime::now_utc()
                    .format(&Rfc3339)
                    .context("formatting file_event timestamp")?;
                let file_path = path.to_string_lossy().into_owned();
                let event = FileEvent {
                    timestamp,
                    file_path,
                    event_type: kind,
                    content_hash: None,
                    content: None,
                    session_id: Some(self.session_id.clone()),
                };
                self.storage.insert_file_event(&event)
            }
        }
    }
}
