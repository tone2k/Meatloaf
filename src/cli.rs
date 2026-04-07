use std::env;
use std::path::PathBuf;
use std::str::FromStr;

use clap::{Args, Parser, Subcommand};
use crossbeam_channel::unbounded;

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
    Start(StartArgs),
    /// Stop the running capture daemon
    Stop,
    /// Record a git hook event (invoked by the installed hooks).
    #[command(hide = true)]
    RecordGit(RecordGitArgs),
    /// Record a terminal command event (invoked by the shell hook snippet).
    #[command(hide = true)]
    RecordTerminal(RecordTerminalArgs),
    /// Internal: run the capture loop in the foreground (the child of `start`).
    #[command(hide = true, name = "__run-daemon")]
    RunDaemon(RunDaemonArgs),
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
pub struct StartArgs {
    /// Override the pid file location (defaults to .watcher/watcher.pid).
    #[arg(long)]
    pub pid_file: Option<PathBuf>,
}

#[derive(Debug, Args)]
pub struct RunDaemonArgs {
    /// Project root the daemon should watch.
    #[arg(long)]
    pub project_root: PathBuf,
    /// Path to the pid file.
    #[arg(long)]
    pub pid_file: PathBuf,
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
        Commands::Start(args) => {
            let cwd = env::current_dir()?;
            daemon::lifecycle::start(&cwd, args.pid_file)
        }
        Commands::Stop => {
            let cwd = env::current_dir()?;
            daemon::lifecycle::stop(&cwd)
        }
        Commands::RecordGit(args) => {
            let cwd = env::current_dir()?;
            let hook = GitEventType::from_str(&args.hook)?;
            git::record(&cwd, hook)
        }
        Commands::RecordTerminal(args) => {
            let cwd = env::current_dir()?;
            terminal::record(&cwd, args.command, args.exit_code, args.cwd)
        }
        Commands::RunDaemon(args) => {
            // The child of `start`. Set up signal handling and call run().
            let (shutdown_tx, shutdown_rx) = unbounded::<()>();
            let tx_for_signal = shutdown_tx.clone();
            ctrlc_compat::on_term(move || {
                let _ = tx_for_signal.send(());
            })?;
            let cfg = daemon::RunConfig {
                project_root: args.project_root,
                pid_file: args.pid_file,
                foreground: false,
                shutdown_rx,
            };
            daemon::run(cfg)
        }
    }
}

/// Tiny wrapper around libc signal handling so the cli module doesn't have
/// to depend on a separate ctrlc crate. Installs a SIGTERM handler that
/// invokes `f` exactly once.
mod ctrlc_compat {
    use std::sync::OnceLock;

    type Handler = Box<dyn Fn() + Send + Sync + 'static>;
    static HANDLER: OnceLock<Handler> = OnceLock::new();

    extern "C" fn trampoline(_signum: libc::c_int) {
        if let Some(h) = HANDLER.get() {
            h();
        }
    }

    pub fn on_term<F: Fn() + Send + Sync + 'static>(f: F) -> anyhow::Result<()> {
        if HANDLER.set(Box::new(f)).is_err() {
            // Handler already installed; that's fine for our use case.
            return Ok(());
        }
        unsafe {
            let mut sa: libc::sigaction = std::mem::zeroed();
            sa.sa_sigaction = trampoline as *const () as usize;
            libc::sigemptyset(&mut sa.sa_mask);
            sa.sa_flags = 0;
            for sig in [libc::SIGTERM, libc::SIGINT] {
                if libc::sigaction(sig, &sa, std::ptr::null_mut()) != 0 {
                    return Err(std::io::Error::last_os_error().into());
                }
            }
        }
        Ok(())
    }
}
