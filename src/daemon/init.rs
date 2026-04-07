use std::fs;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};

use crate::capture::terminal::{SHELL_HOOK_FILE, SHELL_HOOK_SNIPPET};
use crate::daemon::config::Config;
use crate::storage::Storage;

/// Path of the per-project state directory relative to the project root.
pub const WATCHER_DIR: &str = ".watcher";
/// Filename of the persisted config inside `WATCHER_DIR`.
pub const CONFIG_FILE: &str = "config.toml";
/// Filename of the SQLite database inside `WATCHER_DIR`.
pub const DB_FILE: &str = "watcher.db";

/// Marker that delimits the watcher-managed block inside any user-owned
/// hook script. Used to identify and replace the block on re-init.
const HOOK_BLOCK_BEGIN: &str = "# >>> watcher >>>";
const HOOK_BLOCK_END: &str = "# <<< watcher <<<";

/// Hooks that record git events for the daemon. Pairs (hook filename, event name).
const TRACKED_HOOKS: &[(&str, &str)] = &[
    ("post-commit", "post-commit"),
    ("post-checkout", "post-checkout"),
    ("post-merge", "post-merge"),
];

/// Scaffold a fresh `.watcher/` directory inside `project_root`.
///
/// If `force` is false and the directory already exists, returns an error
/// without touching any existing files. With `force = true` the config is
/// rewritten back to defaults; the database is left alone if it already
/// exists, otherwise a fresh schema is initialized.
pub fn run(project_root: &Path, force: bool) -> Result<()> {
    let watcher_dir = project_root.join(WATCHER_DIR);

    if watcher_dir.exists() && !force {
        return Err(anyhow!(
            "{} already initialized; pass --force to overwrite the config",
            watcher_dir.display()
        ));
    }

    fs::create_dir_all(&watcher_dir)
        .with_context(|| format!("creating {}", watcher_dir.display()))?;

    write_default_config(&watcher_dir)?;
    write_shell_hook(&watcher_dir)?;

    // Touch the database so the schema is in place before the daemon starts.
    let db_path = watcher_dir.join(DB_FILE);
    let _ = Storage::open(&db_path)?;

    // Best-effort: install git hooks when this is a git repo.
    install_git_hooks(project_root)?;

    Ok(())
}

fn write_shell_hook(watcher_dir: &Path) -> Result<()> {
    let path = watcher_dir.join(SHELL_HOOK_FILE);
    fs::write(&path, SHELL_HOOK_SNIPPET)
        .with_context(|| format!("writing {}", path.display()))?;
    Ok(())
}

/// Install (or refresh) the post-commit / post-checkout / post-merge hooks
/// inside `<project_root>/.git/hooks`. If `<project_root>` is not a git
/// repository the install is a no-op.
fn install_git_hooks(project_root: &Path) -> Result<()> {
    let hooks_dir = project_root.join(".git").join("hooks");
    if !hooks_dir.exists() {
        // Not a git repo (or git was never run); leave a trace in the log
        // and proceed. Tested by init_outside_git_repo_succeeds_without_hooks.
        return Ok(());
    }

    for (filename, hook_name) in TRACKED_HOOKS {
        let hook_path = hooks_dir.join(filename);
        install_hook_file(&hook_path, hook_name)?;
    }
    Ok(())
}

fn install_hook_file(hook_path: &Path, hook_name: &str) -> Result<()> {
    let block = build_hook_block(hook_name);

    let new_contents = match fs::read_to_string(hook_path) {
        Ok(existing) => merge_hook_block(&existing, &block),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            format!("#!/bin/sh\n{block}\n")
        }
        Err(err) => {
            return Err(err)
                .with_context(|| format!("reading existing hook {}", hook_path.display()));
        }
    };

    fs::write(hook_path, new_contents)
        .with_context(|| format!("writing hook {}", hook_path.display()))?;
    let mut perms = fs::metadata(hook_path)
        .with_context(|| format!("stat {}", hook_path.display()))?
        .permissions();
    perms.set_mode(0o755);
    fs::set_permissions(hook_path, perms)
        .with_context(|| format!("chmod {}", hook_path.display()))?;
    Ok(())
}

/// Generate the watcher-managed block for a given hook. The trailing
/// `|| true` ensures a recording failure never breaks the user's commit.
///
/// The block invokes the absolute path to the `watcher` binary that ran
/// `init` so the hook keeps working even when `watcher` is not on `PATH`
/// inside whatever shell git happens to invoke the hook from.
fn build_hook_block(hook_name: &str) -> String {
    let exe = std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(str::to_string))
        .unwrap_or_else(|| "watcher".to_string());
    format!(
        "{begin}\n{exe:?} record-git {hook_name} || true\n{end}",
        begin = HOOK_BLOCK_BEGIN,
        end = HOOK_BLOCK_END,
    )
}

/// Insert or replace the watcher block inside `existing`, leaving any other
/// user content untouched. The block is appended on first install.
fn merge_hook_block(existing: &str, block: &str) -> String {
    if let (Some(start), Some(end_idx)) =
        (existing.find(HOOK_BLOCK_BEGIN), existing.find(HOOK_BLOCK_END))
    {
        // Replace existing watcher block in place.
        let end = end_idx + HOOK_BLOCK_END.len();
        let mut out = String::with_capacity(existing.len());
        out.push_str(&existing[..start]);
        out.push_str(block);
        out.push_str(&existing[end..]);
        return out;
    }

    // Append a fresh block at the end, with a separating newline.
    let mut out = existing.to_string();
    if !out.ends_with('\n') {
        out.push('\n');
    }
    out.push_str(block);
    out.push('\n');
    out
}

fn write_default_config(watcher_dir: &Path) -> Result<PathBuf> {
    let config_path = watcher_dir.join(CONFIG_FILE);
    let serialized =
        toml::to_string_pretty(&Config::default()).context("serializing default config")?;
    fs::write(&config_path, serialized)
        .with_context(|| format!("writing {}", config_path.display()))?;
    Ok(config_path)
}
