import { NextResponse } from "next/server";
import { COOKIE, authEnabled, checkCredentials, createSession } from "@/lib/auth";

export async function POST(req: Request) {
  if (!authEnabled()) return NextResponse.json({ ok: true });
  const { user = "", password = "" } = await req.json().catch(() => ({}));
  if (!checkCredentials(String(user), String(password))) {
    await new Promise((r) => setTimeout(r, 600)); // frena intentos a lo bruto
    return NextResponse.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
  }
  const s = await createSession(String(user));
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE, s.value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: s.maxAge });
  return res;
}
