import { NextResponse, type NextRequest } from "next/server";

/**
 * Fast-path auth gate (FR-003): no session cookie → HTTP 307 to /login
 * *before* the route renders. Without this, a redirect() thrown inside
 * Cache Components' postponed shell can only reach the browser as a
 * client-side digest — curl/no-JS would see a 200 error shell.
 *
 * Presence check only, no DB/HMAC here: proxy runs isolated from app code
 * (Next docs: don't rely on shared modules). `requireUser()` in
 * src/app/(app)/layout.tsx stays the authoritative validation.
 *
 * SESSION_COOKIE ("fm_session") is duplicated from src/lib/auth.ts — it
 * cannot be imported without pulling better-sqlite3 into the proxy bundle.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("fm_session");

  if (!hasSession && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Pages only — skip _next assets, favicon, and any dotted file path.
  matcher: "/((?!_next/|favicon.ico$|.*\\..*$).*)",
};
