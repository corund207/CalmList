import { DatabaseSync } from 'node:sqlite'

export type DB = DatabaseSync

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         TEXT PRIMARY KEY,
    email      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name       TEXT NOT NULL,
    password   TEXT NOT NULL,
    rev        INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  -- Every record a user owns, as a JSON document. Deleted rows stay as tombstones so other devices hear about them.
  CREATE TABLE IF NOT EXISTS items (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind    TEXT NOT NULL,
    id      TEXT NOT NULL,
    data    TEXT,
    rev     INTEGER NOT NULL,
    PRIMARY KEY (user_id, kind, id)
  );
  CREATE INDEX IF NOT EXISTS items_by_rev ON items (user_id, rev);

  -- A user's Google Calendar connection. The refresh token is encrypted (AES-256-GCM, key from GOOGLE_TOKEN_KEY).
  CREATE TABLE IF NOT EXISTS google_links (
    user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    email         TEXT NOT NULL DEFAULT '',
    refresh_token TEXT NOT NULL,
    time_zone     TEXT NOT NULL,
    calendar_id   TEXT,                       -- the CalmList calendar, synced both ways
    sync_token    TEXT,                       -- its incremental-sync position
    synced        TEXT NOT NULL DEFAULT '{}', -- task id -> fingerprint of the event last written to Google
    last_sync     INTEGER,
    error         TEXT,
    created_at    INTEGER NOT NULL
  );

  -- Push channels: Google calls /api/google/push when a watched calendar changes.
  CREATE TABLE IF NOT EXISTS google_watches (
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    calendar_id TEXT NOT NULL,
    channel_id  TEXT NOT NULL UNIQUE,
    resource_id TEXT NOT NULL,
    token       TEXT NOT NULL,
    expires_at  INTEGER NOT NULL,
    PRIMARY KEY (user_id, calendar_id)
  );

  -- Events from other calendars the person chose not to add.
  CREATE TABLE IF NOT EXISTS google_dismissed (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_key TEXT NOT NULL,
    PRIMARY KEY (user_id, event_key)
  );
`

export const openDb = (path: string): DB => {
  const db = new DatabaseSync(path)
  db.exec(SCHEMA)
  return db
}

/** Runs fn inside a transaction, rolling back on error. */
export const tx = <T>(db: DB, fn: () => T): T => {
  db.exec('BEGIN IMMEDIATE')
  try {
    const out = fn()
    db.exec('COMMIT')
    return out
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}
