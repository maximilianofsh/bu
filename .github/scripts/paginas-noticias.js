/* ==========================================================
   Crea una página fija por noticia en noticia/<id>/index.html para que, al compartir
   el enlace por WhatsApp, Facebook u otras redes, se vea su título, resumen y foto.

   WhatsApp y Facebook no ejecutan JavaScript: solo leen las etiquetas <meta> del HTML.
   Por eso cada noticia necesita su propio archivo con esas etiquetas. El contenido se
   sigue mostrando igual que en noticia/?id=… (lo dibuja js/main.js con data/sitio.json).

   Lo ejecuta la acción .github/workflows/paginas-noticias.yml cada vez que cambia
   data/sitio.json. También se puede probar a mano:  node .github/scripts/paginas-noticias.js
   ========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "../..");
const MARCA = "<!-- Página generada automáticamente desde data/sitio.json: no se edita a mano (se reemplaza en cada publicación). -->";
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");
const attr = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Igual que js/texto.js
const slug = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").slice(0, 70).replace(/^-+|-+$/g, "");
const idNoticia = (n) => n.id || slug(`${n.fecha || ""} ${n.titulo || ""}`) || "noticia";

// Dirección pública del sitio: el dominio propio (CNAME) o la de GitHub Pages
function origen() {
  try {
    const dominio = leer("CNAME").trim().split(/\s+/)[0];
    if (dominio) return `https://${dominio}/`;
  } catch (e) { /* sin dominio propio */ }
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || "/").split("/");
  return owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/` : "/";
}

// Texto plano del cuerpo (sin marcas de formato) para la descripción
const textoPlano = (md) => String(md || "")
  .replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
  .replace(/^#+\s*|^>\s*|^[-*]\s+|^\d+\.\s+/gm, "").replace(/\*\*?([^*]+)\*\*?/g, "$1")
  .replace(/\s+/g, " ").trim();
// Fecha y hora del panel (hora de Chile) → instante real (igual que en servidor/notificaciones.js)
function horaChile(s) {
  s = String(s || "");
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return new Date(s);
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(s);
  if (!m) return null;
  const utc = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const visto = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(utc - (visto - utc));
}
// Noticia programada cuya hora aún no llega: todavía no tiene página
const programada = (n) => !!n.publicar && horaChile(n.publicar) > new Date();

const recortar = (t, n) => (t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : t);
const absoluta = (base, ruta) => (/^https?:\/\//i.test(ruta) ? ruta : base + encodeURI(String(ruta).replace(/^\.?\//, "")));

function generar() {
  const datos = JSON.parse(leer("data/sitio.json"));
  const plantilla = leer("noticia/index.html");
  const base = origen();
  const logo = datos.logo && datos.logo.imagen;
  const noticias = Array.isArray(datos.noticias) ? datos.noticias : [];
  const hechas = new Set();
  let escritas = 0;

  for (const n of noticias) {
    if (programada(n)) continue;
    const id = idNoticia(n);
    if (!/^[a-z0-9][a-z0-9-]{0,79}$/.test(id) || hechas.has(id)) continue;
    hechas.add(id);
    const url = `${base}noticia/${id}/`;
    const titulo = n.titulo || "Noticia";
    const desc = recortar(n.resumen || textoPlano(n.cuerpo) || "Noticia del Colegio San Martín de Iquique.", 200);
    const foto = n.imagen ? absoluta(base, n.imagen) : logo ? absoluta(base, logo) : "";
    const meta = [
      MARCA,
      `<link rel="canonical" href="${attr(url)}">`,
      `<meta property="og:type" content="article">`,
      `<meta property="og:site_name" content="Colegio San Martín Iquique">`,
      `<meta property="og:locale" content="es_CL">`,
      `<meta property="og:url" content="${attr(url)}">`,
      `<meta property="og:title" content="${attr(titulo)}">`,
      `<meta property="og:description" content="${attr(desc)}">`,
      foto ? `<meta property="og:image" content="${attr(foto)}">` : "",
      n.fecha ? `<meta property="article:published_time" content="${attr(n.fecha)}">` : "",
      `<meta name="twitter:card" content="${n.imagen ? "summary_large_image" : "summary"}">`,
    ].filter(Boolean).map((l) => "  " + l).join("\n");

    const html = plantilla
      // La página está un nivel más adentro: ../ pasa a ../../
      .replace(/(\s(?:href|src)=")\.\.\//g, "$1../../")
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${attr(titulo)} | Colegio San Martín Iquique</title>\n${meta}`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${attr(desc)}">`)
      .replace(/<body([^>]*)>/, (m, a) => `<body${a} data-noticia="${id}">`);

    const destino = path.join(RAIZ, "noticia", id, "index.html");
    const antes = fs.existsSync(destino) ? fs.readFileSync(destino, "utf8") : null;
    if (antes !== html) {
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, html);
      escritas++;
    }
  }

  // Borra las páginas de noticias eliminadas (solo las generadas por este script)
  let borradas = 0;
  for (const dir of fs.readdirSync(path.join(RAIZ, "noticia"), { withFileTypes: true })) {
    if (!dir.isDirectory() || hechas.has(dir.name)) continue;
    const f = path.join(RAIZ, "noticia", dir.name, "index.html");
    if (fs.existsSync(f) && fs.readFileSync(f, "utf8").includes(MARCA)) {
      fs.rmSync(path.join(RAIZ, "noticia", dir.name), { recursive: true });
      borradas++;
    }
  }
  console.log(`Páginas de noticias: ${hechas.size} en total, ${escritas} actualizadas, ${borradas} borradas. Dirección: ${base}`);
}

generar();
