// Acceso a Postgres.
// - En Vercel: DATABASE_URL (Neon o Supabase, plan gratuito) con postgres.js.
// - En local sin DATABASE_URL: PGlite (Postgres en WebAssembly guardado en ./.pglite), sin instalar nada.

type Row = Record<string, unknown>;
type QueryFn = <T extends Row = Row>(text: string, params?: unknown[]) => Promise<T[]>;

const SCHEMA = `
create table if not exists runs (
  id text primary key,
  request text not null,
  status text not null,
  summary text,
  provider text not null,
  agents jsonb not null,
  locked_until timestamptz,
  errors int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists tasks (
  id text primary key,
  run_id text not null references runs(id) on delete cascade,
  idx int not null,
  title text not null,
  description text not null,
  acceptance jsonb not null,
  status text not null,
  attempts int not null default 0,
  feedback jsonb not null default '[]'::jsonb,
  touched jsonb not null default '[]'::jsonb
);
create index if not exists tasks_run_idx on tasks(run_id, idx);
create table if not exists events (
  id bigserial primary key,
  run_id text not null references runs(id) on delete cascade,
  agent text not null,
  task_id text,
  kind text not null,
  message text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists events_run_idx on events(run_id, id);
create table if not exists files (
  run_id text not null references runs(id) on delete cascade,
  path text not null,
  content text not null,
  primary key (run_id, path)
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __agentesDb: Promise<QueryFn> | undefined;
}

async function connect(): Promise<QueryFn> {
  const url = process.env.DATABASE_URL;
  let query: QueryFn;
  if (url) {
    const postgres = (await import("postgres")).default;
    const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
    // Los parámetros JSON ya van como texto (JSON.stringify): que postgres.js no los vuelva a codificar
    const asText = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x));
    const sql = postgres(url, {
      ssl: local ? false : "require",
      max: 1,
      prepare: false,
      idle_timeout: 20,
      types: {
        jsonbText: { to: 3802, from: [], serialize: asText, parse: (x: string) => x },
        jsonText: { to: 114, from: [], serialize: asText, parse: (x: string) => x },
      },
    });
    query = async (text, params = []) => (await sql.unsafe(text, params as never[])) as never;
    await sql.unsafe(SCHEMA);
  } else {
    if (process.env.VERCEL) throw new Error("Falta DATABASE_URL: conecta una base de datos Postgres gratuita (Neon o Supabase) en Vercel.");
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite(process.env.PGLITE_DIR ?? "./.pglite");
    await db.exec(SCHEMA);
    query = async (text, params = []) => (await db.query(text, params)).rows as never;
  }
  return query;
}

export function db(): Promise<QueryFn> {
  if (!globalThis.__agentesDb) {
    globalThis.__agentesDb = connect().catch((e) => {
      globalThis.__agentesDb = undefined;
      throw e;
    });
  }
  return globalThis.__agentesDb;
}

export async function q<T extends Row = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  const query = await db();
  return query<T>(text, params);
}
