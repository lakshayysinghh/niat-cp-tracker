import type { ReactNode } from "react";
import { NavShell } from "@/components/nav-shell";
import { verifySession } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Layouts don't re-render on client navigation, so every page also calls verifySession().
  const session = await verifySession();
  return <NavShell email={session.email}>{children}</NavShell>;
}
