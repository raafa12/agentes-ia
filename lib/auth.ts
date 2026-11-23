// Login de prueba muy simple: usuario y contraseña en variables de entorno, cookie firmada con HMAC.
// Usa Web Crypto para funcionar también en el middleware (Edge). Si no hay DEMO_USER/DEMO_PASSWORD, no se pide login.

export const COOKIE = "agentes_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 días

export const authEnabled = () => Boolean(process.env.DEMO_USER && process.env.DEMO_PASSWORD);

const enc = new TextEncoder();

async function hmac(data: string) {
  const secret = process.env.AUTH_SECRET || `${process.env.DEMO_USER}:${process.env.DEMO_PASSWORD}`;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function createSession(user: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE;
  const payload = `${encodeURIComponent(user)}.${exp}`;
  return { value: `${payload}.${await hmac(payload)}`, maxAge: MAX_AGE };
}

export async function verifySession(value: string | undefined) {
  if (!value) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [user, exp, sig] = parts;
  if (Number(exp) < Date.now() / 1000) return false;
  if (decodeURIComponent(user) !== process.env.DEMO_USER) return false;
  return safeEqual(sig, await hmac(`${user}.${exp}`));
}

export function checkCredentials(user: string, password: string) {
  return safeEqual(user, process.env.DEMO_USER ?? "") && safeEqual(password, process.env.DEMO_PASSWORD ?? "");
}
