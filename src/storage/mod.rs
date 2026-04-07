use std::path::Path;
use std::sync::Mutex;

use anyhow::{Context, Result};
use rusqlite::Connection;

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
    use tempfile::tempdir;

    #[test]
    fn open_creates_schema_and_enables_wal() {
        let dir = tempdir().unwrap();
        let db_path = dir.path().join("watcher.db");

        let storage = Storage::open(&db_path).expect("open storage");

        let tables = storage.table_names().expect("list tables");
        for expected in ["file_events", "git_events", "terminal_events", "sessions"] {
            assert!(
                tables.iter().any(|t| t == expected),
                "expected table {expected} in {tables:?}"
            );
        }

        assert_eq!(storage.journal_mode().unwrap().to_lowercase(), "wal");
    }
}
