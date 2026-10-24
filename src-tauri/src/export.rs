//! Exporting the whole workspace: a new folder in Downloads that the UI fills
//! with Markdown, CSV and copies of library files. The paths come from the
//! UI, so each one is checked to stay inside that folder.

use crate::db::{Error, Result};
use serde::Deserialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// The folder the export under way writes into.
#[derive(Default)]
pub struct Export(Mutex<Option<PathBuf>>);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportEntry {
    /// Where it goes, relative to the export folder ("Biology/Lecture.md").
    pub path: String,
    /// The file's text…
    pub text: Option<String>,
    /// …or the stored name of a library file to copy there.
    pub stored: Option<String>,
}

impl Export {
    /// Makes `dir` and sends the next writes there.
    pub fn begin(&self, dir: &Path) -> Result<()> {
        std::fs::create_dir_all(dir)?;
        *self.0.lock().unwrap_or_else(|p| p.into_inner()) = Some(dir.to_path_buf());
        Ok(())
    }

    pub fn dir(&self) -> Result<PathBuf> {
        self.0
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clone()
            .ok_or_else(|| Error("No export under way".into()))
    }

    /// Writes texts and copies library files into the export folder. A
    /// library file missing from the disk is skipped, not a failed export.
    pub fn write(&self, files_dir: &Path, entries: &[ExportEntry]) -> Result<()> {
        let root = self.dir()?;
        for entry in entries {
            let path = root.join(relative(&entry.path)?);
            if let Some(parent) = path.parent() {
                std::fs::create_dir_all(parent)?;
            }
            match (&entry.text, &entry.stored) {
                (Some(text), _) => std::fs::write(&path, text)?,
                (None, Some(stored)) if crate::files::is_valid_name(stored) => {
                    let from = files_dir.join(stored);
                    if from.is_file() {
                        std::fs::copy(&from, &path)?;
                    }
                }
                _ => return Err(Error(format!("Nothing to write to {}", entry.path))),
            }
        }
        Ok(())
    }
}

/// Names Windows keeps for devices, with or without an extension.
const RESERVED: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1",
    "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// A `/`-separated path as plain names under the export folder: no drive,
/// root, `.` or `..`, and nothing Windows can't name a file.
fn relative(path: &str) -> Result<PathBuf> {
    let mut out = PathBuf::new();
    for part in path.split('/') {
        let stem = part.split('.').next().unwrap_or_default().to_ascii_uppercase();
        let ok = !part.is_empty()
            && part.len() <= 255
            && !part.ends_with(['.', ' '])
            && !part.chars().any(|c| r#"<>:"\|?*"#.contains(c) || c.is_control())
            && !RESERVED.contains(&stem.as_str());
        if !ok {
            return Err(Error(format!("Can't export to \"{path}\"")));
        }
        out.push(part);
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_paths_inside_the_folder() {
        assert_eq!(relative("Biology/Lecture — Oct 14.md").unwrap(), Path::new("Biology").join("Lecture — Oct 14.md"));
        for bad in ["", "../x.md", "a/../../x.md", "/x.md", "C:/x.md", "a//b.md", "a\\b.md", "a/./b.md", "con.md", "Nul/x.md", "x.md."] {
            assert!(relative(bad).is_err(), "{bad} should be refused");
        }
    }

    #[test]
    fn writes_texts_and_copies_files() {
        let tmp = std::env::temp_dir().join(format!("td-export-{}", uuid::Uuid::new_v4().simple()));
        let files = tmp.join("files");
        std::fs::create_dir_all(&files).unwrap();
        std::fs::write(files.join("abc.png"), b"png").unwrap();
        let export = Export::default();
        assert!(export.write(&files, &[]).is_err(), "nothing to write into before begin");
        let out = tmp.join("out");
        export.begin(&out).unwrap();
        let entry = |path: &str, text: Option<&str>, stored: Option<&str>| ExportEntry {
            path: path.into(),
            text: text.map(Into::into),
            stored: stored.map(Into::into),
        };
        export
            .write(
                &files,
                &[
                    entry("A/B.md", Some("# B"), None),
                    entry("attachments/pic.png", None, Some("abc.png")),
                    entry("attachments/gone.png", None, Some("missing.png")),
                ],
            )
            .unwrap();
        assert_eq!(std::fs::read_to_string(out.join("A").join("B.md")).unwrap(), "# B");
        assert_eq!(std::fs::read(out.join("attachments").join("pic.png")).unwrap(), b"png");
        assert!(!out.join("attachments").join("gone.png").exists());
        assert!(export.write(&files, &[entry("x.png", None, Some("../db.sqlite"))]).is_err());
        let _ = std::fs::remove_dir_all(&tmp);
    }
}
