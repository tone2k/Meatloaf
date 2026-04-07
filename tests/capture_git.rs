//! Integration tests for `watcher record-git` (the hidden hook subcommand)
//! and the git hook installation that `watcher init` performs.

use std::process::Command as StdCommand;

use assert_cmd::Command;
use tempfile::tempdir;

use watcher::storage::Storage;
use watcher::storage::models::GitEventType;

fn run(cmd: &mut StdCommand) {
    let status = cmd.status().expect("git command spawn");
    assert!(status.success(), "git command failed: {cmd:?}");
}

#[test]
fn record_git_post_commit_inserts_git_event_row() {
    let project = tempdir().expect("tempdir");
    let project_root = project.path();

    // Real git fixture: init + identity + commit so HEAD resolves.
    // GPG signing is disabled in this throwaway repo so the test runs in
    // sandboxed environments that lack a signing key.
    run(StdCommand::new("git")
        .arg("init")
        .arg("-q")
        .current_dir(project_root));
    run(StdCommand::new("git")
        .args(["config", "user.email", "test@example.com"])
        .current_dir(project_root));
    run(StdCommand::new("git")
        .args(["config", "user.name", "Test User"])
        .current_dir(project_root));
    run(StdCommand::new("git")
        .args(["config", "commit.gpgsign", "false"])
        .current_dir(project_root));
    std::fs::write(project_root.join("a.txt"), "hello").unwrap();
    run(StdCommand::new("git")
        .args(["add", "a.txt"])
        .current_dir(project_root));
    run(StdCommand::new("git")
        .args(["commit", "-q", "-m", "first commit"])
        .current_dir(project_root));

    // Initialize the watcher state inside the project so the DB exists.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project_root)
        .assert()
        .success();

    // Invoke the hidden record-git subcommand directly (the hook will do
    // the same in Slice 9b).
    Command::cargo_bin("watcher")
        .unwrap()
        .args(["record-git", "post-commit"])
        .current_dir(project_root)
        .assert()
        .success();

    // Open the DB read-only and verify the row.
    let storage = Storage::open(&project_root.join(".watcher").join("watcher.db"))
        .expect("open storage");
    let events = storage.list_git_events().expect("list git events");
    assert_eq!(events.len(), 1, "expected exactly one git_events row");
    let evt = &events[0];
    assert_eq!(evt.event_type, GitEventType::PostCommit);
    assert!(
        evt.commit_hash.as_deref().is_some_and(|h| h.len() == 40),
        "commit_hash should be a 40-char sha: {:?}",
        evt.commit_hash
    );
    assert_eq!(evt.message.as_deref(), Some("first commit"));
    assert_eq!(evt.files_changed, vec!["a.txt".to_string()]);
}

#[test]
fn init_installs_hooks_idempotently_and_preserves_existing() {
    let project = tempdir().expect("tempdir");
    let project_root = project.path();

    // Real git repo with a pre-existing user post-commit hook.
    run(StdCommand::new("git")
        .arg("init")
        .arg("-q")
        .current_dir(project_root));

    let hooks_dir = project_root.join(".git").join("hooks");
    let post_commit = hooks_dir.join("post-commit");
    let user_marker = "echo PRESERVED";
    std::fs::write(
        &post_commit,
        format!("#!/bin/sh\n{user_marker}\n"),
    )
    .unwrap();

    // First init installs the watcher block alongside the user script.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project_root)
        .assert()
        .success();

    let after = std::fs::read_to_string(&post_commit).unwrap();
    assert!(
        after.contains(user_marker),
        "user hook script must be preserved:\n{after}"
    );
    assert!(
        after.contains("# >>> watcher >>>") && after.contains("# <<< watcher <<<"),
        "watcher block markers must be present:\n{after}"
    );
    assert!(
        after.contains("watcher record-git post-commit"),
        "watcher block must invoke record-git post-commit:\n{after}"
    );

    // Second init (with --force) is a no-op for the hook: still exactly one
    // watcher block, user script still intact.
    Command::cargo_bin("watcher")
        .unwrap()
        .args(["init", "--force"])
        .current_dir(project_root)
        .assert()
        .success();

    let again = std::fs::read_to_string(&post_commit).unwrap();
    assert_eq!(
        again.matches("# >>> watcher >>>").count(),
        1,
        "watcher block should not be duplicated on re-init:\n{again}"
    );
    assert!(again.contains(user_marker));

    // post-checkout and post-merge should also be installed.
    let post_checkout = std::fs::read_to_string(hooks_dir.join("post-checkout")).unwrap();
    assert!(post_checkout.contains("watcher record-git post-checkout"));
    let post_merge = std::fs::read_to_string(hooks_dir.join("post-merge")).unwrap();
    assert!(post_merge.contains("watcher record-git post-merge"));
}

#[test]
fn init_outside_git_repo_succeeds_without_hooks() {
    let project = tempdir().expect("tempdir");
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project.path())
        .assert()
        .success();

    // Sanity: no .git/hooks directory exists.
    assert!(!project.path().join(".git").exists());
    // The .watcher dir + config still landed.
    assert!(project.path().join(".watcher").join("config.toml").exists());
}
