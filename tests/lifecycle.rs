//! Tests for the daemon::run lifecycle: file capture round-trip + clean
//! shutdown drain + pid file management.

use std::time::{Duration, Instant};

use crossbeam_channel::unbounded;
use tempfile::tempdir;

use watcher::daemon::{RunConfig, run};
use watcher::storage::Storage;

#[test]
fn run_captures_files_and_drains_pending_events_on_shutdown() {
    let project = tempdir().expect("tempdir");
    let project_root = project.path().canonicalize().expect("canonicalize");
    let watcher_dir = project_root.join(".watcher");
    std::fs::create_dir_all(&watcher_dir).unwrap();
    let pid_path = watcher_dir.join("watcher.pid");

    let (shutdown_tx, shutdown_rx) = unbounded::<()>();
    let cfg = RunConfig {
        project_root: project_root.clone(),
        pid_file: pid_path.clone(),
        foreground: true,
        shutdown_rx: shutdown_rx.clone(),
    };

    let project_root_for_thread = project_root.clone();
    let handle = std::thread::spawn(move || run(cfg).expect("daemon run"));

    // Wait for the daemon to install its watcher (poll for pid file).
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline && !pid_path.exists() {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(
        pid_path.exists(),
        "daemon should have written a pid file at {}",
        pid_path.display()
    );

    // Generate a few file events.
    for i in 0..5 {
        std::fs::write(
            project_root_for_thread.join(format!("f{i}.txt")),
            format!("payload {i}"),
        )
        .unwrap();
    }

    // Give notify time to coalesce events through the 1s debounce window.
    std::thread::sleep(Duration::from_millis(1500));

    // Trigger shutdown; the daemon must drain in-flight events before exit.
    shutdown_tx.send(()).unwrap();
    handle.join().expect("daemon thread join");

    // PID file is removed.
    assert!(
        !pid_path.exists(),
        "pid file should be removed after shutdown"
    );

    // Open a fresh read connection (WAL makes this safe) and verify rows.
    let storage = Storage::open(&project_root.join(".watcher").join("watcher.db"))
        .expect("open storage");
    let events = storage.list_file_events().expect("list");
    let captured: Vec<&str> = events
        .iter()
        .filter_map(|e| {
            std::path::Path::new(&e.file_path)
                .file_name()
                .and_then(|s| s.to_str())
        })
        .collect();
    for i in 0..5 {
        let expected = format!("f{i}.txt");
        assert!(
            captured.iter().any(|c| *c == expected),
            "expected {expected} in captured events: {captured:?}"
        );
    }

    // The session row was opened and then closed.
    let session_id = events
        .iter()
        .find_map(|e| e.session_id.clone())
        .expect("at least one event should carry a session_id");
    let row = storage
        .session_row(&session_id)
        .unwrap()
        .expect("session row exists");
    assert!(
        row.end_time.is_some(),
        "session end_time should be set after shutdown"
    );
}
