use assert_cmd::Command;
use predicates::str::contains;
use tempfile::tempdir;

#[test]
fn init_creates_watcher_dir_with_default_config() {
    let project = tempdir().expect("tempdir");

    Command::cargo_bin("watcher")
        .expect("watcher binary")
        .arg("init")
        .current_dir(project.path())
        .assert()
        .success();

    let config_path = project.path().join(".watcher").join("config.toml");
    assert!(
        config_path.exists(),
        "expected {} to exist after init",
        config_path.display()
    );

    let raw = std::fs::read_to_string(&config_path).expect("read config.toml");

    // Spot-check a few defaults; structural parse coverage lives in unit tests.
    assert!(
        raw.contains("idle_timeout_secs = 300"),
        "config should set idle_timeout_secs to 300:\n{raw}"
    );
    assert!(
        raw.contains("embedding_enabled = false"),
        "config should default embedding_enabled to false:\n{raw}"
    );
    assert!(
        raw.contains("ollama_url = \"http://localhost:11434\""),
        "config should default ollama_url:\n{raw}"
    );
}

#[test]
fn init_refuses_to_overwrite_without_force() {
    let project = tempdir().expect("tempdir");

    // First init succeeds.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project.path())
        .assert()
        .success();

    // User edits the config to a known marker so we can prove it was preserved.
    let config_path = project.path().join(".watcher").join("config.toml");
    let original = std::fs::read_to_string(&config_path).unwrap();
    let marked = format!("{original}\n# user edit marker\n");
    std::fs::write(&config_path, &marked).unwrap();

    // Second init without --force must fail and must not touch the file.
    Command::cargo_bin("watcher")
        .unwrap()
        .arg("init")
        .current_dir(project.path())
        .assert()
        .failure()
        .stderr(contains("already initialized"));

    let after = std::fs::read_to_string(&config_path).unwrap();
    assert_eq!(after, marked, "config.toml must be untouched on refused init");

    // Third init with --force succeeds and rewrites the config (marker gone).
    Command::cargo_bin("watcher")
        .unwrap()
        .args(["init", "--force"])
        .current_dir(project.path())
        .assert()
        .success();

    let forced = std::fs::read_to_string(&config_path).unwrap();
    assert!(
        !forced.contains("user edit marker"),
        "--force should rewrite config.toml back to defaults:\n{forced}"
    );
}
