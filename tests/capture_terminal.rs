//! Integration tests for `watcher record-terminal` and the shell hook snippet.

use assert_cmd::Command;
use tempfile::tempdir;

use watcher::storage::Storage;

#[test]
fn record_terminal_inserts_terminal_event_row() {
    let project = tempdir().expect("tempdir");
    let project_root = project.path();

    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project_root)
        .assert()
        .success();

    Command::cargo_bin("watcher")
        .unwrap()
        .args([
            "record-terminal",
            "--command",
            "cargo test",
            "--exit-code",
            "0",
            "--cwd",
            "/tmp/example",
        ])
        .current_dir(project_root)
        .assert()
        .success();

    let storage = Storage::open(&project_root.join(".watcher").join("watcher.db"))
        .expect("open storage");
    let events = storage.list_terminal_events().expect("list");
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].command, "cargo test");
    assert_eq!(events[0].exit_code, Some(0));
    assert_eq!(events[0].cwd.as_deref(), Some("/tmp/example"));
}
