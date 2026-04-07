use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result, anyhow};

use crate::daemon::config::Config;
use crate::storage::Storage;

/// Path of the per-project state directory relative to the project root.
pub const WATCHER_DIR: &str = ".watcher";
/// Filename of the persisted config inside `WATCHER_DIR`.
pub const CONFIG_FILE: &str = "config.toml";
/// Filename of the SQLite database inside `WATCHER_DIR`.
pub const DB_FILE: &str = "watcher.db";

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

    // Touch the database so the schema is in place before the daemon starts.
    let db_path = watcher_dir.join(DB_FILE);
    let _ = Storage::open(&db_path)?;

    Ok(())
}

fn write_default_config(watcher_dir: &Path) -> Result<PathBuf> {
    let config_path = watcher_dir.join(CONFIG_FILE);
    let serialized =
        toml::to_string_pretty(&Config::default()).context("serializing default config")?;
    fs::write(&config_path, serialized)
        .with_context(|| format!("writing {}", config_path.display()))?;
    Ok(config_path)
}
