// Tipos compartidos entre el motor, la API y la interfaz.

export type AgentName = "orchestrator" | "develop" | "testing";

export type AgentStatus = "idle" | "working" | "waiting" | "done";

export interface AgentState {
  status: AgentStatus;
  note: string; // qué está haciendo ahora mismo, en una frase
}

export type RunStatus = "planning" | "running" | "done" | "failed";

export type TaskStatus =
  | "pending" // creada por el Orquestador, sin empezar
  | "developing" // Develop trabajando en ella
  | "testing" // Testing comprobándola
  | "rejected" // Testing ha encontrado fallos; vuelve a Develop
  | "passed" // todo bien
  | "blocked"; // no pasó tras el máximo de intentos

export interface Run {
  id: string;
  request: string;
  status: RunStatus;
  summary: string | null;
  provider: string;
  agents: Record<AgentName, AgentState>;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  run_id: string;
  idx: number;
  title: string;
  description: string;
  acceptance: string[];
  status: TaskStatus;
  attempts: number;
  feedback: string[]; // últimos fallos devueltos por Testing
}

export interface RunEvent {
  id: number;
  run_id: string;
  agent: AgentName | "system";
  task_id: string | null;
  kind: "info" | "plan" | "code" | "test_pass" | "test_fail" | "error" | "done";
  message: string;
  detail: string | null;
  created_at: string;
}

export interface SiteFile {
  path: string;
  content: string;
}

export interface RunState {
  run: Run;
  tasks: Task[];
  events: RunEvent[];
  files: SiteFile[];
}

export const MAX_ATTEMPTS = 3;
