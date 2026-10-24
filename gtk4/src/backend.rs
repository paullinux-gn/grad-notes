use serde::de::DeserializeOwned;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use grad_notes_backend_core::db;

pub struct Backend {
    pub db: Arc<db::Db>,
    downloads: PathBuf,
    export_dir: Mutex<Option<PathBuf>>,
}

impl Backend {
    pub fn open() -> Result<Self, String> {
        let data_dir = std::env::var_os("GRAD_NOTES_DATA_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| adw::glib::user_data_dir().join("io.github.paullinux_gn.gradnotes"));
        let downloads = adw::glib::user_special_dir(adw::glib::UserDirectory::Downloads)
            .unwrap_or_else(|| adw::glib::home_dir().join("Downloads"));
        let db = db::Db::open(&data_dir).map_err(|e| e.0)?;
        Ok(Self {
            db: Arc::new(db),
            downloads,
            export_dir: Mutex::new(None),
        })
    }

    pub fn invoke(&self, command: &str, args: Value) -> Result<Value, String> {
        macro_rules! value {
            ($result:expr) => {
                serde_json::to_value($result.map_err(|e| e.0)?).map_err(|e| e.to_string())
            };
        }
        let db = &self.db;
        match command {
            "open_url" => {
                let url = arg::<String>(&args, "url")?;
                let scheme = adw::glib::uri_parse_scheme(&url).unwrap_or_default();
                if !matches!(scheme.as_str(), "http" | "https" | "mailto") {
                    return Err("Only web links and email links can be opened".into());
                }
                adw::gio::AppInfo::launch_default_for_uri(
                    &url,
                    None::<&adw::gio::AppLaunchContext>,
                )
                .map_err(|e| e.to_string())?;
                Ok(Value::Null)
            }
            "list_pages" => value!(db.list_pages()),
            "get_page" => value!(db.get_page(&arg::<String>(&args, "id")?)),
            "create_page" => {
                let parent: Option<String> = arg(&args, "parentId")?;
                let index: Option<usize> = arg(&args, "index")?;
                let title: Option<String> = arg(&args, "title")?;
                let icon: Option<String> = arg(&args, "icon")?;
                value!(db.create_page(
                    parent.as_deref(),
                    index,
                    title.as_deref().unwrap_or_default(),
                    icon.as_deref().unwrap_or_default(),
                ))
            }
            "update_page" => {
                value!(db.update_page(&arg::<String>(&args, "id")?, arg(&args, "patch")?))
            }
            "move_page" => {
                let parent: Option<String> = arg(&args, "parentId")?;
                value!(db.move_page(
                    &arg::<String>(&args, "id")?,
                    parent.as_deref(),
                    arg(&args, "index")?,
                ))
            }
            "duplicate_page" => value!(db.duplicate_page(&arg::<String>(&args, "id")?)),
            "trash_page" => value!(db.trash_page(&arg::<String>(&args, "id")?)),
            "restore_page" => value!(db.restore_page(&arg::<String>(&args, "id")?)),
            "delete_page" => value!(db.delete_page(&arg::<String>(&args, "id")?)),
            "empty_trash" => value!(db.empty_trash()),
            "search" => value!(db.search(
                &arg::<String>(&args, "query")?,
                arg::<Option<usize>>(&args, "limit")?.unwrap_or(30),
            )),
            "page_contents" => value!(db.page_contents(&arg::<Vec<String>>(&args, "ids")?)),
            "list_courses" => value!(db.list_courses()),
            "create_course" => value!(db.create_course(
                &arg::<String>(&args, "name")?,
                &arg::<String>(&args, "color")?,
            )),
            "update_course" => {
                value!(db.update_course(&arg::<String>(&args, "id")?, arg(&args, "patch")?,))
            }
            "delete_course" => value!(db.delete_course(&arg::<String>(&args, "id")?)),
            "list_assignments" => value!(db.list_assignments()),
            "create_assignment" => value!(db.create_assignment(arg(&args, "input")?)),
            "update_assignment" => {
                value!(db.update_assignment(&arg::<String>(&args, "id")?, arg(&args, "patch")?,))
            }
            "list_events" => value!(db.list_events()),
            "create_event" => value!(db.create_event(arg(&args, "input")?)),
            "update_event" => {
                value!(db.update_event(&arg::<String>(&args, "id")?, arg(&args, "patch")?,))
            }
            "list_tags" => value!(db.list_tags()),
            "set_item_tags" => value!(db.set_item_tags(
                arg(&args, "table")?,
                &arg::<String>(&args, "id")?,
                &arg::<Vec<String>>(&args, "tags")?,
            )),
            "set_tag_color" => value!(db.set_tag_color(
                &arg::<String>(&args, "name")?,
                &arg::<String>(&args, "color")?,
            )),
            "rename_tag" => {
                let to: Option<String> = arg(&args, "to")?;
                value!(db.rename_tag(&arg::<String>(&args, "from")?, to.as_deref()))
            }
            "backlinks" => value!(db.backlinks(&arg::<String>(&args, "id")?)),
            "list_todos" => value!(db.list_todos()),
            "set_todo" => value!(db.set_todo(
                &arg::<String>(&args, "pageId")?,
                arg(&args, "index")?,
                &arg::<String>(&args, "key")?,
                arg(&args, "checked")?,
            )),
            "list_occurrence_pages" => value!(db.list_occurrence_pages()),
            "set_occurrence_page" => value!(db.set_occurrence_page(
                &arg::<String>(&args, "eventId")?,
                &arg::<String>(&args, "date")?,
                &arg::<String>(&args, "pageId")?,
            )),
            "list_cards" => value!(db.list_cards()),
            "list_decks" => value!(db.list_decks(&arg::<String>(&args, "today")?)),
            "save_review" => value!(db.save_review(
                &arg::<String>(&args, "pageId")?,
                &arg::<String>(&args, "cardId")?,
                &arg::<grad_notes_backend_core::cards::Review>(&args, "review")?,
            )),
            "forget_review" => value!(db.forget_review(
                &arg::<String>(&args, "pageId")?,
                &arg::<String>(&args, "cardId")?,
            )),
            "reset_reviews" => value!(db.reset_reviews(&arg::<String>(&args, "pageId")?)),
            "list_databases" => value!(db.list_databases()),
            "list_rows" => {
                let ids: Option<Vec<String>> = arg(&args, "dbIds")?;
                value!(db.list_rows_raw(ids.as_deref()))
            }
            "list_rows_head" => {
                value!(db.list_rows_head(&arg::<String>(&args, "dbId")?, arg(&args, "limit")?,))
            }
            "row_counts" => value!(db.row_counts()),
            "create_database" => {
                let parent: Option<String> = arg(&args, "parentId")?;
                value!(db.create_database(
                    parent.as_deref(),
                    &arg::<String>(&args, "title")?,
                    &arg::<String>(&args, "icon")?,
                    arg(&args, "input")?,
                ))
            }
            "update_database" => value!(db.update_database(
                &arg::<String>(&args, "id")?,
                &arg::<String>(&args, "description")?,
            )),
            "save_property" => {
                value!(db.save_property(&arg::<String>(&args, "dbId")?, arg(&args, "property")?,))
            }
            "delete_property" => value!(
                db.delete_property(&arg::<String>(&args, "dbId")?, &arg::<String>(&args, "id")?,)
            ),
            "save_view" => {
                value!(db.save_view(&arg::<String>(&args, "dbId")?, arg(&args, "view")?))
            }
            "delete_view" => value!(
                db.delete_view(&arg::<String>(&args, "dbId")?, &arg::<String>(&args, "id")?,)
            ),
            "save_automation" => value!(
                db.save_automation(&arg::<String>(&args, "dbId")?, arg(&args, "automation")?,)
            ),
            "delete_automation" => value!(
                db.delete_automation(&arg::<String>(&args, "dbId")?, &arg::<String>(&args, "id")?,)
            ),
            "create_rows" => {
                value!(db.create_rows(&arg::<String>(&args, "dbId")?, arg(&args, "rows")?,))
            }
            "update_rows" => value!(db.update_rows(arg(&args, "changes")?)),
            "sync_pending" => value!(db.sync_pending()),
            "sync_sent" => value!(db.sync_sent(&arg::<String>(&args, "clock")?)),
            "sync_apply" => value!(db.sync_apply(arg(&args, "changes")?)),
            "list_files" => value!(db.list_files()),
            "update_file" => {
                value!(db.update_file(&arg::<String>(&args, "id")?, arg(&args, "patch")?,))
            }
            "file_usage" => value!(db.file_usage()),
            "save_file" => {
                let bytes: Vec<u8> = arg(&args, "bytes")?;
                value!(db.import_file(
                    &bytes,
                    &arg::<String>(&args, "name")?,
                    &arg::<String>(&args, "mime")?,
                ))
            }
            "trash_item" => {
                value!(db.trash_item(arg(&args, "table")?, &arg::<String>(&args, "id")?,))
            }
            "restore_item" => {
                value!(db.restore_item(arg(&args, "table")?, &arg::<String>(&args, "id")?,))
            }
            "delete_item" => {
                value!(db.delete_item(arg(&args, "table")?, &arg::<String>(&args, "id")?,))
            }
            "export_markdown" => {
                let path = unique_path(&self.downloads, &arg::<String>(&args, "title")?, "md");
                std::fs::write(&path, arg::<String>(&args, "markdown")?)
                    .map_err(|e| e.to_string())?;
                Ok(json!(path.to_string_lossy()))
            }
            "export_document" => {
                let ext: String = arg(&args, "ext")?;
                if !matches!(ext.as_str(), "docx" | "md" | "html" | "csv") {
                    return Err("Unsupported export format".into());
                }
                let path = unique_path(&self.downloads, &arg::<String>(&args, "name")?, &ext);
                std::fs::write(&path, arg::<Vec<u8>>(&args, "bytes")?)
                    .map_err(|e| e.to_string())?;
                Ok(json!(path.to_string_lossy()))
            }
            "data_info" => {
                let size = |name: &str| {
                    std::fs::metadata(db.data_dir.join(name))
                        .map(|m| m.len())
                        .unwrap_or(0)
                };
                let file_bytes = std::fs::read_dir(&db.files_dir)
                    .map(|entries| {
                        entries
                            .flatten()
                            .filter_map(|e| e.metadata().ok())
                            .map(|m| m.len())
                            .sum::<u64>()
                    })
                    .unwrap_or_default();
                Ok(json!({
                    "dataDir": db.data_dir,
                    "dbBytes": size("gradnotes.db") + size("gradnotes.db-wal"),
                    "fileBytes": file_bytes,
                    "fileCount": db.live_count(db::Table::Files).map_err(|e| e.0)?,
                    "pageCount": db.live_count(db::Table::Pages).map_err(|e| e.0)?,
                    "assignmentCount": db.live_count(db::Table::Assignments).map_err(|e| e.0)?,
                    "eventCount": db.live_count(db::Table::Events).map_err(|e| e.0)?,
                    "version": env!("CARGO_PKG_VERSION"),
                }))
            }
            "open_file" | "reveal_file" | "export_file" => {
                let (path, name) = db
                    .file_path(&arg::<String>(&args, "id")?)
                    .map_err(|e| e.0)?;
                match command {
                    "open_file" => launch_path(&path)?,
                    "reveal_file" => launch_path(path.parent().unwrap_or(&path))?,
                    _ => {
                        let destination = unique_path(&self.downloads, &name, "");
                        std::fs::copy(&path, &destination).map_err(|e| e.to_string())?;
                        return Ok(json!(destination.to_string_lossy()));
                    }
                }
                Ok(Value::Null)
            }
            "export_begin" => {
                let dir = unique_path(&self.downloads, &arg::<String>(&args, "name")?, "");
                std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
                *self.export_dir.lock().unwrap_or_else(|e| e.into_inner()) = Some(dir.clone());
                Ok(json!(dir.to_string_lossy()))
            }
            "export_write" => {
                let root = self
                    .export_dir
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone()
                    .ok_or_else(|| "No export under way".to_string())?;
                let entries: Vec<Value> = arg(&args, "entries")?;
                for entry in entries {
                    let relative = safe_relative_path(entry["path"].as_str().unwrap_or_default())?;
                    let path = root.join(relative);
                    if let Some(parent) = path.parent() {
                        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
                    }
                    if let Some(text) = entry["text"].as_str() {
                        std::fs::write(path, text).map_err(|e| e.to_string())?;
                    } else if let Some(stored) = entry["stored"].as_str() {
                        if grad_notes_backend_core::files::is_valid_name(stored) {
                            let from = db.files_dir.join(stored);
                            if from.is_file() {
                                std::fs::copy(from, path).map_err(|e| e.to_string())?;
                            }
                        }
                    } else {
                        return Err("Export entry has no content".into());
                    }
                }
                Ok(Value::Null)
            }
            "export_reveal" => {
                let dir = self
                    .export_dir
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .clone()
                    .ok_or_else(|| "No export under way".to_string())?;
                launch_path(&dir)?;
                Ok(Value::Null)
            }
            "export_pdf" => Err("PDF export is not wired into the GTK shell yet".into()),
            "set_reminders" | "set_capture_shortcut" | "trim_memory" => Ok(Value::Null),
            _ => Err(format!("Unknown native command: {command}")),
        }
    }
}

fn arg<T: DeserializeOwned>(args: &Value, key: &str) -> Result<T, String> {
    serde_json::from_value(args.get(key).cloned().unwrap_or(Value::Null))
        .map_err(|e| format!("Invalid {key}: {e}"))
}

fn launch_path(path: &Path) -> Result<(), String> {
    use adw::gio::prelude::FileExt;
    let uri = adw::gio::File::for_path(path).uri();
    adw::gio::AppInfo::launch_default_for_uri(&uri, None::<&adw::gio::AppLaunchContext>)
        .map_err(|e| e.to_string())
}

fn safe_relative_path(path: &str) -> Result<PathBuf, String> {
    let path = Path::new(path);
    if path.is_absolute()
        || path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("Export path must stay inside the export folder".into());
    }
    Ok(path.to_path_buf())
}

fn unique_path(dir: &Path, name: &str, extension: &str) -> PathBuf {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if r#"<>:"/\\|?*"#.contains(c) || c.is_control() {
                ' '
            } else {
                c
            }
        })
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    let name = if sanitized.is_empty() || sanitized.chars().all(|c| c == '.') {
        "Untitled"
    } else {
        &sanitized
    };
    let (stem, ext) = if extension.is_empty() {
        match name.rsplit_once('.') {
            Some((stem, ext)) if !stem.is_empty() => (stem.to_string(), format!(".{ext}")),
            _ => (name.to_string(), String::new()),
        }
    } else {
        (name.to_string(), format!(".{extension}"))
    };
    let mut target = dir.join(format!("{stem}{ext}"));
    let mut suffix = 2;
    while target.exists() {
        target = dir.join(format!("{stem} ({suffix}){ext}"));
        suffix += 1;
    }
    target
}
