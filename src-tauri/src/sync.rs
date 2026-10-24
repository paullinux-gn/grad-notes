//! Groundwork for syncing between devices (no server yet).
//!
//! Every change to a database, its schema or its rows is stamped with a
//! hybrid logical clock: wall-clock milliseconds, a counter for changes in
//! the same millisecond, and this copy's device id, written so that comparing
//! two stamps as strings orders them in time. When two copies change the same
//! field, the later stamp wins on both, so they end up identical whichever
//! order they hear about each other's changes in.
//!
//! The outbox lists what changed since the last sync (one entry per record,
//! not a growing log). A sync service will send those records, apply what
//! comes back with `Db::sync_apply`, and clear what was sent.

use crate::db::{now, Result};
use rusqlite::{params, Connection, OptionalExtension};

/// This copy's id (made once, when the database is created or upgraded).
pub(crate) fn device(conn: &Connection) -> Result<String> {
    Ok(conn.query_row("SELECT value FROM sync_meta WHERE key = 'device'", [], |r| r.get(0))?)
}

/// (milliseconds, counter) of a stamp; (0, 0) for none.
fn parse(stamp: &str) -> (i64, i64) {
    let mut parts = stamp.splitn(3, '-');
    let ms = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    let n = parts.next().and_then(|p| p.parse().ok()).unwrap_or(0);
    (ms, n)
}

fn make(ms: i64, n: i64, device: &str) -> String {
    let short: String = device.chars().filter(|c| c.is_ascii_hexdigit()).take(8).collect();
    format!("{ms:013}-{n:04}-{short}")
}

fn last(conn: &Connection) -> Result<String> {
    Ok(conn
        .query_row("SELECT value FROM sync_meta WHERE key = 'clock'", [], |r| r.get(0))
        .optional()?
        .unwrap_or_default())
}

fn store(conn: &Connection, stamp: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO sync_meta (key, value) VALUES ('clock', ?1)
         ON CONFLICT (key) DO UPDATE SET value = excluded.value",
        [stamp],
    )?;
    Ok(())
}

/// A new stamp, later than every stamp this copy has made or seen.
pub(crate) fn tick(conn: &Connection) -> Result<String> {
    let (last_ms, last_n) = parse(&last(conn)?);
    let mut ms = now().max(last_ms);
    let mut n = if ms == last_ms { last_n + 1 } else { 0 };
    if n > 9999 {
        ms += 1;
        n = 0;
    }
    let stamp = make(ms, n, &device(conn)?);
    store(conn, &stamp)?;
    Ok(stamp)
}

/// Takes note of a stamp from another copy, so the next local change is
/// stamped later than it (even if this computer's clock is behind).
pub(crate) fn observe(conn: &Connection, stamp: &str) -> Result<()> {
    if stamp > last(conn)?.as_str() {
        let (ms, n) = parse(stamp);
        store(conn, &make(ms, n, &device(conn)?))?;
    }
    Ok(())
}

/// Notes that a record changed (or is gone) and should be sent next sync.
pub(crate) fn mark(conn: &Connection, entity: &str, id: &str, stamp: &str) -> Result<()> {
    conn.execute(
        "INSERT INTO sync_outbox (entity, id, clock) VALUES (?1, ?2, ?3)
         ON CONFLICT (entity, id) DO UPDATE SET clock = max(clock, excluded.clock)",
        params![entity, id, stamp],
    )?;
    Ok(())
}

/// Whether this copy has ever exchanged changes with another. Until then a
/// record deleted for good needs no note in the outbox: no one else has it.
pub(crate) fn has_peer(conn: &Connection) -> Result<bool> {
    Ok(conn.query_row("SELECT EXISTS (SELECT 1 FROM sync_meta WHERE key = 'peer')", [], |r| r.get(0))?)
}

pub(crate) fn met_peer(conn: &Connection) -> Result<()> {
    conn.execute("INSERT OR IGNORE INTO sync_meta (key, value) VALUES ('peer', '1')", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stamps_order_as_text() {
        let a = make(1_700_000_000_000, 3, "0f3c9a2e-aaaa");
        let b = make(1_700_000_000_000, 12, "00000000");
        let c = make(1_700_000_000_001, 0, "00000000");
        assert!(a < b && b < c);
        assert_eq!(parse(&b), (1_700_000_000_000, 12));
        assert_eq!(parse(""), (0, 0));
    }
}
