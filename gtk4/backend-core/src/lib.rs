//! Shared local database logic used by the Tauri app and GTK desktop build.
//! These modules are sourced from the main application so both shells use the
//! same SQLite schema and data rules.

#[path = "../../../src-tauri/src/cards.rs"]
pub mod cards;
#[path = "../../../src-tauri/src/databases.rs"]
pub mod databases;
#[path = "../../../src-tauri/src/db.rs"]
pub mod db;
#[path = "../../../src-tauri/src/library.rs"]
pub mod library;
#[path = "../../../src-tauri/src/organize.rs"]
pub mod organize;
#[path = "../../../src-tauri/src/planner.rs"]
pub mod planner;
#[path = "../../../src-tauri/src/sync.rs"]
pub mod sync;

/// Shared file-name validation used when a library entry is written.
pub mod files {
    pub fn is_valid_name(name: &str) -> bool {
        !name.is_empty()
            && name.len() <= 64
            && name
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '.')
            && !name.starts_with('.')
    }
}
