"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Contests" },
  { href: "/students", label: "Students" },
  { href: "/overview", label: "Overview" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/" || pathname.startsWith("/contests");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NavShell({ email }: { email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);

  async function logout() {
    setLeaving(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center gap-6 px-4">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          NIAT CF Tracker
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1">
          {NAV.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm transition-colors",
                  active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline" title="Signed in as">
            {email}
          </span>
          <Button variant="ghost" size="sm" onClick={logout} disabled={leaving}>
            <LogOut className="size-4" aria-hidden />
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
