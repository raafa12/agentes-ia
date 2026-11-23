// Cliente de IA mínimo, sin SDKs, con proveedores gratuitos.
// - Google Gemini (recomendado, plan gratuito de AI Studio): GEMINI_API_KEY
// - Groq (gpt-oss-120b, plan gratuito): GROQ_API_KEY
// - "mock": sin clave; los agentes usan reglas simples para poder probar la app sin coste.

export type Provider = "groq" | "gemini" | "mock";

export function provider(): Provider {
  const forced = process.env.LLM_PROVIDER as Provider | undefined;
  if (forced === "groq" || forced === "gemini" || forced === "mock") return forced;
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.GROQ_API_KEY) return "groq";
  return "mock";
}

export function providerLabel(p: Provider = provider()): string {
  if (p === "groq") return `Groq · ${groqModel()}`;
  if (p === "gemini") return `Gemini · ${geminiModel()}`;
  return "Modo simulado (sin IA)";
}

const groqModel = () => process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const geminiModel = () => process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Extrae el primer objeto JSON de la respuesta (por si el modelo añade texto o ```json).
export function parseJson<T>(text: string): T {
  const clean = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(clean) as T;
  } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1)) as T;
    throw new Error("La IA no devolvió JSON válido");
  }
}

async function callGroq(system: string, user: string): Promise<string> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: groqModel(),
      temperature: 0.2,
      // El plan gratuito de Groq limita los tokens por minuto: respuesta acotada
      max_tokens: 4096,
      ...(groqModel().startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text(), res.headers.get("retry-after"));
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(system: string, user: string): Promise<string> {
  const model = geminiModel();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        maxOutputTokens: 16384,
        // Los modelos Gemini 3 piensan antes de responder; con nivel bajo cada paso tarda menos
        ...(model.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "low" } } : {}),
      },
    }),
  });
  if (!res.ok) throw new HttpError(res.status, await res.text(), res.headers.get("retry-after"));
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
}

class HttpError extends Error {
  retryAfter: number;
  constructor(public status: number, body: string, retryAfter: string | null = null) {
    super(`HTTP ${status}: ${body.slice(0, 300)}`);
    this.retryAfter = Number(retryAfter) || 0;
  }
}

// Llama al modelo y devuelve JSON. Reintenta en límites de uso (429) y errores temporales.
export async function askJson<T>(system: string, user: string): Promise<T> {
  const p = provider();
  if (p === "mock") throw new Error("askJson no se usa en modo simulado");
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = p === "groq" ? await callGroq(system, user) : await callGemini(system, user);
      return parseJson<T>(text);
    } catch (e) {
      lastErr = e;
      const retriable = e instanceof HttpError ? e.status === 429 || e.status >= 500 : true;
      if (!retriable) break;
      // Respeta el "retry-after" del proveedor, sin pasarse del tiempo de una función de Vercel
      const wait = e instanceof HttpError && e.retryAfter ? e.retryAfter * 1000 : 2000 * (attempt + 1);
      await sleep(Math.min(wait, 15000));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
