//! Reminders are worked out by the UI (it knows repeats, settings and
//! names) and handed here as a list of times. A background thread shows each
//! one as a system notification when its time comes. It keeps running while
//! the window is minimized, when the web view is suspended.

use serde::Deserialize;
use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_notification::NotificationExt;

#[derive(Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Reminder {
    /// Stable id, so a reminder fires once even if the list is resent.
    pub key: String,
    /// When to show it (ms since the epoch).
    pub at: i64,
    pub title: String,
    pub body: String,
}

#[derive(Default)]
pub struct Reminders {
    pending: Mutex<Vec<Reminder>>,
    fired: Mutex<HashSet<String>>,
}

/// Reminders more than this late (the computer was asleep) are dropped.
const GRACE_MS: i64 = 5 * 60 * 1000;

impl Reminders {
    pub fn set(&self, list: Vec<Reminder>) {
        *self.pending.lock().unwrap_or_else(|p| p.into_inner()) = list;
    }

    /// Reminders due at `now`, each returned only once.
    pub fn take_due(&self, now: i64) -> Vec<Reminder> {
        let pending = self.pending.lock().unwrap_or_else(|p| p.into_inner());
        let mut fired = self.fired.lock().unwrap_or_else(|p| p.into_inner());
        let due: Vec<Reminder> = pending
            .iter()
            .filter(|r| r.at <= now && now - r.at < GRACE_MS && !fired.contains(&r.key))
            .cloned()
            .collect();
        for r in &due {
            fired.insert(r.key.clone());
        }
        due
    }
}

pub fn start<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(15));
        let due = app.state::<Reminders>().take_due(crate::db::now());
        for r in due {
            let _ = app.notification().builder().title(&r.title).body(&r.body).show();
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn r(key: &str, at: i64) -> Reminder {
        Reminder { key: key.into(), at, title: String::new(), body: String::new() }
    }

    #[test]
    fn fires_once_and_skips_stale() {
        let rem = Reminders::default();
        rem.set(vec![r("a", 1_000), r("b", 5_000), r("old", -GRACE_MS)]);
        assert!(rem.take_due(500).is_empty());
        let keys: Vec<String> = rem.take_due(1_000).into_iter().map(|r| r.key).collect();
        assert_eq!(keys, vec!["a"]);
        assert!(rem.take_due(2_000).is_empty(), "never twice");
        // Resending the list doesn't re-fire what already fired.
        rem.set(vec![r("a", 1_000), r("b", 5_000)]);
        let keys: Vec<String> = rem.take_due(6_000).into_iter().map(|r| r.key).collect();
        assert_eq!(keys, vec!["b"]);
    }
}
