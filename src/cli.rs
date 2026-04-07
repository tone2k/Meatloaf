use std::env;

use clap::{Parser, Subcommand};

use crate::daemon;

#[derive(Debug, Parser)]
#[command(name = "watcher", version, about = "Local-first project memory daemon")]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Scaffold a new .watcher/ directory in the current project
    Init,
    /// Start the capture daemon in the background
    Start,
    /// Stop the running capture daemon
    Stop,
}

pub fn run(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Commands::Init => {
            let cwd = env::current_dir()?;
            daemon::init::run(&cwd)
        }
        Commands::Start => Ok(()),
        Commands::Stop => Ok(()),
    }
}
