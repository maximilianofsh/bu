/* ==========================================================
   Galería de fotos: /galeria/ lista los álbumes y /galeria/?a=<id> muestra uno.
   Los álbumes se crean en el panel (sección «Galería de fotos») → data/sitio.json → galeria.
   Además, cada noticia publicada con fotos aparece sola como álbum (portada + fotos del texto).
   ========================================================== */
(function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const fecha = (f) => { const [y, m, d] = (f || "").split("-"); return d ? `${+d} de ${MESES[+m - 1]} de ${y}` : ""; };
  const fotosDe = (a) => (Array.isArray(a.fotos) ? a.fotos : []).map((f) => (typeof f === "string" ? f : f && f.src)).filter(Boolean);
  const enlace = (a) => SITE.url("galeria/") + "?a=" + encodeURIComponent(a.id);

  const caja = document.getElementById("galeria");
  if (!caja || !window.SITE || !SITE.ready) return;

  const lista = (albumes) => {
    caja.innerHTML = albumes.length
      ? `<div class="albumes">${albumes.map((a) => {
          const fotos = fotosDe(a);
          return `<a class="album" href="${esc(enlace(a))}">
            <span class="album__img">${fotos[0] ? `<img src="${esc(SITE.asset(fotos[0]))}" alt="" loading="lazy">` : ""}<span class="album__n">${fotos.length} ${fotos.length === 1 ? "foto" : "fotos"}</span></span>
            <span class="album__body"><strong>${esc(a.titulo)}</strong>${a.fecha ? `<small>${esc(fecha(a.fecha))}</small>` : ""}</span>
          </a>`;
        }).join("")}</div>`
      : '<p class="empty-note">Pronto publicaremos aquí las fotos de nuestras actividades.</p>';
  };

  const album = (a) => {
    const fotos = fotosDe(a);
    document.title = `${a.titulo} | Galería | Colegio San Martín Iquique`;
    document.getElementById("galTitulo").textContent = a.titulo;
    document.getElementById("galLead").textContent = [fecha(a.fecha), a.descripcion].filter(Boolean).join(" · ");
    const leer = a.noticia ? `<a class="btn btn--outline" href="${esc(a.noticia)}">Leer la noticia</a> ` : "";
    document.getElementById("galCrumbs").innerHTML = `<li><a href="${esc(SITE.url(""))}">Inicio</a></li><li><a href="${esc(SITE.url("galeria/"))}">Galería de fotos</a></li><li aria-current="page">${esc(a.titulo)}</li>`;
    caja.innerHTML = `<div class="fotos">${fotos.map((f, i) =>
        `<button type="button" class="foto" data-i="${i}" aria-label="Ver foto ${i + 1} de ${fotos.length}"><img src="${esc(SITE.asset(f))}" alt="" loading="lazy"></button>`).join("")}</div>
      <p class="center">${leer}<a class="btn btn--outline" href="${esc(SITE.url("galeria/"))}">← Todos los álbumes</a></p>`;
    if (!fotos.length) caja.querySelector(".fotos").outerHTML = '<p class="empty-note">Este álbum aún no tiene fotos.</p>';

    // Visor a pantalla completa: flechas, teclado y deslizar con el dedo
    let visor = null, actual = 0;
    const mostrar = (i) => {
      actual = (i + fotos.length) % fotos.length;
      visor.querySelector(".visor__img").src = SITE.asset(fotos[actual]);
      visor.querySelector(".visor__n").textContent = `${actual + 1} / ${fotos.length}`;
      [actual - 1, actual + 1].forEach((k) => { const im = new Image(); im.src = SITE.asset(fotos[(k + fotos.length) % fotos.length]); });
    };
    const abrir = (i) => {
      if (!visor) {
        visor = document.createElement("dialog");
        visor.className = "visor";
        visor.setAttribute("aria-label", a.titulo);
        visor.innerHTML = `<img class="visor__img" alt="">
          <button type="button" class="visor__btn visor__prev" data-d="-1" aria-label="Foto anterior">‹</button>
          <button type="button" class="visor__btn visor__next" data-d="1" aria-label="Foto siguiente">›</button>
          <button type="button" class="visor__cerrar" aria-label="Cerrar">✕</button>
          <span class="visor__n"></span>`;
        visor.addEventListener("click", (e) => {
          const b = e.target.closest("[data-d]");
          if (b) return mostrar(actual + +b.dataset.d);
          if (e.target.closest(".visor__cerrar") || e.target === visor) visor.close();
        });
        visor.addEventListener("keydown", (e) => {
          if (e.key === "ArrowRight") mostrar(actual + 1);
          if (e.key === "ArrowLeft") mostrar(actual - 1);
        });
        let x0 = null;
        visor.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
        visor.addEventListener("touchend", (e) => {
          if (x0 == null) return;
          const dx = e.changedTouches[0].clientX - x0;
          if (Math.abs(dx) > 40) mostrar(actual + (dx < 0 ? 1 : -1));
          x0 = null;
        });
        document.body.append(visor);
      }
      mostrar(i);
      visor.showModal();
    };
    caja.addEventListener("click", (e) => {
      const b = e.target.closest(".foto");
      if (b) abrir(+b.dataset.i);
    });
  };

  // Fotos de una noticia: la imagen principal y las que van dentro del texto (![](ruta))
  const IMG = /\.(jpe?g|png|webp|gif)(\?|$)/i;
  const fotosNoticia = (n) => {
    const delTexto = [...String(n.cuerpo || "").matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)].map((m) => m[1]);
    return [...new Set([n.imagen, ...delTexto].filter((f) => f && IMG.test(f)))];
  };
  const albumesDeNoticias = (data) => (Array.isArray(data.noticias) ? data.noticias : [])
    .filter((n) => n && n.titulo && (!n.publicar || new Date(n.publicar) <= new Date()))
    .map((n) => {
      const id = window.TEXTO ? TEXTO.idNoticia(n) : n.id;
      return { id: "noticia-" + id, titulo: n.titulo, fecha: n.fecha, fotos: fotosNoticia(n),
        noticia: SITE.url("noticia/" + encodeURIComponent(id) + "/") };
    })
    .filter((a) => a.id && a.fotos.length);

  SITE.ready.then((data) => {
    const propios = (data && Array.isArray(data.galeria) ? data.galeria : []).filter((a) => a && a.id && a.titulo);
    const albumes = propios.concat(data ? albumesDeNoticias(data) : [])
      .sort((x, y) => (y.fecha || "").localeCompare(x.fecha || ""));
    const id = new URLSearchParams(location.search).get("a");
    const a = id && albumes.find((x) => x.id === id);
    if (a) album(a); else lista(albumes);
  }).catch(() => { caja.innerHTML = '<p class="empty-note">No se pudo cargar la galería.</p>'; });
})();
