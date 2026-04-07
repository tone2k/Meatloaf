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
