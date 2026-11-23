"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EXAMPLES } from "@/lib/labels";

export default function NewRunForm() {
  const router = useRouter();
  const [text, setText] = useState(EXAMPLES[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ request: text }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se ha podido crear");
      router.push(`/runs/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <form className="new-run" onSubmit={submit}>
      <label htmlFor="request" className="sr-only">
        Petición
      </label>
      <textarea id="request" value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={500} placeholder="Por ejemplo: añade una página de contacto a esta web" />
      <div className="new-run-bar">
        <div className="chips">
          {EXAMPLES.map((ex) => (
            <button type="button" key={ex} className={`chip${ex === text ? " on" : ""}`} onClick={() => setText(ex)}>
              {ex}
            </button>
          ))}
        </div>
        <button className="btn" disabled={busy || text.trim().length < 8}>
          {busy ? "Creando…" : "Enviar al equipo"}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </form>
  );
}
