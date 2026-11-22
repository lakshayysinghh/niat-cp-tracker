import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { safeNextPath } from "@/lib/http";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · NIAT CF Tracker" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = safeNextPath(Array.isArray(next) ? next[0] : next);

  // Full (database-backed) check, so a deleted admin's leftover cookie just shows the form.
  if (await getSession()) redirect(nextPath);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
