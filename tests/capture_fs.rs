//! Real-notify integration test for the capture file watcher.
//!
//! This is the *one* slice that exercises OS notification primitives. Other
//! capture coverage lives in unit tests against the EventSink seam.

use std::time::{Duration, Instant};

use crossbeam_channel::unbounded;
use tempfile::tempdir;

use watcher::capture::fs::spawn;
use watcher::storage::Storage;
use watcher::storage::models::FileEventType;

#[test]
fn writing_a_file_is_captured_into_storage() {
    let project = tempdir().expect("tempdir");
    let project_root = project.path().canonicalize().expect("canonicalize");
    let db_path = project_root.join("watcher.db");

    let storage = std::sync::Arc::new(Storage::open(&db_path).expect("open storage"));
    let session_id = storage.open_session().expect("open session");

    let (shutdown_tx, shutdown_rx) = unbounded::<()>();
    let handle = spawn(
        project_root.clone(),
        storage.clone(),
        session_id.clone(),
        shutdown_rx,
    )
    .expect("spawn capture");

    // Give notify a moment to install its watch before we start writing.
    std::thread::sleep(Duration::from_millis(200));

    let target = project_root.join("a.txt");
    std::fs::write(&target, b"hello").expect("write target file");

    // Poll the database until the event lands or the deadline elapses.
    // 5s deadline accommodates macOS FSEvents latency.
    let deadline = Instant::now() + Duration::from_secs(5);
    let mut found = false;
    while Instant::now() < deadline {
        let rows = storage.list_file_events().expect("list");
        if rows.iter().any(|r| {
            std::path::Path::new(&r.file_path)
                .file_name()
                .and_then(|s| s.to_str())
                == Some("a.txt")
                && matches!(
                    r.event_type,
                    FileEventType::Create | FileEventType::Modify
                )
        }) {
            found = true;
            break;
        }
        std::thread::sleep(Duration::from_millis(100));
    }

    let _ = shutdown_tx.send(());
    handle.join().expect("capture thread join");

    assert!(
        found,
        "expected a file_events row for a.txt within 5s; got {:?}",
        storage.list_file_events().unwrap()
    );
}
