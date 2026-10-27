/* ==========================================================
   Calendario escolar: página /calendario/ y «Próximos eventos» del inicio.
   Los eventos se editan en el panel (sección «Calendario») y viven en data/sitio.json → eventos.
   «Agregar a mi calendario»: cada evento se puede agregar solo (Google o archivo .ics) y el
   calendario completo se puede suscribir (calendario/colegio.ics, lo escribe una acción de GitHub).
   ========================================================== */
(function () {
  "use strict";

  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const TIPOS = {
    evento: "Actividad", reunion: "Reunión", acto: "Acto", evaluacion: "Evaluación", feriado: "Feriado", vacaciones: "Vacaciones",
  };
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoy = iso(new Date());
  const fin = (e) => (e.fin && e.fin >= e.fecha ? e.fin : e.fecha);
  const valido = (e) => e && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha || "") && e.titulo;
  const ordenar = (a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || ""));

  // «12 de octubre» o «12 al 16 de octubre»
  const rango = (e) => {
    const [y, m, d] = e.fecha.split("-").map(Number);
    if (fin(e) === e.fecha) return `${d} de ${MESES[m - 1]}`;
    const [y2, m2, d2] = fin(e).split("-").map(Number);
    if (m === m2 && y === y2) return `${d} al ${d2} de ${MESES[m - 1]}`;
    return `${d} de ${MESES[m - 1]} al ${d2} de ${MESES[m2 - 1]}`;
  };

  const item = (e, compacto) => {
    const [, m, d] = e.fecha.split("-").map(Number);
    const tipo = TIPOS[e.tipo] ? e.tipo : "evento";
    const enlace = e.enlace ? SITE.asset(e.enlace) : "";
    return `<article class="evento evento--${tipo}${compacto ? " evento--compacto" : ""}" data-fecha="${esc(e.fecha)}">
        <div class="evento__fecha"><span class="evento__dia">${d}</span><span class="evento__mes">${MESES[m - 1].slice(0, 3)}</span></div>
        <div class="evento__info">
          <span class="evento__tipo">${esc(TIPOS[tipo])}</span>
          <h3 class="evento__titulo">${esc(e.titulo)}</h3>
          <p class="evento__meta">${esc(rango(e))}${e.hora ? ` · ${esc(e.hora)}` : ""}${e.lugar ? ` · ${esc(e.lugar)}` : ""}</p>
          ${!compacto && e.descripcion ? `<p class="evento__desc">${esc(e.descripcion)}</p>` : ""}
          ${enlace ? `<a class="evento__link" href="${esc(enlace)}"${/^https?:/i.test(enlace) ? ' target="_blank" rel="noopener"' : ""}>Más información →</a>` : ""}
          ${!compacto && window.ICS ? `<p class="evento__agregar">Agregar a mi calendario:
            <a href="${esc(ICS.google(e, absoluta("")))}" target="_blank" rel="noopener">Google</a>
            <button type="button" data-ics="${esc(e.fecha + "|" + e.titulo)}">iPhone u Outlook</button></p>` : ""}
        </div>
      </article>`;
  };

  // Dirección completa (para enlaces que se abren fuera del sitio)
  const absoluta = (p) => new URL(SITE.asset(p), location.href).href;

  // Descarga un evento como archivo .ics (el celular o el computador lo abre en su calendario)
  const descargarEvento = (e) => {
    const blob = new Blob([ICS.archivo([e], { base: absoluta("") })], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (window.TEXTO ? TEXTO.slug(e.titulo) : "evento") + ".ics";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  // Suscribirse al calendario completo: se actualiza solo en el celular
  const renderSuscribir = () => {
    const caja = document.getElementById("calSuscribir");
    if (!caja) return;
    const ics = absoluta("calendario/colegio.ics");
    const webcal = ics.replace(/^https?:/, "webcal:");
    caja.querySelector("[data-google]").href = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
    caja.querySelector("[data-iphone]").href = webcal;
    const copiar = caja.querySelector("[data-copiar]");
    copiar.addEventListener("click", async () => {
      try { await navigator.clipboard.writeText(ics); copiar.textContent = "¡Enlace copiado!"; }
      catch (err) { prompt("Copia este enlace:", ics); }
      setTimeout(() => { copiar.textContent = "Copiar enlace"; }, 2500);
    });
    caja.hidden = false;
  };

  // Inicio: los próximos 4 eventos (incluye los que están ocurriendo hoy)
  const renderProximos = (eventos) => {
    const caja = document.getElementById("proximosEventos");
    if (!caja) return;
    const lista = eventos.filter((e) => fin(e) >= hoy).sort(ordenar).slice(0, 4);
    caja.closest("section").hidden = !lista.length;
    caja.innerHTML = lista.map((e) => item(e, true)).join("");
  };

  // Página del calendario: mes en grilla + lista del mes
  const renderCalendario = (eventos) => {
    const grilla = document.getElementById("calGrilla");
    if (!grilla) return;
    const lista = document.getElementById("calLista");
    const titulo = document.getElementById("calMes");
    const params = new URLSearchParams(location.search);
    const m0 = /^\d{4}-\d{2}$/.test(params.get("m") || "") ? params.get("m") : hoy.slice(0, 7);
    let [anio, mes] = m0.split("-").map(Number);
    let elegido = null;

    const pintar = () => {
      const clave = `${anio}-${pad(mes)}`;
      const primero = `${clave}-01`;
      const ultimoDia = new Date(anio, mes, 0).getDate();
      const ultimo = `${clave}-${pad(ultimoDia)}`;
      const delMes = eventos.filter((e) => e.fecha <= ultimo && fin(e) >= primero).sort(ordenar);
      titulo.textContent = `${MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1)} ${anio}`;
      const desfase = (new Date(anio, mes - 1, 1).getDay() + 6) % 7; // lunes primero
      let html = DIAS.map((d) => `<div class="cal__dow">${d}</div>`).join("");
      for (let i = 0; i < desfase; i++) html += '<div class="cal__dia cal__dia--vacio"></div>';
      for (let d = 1; d <= ultimoDia; d++) {
        const f = `${clave}-${pad(d)}`;
        const evs = delMes.filter((e) => e.fecha <= f && fin(e) >= f);
        const finde = ((desfase + d - 1) % 7) >= 5;
        const libre = evs.some((e) => e.tipo === "feriado" || e.tipo === "vacaciones");
        html += `<button type="button" class="cal__dia${f === hoy ? " es-hoy" : ""}${finde ? " es-finde" : ""}${libre ? " es-libre" : ""}${evs.length ? " tiene" : ""}${elegido === f ? " is-active" : ""}"
            data-dia="${f}" ${evs.length ? "" : "disabled"} aria-label="${d} de ${MESES[mes - 1]}${evs.length ? `: ${esc(evs.map((e) => e.titulo).join(", "))}` : ""}">
            <span class="cal__num">${d}</span>
            <span class="cal__evs">${evs.slice(0, 2).map((e) => `<span class="cal__ev cal__ev--${TIPOS[e.tipo] ? e.tipo : "evento"}">${esc(e.titulo)}</span>`).join("")}${evs.length > 2 ? `<span class="cal__mas">+${evs.length - 2}</span>` : ""}</span>
            <span class="cal__puntos" aria-hidden="true">${evs.slice(0, 3).map((e) => `<i class="cal__p--${TIPOS[e.tipo] ? e.tipo : "evento"}"></i>`).join("")}</span>
          </button>`;
      }
      grilla.innerHTML = html;
      const mostrar = elegido ? delMes.filter((e) => e.fecha <= elegido && fin(e) >= elegido) : delMes;
      lista.innerHTML = (elegido ? `<p class="cal__filtro">Mostrando el ${Number(elegido.slice(8))} de ${MESES[mes - 1]} · <button type="button" data-todos>Ver todo el mes</button></p>` : "") +
        (mostrar.length ? mostrar.map((e) => item(e)).join("") : '<p class="empty-note">No hay eventos publicados para este mes.</p>');
      const url = new URL(location.href);
      if (clave === hoy.slice(0, 7)) url.searchParams.delete("m"); else url.searchParams.set("m", clave);
      history.replaceState(null, "", url);
    };

    document.getElementById("calPrev").addEventListener("click", () => { mes--; if (mes < 1) { mes = 12; anio--; } elegido = null; pintar(); });
    document.getElementById("calNext").addEventListener("click", () => { mes++; if (mes > 12) { mes = 1; anio++; } elegido = null; pintar(); });
    document.getElementById("calHoy").addEventListener("click", () => { [anio, mes] = hoy.split("-").map(Number); elegido = null; pintar(); });
    grilla.addEventListener("click", (e) => {
      const b = e.target.closest("[data-dia]");
      if (!b) return;
      elegido = elegido === b.dataset.dia ? null : b.dataset.dia;
      pintar();
      if (elegido && matchMedia("(max-width: 760px)").matches) lista.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    lista.addEventListener("click", (e) => {
      if (e.target.closest("[data-todos]")) { elegido = null; pintar(); }
      const b = e.target.closest("[data-ics]");
      const ev = b && eventos.find((x) => x.fecha + "|" + x.titulo === b.dataset.ics);
      if (ev) descargarEvento(ev);
    });
    pintar();
  };

  if (!window.SITE || !SITE.ready) return;
  SITE.ready.then((data) => {
    const eventos = (data && Array.isArray(data.eventos) ? data.eventos : []).filter(valido);
    renderProximos(eventos);
    renderCalendario(eventos);
    renderSuscribir();
  }).catch(() => { /* sin datos: la página muestra su mensaje por defecto */ });
})();
