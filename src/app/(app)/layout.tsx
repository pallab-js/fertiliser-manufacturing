import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/guard";

// Session-protected routes render at request time (never prerendered) so the
// Date.now() session-expiry check inside verifySessionCookie is legal.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireUser(); // FR-003: signed-out visitors land on /login
  return (
    <Shell user={{ username: session.username, role: session.role }}>
      {children}
    </Shell>
  );
}
