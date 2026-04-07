use assert_cmd::Command;
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
