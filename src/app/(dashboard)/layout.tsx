import type { ReactNode } from "react";
import { NavShell } from "@/components/nav-shell";
import { verifySession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Layouts don't re-render on client navigation, so every page also calls verifySession().
  const session = await verifySession();
  return (
    <div className="flex min-h-screen flex-col">
      <NavShell email={session.email} />
      <main className="flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
