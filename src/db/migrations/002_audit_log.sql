-- 002_audit_log.sql — audit trail for master-data and auth changes (security doc P1-6)
-- Append-only; never edited or deleted by application code.

CREATE TABLE audit_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id INTEGER NOT NULL REFERENCES user(id),
  actor_username TEXT NOT NULL,
  action        TEXT NOT NULL, -- create | update | archive | restore | deactivate | reactivate | password_reset | settings_save
  entity_type   TEXT NOT NULL, -- user | settings | customer | supplier | item | formula | company_settings
  entity_id     INTEGER,
  before        TEXT, -- JSON snapshot before change
  after         TEXT, -- JSON snapshot after change
  ip            TEXT,
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
CREATE INDEX idx_audit_actor ON audit_log(actor_user_id);
