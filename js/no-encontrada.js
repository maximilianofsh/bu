/* Página 404 (GitHub Pages la muestra para cualquier dirección que no existe).
   Una noticia recién publicada tarda unos segundos en tener su página fija noticia/<id>/
   (la crea una acción de GitHub). Mientras tanto se abre la versión noticia/?id=<id>. */
(function () {
  "use strict";
  const base = document.currentScript.src.replace(/js\/no-encontrada\.js(\?.*)?$/, "");
  const raiz = new URL(base).pathname;
  const resto = location.pathname.startsWith(raiz) ? location.pathname.slice(raiz.length) : location.pathname.replace(/^\//, "");
  const m = resto.match(/^noticia\/([a-z0-9][a-z0-9-]{0,79})\/?(index\.html)?$/);
  if (m) location.replace(base + "noticia/?id=" + encodeURIComponent(m[1]));
})();
