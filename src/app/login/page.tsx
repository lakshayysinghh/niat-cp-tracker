import { redirect } from "next/navigation";
import { LiquidBackground } from "@/components/liquid-background";
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
      <LiquidBackground className="absolute inset-0" />
      <div className="relative w-full max-w-sm">
        <LoginForm nextPath={nextPath} />
      </div>
    </main>
  );
}
