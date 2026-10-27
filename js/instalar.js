/* Tarjeta «Instalar en el celular» de las apps del panel (/admin, /utp, /inspectoria).
   Uso: INSTALAR(elemento, "el panel") — se muestra solo si la app aún no está instalada. */
window.INSTALAR = function (caja, que) {
  "use strict";
  if (!caja) return;
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const llave = "csm-instalar-cerrado:" + location.pathname;
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const movil = ios || /android/i.test(navigator.userAgent);
  let pedido = null;
  const pintar = () => {
    if (instalada || leer(llave) || (!pedido && !(ios && movil))) { caja.hidden = true; return; }
    caja.innerHTML = ios
      ? `<strong>Instala ${que} en tu iPhone</strong><ol><li>Toca el botón <b>Compartir</b> de Safari (el cuadrado con la flecha ⬆︎).</li><li>Elige <b>«Agregar a inicio»</b>.</li><li>Ábrelo desde el ícono nuevo.</li></ol>
         <button type="button" class="instalar__no" data-no>Ahora no</button>`
      : `<strong>Instala ${que} en este equipo</strong><p>Quedará como un ícono, igual que una app.</p>
         <div class="instalar__acc"><button type="button" class="instalar__si" data-si>Instalar</button><button type="button" class="instalar__no" data-no>Ahora no</button></div>`;
    caja.hidden = false;
  };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedido = e; pintar(); });
  window.addEventListener("appinstalled", () => { pedido = null; caja.hidden = true; });
  caja.addEventListener("click", async (e) => {
    if (e.target.closest("[data-si]") && pedido) { pedido.prompt(); await pedido.userChoice; pedido = null; pintar(); }
    if (e.target.closest("[data-no]")) { guardar(llave, "1"); caja.hidden = true; }
  });
  pintar();
};
