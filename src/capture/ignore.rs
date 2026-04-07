// Wired into capture::fs::handle_event in this slice; the public API is
// exercised by tests today and consumed by the daemon writer in Slice 11a.
#![allow(dead_code)]

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use ignore::gitignore::{Gitignore, GitignoreBuilder};

/// Filename of the project-local supplemental ignore file.
pub const WATCHERIGNORE_FILE: &str = ".watcherignore";
pub const GITIGNORE_FILE: &str = ".gitignore";

/// Snapshot-based ignore matcher that combines `.gitignore` + `.watcherignore`
/// at the project root. The underlying [`Gitignore`] is a snapshot — call
/// [`IgnoreMatcher::reload`] when either source file changes on disk.
pub struct IgnoreMatcher {
    project_root: PathBuf,
    matcher: Gitignore,
}

impl IgnoreMatcher {
    /// Build a fresh matcher rooted at `project_root`. Missing source files
    /// are treated as empty (no patterns).
    pub fn new(project_root: &Path) -> Result<Self> {
        let matcher = build_matcher(project_root)?;
        Ok(Self {
            project_root: project_root.to_path_buf(),
            matcher,
        })
    }

    /// Return `true` if `path` (relative or absolute) should be ignored.
    pub fn is_ignored(&self, path: &Path) -> bool {
        let absolute = if path.is_absolute() {
            path.to_path_buf()
        } else {
            self.project_root.join(path)
        };
        // `matched_path_or_any_parents` flags directories matched by parent
        // patterns too, which matches gitignore semantics.
        self.matcher
            .matched_path_or_any_parents(&absolute, false)
            .is_ignore()
    }

    /// Return `true` if `path` is one of the source files that, when changed,
    /// should trigger a [`reload`].
    pub fn is_source_file(&self, path: &Path) -> bool {
        let name = path.file_name().and_then(|n| n.to_str());
        matches!(name, Some(GITIGNORE_FILE) | Some(WATCHERIGNORE_FILE))
    }

    /// Rebuild the matcher from the current state of `.gitignore` and
    /// `.watcherignore` on disk.
    pub fn reload(&mut self) -> Result<()> {
        self.matcher = build_matcher(&self.project_root)?;
        Ok(())
    }
}

fn build_matcher(project_root: &Path) -> Result<Gitignore> {
    let mut builder = GitignoreBuilder::new(project_root);
    for source in [GITIGNORE_FILE, WATCHERIGNORE_FILE] {
        let path = project_root.join(source);
        if path.exists()
            && let Some(err) = builder.add(&path)
        {
            return Err(anyhow::Error::new(err))
                .with_context(|| format!("loading ignore file {}", path.display()));
        }
    }
    builder.build().context("building gitignore matcher")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn matcher_respects_gitignore_and_reloads_on_edit() {
        let project = tempdir().unwrap();
        let root = project.path().to_path_buf();
        std::fs::write(root.join(".gitignore"), "ignored.txt\n").unwrap();

        let mut matcher = IgnoreMatcher::new(&root).expect("build matcher");
        assert!(matcher.is_ignored(&PathBuf::from("ignored.txt")));
        assert!(!matcher.is_ignored(&PathBuf::from("kept.txt")));

        // Edit the .gitignore in place to also ignore kept.txt; without
        // reload() the in-memory matcher must still report the old answer,
        // proving that the snapshot is real and reload is required.
        std::fs::write(root.join(".gitignore"), "ignored.txt\nkept.txt\n").unwrap();
        assert!(
            !matcher.is_ignored(&PathBuf::from("kept.txt")),
            "matcher should be a snapshot until reload"
        );

        matcher.reload().expect("reload");
        assert!(matcher.is_ignored(&PathBuf::from("kept.txt")));
    }
}
