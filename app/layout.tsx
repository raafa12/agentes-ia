import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { authEnabled } from "@/lib/auth";
import { providerLabel } from "@/lib/llm";
import LogoutButton from "@/components/LogoutButton";

export const metadata: Metadata = {
  title: "Equipo de agentes",
  description: "Tres agentes de IA (Orquestador, Develop y Testing) que trabajan juntos sobre una web",
  icons: { icon: "/icon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-dots" aria-hidden>
              <i className="c-orchestrator" />
              <i className="c-develop" />
              <i className="c-testing" />
            </span>
            Equipo de agentes
          </Link>
          <div className="topbar-right">
            <span className="provider" title="Modelo que usan los agentes">{providerLabel()}</span>
            {authEnabled() && <LogoutButton />}
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
