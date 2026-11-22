import { NextResponse, type NextRequest } from "next/server";
import { readSessionToken, SESSION_COOKIE } from "@/lib/session-token";

/**
 * Optimistic check only (Section 3, rule 1): signed-out page requests go to /login.
 * Real authorization happens in verifySession() / requireApiSession(), which also
 * confirm the admin still exists. API routes are excluded; they return 401 themselves.
 * /login is never redirected here, so a stale-but-signed token cannot cause a loop.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();

  const claims = await readSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt)$).*)"],
};
