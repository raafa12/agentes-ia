# Equipo de agentes

Tres agentes de IA que trabajan juntos sobre una web de ejemplo (una panadería):

| Agente | Qué hace |
| --- | --- |
| **Orquestador** | Recibe la petición («añade una página de contacto a esta web»), la divide en 1-4 tareas con criterios de aceptación y se las reparte a los otros dos. Al final, si la prueba de integración falla, crea una tarea de corrección. |
| **Develop** | Programa una tarea cada vez. Devuelve los archivos completos que crea o modifica. |
| **Testing** | Comprueba lo que ha hecho Develop. Si algo falla, devuelve la lista de fallos y la tarea vuelve a Develop, hasta que pasa (máximo 3 intentos). Cuando todas pasan, prueba la web completa. |

En pantalla se ve en todo momento qué hace cada agente (Trabajando / Esperando / Libre / Terminado y una frase con lo que está haciendo), en qué estado está cada tarea (Pendiente → En desarrollo → En pruebas → Devuelta / Superada / Bloqueada), el registro de lo que ha pasado y una vista previa de la web resultante con sus archivos.

**Stack:** Next.js 15 (App Router) · Postgres gratuito (Neon o Supabase) · Gemini (plan gratuito de Google AI Studio) o Groq (plan gratuito) · Vercel (plan Hobby).

## Cómo funciona

```
Navegador ──POST /api/runs──────────▶ crea la ejecución (copia la web de ejemplo en la BD)
          ──POST /api/runs/:id/step─▶ avanza UN paso de la máquina de estados ─┐
          ◀─GET  /api/runs/:id──────  estado: agentes, tareas, registro, archivos │
          └──── repite hasta que la ejecución termina ◀──────────────────────────┘
```

- **Un paso = una llamada a la IA.** Cada petición a `/step` hace solo una cosa (planificar, desarrollar una tarea, probar una tarea o la prueba final), así que cabe en los 60 s de una función gratuita de Vercel y la pantalla se actualiza entre paso y paso.
- **Todo el estado vive en Postgres** (`runs`, `tasks`, `events`, `files`). Un cerrojo en la fila de la ejecución (`locked_until`) impide que dos pestañas avancen la misma ejecución a la vez. Si cierras la pestaña, la ejecución se queda en pausa y sigue al volver a abrirla.
- **Testing no se fía solo de la IA.** Primero pasa comprobaciones automáticas deterministas (`lib/checks.ts`): HTML válido (doctype, `lang`, `title`, viewport, un único `h1`, etiquetas equilibradas), enlaces rotos, campos de formulario sin `<label>`, menú completo en las páginas tocadas y CSS bien formado. Después la IA revisa los criterios de aceptación de la tarea. Si falla cualquiera de las dos, la tarea vuelve a Develop con los fallos concretos.
- **Prueba final de integración** sobre la web entera. Si falla, el Orquestador crea una tarea de corrección (máximo 2).
- **Vista previa aislada.** La web generada se sirve en `/site/:id/…` con la cabecera `Content-Security-Policy: sandbox`, así su JavaScript no puede tocar la app ni sus cookies.
- **Modo simulado.** Sin clave de IA, los agentes siguen reglas fijas (Develop olvida a propósito una `<label>` en el primer intento, para que se vea el bucle Testing → Develop). Sirve para probar el flujo sin gastar cuota.

### Archivos clave

| Archivo | Contenido |
| --- | --- |
| `lib/agents.ts` | Los tres agentes: prompts, validación de lo que devuelve la IA y el modo simulado |
| `lib/engine.ts` | Máquina de estados, cerrojo, reparto de tareas y estado de cada agente |
| `lib/checks.ts` | Comprobaciones automáticas de Testing |
| `lib/llm.ts` | Cliente mínimo de Gemini y Groq (sin SDK), salida JSON y reintentos ante límites de uso |
| `lib/db.ts` | Postgres: `postgres.js` con `DATABASE_URL`; PGlite (Postgres en WebAssembly) en local si no hay `DATABASE_URL` |
| `components/RunView.tsx` | Pantalla de la ejecución: agentes, tareas, registro y vista previa |
| `middleware.ts`, `lib/auth.ts` | Login con el usuario de prueba (cookie firmada con HMAC) |

## Ejecutar en local

```bash
npm install
cp .env.example .env.local     # opcional: pon GEMINI_API_KEY para usar IA de verdad
npm run dev                     # http://localhost:3000
```

Sin `DATABASE_URL` usa PGlite (se guarda en `./.pglite`), así que no hace falta instalar Postgres. Sin clave de IA arranca en modo simulado.

Prueba de punta a punta (con la app en marcha):

```bash
BASE_URL=http://localhost:3000 npm run test:e2e
# con login: DEMO_USER=… DEMO_PASSWORD=… BASE_URL=… npm run test:e2e
```

## Desplegar en Vercel (todo gratis)

1. Importa el repositorio en Vercel (plan Hobby).
2. **Base de datos:** en el proyecto de Vercel, *Storage → Create → Neon (Postgres)* y conéctala; Vercel añade `DATABASE_URL` solo. También vale la cadena de conexión de Supabase (*Connect → Transaction pooler*, puerto 6543). Las tablas se crean solas en la primera petición.
3. **IA:** crea una clave gratuita en [Google AI Studio](https://aistudio.google.com/apikey) y añádela como `GEMINI_API_KEY`. (Alternativa: `GROQ_API_KEY` de [console.groq.com](https://console.groq.com/keys).)
4. **Usuario de prueba:** `DEMO_USER`, `DEMO_PASSWORD` y `AUTH_SECRET` (una cadena aleatoria larga). Si se dejan vacíos, la app no pide login.
5. Redeploy.

Variables de entorno: ver `.env.example`. **Ninguna clave está en el repositorio**: `.env*` está en `.gitignore` y todas se configuran en Vercel.

Para proteger la cuota gratuita, la app limita a 15 ejecuciones nuevas por hora, cada tarea a 3 intentos y cada ejecución a 2 tareas de corrección.

## Cómo he usado Claude Code

Todo el proyecto se ha programado con Claude Code, trabajando por fases y revisando cada una antes de seguir:

1. **Diseño primero.** Le describí el enunciado y le pedí una arquitectura que cupiera en planes gratuitos. De ahí salieron las dos decisiones importantes: avanzar la ejecución por pasos cortos (para no chocar con el límite de tiempo de las funciones de Vercel) y guardar todo el estado en Postgres para que la pantalla solo tenga que leerlo.
2. **De dentro hacia fuera.** Tipos → base de datos → cliente de IA → agentes → motor → API → interfaz. Cada capa se comprobaba con `tsc --noEmit` antes de pasar a la siguiente.
3. **Testing que no depende solo del modelo.** Le pedí que las comprobaciones de Testing fueran deterministas siempre que se pudiera, y la IA solo para los criterios de aceptación; así el bucle Develop ⇄ Testing tiene fallos reales y reproducibles.
4. **Modo simulado para iterar sin coste.** Con él probé el flujo completo (incluido el reintento) sin gastar cuota, con PGlite en lugar de una base de datos externa.
5. **Verificación.** Claude Code escribió `scripts/e2e.mjs`, levantó la app en modo producción (`next build && next start`) con el login activado, pasó la prueba de punta a punta y sacó capturas con Playwright para revisar la interfaz en escritorio y móvil. Con esas capturas corregimos detalles (colores del progreso de cada tarea, el scroll del registro).
6. **Consultas de documentación.** Antes de elegir modelos le pedí que comprobara los límites actuales de los planes gratuitos de Groq y Gemini; por eso el cliente respeta `retry-after` y acota los tokens de respuesta.

Mi papel fue decidir el alcance, revisar cada propuesta, probar la app y pedir cambios cuando algo no me convencía.
