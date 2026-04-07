use std::env;

use clap::{Args, Parser, Subcommand};

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
    Init(InitArgs),
    /// Start the capture daemon in the background
    Start,
    /// Stop the running capture daemon
    Stop,
}

#[derive(Debug, Args)]
pub struct InitArgs {
    /// Re-write `.watcher/config.toml` even if `.watcher/` already exists.
    #[arg(long)]
    pub force: bool,
}

pub fn run(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Commands::Init(args) => {
            let cwd = env::current_dir()?;
            daemon::init::run(&cwd, args.force)
        }
        Commands::Start => Ok(()),
        Commands::Stop => Ok(()),
    }
}
