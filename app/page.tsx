import Link from "next/link";
import { listRuns } from "@/lib/engine";
import { RUN_STATUS } from "@/lib/labels";
import NewRunForm from "@/components/NewRunForm";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  await requireUser();
  const runs = await listRuns();
  return (
    <>
      <section className="hero">
        <h1>Pide un cambio y mira cómo lo resuelven tres agentes</h1>
        <p className="lede">
          Trabajan sobre una web de ejemplo (una panadería). El <b className="t-orchestrator">Orquestador</b> divide la petición en
          tareas, <b className="t-develop">Develop</b> las programa y <b className="t-testing">Testing</b> las comprueba y devuelve lo
          que falla hasta que todo pasa.
        </p>
        <NewRunForm />
      </section>

      <section className="how">
        <ol>
          <li>
            <span className="step-n c-orchestrator">1</span>
            <div>
              <b>Planificar</b>
              <p>El Orquestador lee la petición y la web, y crea de 1 a 4 tareas con criterios de aceptación.</p>
            </div>
          </li>
          <li>
            <span className="step-n c-develop">2</span>
            <div>
              <b>Desarrollar</b>
              <p>Develop escribe el código de una tarea cada vez y entrega los archivos.</p>
            </div>
          </li>
          <li>
            <span className="step-n c-testing">3</span>
            <div>
              <b>Probar</b>
              <p>Testing pasa comprobaciones automáticas y revisa los criterios. Si algo falla, la tarea vuelve a Develop (hasta 3 intentos).</p>
            </div>
          </li>
          <li>
            <span className="step-n c-ink">4</span>
            <div>
              <b>Prueba final</b>
              <p>Con todas las tareas superadas, Testing revisa la web completa. Si falla, el Orquestador crea una tarea de corrección.</p>
            </div>
          </li>
        </ol>
      </section>

      <section>
        <h2 className="section-title">Ejecuciones recientes</h2>
        {runs.length === 0 ? (
          <p className="muted">Todavía no hay ninguna. Prueba con uno de los ejemplos de arriba.</p>
        ) : (
          <ul className="runs">
            {runs.map((r) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`}>
                  <span className={`pill run-${r.status}`}>{RUN_STATUS[r.status]}</span>
                  <span className="runs-req">{r.request}</span>
                  <time className="muted" dateTime={r.created_at}>
                    {new Date(r.created_at).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Madrid" })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
