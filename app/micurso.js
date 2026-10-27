/* ==========================================================
   «Mi curso» (pestaña de la app): calendario de cada curso, solo para su comunidad.
   - Estudiantes: escriben su RUT o su correo institucional, reciben un código en ese correo y quedan dentro.
   - Apoderados: registran su propio correo (por ejemplo Gmail), uno por estudiante. Para eso demuestran que son del
     estudiante con un código que llega al correo institucional del estudiante, o con un código que les entrega el colegio.
     Con más de un hijo agregan cada uno igual. Ven solo el calendario y el horario del curso de cada hijo.
   - Profesores: correo y contraseña (la primera vez, o si la olvidan, con un código al correo).
     Agregan, editan y borran fechas de sus cursos, y envían pruebas y guías para imprimir: UTP las revisa
     en el panel y, al aprobarlas, pasan a impresiones con las copias que da la matrícula de cada curso.
   Todo lo guarda el servidor del colegio (servidor/notificaciones.js, rutas /curso/…): las fechas
   de los cursos y las listas no están en la página pública.
   ========================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const guardar = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const CLAVE = "csm-app-micurso";
  const CACHE = "csm-app-micurso-datos";

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS_SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const TIPOS = { prueba: "Prueba", trabajo: "Entrega de trabajo", salida: "Salida pedagógica", reunion: "Reunión", actividad: "Actividad", otro: "Otro" };
  // Color de cada tipo (usa los colores de los eventos del calendario)
  const COLOR = { prueba: "evaluacion", trabajo: "evento", salida: "acto", reunion: "reunion", actividad: "evento", otro: "evento" };
  const pad = (n) => String(n).padStart(2, "0");
  const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const fin = (e) => (e.fin && e.fin >= e.fecha ? e.fin : e.fecha);
  const rango = (e) => {
    const [y, m, d] = e.fecha.split("-").map(Number);
    if (fin(e) === e.fecha) return `${DIAS_SEM[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`;
    const [, m2, d2] = fin(e).split("-").map(Number);
    return m === m2 ? `${d} al ${d2} de ${MESES[m - 1]}` : `${d} de ${MESES[m - 1]} al ${d2} de ${MESES[m2 - 1]}`;
  };

  let st = { paso: "inicio", quien: "familia", pase: null, est: null, apoCorreo: "", agregando: false, hijo: +(leer("csm-app-micurso-hijo") || 0), id: "", correo: "", msg: null, ocupado: false, verPasadas: false, filtro: "", editando: null, crearClave: false, pestana: "fechas", prueba: null, subida: "" };
  // Pruebas para imprimir: catálogo de cursos y asignaturas, matrícula y mis envíos
  let pr = null;
  let sesion = null;
  try { sesion = JSON.parse(leer(CLAVE) || "null"); } catch (e) { sesion = null; }
  let info = null;
  try { info = JSON.parse(leer(CACHE) || "null"); } catch (e) { info = null; }

  const servidor = () => (window.APP && APP.servidor()) || "";
  const pedir = async (ruta, cuerpo) => {
    const r = await fetch(servidor() + ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.error || (r.status === 404 ? "Esta función aún no está activa en el servidor del colegio." : "No se pudo conectar con el servidor.")); e.salir = j.salir; throw e; }
    return j;
  };
  const caja = () => $("micurso");
  const mensaje = (texto, tipo) => { st.msg = texto ? { texto, tipo: tipo || "error" } : null; const c = $("mcMsg"); if (c) c.innerHTML = msgHtml(); };
  const msgHtml = () => (st.msg ? `<p class="insp__msg insp__msg--${st.msg.tipo}" role="status">${esc(st.msg.texto)}</p>` : "");
  // Apoderado con más de un hijo: cuál está mirando (se recuerda en este celular)
  const hijoActual = () => {
    const y = (info && info.yo) || {};
    if (!y.apoderado) return { nombre: y.nombre, curso: y.curso };
    return y.hijos[Math.min(st.hijo, y.hijos.length - 1)] || y.hijos[0];
  };
  const salir = () => { sesion = null; info = null; pr = null; guardar(CLAVE, null); guardar(CACHE, null); st = { ...st, paso: "inicio", editando: null, crearClave: false, pestana: "fechas", prueba: null }; render(); };

  // Trae quién es y sus fechas (y deja una copia para ver sin internet)
  async function cargar() {
    if (!sesion) return;
    try {
      const [yo, f] = await Promise.all([pedir("/curso/yo", { sesion: sesion.sesion }), pedir("/curso/fechas", { sesion: sesion.sesion })]);
      info = { yo, fechas: f.fechas || [], t: Date.now() };
      guardar(CACHE, JSON.stringify(info));
      // El horario de la app queda en el curso del estudiante
      if (yo.rol === "familia" && window.APP && APP.elegirCurso) APP.elegirCurso(hijoActual().curso);
      if (yo.rol === "profe" && !yo.conClave) st.crearClave = true;
    } catch (e) {
      if (e.salir) { salir(); mensaje("Tu sesión venció o ya no estás en la lista del colegio. Vuelve a entrar."); return; }
      if (!info) mensaje(e.message === "Failed to fetch" ? "Sin conexión. Inténtalo cuando tengas internet." : e.message);
    }
    render();
  }

  /* ---------- Pantallas ---------- */
  function render() {
    const c = caja();
    if (!c) return;
    if (!servidor()) { c.innerHTML = '<div class="tarjeta"><strong>«Mi curso» aún no está disponible.</strong><p>Falta conectar la app con el servidor del colegio.</p></div>'; return; }
    if (!sesion || st.agregando) return renderEntrar(c);
    if (st.crearClave) return renderCrearClave(c);
    if (!info) { c.innerHTML = `<div id="mcMsg">${msgHtml()}</div><p class="vacio">Cargando…</p>`; return; }
    return info.yo.rol === "profe" ? renderProfe(c) : renderFamilia(c);
  }

  function renderEntrar(c) {
    const b = st.ocupado ? " disabled" : "";
    if (st.paso === "inicio") {
      c.innerHTML = `<div class="tarjeta mc">
          <h2>Calendario de tu curso</h2>
          <p>Pruebas, entregas, salidas y reuniones de cada curso, publicadas por sus profesores. Solo para apoderados, estudiantes y profesores del colegio.</p>
          <div class="mc__opciones">
            <button type="button" class="btn btn--grande" data-mc="apoderado">Soy apoderado</button>
            <button type="button" class="btn btn--grande btn--suave" data-mc="familia">Soy estudiante</button>
            <button type="button" class="btn btn--grande btn--suave" data-mc="profe">Soy profesor o profesora</button>
          </div>
        </div><div id="mcMsg">${msgHtml()}</div>`;
      return;
    }
    if (st.paso === "id") {
      c.innerHTML = `<form class="tarjeta mc" id="mcPedir">
          <h2>${st.quien === "apoderado" ? (st.agregando ? "Agregar otro estudiante" : "Registrarme como apoderado") : "Estudiantes"}</h2>
          <p>${st.quien === "apoderado" ? "Escribe el correo institucional de tu hijo o hija (o su RUT). Le enviaremos un código a ese correo institucional."
            : "Escribe tu correo institucional o tu RUT. Te enviaremos un código a tu correo institucional."}</p>
          <label class="campo">${st.quien === "apoderado" ? "Correo institucional o RUT del estudiante" : "Correo institucional o RUT"}<input id="mcId" value="${esc(st.id)}" autocomplete="${st.quien === "apoderado" ? "off" : "username"}" autocapitalize="none" spellcheck="false" placeholder="Ej.: apellido.apellido.nombre@colegiosm.cl" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>Enviar código</button>
          ${st.quien === "apoderado" ? '<button type="button" class="btn-texto" data-mc="colegio">No tengo acceso a ese correo: tengo un código del colegio</button>' : ""}
          <button type="button" class="btn-texto" data-mc="${st.quien === "apoderado" ? (st.agregando ? "cancelaragregar" : "apoderado") : "volver"}">← Volver</button>
        </form>`;
      return;
    }
    if (st.paso === "profe") {
      c.innerHTML = `<form class="tarjeta mc" id="mcProfe">
          <h2>Profesores</h2>
          <label class="campo">Correo institucional<input id="mcCorreo" type="email" value="${esc(st.id)}" autocomplete="username" autocapitalize="none" required></label>
          <label class="campo">Contraseña<input id="mcClave" type="password" autocomplete="current-password" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>Entrar</button>
          <button type="button" class="btn-texto" data-mc="primera">Primera vez u olvidé mi contraseña</button>
          <button type="button" class="btn-texto" data-mc="volver">← Volver</button>
        </form>`;
      return;
    }
    if (st.paso === "idprofe") {
      c.innerHTML = `<form class="tarjeta mc" id="mcPedir">
          <h2>Crear o cambiar contraseña</h2>
          <p>Escribe tu correo institucional. Te enviaremos un código para crear tu contraseña.</p>
          <label class="campo">Correo institucional<input id="mcId" type="email" value="${esc(st.id)}" autocomplete="username" autocapitalize="none" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>Enviar código</button>
          <button type="button" class="btn-texto" data-mc="profe">← Volver</button>
        </form>`;
      return;
    }
    if (st.paso === "apo") {
      c.innerHTML = `<form class="tarjeta mc" id="mcApoEntrar">
          <h2>Apoderados</h2>
          <p>Escribe el correo que registraste (por ejemplo tu Gmail). Te enviaremos un código.</p>
          <label class="campo">Tu correo<input id="mcApoCorreo" type="email" value="${esc(st.apoCorreo)}" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="nombre@gmail.com" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>Enviar código</button>
          <button type="button" class="btn btn--grande btn--suave" data-mc="registrar">Registrarme (primera vez)</button>
          <button type="button" class="btn-texto" data-mc="volver">← Volver</button>
        </form>`;
      return;
    }
    if (st.paso === "colegio") {
      c.innerHTML = `<form class="tarjeta mc" id="mcColegio">
          <h2>Código del colegio</h2>
          <p>Si no tienes acceso al correo institucional de tu hijo o hija, pide en el colegio (UTP o Inspectoría) un código para registrarte. Sirve una sola vez.</p>
          <label class="campo">Código<input id="mcCodColegio" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="12" placeholder="ABCD-2345" class="mc__codigo mc__codigo--letras" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>Continuar</button>
          <button type="button" class="btn-texto" data-mc="registrar">← Volver</button>
        </form>`;
      return;
    }
    if (st.paso === "apocorreo") {
      c.innerHTML = `<form class="tarjeta mc" id="mcApoCorreoForm">
          <h2>Tu correo de apoderado</h2>
          <p>Estudiante: <strong>${esc(st.est.nombre || "")}</strong> · ${esc(st.est.curso)}</p>
          <p>Escribe tu propio correo (por ejemplo tu Gmail). Con él entrarás a la app; te enviaremos un código para confirmarlo.</p>
          <label class="campo">Tu correo<input id="mcApoCorreo" type="email" value="${esc(st.apoCorreo)}" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="nombre@gmail.com" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>Enviar código</button>
          <button type="button" class="btn-texto" data-mc="apoderado">Cancelar</button>
        </form>`;
      return;
    }
    if (st.paso === "apocod" || st.paso === "apocodreg") {
      c.innerHTML = `<form class="tarjeta mc" id="mcApoCod">
          <h2>Revisa tu correo</h2>
          <p>Enviamos un código de 6 dígitos a <strong>${esc(st.correo)}</strong>. Si no llega en un par de minutos, revisa la carpeta de spam.</p>
          <label class="campo">Código<input id="mcCod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="mc__codigo" required></label>
          <div id="mcMsg">${msgHtml()}</div>
          <button class="btn btn--grande"${b}>${st.paso === "apocodreg" ? "Confirmar y entrar" : "Entrar"}</button>
          <button type="button" class="btn-texto" data-mc="${st.paso === "apocodreg" ? "reenviarapo" : "reenviarentrar"}">Enviar otro código</button>
          <button type="button" class="btn-texto" data-mc="apoderado">← Volver</button>
        </form>`;
      const cod = $("mcCod");
      if (cod) cod.focus();
      return;
    }
    // Paso «codigo»
    c.innerHTML = `<form class="tarjeta mc" id="mcCodigo">
        <h2>Revisa el correo</h2>
        <p>Enviamos un código de 6 dígitos a <strong>${esc(st.correo)}</strong>. Si no llega en un par de minutos, revisa la carpeta de spam.</p>
        <label class="campo">Código<input id="mcCod" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" class="mc__codigo" required></label>
        <div id="mcMsg">${msgHtml()}</div>
        <button class="btn btn--grande"${b}>Entrar</button>
        <button type="button" class="btn-texto" data-mc="reenviar">Enviar otro código</button>
        <button type="button" class="btn-texto" data-mc="${st.quien === "profe" ? "profe" : st.quien === "apoderado" ? "registrar" : "familia"}">← Volver</button>
      </form>`;
    const cod = $("mcCod");
    if (cod) cod.focus();
  }

  function renderCrearClave(c) {
    c.innerHTML = `<form class="tarjeta mc" id="mcNuevaClave">
        <h2>Crea tu contraseña</h2>
        <p>La usarás para entrar con tu correo institucional en este u otro celular.</p>
        <label class="campo">Contraseña nueva (mínimo 8 caracteres)<input id="mcNueva" type="password" autocomplete="new-password" minlength="8" required></label>
        <label class="campo">Repítela<input id="mcNueva2" type="password" autocomplete="new-password" minlength="8" required></label>
        <div id="mcMsg">${msgHtml()}</div>
        <button class="btn btn--grande"${st.ocupado ? " disabled" : ""}>Guardar contraseña</button>
      </form>`;
  }

  const tarjeta = (e, profe) => {
    const [, m, d] = e.fecha.split("-").map(Number);
    const tipo = TIPOS[e.tipo] ? e.tipo : "otro";
    return `<article class="evento evento--${COLOR[tipo]}${profe ? " mc__fecha" : ""}">
        <div class="evento__fecha"><span>${d}</span><small>${MESES[m - 1].slice(0, 3)}</small></div>
        <div class="evento__info">
          <span class="evento__tipo">${esc(TIPOS[tipo])}${profe ? ` · <b>${esc(e.curso)}</b>` : ""}</span>
          <h3>${esc(e.titulo)}</h3>
          <p class="evento__meta">${esc(rango(e))}${e.hora ? ` · ${esc(e.hora)}` : ""}</p>
          ${e.descripcion ? `<p class="evento__desc">${esc(e.descripcion)}</p>` : ""}
          ${e.autor ? `<p class="mc__autor">Publicado por ${esc(e.autor)}</p>` : ""}
          ${profe ? `<div class="acciones"><button type="button" class="btn-texto" data-editar="${e.id}">Editar</button><button type="button" class="btn-texto mc__borrar" data-borrar="${e.id}">Borrar</button></div>` : ""}
        </div>
      </article>`;
  };
  const lista = (fechas, profe) => {
    const todas = fechas.slice().sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));
    const ver = st.verPasadas ? todas : todas.filter((e) => fin(e) >= hoy());
    let mes = "", html = "";
    ver.forEach((e) => {
      const k = e.fecha.slice(0, 7);
      if (k !== mes) { mes = k; const [y, m] = k.split("-").map(Number); html += `<h2 class="mes">${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}</h2>`; }
      html += tarjeta(e, profe);
    });
    const hayPasadas = todas.some((e) => fin(e) < hoy());
    return (html || `<p class="vacio">${profe ? "Aún no hay fechas próximas. Toca «Agregar fecha»." : "Aún no hay fechas próximas para tu curso."}</p>`) +
      (hayPasadas ? `<button type="button" class="btn-texto" data-mc="pasadas">${st.verPasadas ? "Ocultar fechas pasadas" : "Ver también fechas pasadas"}</button>` : "");
  };
  const actualizado = () => (info && info.t ? `<p class="pie-nota">Actualizado el ${new Date(info.t).toLocaleDateString("es-CL", { day: "numeric", month: "long" })} a las ${new Date(info.t).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })}</p>` : "");

  function renderFamilia(c) {
    const yo = info.yo;
    const h = hijoActual();
    const hijos = yo.apoderado ? yo.hijos : [];
    c.innerHTML = `<div class="tarjeta mc__quien"><div><small>Calendario de</small><strong>${esc(h.curso)}</strong><span>${esc(h.nombre || "")}</span></div>
        <button type="button" class="btn-texto" data-mc="salir">Salir</button></div>
      ${hijos.length > 1 ? `<div class="mc__pestanas mc__hijos" role="tablist">${hijos.map((x, i) => `<button type="button" role="tab" aria-selected="${x === h}" data-hijo="${i}">${esc((x.nombre || x.curso).split(" ")[0])}<small>${esc(x.curso)}</small></button>`).join("")}</div>` : ""}
      <div id="mcMsg">${msgHtml()}</div>
      <div class="eventos">${lista(info.fechas.filter((e) => e.curso === h.curso), false)}</div>
      ${yo.apoderado ? `<button type="button" class="btn-texto" data-mc="agregarhijo">+ Agregar otro estudiante</button><p class="pie-nota">Entras con ${esc(yo.correo)}.</p>` : ""}
      <p class="pie-nota">Las fechas de todo el colegio (feriados, SIMCE, reuniones generales) están en la pestaña Calendario.</p>${actualizado()}`;
  }

  function renderProfe(c) {
    const yo = info.yo;
    const cursos = yo.cursos || [];
    const fechas = info.fechas.filter((e) => !st.filtro || e.curso === st.filtro);
    if (st.editando) return renderFormFecha(c, cursos);
    if (st.prueba) return renderFormPrueba(c);
    const pestanas = `<div class="mc__pestanas" role="tablist">
        <button type="button" role="tab" aria-selected="${st.pestana === "fechas"}" data-mc="pestana-fechas">Fechas del curso</button>
        <button type="button" role="tab" aria-selected="${st.pestana === "pruebas"}" data-mc="pestana-pruebas">Pruebas para imprimir</button>
      </div>`;
    const cuerpo = st.pestana === "pruebas" ? htmlPruebas()
      : cursos.length ? `<button type="button" class="btn btn--grande" data-mc="nueva">+ Agregar fecha</button>
      ${cursos.length > 1 ? `<label class="selector"><span>Ver</span><select id="mcFiltro"><option value="">Todos mis cursos</option>${cursos.map((x) => `<option${x === st.filtro ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>` : ""}
      <div class="eventos">${lista(fechas, true)}</div>` : '<p class="tarjeta">Aún no tienes cursos asignados. Pídele a UTP que te agregue en la lista de profesores.</p>';
    c.innerHTML = `<div class="tarjeta mc__quien"><div><small>Profesor/a</small><strong>${esc(yo.nombre || "Hola")}</strong><span>${cursos.length ? esc(cursos.join(" · ")) : "Sin cursos asignados"}</span></div>
        <button type="button" class="btn-texto" data-mc="salir">Salir</button></div>
      ${pestanas}
      <div id="mcMsg">${msgHtml()}</div>
      ${cuerpo}
      <div class="insp__pie"><button type="button" class="btn-texto" data-mc="cambiarclave">Cambiar mi contraseña</button></div>${st.pestana === "fechas" ? actualizado() : ""}`;
  }

  /* ---------- Pruebas y guías para imprimir ---------- */
  const TIPOS_PRUEBA = { prueba: "Prueba", guia: "Guía" };
  const ESTADOS_PRUEBA = {
    enviada: ["En revisión de UTP", "revision"],
    devuelta: ["UTP pidió cambios", "devuelta"],
    aprobada: ["Aprobada · en impresión", "aprobada"],
    impresa: ["Impresa", "impresa"],
  };
  const PRUEBA_MAX = 15 * 1024 * 1024;
  const fechaCorta = (f) => { const [y, m, d] = String(f).split("-").map(Number); return y ? `${DIAS_SEM[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}` : ""; };
  const peso = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  // Días hábiles (lunes a viernes) entre hoy y la fecha de evaluación
  const habilesHasta = (hasta) => {
    const [y, m, d] = String(hasta || "").split("-").map(Number);
    if (!y) return 0;
    const [y0, m0, d0] = ((pr && pr.hoy) || hoy()).split("-").map(Number);
    let t = new Date(y0, m0 - 1, d0), n = 0;
    const fin = new Date(y, m - 1, d);
    while (t < fin) { t = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1); if (t.getDay() % 6) n++; }
    return n;
  };

  async function cargarPruebas() {
    try {
      const [cat, mias] = await Promise.all([pedir("/pruebas/catalogo", { sesion: sesion.sesion }), pedir("/pruebas/mias", { sesion: sesion.sesion })]);
      pr = { ...cat, mias: mias.pruebas || [] };
    } catch (e) {
      if (e.salir) { salir(); mensaje("Tu sesión venció. Vuelve a entrar."); return; }
      // «No encontrado»: el servidor del colegio todavía no tiene esta función
      pr = pr || { error: e.message === "Failed to fetch" ? "Sin conexión. Inténtalo cuando tengas internet."
        : /^No encontrado$/.test(e.message) ? "Esta función aún no está activa en el servidor del colegio. Avísale a UTP o al encargado web." : e.message };
    }
    render();
  }

  function htmlPruebas() {
    if (!pr) return '<p class="vacio">Cargando…</p>';
    if (pr.error) return `<p class="tarjeta">${esc(pr.error)}</p><button type="button" class="btn-texto" data-mc="pestana-pruebas">Reintentar</button>`;
    const filas = pr.mias.map((p) => {
      const [txt, cls] = ESTADOS_PRUEBA[p.estado] || [p.estado, "revision"];
      const [, m, d] = p.fecha.split("-").map(Number);
      const editable = p.estado === "enviada" || p.estado === "devuelta";
      return `<article class="evento evento--evaluacion mc__envio">
          <div class="evento__fecha"><span>${d}</span><small>${MESES[m - 1].slice(0, 3)}</small></div>
          <div class="evento__info">
            <span class="mc__estado mc__estado--${cls}">${esc(txt)}</span>
            <h3>${esc(TIPOS_PRUEBA[p.tipo] || "Prueba")} de ${esc(p.asignatura)}</h3>
            <p class="evento__meta">${esc(p.cursos.join(" · "))} · evaluación el ${esc(fechaCorta(p.fecha))}</p>
            <p class="evento__desc">${esc(p.archivo)}${p.copias ? ` · ${p.copias} copias` : ""}</p>
            ${p.estado === "devuelta" ? `<p class="mc__motivo"><b>Comentario de UTP:</b> ${esc(p.motivo)}</p>` : ""}
            ${p.estado === "aprobada" || p.estado === "impresa" ? `<p class="mc__autor">${p.estado === "impresa" ? "Impresa" : "Aprobada"}${p.revisor && p.estado === "aprobada" ? " por " + esc(p.revisor) : ""}</p>` : ""}
            ${editable ? `<div class="acciones"><button type="button" class="btn-texto" data-corregir="${esc(p.id)}">${p.estado === "devuelta" ? "Corregir y reenviar" : "Cambiar"}</button><button type="button" class="btn-texto mc__borrar" data-retirar="${esc(p.id)}">Retirar</button></div>` : ""}
          </div>
        </article>`;
    }).join("");
    return `<button type="button" class="btn btn--grande" data-mc="nuevaprueba">+ Enviar prueba o guía</button>
      <p class="pie-nota mc__intro">UTP la revisa y, al aprobarla, le llega a impresiones con las copias de tus cursos.${pr.anticipacion ? ` Envíala con al menos ${pr.anticipacion} ${pr.anticipacion === 1 ? "día hábil" : "días hábiles"} de anticipación.` : ""}</p>
      <h2 class="mes">Mis envíos</h2>
      <div class="eventos">${filas || '<p class="vacio">Aún no has enviado pruebas ni guías.</p>'}</div>`;
  }

  // Cursos del catálogo: primero los del profesor
  const cursosPrueba = () => {
    const todos = (pr.cursos || []).map((c) => c.curso);
    const mios = (pr.mios || []).filter((c) => todos.includes(c));
    return { mios, otros: todos.filter((c) => !mios.includes(c)) };
  };
  // Asignaturas que están en todos los cursos elegidos
  const asignaturasDe = (cursos) => {
    if (!cursos.length) return [];
    const listas = cursos.map((c) => ((pr.cursos || []).find((x) => x.curso === c) || {}).asignaturas || []);
    return listas[0].filter((a) => listas.every((l) => l.some((b) => b.nombre === a.nombre)))
      .map((a) => ({ nombre: a.nombre, electivo: listas.some((l) => (l.find((b) => b.nombre === a.nombre) || {}).electivo) }));
  };
  const copiasDe = (p) => {
    const a = asignaturasDe(p.cursos).find((x) => x.nombre === p.asignatura);
    if (!a) return null;
    let total = 0, alumnos = 0;
    const faltan = [];
    for (const c of p.cursos) {
      const n = ((pr.matricula || {})[c] || {})[a.electivo ? a.nombre : ""];
      if (n == null) faltan.push(c); else { alumnos += n; total += n + (pr.extra || 0); }
    }
    return { total, alumnos, faltan, electivo: a.electivo };
  };

  function renderFormPrueba(c) {
    const p = st.prueba;
    const { mios, otros } = cursosPrueba();
    const casilla = (x) => `<label class="mc__curso"><input type="checkbox" name="pCurso" value="${esc(x)}"${p.cursos.includes(x) ? " checked" : ""}><span>${esc(x)}</span></label>`;
    const abrirOtros = p.cursos.some((x) => otros.includes(x)) || !mios.length;
    c.innerHTML = `<form class="tarjeta mc" id="mcPrueba">
        <h2>${p.id ? (p.estado === "devuelta" ? "Corregir y reenviar" : "Cambiar envío") : "Enviar prueba o guía"}</h2>
        ${p.id && p.motivo && p.estado === "devuelta" ? `<p class="mc__motivo"><b>Comentario de UTP:</b> ${esc(p.motivo)}</p>` : ""}
        <label class="campo">Tipo<select id="pTipo">${Object.entries(TIPOS_PRUEBA).map(([k, t]) => `<option value="${k}"${k === p.tipo ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <fieldset class="campo mc__cursos"><legend>Curso o cursos</legend>
          ${mios.length ? `<div class="mc__grilla">${mios.map(casilla).join("")}</div>` : ""}
          ${otros.length ? `<details${abrirOtros ? " open" : ""}><summary>${mios.length ? "Otros cursos" : "Elige los cursos"}</summary><div class="mc__grilla">${otros.map(casilla).join("")}</div></details>` : ""}
        </fieldset>
        <label class="campo">Asignatura<select id="pAsig" required></select></label>
        <label class="campo">Fecha de evaluación<input id="pFecha" type="date" min="${esc(pr.hoy || hoy())}" value="${esc(p.fecha)}" required></label>
        <label class="campo">Archivo (PDF o Word, máximo 15 MB)<input id="pArchivo" type="file" accept=".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"${p.id ? "" : " required"}></label>
        ${p.id ? `<p class="mc__nota">Si no eliges otro archivo, se mantiene «${esc(p.archivo)}».</p>` : ""}
        <label class="campo">Indicaciones para imprimir (opcional)<textarea id="pComentario" maxlength="600" placeholder="Ej.: doble cara, tamaño oficio, corcheteada">${esc(p.comentario || "")}</textarea></label>
        <div id="pCopias" class="mc__copias" aria-live="polite"></div>
        <div id="mcMsg">${msgHtml()}</div>
        <button class="btn btn--grande"${st.ocupado ? " disabled" : ""}>${p.id ? "Reenviar a UTP" : "Enviar a UTP"}</button>
        <button type="button" class="btn-texto" data-mc="cancelarprueba">Cancelar</button>
      </form>`;
    actualizarPrueba();
  }

  // Lee el formulario, ajusta las asignaturas y muestra las copias sin redibujar (así no se pierde el archivo elegido)
  function actualizarPrueba() {
    const p = st.prueba, f = $("mcPrueba");
    if (!p || !f) return;
    p.cursos = [...f.querySelectorAll('input[name="pCurso"]:checked')].map((x) => x.value);
    p.tipo = $("pTipo").value;
    p.fecha = $("pFecha").value;
    p.comentario = $("pComentario").value;
    const sel = $("pAsig");
    const asigs = asignaturasDe(p.cursos);
    if (sel.value) p.asignatura = sel.value;
    if (!asigs.some((a) => a.nombre === p.asignatura)) p.asignatura = asigs.length === 1 ? asigs[0].nombre : "";
    sel.innerHTML = !p.cursos.length ? '<option value="">Primero elige el curso</option>'
      : !asigs.length ? '<option value="">Esos cursos no comparten asignaturas</option>'
      : '<option value="">Elige la asignatura</option>' + asigs.map((a) => `<option value="${esc(a.nombre)}"${a.nombre === p.asignatura ? " selected" : ""}>${esc(a.nombre)}${a.electivo ? " (electivo)" : ""}</option>`).join("");
    const caja = $("pCopias");
    const k = p.asignatura ? copiasDe(p) : null;
    let html = "";
    if (k) {
      if (k.faltan.length) html += `<p>Falta la matrícula de ${esc(k.faltan.join(", "))}${k.electivo ? " en este electivo" : ""}. UTP escribirá las copias al aprobar.</p>`;
      else html += `<p><strong>Se imprimirán ${k.total} copias</strong> (${k.alumnos} ${k.electivo ? "estudiantes del electivo" : "estudiantes"}${pr.extra ? ` + ${pr.extra} por curso` : ""}).</p>`;
    }
    if (p.fecha) {
      const h = habilesHasta(p.fecha);
      if (pr.anticipacion && h < pr.anticipacion) html += `<p class="mc__ojo">Ojo: quedan ${h} ${h === 1 ? "día hábil" : "días hábiles"} hasta la evaluación. UTP pide enviarlas con ${pr.anticipacion} de anticipación. Puedes enviarla igual.</p>`;
    }
    caja.innerHTML = html;
    caja.hidden = !html;
  }

  const leerArchivo = (archivo) => new Promise((ok, mal) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => mal(new Error("No se pudo leer el archivo."));
    r.readAsDataURL(archivo);
  });
  // Sube con XMLHttpRequest para mostrar el avance (los archivos pueden ser grandes y el celular lento)
  const subirPrueba = (datos, cuerpo) => new Promise((ok, mal) => {
    const x = new XMLHttpRequest();
    x.open("POST", servidor() + "/pruebas/subir?m=" + encodeURIComponent(JSON.stringify(datos)));
    x.setRequestHeader("Content-Type", "text/plain");
    x.setRequestHeader("Authorization", "Curso " + sesion.sesion);
    x.upload.onprogress = (e) => { if (e.lengthComputable) { const b = document.querySelector("#mcPrueba .btn--grande"); if (b) b.textContent = `Subiendo… ${Math.round(e.loaded / e.total * 100)} %`; } };
    x.onload = () => {
      let j = {};
      try { j = JSON.parse(x.responseText); } catch (e) { /* sin respuesta */ }
      if (x.status >= 200 && x.status < 300) return ok(j);
      const e = new Error(j.error || (x.status === 404 ? "Esta función aún no está activa en el servidor del colegio." : x.status === 413 ? "El archivo es muy grande." : "No se pudo enviar. Inténtalo de nuevo."));
      e.salir = j.salir;
      mal(e);
    };
    x.onerror = () => mal(new Error("Failed to fetch"));
    x.send(cuerpo);
  });
  async function enviarPrueba() {
    actualizarPrueba();
    const p = st.prueba;
    const archivo = ($("pArchivo").files || [])[0];
    if (!p.cursos.length) return mensaje("Elige al menos un curso.");
    if (!p.asignatura) return mensaje("Elige la asignatura.");
    if (!p.fecha) return mensaje("Escribe la fecha de evaluación.");
    if (!archivo && !p.id) return mensaje("Adjunta el archivo de la prueba o guía.");
    if (archivo && !/\.(pdf|docx?)$/i.test(archivo.name)) return mensaje("Sube el archivo en PDF o Word (.docx).");
    if (archivo && archivo.size > PRUEBA_MAX) return mensaje(`El archivo pesa ${peso(archivo.size)}. El máximo es 15 MB: guárdalo como PDF o comprime las imágenes.`);
    await trabajar(async () => {
      const cuerpo = archivo ? await leerArchivo(archivo) : "";
      const j = await subirPrueba({ id: p.id, cursos: p.cursos, asignatura: p.asignatura, fecha: p.fecha, tipo: p.tipo, comentario: p.comentario.trim(), archivo: archivo ? archivo.name : p.archivo }, cuerpo);
      st.prueba = null;
      pr.mias = [j.prueba, ...pr.mias.filter((x) => x.id !== j.prueba.id)];
      render();
      window.scrollTo(0, 0);
      mensaje(`Enviada a UTP: ${TIPOS_PRUEBA[j.prueba.tipo]} de ${j.prueba.asignatura}. Te avisaremos por correo cuando la revisen.`, "ok");
    });
    const b = document.querySelector("#mcPrueba .btn--grande");
    if (b) b.textContent = p.id ? "Reenviar a UTP" : "Enviar a UTP";
  }

  function renderFormFecha(c, cursos) {
    const f = st.editando;
    c.innerHTML = `<form class="tarjeta mc" id="mcFecha">
        <h2>${f.id ? "Editar fecha" : "Nueva fecha"}</h2>
        <label class="campo">Curso<select id="fCurso">${cursos.map((x) => `<option${x === f.curso ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>
        <label class="campo">Tipo<select id="fTipo">${Object.entries(TIPOS).map(([k, t]) => `<option value="${k}"${k === f.tipo ? " selected" : ""}>${t}</option>`).join("")}</select></label>
        <label class="campo">Título<input id="fTitulo" maxlength="120" value="${esc(f.titulo)}" placeholder="Ej.: Prueba de Matemática, unidad 3" required></label>
        <div class="mc__dos">
          <label class="campo">Fecha<input id="fFecha" type="date" value="${esc(f.fecha)}" required></label>
          <label class="campo">Hasta (opcional)<input id="fFin" type="date" value="${esc(f.fin || "")}"></label>
        </div>
        <label class="campo">Hora (opcional)<input id="fHora" maxlength="30" value="${esc(f.hora || "")}" placeholder="Ej.: 08:00 o 2° bloque"></label>
        <label class="campo">Detalle (opcional)<textarea id="fDesc" maxlength="800" placeholder="Contenidos, materiales, qué traer…">${esc(f.descripcion || "")}</textarea></label>
        <div id="mcMsg">${msgHtml()}</div>
        <button class="btn btn--grande"${st.ocupado ? " disabled" : ""}>${f.id ? "Guardar cambios" : "Publicar en el curso"}</button>
        <button type="button" class="btn-texto" data-mc="cancelar">Cancelar</button>
      </form>`;
  }

  /* ---------- Acciones ---------- */
  async function trabajar(fn) {
    if (st.ocupado) return;
    st.ocupado = true; mensaje("");
    document.querySelectorAll("#micurso button").forEach((b) => { b.disabled = true; });
    try { await fn(); }
    catch (e) {
      if (e.salir) { salir(); mensaje("Tu sesión venció. Vuelve a entrar."); }
      else mensaje(e.message === "Failed to fetch" ? "Sin conexión. Inténtalo cuando tengas internet." : e.message);
    } finally {
      st.ocupado = false;
      document.querySelectorAll("#micurso button").forEach((b) => { b.disabled = false; });
    }
  }
  const entrarCon = async (j, quien) => {
    sesion = { sesion: j.sesion, rol: quien };
    guardar(CLAVE, JSON.stringify(sesion));
    st.crearClave = !!j.crearClave;
    st.msg = null;
    info = null;
    render();
    await cargar();
  };
  // Apoderados: con el «pase» del estudiante se registra el correo propio (o se suma otro hijo a la cuenta)
  const conPase = async (j) => {
    st.pase = j.pase; st.est = { nombre: j.nombre, curso: j.curso }; st.msg = null;
    if (st.agregando && sesion) {
      await pedir("/curso/apoderado/agregar", { sesion: sesion.sesion, pase: j.pase });
      st.agregando = false; st.paso = "inicio";
      await cargar();
      const i = info.yo.hijos ? info.yo.hijos.findIndex((x) => x.nombre === j.nombre && x.curso === j.curso) : -1;
      if (i >= 0) { st.hijo = i; guardar("csm-app-micurso-hijo", String(i)); if (window.APP && APP.elegirCurso) APP.elegirCurso(j.curso); }
      render(); mensaje(`Listo: agregaste a ${j.nombre || "el estudiante"} (${j.curso}).`, "ok");
      return;
    }
    st.paso = "apocorreo"; render();
  };
  const pedirCodigoApo = async () => {
    const j = await pedir("/curso/apoderado/correo", { pase: st.pase, correo: st.apoCorreo });
    st.correo = j.correo; st.paso = "apocodreg"; st.msg = null; render();
  };
  const pedirCodigoEntrar = async () => {
    const j = await pedir("/curso/apoderado/codigo", { correo: st.apoCorreo });
    st.correo = j.correo; st.paso = "apocod"; st.msg = null; render();
  };
  const pedirCodigo = async () => {
    const j = await pedir("/curso/codigo", { quien: st.quien, id: st.id });
    st.correo = j.correo; st.paso = "codigo"; st.msg = null;
    render();
  };

  document.addEventListener("click", (e) => {
    const b = e.target.closest("#micurso [data-mc], #micurso [data-editar], #micurso [data-borrar], #micurso [data-corregir], #micurso [data-retirar], #micurso [data-hijo]");
    if (!b) return;
    if (b.dataset.hijo) {
      st.hijo = +b.dataset.hijo; guardar("csm-app-micurso-hijo", String(st.hijo));
      if (window.APP && APP.elegirCurso) APP.elegirCurso(hijoActual().curso);
      render(); return;
    }
    const a = b.dataset.mc;
    if (a === "familia") { st = { ...st, quien: "familia", paso: "id", msg: null }; render(); }
    else if (a === "profe") { st = { ...st, quien: "profe", paso: "profe", msg: null }; render(); }
    else if (a === "primera") { st.id = ($("mcCorreo") || {}).value || st.id; st = { ...st, quien: "profe", paso: "idprofe", msg: null }; render(); }
    else if (a === "volver") { st = { ...st, paso: "inicio", msg: null }; render(); }
    else if (a === "apoderado") { st = { ...st, quien: "apoderado", paso: st.agregando ? "id" : "apo", msg: null, pase: null }; render(); }
    else if (a === "registrar") { st = { ...st, quien: "apoderado", paso: "id", msg: null, pase: null }; render(); }
    else if (a === "colegio") { st = { ...st, paso: "colegio", msg: null }; render(); }
    else if (a === "agregarhijo") { st = { ...st, quien: "apoderado", paso: "id", id: "", agregando: true, msg: null, pase: null }; render(); window.scrollTo(0, 0); }
    else if (a === "cancelaragregar") { st = { ...st, agregando: false, paso: "inicio", msg: null }; render(); }
    else if (a === "reenviarapo") trabajar(pedirCodigoApo);
    else if (a === "reenviarentrar") trabajar(pedirCodigoEntrar);
    else if (a === "reenviar") trabajar(pedirCodigo);
    else if (a === "salir") { if (confirm("¿Cerrar «Mi curso» en este celular?")) salir(); }
    else if (a === "pasadas") { st.verPasadas = !st.verPasadas; render(); }
    else if (a === "nueva") { const cs = info.yo.cursos || []; st.editando = { curso: st.filtro || cs[0], tipo: "prueba", titulo: "", fecha: hoy(), fin: "", hora: "", descripcion: "" }; st.msg = null; render(); window.scrollTo(0, 0); }
    else if (a === "cancelar") { st.editando = null; st.msg = null; render(); }
    else if (a === "cambiarclave") { st.crearClave = true; st.msg = null; render(); }
    else if (a === "pestana-fechas") { st.pestana = "fechas"; st.msg = null; render(); }
    else if (a === "pestana-pruebas") { st.pestana = "pruebas"; st.msg = null; if (pr && pr.error) pr = null; render(); cargarPruebas(); }
    else if (a === "nuevaprueba") {
      const { mios } = cursosPrueba();
      st.prueba = { cursos: st.filtro && mios.includes(st.filtro) ? [st.filtro] : mios.length === 1 ? [mios[0]] : [], asignatura: "", fecha: "", tipo: "prueba", comentario: "" };
      st.msg = null; render(); window.scrollTo(0, 0);
    }
    else if (a === "cancelarprueba") { st.prueba = null; st.msg = null; render(); }
    else if (b.dataset.corregir) { const p = pr && pr.mias.find((x) => x.id === b.dataset.corregir); if (p) { st.prueba = { ...p, cursos: p.cursos.slice() }; st.msg = null; render(); window.scrollTo(0, 0); } }
    else if (b.dataset.retirar) {
      const p = pr && pr.mias.find((x) => x.id === b.dataset.retirar);
      if (!p || !confirm(`¿Retirar la ${TIPOS_PRUEBA[p.tipo].toLowerCase()} de ${p.asignatura} (${p.cursos.join(", ")})? UTP ya no la verá.`)) return;
      trabajar(async () => { await pedir("/pruebas/retirar", { sesion: sesion.sesion, id: p.id }); pr.mias = pr.mias.filter((x) => x.id !== p.id); render(); mensaje("Envío retirado.", "ok"); });
    }
    else if (b.dataset.editar) { const f = info.fechas.find((x) => String(x.id) === b.dataset.editar); if (f) { st.editando = { ...f }; st.msg = null; render(); window.scrollTo(0, 0); } }
    else if (b.dataset.borrar) {
      const f = info.fechas.find((x) => String(x.id) === b.dataset.borrar);
      if (!f || !confirm(`¿Borrar «${f.titulo}» de ${f.curso}?`)) return;
      trabajar(async () => { await pedir("/curso/fecha/borrar", { sesion: sesion.sesion, id: f.id }); await cargar(); mensaje("Fecha borrada.", "ok"); });
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "mcFiltro") { st.filtro = e.target.value; render(); }
    else if (e.target.closest && e.target.closest("#mcPrueba")) { if (e.target.id === "pArchivo") mensaje(""); actualizarPrueba(); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (!f.closest || !f.closest("#micurso")) return;
    e.preventDefault();
    if (f.id === "mcPedir") { st.id = $("mcId").value.trim(); trabajar(pedirCodigo); }
    else if (f.id === "mcApoEntrar") { st.apoCorreo = $("mcApoCorreo").value.trim(); trabajar(pedirCodigoEntrar); }
    else if (f.id === "mcApoCorreoForm") { st.apoCorreo = $("mcApoCorreo").value.trim(); trabajar(pedirCodigoApo); }
    else if (f.id === "mcColegio") { const codigo = $("mcCodColegio").value.trim(); trabajar(async () => conPase(await pedir("/curso/colegio", { codigo }))); }
    else if (f.id === "mcApoCod") {
      const codigo = $("mcCod").value.replace(/\D/g, "");
      trabajar(async () => {
        const j = st.paso === "apocodreg" ? await pedir("/curso/apoderado/registrar", { pase: st.pase, correo: st.apoCorreo, codigo })
          : await pedir("/curso/apoderado/entrar", { correo: st.apoCorreo, codigo });
        st.pase = null; st.paso = "inicio";
        await entrarCon(j, "apoderado");
      });
    }
    else if (f.id === "mcCodigo") {
      const codigo = $("mcCod").value.replace(/\D/g, "");
      if (st.quien === "apoderado") { trabajar(async () => conPase(await pedir("/curso/verificar", { quien: "apoderado", id: st.id, codigo }))); return; }
      trabajar(async () => entrarCon(await pedir("/curso/verificar", { quien: st.quien, id: st.id, codigo }), st.quien));
    } else if (f.id === "mcProfe") {
      st.id = $("mcCorreo").value.trim();
      const clave = $("mcClave").value;
      trabajar(async () => entrarCon(await pedir("/curso/entrar", { correo: st.id, clave }), "profe"));
    } else if (f.id === "mcNuevaClave") {
      const a = $("mcNueva").value, b2 = $("mcNueva2").value;
      if (a !== b2) return mensaje("Las contraseñas no coinciden.");
      if (a.length < 8) return mensaje("La contraseña debe tener al menos 8 caracteres.");
      trabajar(async () => {
        const j = await pedir("/curso/clave", { sesion: sesion.sesion, clave: a });
        sesion.sesion = j.sesion; guardar(CLAVE, JSON.stringify(sesion));
        st.crearClave = false; render(); mensaje("Contraseña guardada. La próxima vez entra con tu correo y esta contraseña.", "ok");
      });
    } else if (f.id === "mcPrueba") {
      enviarPrueba();
    } else if (f.id === "mcFecha") {
      const datos = { id: st.editando.id, curso: $("fCurso").value, tipo: $("fTipo").value, titulo: $("fTitulo").value.trim(), fecha: $("fFecha").value,
        fin: $("fFin").value, hora: $("fHora").value.trim(), descripcion: $("fDesc").value.trim() };
      st.editando = datos;
      trabajar(async () => {
        await pedir("/curso/fecha", { sesion: sesion.sesion, fecha: datos });
        st.editando = null; await cargar(); mensaje(datos.id ? "Cambios guardados." : `Fecha publicada en ${datos.curso}.`, "ok");
      });
    }
  });

  window.MICURSO = { render, cargar, activo: () => !!sesion };
})();
