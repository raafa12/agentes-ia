"use client";

import { useState } from "react";

export default function Login() {
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ user, password }) });
    if (res.ok) {
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
    } else {
      setError((await res.json().catch(() => ({}))).error || "No se ha podido entrar");
      setBusy(false);
    }
  }

  return (
    <form className="login" onSubmit={submit}>
      <h1>Entrar</h1>
      <p className="muted">Usa el usuario de prueba que viene con la entrega.</p>
      <label htmlFor="user">Usuario</label>
      <input id="user" value={user} onChange={(e) => setUser(e.target.value)} autoComplete="username" required />
      <label htmlFor="password">Contraseña</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
      {error && <p className="error">{error}</p>}
      <button className="btn" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
