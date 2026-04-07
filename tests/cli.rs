use assert_cmd::Command;
use predicates::str::contains;

#[test]
fn help_lists_init_start_stop_subcommands() {
    let mut cmd = Command::cargo_bin("watcher").expect("watcher binary built");
    cmd.arg("--help")
        .assert()
        .success()
        .stdout(contains("init"))
        .stdout(contains("start"))
        .stdout(contains("stop"));
}
