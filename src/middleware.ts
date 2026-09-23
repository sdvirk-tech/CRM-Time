import { NextRequest, NextResponse } from "next/server";

const publicExact = new Set(["/login", "/register"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/api/ingest") ||
    pathname.startsWith("/api/public-form") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/invite") ||
    pathname.startsWith("/invite") ||
    pathname.startsWith("/f/") ||
    pathname.startsWith("/c/") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }
  if (publicExact.has(pathname)) return NextResponse.next();

  const session = req.cookies.get("crm_session");
  if (!session && !pathname.startsWith("/api/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
