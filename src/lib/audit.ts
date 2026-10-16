/** Append-only audit trail for master-data and auth changes.
 *
 * Call `audit()` from admin server actions after a successful write. The
 * actor is taken from the session; the IP is best-effort from headers
 * (useful when the app is exposed on a LAN). before/after are JSON
 * snapshots of the affected row(s). Nothing here is ever updated or
 * deleted by application code — the table is append-only by design.
 */

import { headers } from "next/headers";
import { db } from "@/db";

export type AuditInput = {
  actorUserId: number;
  actorUsername: string;
  action: string; // create | update | archive | restore | deactivate | reactivate | password_reset | settings_save
  entityType: string; // user | settings | customer | supplier | item | formula | company_settings
  entityId?: number | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

export async function clientIp(): Promise<string | null> {
  try {
    const h = await headers();
    return (
      h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      h.get("x-real-ip") ||
      null
    );
  } catch {
    return null;
  }
}

export async function audit(input: AuditInput): Promise<void> {
  db.prepare(
    `INSERT INTO audit_log
       (actor_user_id, actor_username, action, entity_type, entity_id, before, after, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.actorUserId,
    input.actorUsername,
    input.action,
    input.entityType,
    input.entityId ?? null,
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null,
    await clientIp(),
  );
}
