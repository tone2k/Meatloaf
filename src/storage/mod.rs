pub mod models;

use std::path::Path;
use std::str::FromStr;
use std::sync::Mutex;

use anyhow::{Context, Result};
use rusqlite::{Connection, params};

use crate::storage::models::{
    FileEvent, FileEventType, GitEvent, GitEventType, TerminalEvent,
};

/// SQLite-backed event store.
///
/// Wraps a single connection guarded by a `Mutex` so the writer thread can
/// share it across capture sources without interleaving statements.
pub struct Storage {
    conn: Mutex<Connection>,
}

impl Storage {
    /// Open (or create) the database at `path`, run schema migrations, and
    /// enable WAL mode so a second read-only connection can inspect the file
    /// while the daemon is running.
    pub fn open(path: &Path) -> Result<Self> {
        let conn = Connection::open(path)
            .with_context(|| format!("opening sqlite database at {}", path.display()))?;

        conn.pragma_update(None, "journal_mode", "WAL")
            .context("setting journal_mode=WAL")?;
        conn.pragma_update(None, "synchronous", "NORMAL")
            .context("setting synchronous=NORMAL")?;

        let storage = Self {
            conn: Mutex::new(conn),
        };
        storage.migrate()?;
        Ok(storage)
    }

    fn migrate(&self) -> Result<()> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        conn.execute_batch(SCHEMA_SQL)
            .context("running schema migrations")?;
        Ok(())
    }

    /// Persist a single file event.
    #[allow(dead_code)] // wired into capture::fs in Slice 6
    pub fn insert_file_event(&self, event: &FileEvent) -> Result<()> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        conn.execute(
            "INSERT INTO file_events
                (timestamp, file_path, event_type, content_hash, content, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                event.timestamp,
                event.file_path,
                event.event_type.to_string(),
                event.content_hash,
                event.content,
                event.session_id,
            ],
        )
        .context("inserting file_event")?;
        Ok(())
    }

    /// Return every file event in the database, oldest first.
    #[allow(dead_code)] // exposed for tests + future query subcommands
    pub fn list_file_events(&self) -> Result<Vec<FileEvent>> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT timestamp, file_path, event_type, content_hash, content, session_id
             FROM file_events
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            let event_type_str: String = row.get(2)?;
            let content_hash: Option<String> = row.get(3)?;
            let content: Option<Vec<u8>> = row.get(4)?;
            let session_id: Option<String> = row.get(5)?;
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                event_type_str,
                content_hash,
                content,
                session_id,
            ))
        })?;

        let mut out = Vec::new();
        for row in rows {
            let (timestamp, file_path, event_type_str, content_hash, content, session_id) = row?;
            let event_type = FileEventType::from_str(&event_type_str)
                .with_context(|| format!("decoding file_event {file_path}"))?;
            out.push(FileEvent {
                timestamp,
                file_path,
                event_type,
                content_hash,
                content,
                session_id,
            });
        }
        Ok(out)
    }

    /// Persist a single git event.
    #[allow(dead_code)] // wired into capture::git in Slice 9
    pub fn insert_git_event(&self, event: &GitEvent) -> Result<()> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        let files_changed_json = serde_json::to_string(&event.files_changed)
            .context("serializing files_changed")?;
        conn.execute(
            "INSERT INTO git_events
                (timestamp, event_type, commit_hash, message, files_changed, diff_stat)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                event.timestamp,
                event.event_type.to_string(),
                event.commit_hash,
                event.message,
                files_changed_json,
                event.diff_stat,
            ],
        )
        .context("inserting git_event")?;
        Ok(())
    }

    /// Return every git event in the database, oldest first.
    #[allow(dead_code)] // exposed for tests + future query subcommands
    pub fn list_git_events(&self) -> Result<Vec<GitEvent>> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT timestamp, event_type, commit_hash, message, files_changed, diff_stat
             FROM git_events
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, Option<String>>(5)?,
            ))
        })?;

        let mut out = Vec::new();
        for row in rows {
            let (timestamp, event_type_str, commit_hash, message, files_json, diff_stat) = row?;
            let event_type = GitEventType::from_str(&event_type_str)
                .with_context(|| format!("decoding git_event {event_type_str}"))?;
            let files_changed: Vec<String> = serde_json::from_str(&files_json)
                .context("decoding files_changed json")?;
            out.push(GitEvent {
                timestamp,
                event_type,
                commit_hash,
                message,
                files_changed,
                diff_stat,
            });
        }
        Ok(out)
    }

    /// Persist a single terminal event.
    #[allow(dead_code)] // wired into capture::terminal in Slice 10
    pub fn insert_terminal_event(&self, event: &TerminalEvent) -> Result<()> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        conn.execute(
            "INSERT INTO terminal_events
                (timestamp, command, exit_code, cwd, session_id)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                event.timestamp,
                event.command,
                event.exit_code,
                event.cwd,
                event.session_id,
            ],
        )
        .context("inserting terminal_event")?;
        Ok(())
    }

    /// Return every terminal event in the database, oldest first.
    #[allow(dead_code)] // exposed for tests + future query subcommands
    pub fn list_terminal_events(&self) -> Result<Vec<TerminalEvent>> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        let mut stmt = conn.prepare(
            "SELECT timestamp, command, exit_code, cwd, session_id
             FROM terminal_events
             ORDER BY id ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(TerminalEvent {
                timestamp: row.get(0)?,
                command: row.get(1)?,
                exit_code: row.get(2)?,
                cwd: row.get(3)?,
                session_id: row.get(4)?,
            })
        })?;

        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Returns the names of every user table in the database. Used in tests.
    #[cfg(test)]
    pub fn table_names(&self) -> Result<Vec<String>> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")?;
        let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(row?);
        }
        Ok(out)
    }

    /// Returns the active SQLite journal_mode (e.g. "wal"). Used in tests.
    #[cfg(test)]
    pub fn journal_mode(&self) -> Result<String> {
        let conn = self.conn.lock().expect("storage mutex poisoned");
        let mode: String = conn.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
        Ok(mode)
    }
}

const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS file_events (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    file_path TEXT NOT NULL,
    event_type TEXT NOT NULL,
    content_hash TEXT,
    content BLOB,
    session_id TEXT
);

CREATE TABLE IF NOT EXISTS git_events (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    event_type TEXT NOT NULL,
    commit_hash TEXT,
    message TEXT,
    files_changed TEXT,
    diff_stat TEXT
);

CREATE TABLE IF NOT EXISTS terminal_events (
    id INTEGER PRIMARY KEY,
    timestamp TEXT NOT NULL,
    command TEXT NOT NULL,
    exit_code INTEGER,
    cwd TEXT,
    session_id TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT,
    files_touched TEXT,
    git_commits TEXT,
    episode_summary TEXT
);
"#;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::models::{
        FileEvent, FileEventType, GitEvent, GitEventType, TerminalEvent,
    };
    use tempfile::tempdir;

    fn fresh_storage() -> (tempfile::TempDir, Storage) {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("watcher.db");
        let storage = Storage::open(&db_path).expect("open storage");
        (dir, storage)
    }

    #[test]
    fn open_creates_schema_and_enables_wal() {
        let (_dir, storage) = fresh_storage();

        let tables = storage.table_names().expect("list tables");
        for expected in ["file_events", "git_events", "terminal_events", "sessions"] {
            assert!(
                tables.iter().any(|t| t == expected),
                "expected table {expected} in {tables:?}"
            );
        }

        assert_eq!(storage.journal_mode().unwrap().to_lowercase(), "wal");
    }

    #[test]
    fn file_event_round_trip() {
        let (_dir, storage) = fresh_storage();

        let event = FileEvent {
            timestamp: "2026-04-07T10:11:12Z".to_string(),
            file_path: "src/main.rs".to_string(),
            event_type: FileEventType::Modify,
            content_hash: Some("abc123".to_string()),
            content: Some(b"hello world".to_vec()),
            session_id: Some("session-1".to_string()),
        };

        storage.insert_file_event(&event).expect("insert");

        let stored = storage.list_file_events().expect("list");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0], event);
    }

    #[test]
    fn git_event_round_trip() {
        let (_dir, storage) = fresh_storage();

        let event = GitEvent {
            timestamp: "2026-04-07T10:12:00Z".to_string(),
            event_type: GitEventType::PostCommit,
            commit_hash: Some("deadbeef".to_string()),
            message: Some("first commit".to_string()),
            files_changed: vec!["src/main.rs".to_string(), "Cargo.toml".to_string()],
            diff_stat: Some("2 files changed".to_string()),
        };

        storage.insert_git_event(&event).expect("insert");

        let stored = storage.list_git_events().expect("list");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0], event);
    }

    #[test]
    fn terminal_event_round_trip() {
        let (_dir, storage) = fresh_storage();

        let event = TerminalEvent {
            timestamp: "2026-04-07T10:13:00Z".to_string(),
            command: "cargo test".to_string(),
            exit_code: Some(0),
            cwd: Some("/home/user/Meatloaf".to_string()),
            session_id: Some("session-1".to_string()),
        };

        storage.insert_terminal_event(&event).expect("insert");

        let stored = storage.list_terminal_events().expect("list");
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0], event);
    }
}
