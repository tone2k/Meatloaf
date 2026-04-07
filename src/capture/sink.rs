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
/// session id minted by `daemon::run()`. Text files are read from disk,
/// hashed with blake3, and stored as zstd-compressed blobs so the daemon
/// can later reconstruct the exact bytes that were on disk.
pub struct StorageSink {
    storage: Arc<Storage>,
    session_id: String,
    project_root: PathBuf,
    max_snapshot_bytes: u64,
}

/// Default cap on the size of any single content snapshot before we fall
/// back to metadata-only.
pub const DEFAULT_MAX_SNAPSHOT_BYTES: u64 = 1024 * 1024;
const ZSTD_LEVEL: i32 = 3;

impl StorageSink {
    pub fn new(storage: Arc<Storage>, session_id: String, project_root: PathBuf) -> Self {
        Self {
            storage,
            session_id,
            project_root,
            max_snapshot_bytes: DEFAULT_MAX_SNAPSHOT_BYTES,
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

                // Snapshot file content for non-delete events. Deletes never
                // have content, and oversized files store metadata only.
                let mut content_hash = None;
                let mut content = None;
                if !matches!(kind, FileEventType::Delete) {
                    let absolute = if path.is_absolute() {
                        path.clone()
                    } else {
                        self.project_root.join(&path)
                    };
                    if let Some(snapshot) = self.snapshot_file(&absolute)? {
                        content_hash = Some(snapshot.hash);
                        content = snapshot.compressed;
                    }
                }

                let event = FileEvent {
                    timestamp,
                    file_path,
                    event_type: kind,
                    content_hash,
                    content,
                    session_id: Some(self.session_id.clone()),
                };
                self.storage.insert_file_event(&event)
            }
        }
    }

    fn snapshot_file(&self, absolute: &std::path::Path) -> anyhow::Result<Option<FileSnapshot>> {
        // The file may have been deleted between the notify event and our
        // read; treat that as "no snapshot" rather than an error so the
        // event still lands in the database.
        let metadata = match std::fs::metadata(absolute) {
            Ok(m) => m,
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
            Err(err) => {
                return Err(err)
                    .with_context(|| format!("stat {}", absolute.display()));
            }
        };

        if !metadata.is_file() {
            return Ok(None);
        }

        let bytes = std::fs::read(absolute)
            .with_context(|| format!("reading {}", absolute.display()))?;
        let hash = blake3::hash(&bytes).to_hex().to_string();

        let compressed = if metadata.len() > self.max_snapshot_bytes {
            None
        } else {
            Some(
                zstd::encode_all(bytes.as_slice(), ZSTD_LEVEL)
                    .context("zstd-compressing file content")?,
            )
        };

        Ok(Some(FileSnapshot { hash, compressed }))
    }
}

struct FileSnapshot {
    hash: String,
    compressed: Option<Vec<u8>>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::Storage;
    use tempfile::tempdir;

    #[test]
    fn storage_sink_records_blake3_hash_and_zstd_content() {
        let project = tempdir().unwrap();
        let project_root = project.path().to_path_buf();
        let db_path = project_root.join("watcher.db");
        let storage = Arc::new(Storage::open(&db_path).unwrap());
        let session_id = storage.open_session().unwrap();

        let body = b"hello watcher world";
        std::fs::write(project_root.join("a.txt"), body).unwrap();

        let sink = StorageSink::new(storage.clone(), session_id, project_root.clone());
        sink.record(CapturedEvent::FileChanged {
            path: PathBuf::from("a.txt"),
            kind: FileEventType::Modify,
        });

        let rows = storage.list_file_events().unwrap();
        assert_eq!(rows.len(), 1);
        let row = &rows[0];

        let expected_hash = blake3::hash(body).to_hex().to_string();
        assert_eq!(row.content_hash.as_deref(), Some(expected_hash.as_str()));

        let compressed = row
            .content
            .as_ref()
            .expect("text file should have a compressed content blob");
        let decoded = zstd::decode_all(compressed.as_slice()).expect("decode");
        assert_eq!(decoded.as_slice(), body);
    }
}
