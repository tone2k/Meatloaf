// Wired into the cli `record-terminal` subcommand; consumed indirectly by
// integration tests today and by the shell hook snippet that init writes.
#![allow(dead_code)]

use std::path::Path;

use anyhow::{Context, Result};
use time::OffsetDateTime;
use time::format_description::well_known::Rfc3339;

use crate::storage::Storage;
use crate::storage::models::TerminalEvent;

/// Record a single terminal command into `.watcher/watcher.db`.
pub fn record(
    project_root: &Path,
    command: String,
    exit_code: Option<i64>,
    cwd: Option<String>,
) -> Result<()> {
    let timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .context("formatting record-terminal timestamp")?;

    // Session id stays None for terminal-recorded events for now: the daemon
    // can re-stitch them by timestamp during episode segmentation (M2). When
    // the daemon is running we could read its session id from a side file,
    // but the recording subcommand has to keep working even when the daemon
    // is offline.
    let event = TerminalEvent {
        timestamp,
        command,
        exit_code,
        cwd,
        session_id: None,
    };

    let db_path = project_root
        .join(crate::daemon::init::WATCHER_DIR)
        .join(crate::daemon::init::DB_FILE);
    let storage = Storage::open(&db_path)
        .with_context(|| format!("opening {}", db_path.display()))?;
    storage.insert_terminal_event(&event)?;
    Ok(())
}

/// Snippet sourced from the user's shell rc file. Defines a function
/// `__watcher_record_last` that bash/zsh's PROMPT_COMMAND / precmd can call
/// after every command. Init writes this to `.watcher/shell-hook.sh` and
/// prints instructions for the user to source it.
pub const SHELL_HOOK_SNIPPET: &str = r#"# watcher shell hook
# Source this from your ~/.bashrc or ~/.zshrc:
#   source $PROJECT/.watcher/shell-hook.sh
#
# Records every command run inside this shell into the project's
# watcher database. Safe to source multiple times.

__watcher_record_last() {
    local exit=$?
    local cmd
    if [ -n "${BASH_VERSION:-}" ]; then
        cmd=$(history 1 | sed 's/^[ ]*[0-9]*[ ]*//')
    elif [ -n "${ZSH_VERSION:-}" ]; then
        cmd=$(fc -ln -1 2>/dev/null || true)
    fi
    [ -z "$cmd" ] && return $exit
    watcher record-terminal --command "$cmd" --exit-code "$exit" --cwd "$PWD" >/dev/null 2>&1 || true
    return $exit
}

if [ -n "${BASH_VERSION:-}" ]; then
    case ":${PROMPT_COMMAND:-}:" in
        *":__watcher_record_last:"*) ;;
        *) PROMPT_COMMAND="__watcher_record_last${PROMPT_COMMAND:+;$PROMPT_COMMAND}" ;;
    esac
elif [ -n "${ZSH_VERSION:-}" ]; then
    autoload -Uz add-zsh-hook
    add-zsh-hook precmd __watcher_record_last
fi
"#;

/// Filename of the shell hook snippet inside `.watcher/`.
pub const SHELL_HOOK_FILE: &str = "shell-hook.sh";
