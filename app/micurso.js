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

  let st = { paso: "inicio", quien: "familia", pase: null, est: null, apoCorreo: "", agregando: false, hijo: +(leer("csm-app-micurso-hijo") || 0), id: "", correo: "", msg: null, ocupado: false, verPasadas: false, filtro: "", editando: null, crearClave: false, prueba: null, enviada: null, verViejas: false };
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
  const salir = () => { sesion = null; info = null; pr = null; guardar(CLAVE, null); guardar(CACHE, null); st = { ...st, paso: "inicio", editando: null, crearClave: false, prueba: null, enviada: null }; render(); };

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
    return (html || `<p class="vacio">${profe ? "Aún no hay fechas próximas. Toca «Avisar una fecha al curso»." : "Aún no hay fechas próximas para tu curso."}</p>`) +
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

  // Íconos de las pantallas del profesor
  const ICONO = {
    impresora: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3Zm-3 11H8v-5h8v5Zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM18 3H6v4h12V3Z"/></svg>',
    calendario: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V9h14v11ZM7 11h5v5H7v-5Z"/></svg>',
    subir: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2Zm7-18-5.5 5.5 1.42 1.42L11 5.83V16h2V5.83l3.08 3.09 1.42-1.42L12 2Z"/></svg>',
    doc: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z"/></svg>',
    listo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  };

  // Inicio del profesor: sus dos tareas como botones grandes, el estado de sus envíos y las fechas de sus cursos
  function renderProfe(c) {
    const yo = info.yo;
    const cursos = yo.cursos || [];
    if (st.editando) return renderFormFecha(c, cursos);
    if (st.prueba) return renderFormPrueba(c);
    if (st.enviada) return renderEnviada(c);
    if (!pr && !cargandoPr) cargarPruebas();
    const fechas = info.fechas.filter((e) => !st.filtro || e.curso === st.filtro);
    const nombre = String(yo.nombre || "").trim().split(/\s+/)[0];
    c.innerHTML = `<div class="tarjeta mc__quien"><div><small>Profesor/a</small><strong>${nombre ? "Hola, " + esc(nombre) : "Hola"}</strong><span>${cursos.length ? esc(cursos.join(" · ")) : "Sin cursos asignados"}</span></div>
        <button type="button" class="btn-texto" data-mc="salir">Salir</button></div>
      <div id="mcMsg">${msgHtml()}</div>
      <div class="mc-acciones">
        <button type="button" class="mc-accion" data-mc="nuevaprueba">${ICONO.impresora}<span><strong>Enviar prueba o guía a imprimir</strong><small>Sube el archivo y UTP la revisa</small></span></button>
        ${cursos.length ? `<button type="button" class="mc-accion mc-accion--suave" data-mc="nueva">${ICONO.calendario}<span><strong>Avisar una fecha al curso</strong><small>Prueba, entrega, salida o reunión</small></span></button>` : ""}
      </div>
      <h2 class="mc-titulo">Mis pruebas y guías</h2>
      ${htmlEnvios()}
      <h2 class="mc-titulo">Fechas de tus cursos</h2>
      ${cursos.length ? `${cursos.length > 1 ? `<label class="selector"><span>Ver</span><select id="mcFiltro"><option value="">Todos mis cursos</option>${cursos.map((x) => `<option${x === st.filtro ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>` : ""}
      <div class="eventos">${lista(fechas, true)}</div>` : '<p class="tarjeta">Aún no tienes cursos asignados. Pídele a UTP que te agregue en la lista de profesores.</p>'}
      <div class="insp__pie"><button type="button" class="btn-texto" data-mc="cambiarclave">Cambiar mi contraseña</button></div>${actualizado()}`;
  }

  /* ---------- Pruebas y guías para imprimir ---------- */
  const TIPOS_PRUEBA = { prueba: "Prueba", guia: "Guía" };
  const ESTADOS_PRUEBA = { enviada: "UTP la está revisando", devuelta: "UTP pidió un cambio", aprobada: "Aprobada · en impresión", impresa: "Impresa" };
  // Barra de avance: enviada → revisada → imprimiendo → lista
  const AVANCE = { enviada: ["on", "ahora", "", ""], devuelta: ["on", "mal", "", ""], aprobada: ["on", "on", "ahora", ""], impresa: ["on", "on", "on", "on"] };
  const ORDEN_ESTADO = { devuelta: 0, enviada: 1, aprobada: 2, impresa: 3 };
  const INDICACIONES = ["Doble cara", "Una cara", "Tamaño oficio", "Corchetear"];
  const ULTIMO = "csm-app-pruebas-ultimo";
  const PRUEBA_MAX = 15 * 1024 * 1024;
  const ACEPTA = ".pdf,.docx,.doc,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword";
  let cargandoPr = false;
  const fechaCorta = (f) => { const [y, m, d] = String(f).split("-").map(Number); return y ? `${DIAS_SEM[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}` : ""; };
  const peso = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  const sumarDia = (f) => { const [y, m, d] = f.split("-").map(Number); const t = new Date(y, m - 1, d + 1); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; };
  const diaSemana = (f) => { const [y, m, d] = f.split("-").map(Number); return new Date(y, m - 1, d).getDay(); };
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
    cargandoPr = true;
    try {
      const [cat, mias] = await Promise.all([pedir("/pruebas/catalogo", { sesion: sesion.sesion }), pedir("/pruebas/mias", { sesion: sesion.sesion })]);
      pr = { ...cat, mias: mias.pruebas || [] };
    } catch (e) {
      if (e.salir) { cargandoPr = false; salir(); mensaje("Tu sesión venció. Vuelve a entrar."); return; }
      // «No encontrado»: el servidor del colegio todavía no tiene esta función
      pr = pr || { error: e.message === "Failed to fetch" ? "Sin conexión. Inténtalo cuando tengas internet."
        : /^No encontrado$/.test(e.message) ? "Esta función aún no está activa en el servidor del colegio. Avísale a UTP o al encargado web." : e.message };
    }
    cargandoPr = false;
    render();
  }

  // «Mis pruebas y guías»: primero lo que pide algo (devueltas), luego en revisión, en impresión e impresas
  function htmlEnvios() {
    if (!pr) return '<p class="vacio">Cargando…</p>';
    if (pr.error) return `<p class="tarjeta">${esc(pr.error)}</p><button type="button" class="btn-texto" data-mc="recargarpruebas">Reintentar</button>`;
    const hoyS = pr.hoy || hoy();
    const todos = pr.mias.slice().sort((a, b) => (ORDEN_ESTADO[a.estado] ?? 9) - (ORDEN_ESTADO[b.estado] ?? 9) || a.fecha.localeCompare(b.fecha));
    const viejas = todos.filter((p) => p.estado === "impresa" && p.fecha < hoyS);
    const ver = st.verViejas ? todos : todos.filter((p) => !viejas.includes(p));
    return (ver.map(htmlEnvio).join("") || '<p class="vacio">Aún no has enviado pruebas ni guías.</p>')
      + (viejas.length ? `<button type="button" class="btn-texto" data-mc="viejas">${st.verViejas ? "Ocultar las ya evaluadas" : `Ver también las ya evaluadas (${viejas.length})`}</button>` : "");
  }
  function htmlEnvio(p) {
    const avance = AVANCE[p.estado] || AVANCE.enviada;
    const paso = avance.filter((x) => x === "on").length + (avance.includes("ahora") || avance.includes("mal") ? 1 : 0);
    const editable = p.estado === "enviada" || p.estado === "devuelta";
    return `<article class="mc-envio mc-envio--${esc(p.estado)}">
        <span class="mc-envio__estado">${esc(ESTADOS_PRUEBA[p.estado] || p.estado)}</span>
        <h3>${esc(TIPOS_PRUEBA[p.tipo] || "Prueba")} de ${esc(p.asignatura)} · ${esc(p.cursos.join(", "))}</h3>
        <p>Evaluación el ${esc(fechaCorta(p.fecha))}${p.copias ? ` · ${p.copias} copias` : ""}</p>
        <div class="mc-avance" role="img" aria-label="Paso ${Math.min(paso, 4)} de 4: ${esc(ESTADOS_PRUEBA[p.estado] || p.estado)}">${avance.map((x) => `<i class="${x}"></i>`).join("")}</div>
        <div class="mc-avance__txt" aria-hidden="true"><span>Enviada</span><span>Revisada</span><span>Imprimiendo</span><span>Lista</span></div>
        ${p.estado === "devuelta" ? `<p class="mc__motivo"><b>Comentario de UTP${p.revisor ? ` (${esc(p.revisor)})` : ""}:</b> ${esc(p.motivo)}</p>` : ""}
        <div class="acciones">
          ${p.estado === "devuelta" ? `<button type="button" class="btn btn--chico" data-corregir="${esc(p.id)}">Corregir y reenviar</button>` : ""}
          ${p.estado === "enviada" ? `<button type="button" class="btn-texto" data-corregir="${esc(p.id)}">Cambiar</button>` : ""}
          ${editable ? `<button type="button" class="btn-texto mc__borrar" data-retirar="${esc(p.id)}">Retirar</button>` : ""}
          ${!editable && pr.reusar && p.conArchivo ? `<button type="button" class="btn-texto" data-reusar="${esc(p.id)}">Usar de nuevo para otro curso</button>` : ""}
        </div>
      </article>`;
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
  // Las asignaturas que el profesor ya usó, de la más usada a la menos (la última elegida va primero)
  const asignaturasUsadas = () => {
    const n = {};
    (pr.mias || []).forEach((p) => { n[p.asignatura] = (n[p.asignatura] || 0) + 1; });
    let ultima = "";
    try { ultima = (JSON.parse(leer(ULTIMO) || "{}") || {}).asignatura || ""; } catch (e) { /* nada guardado */ }
    if (ultima) n[ultima] = (n[ultima] || 0) + 1000;
    return Object.keys(n).sort((a, b) => n[b] - n[a]);
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
  // Próximas clases de la asignatura en el curso, según el horario (sin feriados ni vacaciones del calendario)
  const nombreCelda = (x) => (/^Taller/i.test(x) ? x : x.split(" · ")[0]);
  function clasesDe(curso, asignatura) {
    const filas = window.APP && APP.horario ? APP.horario(curso) : [];
    const dias = new Set();
    filas.forEach((f) => (f.celdas || []).forEach((celda, i) => {
      if (String(celda || "").split(/\s*\|\s*/).map((x) => nombreCelda(x.trim())).includes(asignatura)) dias.add(i + 1);
    }));
    if (!dias.size) return [];
    const libres = new Set();
    (window.APP && APP.eventos ? APP.eventos() : []).forEach((e) => {
      if (!/feriado|vacaciones/.test(e.tipo || "") || !/^\d{4}-\d\d-\d\d$/.test(e.fecha || "")) return;
      const hasta = e.fin && e.fin >= e.fecha ? e.fin : e.fecha;
      for (let f = e.fecha, i = 0; f <= hasta && i < 120; f = sumarDia(f), i++) libres.add(f);
    });
    const salida = [];
    let f = (pr && pr.hoy) || hoy();
    for (let i = 0; i < 45 && salida.length < 4; i++) {
      f = sumarDia(f);
      if (dias.has(diaSemana(f)) && !libres.has(f)) salida.push(f);
    }
    return salida;
  }
  // Indicaciones para imprimir: botones conocidos + texto libre (se guardan juntos en «comentario», separados por comas)
  const sinTildes = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const comentarioDe = (p) => INDICACIONES.filter((x) => p.indic.includes(x)).concat(p.otraIndic.trim()).filter(Boolean).join(", ");
  const leerIndicaciones = (texto) => {
    const partes = String(texto || "").split(/\s*[,;]\s*/).map((x) => x.trim()).filter(Boolean);
    const conocida = (y) => INDICACIONES.find((x) => sinTildes(x) === sinTildes(y));
    return { indic: INDICACIONES.filter((x) => partes.some((y) => conocida(y) === x)), otraIndic: partes.filter((y) => !conocida(y)).join(", ") };
  };
  const nuevaPrueba = () => {
    let u = {};
    try { u = JSON.parse(leer(ULTIMO) || "{}") || {}; } catch (e) { u = {}; }
    const mios = (info && info.yo && info.yo.cursos) || [];
    const cursos = st.filtro ? [st.filtro] : Array.isArray(u.cursos) && u.cursos.length ? u.cursos.slice() : mios.length === 1 ? [mios[0]] : [];
    return { paso: 1, cursos, asignatura: u.asignatura || "", tipo: TIPOS_PRUEBA[u.tipo] ? u.tipo : "prueba", fecha: "", indic: [], otraIndic: "", nuevo: null, desde: null, archivo: "" };
  };
  // Desde un envío anterior: para corregirlo o cambiarlo (mismo id) o para usar su archivo en otro curso (desde)
  const pruebaDesde = (p, reusar) => ({
    ...(reusar ? { paso: 2, desde: p.id, cursos: [], fecha: "" } : { paso: p.estado === "devuelta" ? "corregir" : 2, id: p.id, estado: p.estado, motivo: p.motivo, revisor: p.revisor, copias: p.copias, cursos: p.cursos.slice(), fecha: p.fecha }),
    asignatura: p.asignatura, tipo: p.tipo, archivo: p.archivo, nuevo: null, ...leerIndicaciones(p.comentario),
  });

  const pasosHtml = (n) => `<ol class="mc-pasos" aria-label="Pasos">${["Archivo", "Datos", "Listo"].map((t, i) =>
    `<li class="${i + 1 < n ? "listo" : i + 1 === n ? "on" : ""}"${i + 1 === n ? ' aria-current="step"' : ""}><b>${i + 1 < n ? "✓" : i + 1}</b>${t}</li>`).join("")}</ol>`;
  const zonaArchivo = (titulo, ayuda, boton) => `<label class="mc-zona" id="mcZona">${ICONO.subir}<strong>${titulo}</strong><small>${ayuda}</small>
      <span class="btn btn--grande" aria-hidden="true">${boton}</span><input id="pArchivo" type="file" accept="${ACEPTA}" class="mc-oculto"></label>`;
  const tarjetaArchivo = (p) => `<div class="mc-archivo">${ICONO.doc}<div>${p.nuevo ? `<strong>${esc(p.nuevo.name)}</strong><small>${peso(p.nuevo.size)}</small>`
      : `<strong>${esc(p.archivo)}</strong><small>${p.desde ? "El mismo archivo que enviaste antes" : "El archivo que ya enviaste"}</small>`}</div>
      <label class="mc-archivo__cambiar">Cambiar<input id="pArchivo" type="file" accept="${ACEPTA}" class="mc-oculto"></label></div>`;
  const chip = (attrs, on, texto, clase = "") => `<button type="button" class="mc-chip${clase}${on ? " on" : ""}" aria-pressed="${on}" ${attrs}>${texto}</button>`;

  function renderFormPrueba(c) {
    const p = st.prueba;
    if (!pr || pr.error) {
      if (!pr && !cargandoPr) cargarPruebas();
      c.innerHTML = `<div class="tarjeta mc"><h2>Enviar prueba o guía</h2>${pr ? `<p>${esc(pr.error)}</p>` : '<p class="vacio">Cargando…</p>'}
        <button type="button" class="btn-texto" data-mc="cancelarprueba">← Volver</button></div>`;
      return;
    }
    if (p.paso === 1) return renderPasoArchivo(c);
    if (p.paso === "corregir") return renderCorregir(c);
    return renderPasoDatos(c);
  }

  // Paso 1: el archivo, que es lo que el profesor ya tiene listo (o una prueba que ya envió)
  function renderPasoArchivo(c) {
    const vistos = new Set();
    const anteriores = pr.reusar ? pr.mias.filter((x) => x.conArchivo && x.estado !== "devuelta" && !vistos.has(x.archivo + x.tam) && vistos.add(x.archivo + x.tam)).slice(0, 4) : [];
    c.innerHTML = `<div class="tarjeta mc">
        <h2>Enviar prueba o guía</h2>${pasosHtml(1)}
        <div id="mcMsg">${msgHtml()}</div>
        ${zonaArchivo("Elige el archivo de tu prueba", "PDF o Word, hasta 15 MB. En el computador también puedes arrastrarlo aquí.", "Elegir archivo")}
        ${anteriores.length ? `<p class="mc-pregunta">¿Es una que ya enviaste?<small>Úsala de nuevo para otro curso sin volver a subirla</small></p>
          ${anteriores.map((x) => `<div class="mc-archivo mc-archivo--antes">${ICONO.doc}<div><strong>${esc(x.archivo)}</strong><small>${esc(x.asignatura)} · ${esc(x.cursos.join(", "))}</small></div>
            <button type="button" data-reusar="${esc(x.id)}" aria-label="Usar ${esc(x.archivo)}">Usar</button></div>`).join("")}` : ""}
        <button type="button" class="btn-texto" data-mc="cancelarprueba">Cancelar</button>
      </div>`;
  }

  // Paso 2: cada pregunta se responde con un toque
  function renderPasoDatos(c) {
    const p = st.prueba;
    const { mios, otros } = cursosPrueba();
    p.cursos = p.cursos.filter((x) => mios.includes(x) || otros.includes(x));
    const asigs = asignaturasDe(p.cursos);
    if (p.cursos.length && p.asignatura && !asigs.some((a) => a.nombre === p.asignatura)) p.asignatura = asigs.length === 1 ? asigs[0].nombre : "";
    if (!p.asignatura && asigs.length === 1) p.asignatura = asigs[0].nombre;
    const usadas = asignaturasUsadas().filter((n) => asigs.some((a) => a.nombre === n));
    const todasAsig = p.verOtrasAsig || !usadas.length || (p.asignatura && !usadas.includes(p.asignatura));
    const asigVer = todasAsig ? usadas.concat(asigs.map((a) => a.nombre).filter((n) => !usadas.includes(n))) : usadas;
    const electivo = (n) => (asigs.find((a) => a.nombre === n) || {}).electivo;
    const verOtros = p.verOtrosCursos || p.cursos.some((x) => otros.includes(x)) || !mios.length;
    const sugeridas = p.cursos.length && p.asignatura ? clasesDe(p.cursos[0], p.asignatura) : [];
    const fechaOtra = !sugeridas.length || p.otraFecha || (p.fecha && !sugeridas.includes(p.fecha));
    const etiquetaFecha = (f) => { const [, m, d] = f.split("-").map(Number); return `${DIAS_SEM[diaSemana(f)].slice(0, 3)}<small>${d} ${MESES[m - 1].slice(0, 3)}</small>`; };
    c.innerHTML = `<form class="tarjeta mc" id="mcPrueba" novalidate>
        <h2>${p.id ? (p.estado === "devuelta" ? "Corregir y reenviar" : "Cambiar envío") : "Enviar prueba o guía"}</h2>
        ${p.id ? "" : pasosHtml(2)}
        ${p.id && p.estado === "devuelta" && p.motivo ? `<p class="mc__motivo"><b>Comentario de UTP:</b> ${esc(p.motivo)}</p>` : ""}
        ${tarjetaArchivo(p)}
        <fieldset class="mc-grupo"><legend class="mc-pregunta">¿Qué es?</legend>
          <div class="mc-seg">${Object.entries(TIPOS_PRUEBA).map(([k, t]) => chip(`data-tipo="${k}"`, p.tipo === k, t)).join("")}</div></fieldset>
        <fieldset class="mc-grupo"><legend class="mc-pregunta">¿Para qué cursos?</legend>
          ${mios.length ? `<div class="mc-chips">${mios.map((x) => chip(`data-curso="${esc(x)}"`, p.cursos.includes(x), esc(x))).join("")}
            ${otros.length && !verOtros ? chip('data-mc="otroscursos"', false, "Otro curso", " mc-chip--mas") : ""}</div>` : ""}
          ${verOtros && otros.length ? `${mios.length ? '<p class="mc-sub">Otros cursos</p>' : ""}<div class="mc-chips">${otros.map((x) => chip(`data-curso="${esc(x)}"`, p.cursos.includes(x), esc(x))).join("")}</div>` : ""}
        </fieldset>
        <fieldset class="mc-grupo"><legend class="mc-pregunta">Asignatura${usadas.length && !todasAsig ? "<small>Las que ya usaste aparecen primero</small>" : ""}</legend>
          ${!p.cursos.length ? '<p class="mc-sub">Primero elige el curso.</p>'
            : !asigs.length ? '<p class="mc-sub">Esos cursos no comparten asignaturas: envía una por curso.</p>'
            : `<div class="mc-chips">${asigVer.map((n) => chip(`data-asig="${esc(n)}"`, p.asignatura === n, esc(n) + (electivo(n) ? " (electivo)" : ""))).join("")}
              ${!todasAsig ? chip('data-mc="otrasasig"', false, "Otra", " mc-chip--mas") : ""}</div>`}
        </fieldset>
        <fieldset class="mc-grupo"><legend class="mc-pregunta">¿Cuándo es la evaluación?${sugeridas.length ? `<small>Próximas clases de ${esc(p.asignatura)} en ${esc(p.cursos[0])}</small>` : ""}</legend>
          ${sugeridas.length ? `<div class="mc-chips">${sugeridas.map((f) => chip(`data-fecha="${f}"`, p.fecha === f && !fechaOtra, etiquetaFecha(f), " mc-chip--fecha")).join("")}
            ${chip('data-mc="otrafecha"', fechaOtra, "Otra<small>fecha</small>", " mc-chip--fecha mc-chip--mas")}</div>` : ""}
          ${fechaOtra ? `<label class="campo">${sugeridas.length ? "Otra fecha" : "Fecha de evaluación"}<input id="pFecha" type="date" min="${esc(pr.hoy || hoy())}" value="${esc(p.fecha)}"></label>` : ""}
        </fieldset>
        <fieldset class="mc-grupo"><legend class="mc-pregunta">¿Cómo se imprime?<small>Opcional. Toca lo que corresponda.</small></legend>
          <div class="mc-chips">${INDICACIONES.map((x) => chip(`data-indic="${x}"`, p.indic.includes(x), x)).join("")}
            ${chip('data-mc="otraindic"', !!(p.verOtraIndic || p.otraIndic), "Otra indicación", " mc-chip--mas")}</div>
          ${p.verOtraIndic || p.otraIndic ? `<label class="campo">Otra indicación<textarea id="pOtraIndic" maxlength="400" placeholder="Ej.: anillada, en color, la hoja 2 en tamaño carta">${esc(p.otraIndic)}</textarea></label>` : ""}
        </fieldset>
        <div class="mc-resumen" id="mcResumen" aria-live="polite">${resumenHtml()}</div>
        <div id="mcMsg">${msgHtml()}</div>
        <button class="btn btn--grande"${st.ocupado ? " disabled" : ""}>${p.id ? "Reenviar a UTP" : "Enviar a UTP"}</button>
        <button type="button" class="btn-texto" data-mc="cancelarprueba">Cancelar</button>
      </form>`;
  }

  // Lo que va a pasar: copias, fecha y aviso si llega con poca anticipación
  function resumenHtml() {
    const p = st.prueba;
    const k = p.cursos.length && p.asignatura ? copiasDe(p) : null;
    let html = !k ? `<p>Elige ${!p.cursos.length ? "el curso" : "la asignatura"} para ver cuántas copias se imprimirán.</p>`
      : k.faltan.length ? `<p>Falta la matrícula de ${esc(k.faltan.join(", "))}${k.electivo ? " en este electivo" : ""}: UTP escribirá las copias al aprobar.</p>`
      : `<p>Se imprimirán <strong>${k.total} copias</strong> (${k.alumnos} ${k.electivo ? "estudiantes del electivo" : "estudiantes"}${pr.extra ? ` + ${pr.extra} por curso` : ""})${p.fecha ? ` para el <strong>${esc(fechaCorta(p.fecha))}</strong>` : ""}. UTP la revisa antes.</p>`;
    if (p.fecha) {
      const h = habilesHasta(p.fecha);
      if (pr.anticipacion && h < pr.anticipacion) html += `<p class="mc__ojo">Ojo: quedan ${h} ${h === 1 ? "día hábil" : "días hábiles"} hasta la evaluación. UTP pide enviarlas con ${pr.anticipacion} de anticipación. Puedes enviarla igual.</p>`;
    }
    return html;
  }

  // Prueba devuelta: el comentario de UTP y un solo botón para subir el archivo corregido
  function renderCorregir(c) {
    const p = st.prueba;
    c.innerHTML = `<form class="tarjeta mc" id="mcPrueba" novalidate>
        <h2>Corregir y reenviar</h2>
        ${p.motivo ? `<p class="mc__motivo"><b>Comentario de UTP${p.revisor ? ` (${esc(p.revisor)})` : ""}:</b> ${esc(p.motivo)}</p>` : ""}
        <p class="mc-pregunta">${esc(TIPOS_PRUEBA[p.tipo] || "Prueba")} de ${esc(p.asignatura)} · ${esc(p.cursos.join(", "))}<small>Evaluación el ${esc(fechaCorta(p.fecha))}${p.copias ? ` · ${p.copias} copias` : ""}</small></p>
        ${p.nuevo ? tarjetaArchivo(p) : zonaArchivo("Sube el archivo corregido", "Lo demás queda igual: no tienes que llenar nada de nuevo.", "Elegir archivo corregido")}
        <div id="mcMsg">${msgHtml()}</div>
        ${p.nuevo ? `<button class="btn btn--grande"${st.ocupado ? " disabled" : ""}>Reenviar a UTP</button>` : ""}
        <button type="button" class="btn-texto" data-mc="cambiardatos">Cambiar curso, fecha o indicaciones</button>
        <button type="button" class="btn-texto" data-mc="cancelarprueba">Volver</button>
      </form>`;
  }

  // Paso 3: confirmación y lo que sigue
  function renderEnviada(c) {
    const e = st.enviada;
    const nombre = String((info.yo && info.yo.nombre) || "").trim().split(/\s+/)[0];
    const hora = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false });
    const tipo = (TIPOS_PRUEBA[e.tipo] || "Prueba").toLowerCase();
    c.innerHTML = `<div class="tarjeta mc">
        ${e.corregida ? "" : pasosHtml(3)}
        <div class="mc-ok"><span class="mc-ok__circulo">${ICONO.listo}</span><h2>¡Listo${nombre ? ", " + esc(nombre) : ""}!</h2>
          <p>Tu ${esc(tipo)} de ${esc(e.asignatura)} ${e.corregida ? "corregida " : ""}llegó a UTP.</p></div>
        <ol class="mc-linea">
          <li class="on"><b>✓</b><span><strong>Enviada</strong><small>Hoy, ${hora}</small></span></li>
          <li class="ahora"><b>2</b><span><strong>UTP la revisa</strong><small>Si pide un cambio, te llega un correo y lo verás en «Mis pruebas y guías».</small></span></li>
          <li><b>3</b><span><strong>Se imprime</strong><small>${e.copias ? `${e.copias} copias` : "Con las copias de tus cursos"}${e.comentario ? ` · ${esc(e.comentario)}` : ""}</small></span></li>
          <li><b>4</b><span><strong>Lista</strong><small>Antes de la evaluación del ${esc(fechaCorta(e.fecha))}</small></span></li>
        </ol>
        ${e.atrasada ? `<p class="mc__ojo">Llegó con menos días de anticipación de lo que pide UTP (${e.anticipacion} días hábiles). La verán igual.</p>` : ""}
        <button type="button" class="btn btn--grande" data-mc="nuevaprueba">Enviar otra</button>
        <button type="button" class="btn-texto" data-mc="inicio">Volver al inicio</button>
      </div>`;
  }

  // Elegir o arrastrar el archivo
  function elegirArchivo(f) {
    const p = st.prueba;
    if (!p || !f) return;
    if (!/\.(pdf|docx?)$/i.test(f.name)) return mensaje("Sube el archivo en PDF o Word (.docx).");
    if (f.size > PRUEBA_MAX) return mensaje(`El archivo pesa ${peso(f.size)}. El máximo es 15 MB: guárdalo como PDF o comprime las imágenes.`);
    p.nuevo = f; p.desde = null; st.msg = null;
    if (p.paso === 1) p.paso = 2;
    render();
    if (p.paso === 2) window.scrollTo(0, 0);
  }

  // Botones del formulario de la prueba: cada toque cambia una respuesta y vuelve a dibujar
  function elegirEnPrueba(b, a) {
    const p = st.prueba, d = b.dataset;
    const otra = $("pOtraIndic");
    if (otra) p.otraIndic = otra.value;
    if (a === "otroscursos") p.verOtrosCursos = true;
    else if (a === "otrasasig") p.verOtrasAsig = true;
    else if (a === "otrafecha") p.otraFecha = true;
    else if (a === "otraindic") { p.verOtraIndic = !(p.verOtraIndic || p.otraIndic); if (!p.verOtraIndic) p.otraIndic = ""; }
    else if (a === "cambiardatos") p.paso = 2;
    else if (d.tipo) p.tipo = d.tipo;
    else if (d.curso) p.cursos = p.cursos.includes(d.curso) ? p.cursos.filter((x) => x !== d.curso) : p.cursos.concat(d.curso);
    else if (d.asig) p.asignatura = d.asig;
    else if (d.fecha) { p.fecha = d.fecha; p.otraFecha = false; }
    else if (d.indic) {
      const opuesta = { "Doble cara": "Una cara", "Una cara": "Doble cara" }[d.indic];
      p.indic = p.indic.includes(d.indic) ? p.indic.filter((x) => x !== d.indic) : p.indic.filter((x) => x !== opuesta).concat(d.indic);
    } else return;
    st.msg = null;
    render();
    // El foco vuelve al mismo botón (para quien usa teclado o lector de pantalla), o al campo que se abrió
    const k = ["tipo", "curso", "asig", "fecha", "indic"].find((x) => d[x] != null);
    const foco = a === "otrafecha" ? $("pFecha") : a === "otraindic" && p.verOtraIndic ? $("pOtraIndic")
      : document.querySelector(a ? `#micurso [data-mc="${a}"]` : `#micurso [data-${k}="${CSS.escape(d[k])}"]`);
    if (foco) foco.focus({ preventScroll: true });
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
    x.upload.onprogress = (e) => { if (e.lengthComputable && cuerpo) { const b = document.querySelector("#mcPrueba button.btn--grande"); if (b) b.textContent = `Subiendo… ${Math.round(e.loaded / e.total * 100)} %`; } };
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
    const p = st.prueba;
    const otra = $("pOtraIndic");
    if (otra) p.otraIndic = otra.value;
    const f = $("pFecha");
    if (f && f.value) p.fecha = f.value;
    if (!p.nuevo && !p.desde && !p.id) return mensaje("Elige el archivo de la prueba o guía.");
    if (!p.cursos.length) return mensaje("Elige al menos un curso.");
    if (!p.asignatura) return mensaje("Elige la asignatura.");
    if (!p.fecha) return mensaje("Elige la fecha de evaluación.");
    const comentario = comentarioDe(p);
    await trabajar(async () => {
      const cuerpo = p.nuevo ? await leerArchivo(p.nuevo) : "";
      const j = await subirPrueba({ id: p.id, desde: p.nuevo ? undefined : p.desde || undefined, cursos: p.cursos, asignatura: p.asignatura, fecha: p.fecha, tipo: p.tipo,
        comentario, archivo: p.nuevo ? p.nuevo.name : p.archivo }, cuerpo);
      guardar(ULTIMO, JSON.stringify({ cursos: p.cursos, asignatura: p.asignatura, tipo: p.tipo }));
      pr.mias = [j.prueba, ...pr.mias.filter((x) => x.id !== j.prueba.id)];
      st.prueba = null;
      st.enviada = { ...j.prueba, corregida: !!p.id, atrasada: j.atrasada, anticipacion: j.anticipacion };
      render();
      window.scrollTo(0, 0);
    });
    const b = document.querySelector("#mcPrueba button.btn--grande");
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
    const b = e.target.closest("#micurso [data-mc], #micurso [data-editar], #micurso [data-borrar], #micurso [data-corregir], #micurso [data-retirar], #micurso [data-hijo], #micurso [data-reusar], #mcPrueba [data-tipo], #mcPrueba [data-curso], #mcPrueba [data-asig], #mcPrueba [data-fecha], #mcPrueba [data-indic]");
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
    else if (a === "recargarpruebas") { pr = null; render(); }
    else if (a === "viejas") { st.verViejas = !st.verViejas; render(); }
    else if (a === "inicio") { st.enviada = null; st.msg = null; render(); window.scrollTo(0, 0); }
    else if (a === "nuevaprueba") { st.enviada = null; st.prueba = nuevaPrueba(); st.msg = null; render(); window.scrollTo(0, 0); }
    else if (a === "cancelarprueba") { st.prueba = null; st.msg = null; render(); }
    else if (b.dataset.corregir) { const p = pr && pr.mias.find((x) => x.id === b.dataset.corregir); if (p) { st.prueba = pruebaDesde(p, false); st.msg = null; render(); window.scrollTo(0, 0); } }
    else if (b.dataset.reusar) { const p = pr && pr.mias.find((x) => x.id === b.dataset.reusar); if (p) { st.enviada = null; st.prueba = pruebaDesde(p, true); st.msg = null; render(); window.scrollTo(0, 0); } }
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
    else if (st.prueba && (a || b.closest("#mcPrueba"))) elegirEnPrueba(b, a);
  });
  document.addEventListener("change", (e) => {
    if (e.target.id === "mcFiltro") { st.filtro = e.target.value; render(); }
    else if (e.target.id === "pArchivo") elegirArchivo((e.target.files || [])[0]);
    else if (e.target.id === "pFecha" && st.prueba) { st.prueba.fecha = e.target.value; st.prueba.otraFecha = true; const r = $("mcResumen"); if (r) r.innerHTML = resumenHtml(); }
  });
  document.addEventListener("input", (e) => { if (e.target.id === "pOtraIndic" && st.prueba) st.prueba.otraIndic = e.target.value; });
  // En el computador, el archivo también se puede arrastrar a la zona
  document.addEventListener("dragover", (e) => { const z = e.target.closest && e.target.closest("#mcZona"); if (z) { e.preventDefault(); z.classList.add("encima"); } });
  document.addEventListener("dragleave", (e) => { const z = e.target.closest && e.target.closest("#mcZona"); if (z) z.classList.remove("encima"); });
  document.addEventListener("drop", (e) => {
    const z = e.target.closest && e.target.closest("#mcZona");
    if (!z) return;
    e.preventDefault(); z.classList.remove("encima");
    elegirArchivo((e.dataTransfer && e.dataTransfer.files || [])[0]);
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
