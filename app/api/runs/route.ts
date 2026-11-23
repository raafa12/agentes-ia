import { NextResponse } from "next/server";
import { createRun, listRuns } from "@/lib/engine";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ runs: await listRuns() });
}

export async function POST(req: Request) {
  const { request } = await req.json().catch(() => ({}));
  const text = typeof request === "string" ? request.trim() : "";
  if (text.length < 8 || text.length > 500) {
    return NextResponse.json({ error: "Escribe una petición de entre 8 y 500 caracteres" }, { status: 400 });
  }
  // Protege la cuota gratuita de la IA: como mucho 15 ejecuciones nuevas por hora
  const [{ n }] = await q<{ n: number }>("select count(*)::int as n from runs where created_at > now() - interval '1 hour'");
  if (Number(n) >= 15) {
    return NextResponse.json({ error: "Se ha llegado al límite de 15 ejecuciones por hora. Prueba en un rato." }, { status: 429 });
  }
  const id = await createRun(text);
  return NextResponse.json({ id });
}
