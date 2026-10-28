/* ==========================================================
   Modo demostración: el servidor del colegio funcionando dentro del navegador.
   Sirve para ver y probar la app (/app/) y el panel (/admin/) en una copia del sitio
   sin Cloudflare: corre el mismo código de servidor/notificaciones.js, con una base de
   datos SQLite en el navegador (demo/vendor/sql-asm.js) y datos inventados.
   - Nada sale del navegador: los correos, GitHub y las notificaciones se simulan.
   - Lo que se hace queda guardado en este navegador; «Reiniciar demostración» lo borra.
   - En colegiosm.cl no hace nada.
   ========================================================== */
(function () {
  "use strict";
  if (/(^|\.)colegiosm\.cl$/i.test(location.hostname)) return;

  const SERVIDOR = "https://demo.colegio-demo.workers.dev";
  const RAIZ = new URL("../", document.currentScript.src).href;
  const DATOS = new URL("data/sitio.json", RAIZ).href;
  const TOKEN = "demo-sin-token-real";
  const CLAVE = "colegio-demo";
  const VERSION = "2026-10-28-invitar";
  const env = { CORREO_URL: "https://script.google.com/macros/s/demo/exec", CORREO_CLAVE: "demo", GITHUB_TOKEN: TOKEN, CLAVE_INSPECTORIA: "inspectoria-demo" };
  const CUENTAS_PANEL = [
    { correo: "utp@colegiosm.cl", nombre: "Carolina Díaz", cargo: "UTP primer ciclo", permisos: ["noticias", "cursos", "pruebas"] },
    { correo: "direccion@colegiosm.cl", nombre: "Isabel Fuentes", cargo: "Directora", permisos: ["noticias", "aviso", "eventos", "galeria", "contenido", "cursos", "listas", "mensajes"] },
    { correo: "inspectoria@colegiosm.cl", nombre: "Patricia Muñoz", cargo: "Inspectora General", permisos: ["aviso"] },
    { correo: "impresiones@colegiosm.cl", nombre: "Luis Vega", cargo: "Encargado de impresiones", permisos: ["impresiones"] },
    { correo: "sostenedora@colegiosm.cl", nombre: "Elena Castro", cargo: "Sostenedora", permisos: ["todo"] },
  ];
  const PROFES = [
    { correo: "ana.rojas@colegiosm.cl", nombre: "Ana Rojas", cursos: ["5° básico A", "5° básico B", "6° básico A"] },
    { correo: "pedro.lagos@colegiosm.cl", nombre: "Pedro Lagos", cursos: ["3° básico A", "3° básico B"] },
    { correo: "marcela.tapia@colegiosm.cl", nombre: "Marcela Tapia", cursos: ["1° básico A", "2° básico A"] },
  ];
  // Profesores que aún no entran (para probar «Invitar por correo» en el panel)
  const SIN_ENTRAR = [
    { correo: "jorge.pinto@colegiosm.cl", nombre: "Jorge Pinto", cursos: ["4° básico A"] },
    { correo: "sofia.mora@colegiosm.cl", nombre: "Sofía Mora", cursos: ["2° básico A", "2° básico B"] },
  ];
  const ESTUDIANTES = [
    { rut: "25111222-3", nombre: "Tomás Herrera Soto", curso: "5° básico A", correo: "herrera.soto.tomas@colegiosm.cl" },
    { rut: "25333444-5", nombre: "Josefa Pinto Vera", curso: "5° básico A", correo: "pinto.vera.josefa@colegiosm.cl" },
    { rut: "25555666-7", nombre: "Matías Araya Cid", curso: "5° básico B", correo: "araya.cid.matias@colegiosm.cl" },
  ];

  /* ---------- Guardado en el navegador (IndexedDB) ---------- */
  const abrirBase = () => new Promise((ok, mal) => {
    const r = indexedDB.open("csm-demo", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => mal(r.error);
  });
  const kv = async (modo, fn) => { const b = await abrirBase(); return new Promise((ok, mal) => { const t = b.transaction("kv", modo); const s = t.objectStore("kv"); const r = fn(s); t.oncomplete = () => ok(r && r.result); t.onerror = () => mal(t.error); }); };
  const leerKv = (k) => kv("readonly", (s) => s.get(k));
  const guardarKv = (k, v) => kv("readwrite", (s) => s.put(v, k));
  const borrarTodo = () => kv("readwrite", (s) => s.clear());

  /* ---------- Base de datos con la forma de Cloudflare D1, sobre SQLite (sql.js) ---------- */
  function baseD1(db) {
    const filas = (sql, args) => {
      const st = db.prepare(sql);
      try { st.bind(args); const out = []; while (st.step()) out.push(st.getAsObject()); return out; } finally { st.free(); }
    };
    const norm = (a) => a.map((v) => (v === undefined ? null : typeof v === "boolean" ? +v : v));
    const sentencia = (sql, args = []) => ({
      bind: (...a) => sentencia(sql, norm(a)),
      async first(col) { const r = filas(sql, args)[0]; return r ? (col ? r[col] : r) : null; },
      async all() { return { success: true, results: filas(sql, args) }; },
      async run() { filas(sql, args); return { success: true, meta: { changes: db.getRowsModified(), last_row_id: filas("SELECT last_insert_rowid() AS id", [])[0].id } }; },
      async raw() { return filas(sql, args).map((r) => Object.values(r)); },
      ejecutar: () => ({ success: true, results: filas(sql, args) }),
    });
    return {
      prepare: (sql) => sentencia(sql),
      async batch(lista) {
        db.exec("BEGIN");
        try { const r = lista.map((s) => s.ejecutar()); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
      },
    };
  }

  /* ---------- Lo que el servidor pide afuera: todo simulado ---------- */
  const fetchReal = window.fetch.bind(window);
  let archivos = {};          // archivos que el panel «guardó en GitHub» durante la demostración
  let correos = [];           // correos que se habrían enviado
  const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = (t) => Uint8Array.from(atob(String(t).replace(/\s/g, "")), (c) => c.charCodeAt(0));
  async function leerArchivo(ruta) {
    if (archivos[ruta]) return archivos[ruta];
    const r = await fetchReal(new URL(ruta, RAIZ).href, { cache: "no-store" });
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  }
  const json = (v, estado = 200) => new Response(JSON.stringify(v), { status: estado, headers: { "Content-Type": "application/json" } });
  async function githubFalso(url, metodo, cuerpo) {
    const m = /^\/repos\/[^/]+\/[^/]+(\/.*)?$/.exec(url.pathname);
    if (url.pathname === "/user") return json({ login: "demo", name: "Demostración" });
    if (!m) return json({});
    const resto = m[1] || "";
    const c = /^\/contents\/(.+)$/.exec(resto);
    if (c) {
      const ruta = decodeURIComponent(c[1]);
      if (metodo === "PUT") {
        const d = JSON.parse(cuerpo || "{}");
        archivos[ruta] = deB64(d.content || "");
        guardarPronto();
        return json({ content: { sha: "demo" + Date.now(), path: ruta, name: ruta.split("/").pop() }, commit: { sha: "demo" + Date.now() } });
      }
      if (metodo === "DELETE") { delete archivos[ruta]; guardarPronto(); return json({ commit: { sha: "demo" } }); }
      if (!/\.[a-z0-9]+$/i.test(ruta)) return json([]);
      const bytes = ruta === "data/sitio.json" ? new TextEncoder().encode(JSON.stringify(await sitio(), null, 2)) : await leerArchivo(ruta);
      if (!bytes) return json({ message: "Not Found" }, 404);
      return json({ type: "file", name: ruta.split("/").pop(), path: ruta, sha: "demo" + bytes.length, size: bytes.length, encoding: "base64", content: b64(bytes) });
    }
    if (/^\/git\/refs?\//.test(resto)) return json({ object: { sha: "demo-base" } });
    if (/^\/git\/commits\//.test(resto)) return json({ sha: "demo-base", tree: { sha: "demo-arbol" } });
    if (/^\/commits/.test(resto) || /^\/git\/trees/.test(resto)) return json([]);
    return json({ full_name: "colegiosanmartin/sitio-colegio-san-martin", default_branch: "main", permissions: { admin: false, push: false, pull: true } });
  }
  async function afuera(url, metodo, cuerpo, auth) {
    if (url.href.startsWith(env.CORREO_URL)) { recibirCorreo(JSON.parse(cuerpo || "{}")); return new Response("ok"); }
    if (url.origin === "https://colegiosm.cl") {
      const ruta = decodeURIComponent(url.pathname.slice(1)) || "index.html";
      const bytes = ruta === "data/sitio.json" ? new TextEncoder().encode(JSON.stringify(await sitio())) : await leerArchivo(ruta);
      return bytes ? new Response(bytes) : new Response("no", { status: 404 });
    }
    if (url.origin === "https://api.github.com" && String(auth || "").includes(TOKEN)) return githubFalso(url, metodo, cuerpo);
    if (/fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com/.test(url.hostname)) return new Response(null, { status: 201 });
    return null;
  }
  // El contenido del sitio (con lo publicado en la demostración), apuntando al servidor de la demostración
  async function sitio() {
    const d = JSON.parse(new TextDecoder().decode(await leerArchivo("data/sitio.json")));
    d.app = { ...(d.app || {}), servidor: SERVIDOR };
    return d;
  }

  let worker = null;
  let sembrando = false;
  const listo = (async () => {
    await new Promise((ok, mal) => {
      const s = document.createElement("script");
      s.src = RAIZ + "demo/vendor/sql-asm.js";
      s.onload = ok; s.onerror = () => mal(new Error("No se pudo cargar SQLite"));
      document.head.append(s);
    });
    const SQL = await window.initSqlJs();
    const guardado = await leerKv("estado").catch(() => null);
    const vigente = guardado && guardado.version === VERSION;
    const sqlite = vigente && guardado.db ? new SQL.Database(guardado.db) : new SQL.Database();
    if (vigente) { archivos = guardado.archivos || {}; correos = guardado.correos || []; }
    env.DB = baseD1(sqlite);
    env.exportar = () => sqlite.export();
    worker = (await import(RAIZ + "servidor/notificaciones.js")).default;
    if (!vigente) { sembrando = true; try { await sembrar(); } finally { sembrando = false; } }
    await guardarAhora();
    pintarCorreos();
  })();
  listo.catch((e) => console.error("Modo demostración:", e));

  let espera = 0;
  const guardarAhora = () => guardarKv("estado", { version: VERSION, db: env.exportar(), archivos, correos: correos.slice(-30) }).catch(() => {});
  const guardarPronto = () => { clearTimeout(espera); espera = setTimeout(guardarAhora, 400); };

  // El navegador no deja fijar «Origin» en una petición creada aquí: el servidor recibe la petición con el origen del sitio
  const conOrigen = (req) => {
    const cab = new Headers(req.headers);
    cab.set("Origin", "https://colegiosm.cl");
    return new Proxy(req, { get: (t, k) => (k === "headers" ? cab : typeof t[k] === "function" ? t[k].bind(t) : t[k]) });
  };
  async function atender(req) {
    await listo;
    const r = await worker.fetch(conOrigen(req), env);
    guardarPronto();
    return r;
  }

  window.fetch = async function (input, init) {
    const req = input instanceof Request ? input : null;
    let url;
    try { url = new URL(req ? req.url : String(input), location.href); } catch (e) { return fetchReal(input, init); }
    if (url.href.split("?")[0] === DATOS) { await listo.catch(() => {}); return json(await sitio()); }
    if (url.href.startsWith(SERVIDOR)) return atender(new Request(input, init));
    const metodo = ((init && init.method) || (req && req.method) || "GET").toUpperCase();
    const cab = new Headers((init && init.headers) || (req && req.headers) || {});
    const cuerpo = init && typeof init.body === "string" ? init.body : null;
    const falsa = await afuera(url, metodo, cuerpo, cab.get("Authorization"));
    return falsa || fetchReal(input, init);
  };

  // La app sube las pruebas con XMLHttpRequest (para mostrar el avance): esas también van al servidor de la demostración
  const XHR = window.XMLHttpRequest;
  class XHRDemo extends XHR {
    open(metodo, url, ...resto) { this._demo = String(url).startsWith(SERVIDOR) ? { metodo, url, cab: {} } : null; if (!this._demo) super.open(metodo, url, ...resto); }
    setRequestHeader(k, v) { if (this._demo) this._demo.cab[k] = v; else super.setRequestHeader(k, v); }
    send(cuerpo) {
      if (!this._demo) return super.send(cuerpo);
      const d = this._demo;
      const fijar = (k, v) => Object.defineProperty(this, k, { value: v, configurable: true });
      (async () => {
        try {
          this.upload.dispatchEvent(new ProgressEvent("progress", { lengthComputable: true, loaded: 1, total: 1 }));
          const r = await window.fetch(d.url, { method: d.metodo, headers: d.cab, body: cuerpo });
          fijar("status", r.status); fijar("responseText", await r.text()); fijar("readyState", 4);
          this.dispatchEvent(new Event("load"));
        } catch (e) { this.dispatchEvent(new Event("error")); }
      })();
    }
  }
  window.XMLHttpRequest = XHRDemo;

  /* ---------- Datos de ejemplo (nombres inventados) ---------- */
  const llamar = async (ruta, cuerpo, cab = {}) => {
    const r = await worker.fetch(conOrigen(new Request(SERVIDOR + ruta, { method: cuerpo === undefined ? "GET" : "POST",
      headers: { "Content-Type": "application/json", ...cab }, body: cuerpo === undefined ? undefined : typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo) })), env);
    return r.json().catch(() => ({}));
  };
  const ultimoCodigo = (para) => { for (let i = correos.length - 1; i >= 0; i--) if (correos[i].para === para && correos[i].codigo) return correos[i].codigo; return ""; };
  const ymd = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  // n días hábiles desde hoy
  const habil = (n) => { const t = new Date(); while (n > 0) { t.setDate(t.getDate() + 1); if (t.getDay() % 6) n--; } return ymd(t); };
  async function sembrar() {
    const db = env.DB;
    await llamar("/estado");
    const ins = (sql, ...a) => db.prepare(sql).bind(...a).run();
    for (const p of PROFES.concat(SIN_ENTRAR)) await ins("INSERT INTO profesores (correo, nombre, cursos) VALUES (?, ?, ?)", p.correo, p.nombre, JSON.stringify(p.cursos));
    for (const f of CUENTAS_PANEL) await ins("INSERT INTO funcionarios (correo, nombre, cargo, permisos, creado) VALUES (?, ?, ?, ?, ?)", f.correo, f.nombre, f.cargo, JSON.stringify(f.permisos), new Date().toISOString());
    for (const e of ESTUDIANTES) await ins("INSERT INTO estudiantes (rut, nombre, curso, correo) VALUES (?, ?, ?, ?)", e.rut, e.nombre, e.curso, e.correo);
    const mat = { "1° básico A": 34, "1° básico B": 33, "2° básico A": 35, "2° básico B": 34, "3° básico A": 36, "3° básico B": 35, "4° básico A": 37, "4° básico B": 36, "5° básico A": 38, "5° básico B": 37, "6° básico A": 36, "6° básico B": 35 };
    for (const [c, n] of Object.entries(mat)) await ins("INSERT INTO matricula (curso, grupo, n) VALUES (?, '', ?)", c, n);
    // Contraseñas: el mismo camino que la primera vez de cada persona (código al correo y contraseña nueva)
    const sesiones = {};
    for (const p of PROFES) {
      await llamar("/curso/codigo", { quien: "profe", id: p.correo });
      const v = await llamar("/curso/verificar", { quien: "profe", id: p.correo, codigo: ultimoCodigo(p.correo) });
      await llamar("/curso/clave", { sesion: v.sesion, clave: CLAVE });
      sesiones[p.correo] = (await llamar("/curso/entrar", { correo: p.correo, clave: CLAVE })).sesion;
    }
    for (const f of CUENTAS_PANEL) {
      await llamar("/panel/codigo", { correo: f.correo });
      const v = await llamar("/panel/verificar", { correo: f.correo, codigo: ultimoCodigo(f.correo) });
      await llamar("/panel/clave", { clave: CLAVE }, { Authorization: "Panel " + v.sesion });
    }
    const fechas = [
      ["5° básico A", habil(2), "prueba", "Prueba de Matemática: fracciones", "Unidad 3. Traer regla y transportador."],
      ["5° básico B", habil(5), "trabajo", "Entrega maqueta del sistema solar", ""],
      ["6° básico A", habil(7), "salida", "Salida al Museo Regional", "Salida 9:00, regreso 12:30. Autorización firmada."],
    ];
    for (const [c, f, t, ti, de] of fechas) await ins("INSERT INTO fechas_curso (curso, fecha, tipo, titulo, descripcion, autor, creado) VALUES (?, ?, ?, ?, ?, ?, ?)", c, f, t, ti, de, "Ana Rojas", new Date().toISOString());
    const pdf = btoa("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
    const subir = async (correo, m) => (await llamar("/pruebas/subir?m=" + encodeURIComponent(JSON.stringify(m)), pdf, { Authorization: "Curso " + sesiones[correo], "Content-Type": "text/plain" })).prueba || {};
    const ana = PROFES[0].correo;
    await subir(ana, { cursos: ["5° básico A", "5° básico B"], asignatura: "Matemática", fecha: habil(6), tipo: "prueba", comentario: "Doble cara", archivo: "Prueba fracciones 5°.pdf" });
    const guia = await subir(ana, { cursos: ["6° básico A"], asignatura: "Matemática", fecha: habil(9), tipo: "guia", comentario: "", archivo: "Guía decimales.pdf" });
    const cien = await subir(ana, { cursos: ["5° básico A"], asignatura: "Ciencias Naturales", fecha: habil(11), tipo: "prueba", comentario: "", archivo: "Prueba ciencias.pdf" });
    await subir(PROFES[1].correo, { cursos: ["3° básico A", "3° básico B"], asignatura: "Lenguaje y Comunicación", fecha: habil(4), tipo: "prueba", comentario: "Tamaño oficio", archivo: "Comprensión lectora.pdf" });
    await subir(PROFES[2].correo, { cursos: ["1° básico A"], asignatura: "Matemática", fecha: habil(2), tipo: "guia", comentario: "", archivo: "Guía números hasta 20.pdf" });
    const utp = { Authorization: "Panel " + (await llamar("/panel/entrar", { correo: CUENTAS_PANEL[0].correo, clave: CLAVE })).sesion };
    if (guia.id) await llamar("/panel/pruebas/aprobar", { id: guia.id, copias: 37 }, utp);
    if (cien.id) await llamar("/panel/pruebas/devolver", { id: cien.id, motivo: "Falta la pauta de corrección y el puntaje por pregunta." }, utp);
    await llamar("/contacto", { nombre: "Apoderada 4° B", email: "apoderada@example.com", motivo: "Consulta", mensaje: "¿A qué hora es la reunión de apoderados de esta semana?" });
    correos = [];
  }

  /* ---------- Cuadro «Modo demostración» ---------- */
  const enPanel = /\/admin\/?/.test(location.pathname);
  const cuadro = document.createElement("div");
  cuadro.className = "demo";
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cuentas = enPanel
    ? CUENTAS_PANEL.map((f) => ({ tipo: "panel", correo: f.correo, rotulo: f.cargo, nombre: f.nombre }))
    : [{ tipo: "profe", correo: PROFES[0].correo, rotulo: "Profesora", nombre: PROFES[0].nombre },
      { tipo: "estudiante", correo: ESTUDIANTES[0].correo, rotulo: "Estudiante (código al correo)", nombre: ESTUDIANTES[0].nombre }];
  function pintar() {
    cuadro.innerHTML = `<button type="button" class="demo__boton" aria-expanded="false" aria-controls="demoCaja">Demostración</button>
      <div class="demo__caja" id="demoCaja" hidden>
        <div class="demo__cab"><strong>Modo demostración</strong><button type="button" class="demo__cerrar" aria-label="Cerrar">×</button></div>
        <p>El servidor del colegio corre en este navegador, con datos inventados. Nada llega al colegio ni a nadie.</p>
        <p class="demo__sub">Entrar como</p>
        <ul class="demo__cuentas">${cuentas.map((c, i) => `<li><span><b>${esc(c.rotulo)}</b>${esc(c.nombre)}<small>${esc(c.correo)}</small></span><button type="button" data-demo-entrar="${i}">Entrar</button></li>`).join("")}</ul>
        <p class="demo__nota">Contraseña de todas las cuentas: <code>${CLAVE}</code>${enPanel ? "" : `<br>Clave de «Acceso Inspectoría»: <code>${env.CLAVE_INSPECTORIA}</code>`}</p>
        <p class="demo__sub">Correos que se habrían enviado</p>
        <ul class="demo__correos" id="demoCorreos"></ul>
        <button type="button" class="demo__reiniciar">Reiniciar demostración</button>
      </div>`;
  }
  function pintarCorreos() {
    const ul = cuadro.querySelector("#demoCorreos");
    if (!ul) return;
    ul.innerHTML = correos.slice(-6).reverse().map((c) => `<li><b>${esc(c.para || "colegio")}</b>${c.codigo ? `Código: <code>${esc(c.codigo)}</code>` : esc(c.asunto || c.tipo || "Correo")}</li>`).join("") || "<li>Aún ninguno.</li>";
  }
  function recibirCorreo(c) {
    const correo = { para: c.para || c.correo || "", tipo: c.tipo, asunto: c.asunto, codigo: c.codigo ? String(c.codigo) : "" };
    correos.push(correo);
    pintarCorreos();
    if (!correo.codigo || sembrando) return;
    // El código «llega» al correo: se muestra y se escribe solo en el campo que lo pide
    abrir(true);
    setTimeout(() => {
      const campo = document.getElementById("mcCod") || document.getElementById("codigoInput");
      if (campo && !campo.value) { campo.value = correo.codigo; campo.dispatchEvent(new Event("input", { bubbles: true })); }
    }, 300);
  }
  const abrir = (si) => {
    const caja = cuadro.querySelector(".demo__caja");
    caja.hidden = !si;
    cuadro.querySelector(".demo__boton").setAttribute("aria-expanded", String(si));
  };
  const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
  async function entrar(c) {
    abrir(false);
    if (c.tipo === "panel") {
      if (!document.getElementById("login") || document.getElementById("login").hidden) {
        sessionStorage.setItem("csm-demo-entrar", c.correo);
        const salir = document.getElementById("logoutBtn");
        if (salir) salir.click();
        return;
      }
      const tab = document.querySelector('[data-login="correo"]');
      if (tab) tab.click();
      document.getElementById("correoInput").value = c.correo;
      document.getElementById("claveInput").value = CLAVE;
      document.getElementById("correoBtn").click();
      return;
    }
    const tab = document.querySelector('.tab[data-vista="micurso"]');
    if (tab) tab.click();
    await esperar(150);
    if (window.MICURSO && MICURSO.activo()) {
      const s = document.querySelector('#micurso [data-mc="salir"]');
      if (!s || !confirm("Ya hay alguien dentro de «Mi curso». ¿Salir y entrar con esta cuenta?")) return;
      window.confirm = ((orig) => () => { window.confirm = orig; return true; })(window.confirm);
      s.click();
      await esperar(150);
    }
    if (c.tipo === "profe") {
      document.querySelector('#micurso [data-mc="profe"]').click();
      await esperar(100);
      document.getElementById("mcCorreo").value = c.correo;
      document.getElementById("mcClave").value = CLAVE;
      document.getElementById("mcProfe").requestSubmit();
    } else {
      document.querySelector('#micurso [data-mc="familia"]').click();
      await esperar(100);
      document.getElementById("mcId").value = c.correo;
      document.getElementById("mcPedir").requestSubmit();
    }
  }
  cuadro.addEventListener("click", (e) => {
    if (e.target.closest(".demo__boton")) return abrir(cuadro.querySelector(".demo__caja").hidden);
    if (e.target.closest(".demo__cerrar")) return abrir(false);
    const b = e.target.closest("[data-demo-entrar]");
    if (b) return entrar(cuentas[+b.dataset.demoEntrar]);
    if (e.target.closest(".demo__reiniciar") && confirm("¿Borrar todo lo hecho en la demostración y empezar de nuevo?")) {
      clearTimeout(espera);
      borrarTodo().finally(() => location.reload());
    }
  });
  const estilos = document.createElement("link");
  estilos.rel = "stylesheet";
  estilos.href = RAIZ + "demo/demo.css";
  document.head.append(estilos);
  const montar = () => {
    pintar();
    document.body.append(cuadro);
    pintarCorreos();
    // Después de «Cerrar sesión» para cambiar de cuenta, se entra con la elegida
    const pendiente = sessionStorage.getItem("csm-demo-entrar");
    if (pendiente && enPanel) {
      sessionStorage.removeItem("csm-demo-entrar");
      const c = cuentas.find((x) => x.correo === pendiente);
      if (c) listo.then(() => esperar(300)).then(() => entrar(c));
    }
  };
  if (document.body) montar(); else document.addEventListener("DOMContentLoaded", montar);
})();
