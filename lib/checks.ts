import type { SiteFile } from "./types";

// Comprobaciones automáticas que hace el agente de Testing antes de la revisión con IA.
// Son deterministas: si una falla, la tarea no pasa aunque la IA diga que sí.

export interface CheckResult {
  name: string;
  passed: boolean;
  detail?: string;
}

const isLocal = (ref: string) =>
  ref && !/^(https?:|mailto:|tel:|#|data:|javascript:|\/\/)/i.test(ref);

function stripQuery(ref: string) {
  return ref.split("#")[0].split("?")[0].replace(/^\.\//, "").replace(/^\//, "");
}

export function staticChecks(files: SiteFile[]): CheckResult[] {
  const results: CheckResult[] = [];
  const paths = new Set(files.map((f) => f.path));
  const htmls = files.filter((f) => f.path.endsWith(".html"));

  for (const f of htmls) {
    const html = f.content;
    const problems: string[] = [];
    if (!/<!doctype html>/i.test(html)) problems.push("falta <!doctype html>");
    if (!/<html[^>]*\blang=/i.test(html)) problems.push("falta el atributo lang en <html>");
    if (!/<title>[^<]{3,}<\/title>/i.test(html)) problems.push("falta un <title> con texto");
    if (!/<meta[^>]+name=["']viewport["']/i.test(html)) problems.push("falta la etiqueta meta viewport");
    const h1 = (html.match(/<h1[\s>]/gi) || []).length;
    if (h1 !== 1) problems.push(`debe tener exactamente un <h1> (tiene ${h1})`);

    // Enlaces y recursos locales que no existen
    const refs = [...html.matchAll(/(?:href|src|action)=["']([^"']+)["']/gi)].map((m) => m[1]);
    for (const ref of refs) {
      if (!isLocal(ref)) continue;
      const target = stripQuery(ref);
      if (target && !paths.has(target)) problems.push(`enlace roto: «${ref}»`);
    }

    // Etiquetas básicas abiertas y cerradas
    for (const tag of ["html", "head", "body", "main", "form", "nav"]) {
      const open = (html.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
      const close = (html.match(new RegExp(`</${tag}>`, "gi")) || []).length;
      if (open !== close) problems.push(`<${tag}> abierta ${open} vez/veces y cerrada ${close}`);
    }

    // Formularios: cada campo con su etiqueta
    const inputs = [...html.matchAll(/<(input|textarea|select)\b([^>]*)>/gi)].filter(
      (m) => !/type=["'](hidden|submit|button)["']/i.test(m[2]),
    );
    for (const m of inputs) {
      const id = m[2].match(/\bid=["']([^"']+)["']/i)?.[1];
      const aria = /aria-label=/i.test(m[2]);
      const labelled = id && new RegExp(`<label[^>]+for=["']${id}["']`, "i").test(html);
      if (!aria && !labelled) problems.push(`campo <${m[1]}> sin <label> asociada`);
    }

    results.push({ name: `HTML válido en ${f.path}`, passed: problems.length === 0, detail: problems.join("; ") || undefined });
  }

  // La navegación debe ser coherente: todas las páginas enlazan a todas las demás
  const pages = htmls.map((f) => f.path);
  const missing: string[] = [];
  for (const f of htmls) {
    const nav = f.content.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? "";
    for (const p of pages) {
      if (p === f.path) continue;
      if (!new RegExp(`href=["'](\\./)?${p.replace(".", "\\.")}["']`, "i").test(nav)) missing.push(`${f.path} → ${p}`);
    }
  }
  results.push({
    name: "Menú de navegación completo en todas las páginas",
    passed: missing.length === 0,
    detail: missing.length ? `faltan enlaces en el menú: ${missing.join(", ")}` : undefined,
  });

  // CSS: llaves equilibradas
  for (const f of files.filter((x) => x.path.endsWith(".css"))) {
    const open = (f.content.match(/{/g) || []).length;
    const close = (f.content.match(/}/g) || []).length;
    results.push({ name: `CSS bien formado en ${f.path}`, passed: open === close, detail: open === close ? undefined : `${open} «{» y ${close} «}»` });
  }

  return results;
}
