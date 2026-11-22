import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/http";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  // Full (database-backed) check, so a deleted admin's leftover cookie just shows the form.
  if (await getSession()) redirect(nextPath);

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* One soft accent glow; everything else stays flat. */}
      <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-120 w-180 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-sm">
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  );
}
