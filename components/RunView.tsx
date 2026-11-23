"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AGENTS, AGENT_LABEL, AGENT_STATUS, RUN_STATUS, TASK_STATUS } from "@/lib/labels";
import { SITE_TEMPLATE } from "@/lib/site-template";
import { MAX_ATTEMPTS, type RunState, type Task } from "@/lib/types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const active = (s: RunState) => s.run.status === "planning" || s.run.status === "running";

export default function RunView({ initial }: { initial: RunState }) {
  const [state, setState] = useState(initial);
  const [netError, setNetError] = useState("");
  const [tab, setTab] = useState("preview");
  const logRef = useRef<HTMLOListElement>(null);
  const id = initial.run.id;

  // La página "empuja" la ejecución: pide un paso, recarga el estado y repite hasta que termina.
  // Si cierras la pestaña se queda en pausa y sigue cuando vuelves a abrirla.
  useEffect(() => {
    let alive = true;
    const mock = initial.run.provider.includes("simulado");
    (async () => {
      let s = initial;
      let fails = 0;
      while (alive && active(s)) {
        try {
          const r = await fetch(`/api/runs/${id}/step`, { method: "POST" });
          if (r.status === 401) {
            window.location.href = `/login?next=/runs/${id}`;
            return;
          }
          const res = r.ok ? await r.json() : { busy: true };
          const g = await fetch(`/api/runs/${id}`, { cache: "no-store" });
          if (!g.ok) throw new Error(`HTTP ${g.status}`);
          s = await g.json();
          if (!alive) return;
          setState(s);
          setNetError("");
          fails = 0;
          // En modo simulado los pasos son instantáneos: una pausa para poder seguirlos con la vista
          await sleep(res.busy ? 1500 : mock ? 1100 : 250);
        } catch (e) {
          fails++;
          setNetError(`Se ha perdido la conexión (${e instanceof Error ? e.message : e}). Reintentando…`);
          await sleep(Math.min(10000, 1500 * fails));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id, initial]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [state.events.length]);

  const { run, tasks, events, files } = state;
  const passed = tasks.filter((t) => t.status === "passed").length;
  const version = events.filter((e) => e.kind === "code").length;
  const changes = useMemo(() => {
    const base = new Map(SITE_TEMPLATE.map((f) => [f.path, f.content]));
    return new Map(files.map((f) => [f.path, !base.has(f.path) ? "nuevo" : base.get(f.path) !== f.content ? "modificado" : ""]));
  }, [files]);
  const file = files.find((f) => f.path === tab);

  return (
    <div className="run">
      <Link href="/" className="back">
        ← Nueva petición
      </Link>
      <header className="run-head">
        <div>
          <p className="eyebrow">Petición</p>
          <h1>{run.request}</h1>
        </div>
        <div className="run-meta">
          <span className={`pill run-${run.status}`}>{RUN_STATUS[run.status]}</span>
          {tasks.length > 0 && (
            <span className="muted">
              {passed}/{tasks.length} tareas superadas
            </span>
          )}
        </div>
      </header>
      {run.summary && <p className={`summary run-${run.status}`}>{run.summary}</p>}
      {netError && <p className="error">{netError}</p>}

      {/* Los tres agentes y qué hace cada uno ahora mismo */}
      <section className="agents" aria-label="Agentes">
        {AGENTS.map((a, i) => {
          const st = run.agents?.[a.key] ?? { status: "idle" as const, note: "—" };
          return (
            <div key={a.key} className="agent-slot">
              <article className={`agent a-${a.key} s-${st.status}`}>
                <div className="agent-top">
                  <span className={`avatar c-${a.key}`}>{a.initial}</span>
                  <div>
                    <h2>{a.name}</h2>
                    <p className="muted small">{a.role}</p>
                  </div>
                  <span className={`status s-${st.status}`}>
                    <i />
                    {AGENT_STATUS[st.status]}
                  </span>
                </div>
                <p className="agent-note">{st.note}</p>
              </article>
              {i < AGENTS.length - 1 && <span className="flow-arrow" aria-hidden>{i === 0 ? "→" : "⇄"}</span>}
            </div>
          );
        })}
      </section>

      <div className="columns">
        {/* Tablero de tareas */}
        <section className="panel">
          <h2 className="panel-title">Tareas</h2>
          {tasks.length === 0 ? (
            <p className="muted">El Orquestador está preparando el plan…</p>
          ) : (
            <ol className="tasks">
              {tasks.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </ol>
          )}
        </section>

        {/* Registro de lo que ha hecho cada agente */}
        <section className="panel">
          <h2 className="panel-title">Registro de actividad</h2>
          <ol className="log" ref={logRef}>
            {events.map((e) => (
              <li key={e.id} className={`ev k-${e.kind}`}>
                <span className={`ev-agent t-${e.agent}`}>{AGENT_LABEL[e.agent]}</span>
                <time className="muted">{new Date(e.created_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time>
                <p>{e.message}</p>
                {e.detail && (
                  <details open={e.kind === "test_fail" || e.kind === "plan"}>
                    <summary>Detalle</summary>
                    <pre>{e.detail}</pre>
                  </details>
                )}
              </li>
            ))}
            {active(state) && <li className="ev typing">…</li>}
          </ol>
        </section>
      </div>

      {/* Resultado: la web y sus archivos */}
      <section className="panel result">
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={tab === "preview"} className={tab === "preview" ? "on" : ""} onClick={() => setTab("preview")}>
            Vista previa
          </button>
          {files.map((f) => (
            <button role="tab" key={f.path} aria-selected={tab === f.path} className={tab === f.path ? "on" : ""} onClick={() => setTab(f.path)}>
              {f.path}
              {changes.get(f.path) && <span className={`tag ${changes.get(f.path)}`}>{changes.get(f.path)}</span>}
            </button>
          ))}
          <a className="open-tab" href={`/site/${id}/index.html`} target="_blank" rel="noreferrer">
            Abrir en otra pestaña ↗
          </a>
        </div>
        {tab === "preview" ? (
          <iframe key={version} className="preview" src={`/site/${id}/index.html?v=${version}`} title="Vista previa de la web" sandbox="allow-scripts allow-forms" />
        ) : (
          <pre className="code">{file?.content}</pre>
        )}
      </section>
    </div>
  );
}

function TaskCard({ task: t }: { task: Task }) {
  const stage = { pending: 0, developing: 1, rejected: 1, testing: 2, passed: 3, blocked: 3 }[t.status];
  return (
    <li className={`task ts-${t.status}`}>
      <div className="task-top">
        <span className="task-n">{t.idx + 1}</span>
        <h3>{t.title}</h3>
        <span className={`badge ts-${t.status}`}>{TASK_STATUS[t.status]}</span>
      </div>
      <div className="track" aria-hidden>
        <span className={stage >= 1 ? "on c-develop" : ""}>Develop</span>
        <span className={stage >= 2 ? "on c-testing" : ""}>Testing</span>
        <span className={t.status === "passed" ? "on c-ok" : t.status === "blocked" ? "on c-bad" : ""}>{t.status === "blocked" ? "Bloqueada" : "Superada"}</span>
      </div>
      <p className="small muted">
        {t.attempts > 0 ? `Devuelta ${t.attempts} ${t.attempts === 1 ? "vez" : "veces"} · ` : ""}
        Intento {Math.min(t.attempts + 1, MAX_ATTEMPTS)} de {MAX_ATTEMPTS}
      </p>
      {t.feedback.length > 0 && (
        <div className="feedback">
          <b>Fallos que Testing ha devuelto:</b>
          <ul>
            {t.feedback.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}
      <details>
        <summary>Criterios de aceptación</summary>
        <p className="small">{t.description}</p>
        <ul className="criteria">
          {t.acceptance.map((a, i) => (
            <li key={i}>{a}</li>
          ))}
        </ul>
      </details>
    </li>
  );
}
