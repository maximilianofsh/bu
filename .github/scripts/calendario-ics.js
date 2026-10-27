/* ==========================================================
   Escribe calendario/colegio.ics con todos los eventos del «Calendario escolar».
   Es el enlace que se «suscribe» en Google Calendar, iPhone u Outlook: el celular lo
   vuelve a leer solo cada algunas horas, así los eventos nuevos aparecen sin hacer nada.
   El formato lo arma js/ics.js (el mismo que usa el botón «Agregar» de cada evento).

   Lo ejecuta la acción .github/workflows/paginas-noticias.yml cuando cambia data/sitio.json.
   A mano:  node .github/scripts/calendario-ics.js
   ========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const ICS = require("../../js/ics.js");

const RAIZ = path.resolve(__dirname, "../..");
const leer = (f) => fs.readFileSync(path.join(RAIZ, f), "utf8");

function origen() {
  try {
    const dominio = leer("CNAME").trim().split(/\s+/)[0];
    if (dominio) return `https://${dominio}/`;
  } catch (e) { /* sin dominio propio */ }
  const [owner, repo] = String(process.env.GITHUB_REPOSITORY || "/").split("/");
  return owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/` : "";
}

const datos = JSON.parse(leer("data/sitio.json"));
const eventos = Array.isArray(datos.eventos) ? datos.eventos : [];
const texto = ICS.archivo(eventos, { base: origen(), suscripcion: true });
const destino = path.join(RAIZ, "calendario", "colegio.ics");
// DTSTAMP cambia en cada ejecución: solo se reescribe si cambió algo más
const sinSello = (t) => t.replace(/^DTSTAMP:.*$/gm, "");
const antes = fs.existsSync(destino) ? fs.readFileSync(destino, "utf8") : "";
if (sinSello(antes) !== sinSello(texto)) {
  fs.writeFileSync(destino, texto);
  console.log(`Calendario: ${eventos.filter(ICS.valido).length} eventos escritos en calendario/colegio.ics`);
} else console.log("Calendario: sin cambios.");
