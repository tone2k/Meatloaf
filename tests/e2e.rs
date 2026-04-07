//! End-to-end smoke test for the entire Milestone 1 capture daemon.
//!
//! This test exercises every component the way a real user would: a fresh
//! git project, `watcher init`, the daemon running in the background, a file
//! edit picked up by notify, a real `git commit` running the installed
//! post-commit hook, and a `record-terminal` invocation. After shutdown it
//! opens a *second* SQLite connection (WAL mode makes this safe) and
//! verifies rows in all three event tables plus a closed session row.

use std::process::Command as StdCommand;
use std::time::{Duration, Instant};

use assert_cmd::Command;
use tempfile::tempdir;

use watcher::storage::Storage;
use watcher::storage::models::{FileEventType, GitEventType};

fn run_git(cwd: &std::path::Path, args: &[&str]) {
    let status = StdCommand::new("git")
        .args(args)
        .current_dir(cwd)
        .status()
        .expect("git spawn");
    assert!(status.success(), "git {args:?} failed in {}", cwd.display());
}

#[test]
fn full_capture_round_trip() {
    let project = tempdir().expect("tempdir");
    let project_root = project.path();

    // Real git fixture (signing disabled for sandboxed CI environments).
    run_git(project_root, &["init", "-q"]);
    run_git(project_root, &["config", "user.email", "e2e@example.com"]);
    run_git(project_root, &["config", "user.name", "E2E"]);
    run_git(project_root, &["config", "commit.gpgsign", "false"]);

    // watcher init: scaffolds .watcher/, installs git hooks, writes shell snippet.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project_root)
        .assert()
        .success();

    // watcher start: forks the daemon child.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("start")
        .current_dir(project_root)
        .assert()
        .success();

    // Wait for the pid file to materialize so we know the child is running.
    let pid_path = project_root.join(".watcher").join("watcher.pid");
    let deadline = Instant::now() + Duration::from_secs(2);
    while Instant::now() < deadline && !pid_path.exists() {
        std::thread::sleep(Duration::from_millis(50));
    }
    assert!(pid_path.exists(), "daemon pid file should exist after start");

    // Edit a file - the daemon should capture this through notify.
    let target = project_root.join("hello.txt");
    std::fs::write(&target, "first edit").unwrap();

    // Real git commit: triggers the installed post-commit hook which shells
    // out to `watcher record-git post-commit`.
    run_git(project_root, &["add", "hello.txt"]);
    run_git(project_root, &["commit", "-q", "-m", "initial commit"]);

    // Record a terminal command directly (the shell hook would do this).
    Command::cargo_bin("watcher")
        .unwrap()
        .args([
            "record-terminal",
            "--command",
            "cargo build",
            "--exit-code",
            "0",
            "--cwd",
            project_root.to_str().unwrap(),
        ])
        .current_dir(project_root)
        .assert()
        .success();

    // Give notify time to flush the file event through the 1s debounce.
    std::thread::sleep(Duration::from_millis(1500));

    // watcher stop: drains the writer thread, closes the session, removes pid.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("stop")
        .current_dir(project_root)
        .assert()
        .success();

    // Open a *second* read connection (WAL makes this safe) and verify rows
    // in all three event tables.
    let storage = Storage::open(&project_root.join(".watcher").join("watcher.db"))
        .expect("open storage for inspection");

    let file_events = storage.list_file_events().unwrap();
    assert!(
        file_events.iter().any(|e| {
            std::path::Path::new(&e.file_path)
                .file_name()
                .and_then(|n| n.to_str())
                == Some("hello.txt")
                && matches!(e.event_type, FileEventType::Create | FileEventType::Modify)
        }),
        "expected hello.txt in file_events: {file_events:?}"
    );

    let git_events = storage.list_git_events().unwrap();
    assert!(
        git_events
            .iter()
            .any(|e| e.event_type == GitEventType::PostCommit
                && e.message.as_deref() == Some("initial commit")),
        "expected post-commit row with the right message: {git_events:?}"
    );

    let terminal_events = storage.list_terminal_events().unwrap();
    assert!(
        terminal_events
            .iter()
            .any(|e| e.command == "cargo build" && e.exit_code == Some(0)),
        "expected terminal_events row for cargo build: {terminal_events:?}"
    );

    // The daemon's session row should exist with end_time populated.
    let session_id = file_events
        .iter()
        .find_map(|e| e.session_id.clone())
        .expect("daemon should have stamped a session_id on captured events");
    let session_row = storage
        .session_row(&session_id)
        .unwrap()
        .expect("session row exists");
    assert!(
        session_row.end_time.is_some(),
        "session end_time should be set after stop"
    );

    // Pid file is gone.
    assert!(!pid_path.exists(), "pid file should be removed after stop");
}
