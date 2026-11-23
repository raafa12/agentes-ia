// Los tres agentes. Cada uno es una función con su propio prompt y su propia responsabilidad.
// Con un proveedor de IA configurado usan el modelo; en modo simulado siguen reglas fijas
// (útil para probar el flujo sin gastar cuota).

import { askJson, provider } from "./llm";
import { staticChecks, type CheckResult } from "./checks";
import type { SiteFile, Task } from "./types";

const ALLOWED = /^[a-z0-9][a-z0-9_-]*\.(html|css|js)$/i;

const listFiles = (files: SiteFile[]) =>
  files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

// ───────────────────────────── 1. ORQUESTADOR ─────────────────────────────

export interface Plan {
  summary: string;
  tasks: { title: string; description: string; acceptance: string[] }[];
}

const ORCHESTRATOR_SYSTEM = `Eres el agente ORQUESTADOR de un equipo de desarrollo web con otros dos agentes:
- DEVELOP: escribe el código (HTML, CSS y JS sin dependencias externas).
- TESTING: comprueba cada tarea contra sus criterios de aceptación.
Recibes una petición del cliente y la web actual. Divide la petición en entre 1 y 4 tareas pequeñas,
ordenadas, independientes en lo posible y que se puedan comprobar leyendo el código.
Cada tarea lleva 2-4 criterios de aceptación concretos y verificables (nombres de archivo, elementos, textos, enlaces).
No pidas tareas imposibles en una web estática (por ejemplo, enviar emails de verdad): en ese caso, pide la interfaz.
Responde SOLO con JSON: {"summary": "una frase", "tasks": [{"title": "...", "description": "...", "acceptance": ["..."]}]}. Todo en español.`;

export async function orchestratorPlan(request: string, files: SiteFile[]): Promise<Plan> {
  if (provider() === "mock") return mockPlan(request);
  const plan = await askJson<Plan>(
    ORCHESTRATOR_SYSTEM,
    `PETICIÓN DEL CLIENTE:\n${request}\n\nWEB ACTUAL:\n${listFiles(files)}`,
  );
  const tasks = (plan.tasks ?? [])
    .filter((t) => t?.title && t?.description)
    .slice(0, 4)
    .map((t) => ({
      title: String(t.title).slice(0, 140),
      description: String(t.description).slice(0, 1200),
      acceptance: (Array.isArray(t.acceptance) ? t.acceptance : []).map(String).slice(0, 5),
    }));
  if (!tasks.length) throw new Error("El Orquestador no ha generado ninguna tarea");
  return { summary: String(plan.summary ?? "").slice(0, 300), tasks };
}

// Cuando Testing da la integración final por mala, el Orquestador crea una tarea de corrección.
export function orchestratorFixTask(failures: CheckResult[]) {
  return {
    title: "Corregir fallos de integración",
    description:
      "La comprobación final de la web completa ha encontrado estos fallos. Corrígelos sin romper lo demás:\n" +
      failures.map((f) => `- ${f.name}: ${f.detail}`).join("\n"),
    acceptance: failures.map((f) => `${f.name} sin fallos`),
  };
}

// ───────────────────────────── 2. DEVELOP ─────────────────────────────

export interface DevResult {
  summary: string;
  files: SiteFile[];
}

const DEVELOP_SYSTEM = `Eres el agente DEVELOP de un equipo de desarrollo web. Implementas UNA tarea sobre una web estática
(archivos .html, .css y .js en la raíz, sin frameworks ni recursos externos).
Reglas:
- Mantén el estilo, la cabecera, el menú y el pie existentes en todas las páginas.
- HTML válido: <!doctype html>, <html lang="es">, <meta viewport>, <title>, un único <h1>.
- Cada campo de formulario con su <label for>. Enlaces relativos (por ejemplo "contacto.html").
- Si crea una página nueva, debe aparecer en el <nav> de TODAS las páginas que toques.
- Si Testing te devuelve fallos, corrígelos todos.
Devuelve SOLO JSON: {"summary": "qué has hecho, una frase", "files": [{"path": "archivo.html", "content": "contenido COMPLETO del archivo"}]}
Incluye únicamente los archivos que crees o modifiques, siempre con su contenido completo.`;

export async function developTask(task: Task, files: SiteFile[]): Promise<DevResult> {
  if (provider() === "mock") return mockDevelop(task, files);
  const feedback = task.feedback.length
    ? `\n\nINTENTO ${task.attempts + 1}. TESTING HA DEVUELTO ESTOS FALLOS, CORRÍGELOS:\n${task.feedback.map((f) => `- ${f}`).join("\n")}`
    : "";
  const res = await askJson<DevResult>(
    DEVELOP_SYSTEM,
    `TAREA: ${task.title}\n${task.description}\n\nCRITERIOS DE ACEPTACIÓN:\n${task.acceptance
      .map((a) => `- ${a}`)
      .join("\n")}${feedback}\n\nWEB ACTUAL:\n${listFiles(files)}`,
  );
  const out = (res.files ?? [])
    .filter((f) => f && typeof f.path === "string" && typeof f.content === "string")
    .map((f) => ({ path: f.path.replace(/^\.?\//, "").trim(), content: f.content }))
    .filter((f) => ALLOWED.test(f.path) && f.content.length < 60_000);
  if (!out.length) throw new Error("Develop no ha devuelto ningún archivo");
  return { summary: String(res.summary ?? "").slice(0, 300), files: out };
}

// ───────────────────────────── 3. TESTING ─────────────────────────────

export interface TestResult {
  passed: boolean;
  issues: string[];
  checks: CheckResult[]; // automáticas + criterios
}

const TESTING_SYSTEM = `Eres el agente TESTING de un equipo de desarrollo web. Revisas de forma estricta si una tarea
cumple TODOS sus criterios de aceptación leyendo el código de la web. No inventes requisitos nuevos,
pero no des por buena una tarea a medias. Si algo falla, explica exactamente qué y en qué archivo.
Responde SOLO JSON: {"criteria": [{"criterion": "...", "passed": true, "reason": "breve"}], "issues": ["fallo concreto y cómo arreglarlo"]}`;

export async function testTask(task: Task, files: SiteFile[], touched: string[]): Promise<TestResult> {
  // 1) Comprobaciones automáticas sobre los archivos que ha tocado esta tarea
  const touchedFiles = files.filter((f) => touched.includes(f.path));
  const auto = staticChecks(files).filter((c) => touchedFiles.some((f) => c.name.endsWith(f.path)));
  // el menú solo se exige en las páginas tocadas
  const navProblems = navMissingIn(files, touched);
  auto.push({
    name: "Menú completo en las páginas modificadas",
    passed: navProblems.length === 0,
    detail: navProblems.length ? `faltan enlaces: ${navProblems.join(", ")}` : undefined,
  });

  // 2) Criterios de aceptación revisados por la IA
  let criteria: CheckResult[] = [];
  let issues: string[] = [];
  if (provider() === "mock") {
    criteria = task.acceptance.map((a) => ({ name: a, passed: true, detail: "revisión simulada" }));
  } else {
    const res = await askJson<{ criteria: { criterion: string; passed: boolean; reason: string }[]; issues: string[] }>(
      TESTING_SYSTEM,
      `TAREA: ${task.title}\n${task.description}\n\nCRITERIOS DE ACEPTACIÓN:\n${task.acceptance
        .map((a) => `- ${a}`)
        .join("\n")}\n\nARCHIVOS MODIFICADOS EN ESTA TAREA: ${touched.join(", ")}\n\nWEB COMPLETA:\n${listFiles(files)}`,
    );
    criteria = (res.criteria ?? []).map((c) => ({ name: String(c.criterion), passed: Boolean(c.passed), detail: c.reason }));
    issues = (res.issues ?? []).map(String);
  }

  const failedAuto = auto.filter((c) => !c.passed).map((c) => `${c.name}: ${c.detail}`);
  const failedCriteria = criteria.filter((c) => !c.passed).map((c) => `${c.name}${c.detail ? ` (${c.detail})` : ""}`);
  const allIssues = [...failedAuto, ...failedCriteria, ...(failedCriteria.length ? issues : [])];
  return { passed: allIssues.length === 0, issues: [...new Set(allIssues)].slice(0, 10), checks: [...auto, ...criteria] };
}

// Prueba final sobre la web completa (integración), cuando todas las tareas han pasado
export function testIntegration(files: SiteFile[]): CheckResult[] {
  return staticChecks(files);
}

function navMissingIn(files: SiteFile[], touched: string[]) {
  const pages = files.filter((f) => f.path.endsWith(".html")).map((f) => f.path);
  const missing: string[] = [];
  for (const f of files.filter((x) => touched.includes(x.path) && x.path.endsWith(".html"))) {
    const nav = f.content.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? "";
    for (const p of pages) {
      if (p !== f.path && !new RegExp(`href=["'](\\./)?${p.replace(".", "\\.")}["']`, "i").test(nav)) missing.push(`${f.path} → ${p}`);
    }
  }
  return missing;
}

// ───────────────────────────── Modo simulado ─────────────────────────────

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function pageFromRequest(request: string) {
  const m = request.match(/p[aá]gina (?:de |del |sobre )?(?:la |el |los |las )?([\wáéíóúñü ]{3,30}?)(?= a | en | con | y | para |$|,|\.)/i);
  const name = (m?.[1] ?? "contacto").trim();
  return { name: name.charAt(0).toUpperCase() + name.slice(1), slug: slugify(name) || "contacto" };
}

function mockPlan(request: string): Plan {
  const { name, slug } = pageFromRequest(request);
  return {
    summary: `Crear la página «${name}» con el estilo de la web y enlazarla desde el menú.`,
    tasks: [
      {
        title: `Crear la página «${name}» (${slug}.html)`,
        description: `Nueva página ${slug}.html con la misma cabecera, menú, estilos y pie que el resto.${
          slug === "contacto" ? " Debe incluir un formulario (nombre, email, mensaje) y los datos de la tienda." : ""
        }`,
        acceptance: [
          `Existe ${slug}.html con <title> y un único <h1>`,
          "Usa styles.css y la misma cabecera que el resto",
          slug === "contacto" ? "Formulario con nombre, email y mensaje, cada campo con su etiqueta" : "Contenido coherente con la petición",
        ],
      },
      {
        title: `Añadir «${name}» al menú de todas las páginas`,
        description: `Enlazar ${slug}.html desde el <nav> de index.html y sobre.html.`,
        acceptance: [`index.html enlaza ${slug}.html en el menú`, `sobre.html enlaza ${slug}.html en el menú`],
      },
    ],
  };
}

function mockDevelop(task: Task, files: SiteFile[]): DevResult {
  const slug = task.title.match(/\(([a-z0-9-]+)\.html\)/)?.[1];
  const name = task.title.match(/«([^»]+)»/)?.[1] ?? "Página";
  if (task.idx === 0 && slug) {
    const base = files.find((f) => f.path === "sobre.html")!.content;
    const navLinks = files
      .filter((f) => f.path.endsWith(".html"))
      .map((f) => f.path)
      .concat(`${slug}.html`);
    const firstTry = task.attempts === 0; // a propósito: el primer intento olvida una <label> para que Testing lo pille
    const form =
      slug === "contacto"
        ? `
      <form class="contact" action="#" method="post">
        <label for="nombre">Nombre</label>
        <input id="nombre" name="nombre" required />
        ${firstTry ? "" : '<label for="email">Email</label>'}
        <input id="email" name="email" type="email" required />
        <label for="mensaje">Mensaje</label>
        <textarea id="mensaje" name="mensaje" rows="5" required></textarea>
        <button class="button" type="submit">Enviar</button>
      </form>
      <p>Calle del Horno 12, Santander · 942 000 000</p>`
        : `<p>Contenido de ${name}.</p>`;
    let html = base
      .replace(/<title>[^<]*<\/title>/, `<title>${name} · Panadería Brisa</title>`)
      .replace(/<section class="page">[\s\S]*?<\/section>/, `<section class="page">\n      <h1>${name}</h1>${form}\n    </section>`)
      .replace(/<nav>[\s\S]*?<\/nav>/, `<nav>\n${navLinks.map((p) => `      <a href="${p}"${p === `${slug}.html` ? ' class="active"' : ""}>${labelFor(p, name)}</a>`).join("\n")}\n    </nav>`);
    const out: SiteFile[] = [{ path: `${slug}.html`, content: html }];
    if (slug === "contacto" && !files.find((f) => f.path === "styles.css")!.content.includes(".contact")) {
      out.push({
        path: "styles.css",
        content:
          files.find((f) => f.path === "styles.css")!.content +
          `.contact { display: grid; gap: 0.5rem; max-width: 480px; margin: 1.5rem 0; }\n.contact input, .contact textarea { padding: 0.6rem; border: 1px solid #d8c6a8; border-radius: 6px; font: inherit; }\n`,
      });
    }
    html = "";
    return { summary: `He creado ${slug}.html${firstTry ? "" : " y he añadido la etiqueta que faltaba"}.`, files: out };
  }
  // Tarea de menú: añadir el enlace en todas las páginas que no lo tengan
  const target = task.description.match(/([a-z0-9-]+\.html) desde/)?.[1] ?? `${slug}.html`;
  const out: SiteFile[] = [];
  for (const f of files.filter((x) => x.path.endsWith(".html") && x.path !== target)) {
    if (f.content.includes(`href="${target}"`)) continue;
    out.push({ path: f.path, content: f.content.replace(/\n\s*<\/nav>/, `\n      <a href="${target}">${name}</a>\n    </nav>`) });
  }
  return { summary: `He añadido ${target} al menú de ${out.map((f) => f.path).join(" y ") || "todas las páginas"}.`, files: out };
}

function labelFor(path: string, name: string) {
  if (path === "index.html") return "Inicio";
  if (path === "sobre.html") return "Sobre nosotros";
  return name;
}
