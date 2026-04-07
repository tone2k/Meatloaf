use serde::{Deserialize, Serialize};

/// Per-project configuration persisted at `.watcher/config.toml`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Config {
    /// Idle timeout in seconds before a session is considered closed.
    pub idle_timeout_secs: u64,
    /// Additional glob patterns to ignore on top of `.gitignore`/`.watcherignore`.
    #[serde(default)]
    pub ignore_patterns: Vec<String>,
    /// Whether to attempt embedding episodes via Ollama.
    pub embedding_enabled: bool,
    /// Base URL for the local Ollama server (used when embeddings are enabled).
    pub ollama_url: String,
}

impl Default for Config {
    fn default() -> Self {
        Self {
            idle_timeout_secs: 300,
            ignore_patterns: Vec::new(),
            embedding_enabled: false,
            ollama_url: "http://localhost:11434".to_string(),
        }
    }
}
