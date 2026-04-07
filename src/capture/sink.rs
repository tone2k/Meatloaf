// Capture sinks are exercised by unit tests today and wired into the
// daemon writer thread in Slice 11a. Allow until that lands.
#![allow(dead_code)]

use std::path::PathBuf;

use crossbeam_channel::{Receiver, Sender, unbounded};

use crate::storage::models::FileEventType;

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
