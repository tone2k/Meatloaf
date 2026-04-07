// These types are exercised by storage::tests today and consumed by the
// capture/daemon code in later slices. Allow until that wiring lands.
#![allow(dead_code)]

use std::fmt;
use std::str::FromStr;

use anyhow::{Result, bail};

/// A captured filesystem event ready to be persisted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileEvent {
    /// RFC3339 UTC timestamp.
    pub timestamp: String,
    /// Path of the file relative to the project root.
    pub file_path: String,
    /// What kind of change occurred.
    pub event_type: FileEventType,
    /// blake3 hex digest of the file contents (None for deletes).
    pub content_hash: Option<String>,
    /// zstd-compressed text content, or None for binary / deleted / oversized files.
    pub content: Option<Vec<u8>>,
    /// Session this event belongs to (set by the writer thread).
    pub session_id: Option<String>,
}

/// The kind of filesystem mutation captured by [`FileEvent`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileEventType {
    Create,
    Modify,
    Delete,
}

impl fmt::Display for FileEventType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Create => "create",
            Self::Modify => "modify",
            Self::Delete => "delete",
        })
    }
}

impl FromStr for FileEventType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        Ok(match s {
            "create" => Self::Create,
            "modify" => Self::Modify,
            "delete" => Self::Delete,
            other => bail!("unknown file event type: {other}"),
        })
    }
}

/// A captured git event, sourced from a hook.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GitEvent {
    pub timestamp: String,
    pub event_type: GitEventType,
    pub commit_hash: Option<String>,
    pub message: Option<String>,
    pub files_changed: Vec<String>,
    pub diff_stat: Option<String>,
}

// Variant names mirror the git hook names exactly so the round-trip
// strings stay obvious to operators reading the database.
#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GitEventType {
    PostCommit,
    PostCheckout,
    PostMerge,
}

impl fmt::Display for GitEventType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::PostCommit => "post-commit",
            Self::PostCheckout => "post-checkout",
            Self::PostMerge => "post-merge",
        })
    }
}

impl FromStr for GitEventType {
    type Err = anyhow::Error;

    fn from_str(s: &str) -> Result<Self> {
        Ok(match s {
            "post-commit" => Self::PostCommit,
            "post-checkout" => Self::PostCheckout,
            "post-merge" => Self::PostMerge,
            other => bail!("unknown git event type: {other}"),
        })
    }
}

/// A row in the `sessions` table representing a daemon run.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SessionRow {
    pub id: String,
    pub start_time: String,
    pub end_time: Option<String>,
    pub files_touched: Vec<String>,
    pub git_commits: Vec<String>,
    pub episode_summary: Option<String>,
}

/// A captured terminal command invocation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TerminalEvent {
    pub timestamp: String,
    pub command: String,
    pub exit_code: Option<i64>,
    pub cwd: Option<String>,
    pub session_id: Option<String>,
}
