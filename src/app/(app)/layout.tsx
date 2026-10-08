import { Shell } from "@/components/shell/shell";
import { requireUser } from "@/lib/guard";

// Every authenticated route reads the session cookie + DB — always dynamic.
export const instant = false;

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
