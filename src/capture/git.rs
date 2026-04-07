// Wired into the cli `record-git` subcommand; consumed indirectly by tests
// today and by the post-commit hooks installed in Slice 9b.
#![allow(dead_code)]

use std::path::Path;
use std::process::Command;

use anyhow::{Context, Result, bail};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::storage::Storage;
use crate::storage::models::{GitEvent, GitEventType};

/// Read the metadata for the current commit and append a `git_events` row.
///
/// `project_root` is expected to be the project root that contains both the
/// `.git` directory and the `.watcher/watcher.db` we should write into.
pub fn record(project_root: &Path, hook: GitEventType) -> Result<()> {
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .context("formatting record-git timestamp")?;

    let commit_hash = git_output(project_root, &["rev-parse", "HEAD"])?;
    let message = git_output(project_root, &["log", "-1", "--pretty=%B"])?;
    // `git show --name-only` reports files for both root and merge commits;
    // `diff-tree` requires --root for the initial commit.
    let files_raw = git_output(
        project_root,
        &["show", "--name-only", "--pretty=format:", "HEAD"],
    )?;
    let diff_stat = git_output(
        project_root,
        &["show", "--stat", "--pretty=format:", "HEAD"],
    )
    .ok()
    .filter(|s| !s.is_empty());

    let files_changed: Vec<String> = files_raw
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| l.to_string())
        .collect();

    let event = GitEvent {
        timestamp,
        event_type: hook,
        commit_hash: Some(commit_hash),
        // Trim the trailing newline `git log` always emits.
        message: Some(message.trim_end().to_string()),
        files_changed,
        diff_stat,
    };

    let db_path = project_root
        .join(crate::daemon::init::WATCHER_DIR)
        .join(crate::daemon::init::DB_FILE);
    let storage = Storage::open(&db_path)
        .with_context(|| format!("opening {}", db_path.display()))?;
    storage.insert_git_event(&event)?;
    Ok(())
}

fn git_output(project_root: &Path, args: &[&str]) -> Result<String> {
    let output = Command::new("git")
        .args(args)
        .current_dir(project_root)
        .output()
        .with_context(|| format!("spawning git {args:?}"))?;
    if !output.status.success() {
        bail!(
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }
    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
