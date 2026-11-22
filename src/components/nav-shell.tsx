"use client";

import { BarChart3, LogOut, Trophy, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Contests", icon: Trophy },
  { href: "/students", label: "Students", icon: Users },
  { href: "/overview", label: "Overview", icon: BarChart3 },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/contests");
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2" aria-label="CP Tracker home">
      <Logo />
      <span className="ml-auto rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground">Batch 1</span>
    </Link>
  );
}

export function NavShell({ email, children }: { email: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const links = (vertical: boolean) =>
    NAV.map(({ href, label, icon: Icon }) => {
      const active = isActive(pathname, href);
      return (
        <Link
          key={href}
          href={href}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-2.5 rounded-md text-sm transition-colors",
            vertical ? "px-2.5 py-1.5" : "px-2 py-1",
            active ? "bg-sidebar-accent text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
          )}
        >
          <Icon className={cn("size-4", active ? "text-primary" : "opacity-70")} aria-hidden />
          {label}
        </Link>
      );
    });

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="px-4 pb-4 pt-5">
          <Brand />
        </div>
        <nav aria-label="Main" className="flex flex-col gap-0.5 px-2">
          {links(true)}
        </nav>
        <div className="mt-auto border-t border-sidebar-border px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-xs text-muted-foreground" title={email}>
              {email}
            </span>
            <button
              type="button"
              onClick={logout}
              disabled={leaving}
              title="Log out"
              aria-label="Log out"
              className="rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:opacity-50"
            >
              <LogOut className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-4 border-b border-border bg-background/90 px-4 backdrop-blur md:hidden">
          <Brand />
          <nav aria-label="Main" className="ml-auto flex items-center gap-1">
            {links(false)}
          </nav>
          <button type="button" onClick={logout} aria-label="Log out" className="p-1 text-muted-foreground">
            <LogOut className="size-4" aria-hidden />
          </button>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-8 sm:py-8">{children}</main>
      </div>
    </div>
  );
}
