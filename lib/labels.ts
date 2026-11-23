import type { AgentName, AgentStatus, RunStatus, TaskStatus } from "./types";

export const AGENTS: { key: AgentName; name: string; role: string; initial: string }[] = [
  { key: "orchestrator", name: "Orquestador", role: "Divide la petición en tareas y las reparte", initial: "O" },
  { key: "develop", name: "Develop", role: "Programa cada tarea", initial: "D" },
  { key: "testing", name: "Testing", role: "Comprueba el trabajo y devuelve los fallos", initial: "T" },
];

export const AGENT_STATUS: Record<AgentStatus, string> = {
  idle: "Libre",
  working: "Trabajando",
  waiting: "Esperando",
  done: "Terminado",
};

export const TASK_STATUS: Record<TaskStatus, string> = {
  pending: "Pendiente",
  developing: "En desarrollo",
  testing: "En pruebas",
  rejected: "Devuelta a Develop",
  passed: "Superada",
  blocked: "Bloqueada",
};

export const RUN_STATUS: Record<RunStatus, string> = {
  planning: "Planificando",
  running: "En marcha",
  done: "Terminada",
  failed: "Con fallos",
};

export const AGENT_LABEL: Record<AgentName | "system", string> = {
  orchestrator: "Orquestador",
  develop: "Develop",
  testing: "Testing",
  system: "Sistema",
};

export const EXAMPLES = [
  "Añade una página de contacto a esta web",
  "Añade una página de carta con los productos y sus precios",
  "Crea una página de preguntas frecuentes con 5 preguntas",
  "Añade una página de horarios y ubicación de la tienda",
];
