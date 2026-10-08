import { redirect } from "next/navigation";
import { getSession } from "@/lib/guard";
import { LoginForm } from "./login-form";

// Reads the session cookie — always dynamic.
export const instant = false;

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <main className="mesh-gradient flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-display-md uppercase">
            Fertilizer<span className="text-primary">MSME</span>
          </h1>
          <p className="mt-2 text-body-lg text-ink/80">
            Production · Inventory · QC · GST Invoicing
          </p>
        </div>
        {/* ex-auth-form-card */}
        <div className="rounded-lg border border-hairline bg-canvas p-6 shadow-float">
          <h2 className="mb-6 text-heading-sm uppercase">Sign in</h2>
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
