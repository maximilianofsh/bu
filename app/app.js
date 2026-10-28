/* ==========================================================
   App del colegio (/app/): Avisos, Horarios, Calendario y «Mi curso» (app/micurso.js).
   Lee lo mismo que el sitio (data/sitio.json), así que todo se edita en el panel:
   «Aviso urgente», «Horarios» y «Calendario escolar».
   Además, la pantalla «Inspectoría» (enlace al pie de Avisos) publica o apaga el aviso con una
   clave que revisa el servidor de notificaciones, sin entrar al panel.
   Funciona sin internet con la última copia guardada (ver app/sw.js).
   ========================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const BASE = new URL("../", location.href).href;
  // Rutas del sitio o enlaces web/correo/teléfono (igual que SITE.asset)
  const asset = (p) => {
    p = String(p || "").trim();
    if (!p) return "";
    if (/^(https?:|mailto:|tel:)/i.test(p)) return p;
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(p)) return "";
    return BASE + p.replace(/^\.?\//, "");
  };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const DIAS_SEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const TIPOS = { evento: "Actividad", reunion: "Reunión", acto: "Acto", evaluacion: "Evaluación", feriado: "Feriado", vacaciones: "Vacaciones" };
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const hoy = () => iso(new Date());
  const fin = (e) => (e.fin && e.fin >= e.fecha ? e.fin : e.fecha);

  let datos = null;

  /* ---------- Pestañas ---------- */
  const VISTAS = ["avisos", "horarios", "calendario", "micurso", "inspectoria"];
  const mostrarVista = (v) => {
    // colegiosm.cl/imprimir llega aquí: abre «Mi curso» y, al entrar el profesor, «Enviar prueba o guía»
    if (v === "imprimir") {
      if (window.MICURSO) MICURSO.pedirImprimir();
      history.replaceState(null, "", "#micurso");
      v = "micurso";
    }
    // El enlace del correo de invitación (#primeravez=correo) abre «Mi curso» en «Crear contraseña» con el correo escrito
    if (/^primeravez/.test(v)) {
      let correo = "";
      try { correo = decodeURIComponent(v.split("=")[1] || ""); } catch (e) { /* enlace incompleto */ }
      if (window.MICURSO) MICURSO.pedirPrimeraVez(correo);
      history.replaceState(null, "", "#micurso");
      v = "micurso";
    }
    if (!VISTAS.includes(v)) v = "avisos";
    VISTAS.forEach((x) => { $("vista-" + x).hidden = x !== v; });
    document.querySelectorAll(".tab").forEach((t) => {
      const activa = t.dataset.vista === v;
      t.classList.toggle("is-active", activa);
      t.setAttribute("aria-current", activa ? "page" : "false");
    });
    $("barraTitulo").textContent = $("vista-" + v).dataset.titulo;
    if (v === "avisos") marcarAvisoVisto();
    if (v === "inspectoria") renderInsp();
    if (v === "micurso" && window.MICURSO) { MICURSO.render(); if (datos) MICURSO.cargar(); }
    window.scrollTo(0, 0);
  };
  document.querySelector(".tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (!t) return;
    history.replaceState(null, "", t.dataset.vista === "avisos" ? location.pathname : "#" + t.dataset.vista);
    mostrarVista(t.dataset.vista);
  });
  window.addEventListener("hashchange", () => mostrarVista(location.hash.slice(1)));
  // Inspectoría usa su propia app (/inspectoria/); quien ya entró aquí conserva su pestaña «Publicar»
  // Botones que llevan a otra pestaña (por ejemplo, «Ver horario completo»)
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-ir-vista]");
    if (b) document.querySelector(`.tab[data-vista="${b.dataset.irVista}"]`).click();
  });

  /* ---------- Colores del panel ---------- */
  const aplicarColores = (c) => {
    if (!c) return;
    const r = document.documentElement.style;
    if (c.primario) { r.setProperty("--primario", c.primario); document.querySelector('meta[name="theme-color"]').content = c.primario; }
    if (c.secundario) r.setProperty("--secundario", c.secundario);
    if (c.acento) r.setProperty("--acento", c.acento);
    guardar("csm-app-colores", JSON.stringify(c));
  };
  try { aplicarColores(JSON.parse(leer("csm-app-colores") || "null")); } catch (e) { /* nada guardado */ }

  /* ---------- Avisos ---------- */
  const avisoVigente = (a) => a && a.activo && (a.titulo || a.texto) && !(a.hasta && new Date(a.hasta) < new Date()) && !(a.desde && new Date(a.desde) > new Date()) ? a : null;
  const claveAviso = (a) => [a.titulo, a.texto, a.hasta].join("|");
  const marcarAvisoVisto = () => {
    const a = datos && avisoVigente(datos.aviso);
    if (a) guardar("csm-app-aviso-visto", claveAviso(a));
    $("puntoAviso").hidden = true;
  };

  // Con aviso, va arriba de todo; sin aviso, la tarjeta «Sin avisos» va después del día del curso
  const renderAviso = (a) => {
    const caja = $("avisoActual");
    a = avisoVigente(a);
    if (!a) {
      caja.innerHTML = "";
      $("sinAviso").innerHTML = `<div class="tarjeta sin-aviso"><span class="sin-aviso__ico" aria-hidden="true">✓</span>
        <div><strong>Sin avisos por ahora</strong><p>Si hay una emergencia o un cambio en la jornada, aparecerá aquí.</p></div></div>`;
      $("puntoAviso").hidden = true;
      return;
    }
    $("sinAviso").innerHTML = "";
    const nivel = ["urgente", "importante", "info"].includes(a.nivel) ? a.nivel : "urgente";
    const enlace = asset(a.enlace);
    caja.innerHTML = `<article class="alerta alerta--${nivel}" role="${nivel === "urgente" ? "alert" : "status"}">
        <span class="alerta__nivel">${{ urgente: "Urgente", importante: "Importante", info: "Información" }[nivel]}</span>
        ${a.titulo ? `<h2 class="alerta__titulo">${esc(a.titulo)}</h2>` : ""}
        ${a.texto ? `<p class="alerta__texto">${esc(a.texto)}</p>` : ""}
        ${enlace ? `<a class="alerta__link" href="${esc(enlace)}" target="_blank" rel="noopener">${esc(a.textoEnlace || "Más información")} →</a>` : ""}
      </article>`;
    const visto = leer("csm-app-aviso-visto") === claveAviso(a);
    $("puntoAviso").hidden = visto || !$("vista-avisos").hidden;
    if (!$("vista-avisos").hidden) marcarAvisoVisto();
  };

  /* ---------- Eventos (inicio y calendario) ---------- */
  const rango = (e) => {
    const [y, m, d] = e.fecha.split("-").map(Number);
    if (fin(e) === e.fecha) return `${DIAS_SEM[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`;
    const [y2, m2, d2] = fin(e).split("-").map(Number);
    if (m === m2 && y === y2) return `${d} al ${d2} de ${MESES[m - 1]}`;
    return `${d} de ${MESES[m - 1]} al ${d2} de ${MESES[m2 - 1]}`;
  };
  const evento = (e) => {
    const [, m, d] = e.fecha.split("-").map(Number);
    const tipo = TIPOS[e.tipo] ? e.tipo : "evento";
    const enlace = asset(e.enlace);
    const ahora = e.fecha <= hoy() && fin(e) >= hoy();
    return `<article class="evento evento--${tipo}">
        <div class="evento__fecha"><span>${d}</span><small>${MESES[m - 1].slice(0, 3)}</small></div>
        <div class="evento__info">
          <span class="evento__tipo">${esc(TIPOS[tipo])}${ahora ? ' · <b>Hoy</b>' : ""}</span>
          <h3>${esc(e.titulo)}</h3>
          <p class="evento__meta">${esc(rango(e))}${e.hora ? ` · ${esc(e.hora)}` : ""}${e.lugar ? ` · ${esc(e.lugar)}` : ""}</p>
          ${e.descripcion ? `<p class="evento__desc">${esc(e.descripcion)}</p>` : ""}
          ${enlace ? `<a class="evento__link" href="${esc(enlace)}" target="_blank" rel="noopener">Más información →</a>` : ""}
        </div>
      </article>`;
  };
  const eventosValidos = () => (Array.isArray(datos.eventos) ? datos.eventos : [])
    .filter((e) => e && e.titulo && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha || ""))
    .sort((a, b) => (a.fecha + (a.hora || "")).localeCompare(b.fecha + (b.hora || "")));

  const renderProximos = () => {
    const lista = eventosValidos().filter((e) => fin(e) >= hoy()).slice(0, 3);
    $("proximos").innerHTML = lista.length ? lista.map(evento).join("") + '<button type="button" class="btn-texto" data-ir="calendario">Ver todo el calendario →</button>'
      : '<p class="vacio">No hay eventos próximos publicados.</p>';
  };
  $("proximos").addEventListener("click", (e) => { if (e.target.closest("[data-ir]")) document.querySelector('.tab[data-vista="calendario"]').click(); });

  let verPasados = false;
  const renderCalendario = () => {
    const todos = eventosValidos();
    const lista = verPasados ? todos : todos.filter((e) => fin(e) >= hoy());
    let mes = "", html = "";
    lista.forEach((e) => {
      const k = e.fecha.slice(0, 7);
      if (k !== mes) {
        mes = k;
        const [y, m] = k.split("-").map(Number);
        html += `<h2 class="mes">${MESES[m - 1][0].toUpperCase() + MESES[m - 1].slice(1)} ${y}</h2>`;
      }
      html += evento(e);
    });
    const hayPasados = todos.some((e) => fin(e) < hoy());
    // Suscribirse desde el celular: el calendario del colegio aparece en Google Calendar o en el del iPhone
    const ics = new URL("../calendario/colegio.ics", location.href).href;
    const webcal = ics.replace(/^https?:/, "webcal:");
    const apple = /iphone|ipad|ipod|macintosh/i.test(navigator.userAgent);
    const suscribir = `<div class="tarjeta suscribir"><strong>Agregar a mi calendario</strong>
      <p>Suma todas las fechas del colegio al calendario de tu celular. Se actualiza solo.</p>
      <div class="acciones"><a class="btn" href="${esc(apple ? webcal : "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal))}"${apple ? "" : ' target="_blank" rel="noopener"'}>${apple ? "Agregar al calendario del iPhone" : "Agregar a Google Calendar"}</a></div></div>`;
    $("calendario").innerHTML = suscribir + (html || '<p class="vacio">No hay eventos próximos publicados.</p>') +
      (hayPasados ? `<button type="button" class="btn-texto" id="togglePasados">${verPasados ? "Ocultar eventos pasados" : "Ver también eventos pasados"}</button>` : "");
  };
  $("calendario").addEventListener("click", (e) => { if (e.target.id === "togglePasados") { verPasados = !verPasados; renderCalendario(); } });

  /* ---------- Horarios: un día a la vez ---------- */
  const H = window.HORARIOS;
  let dia = Math.min(Math.max(new Date().getDay() - 1, 0), 4);
  if (new Date().getDay() === 0 || new Date().getDay() === 6) dia = 0;
  const horaPartes = (t) => String(t || "").split(/\s*[-–—]\s*|\s+a\s+/).filter(Boolean);
  const minutos = (t) => { const m = /(\d{1,2})[:.](\d{2})/.exec(t || ""); return m ? +m[1] * 60 + +m[2] : null; };
  const desdeDe = (it) => horaPartes(it.ini)[0] || it.ini;
  const hastaDe = (it) => { const y = horaPartes(it.fin); return y[y.length - 1] || it.fin; };
  // Bloques de un día, con los iguales seguidos juntos (por ejemplo, un bloque doble)
  const bloquesDel = (hor, d) => {
    const items = [];
    (hor.filas || []).forEach((f) => {
      const p = H.pausa(f);
      const txt = p || String((f.celdas || [])[d] || "").trim();
      const ult = items[items.length - 1];
      if (ult && txt && !p && !ult.pausa && H.norm(ult.txt) === H.norm(txt)) { ult.fin = f.hora; return; }
      items.push({ txt, pausa: !!p, ini: f.hora, fin: f.hora });
    });
    while (items.length && (items[0].pausa || !items[0].txt)) items.shift();
    while (items.length && (items[items.length - 1].pausa || !items[items.length - 1].txt)) items.pop();
    return items;
  };
  const nombreBloque = (txt) => { const e = H.electivos(txt); return e ? e.map((x) => x.asignatura).join(" / ") : H.partes(txt).asignatura; };

  /* ---------- Inicio: el día del curso guardado en este celular ----------
     Hoy hasta que terminan las clases; después, el fin de semana o en feriados, el próximo día con clases. */
  const diaLibre = (f) => eventosValidos().some((e) => /^(feriado|vacaciones)$/.test(e.tipo) && e.fecha <= f && fin(e) >= f);
  const renderHoy = () => {
    const caja = $("hoyCurso");
    const hs = (datos.horarios && datos.horarios.cursos) || [];
    const hor = hs.find((x) => x.nombre === leer("csm-app-curso"));
    if (!hs.length) { caja.innerHTML = ""; return; }
    if (!hor) {
      caja.innerHTML = `<div class="tarjeta hoy-elegir"><strong>Las clases de tu curso, de un vistazo</strong>
        <p>Elige el curso y aquí verás cada día qué clases tiene y cuál está ahora.</p>
        <div class="acciones"><button type="button" class="btn" data-ir-vista="horarios">Elegir curso</button></div></div>`;
      return;
    }
    const ahora = new Date();
    const ahoraMin = ahora.getHours() * 60 + ahora.getMinutes();
    const t = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    let items = [], cuando = "";
    for (let i = 0; i < 21 && !items.length; i++, t.setDate(t.getDate() + 1)) {
      const d = t.getDay() - 1;
      if (d < 0 || d > 4 || diaLibre(iso(t))) continue;
      const its = bloquesDel(hor, d).filter((x) => x.txt);
      if (!its.length) continue;
      if (i === 0 && minutos(hastaDe(its[its.length - 1])) != null && ahoraMin >= minutos(hastaDe(its[its.length - 1]))) continue;
      items = its;
      cuando = i === 0 ? "Hoy" : i === 1 ? "Mañana" : `${DIAS_SEM[t.getDay()][0].toUpperCase() + DIAS_SEM[t.getDay()].slice(1)} ${t.getDate()}`;
    }
    if (!items.length) { caja.innerHTML = ""; return; }
    const esAhora = (it) => { const a = minutos(desdeDe(it)), b = minutos(hastaDe(it)); return cuando === "Hoy" && a != null && b != null && ahoraMin >= a && ahoraMin < b; };
    const actual = items.find(esAhora);
    const titulo = actual ? `Ahora: ${nombreBloque(actual.txt)}` : cuando === "Hoy" ? "Las clases de hoy" : `Las clases ${cuando === "Mañana" ? "de mañana" : "del " + cuando.toLowerCase()}`;
    caja.innerHTML = `<section class="hoy" aria-label="Clases de ${esc(hor.nombre)}">
        <small>${esc(cuando)} en ${esc(hor.nombre)}</small><h2>${esc(titulo)}</h2>
        <ol>${items.filter((it) => !it.pausa).map((it) => `<li${esAhora(it) ? ' class="es-ahora"' : ""}><span>${esc(desdeDe(it))} – ${esc(hastaDe(it))}</span><strong>${esc(nombreBloque(it.txt))}</strong>${esAhora(it) ? "<em>Ahora</em>" : ""}</li>`).join("")}</ol>
        <button type="button" class="btn-texto" data-ir-vista="horarios">Ver horario completo →</button>
      </section>`;
  };
  setInterval(() => { if (datos && !$("vista-avisos").hidden) renderHoy(); }, 60000);

  const renderHorario = () => {
    const hs = (datos.horarios && datos.horarios.cursos) || [];
    const sel = $("curso");
    if (!hs.length) {
      sel.innerHTML = ""; sel.disabled = true;
      $("dias").innerHTML = "";
      $("bloques").innerHTML = '<li class="vacio">Aún no hay horarios publicados.</li>';
      return;
    }
    const colores = datos.horarios.colores || {};
    if (sel.options.length !== hs.length) {
      sel.innerHTML = '<option value="">Elige el curso…</option>' + hs.map((x, i) => `<option value="${i}">${esc(x.nombre)}</option>`).join("");
      const guardado = hs.findIndex((x) => x.nombre === leer("csm-app-curso"));
      sel.value = guardado >= 0 ? String(guardado) : "";
    }
    const hor = hs[+sel.value];
    $("dias").innerHTML = H.DIAS.map((d, i) => `<button type="button" class="dia${i === dia ? " is-active" : ""}" data-dia="${i}">${d.slice(0, 3)}</button>`).join("");
    if (!hor || sel.value === "") {
      $("bloques").innerHTML = '<li class="vacio">Elige el curso para ver su horario. Quedará guardado en este celular.</li>';
      return;
    }
    const items = bloquesDel(hor, dia);
    const desde = desdeDe, hasta = hastaDe;
    // Bloque que está ocurriendo ahora (solo si se mira el día de hoy)
    const ahoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    const esHoy = new Date().getDay() - 1 === dia;
    const caja = (asig, detalle, grupo) => {
      const bg = H.color(asig, colores);
      return `<div class="bloque__caja" style="--c:${esc(bg)};--t:${H.tinta(bg)}">${grupo ? `<em>${esc(grupo)}</em>` : ""}<strong>${esc(asig)}</strong>${detalle ? `<span>${esc(detalle)}</span>` : ""}</div>`;
    };
    const contenido = (txt) => {
      const e = H.electivos(txt);
      if (e) return `<div class="bloque__split">${e.map((x) => caja(x.asignatura, x.detalle, x.grupo)).join("")}</div>`;
      const p = H.partes(txt);
      return caja(p.asignatura, p.detalle);
    };
    $("bloques").innerHTML = items.filter((it) => it.txt).map((it) => {
      const a = minutos(desde(it)), b = minutos(hasta(it));
      const ahora = esHoy && a != null && b != null && ahoraMin >= a && ahoraMin < b;
      if (it.pausa) return `<li class="bloque bloque--pausa${ahora ? " es-ahora" : ""}"><span class="bloque__hora">${esc(desde(it))}</span><span>${esc(it.txt)}</span></li>`;
      return `<li class="bloque${ahora ? " es-ahora" : ""}"><span class="bloque__hora">${esc(desde(it))}<small>${esc(hasta(it))}</small></span>${contenido(it.txt)}${ahora ? '<span class="bloque__ahora">Ahora</span>' : ""}</li>`;
    }).join("") || '<li class="vacio">Sin clases este día.</li>';
  };
  $("curso").addEventListener("change", (e) => {
    const hs = (datos.horarios && datos.horarios.cursos) || [];
    if (hs[+e.target.value] && e.target.value !== "") guardar("csm-app-curso", hs[+e.target.value].nombre);
    renderHorario();
    renderHoy();
  });
  $("dias").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dia]");
    if (b) { dia = +b.dataset.dia; renderHorario(); }
  });

  /* ---------- Instalar la app ---------- */
  const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let pedidoInstalar = null;
  const renderInstalar = () => {
    const caja = $("instalar");
    if (instalada || leer("csm-app-instalar-cerrado")) { caja.hidden = true; return; }
    if (ios) {
      caja.innerHTML = `<strong>Instala la app en tu iPhone</strong>
        <ol><li>Toca el botón <b>Compartir</b> <span class="ico-compartir" aria-hidden="true">⬆︎</span> de Safari.</li><li>Elige <b>«Agregar a inicio»</b>.</li><li>Abre la app desde el ícono nuevo.</li></ol>
        <button type="button" class="btn-texto" data-cerrar>Ahora no</button>`;
      caja.hidden = false;
    } else if (pedidoInstalar) {
      caja.innerHTML = `<strong>Instala la app en tu celular</strong><p>Quedará como un ícono y podrás ver horarios y calendario sin internet.</p>
        <div class="acciones"><button type="button" class="btn" data-instalar>Instalar app</button><button type="button" class="btn-texto" data-cerrar>Ahora no</button></div>`;
      caja.hidden = false;
    } else caja.hidden = true;
  };
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); pedidoInstalar = e; renderInstalar(); });
  window.addEventListener("appinstalled", () => { pedidoInstalar = null; $("instalar").hidden = true; });
  $("instalar").addEventListener("click", async (e) => {
    if (e.target.closest("[data-instalar]") && pedidoInstalar) { pedidoInstalar.prompt(); await pedidoInstalar.userChoice; pedidoInstalar = null; renderInstalar(); }
    if (e.target.closest("[data-cerrar]")) { guardar("csm-app-instalar-cerrado", "1"); $("instalar").hidden = true; }
  });

  /* ---------- Notificaciones (servidor propio en Cloudflare: ver servidor/GUIA.md) ---------- */
  const servidor = () => {
    const u = String((datos && datos.app && datos.app.servidor) || "").trim().replace(/\/+$/, "");
    return /^https:\/\/[a-z0-9.-]+$/i.test(u) ? u : "";
  };
  const soportaPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const deB64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  const avisarServidor = async (ruta, sub) => {
    const r = await fetch(servidor() + ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
    if (!r.ok) throw new Error("servidor " + r.status);
  };
  const suscripcion = async () => {
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  };
  const conTiempo = (p, ms) => Promise.race([p, new Promise((ok) => setTimeout(() => ok(null), ms))]);
  // Pide permiso, suscribe este celular y lo registra en el servidor del colegio
  const activarNotificaciones = async () => {
    if ((await Notification.requestPermission()) !== "granted") throw new Error("permiso");
    const r = await fetch(servidor() + "/clave");
    if (!r.ok) throw new Error("clave");
    const clave = deB64((await r.json()).clave);
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: clave });
    await avisarServidor("/suscribir", sub);
    guardar("csm-app-notif-sync", String(Date.now()));
  };
  let ocupadoNotif = false;
  const renderNotif = async (mensaje) => {
    const caja = $("notificaciones");
    if (!servidor()) { caja.hidden = true; return; }
    caja.hidden = false;
    const titulo = '<strong>Alertas en tu celular</strong>';
    const extra = !mensaje ? "" : mensaje.startsWith("ok:") ? `<p class="notif__ok">${esc(mensaje.slice(3))}</p>` : `<p class="notif__error">${esc(mensaje)}</p>`;
    if (!soportaPush) {
      caja.innerHTML = titulo + (ios && !instalada
        ? "<p>Para recibir alertas en iPhone, primero instala la app con «Agregar a inicio» y ábrela desde el ícono.</p>"
        : "<p>Este navegador no permite notificaciones. Prueba con Chrome, o en iPhone instala la app con «Agregar a inicio».</p>");
      return;
    }
    if (Notification.permission === "denied") {
      caja.innerHTML = titulo + "<p>Las notificaciones están bloqueadas para esta app. Actívalas en los ajustes del celular (Notificaciones) y vuelve a abrirla.</p>";
      return;
    }
    let sub = null;
    try { sub = await suscripcion(); } catch (e) { /* sin trabajador todavía */ }
    if (sub && Notification.permission === "granted") {
      caja.classList.add("notif--ok");
      caja.innerHTML = `${titulo}<p>Activadas. Te avisaremos si hay una emergencia o si hay que retirar antes a los estudiantes, y la tarde anterior a fechas importantes del calendario (evaluaciones, reuniones, feriados).</p>${extra}
        <div class="acciones"><button type="button" class="btn-texto" data-notif="probar">Enviar una prueba a este celular</button><button type="button" class="btn-texto" data-notif="no">Desactivar</button></div>`;
      // Cada semana se confirma al servidor que este celular sigue activo
      const hace = Date.now() - +(leer("csm-app-notif-sync") || 0);
      if (hace > 7 * 864e5) avisarServidor("/suscribir", sub).then(() => guardar("csm-app-notif-sync", String(Date.now()))).catch(() => {});
      return;
    }
    caja.classList.remove("notif--ok");
    caja.innerHTML = `${titulo}<p>Recibe una notificación si hay una emergencia, una suspensión de clases o si hay que retirar antes a los estudiantes. También te recordamos la tarde anterior las fechas importantes del calendario.</p>${extra}
      <div class="acciones"><button type="button" class="btn btn--grande" data-notif="si">Activar notificaciones</button></div>`;
  };
  $("notificaciones").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-notif]");
    if (!b || ocupadoNotif) return;
    ocupadoNotif = true; b.disabled = true; b.textContent = "Un momento…";
    let error = "";
    try {
      if (b.dataset.notif === "probar") {
        const sub = await suscripcion();
        if (!sub) throw new Error("sin-sub");
        // El trabajador reconoce la prueba y muestra «Prueba recibida»
        await (await caches.open("csm-prueba")).put(new URL("__prueba", location.href).pathname, new Response(String(Date.now())));
        const r = await fetch(servidor() + "/probar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
        const j = await r.json().catch(() => ({}));
        if (r.status === 404 && j.error) throw new Error("msg:" + j.error);
        if (!j.ok) throw new Error("msg:" + (j.estado === 410 || j.estado === 404
          ? "Este celular ya no estaba registrado. Toca «Activar notificaciones» de nuevo."
          : `El servicio de notificaciones respondió ${j.estado || r.status}${j.detalle ? ` (${j.detalle})` : ""}. Envía una captura de este mensaje a quien administra el sitio.`));
        error = "ok:Prueba enviada. Debería llegar en unos segundos. Si no llega, revisa que las notificaciones de esta app estén permitidas en Ajustes.";
      } else if (b.dataset.notif === "si") {
        await activarNotificaciones();
      } else {
        const sub = await suscripcion();
        if (sub) { await avisarServidor("/baja", sub).catch(() => {}); await sub.unsubscribe(); }
      }
    } catch (err) {
      error = err.message === "permiso" ? "No se dio permiso para mostrar notificaciones."
        : err.message.startsWith("msg:") ? err.message.slice(4)
        : "No se pudo completar. Revisa tu conexión e inténtalo de nuevo.";
    }
    ocupadoNotif = false;
    renderNotif(error);
  });


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
    $("tabInsp").hidden = !sesion();
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
          <p>Escribe la clave para publicar avisos en el sitio y en la app. Este celular quedará con el acceso abierto.</p>
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
        <div class="insp__pie"><button type="button" class="btn-texto" data-insp="salir">Cerrar sesión en este celular</button></div>
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
      renderAviso(datos.aviso);
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
  const pintarTodo = () => {
    aplicarColores(datos.colores);
    renderAviso(datos.aviso);
    renderHoy();
    if (window.MICURSO) { MICURSO.pintarInicio(); MICURSO.refrescar(); }
    renderProximos();
    renderCalendario();
    renderHorario();
    if (!ocupadoNotif) renderNotif();
    renderInspEstado();
    if (!$("vista-inspectoria").hidden && !inspOcupado && !$("inspForm") && !$("inspEntrar")) renderInsp();
    // «Mi curso» (app/micurso.js) necesita la dirección del servidor, que viene en los datos
    if (window.MICURSO && !$("vista-micurso").hidden && !$("micurso").querySelector("form")) { MICURSO.render(); MICURSO.cargar(); }
  };
  // Lo que usa «Mi curso»: el servidor y elegir el curso del horario al entrar un apoderado
  window.APP = {
    servidor: () => servidor(),
    // Para sugerir fechas de evaluación: filas del horario de un curso y fechas del calendario escolar
    horario: (nombre) => (((datos && datos.horarios && datos.horarios.cursos) || []).find((x) => x.nombre === nombre) || {}).filas || [],
    eventos: () => (datos && datos.eventos) || [],
    elegirCurso: (nombre) => {
      if (leer("csm-app-curso") || !datos) return;
      const hs = (datos.horarios && datos.horarios.cursos) || [];
      if (!hs.some((x) => x.nombre === nombre)) return;
      guardar("csm-app-curso", nombre);
      $("curso").innerHTML = "";
      renderHorario();
      renderHoy();
    },
    // Notificaciones de este celular, para que «Mi curso» avise a los profesores cuando UTP revisa sus pruebas
    notificaciones: {
      estado: async () => (!servidor() ? "sin-servidor" : !soportaPush ? "no-soporta" : Notification.permission === "denied" ? "bloqueadas"
        : Notification.permission === "granted" && (await conTiempo(suscripcion(), 3000).catch(() => null)) ? "activas" : "inactivas"),
      endpoint: async () => { const s = await conTiempo(suscripcion(), 3000).catch(() => null); return s ? s.endpoint : null; },
      activar: async () => { await activarNotificaciones(); renderNotif(); const s = await suscripcion(); return s && s.endpoint; },
    },
  };
  const cargar = async () => {
    try {
      const res = await fetch("../data/sitio.json", { cache: "no-store" });
      if (!res.ok) throw new Error(res.status);
      datos = await res.json();
      const desdeRed = navigator.onLine;
      // Un aviso recién publicado desde Inspectoría se ve aquí antes de que el sitio se actualice
      if (desdeRed && servidor()) {
        try {
          const r = await fetch(servidor() + "/aviso", { cache: "no-store" });
          const directo = r.ok ? (await r.json()).aviso : null;
          if (directo) datos.aviso = directo;
        } catch (e) { /* se usa el del sitio */ }
      }
      $("sinRed").hidden = desdeRed;
      if (desdeRed) guardar("csm-app-actualizado", new Date().toISOString());
      const f = new Date(leer("csm-app-actualizado") || Date.now());
      $("actualizado").textContent = (desdeRed ? "Actualizado" : "Sin conexión. Datos guardados del") + ` ${f.toLocaleDateString("es-CL", { day: "numeric", month: "long" })} a las ${f.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false })}.`;
      pintarTodo();
    } catch (e) {
      if (!datos) $("avisoActual").innerHTML = '<div class="tarjeta"><strong>No se pudo cargar la información.</strong><p>Revisa tu conexión a internet e inténtalo de nuevo.</p></div>';
    }
  };
  window.addEventListener("online", cargar);
  window.addEventListener("offline", () => { $("sinRed").hidden = false; });
  // Al volver a la app, revisa si hay avisos nuevos
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") cargar(); });

  mostrarVista(location.hash.slice(1));
  renderInstalar();
  cargar();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* sin modo sin conexión */ });
})();
