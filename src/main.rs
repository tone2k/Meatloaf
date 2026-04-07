use clap::Parser;

use watcher::cli;

fn main() -> anyhow::Result<()> {
    let cli = cli::Cli::parse();
    cli::run(cli)
}
