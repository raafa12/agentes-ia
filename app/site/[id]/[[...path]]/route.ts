import { getFile } from "@/lib/engine";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
};

// Sirve la web que han construido los agentes para verla en la vista previa.
// La cabecera CSP "sandbox" la aísla en un origen propio: su JavaScript no puede tocar la app ni sus cookies.
export async function GET(req: Request, { params }: { params: Promise<{ id: string; path?: string[] }> }) {
  const { id, path } = await params;
  if (!path?.length) return Response.redirect(new URL(`/site/${id}/index.html`, req.url), 307);
  const file = await getFile(id, path.join("/"));
  if (!file) return new Response("No encontrado", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const ext = file.path.split(".").pop() ?? "";
  return new Response(file.content, {
    headers: {
      "content-type": TYPES[ext] ?? "text/plain; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts allow-forms; default-src 'self' 'unsafe-inline' data:; form-action 'none'",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
