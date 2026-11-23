import { NextResponse } from "next/server";
import { getState } from "@/lib/engine";
import { guardApi } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guardApi();
  if (denied) return denied;
  const { id } = await params;
  const state = await getState(id);
  if (!state) return NextResponse.json({ error: "No existe" }, { status: 404 });
  return NextResponse.json(state);
}
