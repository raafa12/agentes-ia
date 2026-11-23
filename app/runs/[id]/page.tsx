import { notFound } from "next/navigation";
import { getState } from "@/lib/engine";
import RunView from "@/components/RunView";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/runs/${id}`);
  const state = await getState(id);
  if (!state) notFound();
  return <RunView initial={state} />;
}
