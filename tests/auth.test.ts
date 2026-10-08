import "./helpers/env";
import { test } from "node:test";
import assert from "node:assert/strict";
import { runMigrations } from "../src/db/migrate";
import { db } from "../src/db/index";
import {
  hashPassword,
  verifyPassword,
  issueSessionCookie,
  verifySessionCookie,
  createSession,
  destroySession,
} from "../src/lib/auth";

process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
runMigrations();

const userId = Number(
  db
    .prepare(
      "INSERT INTO user (username, password_hash, role) VALUES ('admin', ?, 'admin')",
    )
    .run(hashPassword("s3cret-pass"))
    .lastInsertRowid,
);
const opId = Number(
  db
    .prepare(
      "INSERT INTO user (username, password_hash, role) VALUES ('op', 'x', 'operator')",
    )
    .run()
    .lastInsertRowid,
);

test("password hash roundtrip", () => {
  assert.ok(verifyPassword("s3cret-pass", hashPassword("s3cret-pass")));
  assert.ok(!verifyPassword("wrong", hashPassword("s3cret-pass")));
  assert.ok(!verifyPassword("s3cret-pass", "garbage"));
  // distinct salts each time
  assert.notEqual(hashPassword("a"), hashPassword("a"));
});

test("valid session cookie resolves the user", () => {
  const sid = createSession(userId);
  const user = verifySessionCookie(issueSessionCookie(userId, sid));
  assert.deepEqual(user, {
    userId,
    username: "admin",
    role: "admin",
    sessionId: sid,
  });
  destroySession(sid);
});

test("tampered payload is rejected", () => {
  const sid = createSession(userId);
  const cookie = issueSessionCookie(userId, sid);
  const [payload, sig] = cookie.split(".");
  // flip a character inside the payload without re-signing
  const forged = Buffer.from(
    JSON.stringify({ sid, uid: opId, exp: Date.now() + 60_000 }),
  ).toString("base64url");
  assert.equal(verifySessionCookie(`${forged}.${sig}`), null);
  assert.equal(verifySessionCookie(`${payload}x.${sig}`), null);
  assert.equal(verifySessionCookie("not-a-cookie"), null);
  assert.equal(verifySessionCookie(undefined), null);
  destroySession(sid);
});

test("expired cookie is rejected", () => {
  const sid = createSession(userId);
  const cookie = issueSessionCookie(userId, sid);
  const realNow = Date.now;
  try {
    Date.now = () => realNow() + 13 * 3600 * 1000; // past the 12h lifetime
    assert.equal(verifySessionCookie(cookie), null);
  } finally {
    Date.now = realNow;
  }
  destroySession(sid);
});

test("missing/deactivated session is rejected", () => {
  // session row deleted → rejected
  const sid = createSession(userId);
  destroySession(sid);
  assert.equal(verifySessionCookie(issueSessionCookie(userId, sid)), null);

  // user deactivated → existing session rejected
  const sid2 = createSession(opId);
  const cookie2 = issueSessionCookie(opId, sid2);
  assert.ok(verifySessionCookie(cookie2));
  db.prepare("UPDATE user SET active = 0 WHERE id = ?").run(opId);
  assert.equal(verifySessionCookie(cookie2), null);
  db.prepare("UPDATE user SET active = 1 WHERE id = ?").run(opId);
  destroySession(sid2);
});
