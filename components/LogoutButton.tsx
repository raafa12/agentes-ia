"use client";

export default function LogoutButton() {
  return (
    <button
      className="link-btn"
      onClick={async () => {
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
      }}
    >
      Salir
    </button>
  );
}
