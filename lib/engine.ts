// Motor del equipo. Avanza la ejecución UN paso cada vez (planificar, desarrollar una tarea, probar una tarea…).
// Así cada llamada a la API dura poco (cabe en las funciones gratuitas de Vercel) y la pantalla
// puede mostrar el estado entre paso y paso. Un cerrojo en la base de datos evita pasos simultáneos.

import { randomUUID } from "crypto";
import { q } from "./db";
import { provider, providerLabel } from "./llm";
import { developTask, orchestratorFixTask, orchestratorPlan, testIntegration, testTask } from "./agents";
import { SITE_TEMPLATE } from "./site-template";
import {
  MAX_ATTEMPTS,
  type AgentName,
  type AgentState,
  type Run,
  type RunEvent,
  type RunState,
  type SiteFile,
  type Task,
} from "./types";

const MAX_FIX_TASKS = 2;
const MAX_ERRORS = 3;

// ───────────── lectura ─────────────

function toRun(r: Record<string, unknown>): Run {
  return {
    id: r.id as string,
    request: r.request as string,
    status: r.status as Run["status"],
    summary: (r.summary as string) ?? null,
    provider: r.provider as string,
    agents: r.agents as Run["agents"],
    created_at: new Date(r.created_at as string).toISOString(),
    updated_at: new Date(r.updated_at as string).toISOString(),
  };
}

function toTask(r: Record<string, unknown>): Task {
  return {
    id: r.id as string,
    run_id: r.run_id as string,
    idx: Number(r.idx),
    title: r.title as string,
    description: r.description as string,
    acceptance: r.acceptance as string[],
    status: r.status as Task["status"],
    attempts: Number(r.attempts),
    feedback: (r.feedback as string[]) ?? [],
  };
}

export async function listRuns(): Promise<Run[]> {
  const rows = await q("select * from runs order by created_at desc limit 30");
  return rows.map(toRun);
}

export async function getState(id: string): Promise<RunState | null> {
  const [run] = await q("select * from runs where id = $1", [id]);
  if (!run) return null;
  const [tasks, events, files] = await Promise.all([
    q("select * from tasks where run_id = $1 order by idx", [id]),
    q("select * from events where run_id = $1 order by id", [id]),
    q("select path, content from files where run_id = $1 order by path", [id]),
  ]);
  return {
    run: toRun(run),
    tasks: tasks.map(toTask),
    events: events.map((e) => ({ ...e, id: Number(e.id), created_at: new Date(e.created_at as string).toISOString() }) as RunEvent),
    files: files as unknown as SiteFile[],
  };
}

export async function getFile(id: string, path: string): Promise<SiteFile | null> {
  const [f] = await q("select path, content from files where run_id = $1 and path = $2", [id, path]);
  return (f as unknown as SiteFile) ?? null;
}

// ───────────── escritura ─────────────

async function log(run: string, agent: AgentName | "system", kind: RunEvent["kind"], message: string, detail?: string, taskId?: string) {
  await q("insert into events (run_id, agent, task_id, kind, message, detail) values ($1,$2,$3,$4,$5,$6)", [
    run,
    agent,
    taskId ?? null,
    kind,
    message,
    detail ?? null,
  ]);
}

async function setAgents(run: string, patch: Partial<Record<AgentName, AgentState>>) {
  await q("update runs set agents = agents || $2::jsonb, updated_at = now() where id = $1", [run, JSON.stringify(patch)]);
}

async function setTask(id: string, fields: Partial<Pick<Task, "status" | "attempts" | "feedback">> & { touched?: string[] }) {
  const sets: string[] = [];
  const vals: unknown[] = [id];
  for (const [k, v] of Object.entries(fields)) {
    vals.push(k === "feedback" || k === "touched" ? JSON.stringify(v) : v);
    sets.push(`${k} = $${vals.length}${k === "feedback" || k === "touched" ? "::jsonb" : ""}`);
  }
  if (sets.length) await q(`update tasks set ${sets.join(", ")} where id = $1`, vals);
}

async function saveFiles(run: string, files: SiteFile[]) {
  for (const f of files) {
    await q(
      "insert into files (run_id, path, content) values ($1,$2,$3) on conflict (run_id, path) do update set content = excluded.content",
      [run, f.path, f.content],
    );
  }
}

export async function createRun(request: string): Promise<string> {
  const id = randomUUID().slice(0, 8);
  const agents: Record<AgentName, AgentState> = {
    orchestrator: { status: "working", note: "Leyendo la petición" },
    develop: { status: "idle", note: "Esperando tareas" },
    testing: { status: "idle", note: "Esperando código que probar" },
  };
  await q("insert into runs (id, request, status, provider, agents) values ($1,$2,'planning',$3,$4::jsonb)", [
    id,
    request,
    providerLabel(provider()),
    JSON.stringify(agents),
  ]);
  await saveFiles(id, SITE_TEMPLATE);
  await log(id, "system", "info", "Petición recibida", request);
  return id;
}

// ───────────── un paso ─────────────

export async function step(id: string): Promise<{ busy?: boolean; finished?: boolean }> {
  // Cerrojo: solo un paso a la vez por ejecución
  const locked = await q(
    "update runs set locked_until = now() + interval '90 seconds' where id = $1 and status in ('planning','running') and (locked_until is null or locked_until < now()) returning id",
    [id],
  );
  if (!locked.length) {
    const [r] = await q("select status from runs where id = $1", [id]);
    return r && (r.status === "planning" || r.status === "running") ? { busy: true } : { finished: true };
  }
  try {
    await advance(id);
    await q("update runs set errors = 0 where id = $1", [id]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const [r] = await q<{ errors: number }>("update runs set errors = errors + 1 where id = $1 returning errors", [id]);
    await log(id, "system", "error", "Error al llamar a la IA, se reintenta", msg);
    if (Number(r?.errors) >= MAX_ERRORS) {
      await q("update runs set status = 'failed', summary = $2 where id = $1", [id, `Se ha parado tras ${MAX_ERRORS} errores seguidos: ${msg}`]);
      await setAgents(id, {
        orchestrator: { status: "done", note: "Ejecución detenida por errores" },
        develop: { status: "idle", note: "—" },
        testing: { status: "idle", note: "—" },
      });
    }
  } finally {
    await q("update runs set locked_until = null, updated_at = now() where id = $1", [id]);
  }
  const [r] = await q("select status from runs where id = $1", [id]);
  return { finished: r?.status === "done" || r?.status === "failed" };
}

async function advance(id: string) {
  const state = await getState(id);
  if (!state) throw new Error("Ejecución no encontrada");
  const { run, tasks, files } = state;

  // 1) El Orquestador planifica
  if (run.status === "planning") {
    await setAgents(id, { orchestrator: { status: "working", note: "Dividiendo la petición en tareas" } });
    const plan = await orchestratorPlan(run.request, files);
    for (const [i, t] of plan.tasks.entries()) {
      await q(
        "insert into tasks (id, run_id, idx, title, description, acceptance, status) values ($1,$2,$3,$4,$5,$6::jsonb,'pending')",
        [randomUUID().slice(0, 8), id, i, t.title, t.description, JSON.stringify(t.acceptance)],
      );
    }
    await log(
      id,
      "orchestrator",
      "plan",
      `Plan: ${plan.tasks.length} tarea${plan.tasks.length > 1 ? "s" : ""}. ${plan.summary}`,
      plan.tasks.map((t, i) => `${i + 1}. ${t.title}\n   Criterios: ${t.acceptance.join(" · ")}`).join("\n"),
    );
    await log(id, "orchestrator", "info", `Asigna la tarea 1 a Develop: ${plan.tasks[0].title}`);
    await q("update runs set status = 'running' where id = $1", [id]);
    await setAgents(id, {
      orchestrator: { status: "waiting", note: `Reparto hecho. Tarea 1 → Develop` },
      develop: { status: "working", note: `Tarea 1: ${plan.tasks[0].title}` },
    });
    return;
  }

  const current = tasks.find((t) => t.status !== "passed" && t.status !== "blocked");

  // 4) Todas cerradas: prueba de integración de la web completa
  if (!current) {
    await setAgents(id, { testing: { status: "working", note: "Prueba final de la web completa" } });
    const checks = testIntegration(files);
    const failed = checks.filter((c) => !c.passed);
    const blocked = tasks.filter((t) => t.status === "blocked");
    if (failed.length) {
      await log(id, "testing", "test_fail", `Prueba final: ${failed.length} fallo(s) en la web completa`, failed.map((f) => `✗ ${f.name}: ${f.detail}`).join("\n"));
      const fixes = tasks.filter((t) => t.title.startsWith("Corregir fallos de integración")).length;
      if (fixes >= MAX_FIX_TASKS) {
        await finish(id, "failed", "La web sigue teniendo fallos tras las correcciones. Revisa el registro.");
        return;
      }
      const fix = orchestratorFixTask(failed);
      await q(
        "insert into tasks (id, run_id, idx, title, description, acceptance, status) values ($1,$2,$3,$4,$5,$6::jsonb,'pending')",
        [randomUUID().slice(0, 8), id, tasks.length, fix.title, fix.description, JSON.stringify(fix.acceptance)],
      );
      await log(id, "orchestrator", "info", `Crea una tarea de corrección y se la asigna a Develop`);
      await setAgents(id, {
        orchestrator: { status: "waiting", note: "Tarea de corrección → Develop" },
        develop: { status: "working", note: "Corrigiendo fallos de integración" },
        testing: { status: "waiting", note: "Esperando la corrección" },
      });
      return;
    }
    await log(id, "testing", "test_pass", `Prueba final superada (${checks.length} comprobaciones)`, checks.map((c) => `✓ ${c.name}`).join("\n"));
    const done = tasks.filter((t) => t.status === "passed").length;
    await finish(
      id,
      blocked.length ? "failed" : "done",
      blocked.length
        ? `${done} de ${tasks.length} tareas superadas; ${blocked.length} bloqueada(s) tras ${MAX_ATTEMPTS} intentos.`
        : `Hecho: ${done} tarea${done > 1 ? "s" : ""} superada${done > 1 ? "s" : ""} y la web completa pasa todas las pruebas.`,
    );
    return;
  }

  const n = current.idx + 1;

  // 2) Develop programa la tarea (nueva o devuelta por Testing)
  if (current.status === "pending" || current.status === "rejected" || current.status === "developing") {
    const retry = current.status === "rejected";
    await setTask(current.id, { status: "developing" });
    await setAgents(id, {
      orchestrator: { status: "waiting", note: `Tarea ${n} en desarrollo` },
      develop: { status: "working", note: `${retry ? "Corrigiendo" : "Programando"} tarea ${n}: ${current.title}` },
      testing: { status: "waiting", note: `Esperando la tarea ${n}` },
    });
    const res = await developTask(current, files);
    await saveFiles(id, res.files);
    const touched = res.files.map((f) => f.path);
    await setTask(current.id, { status: "testing", touched });
    await log(id, "develop", "code", `Tarea ${n}${retry ? ` (intento ${current.attempts + 1})` : ""}: ${res.summary || "cambios hechos"}`, `Archivos: ${touched.join(", ")}`, current.id);
    await log(id, "orchestrator", "info", `Pasa la tarea ${n} a Testing`, undefined, current.id);
    await setAgents(id, {
      develop: { status: "waiting", note: `Tarea ${n} entregada a Testing` },
      testing: { status: "working", note: `Comprobando tarea ${n}: ${current.title}` },
    });
    return;
  }

  // 3) Testing comprueba la tarea
  if (current.status === "testing") {
    await setAgents(id, { testing: { status: "working", note: `Comprobando tarea ${n}: ${current.title}` } });
    const [row] = await q<{ touched: string[] }>("select touched from tasks where id = $1", [current.id]);
    const result = await testTask(current, files, row?.touched ?? []);
    const detail = result.checks.map((c) => `${c.passed ? "✓" : "✗"} ${c.name}${!c.passed && c.detail ? ` — ${c.detail}` : ""}`).join("\n");
    if (result.passed) {
      await setTask(current.id, { status: "passed", feedback: [] });
      await log(id, "testing", "test_pass", `Tarea ${n} superada`, detail, current.id);
      const next = tasks.find((t) => t.idx > current.idx && t.status === "pending");
      if (next) await log(id, "orchestrator", "info", `Asigna la tarea ${next.idx + 1} a Develop: ${next.title}`, undefined, next.id);
      await setAgents(id, {
        orchestrator: { status: "waiting", note: next ? `Tarea ${next.idx + 1} → Develop` : "Todas las tareas superadas" },
        develop: next ? { status: "working", note: `Tarea ${next.idx + 1}: ${next.title}` } : { status: "idle", note: "Sin tareas pendientes" },
        testing: next ? { status: "waiting", note: `Esperando la tarea ${next.idx + 1}` } : { status: "working", note: "Preparando la prueba final" },
      });
      return;
    }
    const attempts = current.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await setTask(current.id, { status: "blocked", attempts, feedback: result.issues });
      await log(id, "testing", "error", `Tarea ${n} bloqueada: no pasa tras ${MAX_ATTEMPTS} intentos`, detail, current.id);
    } else {
      await setTask(current.id, { status: "rejected", attempts, feedback: result.issues });
      await log(id, "testing", "test_fail", `Tarea ${n}: ${result.issues.length} fallo(s), vuelve a Develop`, result.issues.map((i) => `✗ ${i}`).join("\n"), current.id);
    }
    await setAgents(id, {
      orchestrator: { status: "waiting", note: attempts >= MAX_ATTEMPTS ? `Tarea ${n} bloqueada, sigue con la siguiente` : `Tarea ${n} devuelta a Develop` },
      develop: attempts >= MAX_ATTEMPTS ? { status: "idle", note: "—" } : { status: "working", note: `Corrigiendo tarea ${n} (intento ${attempts + 1})` },
      testing: { status: "waiting", note: attempts >= MAX_ATTEMPTS ? "—" : `Esperando la corrección de la tarea ${n}` },
    });
  }
}

async function finish(id: string, status: "done" | "failed", summary: string) {
  await q("update runs set status = $2, summary = $3 where id = $1", [id, status, summary]);
  await log(id, "orchestrator", "done", summary);
  await setAgents(id, {
    orchestrator: { status: "done", note: summary },
    develop: { status: "done", note: "Trabajo entregado" },
    testing: { status: "done", note: status === "done" ? "Todo pasa" : "Quedan fallos" },
  });
}
