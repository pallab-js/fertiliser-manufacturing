# Security: Fertilizer MSME Manager

**Date**: 2026-10-07 | **Threat posture**: trusted-local app (owner's machine / small LAN),
sensitive business data (stock, prices, invoices), 2 roles, ≤10 users. Verified against this
doc before every phase demo (constitution IV / Governance).

## 1. Threat model (what we defend)

| # | Threat | Mitigation |
|---|---|---|
| T1 | Anonymous access to factory data | Session check in `(app)` layout + `withRole` guard on every action (FR-003); unauthenticated → login redirect, no data in payload |
| T2 | Operator escalating to admin routes/actions | Server-side role check on `/users`, `/settings` and all `admin` actions — never trust hidden UI alone |
| T3 | Password guessing / credential theft | scrypt (N=16384, 16-byte salt, timing-safe compare); generic login error (FR-005); 12h sessions with server-side revocation |
| T4 | Session cookie forgery/fixation | HMAC-SHA256-signed cookie + `session` row check (revocation, expiry); HttpOnly + SameSite=Lax; Secure flag when served over HTTPS; logout deletes the row |
| T5 | SQL injection | Prepared statements only; dynamic identifiers from whitelists (TRD §3); string-built SQL forbidden by constitution |
| T6 | Tampered/buggy input | zod parse at every action boundary before DB touch; DB CHECK/FK constraints as last line |
| T7 | Privilege data loss (partial writes) | Single transaction per flow; rollback on failure (SC-008) |
| T8 | Money/stock manipulation via race | Single connection + serialized actions + `UNIQUE(fy,seq)` invoice numbers + negative-balance guard (FR-013/025) |
| T9 | XSS via stored content (party names, notes) | React escaping by default; no `dangerouslySetInnerHTML`; invoice print renders only React-escaped values |
| T10 | Secrets leaking to client bundle | No env secrets in client code; session secret server-only (`SESSION_SECRET` env or generated into `data/` with 600 perms); `.env` gitignored |
| T11 | DB file exposure | `data/` gitignored; file perms 600 on Unix; backup dir same policy |
| T12 | Dependency supply chain | Minimal dependency set (constitution); `npm ci` lockfile; no install-time scripts beyond better-sqlite3 build |
| T13 | CSRF on server actions | Next.js server-action origin checks + SameSite=Lax cookie; no GET-mutating actions |
| T14 | Clickjacking / MIME sniffing | Headers in `next.config` (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict `Referrer-Policy`) |

Out of scope v1 (documented, not forgotten): HTTPS termination (LAN/local — add reverse proxy
if exposed beyond trusted LAN), rate limiting (single-process local login; revisit if exposed),
audit_log for master edits (see data-model ponytail note), e-invoice signing.

## 2. Authentication

- **Hash**: `scrypt(password, salt=16B, N=16384, r=8, p=1, keylen=64)` stored
  `scrypt$<salt-b64>$<hash-b64>`; verify with `timingSafeEqual`.
- **Session cookie** `fm_session`: `base64url(json{sid, uid, exp}).hmac-sha256(secret)` —
  HttpOnly, SameSite=Lax, Path=/, Secure (when `https:`), 12h expiry sliding on activity
  (cap 7 days), validated against `session` row every request.
- **Logout / deactivation**: delete session row; deactivated user rejected at session check
  (immediate kill for leavers). Password reset by admin sets a temp password, forces change
  flag optional v1 (`ponytail: no forced password-change flow — add if admin requests`).
- **Seed credentials** (`admin/admin123`) are dev-only: README instructs change before real
  use; production start script warns if defaults still active.

## 3. Authorization

```
operator: all transactional modules + reports        admin: + users, settings, masters CRUD
```
- Enforced twice: route-level (layout renders 403 page) and action-level (`withRole`).
- UI hides admin nav for operators (usability), server enforces regardless (security).

## 4. Input & output validation

- zod schema per action (contract: `contracts/server-actions.md`); field errors returned in
  envelope, never partial writes.
- Quantity/rate bounds: `qty > 0`, rates ≥ 0, enums via CHECK; adjustment reasons required.
- Print output: only React-rendered content (auto-escaped).

## 5. Data protection & integrity

- Append-only `stock_movement` ledger with `balance_after`; invoice lines are snapshots;
  no destructive UPDATE/DELETE on financial rows (corrections via counter-entries/credit
  pattern in v2).
- FK ON + restricted cascades; archive flags instead of deletes for referenced masters.
- WAL mode; every multi-write flow in one tx; `npm run db:check` verifies ledger consistency
  (SC-002) — run in CI/phase gates.

## 6. Backup & recovery

- `scripts/backup.sh` → `sqlite3 data/noter.db .backup "data/backups/noter-<ts>.db"`
  (online-safe; never raw-copy a WAL db). Recommended daily + before every migration.
- Recovery: stop app, replace `data/noter.db` with backup, `npm run db:migrate`.
- Keep ≥7 rotating backups; backups contain the same secrets — same file permissions (600).

## 7. Headers & config (`next.config`)

```ts
headers: [
  { source: '/(.*)', headers: [
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  ]},
]
```
CSP: start with `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'`
— Next.js inline bootstrap requires `'unsafe-inline'` for styles; scripts stay `'self'`
(no inline scripts). Tighten after first smoke test if fonts/next-dev need additions.

## 8. Pre-release security checklist (run at Phase 7 gate)

- [ ] Anonymous: hit every route + every action endpoint → 403/redirect, zero data (SC-005)
- [ ] Operator: hit `/users`, `/settings`, admin actions → denied
- [ ] Tampered cookie (flip signature byte) → rejected; expired session → rejected
- [ ] SQLi probes in all search/filter fields → no error leak, no results change
- [ ] Login error identical for unknown user vs wrong password
- [ ] Negative-stock and over-receive attempts rejected (integrity)
- [ ] Forced mid-tx failure → rollback, `db:check` clean (SC-008)
- [ ] `SESSION_SECRET` unset → random secret auto-generated into `data/.session-secret` (600 perms, gitignored); set the env var explicitly on shared/prod deployments so rotating/deleting `data/` doesn't invalidate all sessions
- [ ] `data/`, `.env`, backups gitignored; default seed passwords flagged
- [ ] Headers present; no stack traces or SQL text in UI responses
