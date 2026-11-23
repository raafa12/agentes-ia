// Comprobación del login en el servidor (páginas y API), sin middleware.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { COOKIE, authEnabled, verifySession } from "./auth";

export async function isAuthed() {
  if (!authEnabled()) return true;
  try {
    return await verifySession((await cookies()).get(COOKIE)?.value);
  } catch (e) {
    console.error("[auth] no se pudo verificar la sesión", e);
    return false;
  }
}

// En páginas: si no hay sesión, al login
export async function requireUser(next?: string) {
  if (!(await isAuthed())) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
}

// En la API: devuelve una respuesta 401 si no hay sesión, o null si todo bien
export async function guardApi() {
  return (await isAuthed()) ? null : NextResponse.json({ error: "No autorizado" }, { status: 401 });
}
