mod capture;
mod cli;
mod daemon;
mod storage;

use clap::Parser;

fn main() -> anyhow::Result<()> {
    let cli = cli::Cli::parse();
    cli::run(cli)
}
