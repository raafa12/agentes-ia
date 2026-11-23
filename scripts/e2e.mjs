// Prueba de punta a punta contra una app en marcha: crea una ejecución, la avanza paso a paso
// como hace la interfaz y comprueba que termina con todas las tareas superadas.
// Uso: BASE_URL=http://localhost:3000 [DEMO_USER=… DEMO_PASSWORD=…] npm run test:e2e

const BASE = process.env.BASE_URL || "http://localhost:3000";
const request = process.argv[2] || "Añade una página de contacto a esta web";
let cookie = "";

async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers || {}) } });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(body)}`);
  return body;
}

if (process.env.DEMO_USER) {
  await api("/api/login", { method: "POST", body: JSON.stringify({ user: process.env.DEMO_USER, password: process.env.DEMO_PASSWORD }) });
  console.log("✓ login");
}

const { id } = await api("/api/runs", { method: "POST", body: JSON.stringify({ request }) });
console.log(`✓ ejecución ${id}: «${request}»`);

let state;
let seen = 0;
for (let i = 0; i < 60; i++) {
  const r = await api(`/api/runs/${id}/step`, { method: "POST" });
  state = await api(`/api/runs/${id}`);
  for (const e of state.events.slice(seen)) console.log(`  [${e.agent.padEnd(12)}] ${e.message}`);
  seen = state.events.length;
  if (r.finished || state.run.status === "done" || state.run.status === "failed") break;
  if (r.busy) await new Promise((res) => setTimeout(res, 1500));
}

const { run, tasks, files } = state;
console.log(`\nEstado: ${run.status} · ${run.summary}`);
for (const t of tasks) console.log(`  ${t.status === "passed" ? "✓" : "✗"} ${t.idx + 1}. ${t.title} (${t.status}, devuelta ${t.attempts} vez/veces)`);
console.log(`Archivos: ${files.map((f) => f.path).join(", ")}`);

const page = await fetch(`${BASE}/site/${id}/index.html`);
const ok = run.status === "done" && tasks.every((t) => t.status === "passed") && page.ok;
console.log(ok ? "\n✓ PRUEBA SUPERADA" : "\n✗ PRUEBA FALLIDA");
process.exit(ok ? 0 : 1);
