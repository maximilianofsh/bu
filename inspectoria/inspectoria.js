/* ==========================================================
   App «Inspectoría» (/inspectoria/): la Inspectora General publica o apaga el aviso urgente
   del sitio y de la app del colegio desde el celular, con la clave de Inspectoría.
   El servidor del colegio (Cloudflare) revisa la clave, guarda el aviso en el sitio y manda las
   notificaciones al tiro. Es la misma pantalla que antes estaba dentro de /app/, ahora aparte.
   ========================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  let datos = null;
  const servidor = () => {
    const u = String((datos && datos.app && datos.app.servidor) || "").trim().replace(/\/+$/, "");
    return /^https:\/\/[a-z0-9.-]+$/i.test(u) ? u : "";
  };
  const avisoVigente = (a) => a && a.activo && (a.titulo || a.texto) && !(a.hasta && new Date(a.hasta) < new Date()) && !(a.desde && new Date(a.desde) > new Date()) ? a : null;

  /* ---------- Inspectoría: publicar o apagar el aviso con una clave ---------- */
  const SESION = "csm-app-insp";
  const sesion = () => leer(SESION) || "";
  const quitarSesion = () => { try { localStorage.removeItem(SESION); } catch (e) { /* nada */ } };
  const PLANTILLAS = [
    { nombre: "Retiro anticipado", nivel: "importante", titulo: "Retiro anticipado de estudiantes", texto: "Hoy las clases terminan a las __:__ por ______. Les pedimos retirar a sus hijos e hijas a esa hora." },
    { nombre: "Suspensión de clases", nivel: "importante", titulo: "Suspensión de clases", texto: "El día ______ no habrá clases por ______." },
    { nombre: "Emergencia", nivel: "urgente", titulo: "Emergencia en el colegio", texto: "Los estudiantes se encuentran a resguardo junto a sus profesores. Informaremos por aquí los próximos pasos." },
  ];
  const NIVELES = [["urgente", "Urgente", "Rojo", "#b3261e"], ["importante", "Importante", "Amarillo", "#f2b627"], ["info", "Información", "Azul", "#1f5fa8"]];
  let inspForm = { nivel: "urgente", titulo: "", texto: "", notificar: true };
  let inspOcupado = false;
  let inspMsg = null;

  const pedirServidor = async (ruta, cuerpo) => {
    const r = await fetch(servidor() + ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || "No se pudo conectar con el servidor."); e.salir = j.salir; throw e; }
    return j;
  };
  const mensaje = (texto, tipo) => { inspMsg = texto ? { texto, tipo } : null; const c = $("inspMsg"); if (c) c.innerHTML = inspMsg ? `<p class="insp__msg insp__msg--${tipo}" role="status">${esc(texto)}</p>` : ""; };

  const renderInspEstado = () => {
    const c = $("inspEstado");
    if (!c) return;
    const a = datos && avisoVigente(datos.aviso);
    if (!a) { c.innerHTML = '<h2>Aviso actual</h2><p class="tarjeta">No hay ningún aviso encendido.</p>'; return; }
    const nivel = ["urgente", "importante", "info"].includes(a.nivel) ? a.nivel : "urgente";
    c.innerHTML = `<h2>Aviso actual</h2>
      <article class="alerta alerta--${nivel}"><span class="alerta__nivel">${{ urgente: "Urgente", importante: "Importante", info: "Información" }[nivel]}</span>
        ${a.titulo ? `<h3 class="alerta__titulo">${esc(a.titulo)}</h3>` : ""}${a.texto ? `<p class="alerta__texto">${esc(a.texto)}</p>` : ""}</article>
      <button type="button" class="btn btn--grande btn--suave" data-insp="apagar"${inspOcupado ? " disabled" : ""}>Apagar este aviso</button>`;
  };

  function renderInsp() {
    const caja = $("insp");
    if (!servidor()) {
      caja.innerHTML = '<div class="tarjeta"><strong>Inspectoría aún no está disponible.</strong><p>Falta conectar la app con el servidor de notificaciones.</p></div>';
      return;
    }
    if (!sesion()) {
      caja.innerHTML = `<form class="insp tarjeta" id="inspEntrar">
          <h2>Acceso Inspectoría</h2>
          <p>Escribe la clave de Inspectoría para publicar avisos en el sitio y en la app del colegio. Este celular quedará con el acceso abierto.</p>
          <label class="campo">Clave<input type="password" id="inspClave" autocomplete="current-password" required></label>
          <div id="inspMsg"></div>
          <button class="btn btn--grande"${inspOcupado ? " disabled" : ""}>Entrar</button>
        </form>`;
      mensaje(inspMsg && inspMsg.texto, inspMsg && inspMsg.tipo);
      return;
    }
    const f = inspForm;
    caja.innerHTML = `<div class="insp">
        <div id="inspMsg"></div>
        <div class="insp__estado" id="inspEstado"></div>
        <form class="insp tarjeta" id="inspForm">
          <h2>Publicar un aviso nuevo</h2>
          <div><p class="campo">Usar un modelo (puedes cambiar el texto)</p>
            <div class="plantillas">${PLANTILLAS.map((p, i) => `<button type="button" data-plantilla="${i}">${esc(p.nombre)}</button>`).join("")}</div></div>
          <div class="campo">Tipo de aviso
            <div class="niveles">${NIVELES.map(([v, n, c, col]) => `<label style="--c:${col}"><input type="radio" name="nivel" value="${v}"${f.nivel === v ? " checked" : ""}><span>${n}<br><small>${c}</small></span></label>`).join("")}</div></div>
          <label class="campo">Título<input id="inspTitulo" maxlength="120" value="${esc(f.titulo)}" placeholder="Ej.: Retiro anticipado de estudiantes"></label>
          <label class="campo">Texto<textarea id="inspTexto" maxlength="700" placeholder="Qué pasó y qué deben hacer los apoderados.">${esc(f.texto)}</textarea></label>
          <label class="casilla"><input type="checkbox" id="inspNotificar"${f.notificar ? " checked" : ""}><span>Enviar notificación a los celulares que tienen la app</span></label>
          <button class="btn btn--grande btn--peligro"${inspOcupado ? " disabled" : ""}>Publicar aviso</button>
          <p class="pie-nota">Reemplaza el aviso actual. Se ve al tiro en la app y en uno o dos minutos en el sitio.</p>
        </form>
        <div class="insp__pie"><button type="button" class="btn-texto" data-insp="salir">Cerrar sesión en este celular</button>
          <a class="btn-texto" href="../app/">Abrir la app del colegio</a></div>
      </div>`;
    mensaje(inspMsg && inspMsg.texto, inspMsg && inspMsg.tipo);
    renderInspEstado();
  }

  // Manda las notificaciones al tiro, de a grupos, mostrando el avance
  const enviarNotificaciones = async () => {
    let j = {};
    for (let i = 0; i < 200; i++) {
      j = await pedirServidor("/enviar");
      if (!j.quedan) break;
      mensaje(`Aviso publicado. Enviando notificaciones… (${j.enviadas || 0} celulares)`, "ok");
      if (j.ocupado) await new Promise((r) => setTimeout(r, 1000));
    }
    return j.enviadas || 0;
  };

  const publicarInsp = async (aviso) => {
    inspOcupado = true;
    mensaje(aviso.activo ? "Publicando…" : "Apagando…", "ok");
    $("insp").querySelectorAll("button").forEach((b) => { b.disabled = true; });
    try {
      const r = await pedirServidor("/inspectoria/publicar", { sesion: sesion(), aviso });
      datos.aviso = r.aviso;
      if (aviso.activo) {
        inspForm = { nivel: "urgente", titulo: "", texto: "", notificar: true };
        let n = null;
        if (aviso.notificar) { try { n = await enviarNotificaciones(); } catch (e) { /* el servidor lo reintenta cada minuto */ } }
        mensaje(aviso.notificar ? (n === null ? "Aviso publicado. Las notificaciones se están enviando." : `Aviso publicado y notificación enviada a ${n} ${n === 1 ? "celular" : "celulares"}.`) : "Aviso publicado (sin notificación).", "ok");
      } else mensaje("Aviso apagado. Ya no se muestra en la app ni en el sitio.", "ok");
    } catch (e) {
      if (e.salir) quitarSesion();
      mensaje(e.message === "Failed to fetch" ? "Sin conexión. Revisa internet e inténtalo de nuevo." : e.message, "error");
    }
    inspOcupado = false;
    renderInsp();
    window.scrollTo(0, 0);
  };

  $("insp").addEventListener("input", (e) => {
    if (e.target.id === "inspTitulo") inspForm.titulo = e.target.value;
    if (e.target.id === "inspTexto") inspForm.texto = e.target.value;
    if (e.target.id === "inspNotificar") inspForm.notificar = e.target.checked;
    if (e.target.name === "nivel") inspForm.nivel = e.target.value;
  });
  $("insp").addEventListener("change", (e) => {
    if (e.target.id === "inspNotificar") inspForm.notificar = e.target.checked;
    if (e.target.name === "nivel") inspForm.nivel = e.target.value;
  });
  $("insp").addEventListener("click", (e) => {
    const p = e.target.closest("[data-plantilla]");
    if (p) {
      const t = PLANTILLAS[+p.dataset.plantilla];
      if ((inspForm.titulo || inspForm.texto) && !confirm("¿Reemplazar lo que escribiste por este modelo?")) return;
      Object.assign(inspForm, { nivel: t.nivel, titulo: t.titulo, texto: t.texto });
      renderInsp();
      $("inspTexto").focus();
      return;
    }
    const b = e.target.closest("[data-insp]");
    if (!b || inspOcupado) return;
    if (b.dataset.insp === "salir") { quitarSesion(); mensaje(null); renderInsp(); renderInspEstado(); return; }
    if (b.dataset.insp === "apagar" && confirm("¿Apagar el aviso? Dejará de verse en la app y en el sitio.")) publicarInsp({ activo: false });
  });
  $("insp").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (inspOcupado) return;
    if (e.target.id === "inspEntrar") {
      inspOcupado = true;
      mensaje("Revisando…", "ok");
      try {
        const r = await pedirServidor("/inspectoria/entrar", { clave: $("inspClave").value });
        guardar(SESION, r.sesion);
        mensaje(null);
      } catch (err) {
        mensaje(err.message === "Failed to fetch" ? "Sin conexión. Revisa internet e inténtalo de nuevo." : err.message, "error");
      }
      inspOcupado = false;
      renderInsp();
      renderInspEstado();
      return;
    }
    const f = inspForm;
    if (!f.titulo.trim() && !f.texto.trim()) { mensaje("Escribe al menos el título o el texto del aviso.", "error"); return; }
    const nombre = { urgente: "URGENTE", importante: "IMPORTANTE", info: "INFORMATIVO" }[f.nivel];
    if (!confirm(`¿Publicar este aviso ${nombre}?\n\n${f.titulo}\n\n${f.notificar ? "Llegará una notificación a todos los celulares con la app." : "No se enviará notificación."}`)) return;
    publicarInsp({ activo: true, nivel: f.nivel, titulo: f.titulo.trim(), texto: f.texto.trim(), notificar: f.notificar });
  });

  /* ---------- Datos ---------- */
  const cargar = async () => {
    try {
      const res = await fetch("../data/sitio.json", { cache: "no-store" });
      datos = await res.json();
      if (datos.colores) {
        const s = document.documentElement.style;
        if (datos.colores.secundario) s.setProperty("--secundario", datos.colores.secundario);
        if (datos.colores.acento) s.setProperty("--acento", datos.colores.acento);
      }
      // Un aviso recién publicado aquí se ve antes de que el sitio se actualice
      if (servidor()) {
        try {
          const r = await fetch(servidor() + "/aviso", { cache: "no-store" });
          const directo = r.ok ? (await r.json()).aviso : null;
          if (directo) datos.aviso = directo;
        } catch (e) { /* se usa el del sitio */ }
      }
      $("sinRed").hidden = true;
    } catch (e) {
      $("sinRed").hidden = navigator.onLine;
      if (!datos) { $("insp").innerHTML = '<div class="tarjeta"><strong>No se pudo cargar.</strong><p>Revisa tu conexión a internet e inténtalo de nuevo.</p></div>'; return; }
    }
    if (!$("insp").children.length) renderInsp(); else renderInspEstado();
  };
  window.addEventListener("online", cargar);
  window.addEventListener("offline", () => { $("sinRed").hidden = false; });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !inspOcupado) cargar(); });

  window.INSTALAR($("instalar"), "Inspectoría");
  cargar();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* se usa sin instalar */ });
})();
