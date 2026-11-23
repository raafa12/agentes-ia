import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authEnabled, verifySession } from "@/lib/auth";

// Protege la app con el usuario de prueba. La vista previa de las webs generadas (/site) queda fuera
// porque se sirve en un iframe aislado (sandbox) que no envía la cookie.
export async function middleware(req: NextRequest) {
  if (!authEnabled()) return NextResponse.next();
  const { pathname } = req.nextUrl;
  if (pathname === "/login" || pathname.startsWith("/api/login") || pathname.startsWith("/site/")) return NextResponse.next();
  if (await verifySession(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/|favicon.ico|icon.svg).*)"] };
