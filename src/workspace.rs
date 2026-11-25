//! The workspace around the current folder: its root and the folders of the members read (`cargo metadata`), their
//! Rust files

use crate::Config;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

/// A workspace as read: its root, the folders of the members read
pub struct Workspace {
    /// Its root folder
    pub root: PathBuf,
    /// The members read, their folders
    pub members: Vec<PathBuf>,
}

/// The workspace's root and the folders of its members read: the configuration's, else all of them
///
/// # Errors
///
/// Not in a Cargo workspace, a member given that is not one
pub fn workspace(config: &Config) -> Result<Workspace, String> {
    let cargo = std::env::var("CARGO").unwrap_or_else(|_| "cargo".into());
    let output = Command::new(cargo)
        .args(["metadata", "--no-deps", "--format-version", "1"])
        .output()
        .map_err(|e| format!("cargo metadata: {e}"))?;

    if !output.status.success() {
        return Err(format!(
            "cargo metadata: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let metadata: Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("cargo metadata: {e}"))?;
    let root = PathBuf::from(
        metadata["workspace_root"]
            .as_str()
            .ok_or("cargo metadata: no workspace_root")?,
    );
    let ids: BTreeSet<&str> = metadata["workspace_members"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    let mut all: Vec<PathBuf> = metadata["packages"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|package| package["id"].as_str().is_some_and(|id| ids.contains(id)))
        .filter_map(|package| {
            Some(
                Path::new(package["manifest_path"].as_str()?)
                    .parent()?
                    .to_path_buf(),
            )
        })
        .collect();

    all.sort();

    let members = match &config.members {
        None => all,
        Some(given) => given
            .iter()
            .map(|dir| {
                let path = root.join(dir);

                if all.contains(&path) {
                    Ok(path)
                } else {
                    Err(format!(
                        "[extract] members: {dir} is not a member of the workspace"
                    ))
                }
            })
            .collect::<Result<Vec<_>, _>>()?,
    };

    Ok(Workspace { root, members })
}

/// The `.rs` files under a member's folder, in a stable order: not under another package (a folder with its own
/// `Cargo.toml`), nor its build outputs
///
/// # Errors
///
/// A folder unreadable
pub fn rust_files(dir: &Path) -> Result<Vec<PathBuf>, String> {
    let mut files = Vec::new();
    let mut entries: Vec<_> = fs::read_dir(dir)
        .map_err(|e| format!("{}: {e}", dir.display()))?
        .filter_map(Result::ok)
        .map(|entry| entry.path())
        .collect();

    entries.sort();
    for path in entries {
        if path.is_dir() {
            let skipped = path.join("Cargo.toml").is_file()
                || path
                    .file_name()
                    .is_some_and(|name| name == "target" || name == "node_modules");

            if !skipped {
                files.extend(rust_files(&path)?);
            }
        } else if path.extension().is_some_and(|e| e == "rs") {
            files.push(path);
        }
    }

    Ok(files)
}
