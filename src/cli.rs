use std::env;
use std::str::FromStr;

use clap::{Args, Parser, Subcommand};

use crate::capture::{git, terminal};
use crate::daemon;
use crate::storage::models::GitEventType;

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
    /// Record a git hook event (invoked by the installed hooks).
    #[command(hide = true)]
    RecordGit(RecordGitArgs),
    /// Record a terminal command event (invoked by the shell hook snippet).
    #[command(hide = true)]
    RecordTerminal(RecordTerminalArgs),
}

#[derive(Debug, Args)]
pub struct InitArgs {
    /// Re-write `.watcher/config.toml` even if `.watcher/` already exists.
    #[arg(long)]
    pub force: bool,
}

#[derive(Debug, Args)]
pub struct RecordGitArgs {
    /// Which git hook is calling us (post-commit / post-checkout / post-merge).
    pub hook: String,
}

#[derive(Debug, Args)]
pub struct RecordTerminalArgs {
    /// The command line that just ran.
    #[arg(long)]
    pub command: String,
    /// Exit code of the command.
    #[arg(long)]
    pub exit_code: Option<i64>,
    /// Working directory at the time of the command.
    #[arg(long)]
    pub cwd: Option<String>,
}

pub fn run(cli: Cli) -> anyhow::Result<()> {
    match cli.command {
        Commands::Init(args) => {
            let cwd = env::current_dir()?;
            daemon::init::run(&cwd, args.force)
        }
        Commands::Start => Ok(()),
        Commands::Stop => Ok(()),
        Commands::RecordGit(args) => {
            let cwd = env::current_dir()?;
            let hook = GitEventType::from_str(&args.hook)?;
            git::record(&cwd, hook)
        }
        Commands::RecordTerminal(args) => {
            let cwd = env::current_dir()?;
            terminal::record(&cwd, args.command, args.exit_code, args.cwd)
        }
    }
}
