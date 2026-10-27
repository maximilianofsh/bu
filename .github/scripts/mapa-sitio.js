/* ==========================================================
   Escribe sitemap.xml: la lista de páginas del sitio que Google debe conocer
   (las secciones, cada noticia y cada álbum de la galería). Así las noticias nuevas
   aparecen antes en Google. El archivo robots.txt le indica a Google dónde está.

   Lo ejecuta la acción .github/workflows/paginas-noticias.yml cuando cambia data/sitio.json.
   A mano:  node .github/scripts/mapa-sitio.js
   ========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const xml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));

function origen() {
  try {
    const dominio = leer("CNAME").trim().split(/\s+/)[0];
    if (dominio) return `https://${dominio}/`;
  } catch (e) { /* sin dominio propio */ }
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || "/").split("/");
  return owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/` : "/";
}

// Secciones públicas: cada carpeta con index.html, menos las privadas (marcadas «noindex»)
// y la plantilla de noticia (cada noticia tiene su propia carpeta)
const secciones = fs.readdirSync(RAIZ, { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith(".") && d.name !== "noticia")
  .filter((d) => {
    const f = path.join(RAIZ, d.name, "index.html");
    return fs.existsSync(f) && !/<meta name="robots" content="[^"]*noindex/i.test(fs.readFileSync(f, "utf8"));
  })
  .map((d) => d.name).sort();

const base = origen();
const urls = [{ loc: base, prioridad: "1.0" }].concat(secciones.map((s) => ({ loc: `${base}${s}/`, prioridad: s === "noticias" || s === "admision" ? "0.8" : "0.6" })));

// Noticias con página propia (las crea paginas-noticias.js, que corre antes)
const datos = JSON.parse(leer("data/sitio.json"));
const fechas = new Map((datos.noticias || []).map((n) => [n.id, n.fecha]));
for (const d of fs.readdirSync(path.join(RAIZ, "noticia"), { withFileTypes: true })) {
  if (!d.isDirectory() || !fs.existsSync(path.join(RAIZ, "noticia", d.name, "index.html"))) continue;
  urls.push({ loc: `${base}noticia/${d.name}/`, fecha: fechas.get(d.name), prioridad: "0.5" });
}
// Álbumes de la galería
for (const a of datos.galeria || []) {
  if (a && a.id) urls.push({ loc: `${base}galeria/?a=${encodeURIComponent(a.id)}`, fecha: a.fecha, prioridad: "0.4" });
}

const texto = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => `  <url><loc>${xml(u.loc)}</loc>${/^\d{4}-\d{2}-\d{2}$/.test(u.fecha || "") ? `<lastmod>${u.fecha}</lastmod>` : ""}<priority>${u.prioridad}</priority></url>`).join("\n") +
  "\n</urlset>\n";
const destino = path.join(RAIZ, "sitemap.xml");
if (!fs.existsSync(destino) || fs.readFileSync(destino, "utf8") !== texto) fs.writeFileSync(destino, texto);
console.log(`Mapa del sitio: ${urls.length} direcciones.`);
