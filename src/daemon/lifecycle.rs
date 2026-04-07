//! `watcher start` / `watcher stop` glue.
//!
//! `start` re-spawns the current binary as a hidden `__run-daemon` child,
//! detaches stdio, and exits. `stop` reads the pid file, sends SIGTERM, and
//! waits for the child to remove the pid file (signaling clean shutdown).

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use anyhow::{Context, Result, anyhow, bail};

use crate::daemon::init::WATCHER_DIR;

const PID_FILE: &str = "watcher.pid";

/// Start a backgrounded daemon for `project_root`. Returns immediately once
/// the child process has been spawned.
pub fn start(project_root: &Path, pid_file_override: Option<PathBuf>) -> Result<()> {
    let pid_file = pid_file_override
        .unwrap_or_else(|| project_root.join(WATCHER_DIR).join(PID_FILE));

    // If the pid file already exists, check whether the recorded process is
    // still alive. A stale pid file (process gone) is recoverable; we delete
    // it and proceed.
    if pid_file.exists() {
        match read_pid(&pid_file) {
            Ok(pid) if process_alive(pid) => {
                bail!(
                    "watcher daemon already running (pid {pid}); run `watcher stop` first"
                );
            }
            _ => {
                std::fs::remove_file(&pid_file).ok();
            }
        }
    }

    let exe = std::env::current_exe().context("locating current executable")?;
    Command::new(exe)
        .arg("__run-daemon")
        .arg("--project-root")
        .arg(project_root)
        .arg("--pid-file")
        .arg(&pid_file)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .context("spawning watcher daemon child")?;
    Ok(())
}

/// Stop the running daemon for `project_root`. Sends SIGTERM and waits up to
/// 5 seconds for the daemon to clean up its pid file.
pub fn stop(project_root: &Path) -> Result<()> {
    let pid_file = project_root.join(WATCHER_DIR).join(PID_FILE);
    if !pid_file.exists() {
        return Err(anyhow!(
            "no pid file at {}; is the daemon running?",
            pid_file.display()
        ));
    }
    let pid = read_pid(&pid_file)?;

    // SAFETY: libc::kill is FFI; we pass a verified pid.
    let rc = unsafe { libc::kill(pid, libc::SIGTERM) };
    if rc != 0 {
        let err = std::io::Error::last_os_error();
        return Err(err).with_context(|| format!("sending SIGTERM to pid {pid}"));
    }

    // Wait for the daemon to drain + remove the pid file.
    let deadline = Instant::now() + Duration::from_secs(5);
    while Instant::now() < deadline {
        if !pid_file.exists() {
            return Ok(());
        }
        std::thread::sleep(Duration::from_millis(50));
    }

    // The daemon didn't clean up in time. Best-effort remove the file so the
    // user can re-start, but report the situation.
    std::fs::remove_file(&pid_file).ok();
    Err(anyhow!(
        "watcher daemon did not exit within 5s; pid file forcibly removed"
    ))
}

fn read_pid(path: &Path) -> Result<i32> {
    let raw = std::fs::read_to_string(path)
        .with_context(|| format!("reading {}", path.display()))?;
    raw.trim()
        .parse::<i32>()
        .with_context(|| format!("parsing pid from {}", path.display()))
}

fn process_alive(pid: i32) -> bool {
    // SAFETY: libc::kill with signal 0 only checks for the process existence.
    unsafe { libc::kill(pid, 0) == 0 }
}
