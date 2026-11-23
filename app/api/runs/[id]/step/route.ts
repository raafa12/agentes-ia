import { NextResponse } from "next/server";
import { step } from "@/lib/engine";
import { guardApi } from "@/lib/session";

export const dynamic = "force-dynamic";
// Cada paso es una sola llamada a la IA, así cabe en el límite de las funciones gratuitas de Vercel.
export const maxDuration = 60;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi();
  if (denied) return denied;
  const { id } = await params;
  return NextResponse.json(await step(id));
}
