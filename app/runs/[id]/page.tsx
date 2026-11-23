import { notFound } from "next/navigation";
import { getState } from "@/lib/engine";
import RunView from "@/components/RunView";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getState(id);
  if (!state) notFound();
  return <RunView initial={state} />;
}
