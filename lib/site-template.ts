import type { SiteFile } from "./types";

// Web de ejemplo sobre la que trabajan los agentes. Cada ejecución parte de una copia limpia.
const nav = (active: "inicio" | "sobre") => `<header class="top">
    <a class="brand" href="index.html">Panadería Brisa</a>
    <nav>
      <a href="index.html"${active === "inicio" ? ' class="active"' : ""}>Inicio</a>
      <a href="sobre.html"${active === "sobre" ? ' class="active"' : ""}>Sobre nosotros</a>
    </nav>
  </header>`;

export const SITE_TEMPLATE: SiteFile[] = [
  {
    path: "index.html",
    content: `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Panadería Brisa · Pan artesano en Santander</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  ${nav("inicio")}
  <main>
    <section class="hero">
      <h1>Pan de masa madre, cada mañana</h1>
      <p>Horneamos en el barrio desde 1987 con harinas ecológicas y fermentaciones largas.</p>
      <a class="button" href="sobre.html">Conócenos</a>
    </section>
    <section class="grid">
      <article><h2>Hogaza</h2><p>Centeno y trigo, 24 h de fermentación.</p></article>
      <article><h2>Croissant</h2><p>Mantequilla de Cantabria, hojaldre a mano.</p></article>
      <article><h2>Tarta de queso</h2><p>Solo los fines de semana.</p></article>
    </section>
  </main>
  <footer>© Panadería Brisa</footer>
</body>
</html>
`,
  },
  {
    path: "sobre.html",
    content: `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sobre nosotros · Panadería Brisa</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  ${nav("sobre")}
  <main>
    <section class="page">
      <h1>Sobre nosotros</h1>
      <p>Somos una familia de panaderos. Abrimos de lunes a sábado de 7:00 a 14:00.</p>
    </section>
  </main>
  <footer>© Panadería Brisa</footer>
</body>
</html>
`,
  },
  {
    path: "styles.css",
    content: `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; color: #2b2118; background: #fbf7f0; }
.top { display: flex; justify-content: space-between; align-items: center; padding: 1rem 2rem; background: #2b2118; }
.brand { color: #f5d9a8; font-weight: 700; text-decoration: none; }
nav a { color: #f5ead6; margin-left: 1.25rem; text-decoration: none; }
nav a.active { border-bottom: 2px solid #f5d9a8; }
main { max-width: 960px; margin: 0 auto; padding: 2rem; }
.hero { padding: 3rem 0; }
.hero h1 { font-size: 2.4rem; margin: 0 0 1rem; }
.button { display: inline-block; padding: 0.7rem 1.2rem; background: #c2661c; color: #fff; border-radius: 6px; text-decoration: none; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; }
.grid article { background: #fff; padding: 1rem 1.25rem; border-radius: 8px; border: 1px solid #eadcc6; }
.page { padding: 2rem 0; }
footer { text-align: center; padding: 2rem; color: #8a7560; }
`,
  },
];
