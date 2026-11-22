"use client";

import { AlertCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm({ nextPath }: { nextPath: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      if (res.ok) {
        router.replace(nextPath);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Sign-in failed. Try again.");
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    }
    setPending(false);
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex justify-center">
        <Logo size="lg" />
      </div>

      {/* Frosted "liquid glass" card over the animated backdrop */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[oklch(0.17_0.005_260/0.55)] p-7 shadow-2xl shadow-black/50 backdrop-blur-2xl backdrop-saturate-150">
        <div aria-hidden className="pointer-events-none absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-white/30 to-transparent" />
        <h1 className="text-center text-lg font-semibold tracking-tight">Admin sign in</h1>
        <p className="mt-1 text-center text-sm text-muted-foreground">Authorised batch mentors only</p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email" className="text-xs">
              Work email
            </Label>
            <Input id="email" name="email" type="email" autoComplete="username" required autoFocus className="h-10 bg-black/20" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password" className="text-xs">
              Password
            </Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-10 bg-black/20" />
          </div>
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-red-300">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>{error}</span>
            </p>
          )}
          <Button type="submit" disabled={pending} className="mt-1 h-10">
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {pending ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
      <p className="mt-6 text-center text-xs text-muted-foreground">No public registration · ask the lead admin for access</p>
    </div>
  );
}
