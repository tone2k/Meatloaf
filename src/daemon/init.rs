use std::fs;
use std::path::{Path, PathBuf};

use anyhow::{Context, Result};

use crate::daemon::config::Config;

/// Path of the per-project state directory relative to the project root.
pub const WATCHER_DIR: &str = ".watcher";
/// Filename of the persisted config inside `WATCHER_DIR`.
pub const CONFIG_FILE: &str = "config.toml";

/// Scaffold a fresh `.watcher/` directory inside `project_root`.
///
/// Currently writes the default config; later slices add the SQLite database
/// and git hook installation.
pub fn run(project_root: &Path) -> Result<()> {
    let watcher_dir = project_root.join(WATCHER_DIR);
    fs::create_dir_all(&watcher_dir)
        .with_context(|| format!("creating {}", watcher_dir.display()))?;

    write_default_config(&watcher_dir)?;
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
