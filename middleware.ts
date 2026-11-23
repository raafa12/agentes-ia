import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, authEnabled, verifySession } from "@/lib/auth";

// Protege la app con el usuario de prueba. La vista previa de las webs generadas (/site) queda fuera
// porque se sirve en un iframe aislado (sandbox) que no envía la cookie.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!authEnabled()) return NextResponse.next();
  if (pathname === "/login" || pathname.startsWith("/api/login") || pathname.startsWith("/site/")) return NextResponse.next();

  let ok = false;
  try {
    ok = await verifySession(req.cookies.get(COOKIE)?.value);
  } catch (e) {
    console.error("[auth] no se pudo verificar la sesión", e);
  }
  if (ok) return NextResponse.next();
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Se ejecuta en Node.js (no en Edge): mismo entorno que el resto de la app
  runtime: "nodejs",
  matcher: ["/((?!_next/|favicon.ico|icon.svg).*)"],
};
