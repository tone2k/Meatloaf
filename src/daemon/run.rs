use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Context, Result};
use crossbeam_channel::Receiver;

use crate::capture::fs::spawn as spawn_fs_capture;
use crate::daemon::init::{DB_FILE, WATCHER_DIR};
use crate::storage::Storage;

/// Configuration for a single daemon run. Built by `cli::Commands::Start` for
/// real launches and by tests for in-process verification.
#[derive(Debug, Clone)]
pub struct RunConfig {
    /// Project root that the daemon will watch (and where `.watcher/` lives).
    pub project_root: PathBuf,
    /// Path of the pid file. Allows tests to override the default
    /// `<project>/.watcher/watcher.pid` so parallel runs don't collide.
    pub pid_file: PathBuf,
    /// When true, log to stderr instead of `.watcher/watcher.log` and skip
    /// the self-respawn dance.
    pub foreground: bool,
    /// Channel that, when received from, triggers a clean shutdown.
    pub shutdown_rx: Receiver<()>,
}

impl RunConfig {
    /// Default configuration: pid file inside `.watcher/`, foreground off.
    pub fn for_project(project_root: PathBuf, shutdown_rx: Receiver<()>) -> Self {
        let pid_file = project_root.join(WATCHER_DIR).join("watcher.pid");
        Self {
            project_root,
            pid_file,
            foreground: false,
            shutdown_rx,
        }
    }
}

/// Run the capture daemon until `shutdown_rx` fires. On clean exit the writer
/// thread drains its in-flight channel, the session row's `end_time` is
/// stamped, and the pid file is removed.
pub fn run(cfg: RunConfig) -> Result<()> {
    let RunConfig {
        project_root,
        pid_file,
        foreground: _foreground,
        shutdown_rx,
    } = cfg;

    let db_path = project_root.join(WATCHER_DIR).join(DB_FILE);
    let storage = Arc::new(
        Storage::open(&db_path)
            .with_context(|| format!("opening {}", db_path.display()))?,
    );

    let session_id = storage.open_session().context("opening session")?;
    write_pid_file(&pid_file)?;

    tracing::info!(
        session_id = %session_id,
        project = %project_root.display(),
        "watcher daemon started"
    );

    let capture_handle = spawn_fs_capture(
        project_root.clone(),
        storage.clone(),
        session_id.clone(),
        shutdown_rx,
    )
    .context("spawning fs capture")?;

    // Block on the writer thread; it returns after draining the channel on
    // shutdown_rx receipt (see capture::fs::writer_loop).
    if let Err(panic) = capture_handle.join() {
        tracing::error!(?panic, "capture writer thread panicked");
    }

    if let Err(err) = storage.close_session(&session_id) {
        tracing::warn!(error = %err, "failed to close session");
    }

    remove_pid_file(&pid_file);
    tracing::info!(session_id = %session_id, "watcher daemon stopped");
    Ok(())
}

fn write_pid_file(pid_file: &Path) -> Result<()> {
    if let Some(parent) = pid_file.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    let pid = std::process::id().to_string();
    fs::write(pid_file, pid)
        .with_context(|| format!("writing pid file {}", pid_file.display()))?;
    Ok(())
}

fn remove_pid_file(pid_file: &Path) {
    if let Err(err) = fs::remove_file(pid_file)
        && err.kind() != std::io::ErrorKind::NotFound
    {
        tracing::warn!(
            error = %err,
            path = %pid_file.display(),
            "failed to remove pid file"
        );
    }
}
