//! Cross-cutting organisation: tags on every kind of item, backlinks between
//! pages and everything they mention, and to-dos rolled up from pages.

use crate::db::{fail, now, Db, Result, Table};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;

/// Tags are stored per item as a JSON array of names.
pub fn parse_tags(raw: &str) -> Vec<String> {
    serde_json::from_str(raw).unwrap_or_default()
}

/// "  #Final Exam " → "final-exam". Empty when nothing usable is left.
pub fn clean_tag(raw: &str) -> String {
    raw.trim()
        .trim_start_matches('#')
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .filter(|c| !c.is_control() && *c != '"' && *c != ',')
        .take(40)
        .collect::<String>()
        .to_lowercase()
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub name: String,
    /// Palette key, or empty for the default.
    pub color: String,
}

/// An unchecked to-do item somewhere in a page.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Todo {
    pub page_id: String,
    /// Position among the page's to-do items, in document order.
    pub index: usize,
    /// Readable text, with links shown as the linked item's title.
    pub text: String,
    /// The raw content of the item, used to check it hasn't changed.
    pub key: String,
}

const TAGGED: [Table; 4] = [Table::Pages, Table::Assignments, Table::Events, Table::Files];

/// Text of an inline run. `titles` names linked items; without it, links
/// are written as their ids (a stable key that survives renames).
pub(crate) fn inline_text(node: &Value, titles: Option<&HashMap<String, String>>, out: &mut String) {
    match node.get("type").and_then(Value::as_str) {
        Some("text") => out.push_str(node.get("text").and_then(Value::as_str).unwrap_or("")),
        Some("hardBreak") => out.push(' '),
        Some("inlineMath") => {
            out.push('$');
            out.push_str(node.pointer("/attrs/latex").and_then(Value::as_str).unwrap_or(""));
            out.push('$');
        }
        Some("mention") => {
            let id = node.pointer("/attrs/id").and_then(Value::as_str).unwrap_or("");
            match titles {
                Some(t) => out.push_str(t.get(id).map(String::as_str).unwrap_or("Untitled")),
                None => out.push_str(id),
            }
        }
        _ => {
            for child in node.get("content").and_then(Value::as_array).into_iter().flatten() {
                inline_text(child, titles, out);
            }
        }
    }
}

/// Readable text of a block, on one line.
pub(crate) fn block_text(node: Option<&Value>, titles: Option<&HashMap<String, String>>) -> String {
    let mut out = String::new();
    if let Some(node) = node {
        inline_text(node, titles, &mut out);
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// The first paragraph of a to-do item.
fn item_text(item: &Value, titles: Option<&HashMap<String, String>>) -> String {
    block_text(item.pointer("/content/0"), titles)
}

/// What Home and Flashcards need from a page body, worked out when it's
/// saved so they never parse every page (all JSON arrays).
pub(crate) struct Derived {
    /// Open to-dos as `[index, first paragraph]`.
    pub todos: String,
    /// Flashcards as `[id, front, back]`.
    pub cards: String,
    /// Ids of the cards with something on the front (the ones that count).
    pub card_ids: String,
}

pub(crate) fn derive(content: &str) -> Derived {
    let has_todos = content.contains("\"taskItem\"");
    let has_cards = content.contains("\"flashcard\"");
    let empty = || Derived { todos: "[]".into(), cards: "[]".into(), card_ids: "[]".into() };
    if !has_todos && !has_cards {
        return empty();
    }
    let Ok(mut doc) = serde_json::from_str::<Value>(content) else { return empty() };
    let mut todos = Vec::new();
    if has_todos {
        let mut index = 0;
        walk_todos(&mut doc, &mut |item| {
            if !item.pointer("/attrs/checked").and_then(Value::as_bool).unwrap_or(false) {
                let first = item.pointer("/content/0").cloned().unwrap_or(Value::Null);
                todos.push(Value::Array(vec![index.into(), first]));
            }
            index += 1;
        });
    }
    let cards = if has_cards { crate::cards::derive_cards(&doc) } else { Vec::new() };
    // A link reads as its id here, never empty, just as its title would be.
    let card_ids: Vec<&Value> = cards.iter().filter(|c| !block_text(c.get(1), None).is_empty()).filter_map(|c| c.get(0)).collect();
    Derived {
        todos: Value::Array(todos).to_string(),
        card_ids: serde_json::to_string(&card_ids).unwrap_or_else(|_| "[]".into()),
        cards: Value::Array(cards).to_string(),
    }
}

/// Visits every to-do item in document order (an item before its nested ones).
fn walk_todos(node: &mut Value, f: &mut dyn FnMut(&mut Value)) {
    if node.get("type").and_then(Value::as_str) == Some("taskItem") {
        f(node);
    }
    if let Some(children) = node.get_mut("content").and_then(Value::as_array_mut) {
        for child in children {
            walk_todos(child, f);
        }
    }
}

impl Db {
    pub fn list_tags(&self) -> Result<Vec<Tag>> {
        let conn = self.conn();
        let mut stmt = conn.prepare("SELECT name, color FROM tags ORDER BY name")?;
        let rows = stmt.query_map([], |r| Ok(Tag { name: r.get(0)?, color: r.get(1)? }))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Replaces an item's tags. Returns the cleaned, de-duplicated list.
    pub fn set_item_tags(&self, table: Table, id: &str, tags: &[String]) -> Result<Vec<String>> {
        let mut clean: Vec<String> = Vec::new();
        for t in tags.iter().map(|t| clean_tag(t)).filter(|t| !t.is_empty()) {
            if !clean.contains(&t) {
                clean.push(t);
            }
        }
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let sql = format!("UPDATE {} SET tags = ?1 WHERE id = ?2", table.name());
        if tx.execute(&sql, params![serde_json::to_string(&clean)?, id])? == 0 {
            return fail("Item not found");
        }
        for t in &clean {
            tx.execute(
                "INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?1, '', ?2)",
                params![t, now()],
            )?;
        }
        tx.commit()?;
        Ok(clean)
    }

    pub fn set_tag_color(&self, name: &str, color: &str) -> Result<()> {
        if color.len() > 16 || !color.chars().all(|c| c.is_ascii_alphanumeric()) {
            return fail("Unknown colour");
        }
        self.conn().execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(name) DO UPDATE SET color = excluded.color",
            params![name, color, now()],
        )?;
        Ok(())
    }

    /// Renames a tag everywhere; renaming onto an existing tag merges them.
    /// `to = None` deletes the tag from every item.
    pub fn rename_tag(&self, from: &str, to: Option<&str>) -> Result<()> {
        let to = to.map(clean_tag);
        if to.as_deref() == Some("") {
            return fail("A tag needs a name");
        }
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let needle = format!("%{}%", serde_json::to_string(from)?);
        for table in TAGGED {
            let rows: Vec<(String, String)> = {
                let sql = format!("SELECT id, tags FROM {} WHERE tags LIKE ?1", table.name());
                let mut stmt = tx.prepare(&sql)?;
                let rows = stmt.query_map([&needle], |r| Ok((r.get(0)?, r.get(1)?)))?;
                rows.collect::<rusqlite::Result<_>>()?
            };
            for (id, raw) in rows {
                let mut tags: Vec<String> = Vec::new();
                for t in parse_tags(&raw) {
                    let t = if t == from { to.clone() } else { Some(t) };
                    if let Some(t) = t {
                        if !tags.contains(&t) {
                            tags.push(t);
                        }
                    }
                }
                let sql = format!("UPDATE {} SET tags = ?1 WHERE id = ?2", table.name());
                tx.execute(&sql, params![serde_json::to_string(&tags)?, id])?;
            }
        }
        match &to {
            Some(to) => {
                let color: String = tx
                    .query_row("SELECT color FROM tags WHERE name = ?1", [from], |r| r.get(0))
                    .optional()?
                    .unwrap_or_default();
                tx.execute("DELETE FROM tags WHERE name = ?1", [from])?;
                tx.execute(
                    "INSERT OR IGNORE INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
                    params![to, color, now()],
                )?;
            }
            None => {
                tx.execute("DELETE FROM tags WHERE name = ?1", [from])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    /// Live pages whose content links to `id` (a page, assignment, event or file).
    pub fn backlinks(&self, id: &str) -> Result<Vec<String>> {
        let conn = self.conn();
        let mut stmt = conn.prepare(
            "SELECT p.id FROM page_links l JOIN pages p ON p.rid = l.page_rid
             WHERE l.target = ?1 AND p.deleted_at IS NULL AND p.id != ?1
             ORDER BY p.updated_at DESC",
        )?;
        let rows = stmt.query_map([id], |r| r.get(0))?;
        Ok(rows.collect::<rusqlite::Result<_>>()?)
    }

    /// Titles of everything a mention can point at.
    pub(crate) fn titles(&self) -> Result<HashMap<String, String>> {
        let conn = self.conn();
        let mut map = HashMap::new();
        for sql in [
            "SELECT id, title FROM pages",
            "SELECT id, title FROM assignments",
            "SELECT id, title FROM events",
            "SELECT id, name FROM files",
        ] {
            let mut stmt = conn.prepare(sql)?;
            let rows = stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?)))?;
            for (id, title) in rows.flatten() {
                map.insert(id, title);
            }
        }
        Ok(map)
    }

    /// Every unchecked to-do in live pages, page by page in sidebar order.
    pub fn list_todos(&self) -> Result<Vec<Todo>> {
        let titles = self.titles()?;
        let pages: Vec<(String, String)> = {
            let conn = self.conn();
            let mut stmt = conn.prepare(
                "SELECT p.id, d.todos FROM page_derived d JOIN pages p ON p.rid = d.rid
                 WHERE p.deleted_at IS NULL AND d.todos != '[]'
                 ORDER BY p.updated_at DESC",
            )?;
            let rows = stmt.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))?;
            rows.collect::<rusqlite::Result<_>>()?
        };
        let mut out = Vec::new();
        for (page_id, raw) in pages {
            let Ok(items) = serde_json::from_str::<Vec<(usize, Value)>>(&raw) else { continue };
            for (index, first) in items {
                let text = block_text(Some(&first), Some(&titles));
                if !text.is_empty() {
                    out.push(Todo { page_id: page_id.clone(), index, text, key: block_text(Some(&first), None) });
                }
            }
        }
        Ok(out)
    }

    /// Checks or unchecks a to-do in a page. `key` must still match the item,
    /// so a page edited in the meantime is never changed in the wrong place.
    /// Returns the page's new `updated_at`.
    pub fn set_todo(&self, page_id: &str, index: usize, key: &str, checked: bool) -> Result<i64> {
        let mut conn = self.conn();
        let tx = conn.transaction()?;
        let row: Option<(i64, String)> = tx
            .query_row(
                "SELECT rid, content FROM pages JOIN page_content USING (rid) WHERE id = ?1 AND deleted_at IS NULL",
                [page_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        let Some((rid, content)) = row else {
            return fail("Page not found");
        };
        let Ok(mut doc) = serde_json::from_str::<Value>(&content) else {
            return fail("This page hasn't been opened yet");
        };
        let mut at = 0;
        let mut found = false;
        walk_todos(&mut doc, &mut |item| {
            if at == index && item_text(item, None) == key {
                if let Some(attrs) = item.get_mut("attrs").and_then(Value::as_object_mut) {
                    attrs.insert("checked".into(), Value::Bool(checked));
                    found = true;
                }
            }
            at += 1;
        });
        if !found {
            return fail("That to-do changed. Refresh and try again.");
        }
        let ts = now();
        let content = serde_json::to_string(&doc)?;
        tx.execute("UPDATE page_content SET content = ?1 WHERE rid = ?2", params![content, rid])?;
        tx.execute("UPDATE pages SET updated_at = ?1 WHERE rid = ?2", params![ts, rid])?;
        crate::db::index_content(&tx, rid, &content)?;
        tx.commit()?;
        Ok(ts)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::PagePatch;
    use std::path::PathBuf;

    fn temp_db() -> Db {
        let dir: PathBuf = std::env::temp_dir().join(format!("td-test-{}", uuid::Uuid::new_v4().simple()));
        Db::open(&dir).expect("open db")
    }

    #[test]
    fn tags_are_cleaned_renamed_and_deleted() {
        let db = temp_db();
        let page = db.create_page(None, None, "Notes", "").unwrap();
        let tags = db
            .set_item_tags(Table::Pages, &page.id, &["#Final Exam".into(), "final-exam".into(), " ".into(), "bio".into()])
            .unwrap();
        assert_eq!(tags, vec!["final-exam", "bio"]);
        let f = db.import_file(b"x", "a.txt", "").unwrap();
        db.set_item_tags(Table::Files, &f.id, &["bio".into()]).unwrap();
        db.set_tag_color("bio", "green").unwrap();

        // Renaming onto an existing tag merges and keeps one copy.
        db.rename_tag("final-exam", Some("bio")).unwrap();
        let p = db.get_page(&page.id).unwrap().meta;
        assert_eq!(p.tags, vec!["bio"]);
        let names: Vec<String> = db.list_tags().unwrap().into_iter().map(|t| t.name).collect();
        assert_eq!(names, vec!["bio"]);

        db.rename_tag("bio", Some("Biology 101")).unwrap();
        assert_eq!(db.list_files().unwrap()[0].tags, vec!["biology-101"]);
        assert_eq!(db.list_tags().unwrap()[0].color, "green", "colour follows a rename");

        db.rename_tag("biology-101", None).unwrap();
        assert!(db.get_page(&page.id).unwrap().meta.tags.is_empty());
        assert!(db.list_tags().unwrap().is_empty());
        assert!(db.set_item_tags(Table::Events, "nope", &[]).is_err());
    }

    #[test]
    fn backlinks_find_pages_that_mention_an_item() {
        let db = temp_db();
        let target = db.create_page(None, None, "Target", "").unwrap();
        let linker = db.create_page(None, None, "Linker", "").unwrap();
        let content = format!(r#"{{"type":"doc","content":[{{"type":"mention","attrs":{{"id":"{}"}}}}]}}"#, target.id);
        db.update_page(&linker.id, PagePatch { content: Some(content), ..Default::default() }).unwrap();
        assert_eq!(db.backlinks(&target.id).unwrap(), vec![linker.id.clone()]);
        assert!(db.backlinks(&linker.id).unwrap().is_empty());
        db.trash_page(&linker.id).unwrap();
        assert!(db.backlinks(&target.id).unwrap().is_empty(), "trashed pages don't count");
    }

    #[test]
    fn todos_roll_up_and_toggle_safely() {
        let db = temp_db();
        let other = db.create_page(None, None, "Reading list", "").unwrap();
        let page = db.create_page(None, None, "Week 3", "").unwrap();
        let content = format!(
            r#"{{"type":"doc","content":[{{"type":"taskList","content":[
              {{"type":"taskItem","attrs":{{"checked":true}},"content":[{{"type":"paragraph","content":[{{"type":"text","text":"Done already"}}]}}]}},
              {{"type":"taskItem","attrs":{{"checked":false}},"content":[
                {{"type":"paragraph","content":[{{"type":"text","text":"Read "}},{{"type":"mention","attrs":{{"id":"{}"}}}}]}},
                {{"type":"taskList","content":[{{"type":"taskItem","attrs":{{"checked":false}},"content":[{{"type":"paragraph","content":[{{"type":"text","text":"Nested step"}}]}}]}}]}}
              ]}}
            ]}}]}}"#,
            other.id
        );
        db.update_page(&page.id, PagePatch { content: Some(content), ..Default::default() }).unwrap();

        let todos = db.list_todos().unwrap();
        let texts: Vec<&str> = todos.iter().map(|t| t.text.as_str()).collect();
        assert_eq!(texts, vec!["Read Reading list", "Nested step"]);
        assert_eq!((todos[0].index, todos[1].index), (1, 2));

        // A stale key is refused; the right one checks the item off.
        assert!(db.set_todo(&page.id, 1, "something else", true).is_err());
        db.set_todo(&page.id, todos[0].index, &todos[0].key, true).unwrap();
        let left: Vec<String> = db.list_todos().unwrap().into_iter().map(|t| t.text).collect();
        assert_eq!(left, vec!["Nested step"]);
        // Renaming the linked page doesn't break the key.
        db.update_page(&other.id, PagePatch { title: Some("Books".into()), ..Default::default() }).unwrap();
        db.set_todo(&page.id, todos[0].index, &todos[0].key, false).unwrap();
        assert_eq!(db.list_todos().unwrap()[0].text, "Read Books");
    }
}
