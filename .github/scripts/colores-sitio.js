/* ==========================================================
   Escribe css/colores.css con los colores y el estilo global elegidos en el panel
   («Colores» y «Estilo visual»), para que cada página cargue ya con sus colores
   y no se vea un instante con los colores de fábrica.

   Lo ejecuta la acción .github/workflows/paginas-noticias.yml cada vez que cambia
   data/sitio.json. También se puede probar a mano:  node .github/scripts/colores-sitio.js
   ========================================================== */
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const RAIZ = path.resolve(__dirname, "../..");
const datos = JSON.parse(fs.readFileSync(path.join(RAIZ, "data/sitio.json"), "utf8"));
const c = datos.colores || {};
const color = (v) => (/^#[0-9a-f]{3,8}$/i.test(String(v || "")) ? v : "");

const vars = {};
if (color(c.primario)) vars["--navy-900"] = c.primario;
if (color(c.secundario)) vars["--navy-700"] = c.secundario;
if (color(c.acento)) vars["--gold"] = c.acento;

// Estilo global de «Estilo visual»: se usa el mismo cálculo que js/estilo.js
try {
  const caja = { window: {}, document: { documentElement: { dataset: {} } }, localStorage: { getItem: () => null } };
  vm.runInNewContext(fs.readFileSync(path.join(RAIZ, "js/estilo.js"), "utf8"), caja);
  const global = (datos.estilo && datos.estilo.global) || {};
  Object.assign(vars, caja.window.ESTILO.variables(global));
} catch (e) {
  console.log("No se pudo calcular el estilo global:", e.message);
}

// Solo valores seguros (colores, medidas, nombres de fuentes): nada que pueda cerrar la regla
const lineas = Object.entries(vars)
  .filter(([k, v]) => /^--[a-z0-9-]+$/.test(k) && /^[#\w\s.,()%"'-]+$/.test(String(v)) && !/[{};<>]/.test(String(v)))
  .map(([k, v]) => `  ${k}: ${v};`);
const css = `/* Generado automáticamente desde data/sitio.json («Colores» y «Estilo visual» del panel). No se edita a mano. */\n:root {\n${lineas.join("\n")}\n}\n`;

const destino = path.join(RAIZ, "css/colores.css");
const antes = fs.existsSync(destino) ? fs.readFileSync(destino, "utf8") : "";
if (antes !== css) fs.writeFileSync(destino, css);
console.log(`css/colores.css: ${lineas.length} valores${antes === css ? " (sin cambios)" : " (actualizado)"}.`);
