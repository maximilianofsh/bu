/* ==========================================================
   Panel de administración — Colegio San Martín Iquique
   Edita data/sitio.json y sube archivos al repositorio de GitHub
   que publica el sitio (GitHub Pages). No necesita servidor.
   ========================================================== */
(function () {
  "use strict";

  // El panel no se puede mostrar dentro de otra página (evita que lo «disfracen» para robar clics)
  if (window.top !== window.self) { document.body.innerHTML = ""; return; }

  const DATA_PATH = "data/sitio.json";
  const ROLES_PATH = "data/roles.json";
  const STORE_KEY = "csm-admin";
  const MAX_MB = 25;

  const state = {
    owner: "", repo: "", branch: "main", token: "", data: null, sha: null, dirty: false, view: "directivos",
    // Quién entró: el dueño del repositorio escribe directo; los demás envían sus cambios a revisión
    login: "", rol: "", nombre: "", modo: "directo", base: null, envio: null,
    // Cuenta con el correo del colegio: sesión del servidor del colegio, cargo y permisos (sin GitHub)
    sesion: null, cargo: "", permisos: [],
    roles: { usuarios: [] }, rolesSha: null, rolesTexto: "",
  };
  const ROLES = {
    dueno: { nombre: "Administrador (dueño)", desc: "Puede cambiar absolutamente todo, incluidos los usuarios y sus permisos." },
    trabajador: { nombre: "Administrador (trabajador)", desc: "Puede cambiar el contenido, los estilos y las páginas, pero no los usuarios. Cada cambio se le avisa al dueño, y los cambios en el HTML de las páginas esperan su aprobación." },
    utp: { nombre: "UTP", desc: "Solo puede publicar y editar noticias." },
    correo: { nombre: "Cuenta del colegio", desc: "" },
  };
  const textoGuardar = () => (state.modo === "revision" ? "Enviar cambios" : "Guardar y publicar");
  // Permisos de las cuentas con correo del colegio: qué secciones del panel abre cada uno (lo mismo revisa el servidor)
  const PERMISOS = {
    todo: { nombre: "Control total", desc: "Todo el panel, incluidos el diseño, las copias de seguridad y las cuentas." },
    noticias: { nombre: "Noticias", desc: "Publicar, programar, editar y borrar noticias." },
    propuestas: { nombre: "Noticias con aprobación", desc: "Escribir noticias y flyers que se publican solo cuando el dueño del panel los aprueba (por ejemplo, CGPA y CEAL)." },
    aviso: { nombre: "Aviso urgente", desc: "Retiros anticipados, suspensiones y emergencias, con notificación a la app." },
    eventos: { nombre: "Calendario escolar", desc: "Fechas del calendario del colegio." },
    galeria: { nombre: "Galería de fotos", desc: "Álbumes de fotos." },
    contenido: { nombre: "Resto del contenido", desc: "Directivos, docentes, departamentos, documentos, horarios, emergencias, portada, pilares, CGPA y CEAL, redes." },
    cursos: { nombre: "Ver los cursos", desc: "Ver en «Mi curso» los estudiantes, profesores y fechas de cada curso." },
    listas: { nombre: "Listas de Mi curso", desc: "Subir las listas de estudiantes y profesores y hacer el cierre de año." },
    mensajes: { nombre: "Mensajes de contacto", desc: "Leer todos los mensajes del formulario de Contacto y asignarlos a otras personas. Sin este permiso, la persona ve solo los que se le asignan." },
    pruebas: { nombre: "Pruebas y guías (UTP)", desc: "Revisar las pruebas y guías que envían los profesores desde la app, aprobarlas o devolverlas con un comentario, y cargar la matrícula que calcula las copias." },
    impresiones: { nombre: "Impresiones", desc: "Recibir por correo las pruebas y guías aprobadas por UTP, descargarlas y marcarlas como impresas." },
  };
  // Cargos sugeridos: al elegir uno se marcan sus permisos (se pueden ajustar)
  const CARGOS = [
    ["Sostenedora", ["todo"]],
    ["Directora", ["noticias", "aviso", "eventos", "galeria", "contenido", "cursos", "listas", "mensajes"]],
    ["Inspectora General", ["aviso"]],
    ["UTP primer ciclo", ["noticias", "cursos", "pruebas"]],
    ["UTP segundo ciclo", ["noticias", "cursos", "pruebas"]],
    ["Convivencia Escolar", ["noticias", "cursos"]],
    ["CGPA (asesora)", ["propuestas"]],
    ["CEAL (asesor/a)", ["propuestas"]],
    ["Encargado de impresiones", ["impresiones"]],
  ];
  const VISTA_PERMISO = { noticias: ["noticias", "propuestas"], aviso: ["aviso"], eventos: ["eventos"], galeria: ["galeria"], mensajes: Object.keys(PERMISOS), micurso: ["cursos", "listas"], pruebas: ["pruebas", "impresiones"], estadisticas: Object.keys(PERMISOS),
    directivos: ["contenido"], portada: ["contenido"], pilares: ["contenido"], departamentos: ["contenido"], personal: ["contenido"], horarios: ["contenido"],
    organizaciones: ["contenido"], documentos: ["contenido"], emergencia: ["contenido"], redes: ["contenido"] };
  const tienePermiso = (...p) => state.permisos.includes("todo") || p.some((x) => state.permisos.includes(x));
  // El código del sitio (HTML y CSS) y los usuarios de GitHub solo se cambian entrando con el token del dueño
  const SOLO_TOKEN = ["html", "css", "limpieza"];
  const puedeVista = (vista) => !(state.modo === "correo" && SOLO_TOKEN.includes(vista)) && (state.rol === "dueno" || (state.rol === "trabajador" && !["usuarios", "respaldos", "limpieza"].includes(vista)) || (state.rol === "utp" && vista === "noticias")
    || (state.rol === "correo" && tienePermiso(...(VISTA_PERMISO[vista] || []))));
  // «Inicio» (lo pendiente de cada cargo) aparece para quien tiene más de una tarea en el panel;
  // quien tiene una sola (Inspectoría, Impresiones, CGPA) entra directo a esa
  const TAREAS_INICIO = ["aviso", "noticias", "pruebas", "eventos", "galeria", "micurso", "directivos"];
  const puede = (vista) => (vista === "inicio" ? TAREAS_INICIO.filter(puedeVista).length >= 2 : puedeVista(vista));
  // Secciones del contenido que puede guardar una cuenta con correo (igual que en el servidor)
  const SECCIONES_PERMISO = { noticias: ["noticias"], aviso: ["aviso"], eventos: ["eventos"], galeria: ["galeria"],
    contenido: ["directivos", "personal", "departamentos", "documentos", "organizaciones", "pilares", "portada", "emergencia", "redes", "horarios"] };
  // Cuentas que escriben noticias pero no las publican: quedan esperando la aprobación del dueño
  const soloPropuestas = () => state.modo === "correo" && tienePermiso("propuestas") && !tienePermiso("noticias");
  const apruebaNoticias = () => state.rol === "dueno" && state.modo !== "correo";
  const puedeGuardar = (k) => tienePermiso("todo") || state.permisos.some((p) => (SECCIONES_PERMISO[p] || []).includes(k));
  // Servidor del colegio (Cloudflare): con él entran las cuentas con correo
  // (la dirección se lee del sitio, donde la guarda el dueño en «Aviso urgente» → «App del colegio»)
  let SERVIDOR = "https://avisos-colegio.colegiosmiqq.workers.dev";
  const servidorListo = fetch("../data/sitio.json", { cache: "no-store" }).then((r) => r.json()).then((d) => {
    const u = String((d.app && d.app.servidor) || "").trim().replace(/\/+$/, "");
    if (/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(u)) SERVIDOR = u;
  }).catch(() => { /* se usa la dirección conocida */ });
  // Cómo se identifica el panel ante el servidor del colegio: sesión con correo o token de GitHub
  const credencial = () => ({ Authorization: state.sesion ? "Panel " + state.sesion : "Bearer " + state.token });
  async function pedirServidor(ruta, cuerpo, conSesion = true) {
    await servidorListo;
    const r = await fetch(SERVIDOR + ruta, { method: cuerpo ? "POST" : "GET", cache: "no-store",
      headers: { ...(conSesion ? credencial() : {}), ...(cuerpo ? { "Content-Type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401 && j.salir && conSesion && state.sesion) sesionVencida();
    if (!r.ok) throw Object.assign(new Error(j.error || (r.status === 404 ? "El servidor aún no tiene esta función: vuelve a pegar servidor/notificaciones.js en Cloudflare." : "Error " + r.status)), { status: r.status });
    return j;
  }
  // Archivos que un funcionario puede subir (sin SVG ni HTML, que pueden ejecutar código). Lo mismo revisa la acción de GitHub.
  const SUBIBLE = /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|mp3|mp4)$/i;
  const previews = {}; // ruta subida -> dataURL, para ver la imagen antes de que GitHub Pages la publique

  const $ = (s, r = document) => r.querySelector(s);

  /* ---------- Utilidades ---------- */
  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k in el && typeof v !== "string") el[k] = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(Infinity).forEach((c) => c != null && el.append(c.nodeType ? c : document.createTextNode(c)));
    return el;
  }

  let toastTimer;
  function toast(msg, type = "") {
    const t = $("#toast");
    t.textContent = msg;
    t.className = "toast is-on " + (type ? "is-" + type : "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), type === "error" ? 7000 : 3500);
  }

  const utf8ToB64 = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64ToUtf8 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

  const slug = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "archivo";

  const resolver = (src) => !src ? "" : previews[src] || (/^(https?:|data:)/.test(src) ? src : "../" + src);

  /* ---------- GitHub API ---------- */
  async function api(path, opts = {}) {
    // Con el correo del colegio, GitHub se usa a través del servidor (que revisa los permisos)
    if (state.sesion) {
      await servidorListo;
      const r = await fetch(SERVIDOR + "/panel/github", { method: "POST", cache: "no-store", headers: { ...credencial(), "Content-Type": "application/json" },
        body: JSON.stringify({ metodo: opts.method || "GET", ruta: path, cuerpo: opts.body ? JSON.parse(opts.body) : undefined }) });
      const j = r.status === 204 ? null : await r.json().catch(() => ({}));
      if (r.status === 401 && j && j.salir) sesionVencida();
      if (!r.ok) { const err = new Error((j && (j.error || j.message)) || r.status + ""); err.status = r.status; throw err; }
      return j;
    }
    const res = await fetch(`https://api.github.com${path}`, {
      ...opts,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + state.token,
        "X-GitHub-Api-Version": "2022-11-28",
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
    });
    if (!res.ok) {
      let msg = res.status + "";
      try { msg = (await res.json()).message || msg; } catch (e) { /* sin cuerpo */ }
      const err = new Error(msg); err.status = res.status; throw err;
    }
    return res.status === 204 ? null : res.json();
  }
  const gh = (path, opts) => api(`/repos/${state.owner}/${state.repo}${path}`, opts);
  const shaDe = async (o, r, ruta, ref) => {
    try { return (await api(`/repos/${o}/${r}/contents/${ruta}?ref=${encodeURIComponent(ref)}`)).sha; } catch (e) { if (e.status === 404) return null; throw e; }
  };

  /* ---------- Escritura: directa (dueño) o en una rama de revisión (funcionarios) ---------- */
  // Los funcionarios no pueden escribir en el repositorio: sus cambios van a una rama «panel-…» de su copia (fork)
  // y se envían como solicitud de cambios. Una acción de GitHub la revisa según su rol y la publica.
  async function prepararRama() {
    const fork = await api(`/repos/${state.owner}/${state.repo}/forks`, { method: "POST", body: JSON.stringify({ default_branch_only: true }) });
    const d = { owner: fork.owner.login, repo: fork.name, branch: "panel-" + Date.now().toString(36) };
    for (let i = 0; i < 15; i++) { // la copia puede tardar unos segundos en estar lista
      try { await api(`/repos/${d.owner}/${d.repo}`); break; } catch (e) { if (i === 14) throw e; await new Promise((ok) => setTimeout(ok, 2000)); }
    }
    const crear = () => api(`/repos/${d.owner}/${d.repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + d.branch, sha: state.base }) });
    try {
      await crear();
    } catch (e) {
      // La copia está desactualizada: se sincroniza con el original y se reintenta
      await api(`/repos/${d.owner}/${d.repo}/merge-upstream`, { method: "POST", body: JSON.stringify({ branch: fork.default_branch || state.branch }) }).catch(() => {});
      await crear();
    }
    return d;
  }

  async function escribir(ruta, contenido, mensaje, { sha, borrar } = {}) {
    const body = { message: mensaje };
    if (!borrar) body.content = contenido;
    let destino;
    if (state.modo !== "revision") {
      destino = { owner: state.owner, repo: state.repo, branch: state.branch };
      if (sha === undefined) sha = await shaDe(destino.owner, destino.repo, ruta, destino.branch);
    } else {
      if (!state.envio) state.envio = await prepararRama();
      destino = state.envio;
      sha = await shaDe(destino.owner, destino.repo, ruta, destino.branch);
    }
    if (borrar && !sha) return null;
    if (sha) body.sha = sha;
    body.branch = destino.branch;
    return api(`/repos/${destino.owner}/${destino.repo}/contents/${ruta}`, { method: borrar ? "DELETE" : "PUT", body: JSON.stringify(body) });
  }

  // Abre la solicitud de cambios con lo escrito desde el último envío
  async function enviar(titulo) {
    const d = state.envio;
    if (!d) return null;
    state.envio = null;
    const pr = await gh("/pulls", { method: "POST", body: JSON.stringify({
      title: `${titulo} · ${state.nombre || "@" + state.login}`,
      head: `${d.owner}:${d.branch}`, base: state.branch,
      body: `Enviado desde el panel por ${state.nombre ? state.nombre + " " : ""}(@${state.login}, ${ROLES[state.rol].nombre}).\n\nSe revisa y publica automáticamente según su rol.`,
    }) });
    seguir(pr.number);
    return pr;
  }

  // Avisa al funcionario cuando la revisión automática termina
  function seguir(numero, intento = 0) {
    if (intento > 30) return;
    setTimeout(async () => {
      try {
        const issue = await gh(`/issues/${numero}`);
        const labels = issue.labels.map((l) => l.name);
        if (labels.includes("publicado")) return toast("Tus cambios ya se publicaron. El sitio se actualiza en 1 o 2 minutos.", "ok");
        if (labels.includes("pendiente")) return toast("Tus cambios quedaron pendientes de aprobación del dueño.", "ok");
        if (labels.includes("rechazado")) {
          const coms = await gh(`/issues/${numero}/comments?per_page=10`);
          const ult = coms.reverse().find((c) => /No se publicó/.test(c.body));
          const motivo = ult ? ult.body.split("\n").filter((l) => l.startsWith("- ")).map((l) => l.slice(2)).join(" ") : "";
          return toast("Tus cambios no se publicaron. " + motivo, "error");
        }
      } catch (e) { /* se reintenta */ }
      seguir(numero, intento + 1);
    }, 8000);
  }

  async function cargarDatos() {
    // Se recuerda el commit leído: los envíos a revisión parten de él
    state.base = (await gh(`/git/ref/heads/${encodeURIComponent(state.branch)}`)).object.sha;
    const f = await gh(`/contents/${DATA_PATH}?ref=${state.base}`);
    state.sha = f.sha;
    state.crudo = b64ToUtf8(f.content);
    state.data = JSON.parse(state.crudo);
    normalizar();
    prepararHorarios();
    state.data.noticias.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    // Foto de cada sección tal como se cargó, para enviar a revisión solo lo que de verdad cambió
    state.foto = Object.fromEntries(Object.keys(state.data).map((k) => [k, JSON.stringify(state.data[k])]));
    try {
      const r = await gh(`/contents/${ROLES_PATH}?ref=${state.base}`);
      state.roles = JSON.parse(b64ToUtf8(r.content));
      state.rolesSha = r.sha;
    } catch (e) {
      if (e.status !== 404) throw e;
      state.roles = { usuarios: [] }; state.rolesSha = null;
    }
    state.roles.usuarios = state.roles.usuarios || [];
    state.rolesTexto = JSON.stringify(state.roles);
  }

  function normalizar() {
    const d = state.data;
    d.colores = d.colores || { primario: "#0b1f3a", secundario: "#1c3a66", acento: "#c9a24b" };
    d.directivos = d.directivos || [];
    d.departamentos = (d.departamentos || []).map((x) => (x.tipo ? x : { ...x, tipo: "apoyo" }));
    d.personal = (d.personal || []).map((p) => (p.tipo ? p : { ...p, tipo: /^docentes/i.test(p.area || "") ? "docente" : /centro de (padres|estudiantes)/i.test(p.area || "") ? "comunidad" : "equipo" }));
    d.organizaciones = d.organizaciones || [];
    d.pilares = d.pilares || [];
    d.noticias = d.noticias || [];
    d.eventos = d.eventos || [];
    d.galeria = d.galeria || [];
    d.emergencia = d.emergencia || {};
    d.documentos = d.documentos || [];
    d.redes = d.redes || { titulo: "", descripcion: "", lista: [] };
    d.redes.lista = d.redes.lista || [];
    d.horarios = d.horarios || {};
    d.horarios.colores = d.horarios.colores || {};
    d.horarios.cursos = d.horarios.cursos || [];
    d.horarios.docentes = d.horarios.docentes || [];
    d.horarios.asignaturas = d.horarios.asignaturas || []; // asignaturas agregadas a mano (aunque aún no estén en un horario)
    d.estilo = d.estilo || {};
    d.estilo.global = d.estilo.global || {};
    d.estilo.paginas = d.estilo.paginas || {};
  }

  const subidas = {}; // archivos subidos en esta sesión: ruta → dataUrl
  // Archivos que ya hay en cada carpeta, por su huella de GitHub (sha del contenido): así una foto idéntica no se guarda dos veces
  const enCarpeta = {};
  const existentes = (carpeta) => enCarpeta[carpeta] || (enCarpeta[carpeta] = gh(`/contents/${carpeta}?ref=${encodeURIComponent(state.branch)}`)
    .then((l) => new Map((Array.isArray(l) ? l : []).filter((f) => f.type === "file").map((f) => [f.sha, f.path])))
    .catch(() => new Map()));
  async function huellaGit(bytes) {
    const cab = new TextEncoder().encode(`blob ${bytes.length}\0`), todo = new Uint8Array(cab.length + bytes.length);
    todo.set(cab); todo.set(bytes, cab.length);
    return hex(await crypto.subtle.digest("SHA-1", todo));
  }
  async function subirArchivo(file, carpeta) {
    if (file.size > MAX_MB * 1024 * 1024) throw new Error(`El archivo supera ${MAX_MB} MB.`);
    const dataUrl = await new Promise((ok, fail) => {
      const r = new FileReader();
      r.onload = () => ok(r.result); r.onerror = fail; r.readAsDataURL(file);
    });
    const punto = file.name.lastIndexOf(".");
    const base = slug(punto > 0 ? file.name.slice(0, punto) : file.name);
    const ext = punto > 0 ? file.name.slice(punto).toLowerCase() : "";
    if (state.rol !== "dueno" && !SUBIBLE.test(ext)) throw new Error("Ese tipo de archivo no está permitido. Usa PNG, JPG, WEBP, GIF, PDF o un documento de Office.");
    const contenido = dataUrl.split(",")[1];
    let huella = null, ya = null;
    try { huella = await huellaGit(deB64(contenido)); ya = (await existentes(carpeta)).get(huella); } catch (e) { /* se sube igual */ }
    if (ya) {
      if (file.type.startsWith("image/")) previews[ya] = dataUrl;
      subidas[ya] = dataUrl;
      return ya;
    }
    const ruta = `${carpeta}/${Date.now().toString(36)}-${base}${ext}`;
    await escribir(ruta, contenido, `Subir ${file.name} desde el panel`, { sha: null });
    if (huella) (await existentes(carpeta)).set(huella, ruta);
    if (file.type.startsWith("image/")) previews[ruta] = dataUrl;
    subidas[ruta] = dataUrl;
    return ruta;
  }

  async function guardar() {
    const btn = $("#saveBtn");
    btn.disabled = true; btn.textContent = state.modo === "revision" ? "Enviando…" : "Publicando…";
    try {
      for (const k in state.data.estilo.paginas) if (!Object.keys(state.data.estilo.paginas[k]).length) delete state.data.estilo.paginas[k];
      prepararHorarios();
      idsNoticias();
      // Una noticia programada lleva la fecha del día en que se publica
      state.data.noticias.forEach((n) => { if (n.publicar) n.fecha = n.publicar.slice(0, 10); else delete n.publicar; });
      idsDepartamentos();
      idsAlbumes();
      state.data.eventos.sort((a, b) => ((a.fecha || "") + (a.hora || "")).localeCompare((b.fecha || "") + (b.hora || "")));
      state.data.noticias.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
      const rolesCambiaron = state.modo !== "correo" && puede("usuarios") && JSON.stringify(state.roles) !== state.rolesTexto;
      if (rolesCambiaron) {
        const r = await escribir(ROLES_PATH, utf8ToB64(JSON.stringify(state.roles, null, 2) + "\n"), "Actualizar usuarios y permisos del panel", { sha: state.rolesSha });
        if (state.modo !== "revision") state.rolesSha = r.content.sha;
        state.rolesTexto = JSON.stringify(state.roles);
      }
      if (state.modo === "correo") {
        // Solo las secciones que cambiaron y que esta cuenta puede guardar; el servidor las mezcla con lo último publicado
        const cambios = {};
        for (const k in state.data) if (JSON.stringify(state.data[k]) !== state.foto[k] && puedeGuardar(k)) cambios[k] = state.data[k];
        if (/\b(github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/.test(JSON.stringify(cambios))) {
          toast("No se publicó: en algún campo quedó pegado un token de GitHub. Bórralo (revisa el último campo que pegaste) y vuelve a guardar.", "error");
          btn.disabled = false;
          return;
        }
        if (Object.keys(cambios).length) {
          const r = await fetch(SERVIDOR + "/panel/guardar", { method: "POST", cache: "no-store", headers: { ...credencial(), "Content-Type": "application/json" }, body: JSON.stringify({ cambios }) });
          const j = await r.json().catch(() => ({}));
          if (r.status === 401 && j.salir) return sesionVencida();
          if (!r.ok) throw new Error(j.error || "Error " + r.status);
        }
        state.foto = Object.fromEntries(Object.keys(state.data).map((k) => [k, JSON.stringify(state.data[k])]));
        toast("Cambios publicados. El sitio se actualiza en 1 o 2 minutos.", "ok");
        setDirty(false);
        render();
        return;
      }
      let salida = state.data;
      if (state.modo !== "directo") {
        salida = JSON.parse(state.crudo);
        for (const k in state.data) if (JSON.stringify(state.data[k]) !== state.foto[k]) salida[k] = state.data[k];
      }
      const texto = JSON.stringify(salida, null, 2) + "\n";
      // El contenido es público: nunca se publica un token pegado por error en algún campo
      if (/\b(github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/.test(texto) || (state.token && texto.includes(state.token))) {
        toast("No se publicó: en algún campo quedó pegado un token de GitHub. Bórralo (revisa el último campo que pegaste) y vuelve a guardar.", "error");
        btn.disabled = false;
        return;
      }
      const res = await escribir(DATA_PATH, utf8ToB64(texto), "Actualizar contenido del sitio desde el panel", { sha: state.sha });
      if (state.modo === "directo") {
        state.sha = res.content.sha;
        cerrarAprobadas();
        toast("Cambios publicados. El sitio se actualiza en 1 o 2 minutos.", "ok");
      } else {
        await enviar(state.rol === "utp" ? "Noticias" : "Contenido del sitio");
        state.foto = Object.fromEntries(Object.keys(state.data).map((k) => [k, JSON.stringify(state.data[k])]));
        toast("Cambios enviados. Se revisan y publican solos en 1 o 2 minutos.", "ok");
      }
      setDirty(false);
      render();
    } catch (e) {
      if (state.modo !== "revision" && (e.status === 409 || e.status === 422)) {
        toast("El contenido cambió en GitHub desde que lo abriste. Descarga un respaldo y recarga el panel.", "error");
      } else {
        toast("No se pudo publicar: " + e.message, "error");
      }
      btn.disabled = false;
    } finally {
      btn.textContent = textoGuardar();
    }
  }

  /* ---------- Noticias con aprobación (CGPA, CEAL…) ----------
     Las cuentas con «Noticias con aprobación» envían sus noticias al servidor del colegio; el dueño
     (con el token) las ve en «Por aprobar», las publica o pide cambios. A quien la envió le llega un correo. */
  async function publicarNueva(n) {
    if (soloPropuestas()) {
      if ((await enviarPropuesta(n)) === false) throw new Error("no se pudo enviar");
      return;
    }
    state.data.noticias.unshift(n);
    setDirty(true);
    await guardar();
  }
  async function enviarPropuesta(n, id) {
    try {
      const r = await pedirServidor("/panel/propuesta", { noticia: n, id });
      toast(r.avisado ? "Enviada para aprobación. Ya se avisó al encargado web." : "Enviada para aprobación. El encargado web la verá en el panel.", "ok");
      render();
      return true;
    } catch (e) {
      toast("No se pudo enviar: " + e.message, "error");
      return false;
    }
  }
  const fechaHoraCorta = (iso) => new Date(iso).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const previaAprobacion = (n) => h("details", { class: "apr__ver" }, h("summary", {}, "Ver la noticia completa"),
    h("div", { class: "apr__cuerpo", html: (n.imagen && !String(n.cuerpo || "").includes(n.imagen) ? `<p><img src="${window.TEXTO.esc(resolver(n.imagen))}" alt=""></p>` : "")
      + window.TEXTO.html(n.cuerpo || n.resumen || "", (u) => previews[u] || (/^(https?:|mailto:)/i.test(u) ? u : SITIO + u)) }));
  // Lo que ve la cuenta que envía: sus noticias esperando aprobación o con cambios pedidos
  function panelPropuestas() {
    const caja = h("div", { class: "panel apr" }, h("h2", {}, "Enviadas para aprobación"), h("p", { class: "panel__help" }, "Cargando…"));
    pedirServidor("/panel/propuestas").then(({ propuestas }) => {
      const filas = propuestas.map((p) => h("div", { class: "apr__item" + (p.rechazo ? " is-cambios" : "") },
        h("div", { class: "apr__cab" }, h("strong", {}, p.noticia.titulo),
          h("span", { class: "apr__estado" }, p.rechazo ? "Necesita cambios" : "En revisión · enviada el " + fechaHoraCorta(p.t))),
        p.rechazo ? h("p", { class: "apr__motivo" }, "Comentario: " + p.rechazo) : "",
        previaAprobacion(p.noticia),
        h("div", { class: "apr__acc" },
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async () => {
            // Vuelve a «Mis borradores» para corregirla y enviarla de nuevo
            const b = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), noticia: p.noticia, archivos: {}, actualizado: new Date().toISOString(), abrir: true };
            try { await pedirServidor("/panel/propuesta/retirar", { id: p.id }); } catch (e) { return toast("No se pudo: " + e.message, "error"); }
            bor.lista.unshift(b); programarGuardado(true);
            toast("La noticia volvió a «Mis borradores». Corrígela y presiona «Enviar para aprobación».", "ok");
            render();
          } }, "Seguir editando"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async () => {
            if (!confirm(`¿Retirar «${p.noticia.titulo}»? No se publicará.`)) return;
            try { await pedirServidor("/panel/propuesta/retirar", { id: p.id }); render(); } catch (e) { toast("No se pudo: " + e.message, "error"); }
          } }, "Retirar"))));
      caja.replaceChildren(h("h2", {}, "Enviadas para aprobación"),
        ...(filas.length ? filas : [h("p", { class: "empty" }, "No tienes noticias esperando aprobación.")]));
    }).catch((e) => caja.replaceChildren(h("h2", {}, "Enviadas para aprobación"), h("p", { class: "panel__help" }, "No se pudo cargar: " + e.message)));
    return caja;
  }
  // Noticias que el dueño agregó desde «Por aprobar»: al publicarse, se avisa al servidor (y este a quien la envió)
  const porAprobar = new Map();
  function cerrarAprobadas() {
    for (const [n, id] of porAprobar) {
      if (!state.data.noticias.includes(n)) continue;
      porAprobar.delete(n);
      pedirServidor("/panel/aprobacion/aprobar", { id }).then(() => contarPorAprobar()).catch(() => {});
    }
  }
  async function contarPorAprobar() {
    if (!apruebaNoticias()) return;
    try {
      const { pendientes } = await pedirServidor("/panel/aprobacion");
      const n = pendientes.filter((p) => ![...porAprobar.values()].includes(p.id)).length;
      const b = $(".side__nav button[data-view=noticias]");
      if (b) { b.querySelector(".apr__badge")?.remove(); if (n) b.append(h("span", { class: "apr__badge", title: n + " por aprobar" }, String(n))); }
      return n;
    } catch (e) { return 0; }
  }
  function panelAprobacion() {
    const caja = h("div", { class: "panel apr", hidden: true });
    pedirServidor("/panel/aprobacion").then(({ pendientes, correo }) => {
      const lista = pendientes.filter((p) => ![...porAprobar.values()].includes(p.id));
      const inputCorreo = h("input", { type: "email", value: correo, placeholder: "tucorreo@colegiosm.cl", "aria-label": "Correo para los avisos" });
      const ajustes = h("details", { class: "apr__ajustes", open: !correo },
        h("summary", {}, correo ? "Los avisos te llegan a " + correo : "Elige dónde te llega el aviso de una noticia por aprobar"),
        h("div", { class: "kpi__fila" }, inputCorreo, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async () => {
          try { await pedirServidor("/panel/aprobacion/correo", { correo: inputCorreo.value }); toast("Listo: los avisos llegarán a ese correo.", "ok"); render(); }
          catch (e) { toast(e.message, "error"); }
        } }, "Guardar")));
      const filas = lista.map((p) => {
        const n = p.noticia;
        const aprobar = async (editar) => {
          if (!editar && state.dirty && !confirm("Tienes otros cambios sin publicar: se publicarán junto con esta noticia. ¿Seguir?")) return;
          const nueva = JSON.parse(JSON.stringify(n));
          state.data.noticias.unshift(nueva);
          porAprobar.set(nueva, p.id);
          setDirty(true);
          if (editar) { toast("La agregué arriba en «Noticias publicadas» sin publicar. Revísala y presiona «Guardar y publicar».", "ok"); render(); }
          else await guardar();
        };
        return h("div", { class: "apr__item" },
          h("div", { class: "apr__cab" }, h("strong", {}, n.titulo), h("span", { class: "apr__estado" }, `${p.nombre || p.correo}${p.cargo ? ", " + p.cargo : ""} · ${fechaHoraCorta(p.t)}`)),
          n.resumen ? h("p", { class: "apr__resumen" }, n.resumen) : "",
          previaAprobacion(n),
          h("div", { class: "apr__acc" },
            h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => aprobar(false) }, "Aprobar y publicar"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => aprobar(true) }, "Editar antes de publicar"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async () => {
              const motivo = prompt(`¿Qué debe cambiar ${p.nombre || "quien la envió"} en «${n.titulo}»? Le llegará por correo.`);
              if (motivo === null) return;
              try { await pedirServidor("/panel/aprobacion/rechazar", { id: p.id, motivo }); toast("Listo: se le pidió corregirla.", "ok"); contarPorAprobar(); render(); }
              catch (e) { toast(e.message, "error"); }
            } }, "Pedir cambios")));
      });
      caja.replaceChildren(h("h2", {}, lista.length ? `Por aprobar (${lista.length})` : "Por aprobar"),
        ...(filas.length ? filas : [h("p", { class: "empty" }, "No hay noticias esperando aprobación.")]), ajustes);
      caja.hidden = false;
    }).catch(() => { /* servidor sin esta función todavía */ });
    return caja;
  }

  /* ---------- Estado de cambios ---------- */
  function setDirty(v) {
    state.dirty = v;
    $("#saveBtn").disabled = !v;
    $("#dirtyFlag").hidden = !v;
    if (v && !soloPropuestas()) $(".bar__actions").hidden = false;
  }
  window.addEventListener("beforeunload", (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ---------- Campos ---------- */
  // Un borrador guarda solo en la cuenta de quien escribe: no marca «cambios sin publicar»
  const BORRADOR = Symbol("borrador");
  const marcar = (obj) => (obj && obj[BORRADOR] ? obj[BORRADOR]() : setDirty(true));
  function campo(def, obj, onChange) {
    const id = "f" + Math.random().toString(36).slice(2, 9);
    const val = obj[def.k] == null ? "" : obj[def.k];
    const set = (v) => { obj[def.k] = v; marcar(obj); onChange && onChange(); };
    let input;

    if (def.type === "textarea") {
      input = h("textarea", { id, rows: 3, oninput: (e) => set(e.target.value) });
      input.value = val;
    } else if (def.type === "select") {
      input = h("select", { id, onchange: (e) => set(e.target.value) },
        def.options.map(([v, t]) => Array.isArray(t)
          ? h("optgroup", { label: v }, t.map(([v2, t2]) => h("option", { value: v2, selected: v2 === val }, t2)))
          : h("option", { value: v, selected: v === val }, t)));
    } else if (def.type === "file") {
      const txt = h("input", { id, type: "text", value: val, placeholder: def.placeholder || "", oninput: (e) => set(e.target.value) });
      const wrap = h("div", { class: "upload" }, txt);
      const fileIn = h("input", {
        type: "file", accept: def.accept || "",
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          wrap.classList.add("is-busy");
          toast("Subiendo " + f.name + "…");
          try {
            const portada = def.k === "imagen" && def.folder === "img/noticias"; // la que se ve al compartir la noticia
            const ruta = await subirArchivo(/^image\/(png|jpeg|webp)$/.test(f.type) ? await ajustarImagen(f, def.ajustar || 2400, portada ? "jpg" : "webp") : f, def.folder);
            txt.value = ruta; set(ruta);
            toast(`Archivo subido. Recuerda presionar «${textoGuardar()}».`, "ok");
          } catch (err) {
            toast("No se pudo subir el archivo: " + err.message, "error");
          } finally {
            wrap.classList.remove("is-busy"); e.target.value = "";
          }
        },
      });
      wrap.append(h("span", { class: "btn btn--ghost btn--sm upload__btn" }, "Subir…", fileIn));
      input = wrap;
    } else if (def.type === "checkbox") {
      input = h("label", { class: "casilla" }, h("input", { id, type: "checkbox", checked: !!obj[def.k], onchange: (e) => set(e.target.checked) }), h("span", {}, def.texto || ""));
    } else if (def.type === "custom") {
      input = def.render(obj, () => { marcar(obj); onChange && onChange(); });
    } else {
      input = h("input", { id, type: def.type || "text", value: val, placeholder: def.placeholder || "", maxlength: def.max || null,
        oninput: (e) => set(e.target.value) });
    }
    return h("div", { class: "field" + (def.full ? " field--full" : "") },
      h("label", { for: id }, def.label), input, def.help ? h("small", {}, def.help) : null);
  }

  /* ---------- Cuerpo de una noticia: texto con formato simple y vista previa ---------- */
  function editorCuerpo(obj, avisar) {
    const ta = h("textarea", { rows: 12, class: "cuerpo__texto", placeholder: "Escribe aquí la noticia completa. Deja una línea en blanco entre párrafos." });
    ta.value = obj.cuerpo || "";
    const vista = h("div", { class: "cuerpo__vista noticia__cuerpo" });
    const pintar = () => {
      vista.innerHTML = window.TEXTO.html(ta.value, (u) => previews[u] || (/^(https?:|mailto:)/i.test(u) ? u : SITIO + u)) ||
        '<p class="cuerpo__vacio">Aquí verás cómo queda.</p>';
    };
    const cambiar = () => { obj.cuerpo = ta.value; pintar(); avisar(); };
    ta.addEventListener("input", cambiar);
    // Envuelve la selección (o inserta un ejemplo) con las marcas del formato
    const envolver = (antes, despues, ejemplo, alFinal) => {
      const a = ta.selectionStart, b = ta.selectionEnd;
      const sel = ta.value.slice(a, b) || ejemplo;
      ta.setRangeText(antes + sel + despues, a, b, "end");
      if (!alFinal) { ta.selectionStart = a + antes.length; ta.selectionEnd = a + antes.length + sel.length; }
      ta.focus(); cambiar();
    };
    // Inserta un bloque propio (subtítulo, lista, imagen) separado por líneas en blanco
    const bloque = (texto, aparte) => {
      const b = ta.selectionEnd, a = aparte ? b : ta.selectionStart;
      const previo = ta.value.slice(0, a);
      const sep = !previo.trim() ? "" : /\n\n$/.test(previo) ? "" : /\n$/.test(previo) ? "\n" : "\n\n";
      const sel = ta.value.slice(a, b);
      const t = typeof texto === "function" ? texto(sel) : texto;
      ta.setRangeText(sep + t + "\n\n", a, b, "end");
      ta.focus(); cambiar();
    };
    const boton = (txt, title, fn) => h("button", { type: "button", class: "btn btn--ghost btn--sm", title, onclick: fn }, txt);
    // Se pueden elegir varias fotos a la vez: se suben una tras otra y quedan juntas, como galería
    const fotoIn = h("input", {
      type: "file", accept: "image/*", multiple: true, hidden: true,
      onchange: async (e) => {
        const fs = [...e.target.files];
        e.target.value = "";
        if (!fs.length) return;
        const rutas = [], fallas = [];
        for (const [i, f] of fs.entries()) {
          toast(fs.length > 1 ? `Subiendo foto ${i + 1} de ${fs.length}…` : "Subiendo " + f.name + "…");
          try { rutas.push(await subirArchivo(/^image\/(png|jpeg|webp|gif)$/.test(f.type) ? await ajustarImagen(f, 1600) : f, "img/noticias")); }
          catch (err) { fallas.push(`${f.name}: ${err.message}`); }
        }
        if (rutas.length) bloque(rutas.map((r) => `![](${r})`).join("\n"), true);
        if (fallas.length) toast("No se pudo subir: " + fallas.join(" · "), "error");
        else toast(rutas.length > 1 ? `${rutas.length} fotos agregadas: se ven juntas, como galería.` : "Imagen agregada. Puedes escribir una descripción entre los corchetes [ ].", "ok");
      },
    });
    const barra = h("div", { class: "cuerpo__barra" },
      boton("Negrita", "Negrita: **texto**", () => envolver("**", "**", "texto destacado")),
      boton("Cursiva", "Cursiva: *texto*", () => envolver("*", "*", "texto")),
      boton("Subtítulo", "Subtítulo: ## Título", () => bloque((sel) => "## " + (sel || "Subtítulo"))),
      boton("Lista", "Lista con viñetas", () => bloque((sel) => (sel || "Primer punto\nSegundo punto").split("\n").map((l) => "- " + l.replace(/^\s*[-•]\s*/, "")).join("\n"))),
      boton("Cita", "Cita o texto destacado", () => bloque((sel) => (sel || "Texto citado").split("\n").map((l) => "> " + l).join("\n"))),
      boton("Enlace", "Enlace: [texto](https://…)", () => {
        const url = prompt("Dirección del enlace (https://…):", "https://");
        if (url && window.TEXTO.urlSegura(url)) envolver("[", `](${url.trim()})`, "texto del enlace", true);
        else if (url) toast("Ese enlace no es válido. Debe empezar con https://", "error");
      }),
      h("label", { class: "btn btn--ghost btn--sm", title: "Subir una o varias fotos dentro del texto" }, "Fotos…", fotoIn));
    pintar();
    return h("div", { class: "cuerpo" }, barra,
      h("div", { class: "cuerpo__panes" }, ta, vista),
      h("small", {}, "Formato: **negrita**, *cursiva*, ## subtítulo, - lista, > cita, [texto](enlace). Deja una línea en blanco entre párrafos. Si lo dejas vacío, la página muestra solo el resumen."));
  }

  // Enlace a la página propia de la noticia (se crea sola al guardar)
  function enlacePagina(obj) {
    const id = obj.id || window.TEXTO.idNoticia(obj);
    const url = SITIO + "noticia/" + encodeURIComponent(id) + "/";
    return h("p", { class: "cuerpo__link" }, obj.id ? h("a", { href: url, target: "_blank", rel: "noopener" }, "Ver la página de esta noticia ↗")
      : "La página de esta noticia se crea al guardar. Después de publicar, el botón «Seguir leyendo» llevará a ella y, al compartirla por WhatsApp o Facebook, se verá con su foto y resumen.");
  }

  // Cada noticia recibe un identificador fijo para su página (no cambia si después se edita el título)
  function idsNoticias() {
    const usados = new Set(state.data.noticias.map((n) => n.id).filter(Boolean));
    state.data.noticias.forEach((n) => {
      if (n.id) return;
      const base = window.TEXTO.idNoticia(n);
      let id = base, i = 2;
      while (usados.has(id)) id = `${base}-${i++}`;
      usados.add(id); n.id = id;
    });
  }

  /* ---------- Departamentos: identificador, enlace y selección de docentes ---------- */
  const idDepto = (d) => d.id || window.TEXTO.slug(String(d.nombre || "").replace(/^Departamento (de )?/i, "")) || "departamento";
  function idsDepartamentos() {
    const usados = new Set(state.data.departamentos.map((d) => d.id).filter(Boolean));
    state.data.departamentos.forEach((d) => {
      if (d.id) return;
      const base = idDepto(d);
      let id = base, i = 2;
      while (usados.has(id)) id = `${base}-${i++}`;
      usados.add(id); d.id = id;
    });
  }
  // Álbumes de la galería: identificador fijo para su página (/galeria/?a=…)
  function idsAlbumes() {
    const usados = new Set(state.data.galeria.map((a) => a.id).filter(Boolean));
    state.data.galeria.forEach((a) => {
      if (a.id) return;
      const base = window.TEXTO.slug(`${a.titulo || "album"}`) || "album";
      let id = base, i = 2;
      while (usados.has(id)) id = `${base}-${i++}`;
      usados.add(id); a.id = id;
    });
  }

  // Fotos de un álbum: subir varias de una vez, ordenar y quitar
  function editorFotos(obj, avisar) {
    obj.fotos = Array.isArray(obj.fotos) ? obj.fotos : [];
    const grilla = h("div", { class: "fotos-ed" });
    const pintar = () => {
      grilla.replaceChildren(...obj.fotos.map((f, i) => h("div", { class: "fotos-ed__item" + (i === 0 ? " es-portada" : "") },
        h("img", { src: resolver(f), alt: "", loading: "lazy" }),
        i === 0 ? h("span", { class: "fotos-ed__tag" }, "Portada") : null,
        h("div", { class: "fotos-ed__tools" },
          h("button", { type: "button", title: "Mover antes", disabled: i === 0, onclick: () => { [obj.fotos[i - 1], obj.fotos[i]] = [obj.fotos[i], obj.fotos[i - 1]]; avisar(); pintar(); } }, "←"),
          h("button", { type: "button", title: "Usar como portada", disabled: i === 0, onclick: () => { obj.fotos.unshift(obj.fotos.splice(i, 1)[0]); avisar(); pintar(); } }, "★"),
          h("button", { type: "button", title: "Mover después", disabled: i === obj.fotos.length - 1, onclick: () => { [obj.fotos[i + 1], obj.fotos[i]] = [obj.fotos[i], obj.fotos[i + 1]]; avisar(); pintar(); } }, "→"),
          h("button", { type: "button", title: "Quitar del álbum", class: "fotos-ed__x", onclick: () => { obj.fotos.splice(i, 1); avisar(); pintar(); } }, "✕")))));
      contador.textContent = obj.fotos.length ? `${obj.fotos.length} ${obj.fotos.length === 1 ? "foto" : "fotos"}. La primera es la portada del álbum.` : "Aún no hay fotos.";
    };
    const contador = h("small", {});
    const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp", multiple: true, class: "sr-only", onchange: async (e) => {
      const archivos = [...e.target.files];
      e.target.value = "";
      let hechas = 0;
      for (const f of archivos) {
        toast(`Subiendo foto ${hechas + 1} de ${archivos.length}…`);
        try {
          obj.fotos.push(await subirArchivo(await ajustarImagen(f, 1800), "img/galeria"));
          hechas++; avisar(); pintar();
        } catch (err) { toast(`No se pudo subir ${f.name}: ${err.message}`, "error"); }
      }
      if (hechas) toast(`${hechas} ${hechas === 1 ? "foto subida" : "fotos subidas"}. Recuerda presionar «${textoGuardar()}».`, "ok");
    } });
    pintar();
    return h("div", {},
      h("div", { class: "imp__btns" }, h("label", { class: "btn btn--primary btn--sm" }, "Subir fotos…", input), contador),
      h("p", { class: "panel__help" }, "Puedes elegir varias fotos a la vez. Se achican y se les quitan los datos ocultos (como la ubicación) antes de subirlas."),
      grilla);
  }

  // Departamentos o equipos de una noticia (antes era uno solo, en «departamento»)
  const deptosDeNoticia = (n) => (Array.isArray(n.departamentos) ? n.departamentos : n.departamento ? [n.departamento] : []);
  function deptosNoticia(obj, avisar) {
    const todos = state.data.departamentos;
    if (!todos.length) return h("p", { class: "cuerpo__link" }, "Aún no hay departamentos ni equipos. Créalos en «Departamentos».");
    const grupo = (titulo, ds) => ds.length ? h("div", { class: "deptos-noticia" }, h("p", { class: "deptos-noticia__titulo" }, titulo),
      h("div", { class: "checks" }, ds.map((d) => {
        const id = idDepto(d);
        return h("label", { class: "check" }, h("input", { type: "checkbox", checked: deptosDeNoticia(obj).includes(id), onchange: (e) => {
          const set = new Set(deptosDeNoticia(obj));
          if (e.target.checked) set.add(id); else set.delete(id);
          delete obj.departamento;
          obj.departamentos = todos.map(idDepto).filter((x) => set.has(x));
          if (!obj.departamentos.length) delete obj.departamentos;
          avisar();
        } }), String(d.nombre).replace(/^Departamento (de )?/i, ""));
      }))) : null;
    return h("div", {}, grupo("Departamentos académicos", todos.filter((d) => d.tipo === "academico")), grupo("Equipos de apoyo", todos.filter((d) => d.tipo !== "academico")));
  }
  function enlaceDepto(obj) {
    return h("p", { class: "cuerpo__link" }, obj.id ? h("a", { href: SITIO + "departamentos/?d=" + encodeURIComponent(obj.id), target: "_blank", rel: "noopener" }, obj.tipo === "academico" ? "Ver la página del departamento ↗" : "Ver la página del equipo ↗")
      : "Su página se crea al guardar.");
  }
  // Casillas para elegir los departamentos académicos de un docente (puede estar en más de uno)
  function elegirDeptos(obj, avisar) {
    const acas = state.data.departamentos.filter((d) => d.tipo === "academico");
    if (!acas.length) return h("p", { class: "cuerpo__link" }, "Primero crea los departamentos académicos en «Departamentos».");
    return h("div", { class: "checks" }, acas.map((d) => {
      const id = idDepto(d);
      return h("label", { class: "check" }, h("input", { type: "checkbox", checked: (obj.departamentos || []).includes(id), onchange: (e) => {
        const set = new Set(obj.departamentos || []);
        if (e.target.checked) set.add(id); else set.delete(id);
        obj.departamentos = acas.map(idDepto).filter((x) => set.has(x));
        if (!obj.departamentos.length) delete obj.departamentos;
        avisar();
      } }), String(d.nombre).replace(/^Departamento (de )?/i, ""));
    }));
  }

  /* ---------- Editor de listas ---------- */
  function editorLista({ items, campos, resumen, miniatura, nuevo, agregarArriba, textoAgregar, vacio }) {
    const cont = h("div");
    const abiertos = new WeakSet();

    const pintar = () => {
      cont.innerHTML = "";
      if (!items.length) cont.append(h("p", { class: "empty" }, vacio));
      const list = h("div", { class: "list" });
      items.forEach((it, i) => {
        const titulo = h("div", { class: "item__title" });
        const thumb = h("span", { class: "item__thumb" });
        const refrescar = () => {
          const r = resumen(it);
          titulo.replaceChildren(h("strong", {}, r[0] || "(sin título)"), h("small", {}, r[1] || ""));
          thumb.innerHTML = "";
          miniatura(it, thumb);
        };
        refrescar();
        const mover = (d) => (e) => { e.stopPropagation(); items.splice(i + d, 0, items.splice(i, 1)[0]); setDirty(true); pintar(); };
        const item = h("div", { class: "item" + (abiertos.has(it) ? " is-open" : "") },
          h("div", { class: "item__head", onclick: () => { item.classList.toggle("is-open"); item.classList.contains("is-open") ? abiertos.add(it) : abiertos.delete(it); } },
            thumb, titulo,
            h("div", { class: "item__tools" },
              h("button", { class: "icon-btn", title: "Subir", "aria-label": "Mover arriba", disabled: i === 0, onclick: mover(-1) }, "↑"),
              h("button", { class: "icon-btn", title: "Bajar", "aria-label": "Mover abajo", disabled: i === items.length - 1, onclick: mover(1) }, "↓"),
              h("button", { class: "icon-btn icon-btn--danger", title: "Eliminar", "aria-label": "Eliminar",
                onclick: (e) => { e.stopPropagation(); if (confirm(`¿Eliminar «${resumen(it)[0] || "este elemento"}»?`)) { items.splice(i, 1); setDirty(true); pintar(); } } }, "✕"))),
          h("div", { class: "item__body" }, campos.map((c) => campo(c, it, refrescar))));
        list.append(item);
      });
      cont.append(list);
    };

    pintar();
    const add = h("div", { class: "add-row" }, h("button", { class: "btn btn--ghost", onclick: () => {
      const n = nuevo();
      agregarArriba ? items.unshift(n) : items.push(n);
      abiertos.add(n); setDirty(true); pintar();
    } }, "+ " + textoAgregar));
    return h("div", {}, agregarArriba ? add : null, cont, agregarArriba ? null : add);
  }

  const iniciales = (it) => it.iniciales || (it.cargo || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const fotoOIniciales = (src, txt) => (it, el) => {
    const s = resolver(it[src]);
    if (s) el.append(h("img", { src: s, alt: "" })); else el.textContent = txt(it);
  };

  /* ---------- Borradores de noticias ----------
     Cada persona guarda sus borradores en su propia cuenta de GitHub, cifrados con su token:
     el dueño en la rama «borradores» del repositorio y los funcionarios en la rama «borradores» de su copia.
     Así se puede empezar una noticia en el computador y terminarla en el celular con el mismo token.
     Como el repositorio es público, el archivo se guarda cifrado (AES-GCM) y con un nombre que no muestra el usuario.
     Si el token se renueva, los borradores anteriores ya no se pueden abrir (hay que publicarlos antes). */
  const RAMA_BORRADORES = "borradores";
  const bor = { cargado: false, cargando: null, lista: [], sha: null, destino: null, sal: null, clave: null, estado: "", error: "", ilegible: false, timer: 0, guardando: null, otraVez: false };
  const b64 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const deB64 = (t) => Uint8Array.from(atob(t), (c) => c.charCodeAt(0));
  const hex = (buf) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, "0")).join("");
  const copiaLocal = () => "csm-borradores-" + state.login;

  async function claveBorradores(sal) {
    if (bor.clave && bor.sal === sal) return bor.clave;
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(state.token), "PBKDF2", false, ["deriveKey"]);
    bor.clave = await crypto.subtle.deriveKey({ name: "PBKDF2", salt: deB64(sal), iterations: 150000, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    bor.sal = sal;
    return bor.clave;
  }
  // Con el correo del colegio los borradores quedan en la base de datos privada del servidor (no en GitHub, que es público)
  async function cifrar(obj) {
    if (state.sesion) return JSON.stringify(obj);
    const sal = bor.sal || b64(crypto.getRandomValues(new Uint8Array(16)));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const datos = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await claveBorradores(sal), new TextEncoder().encode(JSON.stringify(obj)));
    return JSON.stringify({ v: 1, sal, iv: b64(iv), datos: b64(new Uint8Array(datos)) });
  }
  async function descifrar(texto) {
    const f = JSON.parse(texto);
    if (state.sesion) return f;
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(f.iv) }, await claveBorradores(f.sal), deB64(f.datos));
    return JSON.parse(new TextDecoder().decode(claro));
  }

  // Dónde se guardan: repositorio (dueño) o copia del funcionario, rama «borradores»
  async function destinoBorradores() {
    if (bor.destino) return bor.destino;
    let owner = state.owner, repo = state.repo, desde = state.base;
    if (state.modo !== "directo") {
      const fork = await api(`/repos/${state.owner}/${state.repo}/forks`, { method: "POST", body: JSON.stringify({ default_branch_only: true }) });
      owner = fork.owner.login; repo = fork.name;
      for (let i = 0; i < 15; i++) {
        try { desde = (await api(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(fork.default_branch || state.branch)}`)).object.sha; break; }
        catch (e) { if (i === 14) throw e; await new Promise((ok) => setTimeout(ok, 2000)); }
      }
    }
    const nombre = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("csm-borradores:" + state.login.toLowerCase()))).slice(0, 20);
    bor.destino = { owner, repo, ruta: `borradores/${nombre}.json`, desde };
    return bor.destino;
  }
  async function asegurarRama(d) {
    try { await api(`/repos/${d.owner}/${d.repo}/git/ref/heads/${RAMA_BORRADORES}`); }
    catch (e) {
      if (e.status !== 404) throw e;
      await api(`/repos/${d.owner}/${d.repo}/git/refs`, { method: "POST", body: JSON.stringify({ ref: "refs/heads/" + RAMA_BORRADORES, sha: d.desde }) });
    }
  }
  async function leerRemoto() {
    if (state.sesion) { const r = await pedirServidor("/panel/borradores"); return { sha: r.version, texto: r.texto }; }
    const d = await destinoBorradores();
    try {
      const meta = await api(`/repos/${d.owner}/${d.repo}/contents/${d.ruta}?ref=${RAMA_BORRADORES}`);
      const res = await fetch(`https://api.github.com/repos/${d.owner}/${d.repo}/contents/${d.ruta}?ref=${RAMA_BORRADORES}`, {
        headers: { Accept: "application/vnd.github.raw", Authorization: "Bearer " + state.token, "X-GitHub-Api-Version": "2022-11-28" } });
      if (!res.ok) throw new Error(res.status);
      return { sha: meta.sha, texto: await res.text() };
    } catch (e) { if (e.status === 404) return { sha: null, texto: "" }; throw e; }
  }
  // Une dos listas: por cada borrador gana la versión más reciente; los borrados se recuerdan
  const unir = (a, b) => {
    const m = new Map();
    [...a, ...b].forEach((x) => { const y = m.get(x.id); if (!y || (x.actualizado || "") > (y.actualizado || "")) m.set(x.id, x); });
    return [...m.values()].sort((x, y) => (y.actualizado || "").localeCompare(x.actualizado || ""));
  };
  const visibles = () => bor.lista.filter((x) => !x.borrado);

  async function cargarBorradores() {
    if (bor.cargado) return;
    if (!bor.cargando) bor.cargando = (async () => {
      let local = [];
      try { local = JSON.parse(localStorage.getItem(copiaLocal()) || "[]"); } catch (e) { /* sin copia */ }
      try {
        const r = await leerRemoto();
        bor.sha = r.sha;
        let remota = [];
        if (r.texto) {
          try { remota = (await descifrar(r.texto)).borradores || []; }
          catch (e) { bor.ilegible = true; }
        }
        bor.lista = unir(remota, local);
        bor.estado = "Borradores al día.";
      } catch (e) {
        bor.lista = local;
        bor.error = "No se pudieron leer los borradores de tu cuenta: " + e.message;
      }
      bor.cargado = true;
    })();
    return bor.cargando;
  }

  // Guarda en el celular/computador al tiro y en la cuenta unos segundos después de dejar de escribir
  function programarGuardado(inmediato) {
    try { localStorage.setItem(copiaLocal(), JSON.stringify(bor.lista)); } catch (e) { /* sin espacio: se guarda igual en la cuenta */ }
    bor.estado = "Cambios sin guardar en tu cuenta…";
    pintarEstadoBorradores();
    clearTimeout(bor.timer);
    bor.timer = setTimeout(guardarBorradores, inmediato ? 0 : 4000);
  }
  async function guardarBorradores() {
    clearTimeout(bor.timer); bor.timer = 0;
    if (bor.guardando) { bor.otraVez = true; return bor.guardando; }
    if (bor.ilegible) { bor.estado = ""; bor.error = "Hay borradores guardados con un token anterior que ya no se pueden abrir. Bórralos para volver a guardar en tu cuenta."; pintarEstadoBorradores(); return; }
    bor.guardando = (async () => {
      bor.estado = "Guardando en tu cuenta…"; bor.error = ""; pintarEstadoBorradores();
      try {
        const d = state.sesion ? null : await destinoBorradores();
        if (d) await asegurarRama(d);
        // Los borrados se recuerdan 30 días para que otro equipo no los reviva
        const limite = new Date(Date.now() - 30 * 864e5).toISOString();
        bor.lista = bor.lista.filter((x) => !x.borrado || x.actualizado > limite);
        const subir = async () => state.sesion
          ? pedirServidor("/panel/borradores", { texto: await cifrar({ borradores: bor.lista }), version: bor.sha || 0 }).then((x) => ({ content: { sha: x.version } }))
          : api(`/repos/${d.owner}/${d.repo}/contents/${d.ruta}`, { method: "PUT", body: JSON.stringify({
          message: "Guardar borrador", branch: RAMA_BORRADORES, content: utf8ToB64(await cifrar({ borradores: bor.lista })), ...(bor.sha ? { sha: bor.sha } : {}) }) });
        let r;
        try { r = await subir(); }
        catch (e) {
          if (e.status !== 409 && e.status !== 422) throw e;
          // Se guardó desde otro equipo mientras tanto: se juntan ambas versiones
          const otra = await leerRemoto();
          bor.sha = otra.sha;
          if (otra.texto) bor.lista = unir(bor.lista, (await descifrar(otra.texto)).borradores || []);
          r = await subir();
        }
        bor.sha = r.content.sha;
        bor.estado = "Guardado en tu cuenta a las " + new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }) + ".";
      } catch (e) {
        bor.error = navigator.onLine === false ? "Sin conexión: el borrador quedó en este equipo y se guardará en tu cuenta al reconectar." : "No se pudo guardar en tu cuenta: " + e.message + ". Quedó guardado en este equipo.";
      }
      bor.guardando = null;
      pintarEstadoBorradores();
      if (bor.otraVez) { bor.otraVez = false; guardarBorradores(); }
    })();
    return bor.guardando;
  }
  window.addEventListener("online", () => { if (bor.cargado && bor.error) guardarBorradores(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && bor.timer && bor.cargado) guardarBorradores(); });

  // Archivos que un funcionario subió en este equipo y usa el borrador: viajan dentro del borrador
  const archivosDe = (b) => {
    if (state.modo !== "revision") return {};
    const txt = JSON.stringify(b.noticia);
    return Object.fromEntries(Object.entries({ ...(b.archivos || {}), ...subidas }).filter(([ruta]) => txt.includes(ruta)));
  };

  let pintarEstadoBorradores = () => {};
  function panelBorradores(camposNoticia, alPublicar, textoPublicar = "Publicar noticia") {
    const caja = h("div", { class: "panel borradores" });
    const estado = h("p", { class: "borradores__estado" });
    const lista = h("div", { class: "list" });
    const abiertos = new Set();
    pintarEstadoBorradores = () => {
      estado.textContent = bor.error || bor.estado;
      estado.classList.toggle("is-error", !!bor.error);
    };
    const tocar = (b) => {
      b.actualizado = new Date().toISOString();
      b.equipo = /Mobi|Android|iPhone/i.test(navigator.userAgent) ? "celular" : "computador";
      b.archivos = archivosDe(b);
    };
    const pintar = () => {
      lista.innerHTML = "";
      if (!bor.cargado) { lista.append(h("p", { class: "empty" }, "Cargando tus borradores…")); return; }
      if (bor.ilegible) lista.append(h("p", { class: "empty" }, "Hay borradores guardados con un token anterior que no se pueden abrir. ",
        h("button", { class: "link-btn", onclick: () => { if (confirm("¿Borrar los borradores que ya no se pueden abrir?")) { bor.ilegible = false; bor.sha = bor.sha || null; programarGuardado(true); pintar(); } } }, "Borrarlos")));
      const vs = visibles();
      if (!vs.length) lista.append(h("p", { class: "empty" }, "No tienes borradores. Usa «Nuevo borrador» para escribir una noticia sin publicarla todavía."));
      vs.forEach((b) => {
        if (b.abrir) { abiertos.add(b.id); delete b.abrir; }
        const n = b.noticia;
        // Recupera las fotos que viajaron en el borrador para verlas aquí
        Object.entries(b.archivos || {}).forEach(([ruta, url]) => { if (/^data:image\//.test(url) && !previews[ruta]) previews[ruta] = url; });
        n[BORRADOR] = () => { tocar(b); programarGuardado(); refrescar(); };
        const titulo = h("div", { class: "item__title" });
        const refrescar = () => titulo.replaceChildren(h("strong", {}, n.titulo || "(sin título)"),
          h("small", {}, "Borrador · " + new Date(b.actualizado).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) + (b.equipo ? " · desde " + b.equipo : "")));
        refrescar();
        const item = h("div", { class: "item item--borrador" + (abiertos.has(b.id) ? " is-open" : "") },
          h("div", { class: "item__head", onclick: () => { item.classList.toggle("is-open"); item.classList.contains("is-open") ? abiertos.add(b.id) : abiertos.delete(b.id); } },
            h("span", { class: "item__thumb" }, "✎"), titulo,
            h("div", { class: "item__tools" },
              h("button", { class: "icon-btn icon-btn--danger", title: "Eliminar borrador", "aria-label": "Eliminar borrador", onclick: (e) => {
                e.stopPropagation();
                if (!confirm(`¿Eliminar el borrador «${n.titulo || "sin título"}»?`)) return;
                b.borrado = true; b.noticia = {}; b.archivos = {}; b.actualizado = new Date().toISOString();
                programarGuardado(true); pintar();
              } }, "✕"))),
          h("div", { class: "item__body" }, camposNoticia.map((c) => campo(c, n, refrescar)),
            h("div", { class: "borradores__acciones" },
              h("button", { class: "btn btn--ghost btn--sm", onclick: () => { tocar(b); programarGuardado(true); } }, "Guardar borrador"),
              h("button", { class: "btn btn--primary btn--sm", onclick: async (e) => {
                if (!(n.titulo || "").trim()) return toast("Escribe un título antes de publicar.", "error");
                e.target.disabled = true;
                try {
                  // Un funcionario en otro equipo: vuelve a subir los archivos que venían en el borrador
                  for (const [ruta, url] of Object.entries(archivosDe(b))) {
                    if (!subidas[ruta]) { await escribir(ruta, url.split(",")[1], "Subir archivo de un borrador desde el panel", { sha: null }); subidas[ruta] = url; }
                  }
                  const publicada = JSON.parse(JSON.stringify(n));
                  b.borrado = true; b.noticia = {}; b.archivos = {}; b.actualizado = new Date().toISOString();
                  programarGuardado(true);
                  // Si no se pudo enviar (noticias con aprobación), el borrador vuelve tal como estaba
                  if ((await alPublicar(publicada)) === false) {
                    Object.assign(b, { borrado: false, noticia: publicada, actualizado: new Date().toISOString() });
                    programarGuardado(true); pintar();
                  }
                } catch (err) { toast("No se pudo preparar la noticia: " + err.message, "error"); e.target.disabled = false; }
              } }, textoPublicar))));
        lista.append(item);
      });
    };
    caja.append(
      h("div", { class: "borradores__cab" }, h("h2", {}, "Mis borradores"),
        h("button", { class: "btn btn--ghost btn--sm", onclick: () => {
          if (!bor.cargado) return;
          const b = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), noticia: { fecha: new Date().toLocaleDateString("sv"), tipo: "comunicado", titulo: "", resumen: "", url: "", imagen: "" } };
          tocar(b); bor.lista.unshift(b); abiertos.add(b.id); programarGuardado(); pintar();
        } }, "+ Nuevo borrador")),
      h("p", { class: "panel__help" }, "Solo tú los ves. Se guardan solos en tu cuenta mientras escribes, así puedes seguir en otro equipo (computador o celular) entrando con " + (state.sesion ? "tu correo" : "el mismo token") + ". No se publican hasta que presionas «" + textoPublicar + "»."),
      lista, estado);
    pintar(); pintarEstadoBorradores();
    if (!bor.cargado) cargarBorradores().then(() => { pintar(); pintarEstadoBorradores(); });
    return caja;
  }

  /* ---------- Instagram: imágenes y texto listos para publicar una noticia ----------
     Solo en el panel. Las imágenes se arman aquí mismo (en el equipo de quien publica) con un canvas. */
  const IG = { max: 20, pie: 2200 };
  const imgsCuerpo = (n) => [...String(n.cuerpo || "").matchAll(/^!\[[^\]]*\]\(([^)\s]+)\)\s*$/gm)].map((m) => m[1]);
  const imgsNoticia = (n) => [...new Set([n.imagen, ...imgsCuerpo(n)].filter((s) => s && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(s)))];
  const urlNoticia = (n) => "https://colegiosm.cl/noticia/" + encodeURIComponent(n.id || window.TEXTO.idNoticia(n)) + "/";

  // Texto plano (sin marcas) para la descripción de Instagram
  function textoPlano(t) {
    return String(t || "").split("\n")
      .filter((l) => !/^!\[[^\]]*\]\([^)]*\)\s*$/.test(l.trim()))
      .map((l) => l.replace(/^#{1,6}\s+/, "").replace(/^>\s?/, "").replace(/^[-*]\s+/, "• ")
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, "$1").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1"))
      .join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const HASHTAGS = "#ColegioSanMartín #Iquique #ComunidadSanMartín";
  // Partes de un comunicado publicado (asunto, saludo, párrafos, despedida y firmas), leídas del cuerpo de la noticia
  function partesComunicado(n) {
    const bloques = String(n.cuerpo || "").replace(/\r/g, "").split(/\n\s*\n/).map((b) => b.trim())
      .filter((b) => b && !/^!\[[^\]]*\]\([^)]*\)$/.test(b));
    let asunto = "", saludo = "", despedida = "", firmas = [];
    if (bloques[0] && /^#{1,6}\s/.test(bloques[0])) asunto = textoPlano(bloques.shift());
    const ult = bloques[bloques.length - 1];
    if (ult && ult.split("\n").every((l) => /^\*\*[^*]+\*\*$/.test(l.trim()) || l.trim() === "Colegio San Martín")) {
      firmas = bloques.pop().split("\n").map((l) => l.replace(/\*\*/g, "").trim()).filter((l) => l && l !== "Colegio San Martín");
    }
    const d = bloques[bloques.length - 1];
    if (firmas.length && d && !d.includes("\n") && d.length <= 60) despedida = textoPlano(bloques.pop());
    if (bloques[0] && /^\*\*[^*]+\*\*$/.test(bloques[0]) && bloques[0].length <= 90) saludo = textoPlano(bloques.shift());
    // Cada línea es un párrafo (en Instagram se lee mejor con espacio entre ellos); una viñeta va pegada a la línea que la presenta
    const parrafos = [];
    textoPlano(bloques.join("\n")).split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => {
      if (/^•/.test(l) && parrafos.length) parrafos[parrafos.length - 1] += "\n" + l; else parrafos.push(l);
    });
    // Si la despedida o las firmas también quedaron escritas al final del texto, no se repiten
    const sobra = new Set([despedida, ...firmas, "Colegio San Martín"].filter(Boolean).map((x) => x.toLowerCase()));
    while (parrafos.length && sobra.has(parrafos[parrafos.length - 1].toLowerCase())) parrafos.pop();
    return { asunto, saludo, parrafos, despedida, firmas };
  }
  // Texto ordenado del comunicado; con «max», se acortan los últimos párrafos para que quepa en Instagram
  function textoComunicado(n, cierre = "", max = Infinity) {
    const p = partesComunicado(n), titulo = String(n.titulo || "Comunicado").trim();
    const inicio = ["📢 " + (/comunicado/i.test(titulo) ? titulo : "Comunicado: " + titulo), p.asunto && p.asunto.toLowerCase() !== titulo.toLowerCase() && !titulo.toLowerCase().endsWith(p.asunto.toLowerCase()) ? "📌 " + p.asunto : "", p.saludo].filter(Boolean).join("\n\n");
    const fin = [p.despedida, p.firmas.length ? p.firmas.join(" · ") + "\nColegio San Martín" : ""].filter(Boolean).join("\n");
    const armar = (ps, cortado) => [inicio, ...ps, cortado ? "(…) Lee el comunicado completo en colegiosm.cl." : "", fin].filter(Boolean).join("\n\n") + cierre;
    const ps = p.parrafos.slice();
    let t = armar(ps, false);
    while (t.length > max && ps.length > 1) { ps.pop(); t = armar(ps, true); }
    return t.slice(0, max);
  }
  function pieInstagram(n) {
    if (n.comunicado) return textoComunicado(n, "\n\n📲 Más información en colegiosm.cl (enlace en nuestra biografía).\n\n" + HASHTAGS + " #Comunicado", IG.pie);
    const cierre = "\n\n📲 Lee la noticia completa en colegiosm.cl (enlace en nuestra biografía).\n\n" + HASHTAGS;
    let cuerpo = textoPlano(n.cuerpo);
    // El resumen no se repite si el texto ya empieza igual
    const resumen = String(n.resumen || "").replace(/…$/, "").trim(), igual = (s) => s.replace(/\s+/g, " ").slice(0, 80);
    const partes = [n.titulo, resumen && cuerpo && igual(cuerpo) === igual(resumen) ? "" : n.resumen].filter(Boolean).map((s) => String(s).trim());
    let base = partes.join("\n\n");
    const libre = IG.pie - base.length - cierre.length - 4;
    if (cuerpo && libre > 80) {
      if (cuerpo.length > libre) cuerpo = cuerpo.slice(0, libre - 1).replace(/\s+\S*$/, "") + "…";
      base += "\n\n" + cuerpo;
    }
    return (base + cierre).slice(0, IG.pie);
  }

  // Instrucciones para que una IA (ChatGPT, Gemini, Claude…) redacte la descripción con la información de la noticia
  function promptInstagram(n) {
    const com = !!n.comunicado, que = com ? "del comunicado oficial" : "de la noticia";
    const fuente = com ? textoComunicado(n) : [n.titulo, n.resumen, textoPlano(n.cuerpo)].filter(Boolean).map((s) => String(s).trim()).join("\n\n");
    return `Eres quien maneja el Instagram del Colegio San Martín de Iquique (Chile). Redacta la descripción de una publicación de Instagram a partir ${que} que está al final.

Reglas:
- Español de Chile, tono cercano y respetuoso, dirigido a estudiantes, familias y apoderados.
- Primera línea: una frase breve (máximo 120 caracteres) que diga de qué se trata, con un emoji al inicio. Es lo único que se ve antes de «más».
- Después, párrafos cortos separados por una línea en blanco: qué se informa, desde cuándo, a quién afecta y qué deben hacer las familias. Si hay alternativas, requisitos o pasos, ponlos como lista con «•».
${com ? "- Al final, quién firma (solo los cargos), en una línea.\n" : ""}- No inventes nada: usa solo las fechas, horarios, nombres y condiciones que aparecen en el texto. Si un dato no está, no lo agregues.
- Máximo 5 emojis en total. Sin negritas, asteriscos ni almohadillas (Instagram no las muestra).
- Termina con esta línea: «📲 Más información en colegiosm.cl (enlace en nuestra biografía).» y, en la línea siguiente, estos hashtags: ${HASHTAGS}${com ? " #Comunicado" : ""}
- Largo total: menos de 1.500 caracteres.
- Responde solo con el texto final, listo para copiar.

${com ? "Comunicado" : "Noticia"} (enlace: ${urlNoticia(n)}):
"""
${fuente}
"""`;
  }

  // Carga una imagen del sitio; si aún no está publicada, la pide a GitHub
  async function imagenIG(src) {
    let blob = null;
    // Recién subida en esta sesión: se usa la copia local (el panel no puede «descargar» una dirección data:)
    const dato = previews[src] || (/^data:/.test(src) ? src : "");
    if (dato) return await createImageBitmap(new Blob([deB64(dato.split(",")[1])], { type: dato.slice(5, dato.indexOf(";")) }));
    try {
      const r = await fetch(resolver(src), { cache: "no-store" });
      if (r.ok && /^image\//.test(r.headers.get("content-type") || "image/")) blob = await r.blob();
    } catch (e) { /* se intenta con GitHub */ }
    if (!blob && !/^(https?:|data:|blob:)/.test(src)) {
      const f = await gh(`/contents/${src.split("?")[0]}?ref=${encodeURIComponent(state.branch)}`);
      // GitHub no incluye el contenido de archivos de más de 1 MB: esos se bajan de su dirección directa
      if (f.content) blob = new Blob([deB64(String(f.content).replace(/\s/g, ""))]);
      else if (f.download_url) { const r = await fetch(f.download_url, { cache: "no-store" }); if (r.ok) blob = await r.blob(); }
    }
    if (!blob) throw new Error("No se pudo cargar " + src);
    return await createImageBitmap(blob);
  }

  const lienzoIG = (w, hh) => { const c = document.createElement("canvas"); c.width = w; c.height = hh; return [c, c.getContext("2d")]; };
  function cubrir(ctx, img, x, y, w, hh) {
    const s = Math.max(w / img.width, hh / img.height), iw = img.width * s, ih = img.height * s;
    ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, hh); ctx.clip();
    ctx.drawImage(img, x + (w - iw) / 2, y + (hh - ih) / 2, iw, ih); ctx.restore();
  }
  function caber(ctx, img, x, y, w, hh) {
    const s = Math.min(w / img.width, hh / img.height), iw = img.width * s, ih = img.height * s;
    ctx.drawImage(img, x + (w - iw) / 2, y + (hh - ih) / 2, iw, ih);
  }
  function redondeado(ctx, x, y, w, hh, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + hh, r); ctx.arcTo(x + w, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // Parte un texto en líneas que caben en el ancho; corta con «…» si sobran
  function lineas(ctx, texto, ancho, max) {
    const pal = String(texto || "").replace(/\s+/g, " ").trim().split(" ");
    const out = []; let l = "";
    for (const p of pal) {
      const prueba = l ? l + " " + p : p;
      if (ctx.measureText(prueba).width <= ancho || !l) l = prueba; else { out.push(l); l = p; }
    }
    if (l) out.push(l);
    if (out.length > max) { out.length = max; let u = out[max - 1]; while (u && ctx.measureText(u + "…").width > ancho) u = u.replace(/\s*\S+$/, ""); out[max - 1] = u + "…"; }
    return out;
  }
  // Título con el tamaño más grande que quepa en las líneas permitidas
  function tituloIG(ctx, texto, ancho, maxLineas, grande, chico, maxAlto = Infinity) {
    for (let t = grande; t >= chico; t -= 4) {
      ctx.font = `700 ${t}px Fraunces, Georgia, serif`;
      const ls = lineas(ctx, texto, ancho, 99);
      if (ls.length <= maxLineas && ls.length * t * 1.15 <= maxAlto) return { t, ls };
    }
    ctx.font = `700 ${chico}px Fraunces, Georgia, serif`;
    return { t: chico, ls: lineas(ctx, texto, ancho, Math.min(maxLineas, Math.max(1, Math.floor(maxAlto / (chico * 1.15))))) };
  }
  const coloresIG = () => {
    const c = state.data.colores || {};
    return { p: c.primario || "#3b0d18", s: c.secundario || "#7a1f35", a: c.acento || "#e0b45c" };
  };
  const fechaLarga = (f) => f ? new Date(f + "T12:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : "";
  async function fuentesIG() {
    try { await Promise.all(["700 60px Fraunces", "600 30px Inter", "400 30px Inter"].map((f) => document.fonts.load(f))); } catch (e) { /* fuentes del sistema */ }
  }
  async function logoIG() {
    const l = state.data.logo && state.data.logo.imagen;
    if (!l) return null;
    try { return await imagenIG(l); } catch (e) { return null; }
  }
  const aArchivo = (c, nombre) => new Promise((ok) => c.toBlob((b) => ok(new File([b], nombre, { type: "image/jpeg" })), "image/jpeg", 0.9));

  // Foto en formato 4:5 (1080×1350) sin recortar: el espacio sobrante se rellena con la misma foto difuminada
  function fotoFeed(img) {
    const [c, ctx] = lienzoIG(1080, 1350);
    const r = img.width / img.height;
    if (Math.abs(r - 0.8) < 0.05) { cubrir(ctx, img, 0, 0, 1080, 1350); return c; }
    ctx.filter = "blur(48px) brightness(.6)"; cubrir(ctx, img, -80, -80, 1240, 1510); ctx.filter = "none";
    caber(ctx, img, 0, 0, 1080, 1350);
    return c;
  }
  // Portada con el título (primera imagen del carrusel)
  function portadaFeed(n, img, logo) {
    const col = coloresIG(); const [c, ctx] = lienzoIG(1080, 1350);
    ctx.fillStyle = col.p; ctx.fillRect(0, 0, 1080, 1350);
    const altoFoto = img ? 760 : 0;
    if (img) cubrir(ctx, img, 0, 0, 1080, altoFoto);
    const g = ctx.createLinearGradient(0, altoFoto - 160, 0, altoFoto);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, col.p); ctx.fillStyle = g; ctx.fillRect(0, altoFoto - 160, 1080, 160);
    let y = altoFoto + (img ? 70 : 260);
    ctx.fillStyle = col.a; ctx.font = "600 30px Inter, Arial, sans-serif";
    ctx.fillText(["NOTICIAS", fechaLarga(n.fecha).toUpperCase()].filter(Boolean).join("  ·  "), 80, y);
    y += 40;
    const tt = tituloIG(ctx, n.titulo || "", 920, img ? 4 : 6, img ? 76 : 92, 46, 1180 - y);
    ctx.fillStyle = "#fff";
    tt.ls.forEach((l) => { y += tt.t * 1.15; ctx.fillText(l, 80, y); });
    ctx.fillStyle = col.a; ctx.fillRect(80, 1220, 90, 6);
    if (logo) caber(ctx, logo, 900, 1180, 100, 110);
    ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = "600 30px Inter, Arial, sans-serif";
    ctx.fillText("Colegio San Martín · Iquique", 80, 1275);
    return c;
  }
  // Historia vertical 1080×1920 (las zonas de arriba y abajo quedan libres para los controles de Instagram)
  function historiaIG(n, img, logo) {
    const col = coloresIG(); const [c, ctx] = lienzoIG(1080, 1920);
    const g = ctx.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, col.s); g.addColorStop(1, col.p);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1920);
    let y = 250;
    if (logo) caber(ctx, logo, 80, y - 10, 90, 100);
    ctx.fillStyle = "#fff"; ctx.font = "700 40px Fraunces, Georgia, serif"; ctx.fillText("Colegio San Martín", logo ? 190 : 80, y + 40);
    ctx.fillStyle = col.a; ctx.font = "600 26px Inter, Arial, sans-serif"; ctx.fillText("IQUIQUE", logo ? 192 : 82, y + 80);
    y += 150;
    if (img) {
      ctx.save(); redondeado(ctx, 80, y, 920, 640, 36); ctx.clip(); cubrir(ctx, img, 80, y, 920, 640); ctx.restore();
      y += 640 + 80;
    } else y += 120;
    ctx.fillStyle = col.a; ctx.font = "600 30px Inter, Arial, sans-serif";
    ctx.fillText(["NOTICIA", fechaLarga(n.fecha).toUpperCase()].filter(Boolean).join("  ·  "), 80, y); y += 30;
    const tt = tituloIG(ctx, n.titulo || "", 920, img ? 4 : 6, 80, 50, 1520 - y);
    ctx.fillStyle = "#fff"; tt.ls.forEach((l) => { y += tt.t * 1.15; ctx.fillText(l, 80, y); });
    const tope = 1560;
    if (n.resumen && y + 80 < tope - 60) {
      ctx.font = "400 36px Inter, Arial, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.85)";
      const max = Math.max(0, Math.floor((tope - 60 - y - 30) / 52));
      lineas(ctx, n.resumen, 920, Math.min(max, 5)).forEach((l, i) => ctx.fillText(l, 80, y + 70 + i * 52));
    }
    // Botón «Lee la noticia…» (encima se puede poner el sticker de enlace)
    ctx.fillStyle = col.a; redondeado(ctx, 80, tope, 920, 110, 55); ctx.fill();
    ctx.fillStyle = col.p; ctx.font = "700 36px Inter, Arial, sans-serif"; ctx.textAlign = "center";
    ctx.fillText("Lee la noticia completa en colegiosm.cl", 540, tope + 68); ctx.textAlign = "left";
    return c;
  }

  async function compartirArchivos(archivos, titulo) {
    if (navigator.canShare && navigator.canShare({ files: archivos })) {
      try { await navigator.share({ files: archivos, title: titulo }); return true; }
      catch (e) { if (e.name === "AbortError") return true; }
    }
    return false;
  }
  function descargar(archivos) {
    archivos.forEach((f, i) => setTimeout(() => {
      const u = URL.createObjectURL(f);
      const a = h("a", { href: u, download: f.name }); document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 4000);
    }, i * 400));
  }
  const copiar = async (t, msg) => {
    try { await navigator.clipboard.writeText(t); toast(msg, "ok"); return true; }
    catch (e) { toast("No se pudo copiar. Mantén presionado el texto para copiarlo.", "error"); return false; }
  };
  const puedeCompartir = () => !!(navigator.canShare && navigator.canShare({ files: [new File([""], "x.jpg", { type: "image/jpeg" })] }));

  /* ---------- Generador de comunicados ----------
     Arma la carta (1080×1350, el formato vertical de Instagram) con franja arriba, escudo de fondo, firmas
     y pie. Se publica como noticia (la carta como imagen y el texto debajo) y se comparte en Instagram igual que las demás. */
  const FIRMAS = ["Dirección", "Inspectoría General", "Unidad Técnico Pedagógica", "Coordinación Académica", "Convivencia Escolar", "Representante Legal"];
  const comunicado = { titulo: "COMUNICADO", fecha: new Date().toLocaleDateString("sv"), asunto: "", saludo: "Estimados padres, madres y apoderados:", texto: "",
    despedida: "Atentamente,", firmas: ["Dirección"], otra: "", pie: "Institución con Excelencia Académica 2026 - 2027", tituloNoticia: "",
    firmaTam: 0, firmaEsp: 100, porFila: 0, // firmas: letra (0 = como el texto), espacio (%) y cuántas por fila (0 = automático)
    imagenes: [] }; // { nombre, original (bitmap), quitar, cuanto, lista (lienzo ya procesado) }
  const firmasElegidas = () => comunicado.firmas.concat(comunicado.otra.trim() ? [comunicado.otra.trim()] : []);
  const fechaCarta = (f) => (fechaLarga(f) ? fechaLarga(f) + ".-" : "");

  // Palabras con negrita (**así**): cada palabra es una lista de trozos pegados, con su ancho
  function palabrasCarta(ctx, linea, t) {
    const pal = []; let actual = null, espacio = true;
    String(linea).split("**").forEach((parte, i) => {
      const b = i % 2 === 1;
      (parte.match(/\S+|\s+/g) || []).forEach((tok) => {
        if (/^\s+$/.test(tok)) { espacio = true; return; }
        ctx.font = `${b ? 700 : 400} ${t}px Arial, Helvetica, sans-serif`;
        const trozo = { s: tok, b, w: ctx.measureText(tok).width };
        if (espacio || !actual) { actual = { trozos: [trozo], w: trozo.w }; pal.push(actual); } else { actual.trozos.push(trozo); actual.w += trozo.w; }
        espacio = false;
      });
    });
    return pal;
  }
  // Párrafos justificados (la última línea de cada párrafo, a la izquierda). Devuelve las líneas listas para dibujar.
  function armarTexto(ctx, texto, ancho, t) {
    ctx.font = `400 ${t}px Arial, Helvetica, sans-serif`;
    const esp = ctx.measureText(" ").width;
    const parrafos = String(texto || "").replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    // Las líneas que empiezan con «-» o «•» son viñetas: llevan un punto y sangría
    return parrafos.map((p) => p.split("\n").flatMap((renglon) => {
      const vineta = /^\s*[-•]\s+/.test(renglon), ind = vineta ? Math.round(t * 2.2) : 0;
      const pal = palabrasCarta(ctx, renglon.replace(/^\s*[-•]\s+/, ""), t), out = []; let l = [], w = 0;
      for (const x of pal) {
        if (l.length && w + esp + x.w > ancho - ind) { out.push({ pal: l, w, justificar: true, ind }); l = []; w = 0; }
        w += (l.length ? esp : 0) + x.w; l.push(x);
      }
      if (l.length) out.push({ pal: l, w, justificar: false, ind });
      if (vineta && out.length) out[0].punto = true;
      return out;
    }));
  }
  function dibujarLinea(ctx, linea, x, y, ancho, t, esp) {
    const ind = linea.ind || 0;
    if (linea.punto) { ctx.font = `400 ${t}px Arial, Helvetica, sans-serif`; ctx.fillText("•", x + ind * .35, y); }
    x += ind; ancho -= ind;
    const extra = linea.justificar && linea.pal.length > 1 ? Math.min((ancho - linea.w) / (linea.pal.length - 1), esp * 3) : 0;
    let cx = x;
    linea.pal.forEach((p) => {
      p.trozos.forEach((tr) => { ctx.font = `${tr.b ? 700 : 400} ${t}px Arial, Helvetica, sans-serif`; ctx.fillText(tr.s, cx, y); cx += tr.w; });
      cx += esp + extra;
    });
  }
  // Franja de arriba: triángulos suaves con los colores del colegio
  function franjaCarta(ctx, col) {
    const capa = (color, alfa, pts) => { ctx.globalAlpha = alfa; ctx.fillStyle = color; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); };
    ctx.save();
    capa(col.s, .22, [[0, 0], [1080, 0], [1080, 150], [0, 150]]);
    capa(col.p, .35, [[0, 0], [560, 0], [300, 150], [0, 150]]);
    capa(col.a, .55, [[380, 0], [820, 0], [560, 150], [470, 150]]);
    capa(col.s, .45, [[700, 0], [1080, 0], [1080, 150], [900, 150]]);
    capa("#ffffff", .55, [[520, 150], [700, 40], [780, 40], [610, 150]]);
    capa(col.p, .25, [[0, 110], [1080, 60], [1080, 150], [0, 150]]);
    ctx.restore();
  }
  // Franja original del colegio (de la plantilla de comunicados); si no carga, la dibujada
  let franjaLista = null;
  const franjaOriginal = () => franjaLista || (franjaLista = imagenIG("img/comunicado/franja.png").catch(() => { franjaLista = null; return null; }));

  /* Quitar el fondo de una imagen: se borra el color del borde (blanco o liso) que toca los bordes,
     con un borde suave, y se recorta lo que sobra. «cuanto» va de 5 a 60. */
  function sinFondo(img, cuanto) {
    const k = Math.min(1, 900 / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * k)), hh = Math.max(1, Math.round(img.height * k));
    const [c, ctx] = lienzoIG(w, hh);
    ctx.drawImage(img, 0, 0, w, hh);
    const d = ctx.getImageData(0, 0, w, hh), px = d.data;
    // Colores del fondo: los que más se repiten en el borde (agrupados). Con un fondo liso es uno solo;
    // con baldosas, mantel o sombras son varios (la baldosa, la junta, la parte más oscura…)
    const cuenta = new Map();
    const borde = [];
    for (let x = 0; x < w; x++) borde.push(x, (hh - 1) * w + x);
    for (let y = 0; y < hh; y++) borde.push(y * w, y * w + w - 1);
    borde.forEach((i) => { const q = ((px[i * 4] >> 4) << 8) | ((px[i * 4 + 1] >> 4) << 4) | (px[i * 4 + 2] >> 4); cuenta.set(q, (cuenta.get(q) || 0) + 1); });
    const fondos = [];
    let cubiertos = 0;
    for (const [q, n] of [...cuenta.entries()].sort((x, y) => y[1] - x[1])) {
      if (cubiertos >= borde.length * .95 || fondos.length >= 40) break;
      fondos.push([((q >> 8) & 15) * 16 + 8, ((q >> 4) & 15) * 16 + 8, (q & 15) * 16 + 8]); cubiertos += n;
    }
    const lim = cuanto * 2.2, suave = lim * 1.6;
    const distancias = new Float32Array(w * hh).fill(-1);
    const dist = (i) => {
      if (distancias[i] >= 0) return distancias[i];
      let m = Infinity;
      for (const [fr, fg, fb] of fondos) { const r = px[i * 4] - fr, g = px[i * 4 + 1] - fg, bb = px[i * 4 + 2] - fb; m = Math.min(m, r * r + g * g + bb * bb); }
      return (distancias[i] = Math.sqrt(m));
    };
    // Relleno desde los bordes: solo se borra el fondo que está conectado con el borde (no los blancos de adentro)
    const visto = new Uint8Array(w * hh), pila = [];
    borde.forEach((i) => { if (!visto[i] && dist(i) <= suave) { visto[i] = 1; pila.push(i); } });
    while (pila.length) {
      const i = pila.pop(), dd = dist(i);
      px[i * 4 + 3] = dd <= lim ? 0 : Math.round(255 * (dd - lim) / (suave - lim)) & 255;
      if (dd > lim) continue; // borde suave: no se sigue avanzando
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < hh - 1 ? i + w : -1]) {
        if (j >= 0 && !visto[j] && dist(j) <= suave) { visto[j] = 1; pila.push(j); }
      }
    }
    // Se borran las líneas finas que quedan sueltas (juntas de baldosas, bordes de una hoja): lo que mide menos de ~7 px de ancho
    const R = 3, A = new Uint8Array(w * hh);
    for (let i = 0; i < A.length; i++) A[i] = px[i * 4 + 3];
    const filtro = (src, horizontal, f) => {
      const out = new Uint8Array(src.length);
      for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) {
        let v = f === Math.min ? 255 : 0;
        for (let k = -R; k <= R; k++) {
          const xx = horizontal ? x + k : x, yy = horizontal ? y : y + k;
          v = f(v, xx < 0 || yy < 0 || xx >= w || yy >= hh ? 0 : src[yy * w + xx]);
        }
        out[y * w + x] = v;
      }
      return out;
    };
    const abierto = filtro(filtro(filtro(filtro(A, true, Math.min), false, Math.min), true, Math.max), false, Math.max);
    for (let i = 0; i < A.length; i++) if (abierto[i] < A[i]) px[i * 4 + 3] = abierto[i];
    ctx.putImageData(d, 0, 0);
    // Recorte de lo transparente
    let x0 = w, y0 = hh, x1 = -1, y1 = -1;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return c;
    const [r, rctx] = lienzoIG(x1 - x0 + 1, y1 - y0 + 1);
    rctx.drawImage(c, x0, y0, r.width, r.height, 0, 0, r.width, r.height);
    return r;
  }
  const imagenCarta = (im) => (im.quitar ? (im.lista || (im.lista = sinFondo(im.original, im.cuanto))) : im.original);
  // Ancho de la fila de imágenes con una altura dada (si no cabe en el ancho, se achica todo)
  function filaImagenes(imgs, alto, ancho) {
    const gap = 30, anchos = imgs.map((i) => i.width / i.height * alto);
    const total = anchos.reduce((a, b) => a + b, 0) + gap * (imgs.length - 1);
    const k = total > ancho ? (ancho - gap * (imgs.length - 1)) / (total - gap * (imgs.length - 1)) : 1;
    return { alto: alto * k, anchos: anchos.map((x) => x * k), total: Math.min(total, ancho), gap };
  }

  const porFilaFirmas = (n) => Math.min(comunicado.porFila || 3, Math.max(1, n));
  async function cartaComunicado() {
    await fuentesIG();
    const [logo, franja] = await Promise.all([logoIG(), franjaOriginal()]);
    const col = coloresIG(), c = comunicado;
    const [lienzo, ctx] = lienzoIG(1080, 1350);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, 1080, 1350);
    let B = 150; // alto de la franja
    if (franja) { B = Math.round(franja.height * 1080 / franja.width); ctx.drawImage(franja, 0, 0, 1080, B); } else franjaCarta(ctx, col);
    // Escudo de fondo, como marca de agua
    if (logo) { ctx.save(); ctx.globalAlpha = .09; caber(ctx, logo, 240, 430, 600, 640); ctx.restore(); }
    const X = 90, ANCHO = 900, firmas = firmasElegidas();
    const imgs = c.imagenes.map(imagenCarta);
    ctx.fillStyle = "#111"; ctx.textBaseline = "alphabetic";
    const inicio = B + 170 + (c.asunto ? 55 : 0);
    // Tamaño de letra y de las imágenes: lo más grande con lo que todo cabe antes del pie
    let t = 27, partes, fila = null;
    buscar: for (; t >= 14; t--) {
      partes = armarTexto(ctx, c.texto, ANCHO, t);
      const lh = t * 1.42, filas = Math.ceil(firmas.length / porFilaFirmas(firmas.length)), ft = c.firmaTam || t, e = c.firmaEsp / 100;
      const alto = (c.saludo ? lh * 2 : 0) + partes.reduce((s, p) => s + p.length * lh + t * .9, 0) + (c.despedida ? lh * 1.2 : 0) + (filas ? t * 3.2 * e + filas * ft * (2 + 1.4 * e) : 0);
      if (!imgs.length) { if (inicio + alto < 1225) break; continue; }
      for (let ih = 320; ih >= 140; ih -= 20) {
        fila = filaImagenes(imgs, ih, ANCHO);
        if (inicio + alto + fila.alto + t * 2 < 1225) break buscar;
      }
    }
    if (t < 14) t = 14;
    const lh = t * 1.42;
    ctx.textAlign = "center"; ctx.font = "700 30px Arial, Helvetica, sans-serif";
    ctx.fillText(c.titulo || "COMUNICADO", 540, B + 60);
    ctx.textAlign = "right"; ctx.font = "400 22px Arial, Helvetica, sans-serif";
    if (c.fecha) ctx.fillText(fechaCarta(c.fecha), X + ANCHO, B + 100);
    ctx.textAlign = "left";
    let y = B + 165;
    if (c.asunto) { ctx.font = `700 ${Math.max(t, 22)}px Arial, Helvetica, sans-serif`; ctx.fillText(c.asunto, X, y, ANCHO); y += 55; }
    if (c.saludo) { ctx.font = `700 ${t}px Arial, Helvetica, sans-serif`; ctx.fillText(c.saludo, X, y); y += lh * 2; }
    ctx.font = `400 ${t}px Arial, Helvetica, sans-serif`;
    const esp = ctx.measureText(" ").width;
    partes.forEach((p) => { p.forEach((l) => { dibujarLinea(ctx, l, X, y, ANCHO, t, esp); y += lh; }); y += t * .9; });
    // Imágenes en una fila, centradas, antes de la despedida
    if (imgs.length && fila) {
      let cx = X + (ANCHO - fila.total) / 2;
      imgs.forEach((im, i) => { ctx.drawImage(im, cx, y - t * .4, fila.anchos[i], fila.alto); cx += fila.anchos[i] + fila.gap; });
      y += fila.alto + t * 2;
    }
    if (c.despedida) { ctx.font = `700 ${t}px Arial, Helvetica, sans-serif`; ctx.fillText(c.despedida, X, y); y += lh * 1.2; }
    // Firmas una al lado de la otra (por defecto hasta 3 por fila). Letra, espacio y firmas por fila se pueden ajustar.
    if (firmas.length) {
      const ft = c.firmaTam || t, e = c.firmaEsp / 100;
      y += t * 3.2 * e;
      const porFila = porFilaFirmas(firmas.length);
      for (let i = 0; i < firmas.length; i += porFila) {
        const fila = firmas.slice(i, i + porFila), paso = ANCHO / fila.length;
        ctx.textAlign = "center";
        fila.forEach((f, k) => {
          const cx = X + paso * (k + .5);
          ctx.font = `700 ${ft}px Arial, Helvetica, sans-serif`; ctx.fillText(f, cx, y, paso - 20);
          ctx.fillText("Colegio San Martín", cx, y + ft * 1.42, paso - 20);
        });
        y += ft * (2 + 1.4 * e);
      }
      ctx.textAlign = "left";
    }
    // Pie: línea y lema
    ctx.strokeStyle = col.s; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(80, 1262); ctx.lineTo(1000, 1262); ctx.stroke();
    if (c.pie) { ctx.textAlign = "center"; ctx.fillStyle = "#333"; ctx.font = "italic 400 21px Arial, Helvetica, sans-serif"; ctx.fillText(c.pie, 540, 1300); }
    return lienzo;
  }

  // Texto del comunicado para la noticia: las viñetas quedan en su propio bloque (así el sitio las muestra como lista)
  const textoNoticia = (t) => String(t || "").replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const bloques = [];
    p.split("\n").forEach((l) => {
      const v = /^\s*[-•]\s+/.test(l), u = bloques[bloques.length - 1];
      if (u && u.v === v) u.l.push(v ? "- " + l.replace(/^\s*[-•]\s+/, "") : l); else bloques.push({ v, l: [v ? "- " + l.replace(/^\s*[-•]\s+/, "") : l] });
    });
    return bloques.map((b) => b.l.join("\n")).join("\n\n");
  }).join("\n\n");

  // Panel «Generar comunicado» dentro de Noticias
  /* Imágenes guardadas para próximos comunicados (uniforme, útiles…). Quedan en img/noticias/guardadas,
     donde también suben las cuentas con permiso de noticias; borrarlas, solo con control total. */
  const CARPETA_GUARDADAS = "img/noticias/guardadas";
  let guardadas = null;
  const nombreGuardada = (ruta) => ruta.split("/").pop().replace(/^[a-z0-9]+-/, "").replace(/\.[a-z]+$/, "").replace(/-/g, " ");
  async function listaGuardadas() {
    if (!guardadas) {
      try {
        guardadas = (await gh(`/contents/${CARPETA_GUARDADAS}?ref=${encodeURIComponent(state.branch)}`))
          .filter((f) => f.type === "file" && /\.(png|jpe?g|webp)$/i.test(f.name))
          .sort((a, b) => b.name.localeCompare(a.name)) // el nombre parte con la hora de subida: la más nueva primero
          .map((f) => ({ ruta: f.path, ver: f.download_url }));
      } catch (e) { if (e.status !== 404) throw e; guardadas = []; }
    }
    return guardadas;
  }
  // Se guarda tal como se ve (sin fondo, en PNG, si se lo quitaron)
  async function guardarImagenCom(im) {
    const nombre = prompt("Nombre para encontrar la imagen después (ej.: polera de educación física):", im.nombre.replace(/\.[^.]+$/, ""));
    if (nombre === null || !nombre.trim()) return false;
    const fuente = imagenCarta(im), k = Math.min(1, 1200 / Math.max(fuente.width, fuente.height));
    const [l, ctx] = lienzoIG(Math.max(1, Math.round(fuente.width * k)), Math.max(1, Math.round(fuente.height * k)));
    ctx.drawImage(fuente, 0, 0, l.width, l.height);
    const tipo = im.quitar ? "image/png" : "image/jpeg";
    const blob = await new Promise((ok) => l.toBlob(ok, tipo, .9));
    const ruta = await subirArchivo(new File([blob], slug(nombre.trim()).replace(/\./g, "-") + (im.quitar ? ".png" : ".jpg"), { type: tipo }), CARPETA_GUARDADAS);
    if (guardadas) guardadas.unshift({ ruta, ver: subidas[ruta] });
    im.guardada = ruta; im.nombre = nombre.trim();
    return true;
  }

  function generadorComunicado() {
    const c = comunicado;
    const vista = h("img", { class: "com__vista", alt: "Vista previa del comunicado" });
    let lienzo = null, turno = 0;
    const repintar = async () => {
      const mio = ++turno;
      const l = await cartaComunicado();
      if (mio !== turno) return;
      lienzo = l; vista.src = l.toDataURL("image/jpeg", .85);
    };
    let espera;
    const cambio = () => { clearTimeout(espera); espera = setTimeout(repintar, 250); };
    const campo = (k, label, attrs = {}, tipo = "input") => {
      const el = h(tipo, { ...attrs, oninput: (e) => { c[k] = e.target.value; cambio(); } });
      el.value = c[k];
      return h("label", { class: "com__campo" + (tipo === "textarea" ? " com__campo--full" : "") }, h("span", {}, label), el);
    };
    const firmas = h("div", { class: "checks" }, FIRMAS.map((f) => h("label", { class: "check" },
      h("input", { type: "checkbox", checked: c.firmas.includes(f), onchange: (e) => {
        const set = new Set(c.firmas); if (e.target.checked) set.add(f); else set.delete(f);
        c.firmas = FIRMAS.filter((x) => set.has(x)); cambio();
      } }), f)));
    // Imágenes: van en una fila bajo el texto. Cada una puede ir sin fondo (ideal para fotos de productos sobre fondo blanco).
    const imagenes = h("div", { class: "com__imgs" });
    const pintarImagenes = () => {
      imagenes.replaceChildren(...c.imagenes.map((im, i) => {
        const muestra = h("canvas", { class: "com__muestra" });
        const fuente = imagenCarta(im);
        const k = Math.min(1, 140 / Math.max(fuente.width, fuente.height));
        muestra.width = Math.max(1, Math.round(fuente.width * k)); muestra.height = Math.max(1, Math.round(fuente.height * k));
        muestra.getContext("2d").drawImage(fuente, 0, 0, muestra.width, muestra.height);
        const mover = (d) => { const j = i + d; if (j < 0 || j >= c.imagenes.length) return; [c.imagenes[i], c.imagenes[j]] = [c.imagenes[j], c.imagenes[i]]; pintarImagenes(); cambio(); };
        const cuanto = h("input", { type: "range", min: 5, max: 60, value: im.cuanto, "aria-label": "Cuánto fondo borrar", hidden: !im.quitar,
          onchange: (e) => { im.cuanto = +e.target.value; im.lista = null; im.guardada = null; pintarImagenes(); cambio(); } });
        const guardar = h("button", { type: "button", class: "btn btn--ghost btn--sm com__guardar", disabled: !!im.guardada,
          title: "Guarda la imagen (tal como se ve) para usarla en otros comunicados", onclick: async () => {
            guardar.disabled = true; guardar.textContent = "Guardando…";
            try { if (await guardarImagenCom(im)) toast("Imagen guardada. La encuentras en «Imágenes guardadas».", "ok"); }
            catch (err) { toast("No se pudo guardar: " + err.message, "error"); }
            pintarImagenes(); if (verGuardadas) pintarGuardadas();
          } }, im.guardada ? "Guardada ✓" : "Guardar para después");
        return h("div", { class: "com__img" }, h("div", { class: "com__marco" }, muestra),
          h("label", { class: "com__quitar" }, h("input", { type: "checkbox", checked: im.quitar, onchange: (e) => { im.quitar = e.target.checked; im.guardada = null; pintarImagenes(); cambio(); } }), "Quitar fondo"),
          im.quitar ? h("label", { class: "com__cuanto" }, h("span", {}, "Borrar menos / más"), cuanto) : null,
          guardar,
          h("div", { class: "com__imgacc" },
            h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Mover a la izquierda", disabled: i === 0, onclick: () => mover(-1) }, "←"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Mover a la derecha", disabled: i === c.imagenes.length - 1, onclick: () => mover(1) }, "→"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: () => { c.imagenes.splice(i, 1); pintarImagenes(); cambio(); } }, "Quitar")));
      }), h("label", { class: "btn btn--ghost btn--sm com__agregar" }, "+ Agregar imágenes",
        h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: async (e) => {
          const fs = [...e.target.files]; e.target.value = "";
          for (const f of fs) {
            try { c.imagenes.push({ nombre: f.name, original: await createImageBitmap(f), quitar: false, cuanto: 25, lista: null }); }
            catch (err) { toast("No se pudo abrir " + f.name, "error"); }
          }
          pintarImagenes(); cambio();
        } })),
        h("button", { type: "button", class: "btn btn--ghost btn--sm com__agregar", "aria-expanded": String(verGuardadas), onclick: () => {
          verGuardadas = !verGuardadas; pintarImagenes();
          if (verGuardadas) pintarGuardadas(); else biblio.hidden = true;
        } }, verGuardadas ? "Cerrar imágenes guardadas" : "Imágenes guardadas"));
    };
    // Imágenes guardadas: tocar una la agrega al comunicado
    let verGuardadas = false;
    const biblio = h("div", { class: "com__biblio", hidden: true });
    const pintarGuardadas = async () => {
      biblio.hidden = false;
      const nota = (t) => biblio.replaceChildren(h("p", { class: "panel__help" }, t));
      nota("Cargando imágenes guardadas…");
      let lista;
      try { lista = await listaGuardadas(); } catch (e) { return nota("No se pudieron cargar: " + e.message); }
      if (!lista.length) return nota("Aún no hay imágenes guardadas. Agrega una imagen y toca «Guardar para después».");
      biblio.replaceChildren(...lista.map((g) => h("div", { class: "com__guardada" },
        h("button", { type: "button", class: "com__usar", title: "Agregar al comunicado", onclick: async (e) => {
          const b = e.currentTarget; b.disabled = true;
          try { c.imagenes.push({ nombre: nombreGuardada(g.ruta), original: await imagenIG(g.ruta), quitar: false, cuanto: 25, lista: null, guardada: g.ruta }); pintarImagenes(); cambio(); }
          catch (err) { toast("No se pudo abrir la imagen.", "error"); }
          b.disabled = false;
        } }, h("span", { class: "com__marco" }, h("img", { src: g.ver || resolver(g.ruta), alt: "", loading: "lazy", onerror: async (e) => {
          const el = e.target; if (el.dataset.otra) return; el.dataset.otra = "1";
          try { const im = await imagenIG(g.ruta), [l, x] = lienzoIG(im.width, im.height); x.drawImage(im, 0, 0); el.src = g.ver = l.toDataURL("image/png"); } catch (err) { /* queda vacía */ }
        } })), h("span", {}, nombreGuardada(g.ruta))),
        state.rol === "dueno" ? h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: async () => {
          if (!confirm(`¿Borrar «${nombreGuardada(g.ruta)}» de las imágenes guardadas? Los comunicados ya publicados no cambian.`)) return;
          try { await escribir(g.ruta, null, "Borrar imagen guardada de comunicados", { borrar: true }); guardadas = guardadas.filter((x) => x !== g); pintarGuardadas(); }
          catch (err) { toast("No se pudo borrar: " + err.message, "error"); }
        } }, "Borrar") : null)));
    };
    pintarImagenes();
    // Ajustes de las firmas: útiles cuando el comunicado es largo o hay muchas firmas
    const selector = (k, label, opciones) => h("label", { class: "com__ajuste" }, h("span", {}, label),
      h("select", { onchange: (e) => { c[k] = +e.target.value; cambio(); } }, opciones.map(([v, t]) => h("option", { value: v, selected: c[k] === v }, t))));
    const espLabel = h("output", {}, c.firmaEsp + " %");
    const ajusteFirmas = h("div", { class: "com__ajustes" },
      selector("firmaTam", "Letra de las firmas", [[0, "Igual al texto"]].concat([12, 14, 16, 18, 20, 22, 24, 26, 28].map((n) => [n, n + " px"]))),
      h("label", { class: "com__ajuste" }, h("span", {}, "Espacio entre firmas"),
        h("span", { class: "com__rango" }, h("input", { type: "range", min: 40, max: 200, step: 10, value: c.firmaEsp,
          oninput: (e) => { c.firmaEsp = +e.target.value; espLabel.textContent = c.firmaEsp + " %"; cambio(); } }), espLabel)),
      selector("porFila", "Firmas por fila", [[0, "Automático"], [1, "1"], [2, "2"], [3, "3"], [4, "4"]]));
    const negrita = h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
      const ta = form.querySelector("textarea"); const a = ta.selectionStart, b = ta.selectionEnd;
      const sel = ta.value.slice(a, b) || "texto destacado";
      ta.setRangeText("**" + sel + "**", a, b, "end"); ta.focus(); c.texto = ta.value; cambio();
    } }, "Negrita");
    const form = h("div", { class: "com__form" },
      campo("titulo", "Título de la carta"), campo("fecha", "Fecha", { type: "date" }),
      campo("asunto", "Asunto (opcional)", { id: "comAsunto", placeholder: "Ej.: Flexibilización del uniforme escolar por altas temperaturas" }),
      campo("saludo", "Saludo"),
      h("div", { class: "com__campo com__campo--full" }, h("span", {}, "Texto del comunicado"), negrita),
      campo("texto", "", { rows: 12, placeholder: "Escribe el comunicado. Deja una línea en blanco entre párrafos. Para destacar, selecciona el texto y toca «Negrita». Para una viñeta, empieza la línea con «- »." }, "textarea"),
      h("div", { class: "com__campo com__campo--full" }, h("span", {}, "Imágenes (opcional)"), imagenes, biblio),
      campo("despedida", "Despedida"),
      h("div", { class: "com__campo com__campo--full" }, h("span", {}, "Firmas (puedes marcar varias)"), firmas, ajusteFirmas),
      campo("otra", "Otra firma (opcional)", { placeholder: "Ej.: Centro General de Padres" }),
      campo("pie", "Pie de página", { id: "comPie" }),
      campo("tituloNoticia", "Título de la noticia en el sitio", { id: "comTitulo", placeholder: "Ej.: Comunicado: retiro anticipado por falla en el suministro de agua" }));
    const publicar = h("button", { type: "button", class: "btn btn--primary", onclick: async () => {
      if (!c.texto.trim()) return toast("Escribe el texto del comunicado.", "error");
      if (!c.tituloNoticia.trim()) { toast("Escribe el título de la noticia (cómo aparece en el sitio).", "error"); form.querySelector("#comTitulo").focus(); return; }
      if (!confirm("¿Publicar este comunicado como noticia? Se verá en el sitio en uno o dos minutos.")) return;
      publicar.disabled = true; publicar.textContent = "Publicando…";
      try {
        await repintar();
        const archivo = await aArchivo(lienzo, "comunicado-" + c.fecha + ".jpg");
        const ruta = await subirArchivo(archivo, "img/noticias");
        const plano = textoPlano(c.texto);
        const n = { fecha: c.fecha || new Date().toLocaleDateString("sv"), tipo: "comunicado", titulo: c.tituloNoticia.trim(),
          resumen: plano.replace(/\s+/g, " ").slice(0, 220).replace(/\s+\S*$/, "") + (plano.length > 220 ? "…" : ""),
          cuerpo: [`![](${ruta})`, c.asunto ? `## ${c.asunto}` : "", c.saludo ? `**${c.saludo}**` : "", textoNoticia(c.texto), c.despedida,
            firmasElegidas().map((f) => `**${f}**`).join("\n") + (firmasElegidas().length ? "\nColegio San Martín" : "")].filter(Boolean).join("\n\n"),
          imagen: ruta, url: "", comunicado: true };
        await publicarNueva(n);
        c.texto = ""; c.tituloNoticia = ""; c.asunto = ""; c.imagenes = [];
        toast("Comunicado publicado. Ábrelo en «Noticias publicadas» para compartirlo en Instagram o armar su afiche informativo.", "ok");
      } catch (e) {
        toast("No se pudo publicar: " + e.message, "error");
      } finally { publicar.disabled = false; publicar.textContent = "Publicar como noticia"; }
    } }, "Publicar como noticia");
    const bajar = h("button", { type: "button", class: "btn btn--ghost", onclick: async () => {
      await repintar();
      const a = h("a", { href: lienzo.toDataURL("image/jpeg", .92), download: "comunicado-" + c.fecha + ".jpg" }); document.body.append(a); a.click(); a.remove();
    } }, "Descargar imagen");
    const caja = h("details", { class: "panel com", ontoggle: (e) => { if (e.target.open && !lienzo) repintar(); } },
      h("summary", {}, h("h2", {}, "Generar comunicado"), h("span", { class: "panel__help" }, "Carta con firmas para publicar en el sitio y en Instagram")),
      h("div", { class: "com__grid" }, form, h("div", { class: "com__lado" }, vista, h("div", { class: "com__acc" }, publicar, bajar),
        h("p", { class: "panel__help" }, "Se publica como noticia: la carta como imagen y el texto debajo. Después, en «Noticias publicadas», usa «Publicación en Instagram» o «Afiche informativo» (láminas con íconos, fáciles de leer)."))));
    return caja;
  }

  /* ---------- Afiche informativo: el comunicado (o la noticia) en láminas con íconos, fáciles de leer ---------- */
  // Íconos de línea (cuadrícula de 24 px), dibujados en el lienzo
  const ICONOS = {
    calendario: ["Fecha", "M3 6h18v15H3z M3 10h18 M8 3v5 M16 3v5 M7.5 14h2 M11 14h2 M14.5 14h2 M7.5 17.5h2 M11 17.5h2"],
    reloj: ["Horario", "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0z M12 7v5l3.5 2.5"],
    uniforme: ["Uniforme", "M8.5 3 3 6l2 5 3-1.2V21h8V9.8l3 1.2 2-5-5.5-3c-.6 1.6-2 2.6-3.5 2.6S9.1 4.6 8.5 3z"],
    lugar: ["Lugar", "M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z M14.5 9.5a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0z"],
    mochila: ["Materiales", "M6 9a6 6 0 0 1 12 0v12H6z M9.5 5V3h5v2 M9 14h6v4H9z"],
    alerta: ["Importante", "M12 3 22 20H2z M12 9.5v5 M12 17.5v.01"],
    familia: ["Familias", "M11 7.5a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M2 20v-1.5a6 6 0 0 1 12 0V20 M19.5 9a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0z M16 14.2a4.5 4.5 0 0 1 6 4.3V20"],
    estudiante: ["Estudiantes", "M2 9l10-5 10 5-10 5z M6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5 M22 9v6"],
    salud: ["Salud", "M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z M12 9.5v5 M9.5 12h5"],
    dinero: ["Pagos", "M3 6h18v12H3z M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0z M6 9v.01 M18 15v.01"],
    contacto: ["Contacto", "M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 6.5 6.5L16 13.5l5 2V19a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z"],
    documento: ["Documento", "M6 3h9l4 4v14H6z M14 3v5h5 M9 13h7 M9 17h5"],
    calor: ["Clima", "M16 12a4 4 0 1 1-8 0a4 4 0 1 1 8 0z M12 2v2 M12 20v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2 12h2 M20 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4"],
    check: ["Listo", "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0z M8 12.5l2.8 2.8L16.5 9"],
    info: ["Información", "M21 12a9 9 0 1 1-18 0a9 9 0 1 1 18 0z M12 11v6 M12 7.5v.01"],
    megafono: ["Aviso", "M3 10v4h3l8 5V5L6 10z M17.5 9a4 4 0 0 1 0 6 M20 6.5a8 8 0 0 1 0 11"],
  };
  function icono(ctx, nombre, cx, cy, tam, color, grosor = 2) {
    const d = (ICONOS[nombre] || ICONOS.info)[1];
    ctx.save();
    ctx.translate(cx - tam / 2, cy - tam / 2); ctx.scale(tam / 24, tam / 24);
    ctx.strokeStyle = color; ctx.lineWidth = grosor; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.stroke(new Path2D(d));
    ctx.restore();
  }
  // El ícono que corresponde a un texto (el primero que calce)
  const REGLAS_ICONO = [
    ["alerta", /no se permitir|prohib|importante|obligatori|recuerd|responsabilidad|atención/i],
    ["calendario", /^(a partir del?|desde el|el día|el (lunes|martes|miércoles|jueves|viernes|sábado|domingo))\b/i],
    ["uniforme", /uniform|polera|short|calza|buzo|ropa|zapat|vestimenta|delantal|cotona/i],
    ["calor", /temperatura|calor|bloqueador|hidrat|lluvia|frío|clima/i],
    ["reloj", /\b\d{1,2}[:.]\d{2}\b|\bhrs?\b|horario|\bhora\b/i],
    ["calendario", /\b(lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b|\b\d{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b|fecha|a partir del/i],
    ["lugar", /lugar|gimnasio|patio|\bsala\b|auditorio|ubicad/i],
    ["mochila", /traer|materiales?|útiles|llevar|mochila/i],
    ["salud", /salud|vacun|enferm|médic|accidente/i],
    ["dinero", /\bpago|cuota|\$|dinero|arancel/i],
    ["contacto", /contact|correo|teléfono|whatsapp|consultas/i],
    ["documento", /documento|formulario|autorizaci|certificado/i],
    ["familia", /apoderad|padres|familia|madres/i],
    ["estudiante", /estudiante|alumn|curso|básico|medio/i],
  ];
  // Se mira la primera oración (con el título del punto): ahí suele estar de qué se trata
  const iconoPara = (t) => { const o = String(t).split(/(?<=[.!?])\s|\n/)[0]; return (REGLAS_ICONO.find(([, re]) => re.test(o)) || REGLAS_ICONO.slice(2).find(([, re]) => re.test(t)) || ["info"])[0]; };
  const mayuscula = (s) => s ? s[0].toUpperCase() + s.slice(1) : s;
  const FECHA_CLAVE = /(?:a partir del?|desde el|el día|el)\s+(?:(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)\s+)?\d{1,2}\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)(?:\s+de\s+\d{4})?/i;

  // Primer borrador del afiche: título, dato destacado y un punto por párrafo (sin saludos ni despedidas)
  function borradorAfiche(n) {
    const p = partesComunicado(n);
    const plano = textoPlano(n.cuerpo);
    const fecha = (plano.match(FECHA_CLAVE) || [""])[0];
    const puntos = [];
    p.parrafos.forEach((par) => {
      let t = par.replace(/^junto con saludar(?: muy)?(?: cordialmente)?,?\s*/i, "");
      if (!t || /^(agradecemos|atentamente|saludos|sin otro particular|les saluda|se despide)/i.test(t)) return;
      const inf = /\b(?:les\s+)?(?:informamos|comunicamos|queremos informar|damos a conocer)\s+(?:a ustedes\s+)?que\s+/i.exec(t);
      if (inf) t = t.slice(inf.index + inf[0].length);
      t = mayuscula(t.trim());
      const et = /^([^:\n•]{2,32}):\s+([\s\S]+)$/.exec(t);
      const titulo = et && et[1].split(/\s+/).length <= 4 ? et[1].trim() : "";
      puntos.push({ icono: iconoPara(titulo ? titulo + " " + et[2] : t), titulo, texto: titulo ? et[2].trim() : t });
    });
    const titulo = String(p.asunto || n.titulo || "").replace(/^comunicado\s*[:\-–]\s*/i, "").trim();
    return { etiqueta: n.comunicado ? "COMUNICADO" : ({ pedagogia: "PEDAGOGÍA", comunidad: "COMUNIDAD" }[n.tipo] || "NOTICIA"),
      titulo, destacado: fecha ? mayuscula(fecha) : "", puntos: puntos.slice(0, 8), conCarta: !!n.comunicado };
  }

  // Líneas de un punto: respeta los saltos y deja sangría a las viñetas
  function lineasPunto(ctx, texto, ancho) {
    const out = [];
    String(texto || "").split("\n").map((l) => l.trim()).filter(Boolean).forEach((l) => {
      const vin = /^•\s*/.test(l), cuerpo = l.replace(/^•\s*/, ""), sangria = vin ? ctx.measureText("•  ").width : 0;
      lineas(ctx, cuerpo, ancho - sangria, 99).forEach((x, i) => out.push({ t: (vin && !i ? "•  " : "") + x, x: vin && i ? sangria : 0 }));
    });
    return out;
  }
  // Láminas 4:5: portada + puntos (los que quepan por lámina)
  function laminasAfiche(a, logo) {
    const col = coloresIG(), F = "Inter, Arial, sans-serif", S = "Fraunces, Georgia, serif";
    const pie = (ctx, oscuro) => {
      if (logo) caber(ctx, logo, 80, 1238, 64, 72);
      ctx.fillStyle = oscuro ? "rgba(255,255,255,.85)" : col.p; ctx.font = `600 28px ${F}`;
      ctx.fillText("Colegio San Martín · Iquique", logo ? 162 : 80, 1284);
      ctx.textAlign = "right"; ctx.fillStyle = oscuro ? col.a : col.s; ctx.fillText("colegiosm.cl", 1000, 1284); ctx.textAlign = "left";
    };
    const laminas = [];
    // Portada
    {
      const [c, ctx] = lienzoIG(1080, 1350);
      const g = ctx.createLinearGradient(0, 0, 1080, 1350); g.addColorStop(0, col.s); g.addColorStop(1, col.p);
      ctx.fillStyle = g; ctx.fillRect(0, 0, 1080, 1350);
      ctx.globalAlpha = .1; icono(ctx, "megafono", 860, 1000, 520, "#fff", 1.6); ctx.globalAlpha = 1;
      ctx.font = `700 30px ${F}`;
      const ew = ctx.measureText(a.etiqueta).width + 60;
      ctx.fillStyle = col.a; redondeado(ctx, 80, 150, ew, 60, 30); ctx.fill();
      ctx.fillStyle = col.p; ctx.fillText(a.etiqueta, 110, 191);
      let y = 250;
      const tt = tituloIG(ctx, a.titulo || "Comunicado", 920, 6, 100, 56, a.destacado ? 560 : 740);
      ctx.fillStyle = "#fff"; tt.ls.forEach((l) => { y += tt.t * 1.15; ctx.fillText(l, 80, y); });
      if (a.destacado) {
        y += 70;
        ctx.font = `700 40px ${F}`;
        const ls = lineas(ctx, a.destacado, 760, 3), alto = 50 + ls.length * 52;
        ctx.fillStyle = "rgba(255,255,255,.12)"; redondeado(ctx, 80, y, 920, alto, 28); ctx.fill();
        ctx.fillStyle = col.a; ctx.beginPath(); ctx.arc(150, y + alto / 2, 44, 0, Math.PI * 2); ctx.fill();
        icono(ctx, "calendario", 150, y + alto / 2, 48, col.p, 2.2);
        ctx.fillStyle = "#fff"; ls.forEach((l, i) => ctx.fillText(l, 220, y + 25 + 40 + i * 52));
      }
      if (a.puntos.length) { ctx.fillStyle = col.a; ctx.font = `600 32px ${F}`; ctx.fillText("Desliza para ver los detalles  →", 80, 1170); }
      pie(ctx, true);
      laminas.push(c);
    }
    // Puntos: tarjetas con ícono, título y texto
    const medir = (ctx, p, tt) => {
      ctx.font = `400 ${tt}px ${F}`;
      const ls = lineasPunto(ctx, p.texto, 700);
      return { ls, alto: Math.max(150, 76 + (p.titulo ? 56 : 0) + ls.length * tt * 1.35) };
    };
    const [, m] = lienzoIG(10, 10);
    const grupos = [];
    let actual = [], usado = 0;
    const [, mt] = lienzoIG(10, 10); mt.font = `700 42px ${S}`;
    const tl = lineas(mt, a.titulo || "Comunicado", 920, 2), CAB = 110 + tl.length * 50, ALTO = 1210 - CAB - 20;
    a.puntos.filter((p) => p.titulo || p.texto).forEach((p) => {
      let tt = 36, med = medir(m, p, tt);
      while (med.alto > ALTO && tt > 26) { tt -= 2; med = medir(m, p, tt); }
      if (actual.length && (usado + 28 + med.alto > ALTO || actual.length >= 4)) { grupos.push(actual); actual = []; usado = 0; }
      actual.push({ p, tt, med }); usado += (usado ? 28 : 0) + med.alto;
    });
    if (actual.length) grupos.push(actual);
    grupos.forEach((gr, gi) => {
      const [c, ctx] = lienzoIG(1080, 1350);
      ctx.fillStyle = "#f7f3ec"; ctx.fillRect(0, 0, 1080, 1350);
      ctx.fillStyle = col.p; ctx.fillRect(0, 0, 1080, CAB);
      ctx.fillStyle = col.a; ctx.font = `700 26px ${F}`;
      ctx.fillText(a.etiqueta + (grupos.length > 1 ? `  ·  ${gi + 1} de ${grupos.length}` : ""), 80, 70);
      ctx.fillStyle = "#fff"; ctx.font = `700 42px ${S}`;
      tl.forEach((l, i) => ctx.fillText(l, 80, 128 + i * 50));
      // Las tarjetas se centran en el espacio libre
      const total = gr.reduce((s, x) => s + x.med.alto, 0) + 28 * (gr.length - 1);
      let y = CAB + 30 + Math.max(0, (ALTO - total) / 2);
      gr.forEach(({ p, tt, med }) => {
        ctx.save(); ctx.shadowColor = "rgba(11,31,58,.08)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 6;
        ctx.fillStyle = "#fff"; redondeado(ctx, 60, y, 960, med.alto, 30); ctx.fill(); ctx.restore();
        ctx.fillStyle = col.p; ctx.beginPath(); ctx.arc(150, y + 75, 50, 0, Math.PI * 2); ctx.fill();
        icono(ctx, p.icono, 150, y + 75, 54, "#fff", 2.1);
        let ty = y + 38;
        if (p.titulo) { ctx.fillStyle = col.p; ctx.font = `700 42px ${F}`; ctx.fillText(lineas(ctx, p.titulo, 700, 1)[0], 240, ty + 40); ty += 56; }
        ctx.fillStyle = "#28303d"; ctx.font = `400 ${tt}px ${F}`;
        med.ls.forEach((l, i) => ctx.fillText(l.t, 240 + l.x, ty + tt + i * tt * 1.35));
        y += med.alto + 28;
      });
      pie(ctx, false);
      laminas.push(c);
    });
    return laminas;
  }
  // Instrucciones para una IA de imágenes (ChatGPT, Gemini…) con el texto exacto del afiche
  function promptAfiche(a) {
    const col = coloresIG();
    const puntos = a.puntos.filter((p) => p.titulo || p.texto)
      .map((p, i) => `${i + 1}. [ícono: ${ICONOS[p.icono] ? ICONOS[p.icono][0].toLowerCase() : "información"}] ${p.titulo ? p.titulo + ": " : ""}${p.texto.replace(/\n/g, " ")}`).join("\n");
    return `Crea un afiche vertical para Instagram (formato 4:5, 1080 × 1350 px) del Colegio San Martín de Iquique (Chile), que explique este ${a.etiqueta.toLowerCase()} de forma muy fácil de entender para familias y estudiantes.

Estilo:
- Diseño plano, moderno y ordenado, con un ícono simple para cada idea, mucho espacio y letra grande y legible.
- Colores del colegio: burdeo ${col.p} y ${col.s}, y dorado ${col.a}, sobre fondo claro.
- Arriba, «Colegio San Martín»; abajo, «colegiosm.cl».
- Sin fotos de personas.

Texto: usa EXACTAMENTE estas frases, en español y sin errores de ortografía. No agregues palabras ni inventes datos. Puedes acortar una frase solo si no cambia su sentido.
Etiqueta: ${a.etiqueta}
Título: ${a.titulo}
${a.destacado ? "Dato destacado: " + a.destacado + "\n" : ""}Puntos:
${puntos}

Si todo no cabe en una imagen, haz 2 o 3 imágenes con el mismo estilo (un carrusel).`;
  }

  // Panel «Publicar flyer»: un afiche ya hecho (o varios, como carrusel) con su descripción, como noticia y para redes
  const flyer = { titulo: "", texto: "", tipo: "comunidad", fecha: new Date().toLocaleDateString("sv"), publicar: "", archivos: [], deptos: {} };
  // El flyer se guarda con fondo blanco (si traía transparencia): el primero en JPG, porque es la portada que se ve
  // al compartir la noticia, y los demás en WebP (pesan menos). Si el navegador no sabe crear WebP, en JPG.
  async function flyerImagen(file, portada) {
    const a = await ajustarImagen(file, 2000, portada ? "jpg" : "webp");
    if (a.type !== "image/png") return a;
    const im = await createImageBitmap(a), [l, ctx] = lienzoIG(im.width, im.height);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, l.width, l.height); ctx.drawImage(im, 0, 0);
    let blob = await new Promise((ok) => l.toBlob(ok, portada ? "image/jpeg" : "image/webp", .9));
    if (blob.type !== "image/webp" && blob.type !== "image/jpeg") blob = await new Promise((ok) => l.toBlob(ok, "image/jpeg", .9));
    return new File([blob], a.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg"), { type: blob.type });
  }
  function generadorFlyer() {
    const f = flyer;
    const campo = (k, label, attrs = {}, tipo = "input") => {
      const el = h(tipo, { ...attrs, oninput: (e) => { f[k] = e.target.value; } });
      el.value = f[k];
      return h("label", { class: "com__campo" + (tipo === "textarea" || attrs.full ? " com__campo--full" : "") }, h("span", {}, label), el);
    };
    const tipo = h("select", { onchange: (e) => { f.tipo = e.target.value; } },
      [["comunicado", "Comunicado"], ["pedagogia", "Pedagogía"], ["comunidad", "Comunidad"]].map(([v, t]) => h("option", { value: v, selected: f.tipo === v }, t)));
    const imagenes = h("div", { class: "com__imgs" });
    const pintar = () => {
      imagenes.replaceChildren(...f.archivos.map((a, i) => {
        const mover = (d) => { const j = i + d; if (j < 0 || j >= f.archivos.length) return; [f.archivos[i], f.archivos[j]] = [f.archivos[j], f.archivos[i]]; pintar(); };
        return h("div", { class: "com__img" }, h("div", { class: "com__marco" }, h("img", { class: "com__muestra", src: a.ver, alt: a.archivo.name })),
          h("small", { class: "fly__nombre" }, i === 0 ? "Portada · " + a.archivo.name : a.archivo.name),
          h("div", { class: "com__imgacc" },
            h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Mover a la izquierda", disabled: i === 0, onclick: () => mover(-1) }, "←"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Mover a la derecha", disabled: i === f.archivos.length - 1, onclick: () => mover(1) }, "→"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: () => { URL.revokeObjectURL(a.ver); f.archivos.splice(i, 1); pintar(); } }, "Quitar")));
      }), h("label", { class: "btn btn--ghost btn--sm com__agregar" }, f.archivos.length ? "+ Agregar otro" : "+ Elegir flyer",
        h("input", { type: "file", accept: "image/*", multiple: true, hidden: true, onchange: (e) => {
          [...e.target.files].filter((x) => /^image\//.test(x.type)).forEach((x) => f.archivos.push({ archivo: x, ver: URL.createObjectURL(x) }));
          e.target.value = ""; pintar();
        } })));
    };
    pintar();
    const form = h("div", { class: "com__form" },
      h("div", { class: "com__campo com__campo--full" }, h("span", {}, "Flyer (uno o varios: con varios se publica como carrusel)"), imagenes),
      campo("titulo", "Título de la noticia", { full: true, id: "flyTitulo", placeholder: "Ej.: Feria científica 2026: inscripciones abiertas" }),
      campo("texto", "Descripción", { rows: 8, id: "flyTexto", placeholder: "Escribe la información del flyer: qué, cuándo, dónde y para quién. Deja una línea en blanco entre párrafos. Para una viñeta, empieza la línea con «- »." }, "textarea"),
      h("label", { class: "com__campo" }, h("span", {}, "Categoría"), tipo),
      campo("fecha", "Fecha", { type: "date" }),
      campo("publicar", "Programar publicación (opcional)", { type: "datetime-local", full: true }),
      h("div", { class: "com__campo com__campo--full" }, h("span", {}, "Departamentos o equipos (opcional)"), deptosNoticia(f.deptos, () => {})));
    const publicar = h("button", { type: "button", class: "btn btn--primary", onclick: async () => {
      if (!f.archivos.length) return toast("Elige la imagen del flyer.", "error");
      if (!f.titulo.trim()) { toast("Escribe el título de la noticia.", "error"); form.querySelector("#flyTitulo").focus(); return; }
      if (!f.texto.trim()) { toast("Escribe la descripción del flyer.", "error"); form.querySelector("#flyTexto").focus(); return; }
      if (!confirm(f.publicar ? "¿Programar este flyer como noticia?" : "¿Publicar este flyer como noticia? Se verá en el sitio en uno o dos minutos.")) return;
      publicar.disabled = true; publicar.textContent = "Publicando…";
      try {
        const rutas = [];
        for (const [i, a] of f.archivos.entries()) rutas.push(await subirArchivo(await flyerImagen(a.archivo, i === 0), "img/noticias"));
        const plano = textoPlano(f.texto), primero = plano.split(/\n\s*\n/)[0].replace(/\s+/g, " ").trim();
        // Las imágenes van seguidas (sin línea en blanco) para que en el sitio se vean juntas, como galería
        const n = { fecha: f.fecha || new Date().toLocaleDateString("sv"), tipo: f.tipo, titulo: f.titulo.trim(),
          resumen: primero.length > 220 ? primero.slice(0, 220).replace(/\s+\S*$/, "") + "…" : primero,
          cuerpo: rutas.map((r) => `![](${r})`).join("\n") + "\n\n" + textoNoticia(f.texto),
          imagen: rutas[0], url: "", flyer: true };
        if (f.deptos.departamentos) n.departamentos = f.deptos.departamentos.slice();
        if (f.publicar) n.publicar = f.publicar;
        await publicarNueva(n);
        f.archivos.forEach((a) => URL.revokeObjectURL(a.ver));
        Object.assign(f, { titulo: "", texto: "", publicar: "", archivos: [], deptos: {} });
        (document.querySelector(".fly") || caja).replaceWith(generadorFlyer()); // formulario limpio para el próximo flyer
        toast(soloPropuestas() ? "Flyer enviado para aprobación. Te llegará un correo cuando se publique." : "Flyer publicado. Ábrelo en «Noticias publicadas» → «Publicación en Instagram» para subirlo a las redes.", "ok");
      } catch (e) {
        toast("No se pudo publicar: " + e.message, "error");
      } finally { publicar.disabled = false; publicar.textContent = "Publicar flyer"; }
    } }, "Publicar flyer");
    const caja = h("details", { class: "panel fly" },
      h("summary", {}, h("h2", {}, "Publicar flyer"), h("span", { class: "panel__help" }, "Sube un afiche ya hecho con su descripción, para el sitio y las redes sociales")),
      h("div", { class: "fly__cuerpo" }, form, h("div", { class: "com__acc" }, publicar),
        h("p", { class: "panel__help" }, "El flyer se publica completo, sin recortes, con la descripción debajo. Después, en «Noticias publicadas», usa «Publicación en Instagram»: el flyer va sin portada de título y la descripción sale lista para copiar.")));
    return caja;
  }

  function instagramNoticia(n) {
    const caja = h("div", { class: "ig" });
    const zona = h("div", { class: "ig__zona" });
    let abierto = null;
    const nombre = (i) => `${(n.id || window.TEXTO.idNoticia(n)).slice(0, 50)}-${i}.jpg`;

    async function abrir(tipo) {
      if (abierto === tipo) { abierto = null; zona.replaceChildren(); botones(); return; }
      abierto = tipo; botones();
      if (!n.titulo) { zona.replaceChildren(h("p", { class: "ig__nota" }, "Escribe primero el título de la noticia.")); return; }
      zona.replaceChildren(h("p", { class: "ig__nota" }, "Preparando imágenes…"));
      await fuentesIG();
      const srcs = imgsNoticia(n);
      const fotos = [];
      for (const s of srcs.slice(0, IG.max)) { try { fotos.push(await imagenIG(s)); } catch (e) { /* se omite */ } }
      const logo = await logoIG();
      if (abierto !== tipo) return;
      ({ feed: armarFeed, historia: armarHistoria, afiche: armarAfiche })[tipo](fotos, logo, srcs.length - fotos.length);
    }

    // Afiche informativo: láminas con íconos armadas desde el texto (se pueden editar)
    let afiche = null;
    async function armarAfiche(fotos, logo) {
      const a = afiche || (afiche = borradorAfiche(n));
      const grilla = h("div", { class: "ig__grilla" });
      let archivos = [], espera;
      const armar = async () => {
        const lienzos = laminasAfiche(a, logo).concat(a.conCarta && fotos[0] ? [fotoFeed(fotos[0])] : []).slice(0, IG.max);
        archivos = await Promise.all(lienzos.map((c, i) => aArchivo(c, nombre("afiche-" + (i + 1)))));
        grilla.replaceChildren(...lienzos.map((c, i) => h("figure", {}, h("img", { src: c.toDataURL("image/jpeg", .7), alt: `Lámina ${i + 1}` }), h("figcaption", {}, String(i + 1)))));
      };
      const cambio = () => { clearTimeout(espera); espera = setTimeout(armar, 300); };
      const texto = (k, label, attrs = {}) => {
        const el = h("input", { ...attrs, oninput: (e) => { a[k] = e.target.value; cambio(); } });
        el.value = a[k];
        return h("label", { class: "af__campo" }, h("span", {}, label), el);
      };
      const lista = h("div", { class: "af__puntos" });
      const pintar = () => {
        lista.replaceChildren(...a.puntos.map((p, i) => {
          const mover = (d) => { const j = i + d; if (j < 0 || j >= a.puntos.length) return; [a.puntos[i], a.puntos[j]] = [a.puntos[j], a.puntos[i]]; pintar(); cambio(); };
          const sel = h("select", { "aria-label": `Ícono del punto ${i + 1}`, onchange: (e) => { p.icono = e.target.value; cambio(); } },
            Object.entries(ICONOS).map(([k, [t]]) => h("option", { value: k, selected: p.icono === k }, t)));
          const tit = h("input", { placeholder: "Título corto (opcional)", "aria-label": `Título del punto ${i + 1}`, oninput: (e) => { p.titulo = e.target.value; cambio(); } });
          tit.value = p.titulo;
          const txt = h("textarea", { rows: 3, "aria-label": `Texto del punto ${i + 1}`, placeholder: "Texto del punto. Para una viñeta, empieza la línea con «• ».",
            oninput: (e) => { p.texto = e.target.value; cambio(); } });
          txt.value = p.texto;
          return h("div", { class: "af__punto" }, h("div", { class: "af__fila" }, h("span", { class: "af__num" }, String(i + 1)), sel, tit), txt,
            h("div", { class: "com__imgacc" },
              h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Subir", disabled: i === 0, onclick: () => mover(-1) }, "↑"),
              h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Bajar", disabled: i === a.puntos.length - 1, onclick: () => mover(1) }, "↓"),
              h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: () => { a.puntos.splice(i, 1); pintar(); cambio(); } }, "Quitar")));
        }), h("button", { type: "button", class: "btn btn--ghost btn--sm af__mas", onclick: () => { a.puntos.push({ icono: "info", titulo: "", texto: "" }); pintar(); } }, "+ Agregar punto"));
      };
      pintar();
      await armar();
      if (abierto !== "afiche") return;
      const compartir = h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
        navigator.clipboard && navigator.clipboard.writeText(pieInstagram(n)).catch(() => {});
        if (await compartirArchivos(archivos, n.titulo)) toast("Texto copiado: pégalo como descripción en Instagram.", "ok");
        else { descargar(archivos); toast("Láminas descargadas. El texto quedó copiado.", "ok"); }
      } }, "Compartir afiche");
      zona.replaceChildren(
        h("p", { class: "ig__nota" }, "El afiche se arma con el texto. Revisa y acorta los puntos: mientras más breves, más fácil se entiende. Cada cambio se ve al momento en las láminas."),
        grilla,
        h("div", { class: "af__form" },
          texto("titulo", "Título del afiche"),
          texto("destacado", "Dato destacado (opcional)", { placeholder: "Ej.: A partir del lunes 26 de octubre" }),
          h("p", { class: "ig__label" }, "Puntos clave"), lista,
          n.imagen ? h("label", { class: "ig__check" }, h("input", { type: "checkbox", checked: a.conCarta, onchange: (e) => { a.conCarta = e.target.checked; cambio(); } }),
            n.comunicado ? " Agregar la carta del comunicado al final" : " Agregar la imagen de la noticia al final") : null),
        h("div", { class: "ig__acc" },
          puedeCompartir() ? compartir : null,
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => descargar(archivos) }, "Descargar láminas"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => copiar(pieInstagram(n), "Descripción copiada.") }, "Copiar descripción"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => copiar(promptAfiche(a), "Prompt copiado: pégalo en ChatGPT o Gemini para que diseñe el afiche.") }, "Copiar prompt para IA de imágenes"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { if (confirm("¿Volver a armar el afiche desde el texto? Se pierden tus cambios.")) { afiche = null; armarAfiche(fotos, logo); } } }, "Rehacer desde el texto")),
        h("p", { class: "ig__nota" }, "¿Prefieres que lo diseñe una IA? Toca «Copiar prompt para IA de imágenes» y pégalo en ChatGPT o Gemini. Revisa que el texto de la imagen salga sin errores antes de publicar."));
    }


    async function armarFeed(fotos, logo, fallidas) {
      let conPortada = !n.comunicado && !n.flyer; // un comunicado o un flyer ya son su propia imagen
      const pie = h("textarea", { class: "ig__pie", rows: 9, maxlength: IG.pie, "aria-label": "Descripción de la publicación" });
      pie.value = pieInstagram(n);
      const cuenta = h("small", { class: "ig__cuenta" });
      const contar = () => { cuenta.textContent = `${pie.value.length} / ${IG.pie} caracteres`; };
      pie.addEventListener("input", contar); contar();
      const grilla = h("div", { class: "ig__grilla" });
      let archivos = [];
      const armar = async () => {
        const lienzos = (conPortada ? [portadaFeed(n, fotos[0], logo)] : []).concat(fotos.map(fotoFeed)).slice(0, IG.max);
        archivos = await Promise.all(lienzos.map((c, i) => aArchivo(c, nombre(i + 1))));
        grilla.replaceChildren(...lienzos.map((c, i) => h("figure", {}, h("img", { src: c.toDataURL("image/jpeg", .7), alt: `Imagen ${i + 1}` }), h("figcaption", {}, String(i + 1)))));
      };
      const casilla = h("input", { type: "checkbox", checked: conPortada, onchange: async (e) => { conPortada = e.target.checked; await armar(); } });
      await armar();
      const compartir = h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
        if (!archivos.length) return toast("Esta noticia no tiene imágenes. Activa la portada con el título.", "error");
        navigator.clipboard && navigator.clipboard.writeText(pie.value).catch(() => {});
        if (await compartirArchivos(archivos, n.titulo)) toast("Texto copiado: pégalo como descripción en Instagram.", "ok");
        else { descargar(archivos); toast("Imágenes descargadas. El texto quedó copiado.", "ok"); }
      } }, "Compartir en Instagram");
      zona.replaceChildren(
        h("p", { class: "ig__nota" }, puedeCompartir()
          ? "Toca «Compartir en Instagram» y elige Instagram → Publicación (o Facebook, WhatsApp…). El texto se copia solo: pégalo en la descripción."
          : "Descarga las imágenes, copia el texto y súbelos desde la app de Instagram (o desde instagram.com). En el celular aparece además un botón que abre Instagram directamente."),
        h("label", { class: "ig__check" }, casilla, " Agregar una portada con el título como primera imagen"),
        grilla,
        fallidas ? h("p", { class: "ig__nota" }, `${fallidas} imagen(es) no se pudieron cargar.`) : null,
        h("p", { class: "ig__label" }, "Descripción de la publicación"), pie, cuenta,
        h("div", { class: "ig__acc" },
          puedeCompartir() ? compartir : null,
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => archivos.length ? descargar(archivos) : toast("No hay imágenes para descargar.", "error") }, `Descargar imágenes (${archivos.length})`),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => copiar(pie.value, "Descripción copiada.") }, "Copiar descripción"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", title: "Copia instrucciones para que una IA redacte la descripción",
            onclick: () => copiar(promptInstagram(n), "Prompt copiado: pégalo en ChatGPT, Gemini o Claude, y pega aquí su respuesta.") }, "Copiar prompt para IA"),
          h("button", { type: "button", hidden: true, class: "btn btn--ghost btn--sm ig__volver",
            onclick: (e) => { pie.value = pieInstagram(n); contar(); e.target.hidden = true; } }, "Volver al texto ordenado")),
        h("p", { class: "ig__nota" }, "¿Prefieres que lo redacte una IA? Toca «Copiar prompt para IA», pégalo en ChatGPT, Gemini o Claude, y pega su respuesta en la descripción. Revisa siempre fechas y datos antes de publicar."));
      pie.addEventListener("input", () => { const v = zona.querySelector(".ig__volver"); if (v) v.hidden = pie.value === pieInstagram(n); });
    }

    async function armarHistoria(fotos, logo) {
      const c = historiaIG(n, fotos[0], logo);
      const archivo = await aArchivo(c, nombre("historia"));
      const enlace = urlNoticia(n);
      zona.replaceChildren(
        h("p", { class: "ig__nota" }, puedeCompartir()
          ? "Toca «Compartir en historias» y elige Instagram → Historia. El enlace de la noticia se copia solo: en Instagram agrega el sticker «Enlace», pégalo y ponlo sobre el botón dorado."
          : "Descarga la imagen y súbela como historia desde el celular. Para que lleven a la noticia, agrega el sticker «Enlace» con la dirección (botón «Copiar enlace»)."),
        h("div", { class: "ig__historia" }, h("img", { src: c.toDataURL("image/jpeg", .75), alt: "Vista previa de la historia" })),
        h("div", { class: "ig__acc" },
          puedeCompartir() ? h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: async () => {
            navigator.clipboard && navigator.clipboard.writeText(enlace).catch(() => {});
            if (await compartirArchivos([archivo], n.titulo)) toast("Enlace copiado: pégalo en el sticker «Enlace» de la historia.", "ok");
            else descargar([archivo]);
          } }, "Compartir en historias") : null,
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => descargar([archivo]) }, "Descargar historia"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => copiar(enlace, "Enlace de la noticia copiado.") }, "Copiar enlace")));
    }

    const bFeed = h("button", { type: "button", class: "btn btn--ghost btn--sm ig__btn", onclick: () => abrir("feed") });
    const bHist = h("button", { type: "button", class: "btn btn--ghost btn--sm ig__btn", onclick: () => abrir("historia") });
    const bAfiche = h("button", { type: "button", class: "btn btn--ghost btn--sm ig__btn", onclick: () => abrir("afiche") });
    const botones = () => {
      bFeed.textContent = abierto === "feed" ? "Cerrar publicación" : "Publicación en Instagram";
      bHist.textContent = abierto === "historia" ? "Cerrar historia" : "Historia de Instagram";
      bAfiche.textContent = abierto === "afiche" ? "Cerrar afiche" : "Afiche informativo";
      bFeed.setAttribute("aria-expanded", abierto === "feed"); bHist.setAttribute("aria-expanded", abierto === "historia"); bAfiche.setAttribute("aria-expanded", abierto === "afiche");
    };
    botones();
    caja.append(h("div", { class: "ig__acc" }, bFeed, bHist, bAfiche), zona);
    return caja;
  }

  // Campos de una noticia (los usan la lista de noticias y los borradores)
  const camposNoticia = () => [
      { k: "titulo", label: "Título", full: true },
      { k: "fecha", label: "Fecha", type: "date" },
      { k: "tipo", label: "Categoría", type: "select", options: [["comunicado", "Comunicado"], ["pedagogia", "Pedagogía"], ["comunidad", "Comunidad"]] },
      { k: "publicar", label: "Programar publicación (opcional)", type: "datetime-local", full: true,
        help: "Déjalo vacío para publicarla al guardar. Si eliges un día y hora, la noticia queda guardada y aparece sola en el sitio cuando llegue ese momento (hora de Chile). Ojo: hasta entonces no se ve en el sitio, pero el archivo de datos es público." },
      { k: "departamentos", label: "Departamentos o equipos (opcional)", type: "custom", full: true, render: (obj, avisar) => deptosNoticia(obj, avisar),
        help: "Marca uno o varios: la noticia también aparece en «Actividades» de cada departamento o equipo que marques (por ejemplo, una actividad de Convivencia Educativa y Lenguaje)." },
      { k: "resumen", label: "Resumen", type: "textarea", full: true, help: "Una o dos frases. Se ve en la tarjeta de la noticia y al inicio de su página." },
      { k: "cuerpo", label: "Texto completo de la noticia", type: "custom", full: true, render: (obj, avisar) => editorCuerpo(obj, avisar) },
      { k: "imagen", label: "Imagen de portada", type: "file", accept: "image/*", folder: "img/noticias", ajustar: 1600, full: true, help: "Opcional. Formato horizontal." },
      { k: "url", label: "Documento adjunto o enlace externo", type: "file", accept: ".pdf,image/*", folder: "documentos/noticias", full: true,
        placeholder: "Opcional: sube un PDF o pega un enlace (https://…)", help: "Aparece como botón al final de la noticia." },
      { k: "id", label: "Página de la noticia", type: "custom", full: true, render: (obj) => enlacePagina(obj) },
    ];

  /* ---------- Vistas ---------- */
  const VISTAS = {
    directivos: {
      titulo: "Directivos",
      ayuda: "Funcionarios del equipo directivo que aparecen en la sección «Equipo directivo». El orden de la lista es el orden en el sitio.",
      render: () => editorLista({
        items: state.data.directivos,
        textoAgregar: "Agregar directivo",
        vacio: "Aún no hay directivos.",
        nuevo: () => ({ cargo: "", nombre: "", descripcion: "", iniciales: "", foto: "" }),
        resumen: (it) => [it.cargo, [it.nombre, { sostenedor: "Sostenedor", direccion: "Dirección", gestion: "Equipo de gestión" }[it.grupo]].filter(Boolean).join(" · ")],
        miniatura: fotoOIniciales("foto", iniciales),
        campos: [
          { k: "cargo", label: "Cargo", placeholder: "Ej.: Dirección" },
          { k: "nombre", label: "Nombre", placeholder: "Ej.: María Pérez Soto" },
          { k: "grupo", label: "Sección", type: "select", options: [["", "Sin sección"], ["sostenedor", "Sostenedor"], ["direccion", "Dirección"], ["gestion", "Equipo de gestión"]],
            help: "En el sitio se agrupan por sección, como en el organigrama." },
          { k: "descripcion", label: "Descripción breve", type: "textarea", full: true },
          { k: "correo", label: "Correo", type: "email", help: "Opcional." },
          { k: "telefono", label: "Teléfono", help: "Opcional." },
          { k: "iniciales", label: "Iniciales (si no hay foto)", max: 3 },
          { k: "foto", label: "Foto", type: "file", accept: "image/*", folder: "img/directivos", placeholder: "Sube una imagen o pega un enlace" },
        ],
      }),
    },
    departamentos: {
      titulo: "Departamentos",
      ayuda: "Los departamentos académicos (Matemática, Lenguaje…) tienen su propia página con sus profesores y actividades. Los profesores se asignan en «Docentes y personal» y las actividades son noticias con la etiqueta de su departamento. Los equipos de apoyo (Convivencia Educativa, Apoyo Pedagógico…) aparecen en una sección aparte y también tienen su página, con las personas de su área y sus actividades.",
      render: () => editorLista({
        items: state.data.departamentos,
        textoAgregar: "Agregar departamento",
        vacio: "Aún no hay departamentos.",
        nuevo: () => ({ tipo: "academico", nombre: "", descripcion: "", encargado: "", correo: "", imagen: "", formato: "foto" }),
        resumen: (it) => [it.nombre, [it.tipo === "academico" ? "Académico" : "Equipo de apoyo", it.encargado].filter(Boolean).join(" · ")],
        miniatura: (it, el) => { el.textContent = (it.nombre || "?").replace(/^Departamento (de )?/i, "").slice(0, 2).toUpperCase(); },
        campos: [
          { k: "nombre", label: "Nombre", placeholder: "Ej.: Departamento de Matemática", full: true },
          { k: "tipo", label: "Tipo", type: "select", options: [["academico", "Académico (con página, profesores y actividades)"], ["apoyo", "Equipo de apoyo (con página, equipo y actividades)"]] },
          { k: "id", label: "Página", type: "custom", render: (obj) => enlaceDepto(obj) },
          { k: "descripcion", label: "Descripción", type: "textarea", full: true },
          { k: "encargado", label: "Jefe/a o encargado/a", help: "Opcional." },
          { k: "correo", label: "Correo de contacto", type: "email", help: "Opcional." },
          { k: "imagen", label: "Imagen o portada", type: "file", accept: "image/*", folder: "img/departamentos", ajustar: 1600, full: true,
            placeholder: "Opcional: sube una foto o un ícono", help: "En los académicos es la portada de su página (mejor horizontal). Se ajusta sola." },
          { k: "formato", label: "Mostrar la imagen como", type: "select", options: [["icono", "Ícono pequeño arriba del título"], ["foto", "Foto a lo ancho de la tarjeta"]] },
        ],
      }),
    },
    personal: {
      titulo: "Docentes y personal",
      ayuda: "Cada persona aparece en la página «Docentes», «Equipos y funcionarios» o «CGPA y CEAL» según su tipo, agrupada por área. Marca sus «Departamentos» para que aparezcan en la página de cada departamento académico. Título, postgrado, tema favorito y frase se ven al tocar su tarjeta.",
      render: () => {
        const fijas = ["Docentes Primer Ciclo", "Docentes Segundo Ciclo", "Inspectoría", "Asistentes de aula", "Administración",
          "Auxiliares, aseo y mantención", "Centro de Padres y Apoderados", "Centro de Estudiantes (CEAL)"];
        const areas = [...new Set(fijas.concat(state.data.departamentos.map((d) => d.nombre), state.data.personal.map((p) => p.area)).filter(Boolean))];
        return editorLista({
          items: state.data.personal,
          textoAgregar: "Agregar persona",
          vacio: "Aún no hay personas.",
          nuevo: () => ({ nombre: "", cargo: "", area: areas[0], tipo: "docente", correo: "", telefono: "", foto: "" }),
          resumen: (it) => [it.nombre, [{ equipo: "Equipo", comunidad: "CGPA/CEAL" }[it.tipo] || "Docente", it.cargo, it.area].filter(Boolean).join(" · ")],
          miniatura: fotoOIniciales("foto", (it) => (it.nombre || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()),
          campos: [
            { k: "nombre", label: "Nombre completo" },
            { k: "cargo", label: "Cargo, curso o asignatura", placeholder: "Ej.: Profesora jefe 2° básico A" },
            { k: "tipo", label: "Aparece en", type: "select", options: [["docente", "Docentes (profesores)"], ["equipo", "Equipos y funcionarios"], ["comunidad", "CGPA y CEAL"]] },
            { k: "area", label: "Área o equipo", type: "select", options: areas.map((a) => [a, a]), help: "Título del grupo en que aparece." },
            { k: "lider", label: "¿Lidera esta área?", type: "select", options: [["", "No"], ["si", "Sí: aparece primero y destacado"]], help: "Por ejemplo, la Inspectora General en Inspectoría." },
            { k: "correo", label: "Correo", type: "email", help: "Opcional." },
            { k: "telefono", label: "Teléfono", help: "Opcional." },
            { k: "departamentos", label: "Departamentos", type: "custom", full: true, render: (obj, avisar) => elegirDeptos(obj, avisar) },
            { k: "titulo", label: "Título profesional", placeholder: "Ej.: Profesora de Matemática, Universidad Arturo Prat", full: true, help: "Opcional. Se ve en su ficha completa." },
            { k: "postgrado", label: "Postgrado", placeholder: "Ej.: Magíster en Educación Matemática", full: true, help: "Opcional: magíster, doctorado, diplomado…" },
            { k: "interes", label: "Tema favorito o área de interés", placeholder: "Ej.: Geometría y resolución de problemas", full: true, help: "Opcional." },
            { k: "frase", label: "Frase breve", type: "textarea", full: true, help: "Opcional. Una frase sobre su forma de enseñar o algo que le guste." },
            { k: "foto", label: "Foto", type: "file", accept: "image/*", folder: "img/personal", full: true,
              placeholder: "Sube una foto o pega un enlace", help: "Horizontal, idealmente de medio cuerpo. Si no hay foto se muestran las iniciales." },
          ],
        });
      },
    },
    noticias: {
      titulo: "Noticias",
      ayuda: "Las noticias se ordenan por fecha automáticamente. La más reciente aparece destacada en la portada.",
      render: () => {
        const campos = camposNoticia().filter((c) => c.k !== "id");
        if (soloPropuestas()) {
          return h("div", {}, h("div", { class: "panel apr__intro" }, h("p", {}, "Tus noticias se publican cuando el encargado web las aprueba. Te llega un correo cuando se publican o si necesitan cambios.")),
            panelPropuestas(), panelBorradores(campos, (n) => enviarPropuesta(n), "Enviar para aprobación"), generadorFlyer());
        }
        const lista = VISTAS.noticias.lista();
        return h("div", {}, apruebaNoticias() ? panelAprobacion() : "", panelBorradores(campos, (n) => {
          state.data.noticias.unshift(n);
          setDirty(true);
          guardar();
        }), generadorComunicado(), generadorFlyer(), h("div", { class: "panel" }, h("h2", {}, "Noticias publicadas"), lista));
      },
      lista: () => editorLista({
        items: state.data.noticias,
        agregarArriba: true,
        textoAgregar: "Nueva noticia",
        vacio: "Aún no hay noticias.",
        nuevo: () => ({ fecha: new Date().toLocaleDateString("sv"), tipo: "comunicado", titulo: "", resumen: "", url: "", imagen: "" }),
        resumen: (it) => [it.titulo, it.publicar && new Date(it.publicar) > new Date()
          ? "Programada: " + new Date(it.publicar).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" }) : (it.fecha || "") + (it.autor ? " · por " + it.autor : "")],
        miniatura: fotoOIniciales("imagen", (it) => (it.fecha || "").slice(8, 10) || "•"),
        campos: camposNoticia().concat({ k: "instagram", label: "Compartir en Instagram", type: "custom", full: true,
          help: "Arma las imágenes y el texto para subir esta noticia a la cuenta de Instagram del colegio. Solo aparece aquí, en el panel.",
          render: (obj) => instagramNoticia(obj) }),
      }),
    },
    eventos: {
      titulo: "Calendario escolar",
      ayuda: "Reuniones, actos, evaluaciones, feriados y actividades. Se ven en la página «Calendario escolar» y los próximos aparecen en el inicio. Se ordenan solos por fecha. Los marcados con 🔔 envían un recordatorio a la app la tarde anterior. Las familias pueden sumar todo el calendario a su celular desde la página del calendario.",
      render: () => editorLista({
        items: state.data.eventos,
        agregarArriba: true,
        textoAgregar: "Nuevo evento",
        vacio: "Aún no hay eventos.",
        nuevo: () => ({ titulo: "", fecha: new Date().toLocaleDateString("sv"), tipo: "evento", recordar: true }),
        resumen: (it) => [(it.recordar ? "🔔 " : "") + it.titulo, [it.fecha, it.fin && it.fin !== it.fecha ? "→ " + it.fin : "", it.hora].filter(Boolean).join(" ")],
        miniatura: (it, el) => { el.textContent = (it.fecha || "").slice(8, 10) || "•"; },
        campos: [
          { k: "titulo", label: "Título", full: true, placeholder: "Ej.: Reunión de apoderados 1° medio" },
          { k: "tipo", label: "Tipo", type: "select", options: [["evento", "Actividad"], ["reunion", "Reunión"], ["acto", "Acto o ceremonia"], ["evaluacion", "Evaluación"], ["feriado", "Feriado o interferiado"], ["vacaciones", "Vacaciones"]] },
          { k: "fecha", label: "Fecha", type: "date" },
          { k: "fin", label: "Hasta (opcional)", type: "date", help: "Solo si dura varios días, por ejemplo vacaciones de invierno." },
          { k: "hora", label: "Hora (opcional)", placeholder: "Ej.: 19:00 o 08:00 a 13:00", max: 30 },
          { k: "lugar", label: "Lugar (opcional)", placeholder: "Ej.: Gimnasio" },
          { k: "descripcion", label: "Descripción (opcional)", type: "textarea", full: true },
          { k: "enlace", label: "Enlace (opcional)", full: true, placeholder: "https://… o la dirección de una noticia", help: "Por ejemplo, la noticia o circular con el detalle." },
          { k: "recordar", label: "Recordatorio en la app", type: "checkbox", full: true, texto: "Avisar a los celulares con la app la tarde anterior (18:00)",
            help: "Llega como notificación a quienes activaron las alertas en la app del colegio." },
        ],
      }),
    },
    galeria: {
      titulo: "Galería de fotos",
      ayuda: "Cada álbum es una actividad con sus fotos. Los álbumes se ven en la página «Galería de fotos», del más reciente al más antiguo.",
      render: () => editorLista({
        items: state.data.galeria,
        agregarArriba: true,
        textoAgregar: "Nuevo álbum",
        vacio: "Aún no hay álbumes.",
        nuevo: () => ({ titulo: "", fecha: new Date().toLocaleDateString("sv"), descripcion: "", fotos: [] }),
        resumen: (it) => [it.titulo, `${it.fecha || ""} · ${(it.fotos || []).length} fotos`],
        miniatura: (it, el) => {
          const f = (it.fotos || [])[0];
          if (f) el.append(h("img", { src: resolver(f), alt: "" })); else el.textContent = "📷";
        },
        campos: [
          { k: "titulo", label: "Nombre del álbum", full: true, placeholder: "Ej.: Fiestas Patrias 2026" },
          { k: "fecha", label: "Fecha", type: "date" },
          { k: "descripcion", label: "Descripción (opcional)", type: "textarea", full: true },
          { k: "fotos", label: "Fotos", type: "custom", full: true, render: (obj, avisar) => editorFotos(obj, avisar) },
          { k: "id", label: "Página del álbum", type: "custom", full: true, render: (obj) => h("p", { class: "cuerpo__link" },
            obj.id ? h("a", { href: SITIO + "galeria/?a=" + encodeURIComponent(obj.id), target: "_blank", rel: "noopener" }, "Ver el álbum en el sitio ↗") : "Su página se crea al guardar.") },
        ],
      }),
    },
    documentos: {
      titulo: "Documentos institucionales",
      ayuda: "RICE, PEI, reglamentos, protocolos y otros documentos que se descargan desde el sitio.",
      render: () => editorLista({
        items: state.data.documentos,
        textoAgregar: "Agregar documento",
        vacio: "Aún no hay documentos.",
        nuevo: () => ({ nombre: "", sigla: "PDF", url: "" }),
        resumen: (it) => [it.nombre, it.url],
        miniatura: (it, el) => { el.textContent = (it.sigla || "PDF").slice(0, 4); },
        campos: [
          { k: "nombre", label: "Nombre del documento", placeholder: "Ej.: Reglamento Interno de Convivencia Escolar (RICE)", full: true },
          { k: "sigla", label: "Etiqueta corta", max: 6, help: "Ej.: RICE, PEI, PDF" },
          { k: "url", label: "Archivo", type: "file", accept: ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx", folder: "documentos",
            placeholder: "Sube el archivo o pega un enlace" },
        ],
      }),
    },
    redes: {
      titulo: "Redes sociales",
      ayuda: "Cuentas que aparecen en la sección de redes, en la barra superior y en el pie de página.",
      render: () => {
        const r = state.data.redes;
        const textos = h("div", { class: "panel" }, h("h2", {}, "Textos de la sección"),
          h("div", { class: "item__body", style: "border:0;padding:0" },
            campo({ k: "titulo", label: "Título", full: true }, r),
            campo({ k: "descripcion", label: "Descripción", type: "textarea", full: true }, r)));
        const opciones = Object.entries(window.REDES).map(([k, v]) => [k, v.nombre]);
        return h("div", {}, textos, editorLista({
          items: r.lista,
          textoAgregar: "Agregar cuenta",
          vacio: "Aún no hay cuentas.",
          nuevo: () => ({ red: "facebook", nombre: "", url: "" }),
          resumen: (it) => [it.nombre || (window.REDES[it.red] || {}).nombre, it.url],
          miniatura: (it, el) => { el.innerHTML = window.iconoRed(it.red); },
          campos: [
            { k: "red", label: "Red social", type: "select", options: opciones },
            { k: "nombre", label: "Nombre visible", placeholder: "Ej.: Centro de Padres" },
            { k: "url", label: "Enlace", type: "url", placeholder: "https://…", full: true },
          ],
        }));
      },
    },
    colores: {
      titulo: "Colores del sitio",
      ayuda: "Elige los colores institucionales. Los tonos intermedios se calculan automáticamente.",
      render: () => {
        const c = state.data.colores;
        const DEF = [
          ["primario", "Color principal", "Fondo de portada, títulos y pie de página."],
          ["secundario", "Color secundario", "Degradados y fondos de apoyo."],
          ["acento", "Color de acento", "Botones, detalles y destacados."],
        ];
        const preview = h("div", { class: "preview" });
        const pintarPreview = () => {
          preview.innerHTML = `
            <div class="preview__hero" style="background:linear-gradient(135deg, ${c.primario}, ${c.secundario})">
              <h3>Una escuela para <em style="color:${c.acento}">aprender</em>, crecer y convivir</h3>
              <p>Así se verá la portada del sitio con estos colores.</p>
              <span class="preview__btn" style="background:${c.acento};color:${c.primario}">Admisión 2027</span>
            </div>
            <div class="preview__body">
              <span class="preview__chip" style="background:${c.primario};color:${c.acento}">SM</span>
              <strong style="font-family:Fraunces,serif;color:${c.primario}">Equipo directivo</strong>
            </div>`;
        };
        const inputs = {};
        const colores = h("div", { class: "colors" }, DEF.map(([k, label, help]) => {
          const code = h("code", {}, c[k]);
          inputs[k] = h("input", { type: "color", value: c[k], "aria-label": label,
            oninput: (e) => { c[k] = e.target.value; code.textContent = e.target.value; setDirty(true); pintarPreview(); } });
          inputs[k].code = code;
          return h("label", { class: "color" }, inputs[k], h("span", {}, h("strong", {}, label), code, h("small", { style: "display:block;color:var(--muted);font-size:.78rem" }, help)));
        }));
        const PRESETS = [
          ["Institucional", "#0b1f3a", "#1c3a66", "#c9a24b"],
          ["Verde bosque", "#123524", "#2f6b4f", "#d4a72c"],
          ["Burdeo", "#3b0d18", "#7a1f35", "#e0b45c"],
          ["Azul cielo", "#0f2d52", "#2b6cb0", "#f2b134"],
          ["Grafito", "#1f2328", "#3d4752", "#e4572e"],
        ];
        const presets = h("div", { class: "presets" }, PRESETS.map(([n, p, s, a]) =>
          h("button", { class: "preset", type: "button", onclick: () => {
            Object.assign(c, { primario: p, secundario: s, acento: a });
            for (const k in inputs) { inputs[k].value = c[k]; inputs[k].code.textContent = c[k]; }
            setDirty(true); pintarPreview();
          } }, h("i", { style: `background:${p}` }), h("i", { style: `background:${s}` }), h("i", { style: `background:${a}` }), n)));
        pintarPreview();
        return h("div", {},
          h("div", { class: "panel" }, h("h2", {}, "Paleta"), colores, h("p", { style: "margin:1.2rem 0 0;font-size:.85rem;color:var(--muted)" }, "Combinaciones sugeridas:"), presets),
          h("div", { class: "panel" }, h("h2", {}, "Vista previa"), preview));
      },
    },
  };

  /* ---------- Pilares del proyecto educativo ---------- */
  VISTAS.pilares = {
    titulo: "Pilares",
    ayuda: "Las tarjetas «Lo que nos distingue» de la portada y de «Nuestro colegio». Cada una puede llevar una imagen: un ícono o una foto.",
    render: () => editorLista({
      items: state.data.pilares,
      textoAgregar: "Agregar pilar",
      vacio: "Aún no hay pilares.",
      nuevo: () => ({ titulo: "", texto: "", imagen: "", formato: "icono" }),
      resumen: (it) => [it.titulo, it.imagen ? (it.formato === "foto" ? "Con foto" : "Con ícono") : "Sin imagen"],
      miniatura: fotoOIniciales("imagen", (it) => (it.titulo || "?").slice(0, 2).toUpperCase()),
      campos: [
        { k: "titulo", label: "Título", full: true },
        { k: "texto", label: "Texto", type: "textarea", full: true },
        { k: "imagen", label: "Imagen", type: "file", accept: "image/*", folder: "img/pilares", ajustar: 900, full: true,
          placeholder: "Opcional: sube un ícono o una foto", help: "Se ajusta sola a un tamaño estándar. Para íconos usa PNG con fondo transparente." },
        { k: "formato", label: "Mostrar la imagen como", type: "select", options: [["icono", "Ícono pequeño arriba del título"], ["foto", "Foto a lo ancho de la tarjeta"]] },
      ],
    }),
  };

  /* ---------- CGPA y CEAL ---------- */
  VISTAS.organizaciones = {
    titulo: "CGPA y CEAL",
    ayuda: "Centro de Padres y Centro de Estudiantes, en la página /cgpa-ceal/. Sus integrantes se agregan en «Docentes y personal» con «Aparece en: CGPA y CEAL» y el área de su centro.",
    render: () => editorLista({
      items: state.data.organizaciones,
      textoAgregar: "Agregar organización",
      vacio: "Aún no hay organizaciones.",
      nuevo: () => ({ sigla: "", nombre: "", area: "", descripcion: "", correo: "", instagram: "" }),
      resumen: (it) => [it.nombre, [it.sigla, it.instagram ? "Instagram listo" : "Sin Instagram", `${state.data.personal.filter((p) => it.area && p.area === it.area).length} integrantes`].filter(Boolean).join(" · ")],
      miniatura: (it, el) => { el.textContent = (it.sigla || it.nombre || "?").slice(0, 4); },
      campos: [
        { k: "nombre", label: "Nombre", placeholder: "Ej.: Centro de Estudiantes" },
        { k: "sigla", label: "Sigla", max: 8, placeholder: "Ej.: CEAL" },
        { k: "descripcion", label: "Descripción", type: "textarea", full: true },
        { k: "instagram", label: "Instagram", type: "url", placeholder: "https://www.instagram.com/usuario", help: "Pega el enlace completo de su perfil. Si lo dejas vacío se muestra «Muy pronto»." },
        { k: "correo", label: "Correo", type: "email", help: "Opcional." },
        { k: "area", label: "Área de sus integrantes", full: true, help: "Debe coincidir con el «Área o equipo» de sus integrantes en «Docentes y personal».",
          placeholder: "Ej.: Centro de Estudiantes (CEAL)" },
      ],
    }),
  };

  /* ==========================================================
     Usuarios y permisos (solo el dueño)
     ========================================================== */
  const ESTADOS = { publicado: ["Publicado", "ok"], pendiente: ["Esperando tu aprobación", "warn"], rechazado: ["Rechazado", "bad"] };

  /* ---------- Cuentas de la app «Noticias UTP» (usuario y contraseña, sin GitHub) ----------
     Viven en el servidor del colegio (Cloudflare); aquí solo se crean, se cambian y se borran. */
  const claveAlAzar = () => {
    const sil = ["ma", "pe", "lu", "so", "ri", "ta", "no", "ve", "ca", "di", "ro", "mi", "sa", "ne", "po", "la"];
    const r = crypto.getRandomValues(new Uint8Array(6));
    return [...r.slice(0, 4)].map((x) => sil[x % sil.length]).join("") + "-" + (1000 + ((r[4] << 8 | r[5]) % 9000));
  };
  function cuentasUtp() {
    const caja = h("div", { class: "panel" });
    const s = servidorApp();
    const titulo = h("h2", {}, "Cuentas de la app «Noticias UTP»");
    const ayuda = h("p", { class: "panel__help" }, "Para el equipo UTP sin cuenta de GitHub: entran en ",
      h("a", { href: SITIO + "utp/", target: "_blank", rel: "noopener" }, "colegiosm.cl/utp"),
      " con usuario y contraseña, y solo pueden escribir, programar, editar y borrar noticias. Pueden instalarla en el celular como una app. Al cambiar la contraseña o borrar la cuenta, se cierra su sesión en todos sus equipos.");
    if (!s) { caja.append(titulo, ayuda, sinServidor("La app Noticias UTP")); return caja; }
    const pedir = (ruta, cuerpo) => fetch(s + ruta, { method: cuerpo ? "POST" : "GET", cache: "no-store",
      headers: { ...credencial(), ...(cuerpo ? { "Content-Type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || (r.status === 404 ? "El servidor aún no tiene esta función: vuelve a pegar servidor/notificaciones.js en Cloudflare." : "Error " + r.status)); return j; });
    const lista = h("div", { class: "cuentas" }, h("p", { class: "panel__help" }, "Cargando…"));
    const mostrarClave = (usuario, clave) => alert(`Cuenta lista.\n\nUsuario: ${usuario}\nContraseña: ${clave}\n\nAnótala y entrégasela en persona: no se vuelve a mostrar.`);
    const cargar = () => pedir("/utp/cuentas").then((j) => {
      lista.replaceChildren(...(j.cuentas.length ? j.cuentas.map((c) => h("div", { class: "cuentas__fila" },
        h("div", {}, h("strong", {}, c.nombre || c.usuario), h("small", {}, `Usuario: ${c.usuario}` + (c.creado ? ` · creada el ${new Date(c.creado + "T12:00").toLocaleDateString("es-CL")}` : ""))),
        h("div", { class: "cuentas__acc" },
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async () => {
            const clave = prompt(`Nueva contraseña para ${c.usuario} (mínimo 8 caracteres). Déjala así para usar la sugerida:`, claveAlAzar());
            if (!clave) return;
            try { await pedir("/utp/cuentas", { usuario: c.usuario, nombre: c.nombre, clave }); mostrarClave(c.usuario, clave); }
            catch (e) { toast(e.message, "error"); }
          } }, "Cambiar contraseña"),
          h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: async () => {
            if (!confirm(`¿Borrar la cuenta «${c.usuario}»? Se borran también sus borradores. Las noticias que publicó se mantienen.`)) return;
            try { await pedir("/utp/cuentas/borrar", { usuario: c.usuario }); toast("Cuenta borrada.", "ok"); cargar(); }
            catch (e) { toast(e.message, "error"); }
          } }, "Borrar"))))
        : [h("p", { class: "panel__help" }, "Aún no hay cuentas.")]));
    }).catch((e) => lista.replaceChildren(h("p", { class: "panel__help" }, e.message === "Failed to fetch" ? "No se pudo conectar con el servidor." : e.message)));
    const nombre = h("input", { type: "text", placeholder: "Ej.: Ana Rojas", maxlength: 80 });
    const usuario = h("input", { type: "text", placeholder: "Ej.: arojas", maxlength: 30, autocapitalize: "none", spellcheck: "false" });
    const clave = h("input", { type: "text", maxlength: 100, autocomplete: "off" });
    clave.value = claveAlAzar();
    const crear = h("form", { class: "cuentas__nueva", onsubmit: async (e) => {
      e.preventDefault();
      const u = usuario.value.trim().toLowerCase();
      if (!/^[a-z0-9._-]{3,30}$/.test(u)) return toast("El usuario debe tener entre 3 y 30 letras o números, sin espacios ni tildes.", "error");
      if (clave.value.length < 8) return toast("La contraseña debe tener al menos 8 caracteres.", "error");
      try {
        await pedir("/utp/cuentas", { usuario: u, nombre: nombre.value.trim(), clave: clave.value });
        mostrarClave(u, clave.value);
        nombre.value = ""; usuario.value = ""; clave.value = claveAlAzar();
        cargar();
      } catch (err) { toast(err.message, "error"); }
    } },
      h("label", {}, "Nombre", nombre), h("label", {}, "Usuario", usuario),
      h("label", {}, "Contraseña", clave),
      h("button", { type: "submit", class: "btn btn--primary btn--sm" }, "Crear cuenta"));
    cargar();
    caja.append(titulo, ayuda, lista, h("h3", { class: "cuentas__sub" }, "Nueva cuenta"), crear);
    return caja;
  }

  /* ---------- Cuentas con el correo del colegio (sin GitHub) ----------
     Viven en el servidor del colegio; las contraseñas las eligen las personas y se guardan cifradas allá. */
  function cuentasCorreo() {
    const caja = h("div", { class: "panel" });
    const titulo = h("h2", {}, "Cuentas con correo del colegio");
    const ayuda = h("p", { class: "panel__help" }, "Directivos y funcionarios entran a este panel con su correo @colegiosm.cl y una contraseña que eligen ellos: la primera vez reciben un código en su correo. Tú decides qué puede cambiar cada uno, y puedes cambiarlo o quitar el acceso cuando quieras (se aplica al tiro). Las cuentas quedan solo en el servidor del colegio, no en el sitio público.");
    const lista = h("div", { class: "cuentas" }, h("p", { class: "panel__help" }, "Cargando…"));
    const registro = h("div", { class: "act" });
    const masivo = h("button", { type: "button", class: "btn btn--primary btn--sm cuentas__masivo", hidden: true });
    let editando = null;

    const nombre = h("input", { type: "text", maxlength: 80, placeholder: "Ej.: Teresa Monroy" });
    const correo = h("input", { type: "email", maxlength: 120, placeholder: "nombre.apellido@colegiosm.cl", autocapitalize: "none", spellcheck: "false" });
    const cargo = h("input", { type: "text", maxlength: 60, list: "cargosPanel", placeholder: "Elige o escribe", oninput: () => {
      const c = CARGOS.find(([n]) => n.toLowerCase() === cargo.value.trim().toLowerCase());
      if (c) marcar(c[1]);
    } });
    const cargos = h("datalist", { id: "cargosPanel" }, CARGOS.map(([n]) => h("option", { value: n })));
    const cajas = Object.fromEntries(Object.keys(PERMISOS).map((k) => [k, h("input", { type: "checkbox", value: k, onchange: () => pintarTodo() })]));
    const pintarTodo = () => Object.entries(cajas).forEach(([k, c]) => { if (k !== "todo") c.closest("label").classList.toggle("is-apagado", cajas.todo.checked); });
    const marcar = (lista) => { Object.entries(cajas).forEach(([k, c]) => { c.checked = lista.includes(k); }); pintarTodo(); };
    const cerrar = h("input", { type: "checkbox" });
    const filaCerrar = h("label", { class: "check", hidden: true }, cerrar, " Cerrar las sesiones que tenga abiertas");
    const invitar = h("input", { type: "checkbox", checked: true });
    const filaInvitar = h("label", { class: "check" }, invitar, " Enviarle un correo con las instrucciones para entrar y lo que puede hacer");
    // Correo de bienvenida (lo envía el script de Google desde la cuenta del colegio)
    const enviarInstrucciones = (c) => pedirServidor("/panel/invitar", { correo: c });
    const boton = h("button", { type: "submit", class: "btn btn--primary btn--sm" }, "Dar acceso");
    const cancelar = h("button", { type: "button", class: "btn btn--ghost btn--sm", hidden: true, onclick: () => limpiar() }, "Cancelar");
    const subt = h("h3", { class: "cuentas__sub" }, "Nueva cuenta");
    const limpiar = () => {
      editando = null; nombre.value = correo.value = cargo.value = ""; correo.disabled = false; cerrar.checked = false; marcar([]);
      filaCerrar.hidden = true; filaInvitar.hidden = false; invitar.checked = true; cancelar.hidden = true; boton.textContent = "Dar acceso"; subt.textContent = "Nueva cuenta";
    };
    const form = h("form", { class: "cuentas__nueva cuentas__correo", onsubmit: async (e) => {
      e.preventDefault();
      const permisos = Object.keys(cajas).filter((k) => cajas[k].checked);
      const c = correo.value.trim().toLowerCase();
      if (!nombre.value.trim()) return toast("Escribe el nombre de la persona.", "error");
      if (!/@([a-z0-9-]+\.)*colegiosm\.cl$/.test(c)) return toast("Usa su correo institucional (@colegiosm.cl): ahí le llega el código para entrar.", "error");
      if (!permisos.length) return toast("Marca al menos un permiso.", "error");
      try {
        await pedirServidor("/panel/cuenta", { correo: c, nombre: nombre.value.trim(), cargo: cargo.value.trim(), permisos, cerrarSesiones: cerrar.checked });
        let aviso = editando ? "Cuenta actualizada." : `Listo. Avísale a ${nombre.value.trim()} que entre a colegiosm.cl/admin con su correo y toque «Primera vez».`;
        if (!editando && invitar.checked) {
          aviso = await enviarInstrucciones(c).then(() => `Listo. Le enviamos a ${nombre.value.trim()} un correo con las instrucciones para entrar.`)
            .catch((err) => "La cuenta quedó lista, pero el correo no salió: " + err.message);
        }
        toast(aviso, /no salió/.test(aviso) ? "error" : "ok");
        limpiar(); cargar();
      } catch (err) { toast(err.message, "error"); }
    } },
      h("label", {}, "Nombre", nombre), h("label", {}, "Correo institucional", correo), h("label", {}, "Cargo", cargo, cargos),
      h("fieldset", { class: "permisos" }, h("legend", {}, "Qué puede hacer"),
        Object.entries(PERMISOS).map(([k, p]) => h("label", { class: "permisos__item" }, cajas[k], h("span", {}, h("strong", {}, p.nombre), h("small", {}, p.desc))))),
      filaCerrar, filaInvitar, h("div", { class: "cuentas__botones" }, boton, cancelar));

    const fecha = (iso) => iso ? new Date(iso.length === 10 ? iso + "T12:00" : iso).toLocaleDateString("es-CL", { day: "numeric", month: "short", year: "numeric" }) : "";
    const cargar = () => {
      pedirServidor("/panel/cuentas").then((j) => {
        const pendientes = j.cuentas.filter((c) => !c.activa && !c.invitado);
        masivo.hidden = !pendientes.length;
        masivo.textContent = `Enviar instrucciones a ${pendientes.length === 1 ? "la cuenta que aún no las recibe" : `las ${pendientes.length} cuentas que aún no las reciben`}`;
        masivo.onclick = async () => {
          if (!confirm(`Se enviará un correo con las instrucciones para entrar y sus funciones a:\n\n${pendientes.map((c) => "• " + (c.nombre || c.correo) + " (" + c.correo + ")").join("\n")}\n\n¿Enviar?`)) return;
          masivo.disabled = true;
          let ok = 0; const fallas = [];
          for (const c of pendientes) {
            try { await enviarInstrucciones(c.correo); ok++; } catch (err) { fallas.push(`${c.nombre || c.correo}: ${err.message}`); }
          }
          masivo.disabled = false;
          toast(fallas.length ? `Enviados: ${ok}. No salieron: ${fallas.join(" · ")}` : `Listo: se enviaron ${ok} correos con las instrucciones.`, fallas.length ? "error" : "ok");
          cargar();
        };
        lista.replaceChildren(...(j.cuentas.length ? j.cuentas.map((c) => h("div", { class: "cuentas__fila" },
          h("div", {}, h("strong", {}, c.nombre + (c.cargo ? " · " + c.cargo : "")),
            h("small", {}, `${c.correo} · ${c.permisos.map((p) => (PERMISOS[p] || { nombre: p }).nombre).join(", ")}`),
            h("small", {}, (c.activa ? `Ya entró${c.ultimo ? " (último ingreso: " + fecha(c.ultimo) + ")" : ""}` : "Aún no entra por primera vez") +
              (c.invitado ? ` · instrucciones enviadas el ${fecha(c.invitado)}` : ""))),
          h("div", { class: "cuentas__acc" },
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async (e) => {
              const b = e.currentTarget; b.disabled = true;
              try { await enviarInstrucciones(c.correo); toast(`Instrucciones enviadas a ${c.nombre || c.correo}.`, "ok"); cargar(); }
              catch (err) { toast(err.message, "error"); b.disabled = false; }
            } }, c.invitado ? "Reenviar instrucciones" : "Enviar instrucciones"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
              editando = c.correo; nombre.value = c.nombre || ""; correo.value = c.correo; correo.disabled = true; cargo.value = c.cargo || ""; marcar(c.permisos);
              filaCerrar.hidden = false; filaInvitar.hidden = true; cancelar.hidden = false; boton.textContent = "Guardar cambios"; subt.textContent = "Editar a " + (c.nombre || c.correo);
              form.scrollIntoView({ behavior: "smooth", block: "center" });
            } }, "Editar"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: async () => {
              if (c.correo === state.login && !confirm("Es tu propia cuenta: perderás el acceso al panel. ¿Seguir?")) return;
              if (!confirm(`¿Quitar el acceso de ${c.nombre || c.correo}? Se cierra su sesión en todos sus equipos. Lo que publicó se mantiene.`)) return;
              try { await pedirServidor("/panel/cuenta/borrar", { correo: c.correo }); toast("Acceso quitado.", "ok"); cargar(); }
              catch (e) { toast(e.message, "error"); }
            } }, "Quitar acceso"))))
          : [h("p", { class: "panel__help" }, "Aún no hay cuentas. Agrega la primera aquí abajo.")]));
      }).catch((e) => lista.replaceChildren(h("p", { class: "panel__help" }, e.message === "Failed to fetch" ? "No se pudo conectar con el servidor." : e.message)));
      pedirServidor("/panel/registro").then((j) => {
        registro.replaceChildren(...(j.registro.length ? j.registro.slice(0, 40).map((r) => h("div", { class: "act__row" },
          h("span", { class: "act__date" }, new Date(r.t).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
          h("span", { class: "act__title" }, `${r.nombre || r.correo}: ${r.accion}`))) : [h("p", { class: "empty" }, "Todavía no hay actividad.")]));
      }).catch(() => registro.replaceChildren(h("p", { class: "empty" }, "No se pudo cargar la actividad.")));
    };
    cargar();
    caja.append(titulo, ayuda, masivo, lista, subt, form,
      h("h3", { class: "cuentas__sub" }, "Actividad de estas cuentas"), registro);
    return caja;
  }

  VISTAS.usuarios = {
    titulo: "Usuarios y permisos",
    ayuda: "Quiénes pueden entrar al panel y qué pueden cambiar: con el correo del colegio (lo más simple) o con una cuenta de GitHub.",
    render: () => {
      const roles = h("div", { class: "roles" }, Object.entries(ROLES).filter(([k]) => k !== "correo").map(([k, r]) =>
        h("div", { class: "roles__item" }, h("strong", {}, r.nombre), h("p", {}, r.desc))));

      const lista = editorLista({
        items: state.roles.usuarios,
        textoAgregar: "Agregar funcionario",
        vacio: "Aún no hay funcionarios con acceso. Quienes tienen permiso de escritura en el repositorio siempre tienen acceso total.",
        nuevo: () => ({ nombre: "", github: "", rol: "utp" }),
        resumen: (it) => [it.nombre || (it.github ? "@" + it.github : "(sin nombre)"), [it.github ? "@" + it.github : "", (ROLES[it.rol] || {}).nombre].filter(Boolean).join(" · ")],
        miniatura: (it, el) => { el.textContent = (it.nombre || it.github || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); },
        campos: [
          { k: "nombre", label: "Nombre", placeholder: "Ej.: Ana Rojas (UTP)" },
          { k: "github", label: "Usuario de GitHub", placeholder: "Ej.: anarojas", help: "El nombre de su cuenta, sin @." },
          { k: "rol", label: "Rol", type: "select", full: true, options: Object.entries(ROLES).filter(([k]) => k !== "correo").map(([k, r]) => [k, r.nombre]) },
        ],
      });

      const pasos = h("ol", { class: "steps-list" },
        h("li", {}, "El funcionario crea una cuenta gratis en ", h("a", { href: "https://github.com/signup", target: "_blank", rel: "noopener" }, "github.com"), " y te dice su nombre de usuario."),
        h("li", {}, "Lo agregas aquí con su rol y presionas «Guardar y publicar»."),
        h("li", {}, "Él crea su token de acceso en ", h("a", { href: "https://github.com/settings/tokens/new?scopes=public_repo&description=Panel%20Colegio%20San%20Mart%C3%ADn", target: "_blank", rel: "noopener" }, "este enlace"),
          " (ya viene con el permiso correcto, «public_repo»; solo debe elegir una fecha de vencimiento y presionar «Generate token»)."),
        h("li", {}, "Entra a esta misma dirección del panel y pega su token."));

      const actividad = h("div", { class: "act" }, h("p", { class: "empty" }, "Cargando…"));
      gh("/pulls?state=all&per_page=40").then((prs) => {
        const filas = prs.filter((p) => p.head.ref.startsWith("panel-")).slice(0, 15).map((p) => {
          const lab = p.labels.map((l) => l.name).find((n) => ESTADOS[n]);
          const [txt, cls] = lab ? ESTADOS[lab] : p.state === "open" ? ["En revisión", ""] : p.merged_at ? ESTADOS.publicado : ["Cerrado", ""];
          return h("a", { class: "act__row", href: p.html_url, target: "_blank", rel: "noopener" },
            h("span", { class: "act__date" }, new Date(p.created_at).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })),
            h("span", { class: "act__title" }, p.title),
            h("span", { class: "act__state" + (cls ? " is-" + cls : "") }, txt));
        });
        actividad.replaceChildren(...(filas.length ? filas : [h("p", { class: "empty" }, "Todavía no hay cambios enviados por funcionarios.")]));
      }).catch(() => actividad.replaceChildren(h("p", { class: "empty" }, "No se pudo cargar la actividad.")));

      return h("div", {},
        cuentasCorreo(),
        state.modo === "correo" ? h("p", { class: "panel__help" }, "El acceso con cuenta de GitHub y las cuentas de la app «Noticias UTP» se administran entrando con el token del dueño.") : [
        h("h2", { class: "sec-title" }, "Acceso con cuenta de GitHub"),
        h("div", { class: "panel" }, h("h2", {}, "Roles"), roles),
        h("h2", { class: "sec-title" }, "Funcionarios con GitHub"), lista,
        h("div", { class: "panel", style: "margin-top:1.5rem" }, h("h2", {}, "Cómo dar acceso a un funcionario con GitHub"), pasos),
        cuentasUtp(),
        h("div", { class: "panel" }, h("h2", {}, "Actividad reciente"),
          h("p", { class: "panel__help" }, "Cambios enviados por funcionarios. GitHub también te avisa por correo cuando un administrador trabajador publica algo o cuando un cambio espera tu aprobación."),
          actividad)]);
    },
  };

  /* ==========================================================
     Logo del colegio: se ajusta solo a un tamaño estándar antes de subirlo
     ========================================================== */
  const LOGO_ALTO = 256;   // alto máximo de la imagen guardada (se muestra a 52 px, nítida en pantallas de alta densidad)
  const LOGO_ANCHO = 640;  // ancho máximo, para logos horizontales
  // Favicon: rutas fijas, enlazadas en el <head> de todas las páginas
  const FAVICONS = [
    { ruta: "img/logo/favicon-32.png", lado: 32 },
    { ruta: "img/logo/favicon-192.png", lado: 192 },
    { ruta: "img/logo/apple-touch-icon.png", lado: 180, fondo: "#ffffff" }, // iOS no admite transparencia
  ];

  const cargarImagen = (file) => new Promise((ok, fail) => {
    const img = new Image();
    const u = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(u); ok(img); };
    img.onerror = () => { URL.revokeObjectURL(u); fail(new Error("No se pudo leer la imagen. Usa PNG, JPG, WEBP o SVG.")); };
    img.src = u;
  });
  const lienzo = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

  // Recorta los bordes transparentes, para que todos los logos ocupen el mismo espacio
  function recortar(c) {
    const { data, width: w, height: h } = c.getContext("2d").getImageData(0, 0, c.width, c.height);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return c;
    const out = lienzo(x1 - x0 + 1, y1 - y0 + 1);
    out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  }

  // Reduce a la mitad varias veces y luego al tamaño final: queda más nítido que un solo salto
  function escalar(c, w, h) {
    let src = c;
    while (src.width / 2 >= w && src.height / 2 >= h) {
      const mitad = lienzo(Math.round(src.width / 2), Math.round(src.height / 2));
      const g = mitad.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, mitad.width, mitad.height);
      src = mitad;
    }
    const out = lienzo(w, h);
    const g = out.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(src, 0, 0, w, h);
    return out;
  }

  async function procesarLogo(file) {
    const img = await cargarImagen(file);
    const w0 = img.naturalWidth || 1024, h0 = img.naturalHeight || 1024;
    const base = lienzo(w0, h0);
    base.getContext("2d").drawImage(img, 0, 0, w0, h0);
    const rec = recortar(base);
    const k = Math.min(1, LOGO_ALTO / rec.height, LOGO_ANCHO / rec.width);
    const grande = escalar(rec, Math.max(1, Math.round(rec.width * k)), Math.max(1, Math.round(rec.height * k)));
    // Ícono cuadrado, centrado y con un pequeño margen
    const lado = Math.max(rec.width, rec.height);
    const cuadrado = lienzo(Math.round(lado * 1.08), Math.round(lado * 1.08));
    cuadrado.getContext("2d").drawImage(rec, (cuadrado.width - rec.width) / 2, (cuadrado.height - rec.height) / 2);
    const blob = (c) => new Promise((ok) => c.toBlob(ok, "image/png"));
    const iconos = [];
    for (const f of FAVICONS) {
      let c = escalar(cuadrado, f.lado, f.lado);
      if (f.fondo) {
        const con = lienzo(f.lado, f.lado), g = con.getContext("2d");
        g.fillStyle = f.fondo; g.fillRect(0, 0, f.lado, f.lado);
        const m = Math.round(f.lado * 0.1);
        g.drawImage(escalar(cuadrado, f.lado - 2 * m, f.lado - 2 * m), m, m);
        c = con;
      }
      iconos.push({ ruta: f.ruta, blob: await blob(c), dataUrl: c.toDataURL("image/png") });
    }
    return { grande: await blob(grande), iconos, ancho: grande.width, alto: grande.height, original: [w0, h0] };
  }

  // Sube (o reemplaza) un archivo en una ruta fija
  async function subirFijo(ruta, blob, dataUrl) {
    const b64 = await new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(r.result.split(",")[1]); r.onerror = fail; r.readAsDataURL(blob); });
    await escribir(ruta, b64, "Actualizar favicon desde el panel");
    previews[ruta] = dataUrl;
  }
  async function borrarFavicons() {
    for (const f of FAVICONS) await escribir(f.ruta, null, "Quitar favicon desde el panel", { borrar: true });
  }

  // Reduce una imagen a un tamaño estándar (sin agrandarla) antes de subirla. PNG/WEBP conservan la transparencia.
  /* Las fotos se guardan en WebP: se ven igual y pesan cerca de un 30% menos. Un PNG queda en PNG (puede tener transparencia).
     «jpg» guarda en JPG: la portada de una noticia es la imagen que muestran WhatsApp y Facebook al compartirla.
     Si el navegador no sabe crear WebP, se guarda en JPG como antes. */
  async function ajustarImagen(file, max, formato = "webp") {
    const img = await cargarImagen(file);
    const k = Math.min(1, max / img.naturalWidth, max / img.naturalHeight);
    // Siempre se vuelve a dibujar: así la imagen pierde sus datos ocultos (ubicación GPS, teléfono, autor)
    if (/gif/.test(file.type)) return file;
    const base = lienzo(img.naturalWidth, img.naturalHeight);
    base.getContext("2d").drawImage(img, 0, 0);
    const c = escalar(base, Math.max(1, Math.round(img.naturalWidth * k)), Math.max(1, Math.round(img.naturalHeight * k)));
    const crear = (tipo) => new Promise((ok) => c.toBlob(ok, tipo, 0.86));
    let blob = await crear(/png/.test(file.type) ? "image/png" : formato === "jpg" ? "image/jpeg" : "image/webp");
    if (!["image/png", "image/jpeg", "image/webp"].includes(blob.type) || (blob.type === "image/png" && !/png/.test(file.type))) {
      blob = await crear(/webp/.test(file.type) ? "image/png" : "image/jpeg");
    }
    const nombre = file.name.replace(/\.[^.]+$/, "");
    // Un JPG que no hay que achicar (como las fotos de WhatsApp) se guarda tal cual, solo sin sus datos ocultos,
    // si así pesa menos: no se vuelve a comprimir y no pierde calidad
    if (k === 1 && file.type === "image/jpeg") {
      const sin = jpgSinDatos(new Uint8Array(await file.arrayBuffer()));
      if (sin && sin.length <= blob.size) return new File([sin], nombre + ".jpg", { type: "image/jpeg" });
    }
    const ext = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[blob.type];
    return new File([blob], nombre + ext, { type: blob.type });
  }
  // JPG sin EXIF/XMP/IPTC ni comentarios (ubicación GPS, modelo del teléfono, autor), sin tocar la imagen.
  // Conserva el perfil de color. Devuelve null si el JPG trae una rotación que se perdería al quitar el EXIF.
  function jpgSinDatos(b) {
    if (b[0] !== 0xFF || b[1] !== 0xD8) return null;
    const partes = [b.subarray(0, 2)];
    for (let i = 2; ;) {
      if (i + 4 > b.length || b[i] !== 0xFF) return null;
      const marca = b[i + 1];
      if (marca === 0xDA) { partes.push(b.subarray(i)); break; } // desde aquí viene la imagen misma
      const seg = b.subarray(i, i + 2 + ((b[i + 2] << 8) | b[i + 3]));
      if (marca === 0xE1 && orientacionExif(seg) > 1) return null;
      if (![0xE1, 0xEC, 0xED, 0xFE].includes(marca)) partes.push(seg);
      i += seg.length;
    }
    const out = new Uint8Array(partes.reduce((s, x) => s + x.length, 0));
    partes.reduce((o, x) => { out.set(x, o); return o + x.length; }, 0);
    return out;
  }
  function orientacionExif(seg) {
    if (String.fromCharCode(...seg.subarray(4, 8)) !== "Exif" || seg.length < 30) return 1;
    const t = 10, le = seg[t] === 0x49;
    const u16 = (o) => (le ? seg[o] | (seg[o + 1] << 8) : (seg[o] << 8) | seg[o + 1]);
    const u32 = (o) => (le ? (seg[o] | (seg[o + 1] << 8) | (seg[o + 2] << 16) | (seg[o + 3] << 24)) : ((seg[o] << 24) | (seg[o + 1] << 16) | (seg[o + 2] << 8) | seg[o + 3])) >>> 0;
    const ifd = t + u32(t + 4);
    if (ifd + 2 > seg.length) return 1;
    for (let k = 0, n = u16(ifd); k < n; k++) {
      const e = ifd + 2 + k * 12;
      if (e + 12 > seg.length) break;
      if (u16(e) === 0x0112) return u16(e + 8);
    }
    return 1;
  }

  /* ---------- Servidor del colegio (Cloudflare): estadísticas y mensajes de contacto ---------- */
  const servidorApp = () => {
    const u = String((state.data.app && state.data.app.servidor) || "").trim().replace(/\/+$/, "");
    return /^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(u) ? u : "";
  };
  const sinServidor = (que) => h("div", { class: "panel" }, h("p", { class: "panel__help" },
    `${que} usa el servidor de la app (Cloudflare). Falta configurarlo: el dueño pega su dirección en «Aviso urgente» → «App del colegio».`));
  const fechaCorta = (iso) => new Date(iso + "T12:00").toLocaleDateString("es-CL", { day: "numeric", month: "short" });
  const NOMBRES_PAGINA = { "/": "Inicio", "/app/": "App del colegio" };
  const nombrePagina = (p) => {
    if (NOMBRES_PAGINA[p]) return NOMBRES_PAGINA[p];
    const m = /^\/noticia\/([^/]+)\/$/.exec(p);
    if (m) { const n = state.data.noticias.find((x) => x.id === decodeURIComponent(m[1])); return "Noticia: " + (n ? n.titulo : decodeURIComponent(m[1])); }
    const pg = PAGINAS.find((x) => "/" + x.url === p);
    return pg ? pg.nombre : p;
  };

  let diasEstadisticas = 30;
  /* ---------- «Mi curso» (app): listas de estudiantes y profesores, cierre de año ----------
     Las listas no se guardan en el sitio (es público): van directo al servidor del colegio.
     Los cursos son los mismos de «Horarios». */
  const cursosDelColegio = () => (state.data.horarios.cursos || []).map((c) => c.nombre).filter(Boolean);
  // «8° Básico B», «8B», «8vo básico b», «I° medio», «1M»… → el nombre exacto del curso en Horarios
  const claveCurso = (s) => {
    let k = String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[°º]/g, "").replace(/\b(\d)\s*(ro|do|to|vo|no|mo|er)\b/g, "$1")
      .replace(/basico|basica/g, "b").replace(/medio|media/g, "m").replace(/[^a-z0-9]/g, "");
    k = k.replace(/^(iv|iii|ii|i)(?=m)/, (r) => ({ i: "1", ii: "2", iii: "3", iv: "4" }[r]));
    return k;
  };
  const buscarCurso = (s) => {
    const k = claveCurso(s), todos = cursosDelColegio();
    // «8B» = 8° básico B (si no hay un curso escrito exactamente así)
    const alt = /^\d[a-ln-z]$/.test(k) ? k[0] + "b" + k[1] : "";
    return todos.find((c) => claveCurso(c) === k) || (alt && todos.find((c) => claveCurso(c) === alt)) || "";
  };
  // Curso del año siguiente (null: egresa). «?»: no se encontró y hay que elegirlo a mano.
  const cursoSiguiente = (nombre) => {
    const m = /^(\d)\s*[°º]?\s*(b[aá]sico|medio)\s*(.*)$/i.exec(String(nombre || "").trim());
    if (!m) return "?";
    const n = +m[1], medio = /medio/i.test(m[2]), letra = m[3].trim();
    if (medio && n >= 4) return null;
    const [num, nivel] = !medio && n >= 8 ? [1, "medio"] : [n + 1, medio ? "medio" : "básico"];
    const todos = cursosDelColegio();
    const exacto = buscarCurso(`${num}° ${nivel} ${letra}`);
    if (exacto) return exacto;
    const mismos = todos.filter((c) => claveCurso(c).startsWith(num + nivel[0]));
    return mismos.length === 1 ? mismos[0] : "?";
  };

  async function leerExcelLista(file) {
    const XLSX = await cargarXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const filas = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "", blankrows: false });
    const iCab = filas.findIndex((f) => f.some((c) => /correo|e-?mail/i.test(c)));
    if (iCab < 0) throw new Error("No encontré la fila de títulos. La primera hoja debe tener columnas como en la plantilla (por ejemplo «Correo»).");
    const cab = filas[iCab].map((c) => String(c).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim());
    const col = (re) => cab.findIndex((c) => re.test(c));
    return { filas: filas.slice(iCab + 1).filter((f) => f.some((c) => String(c).trim())), col };
  }
  /* Gráficos nativos de Excel (editables) para un Excel hecho con SheetJS, que no los escribe: se agregan al zip
     el dibujo y un archivo por gráfico, enlazados a las celdas de la hoja. Cada gráfico:
     { tipo: "barra" | "columna" | "apilada" | "torta", titulo, cats: "A5:A10", series: [{ nombre: "B4", vals: "B5:B10", color }],
       formato: "0%", destacar: [{ idx, color }], desde: [col, fila], hasta: [col, fila] } (col y fila desde 0) */
  function agregarGraficosXlsx(XLSX, datos, nHoja, nombreHoja, graficos) {
    const z = XLSX.CFB.read(datos, { type: "array" });
    const enc = new TextEncoder(), dec = new TextDecoder();
    const leer = (ruta) => { const e = XLSX.CFB.find(z, ruta); return e ? dec.decode(e.content) : null; };
    const poner = (ruta, txt) => {
      const e = XLSX.CFB.find(z, ruta);
      if (e) e.content = enc.encode(txt); else XLSX.CFB.utils.cfb_add(z, ruta, enc.encode(txt));
    };
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const ref = (r) => `'${nombreHoja.replace(/'/g, "''")}'!` + r.split(":").map((x) => x.replace(/^([A-Z]+)(\d+)$/, "$$$1$$$2")).join(":");
    const relleno = (c) => `<c:spPr><a:solidFill><a:srgbClr val="${c}"/></a:solidFill></c:spPr>`;
    const texto = (sz, b) => `<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="${sz}"${b ? ' b="1"' : ""}/></a:pPr><a:endParaRPr lang="es-CL"/></a:p></c:txPr>`;
    const etiquetas = (g) => `<c:dLbls>${g.formato ? `<c:numFmt formatCode="${esc(g.formato)}" sourceLinked="0"/>` : ""}<c:spPr><a:noFill/><a:ln><a:noFill/></a:ln></c:spPr>${texto(900, true)}`
      + (g.tipo === "torta" ? '<c:dLblPos val="bestFit"/>' : g.tipo === "apilada" ? '<c:dLblPos val="ctr"/>' : '<c:dLblPos val="outEnd"/>')
      + `<c:showLegendKey val="0"/><c:showVal val="${g.tipo === "torta" ? 0 : 1}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${g.tipo === "torta" ? 1 : 0}"/><c:showBubbleSize val="0"/>${g.tipo === "torta" ? '<c:showLeaderLines val="1"/>' : ""}</c:dLbls>`;
    const serie = (g, s, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:strRef><c:f>${ref(s.nombre)}</c:f></c:strRef></c:tx>`
      + (g.tipo === "torta" ? "" : relleno(s.color)) + (g.tipo === "torta" ? "" : '<c:invertIfNegative val="0"/>')
      + (g.destacar || []).map((d) => `<c:dPt><c:idx val="${d.idx}"/>${g.tipo === "torta" ? '<c:bubble3D val="0"/>' : '<c:invertIfNegative val="0"/><c:bubble3D val="0"/>'}${relleno(d.color)}</c:dPt>`).join("")
      + etiquetas(g) + `<c:cat><c:strRef><c:f>${ref(g.cats)}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${ref(s.vals)}</c:f></c:numRef></c:val></c:ser>`;
    const ejes = (g) => {
      const h = g.tipo === "barra";
      return `<c:catAx><c:axId val="1001"/><c:scaling><c:orientation val="${h ? "maxMin" : "minMax"}"/></c:scaling><c:delete val="0"/><c:axPos val="${h ? "l" : "b"}"/><c:numFmt formatCode="General" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${texto(900)}<c:crossAx val="1002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>`
        + `<c:valAx><c:axId val="1002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="${h ? "t" : "l"}"/><c:majorGridlines><c:spPr><a:ln w="6350"><a:solidFill><a:srgbClr val="E5E1D6"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:numFmt formatCode="${esc(g.formato || "General")}" sourceLinked="0"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/>${texto(900)}<c:crossAx val="1001"/><c:crosses val="${h ? "max" : "autoZero"}"/><c:crossBetween val="between"/></c:valAx>`;
    };
    const grafico = (g) => {
      const cuerpo = g.tipo === "torta"
        ? `<c:pieChart><c:varyColors val="1"/>${g.series.map((s, i) => serie(g, s, i)).join("")}<c:firstSliceAng val="0"/></c:pieChart>`
        : `<c:barChart><c:barDir val="${g.tipo === "barra" ? "bar" : "col"}"/><c:grouping val="${g.tipo === "apilada" ? "stacked" : "clustered"}"/><c:varyColors val="0"/>${g.series.map((s, i) => serie(g, s, i)).join("")}<c:gapWidth val="60"/>${g.tipo === "apilada" ? '<c:overlap val="100"/>' : ""}<c:axId val="1001"/><c:axId val="1002"/></c:barChart>${ejes(g)}`;
      const leyenda = g.tipo === "torta" || g.series.length > 1;
      return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        + `<c:lang val="es-CL"/><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="es-CL" sz="1200" b="1"><a:solidFill><a:srgbClr val="3B0D18"/></a:solidFill></a:rPr><a:t>${esc(g.titulo)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>`
        + `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${cuerpo}</c:plotArea>${leyenda ? `<c:legend><c:legendPos val="b"/><c:overlay val="0"/>${texto(900)}</c:legend>` : ""}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart>`
        + '<c:spPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="E5E1D6"/></a:solidFill></a:ln></c:spPr></c:chartSpace>';
    };
    const ancla = (g, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${g.desde[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.desde[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${g.hasta[0]}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${g.hasta[1]}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>`
      + `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Gráfico ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>`
      + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${i + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`;
    graficos.forEach((g, i) => poner(`/xl/charts/chart${i + 1}.xml`, grafico(g)));
    poner("/xl/drawings/drawing1.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
      + graficos.map(ancla).join("") + "</xdr:wsDr>");
    const rel = (id, tipo, destino) => `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${tipo}" Target="${destino}"/>`;
    poner("/xl/drawings/_rels/drawing1.xml.rels", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
      + graficos.map((g, i) => rel(`rId${i + 1}`, "chart", `../charts/chart${i + 1}.xml`)).join("") + "</Relationships>");
    const rutaRels = `/xl/worksheets/_rels/sheet${nHoja}.xml.rels`, rels = leer(rutaRels);
    poner(rutaRels, rels ? rels.replace("</Relationships>", rel("rIdGraficos", "drawing", "../drawings/drawing1.xml") + "</Relationships>")
      : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rel("rIdGraficos", "drawing", "../drawings/drawing1.xml") + "</Relationships>");
    const rutaHoja = `/xl/worksheets/sheet${nHoja}.xml`;
    poner(rutaHoja, leer(rutaHoja).replace(/(<(tableParts|extLst)\b|<\/worksheet>)/, '<drawing r:id="rIdGraficos"/>$1'));
    const tipoCt = (parte, ct) => `<Override PartName="${parte}" ContentType="application/vnd.openxmlformats-officedocument.${ct}"/>`;
    poner("/[Content_Types].xml", leer("/[Content_Types].xml").replace("</Types>", tipoCt("/xl/drawings/drawing1.xml", "drawing+xml")
      + graficos.map((g, i) => tipoCt(`/xl/charts/chart${i + 1}.xml`, "drawingml.chart+xml")).join("") + "</Types>"));
    return XLSX.CFB.write(z, { fileType: "zip", type: "array" });
  }
  async function bajarExcel(nombre, hojas, graficos) {
    const XLSX = await cargarXLSX();
    const wb = XLSX.utils.book_new();
    hojas.forEach(([titulo, aoa, anchos]) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = anchos.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, titulo);
    });
    if (!graficos || !graficos.lista.length) return XLSX.writeFile(wb, nombre);
    const datos = agregarGraficosXlsx(XLSX, new Uint8Array(XLSX.write(wb, { type: "array", bookType: "xlsx" })),
      hojas.findIndex((x) => x[0] === graficos.hoja) + 1, graficos.hoja, graficos.lista);
    descargar([new File([new Uint8Array(datos)], nombre, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })]);
  }

  VISTAS.micurso = {
    titulo: "Mi curso (app)",
    ayuda: "Calendario de cada curso en la app, solo para su comunidad. Apoderados y estudiantes entran con el RUT o el correo institucional del estudiante (reciben un código en ese correo); los profesores entran con su correo y contraseña y publican fechas de sus cursos. Estas listas no se publican en el sitio: quedan solo en el servidor del colegio.",
    render: () => {
      const s = servidorApp();
      if (!s) return sinServidor("«Mi curso»");
      const caja = h("div", {}, h("p", { class: "panel__help" }, "Cargando…"));
      const pedir = (ruta, cuerpo) => fetch(s + ruta, { method: cuerpo ? "POST" : "GET", cache: "no-store",
        headers: { ...credencial(), ...(cuerpo ? { "Content-Type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || (r.status === 404 ? "El servidor aún no tiene esta función: vuelve a pegar servidor/notificaciones.js en Cloudflare." : "Error " + r.status)); return j; });
      const cursos = cursosDelColegio();
      let j = null, filtro = "", cierre = null;

      const elegirArchivo = (fn) => { const i = h("input", { type: "file", accept: ".xlsx,.xls,.csv", onchange: () => { if (i.files[0]) fn(i.files[0]); } }); i.click(); };
      const subirEstudiantes = (modo) => elegirArchivo(async (file) => {
        try {
          const { filas, col } = await leerExcelLista(file);
          const cR = col(/^rut/), cN = col(/nombre/), cC = col(/curso/), cE = col(/correo|e-?mail/);
          if (cR < 0 || cC < 0) throw new Error("Faltan las columnas «RUT» o «Curso». Usa la plantilla.");
          const malos = [];
          const lista = filas.map((f, i) => {
            const curso = buscarCurso(f[cC]);
            if (!curso) malos.push(`fila ${i + 2}: «${f[cC]}»`);
            return { rut: f[cR], nombre: cN >= 0 ? f[cN] : "", curso, correo: f[cE] };
          });
          if (malos.length) throw new Error("Estos cursos no coinciden con los de «Horarios»: " + malos.slice(0, 6).join(", ") + (malos.length > 6 ? "…" : ""));
          if (modo === "reemplazar" && !confirm(`¿Reemplazar la lista completa por estos ${lista.length} estudiantes? Quienes no estén en el archivo dejarán de tener acceso.`)) return;
          const r = await pedir("/curso/estudiantes", { lista, cursos, modo });
          toast(`Lista guardada: ${r.total} estudiantes ${modo === "agregar" ? "agregados o actualizados" : "en total"}.`, "ok");
          cargar();
        } catch (e) { toast(e.message, "error"); }
      });
      const subirProfes = () => elegirArchivo(async (file) => {
        try {
          const { filas, col } = await leerExcelLista(file);
          const cN = col(/nombre/), cE = col(/correo|e-?mail/), cC = col(/curso/);
          if (cC < 0) throw new Error("Falta la columna «Cursos». Usa la plantilla.");
          const malos = [];
          const lista = filas.map((f) => {
            const txt = String(f[cC] || "").trim();
            const cs = /^todos?$/i.test(txt) ? cursos : txt.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).map((x) => { const c = buscarCurso(x); if (!c) malos.push(x); return c; });
            return { nombre: cN >= 0 ? f[cN] : "", correo: f[cE], cursos: cs.filter(Boolean) };
          });
          if (malos.length) throw new Error("Estos cursos no coinciden con los de «Horarios»: " + [...new Set(malos)].slice(0, 6).join(", "));
          if (!confirm(`¿Guardar estos ${lista.length} profesores? Quienes no estén en el archivo dejarán de tener acceso. Los que siguen conservan su contraseña.`)) return;
          const r = await pedir("/curso/profesores", { lista, cursos });
          toast(`Lista guardada: ${r.total} profesores.`, "ok");
          cargar();
        } catch (e) { toast(e.message, "error"); }
      });
      const plantillaEst = () => bajarExcel("plantilla-estudiantes.xlsx", [["Estudiantes", [["RUT", "Nombre", "Curso", "Correo"],
        ["12.345.678-5", "Nombre Apellido Apellido", cursos[0] || "1° básico A", "nombre.apellido@colegiosm.cl"]], [14, 34, 16, 34]],
        ["Cursos válidos", [["Cursos (escríbelos así)"]].concat(cursos.map((c) => [c])), [24]]]);
      const plantillaProf = () => bajarExcel("plantilla-profesores.xlsx", [["Profesores", [["Nombre", "Correo", "Cursos"],
        ["Nombre Apellido", "nombre.apellido@colegiosm.cl", cursos.slice(0, 2).join(", ") || "1° básico A, 1° básico B"],
        ["Otra Profesora", "otra.profesora@colegiosm.cl", "todos"]], [28, 34, 50]],
        ["Cursos válidos", [["Cursos (sepáralos con coma, o escribe «todos»)"]].concat(cursos.map((c) => [c])), [44]]]);

      const pintarCierre = () => {
        const est = j.estudiantes;
        const opciones = (sel) => [h("option", { value: "", selected: sel === "" }, "No sigue / egresa")].concat(cursos.map((c) => h("option", { value: c, selected: sel === c }, c)));
        const grupos = {};
        est.forEach((e) => (grupos[e.curso] = grupos[e.curso] || []).push(e));
        const resumen = h("p", { class: "panel__help" });
        const contar = () => {
          const v = Object.values(cierre);
          resumen.textContent = `${v.filter((x) => x.tipo === "pasa").length} pasan de curso · ${v.filter((x) => x.tipo === "repite").length} repiten · ${v.filter((x) => x.tipo === "sale").length} salen de la lista (egresan o no siguen)` +
            (v.some((x) => x.tipo === "?") ? ` · ${v.filter((x) => x.tipo === "?").length} sin curso definido: elígelo a mano` : "");
        };
        const tipoDe = (e, nuevo) => (nuevo === "?" ? "?" : !nuevo ? "sale" : nuevo === e.curso ? "repite" : "pasa");
        const borrar = h("input", { type: "checkbox", checked: true });
        const bloques = Object.keys(grupos).sort((a, b) => cursos.indexOf(a) - cursos.indexOf(b)).map((curso) => {
          const sig = cursoSiguiente(curso);
          return h("details", { class: "cierre__curso", open: sig === "?" },
            h("summary", {}, h("strong", {}, curso), ` → ${sig === null ? "egresan" : sig === "?" ? "elegir a mano" : sig} · ${grupos[curso].length} estudiantes`),
            h("div", { class: "cierre__lista" }, grupos[curso].map((e) => {
              const sel = h("select", { onchange: () => { cierre[e.rut] = { curso: sel.value, tipo: tipoDe(e, sel.value) }; contar(); } }, opciones(cierre[e.rut].curso === "?" ? "" : cierre[e.rut].curso));
              if (cierre[e.rut].curso === "?") sel.prepend(h("option", { value: "?", selected: true, disabled: true }, "Elegir…"));
              return h("label", { class: "cierre__fila" }, h("span", {}, e.nombre || e.rut), sel);
            })));
        });
        contar();
        return h("div", { class: "panel" }, h("h2", {}, "Cierre de año: paso de curso"),
          h("p", { class: "panel__help" }, "Cada estudiante pasa al curso siguiente (8° básico → 1° medio; 4° medio egresa). Abre un curso y cambia a quienes repiten (elige su mismo curso) o no siguen en el colegio. Después, sube a los estudiantes nuevos con «Agregar o actualizar estudiantes»."),
          resumen, ...bloques,
          h("label", { class: "check cierre__borrar" }, borrar, " Borrar las fechas que publicaron los profesores este año"),
          h("div", { class: "cierre__acc" },
            h("button", { type: "button", class: "btn btn--primary", onclick: async () => {
              const v = Object.entries(cierre);
              if (v.some(([, x]) => x.tipo === "?")) return toast("Falta elegir el curso de algunos estudiantes (los cursos abiertos).", "error");
              if (!confirm(`¿Aplicar el cierre de año?\n\n${resumen.textContent}\n\nNo se puede deshacer (puedes volver a subir la lista desde Excel).`)) return;
              try {
                const r = await pedir("/curso/anio", { cursos, borrarFechas: borrar.checked, cambios: v.map(([rut, x]) => ({ rut, curso: x.curso })) });
                toast(`Listo. Quedan ${r.estudiantes} estudiantes en la lista.`, "ok");
                cierre = null; cargar();
              } catch (e) { toast(e.message, "error"); }
            } }, "Aplicar cierre de año"),
            h("button", { type: "button", class: "btn btn--ghost", onclick: () => { cierre = null; pintar(); } }, "Cancelar")));
      };

      // Calendario de un curso: las fechas que publicaron sus profesores
      let cursoVer = "";
      const fechasCurso = h("div", { class: "mc-cal" });
      const verCurso = async (c) => {
        cursoVer = c;
        if (!c) return fechasCurso.replaceChildren();
        fechasCurso.replaceChildren(h("p", { class: "panel__help" }, "Cargando…"));
        try {
          const r = await pedir("/curso/calendario", { curso: c });
          const TIPOS = { prueba: "Prueba", trabajo: "Trabajo o entrega", salida: "Salida", reunion: "Reunión", actividad: "Actividad", otro: "Otro" };
          const dia = (f) => new Date(f + "T12:00").toLocaleDateString("es-CL", { weekday: "short", day: "numeric", month: "short" });
          fechasCurso.replaceChildren(...(r.fechas.length ? r.fechas.map((f) => h("div", { class: "cuentas__fila" + (f.fecha < r.hoy && (f.fin || f.fecha) < r.hoy ? " is-pasada" : "") },
            h("div", {}, h("strong", {}, f.titulo), h("small", {}, [dia(f.fecha) + (f.fin ? " al " + dia(f.fin) : ""), f.hora, TIPOS[f.tipo] || "", f.autor ? "publicó " + f.autor : ""].filter(Boolean).join(" · ")),
              f.descripcion ? h("small", {}, f.descripcion) : ""))) : [h("p", { class: "panel__help" }, "Este curso aún no tiene fechas publicadas.")]));
        } catch (e) { fechasCurso.replaceChildren(h("p", { class: "panel__help" }, e.message)); }
      };

      // Profesores a mano (sin Excel): se guarda la lista completa; quienes siguen conservan su contraseña
      let profeEditado = null;
      const guardarProfes = async (lista, ok) => {
        if (!lista.length) throw new Error("Debe quedar al menos un profesor en la lista.");
        await pedir("/curso/profesores", { lista: lista.map((p) => ({ nombre: p.nombre, correo: p.correo, cursos: p.cursos })), cursos });
        profeEditado = null;
        toast(ok, "ok");
        cargar();
      };
      const quitarProfe = async (p) => {
        if (!confirm(`¿Quitar a ${p.nombre || p.correo}? Dejará de entrar a «Mi curso» y sus fechas publicadas se mantienen.`)) return;
        try { await guardarProfes(j.profesores.filter((x) => x.correo !== p.correo), "Profesor quitado."); } catch (e) { toast(e.message, "error"); }
      };
      const formProfe = () => {
        const f = profeEditado;
        const nombre = h("input", { type: "text", value: f.nombre, placeholder: "Nombre y apellido", maxlength: 120 });
        const correo = h("input", { type: "email", value: f.correo, placeholder: "nombre.apellido@colegiosm.cl" });
        const cajas = cursos.map((c) => ({ c, input: h("input", { type: "checkbox", checked: f.cursos.includes(c) }) }));
        const guardarBtn = h("button", { type: "button", class: "btn btn--primary btn--sm" }, f.antes ? "Guardar cambios" : "Agregar profesor");
        guardarBtn.onclick = async () => {
          const c = correo.value.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) { toast("Escribe el correo institucional del profesor.", "error"); correo.focus(); return; }
          if (j.profesores.some((x) => x.correo === c && x.correo !== f.antes)) { toast("Ese correo ya está en la lista.", "error"); return; }
          const nuevo = { nombre: nombre.value.trim(), correo: c, cursos: cajas.filter((x) => x.input.checked).map((x) => x.c) };
          const lista = f.antes ? j.profesores.map((x) => (x.correo === f.antes ? nuevo : x)) : j.profesores.concat(nuevo);
          guardarBtn.disabled = true;
          try { await guardarProfes(lista, f.antes ? "Cambios guardados." : `Listo. ${nuevo.nombre || c} ya puede entrar a «Mi curso» con su correo (la primera vez recibe un código).`); }
          catch (e) { toast(e.message, "error"); guardarBtn.disabled = false; }
        };
        return h("div", { class: "mc-prof__form" },
          h("div", { class: "mc-prof__campos" }, h("label", {}, "Nombre", nombre), h("label", {}, "Correo institucional", correo)),
          h("p", { class: "mc-prof__titulo" }, "Cursos ",
            h("button", { type: "button", class: "btn-link", onclick: () => cajas.forEach((x) => { x.input.checked = true; }) }, "marcar todos"), " · ",
            h("button", { type: "button", class: "btn-link", onclick: () => cajas.forEach((x) => { x.input.checked = false; }) }, "ninguno")),
          h("div", { class: "checks" }, cajas.map(({ c, input }) => h("label", { class: "check" }, input, " ", c))),
          h("div", { class: "mc-acc" }, guardarBtn, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { profeEditado = null; pintar(); } }, "Cancelar")));
      };
      const pintar = () => {
        const est = j.estudiantes, pro = j.profesores;
        // Las cuentas con «Ver los cursos» solo miran; las listas las cambia quien tiene «Listas de Mi curso»
        const edita = state.modo !== "correo" || tienePermiso("listas");
        const porCurso = {};
        est.forEach((e) => { porCurso[e.curso] = (porCurso[e.curso] || 0) + 1; });
        const fechas = Object.fromEntries(j.fechas.map((f) => [f.curso, f.n]));
        const correo = j.correo ? null : h("div", { class: "panel est__aviso" }, h("strong", {}, "Falta activar el envío de correos. "),
          "Sin él no llegan los códigos para entrar. Sigue la sección «Mi curso» de servidor/GUIA.md: el mismo script de Google del formulario de Contacto envía los códigos.");
        const buscar = h("input", { type: "search", class: "mc-buscar", placeholder: "Buscar por nombre, RUT o correo", value: filtro, oninput: (e) => { filtro = e.target.value; pintarLista(); } });
        const listaEst = h("div", { class: "mc-lista" });
        const pintarLista = () => {
          const q = filtro.trim().toLowerCase();
          const ver = q ? est.filter((e) => [e.nombre, e.rut, e.correo, e.curso, e.apoderado].join(" ").toLowerCase().includes(q)).slice(0, 60) : [];
          listaEst.replaceChildren(...(q ? (ver.length ? ver.map((e) => {
            const zona = h("div", {});
            // Código del colegio: para el apoderado que no tiene acceso al correo institucional del estudiante
            const darCodigo = async () => {
              if (e.apoderado && !confirm(`${e.nombre || e.rut} ya tiene un apoderado registrado (${e.apoderado}). Con el código nuevo, quien lo use reemplaza ese correo. ¿Seguir?`)) return;
              try {
                const r = await pedir("/curso/codigo-apoderado", { rut: e.rut });
                const texto = `Código para registrarse como apoderado de ${r.nombre} (${r.curso}) en la app del Colegio San Martín: ${r.codigo}\nAbre colegiosm.cl/app → Mi curso → Soy apoderado → Registrarme → «tengo un código del colegio». Sirve una vez y vence el ${new Date(r.vence).toLocaleDateString("es-CL")}.`;
                zona.replaceChildren(h("div", { class: "mc-codigo" },
                  h("p", {}, "Código para el apoderado de ", h("b", {}, r.nombre), ":"), h("strong", { class: "mc-codigo__num" }, r.codigo),
                  h("p", { class: "panel__help" }, `Entrégaselo en persona. Se ve solo ahora (si lo pierdes, genera otro). Sirve una vez y vence en 30 días.`),
                  h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => copiar(texto, "Copiado con las instrucciones.") }, "Copiar con instrucciones")));
              } catch (err) { toast(err.message, "error"); }
            };
            return h("div", { class: "cuentas__fila mc-est" },
              h("div", {}, h("strong", {}, e.nombre || e.rut), h("small", {}, `${e.curso} · ${e.rut} · ${e.correo}`),
                h("small", { class: "mc-est__apo" + (e.apoderado ? " is-ok" : "") }, e.apoderado ? `Apoderado: ${e.apoderado}` : e.codigo ? "Apoderado: código del colegio entregado, aún sin usar" : "Sin apoderado registrado"), zona),
              h("div", { class: "cuentas__acc" },
                h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: darCodigo }, "Código para apoderado"),
                e.apoderado ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: async () => {
                  if (!confirm(`¿Quitar a ${e.apoderado} como apoderado de ${e.nombre || e.rut}? Dejará de ver su curso en la app.`)) return;
                  try { await pedir("/curso/apoderado/quitar", { rut: e.rut }); toast("Apoderado quitado.", "ok"); cargar(); } catch (err) { toast(err.message, "error"); }
                } }, "Quitar apoderado") : "",
                edita ? h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: async () => {
                  if (!confirm(`¿Quitar a ${e.nombre || e.rut} de la lista? Perderá el acceso a «Mi curso».`)) return;
                  try { await pedir("/curso/estudiante/borrar", { rut: e.rut }); toast("Quitado de la lista.", "ok"); cargar(); } catch (err) { toast(err.message, "error"); }
                } }, "Quitar") : ""));
          }) : [h("p", { class: "panel__help" }, "Sin resultados.")]) : []));
        };
        pintarLista();
        const selCurso = h("select", { onchange: () => verCurso(selCurso.value) },
          h("option", { value: "" }, "Elige un curso…"), cursos.map((c) => h("option", { value: c, selected: c === cursoVer }, c + (fechas[c] ? ` (${fechas[c]})` : ""))));
        caja.replaceChildren(edita ? correo || "" : "",
          h("div", { class: "panel" }, h("h2", {}, "Calendario de cada curso"),
            h("p", { class: "panel__help" }, "Las pruebas, entregas, salidas y reuniones que publicaron los profesores en la app."),
            h("label", { class: "mc-elegir" }, "Curso ", selCurso), fechasCurso),
          h("div", { class: "panel" }, h("h2", {}, `Estudiantes (${est.length})`, est.length ? h("small", { class: "mc-apos" }, ` · ${est.filter((e) => e.apoderado).length} con apoderado registrado`) : ""),
            est.length ? h("p", { class: "panel__help" }, "Los apoderados se registran en la app con su propio correo, usando el correo institucional del estudiante. Si no tienen acceso a ese correo, busca al estudiante aquí y toca «Código para apoderado».") : "",
            edita ? h("p", { class: "panel__help" }, "Columnas: RUT, Nombre, Curso y Correo institucional. Los cursos deben ser los de «Horarios».") : "",
            h("div", { class: "mc-cursos" }, cursos.map((c) => h("span", { class: "mc-cursos__item" + (porCurso[c] ? "" : " is-vacio") }, h("strong", {}, c), ` ${porCurso[c] || 0}`, fechas[c] ? h("small", {}, ` · ${fechas[c]} fechas`) : ""))),
            !edita ? "" : h("div", { class: "mc-acc" },
              h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => subirEstudiantes("reemplazar") }, est.length ? "Reemplazar toda la lista (Excel)" : "Subir lista (Excel)"),
              est.length ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => subirEstudiantes("agregar") }, "Agregar o actualizar estudiantes (Excel)") : "",
              h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: plantillaEst }, "Descargar plantilla"),
              est.length ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => bajarExcel("estudiantes-mi-curso.xlsx", [["Estudiantes", [["RUT", "Nombre", "Curso", "Correo"]].concat(est.map((e) => [e.rut, e.nombre, e.curso, e.correo])), [14, 34, 16, 34]]]) }, "Descargar lista actual") : ""),
            est.length ? buscar : "", listaEst),
          h("div", { class: "panel" }, h("h2", {}, `Profesores (${pro.length})`),
            edita ? h("p", { class: "panel__help" }, "Agrégalos y edita sus cursos aquí mismo, o sube la lista en Excel (columnas: Nombre, Correo institucional y Cursos separados por coma, o «todos»). La primera vez entran con un código que llega a su correo y crean su contraseña.") : "",
            edita && profeEditado && profeEditado.antes === "" ? formProfe() : "",
            pro.length ? h("div", { class: "cuentas" }, pro.map((p) => edita && profeEditado && profeEditado.antes === p.correo ? formProfe() : h("div", { class: "cuentas__fila" },
              h("div", {}, h("strong", {}, p.nombre || p.correo), h("small", {}, `${p.correo} · ${p.cursos.join(", ") || "sin cursos"}`)),
              h("div", { class: "mc-prof__der" },
                h("span", { class: "mc-estado" + (p.activo ? " is-ok" : "") }, p.activo ? "Ya entró" : "Aún no entra"),
                edita ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { profeEditado = { antes: p.correo, nombre: p.nombre || "", correo: p.correo, cursos: p.cursos.slice() }; pintar(); } }, "Editar") : "",
                edita ? h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: () => quitarProfe(p) }, "Quitar") : "")))) : "",
            !edita ? "" : h("div", { class: "mc-acc" },
              h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: () => { profeEditado = { antes: "", nombre: "", correo: "", cursos: [] }; pintar(); } }, "+ Agregar profesor"),
              h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: subirProfes }, pro.length ? "Actualizar lista (Excel)" : "Subir lista (Excel)"),
              h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: plantillaProf }, "Descargar plantilla"))),
          !edita ? "" : cierre ? pintarCierre() : h("div", { class: "panel" }, h("h2", {}, "Cierre de año"),
            h("p", { class: "panel__help" }, "Al terminar el año: pasa a todos al curso siguiente, deja en su curso a quienes repiten y quita a quienes egresan o no siguen. Primero verás el detalle para revisarlo."),
            h("button", { type: "button", class: "btn btn--ghost", disabled: !est.length, onclick: () => {
              cierre = Object.fromEntries(est.map((e) => { const sig = cursoSiguiente(e.curso); return [e.rut, { curso: sig === null ? "" : sig, tipo: sig === null ? "sale" : sig === "?" ? "?" : "pasa" }]; }));
              pintar();
            } }, "Preparar paso de curso")));
      };
      const cargar = () => pedir("/curso/listas").then((r) => { j = r; pintar(); })
        .catch((e) => caja.replaceChildren(h("div", { class: "panel" }, h("p", { class: "panel__help" }, e.message === "Failed to fetch" ? "No se pudo conectar con el servidor." : e.message))));
      cargar();
      return caja;
    },
  };

  // Registro de KPI: el servidor anota cada cambio del sitio (quién, cuándo y qué) y aquí se arma el Excel
  // con las mismas columnas de la planilla de KPI. Solo lo descarga el dueño, entrando con el token.
  const CATEGORIA_KPI = { comunidad: "Comunidad", pedagogia: "Pedagogía", comunicado: "Comunicado", convivencia: "Convivencia", admision: "Admisión" };
  const CLASE_KPI = { Noticia: "Noticia en el sitio", Comunicado: "Comunicado", Flyer: "Flyer" };
  const TIPOS_CONTENIDO = ["Contenido", "Publicación", "Publicación editada", "Publicación borrada", "Aviso urgente editado"];
  // Prompt para pegar en una IA junto con el Excel: deja el Excel limpio y arma el informe en Word
  const PROMPT_KPI = `Te adjunto el registro de KPI del sitio web y las redes del Colegio San Martín de Iquique (colegio particular subvencionado con SEP, básica y media). Lo descargué del panel del sitio colegiosm.cl. Necesito que me devuelvas DOS archivos para descargar: un Excel limpio con gráficos y un informe en Word con gráficos y tablas.

REGLAS
- Usa solo los datos del Excel y lo que yo te escriba en este chat. No inventes cifras, fechas, minutos ni resultados. Si estimas algo (por ejemplo cómo cerraría el mes), dilo con la palabra «estimación».
- Si un dato falta (por ejemplo «Planificada», «Minutos» o «Nota de apoyo» vacíos), escribe «por completar» y anótalo en una lista al final del informe.
- No incluyas nombres de personas ni correos, ni siquiera los que aparezcan en títulos de noticias. Escribe «[Nombre]» y «[Cargo]» donde vaya la firma; quienes publicaron se nombran por su cargo.
- Los avisos urgentes de prueba no se cuentan como avisos reales.
- Si el Excel cubre más de un mes, haz el informe del mes más reciente y compáralo con el anterior.
- Español de Chile, tono profesional y claro, sin tecnicismos (lo leen la dirección y la sostenedora).

HOJAS DEL EXCEL
- «Indicadores»: los KPI del mes ya calculados por el panel y las tablas que alimentan sus gráficos. Úsalos como base y verifícalos con las otras hojas.
- «Antes del sitio nuevo»: cómo era el sitio anterior y qué hay ahora (solo para el primer informe).
- «Cambios en el panel»: un día por fila con lo que se guardó en el panel y las apps.
- «Publicaciones»: noticias, comunicados y flyers publicados en el sitio, con enlace y visitas.
- «Mejoras del sitio»: funciones nuevas o arreglos del sitio, el panel, la app o el servidor.
- «Visitas»: visitas diarias al sitio, desde celular y computador.
- «Registro completo»: cada cambio con hora. Úsalo para contar y verificar, no lo copies.

METAS MENSUALES
- Noticias de actividades en el sitio: 4
- Comunicados y flyers publicados: 4
- Publicaciones hechas por otros funcionarios desde el panel: 2
- Visitas al sitio: 1.000
- Días con cambios guardados en el panel: 10
- Mejoras implementadas en el sitio, panel o app: 4
- Avisos urgentes publicados: informativo, sin meta

ESTILO VISUAL (para los dos archivos)
- Colores del colegio: burdeo #7A1F35 (principal), dorado #C9A24B (destacado) y gris #8C8C8C (secundario). Verde #1E6B3A para «Sí» y rojo #B3261E para «No».
- Todo gráfico lleva título, ejes con nombre, el valor encima de cada barra o porción y, debajo, «Fuente: registro del panel, corte al dd-mm-aaaa».
- Tablas con encabezado burdeo y texto blanco, filas alternadas en gris muy claro y números alineados a la derecha.

ARCHIVO 1: EXCEL LIMPIO (.xlsx)
1. Hoja «Resumen del mes»: tabla KPI | Resultado | Meta | % de la meta | ¿Cumple? | Comentario breve. «¿Cumple?» con fondo verde o rojo. Al final: «KPI cumplidos: X de Y» y el % de visitas desde celular.
2. Hoja «Gráficos» con gráficos nativos de Excel (editables, vinculados a las celdas, no imágenes):
   - Barras horizontales: % de la meta alcanzado por cada KPI.
   - Columnas apiladas: visitas por día, celular y computador.
   - Torta: visitas desde celular y desde computador.
   - Columnas: publicaciones por tipo y por categoría.
   - Columnas: noticias publicadas por mes (tabla de la hoja «Indicadores»).
3. Hoja «Publicaciones»: Fecha, Tipo, Tema, Categoría, Publicada por (cargo), Visitas, Enlace. Sin columnas vacías.
4. Hoja «Mejoras»: Fecha, Mejora (en lenguaje simple para un apoderado), Tema, Para quién. Agrupa los arreglos menores del mismo día en una sola fila.
5. Hoja «Visitas»: totales por semana, % celular y las 5 publicaciones más vistas.
Fechas dd-mm-aaaa, encabezados en negrita, filtros activos, paneles inmovilizados en la fila de títulos, columnas ajustadas al texto. Sin el registro técnico ni los archivos subidos.

ARCHIVO 2: INFORME EN WORD (.docx)
Título: «Informe de gestión del sitio web y comunicación digital – [mes y año]». Tamaño carta, letra Arial 11, encabezado con el nombre del colegio y número de página en el pie. Máximo 5 páginas de cuerpo, más los anexos. Que se pueda entender en 2 minutos: cada sección parte con 1 o 2 párrafos cortos y sigue con su tabla o gráfico. Usa viñetas solo para listas cortas (3 a 5 elementos), nunca como formato principal.
Gráficos insertados como imagen nítida (al menos 150 ppp), a todo el ancho o de a dos lado a lado.
0. Cifras del mes, bajo el título: una fila de 4 tarjetas (tabla de 4 celdas con fondo burdeo claro) con visitas del mes, publicaciones, mejoras y KPI cumplidos, cada una con su número grande y una línea de contexto.
1. Resumen ejecutivo (5 líneas): qué se hizo, el resultado principal y el impacto en la comunidad.
2. Resultados del mes: gráfico de barras con el % de la meta de cada KPI (línea marcada en 100 %) y la tabla KPI | Resultado | Meta | ¿Cumple? | Lectura, con «¿Cumple?» en verde o rojo. Después, una tabla corta de las metas no cumplidas: KPI | Causa | Acción.
3. Visitas: gráfico de columnas apiladas por día (celular y computador) junto a una torta con el % de cada equipo, y un párrafo con el día de más visitas y qué se publicó ese día.
4. Lo que se entregó: gráfico de publicaciones por tipo y categoría; tabla de las 5 publicaciones más vistas (Fecha | Publicación | Visitas | Enlace); tabla de mejoras por tema (Tema | Qué se hizo | Para quién) con un gráfico de barras de la cantidad de mejoras por tema (comunicación con apoderados, seguridad y emergencias, gestión interna, app y redes).
5. Tiempo invertido: tabla con los minutos por tipo de tarea si hay datos; si no, «por completar».
6. Aporte al Proyecto Educativo y al PME: tabla Dimensión del PME | Función o evidencia | Indicador que se puede medir | Acción sugerida para el PME. Usa las dimensiones Gestión pedagógica, Liderazgo, Formación y convivencia y Gestión de recursos. Vincula solo lo que mejora la educación: comunicación con las familias, participación, información oportuna, convivencia, seguridad y emergencias, uso de datos para la gestión. No presentes como acción PME la publicidad ni la captación de matrícula (la SEP no la financia).
7. Próximo mes: tabla Meta | Indicador | Valor actual | Valor esperado (3 a 5 metas).
8. Datos por completar: tabla corta Dato | Para qué sirve.

SOLO EN EL PRIMER INFORME (octubre de 2026)
Justo después del resumen ejecutivo, agrega la sección «Antes y después del nuevo sitio» con la hoja «Antes del sitio nuevo» del Excel:
- Gráfico de columnas de noticias publicadas por mes (marzo a octubre de 2026), con octubre destacado en dorado, y un gráfico de torta o barras de qué contaban las noticias antes (comunicados, suspensiones, actividades) y ahora.
- Tabla Aspecto | Antes | Ahora | Qué gana la comunidad, con todas las filas de la hoja, más una fila con los resultados de octubre (visitas, publicaciones, mejoras).
- Un párrafo que muestre el salto: de un sitio de plantilla que solo publicaba noticias, a una plataforma propia de comunicación del colegio con app, avisos al celular, horarios, calendario, panel para cada funcionario y datos medibles. Que se entienda que es un cambio de fondo en cómo el colegio se comunica con las familias y cómo se presenta ante Iquique.
- Compara herramientas y resultados, nunca personas: no nombres ni critiques a quien administraba el sitio anterior.
- Úsalo también como línea base del PME (diagnóstico inicial) y como argumento principal del anexo de reconocimiento.
En los informes de los meses siguientes NO incluyas esta sección: compara con el mes anterior con un gráfico de columnas «mes anterior / este mes» para cada KPI.
Firma: «[Nombre] – [Cargo]».

ANEXOS (después de la firma, cada uno en página nueva)
- «Anexo 1: gráficos de detalle»: visitas por semana, publicaciones por día del mes y cambios guardados en el panel por día, cada uno con 2 líneas de lectura.
- «Anexo 2: cierre para conversación de reconocimiento» (sepáralo, porque NO va en el documento que se presenta para el PME). En media página, con una tabla de 3 a 4 cifras que respalden el argumento, explica que esta función es una responsabilidad adicional a la docencia, con resultados medibles y mejora continua mes a mes, y que justifica una asignación por función en un anexo de contrato. Tono respetuoso y basado en evidencia, sin exagerar.

Al final del chat, en 3 líneas, dime qué datos debería completar yo para que el próximo informe sea más sólido.`;
  // Línea base para el primer informe: cómo era el sitio anterior (copia guardada en octubre de 2026) y qué hay ahora
  const ANTES_KPI = [
    ["Plataforma", "Sitio de plantilla en una plataforma externa (colegiosanmartin.webescuela.cl), con enlaces de Mineduc y de Twitter en la portada.", "Sitio propio en colegiosm.cl, con los colores y el escudo del colegio, pensado primero para el celular."],
    ["Flujo de noticias", "2025: 11 noticias en todo el año (menos de 1 al mes). 2026, del 05-03 al 20-09: 41 noticias, unas 6 al mes (marzo 7, abril 7, mayo 3, junio 6, julio 4, agosto 11 por las suspensiones, septiembre 3). Ninguna desde el 21-09 hasta el estreno del sitio nuevo.", "12 noticias entre el 09-10 y el 24-10; 11 de ellas en los primeros 9 días del sitio nuevo (16 al 24-10), con noticias en 6 de esos 9 días. En dos semanas, más que cualquier mes completo de 2026 salvo agosto."],
    ["Qué se contaba", "De las 41 noticias de 2026: 25 comunicados o circulares, 12 suspensiones o cambios de jornada y solo 4 sobre actividades o logros (PAES, nuevo espacio deportivo, Gran Lota, acompañamiento Aptus).", "9 de las 12 cuentan actividades de estudiantes y funcionarios (teatro, museo, universidad, reconocimientos, Día del Profesor, salud mental); 3 son comunicados o flyers. Los avisos urgentes van aparte, en la barra roja y al celular."],
    ["Noticias", "Lista de noticias con texto; publicaba una sola cuenta.", "Página propia para cada noticia, con fotos y galería, departamentos y equipos etiquetados, borradores y publicación programada."],
    ["Comunicados", "Se subían como PDF para descargar.", "Generador de comunicados con el formato oficial y las firmas por cargo; se publican como imagen y texto, y también en Instagram."],
    ["Avisos urgentes", "Solo como una noticia más en la lista.", "Barra roja en todo el sitio y notificación al celular con la app; Inspectoría los publica desde su teléfono."],
    ["App", "No había.", "App del colegio instalable (colegiosm.cl/app) con avisos, horarios, calendario y «Mi curso»."],
    ["Horarios", "No estaban publicados.", "Horario de cada curso (20 cursos), descargable como imagen y disponible sin internet en la app."],
    ["Calendario", "No había.", "Calendario escolar con botón «Agregar a mi calendario» y recordatorio al celular el día antes."],
    ["Emergencias", "No había página.", "Página de emergencias con el mapa de aluvión de la Municipalidad."],
    ["Quién publica", "Una sola persona administraba el sitio.", "Cuentas con el correo del colegio para cada cargo (Dirección, UTP, Inspectoría, Convivencia), con permisos por persona."],
    ["Contacto", "Formulario de contacto.", "Mensajes que se asignan al encargado que corresponde, con reenvío por correo y marca de «atendido»."],
    ["Seguridad", "Inicio de sesión visible en la portada, protegido con una suma simple.", "Panel con correo institucional y contraseña propia, bloqueo tras intentos fallidos, aviso de ingreso desde un equipo nuevo y respaldos semanales."],
    ["Medición", "Sin estadísticas de visitas conocidas.", "Visitas diarias, por página y por tipo de equipo (celular o computador), y registro de cada cambio para el informe mensual."],
  ];
  // Publicaciones por mes del sitio anterior en 2026 (contadas en colegiosanmartin.webescuela.cl, octubre de 2026)
  const NOTICIAS_ANTES = [["2026-03", 7], ["2026-04", 7], ["2026-05", 3], ["2026-06", 6], ["2026-07", 4], ["2026-08", 11], ["2026-09", 3]];
  async function descargarKpi(desde) {
    const j = await pedirServidor("/panel/kpi" + (desde ? "?desde=" + desde : ""));
    const diaDe = (t) => new Date(t).toLocaleDateString("sv", { timeZone: "America/Santiago" });
    const horaDe = (t) => new Date(t).toLocaleTimeString("es-CL", { timeZone: "America/Santiago", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    // Fecha de Excel (número de día) sin pasar por la zona horaria del computador
    const fecha = (dia) => { const [y, m, d] = String(dia).split("-").map(Number); return y && m && d ? { t: "n", v: Date.UTC(y, m - 1, d) / 864e5 + 25569, z: "dd-mm-yyyy" } : dia; };
    const sinClase = (detalle) => String(detalle || "").replace(/^(Noticia|Comunicado|Flyer): /, "");
    const ev = j.cambios;
    // Cada noticia con su último título y fecha; las que se borraron después no se cuentan
    const ultima = new Map(), borrada = new Set();
    for (const e of ev) {
      const id = e.datos && e.datos.id;
      if (!id) continue;
      if (e.tipo === "Publicación borrada") borrada.add(id);
      else if (/^Publicación( editada)?$/.test(e.tipo)) { ultima.set(id, e); borrada.delete(id); }
    }
    // Los avisos de prueba van a «Otros cambios», no a los avisos publicados: los que dicen «prueba»
    // y los que se apagaron antes de 10 minutos (un aviso real queda encendido más tiempo)
    const breves = new Set();
    ev.forEach((e, i) => {
      if (e.tipo !== "Aviso urgente publicado") return;
      const fin = ev.slice(i + 1).find((x) => x.tipo === "Aviso urgente apagado" || x.tipo === "Aviso urgente publicado");
      if (fin && fin.tipo === "Aviso urgente apagado" && new Date(fin.t) - new Date(e.t) < 6e5) { breves.add(e); breves.add(fin); }
    });
    const prueba = (e) => /^Aviso urgente/.test(e.tipo) && (/prueba/i.test(e.detalle || "") || breves.has(e));
    // Las noticias antiguas que se cargaron al estrenar el sitio (fecha anterior al 09-10) no son publicaciones del mes
    const antigua = (e) => e.tipo === "Publicación" && /^\d{4}-\d\d-\d\d$/.test((e.datos && e.datos.fecha) || "") && e.datos.fecha < "2026-10-09";
    const completo = ev.map((e) => [fecha(diaDe(e.t)), horaDe(e.t), e.quien, e.tipo, e.detalle || ""]);
    // Una fila por día con lo que se guardó en el panel y las apps (las mejoras del código van en su hoja)
    const dias = new Map();
    for (const e of ev) {
      if (e.tipo === "Mejora del sitio") continue;
      const k = diaDe(e.t);
      if (!dias.has(k)) dias.set(k, { cont: new Set(), arch: 0, on: 0, off: 0, otros: 0, quien: new Set(), pub: [], det: [] });
      const d = dias.get(k);
      if (TIPOS_CONTENIDO.includes(e.tipo)) d.cont.add(e.sha);
      else if (e.tipo === "Archivo subido") d.arch += (e.datos && e.datos.n) || 1;
      else if (e.tipo === "Aviso urgente publicado" && !prueba(e)) d.on++;
      else if (e.tipo === "Aviso urgente apagado" && !prueba(e)) d.off++;
      else d.otros++;
      d.quien.add(e.quien);
      const nota = e.tipo === "Publicación" ? "" : /^Aviso urgente (publicado|apagado)$/.test(e.tipo) && !prueba(e) ? e.tipo + (e.detalle ? ": " + e.detalle : "")
        : ["Usuarios y permisos", "Archivo borrado", "Código del sitio", "Mensajes de contacto"].includes(e.tipo) ? e.tipo : "";
      if (antigua(e)) d.antiguas = (d.antiguas || 0) + 1;
      else if (e.tipo === "Publicación") d.pub.push(sinClase(e.detalle));
      if (nota && !d.det.includes(nota)) d.det.push(nota);
    }
    const porDia = [...dias].map(([k, d]) => {
      const fila = [d.cont.size, d.arch, d.on, d.off, d.otros];
      return [fecha(k), ...fila, [...d.quien].join(", "), [d.pub.length ? "Publicado: " + d.pub.join("; ") : "", d.antiguas ? `${d.antiguas} noticias antiguas cargadas al sitio nuevo` : "", ...d.det].filter(Boolean).join(" · "), fila.reduce((a, b) => a + b, 0)];
    });
    const visitasDe = Object.fromEntries((j.paginas || []).map((p) => [p.pagina, p.n]));
    const pubs = ev.filter((e) => e.tipo === "Publicación" && !antigua(e) && !borrada.has(e.datos && e.datos.id)).map((e0) => {
      const e = ultima.get(e0.datos && e0.datos.id) || e0, d = { ...(e0.datos || {}), ...(e.datos || {}) };
      return { dia: /^\d{4}-\d\d-\d\d$/.test(d.fecha || "") ? d.fecha : diaDe(e0.t), clase: CLASE_KPI[d.clase] || "Noticia en el sitio", tema: sinClase(e.detalle),
        cat: CATEGORIA_KPI[d.cat] || "Otra", quien: e0.quien, autor: d.autor || e0.quien, enlace: d.id ? `https://colegiosm.cl/noticia/${d.id}/` : "", vis: d.id ? visitasDe[`/noticia/${d.id}/`] || 0 : "" };
    });
    const publicaciones = pubs.map((p) => [fecha(p.dia), p.clase, "Sitio web", p.tema, p.cat, p.autor, "", "", "", p.enlace, p.vis]);
    const area = (a) => (a.some((x) => /^admin\//.test(x)) ? "Panel" : a.some((x) => /^servidor\//.test(x)) ? "Servidor" : a.some((x) => /^app\/|^sw\.js$/.test(x)) ? "App" : "Sitio web");
    const mejoras = ev.filter((e) => e.tipo === "Mejora del sitio").map((e) => {
      const a = area((e.datos && e.datos.archivos) || []);
      return [fecha(diaDe(e.t)), e.detalle, a, a === "Panel" || a === "Servidor" ? "Funcionarios" : "Toda la comunidad", "Solicitud"];
    });
    const visitas = (j.visitas || []).map((v) => [fecha(v.dia), v.n, v.movil, v.n - v.movil]);
    // Hoja «Indicadores»: los KPI del último mes del registro y las tablas que alimentan sus gráficos
    const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    const etiquetaMes = (m) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
    const MESES_LARGO = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
    const ultimoDia = [...ev.map((e) => diaDe(e.t)), ...(j.visitas || []).map((v) => v.dia)].sort().pop() || diaDe(Date.now());
    const mes = ultimoDia.slice(0, 7), enMes = (dia) => String(dia).startsWith(mes);
    const pubMes = pubs.filter((p) => enMes(p.dia)), visMes = (j.visitas || []).filter((v) => enMes(v.dia));
    const totVis = visMes.reduce((a, v) => a + v.n, 0), totMov = visMes.reduce((a, v) => a + v.movil, 0);
    const esCom = (p) => p.clase === "Comunicado" || p.clase === "Flyer";
    const kpis = [
      ["Noticias de actividades en el sitio", pubMes.filter((p) => !esCom(p)).length, 4],
      ["Comunicados y flyers publicados", pubMes.filter(esCom).length, 4],
      ["Publicaciones hechas por otros funcionarios", pubMes.filter((p) => p.quien !== "Encargado web" && !/^Claude/.test(p.quien)).length, 2],
      ["Visitas al sitio", totVis, 1000],
      ["Días con cambios guardados en el panel", [...dias.keys()].filter(enMes).length, 10],
      ["Mejoras implementadas en el sitio, panel o app", ev.filter((e) => e.tipo === "Mejora del sitio" && enMes(diaDe(e.t))).length, 4],
    ];
    const pct = (v) => ({ t: "n", v, z: "0%" });
    const ind = [
      [`Indicadores de ${MESES_LARGO[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`],
      [`Corte al ${ultimoDia.split("-").reverse().join("-")}. Calculado por el panel con el registro de cambios; las visitas se cuentan desde el 16-10-2026.`],
      [],
      ["KPI", "Resultado", "Meta", "% de la meta", "¿Cumple?", "% para el gráfico (tope 200 %)"],
      ...kpis.map(([k, r, m]) => [k, r, m, pct(r / m), r >= m ? "Sí" : "No", pct(Math.min(r / m, 2))]),
      ["Avisos urgentes publicados (informativo, sin pruebas)", ev.filter((e) => e.tipo === "Aviso urgente publicado" && !prueba(e) && enMes(diaDe(e.t))).length, "–", "", "–"],
      ["KPI cumplidos", `${kpis.filter(([, r, m]) => r >= m).length} de ${kpis.length}`],
      ["Visitas desde celular", pct(totVis ? totMov / totVis : 0)],
    ];
    const graficos = [];
    const tabla = (enc, filas) => { ind.push([], enc); const desde = ind.length + 1; ind.push(...filas); return { desde, hasta: ind.length, fila: desde - 1 }; };
    const r = (col, t) => `${col}${t.desde}:${col}${t.hasta}`;
    const lugar = (n) => ({ desde: [7, n * 18], hasta: [17, n * 18 + 17] });
    graficos.push({ tipo: "barra", titulo: "% de la meta alcanzado por KPI (tope 200 %)", cats: "A5:A10", series: [{ nombre: "D4", vals: "F5:F10", color: "7A1F35" }], formato: "0%", ...lugar(0) });
    if (visMes.length) {
      const t = tabla(["Día", "Celular", "Computador", "Total"], visMes.map((v) => [v.dia.slice(8) + "-" + v.dia.slice(5, 7), v.movil, v.n - v.movil, v.n]));
      graficos.push({ tipo: "apilada", titulo: "Visitas por día", cats: r("A", t), series: [{ nombre: `B${t.fila}`, vals: r("B", t), color: "7A1F35" }, { nombre: `C${t.fila}`, vals: r("C", t), color: "C9A24B" }], ...lugar(1) });
      const e = tabla(["Equipo", "Visitas"], [["Celular", totMov], ["Computador", totVis - totMov]]);
      graficos.push({ tipo: "torta", titulo: "Visitas por tipo de equipo", cats: r("A", e), series: [{ nombre: `B${e.fila}`, vals: r("B", e) }], destacar: [{ idx: 0, color: "7A1F35" }, { idx: 1, color: "C9A24B" }], formato: "0%", ...lugar(2) });
    }
    const contar = (lista, clave) => [...lista.reduce((m, p) => m.set(p[clave], (m.get(p[clave]) || 0) + 1), new Map())];
    if (pubMes.length) {
      const t = tabla(["Tipo de publicación", "Cantidad"], contar(pubMes, "clase"));
      graficos.push({ tipo: "columna", titulo: "Publicaciones por tipo", cats: r("A", t), series: [{ nombre: `B${t.fila}`, vals: r("B", t), color: "7A1F35" }], ...lugar(3) });
      const c = tabla(["Categoría", "Cantidad"], contar(pubMes, "cat"));
      graficos.push({ tipo: "columna", titulo: "Publicaciones por categoría", cats: r("A", c), series: [{ nombre: `B${c.fila}`, vals: r("B", c), color: "C9A24B" }], ...lugar(4) });
    }
    const porMes = [...NOTICIAS_ANTES.map(([m, n]) => [etiquetaMes(m), n, "Sitio anterior"]),
      ...contar(pubs.map((p) => ({ m: p.dia.slice(0, 7) })), "m").sort().map(([m, n]) => [etiquetaMes(m), n, "Sitio nuevo"])];
    const tm = tabla(["Mes", "Publicaciones", "Sitio"], porMes);
    graficos.push({ tipo: "columna", titulo: "Publicaciones por mes: sitio anterior y sitio nuevo", cats: r("A", tm), series: [{ nombre: `B${tm.fila}`, vals: r("B", tm), color: "8C8C8C" }],
      destacar: porMes.map((f, i) => (f[2] === "Sitio nuevo" ? { idx: i, color: "C9A24B" } : null)).filter(Boolean), ...lugar(5) });
    await bajarExcel(`registro-kpi-${new Date().toLocaleDateString("sv")}.xlsx`, [
      ["Prompt para IA", [["Copia todo el texto de abajo (columna A), pégalo en ChatGPT o Claude y adjunta este mismo Excel. También puedes usar el botón «Copiar prompt» del panel."], [""], ...PROMPT_KPI.split("\n").map((l) => [l])], [130]],
      ["Indicadores", ind, [46, 12, 12, 13, 10, 14]],
      ["Antes del sitio nuevo", [["Aspecto", "Antes (sitio anterior, hasta octubre de 2026)", "Ahora (colegiosm.cl)"], ...ANTES_KPI], [24, 60, 70]],
      ["Cambios en el panel", [["Fecha", "Contenido guardado", "Archivos subidos", "Avisos urgentes publicados", "Avisos urgentes apagados", "Otros cambios", "Quién", "Detalle", "Total"], ...porDia], [12, 12, 12, 12, 12, 12, 26, 70, 8]],
      ["Publicaciones", [["Fecha", "Tipo", "Red o sección", "Tema", "Categoría", "Publicada por", "Planificada", "Nota de apoyo (quién)", "Minutos", "Enlace", "Visitas (último corte)"], ...publicaciones], [12, 18, 12, 50, 14, 22, 11, 18, 9, 50, 12]],
      ["Mejoras del sitio", [["Fecha", "Mejora", "Área", "Para quién", "Origen"], ...mejoras], [12, 70, 12, 18, 14]],
      ["Visitas", [["Día", "Visitas", "Desde celular", "Desde computador"], ...visitas], [12, 10, 14, 16]],
      ["Registro completo", [["Fecha", "Hora", "Quién", "Tipo", "Detalle"], ...completo], [12, 7, 22, 24, 80]],
    ], { hoja: "Indicadores", lista: graficos });
    return { cambios: ev.length, alDia: j.alDia, error: j.error };
  }
  function panelRegistroKpi() {
    const desde = h("input", { type: "date", "aria-label": "Desde qué día (opcional)" });
    const estado = h("p", { class: "panel__help", role: "status" });
    const btn = h("button", { type: "button", class: "btn btn--primary btn--sm" }, "Descargar registro de KPI");
    btn.onclick = async () => {
      btn.disabled = true; estado.textContent = "Armando el Excel…";
      try {
        const r = await descargarKpi(desde.value);
        const al = r.alDia ? new Date(r.alDia).toLocaleString("es-CL", { timeZone: "America/Santiago", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "";
        estado.textContent = `Listo: ${r.cambios} cambios anotados${al ? ` (al día hasta el cambio del ${al})` : ""}.` + (r.error ? ` Aviso del servidor: ${r.error}` : "");
      } catch (e) { estado.textContent = "No se pudo descargar: " + e.message; }
      btn.disabled = false;
    };
    return h("div", { class: "panel" }, h("h2", {}, "Registro de KPI (solo tú lo ves)"),
      h("p", { class: "panel__help" }, "El servidor del colegio anota cada cambio del sitio: fecha y hora, quién, qué tipo de cambio y el detalle (título de la noticia, aviso encendido o apagado, archivos subidos, usuarios y permisos). No queda en el sitio público. El Excel trae la hoja «Indicadores» con los KPI del mes y sus gráficos, y las hojas «Cambios en el panel», «Publicaciones», «Mejoras del sitio» y «Visitas» con las mismas columnas de tu planilla, y el «Registro completo» con cada cambio. La primera hoja trae el prompt para el informe."),
      h("div", { class: "kpi__fila" }, h("label", {}, "Desde (opcional) ", desde), btn,
        h("button", { type: "button", class: "btn btn--sm", onclick: () => copiar(PROMPT_KPI, "Prompt copiado. Pégalo en la IA junto con el Excel.") }, "Copiar prompt")),
      h("p", { class: "panel__help" }, "Para el informe: sube el Excel a ChatGPT o Claude y pega el prompt (viene también en la primera hoja del Excel). Te devuelve un Excel limpio con lo esencial y un informe en Word con los KPI, el aporte al PME y, en un anexo aparte, el cierre para pedir reconocimiento. No inventa datos: lo que falte lo marca «por completar»."),
      estado);
  }

  /* ---------- Pruebas y guías para imprimir ----------
     Los profesores las envían desde la app («Mi curso» → «Pruebas para imprimir»). UTP (permiso «pruebas») las
     aprueba o las devuelve; al aprobarlas le llega un correo a impresiones (permiso «impresiones»), que las
     descarga aquí y las marca como impresas. Los archivos quedan solo en el servidor del colegio, nunca en el sitio. */
  const TIPOS_PRUEBA = { prueba: "Prueba", guia: "Guía" };
  const MIME_PRUEBA = { pdf: "application/pdf", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", doc: "application/msword" };
  const esPrimerCiclo = (curso) => /^[1-6]° básico/i.test(curso);
  const fechaEvaluacion = (f) => new Date(f + "T12:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
  const pesoArchivo = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1).replace(".", ",") + " MB" : Math.max(1, Math.round(b / 1024)) + " KB");
  let cicloPruebas = null; // null: el ciclo de la cuenta (si su cargo dice «primer» o «segundo ciclo»)

  // Número en el botón del menú: por revisar (UTP) o por imprimir (impresiones)
  async function contarPruebas() {
    if (!puede("pruebas") || state.rol === "utp") return 0;
    try {
      const j = await pedirServidor("/panel/pruebas");
      const delCiclo = (p) => !j.ciclo || p.cursos.some((c) => (esPrimerCiclo(c) ? "1" : "2") === j.ciclo);
      const n = j.utp ? j.pruebas.filter((p) => p.estado === "enviada" && delCiclo(p)).length : j.pruebas.filter((p) => p.estado === "aprobada").length;
      const b = $(".side__nav button[data-view=pruebas]");
      if (b) { b.querySelector(".apr__badge")?.remove(); if (n) b.append(h("span", { class: "apr__badge", title: n + (j.utp ? " por revisar" : " por imprimir") }, String(n))); }
      return { n, utp: j.utp };
    } catch (e) { return 0; }
  }

  // El servidor entrega el archivo como texto base64
  async function archivoPrueba(p) {
    await servidorListo;
    const r = await fetch(SERVIDOR + "/panel/pruebas/archivo?id=" + encodeURIComponent(p.id), { headers: credencial(), cache: "no-store" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || "Error " + r.status); }
    const bin = atob((await r.text()).replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const ext = ((/\.([a-z]+)$/i.exec(p.archivo) || [])[1] || "pdf").toLowerCase();
    // Sin tildes ni «°» en el nombre: algunos navegadores cambian el nombre por «download»
    const nombre = `${p.fecha} ${p.asignatura} ${p.cursos.join(" y ")} - ${p.archivo}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/°/g, "").replace(/[^\x20-\x7e]/g, "").replace(/[\\/:*?"<>|]+/g, "-");
    return new File([bytes], nombre, { type: MIME_PRUEBA[ext] || "application/octet-stream" });
  }
  const accionArchivo = (p, ver) => async (e) => {
    const btn = e.currentTarget, antes = btn.textContent;
    // La ventana se abre al tiro (si no, el navegador la bloquea) y se llena cuando llega el archivo
    const ventana = ver ? window.open("", "_blank") : null;
    btn.disabled = true; btn.textContent = "Descargando…";
    try {
      const f = await archivoPrueba(p);
      if (ventana) ventana.location.href = URL.createObjectURL(f);
      else descargar([f]);
    } catch (err) { if (ventana) ventana.close(); toast(err.message, "error"); }
    finally { btn.disabled = false; btn.textContent = antes; }
  };

  function itemPrueba(p, j, recargar) {
    const pedirYRecargar = async (btn, ruta, cuerpo, ok) => {
      btn.disabled = true;
      try { const r = await pedirServidor(ruta, cuerpo); toast(typeof ok === "function" ? ok(r) : ok, "ok"); recargar(); }
      catch (err) { toast(err.message, "error"); btn.disabled = false; }
    };
    const atrasada = p.habiles != null && p.habiles < j.anticipacion;
    const archivo = p.conArchivo
      ? h("div", { class: "prb__archivo" }, h("span", {}, `${p.archivo} · ${pesoArchivo(p.tam)}`),
        /\.pdf$/i.test(p.archivo) ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: accionArchivo(p, true) }, "Abrir") : "",
        h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: accionArchivo(p, false) }, "Descargar"))
      : h("p", { class: "prb__meta" }, `${p.archivo} · el archivo ya se borró del servidor`);
    const acciones = h("div", { class: "apr__acc" });
    let extra = null;
    if (p.estado === "enviada" && j.utp) {
      const copias = h("input", { type: "number", min: 1, max: 2000, value: p.copias == null ? "" : p.copias, "aria-label": "Copias" });
      extra = h("div", { class: "kpi__fila prb__copias" },
        h("label", {}, "Copias para imprimir", copias),
        p.copias == null ? h("span", { class: "prb__ojo" }, "Falta la matrícula de algún curso: escribe las copias a mano.") : h("span", { class: "prb__meta" }, `Según la matrícula${j.extra ? `, con ${j.extra} extra por curso` : ""}.`));
      acciones.append(
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: (e) => {
          if (!(+copias.value > 0)) { toast("Escribe cuántas copias se imprimen.", "error"); copias.focus(); return; }
          pedirYRecargar(e.currentTarget, "/panel/pruebas/aprobar", { id: p.id, copias: +copias.value },
            (r) => (r.avisados ? `Aprobada. Se avisó a impresiones por correo.` : "Aprobada. Queda en «Para imprimir» (no se pudo avisar por correo a impresiones)."));
        } }, "Aprobar y enviar a impresión"),
        h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: (e) => {
          const motivo = prompt(`¿Qué debe cambiar ${p.nombre || "el profesor"} en esta ${TIPOS_PRUEBA[p.tipo].toLowerCase()}? Le llegará por correo y lo verá en la app.`);
          if (motivo === null) return;
          if (!motivo.trim()) { toast("Escribe qué debe cambiar.", "error"); return; }
          pedirYRecargar(e.currentTarget, "/panel/pruebas/devolver", { id: p.id, motivo }, "Devuelta al profesor con tu comentario.");
        } }, "Devolver con comentario"));
    } else if (p.estado === "aprobada") {
      acciones.append(h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: (e) => pedirYRecargar(e.currentTarget, "/panel/pruebas/impresa", { id: p.id, impresa: true }, "Marcada como impresa.") }, "Marcar como impresa"));
      if (j.utp) acciones.append(h("button", { type: "button", class: "btn btn--ghost btn--sm btn--danger", onclick: (e) => {
        if (!confirm(`¿Anular esta ${TIPOS_PRUEBA[p.tipo].toLowerCase()}? Se borra del servidor y ya no se imprime. Avísale tú a impresiones si ya la tenían.`)) return;
        pedirYRecargar(e.currentTarget, "/panel/pruebas/anular", { id: p.id }, "Anulada.");
      } }, "Anular"));
    } else if (p.estado === "impresa") {
      acciones.append(h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: (e) => pedirYRecargar(e.currentTarget, "/panel/pruebas/impresa", { id: p.id, impresa: false }, "Vuelve a «Para imprimir».") }, "Desmarcar"));
    }
    const fechaT = (t) => (t ? fechaHoraCorta(t) : "");
    return h("article", { class: "apr__item prb" + (p.estado === "devuelta" ? " is-cambios" : "") },
      h("div", { class: "apr__cab" },
        h("strong", {}, `${TIPOS_PRUEBA[p.tipo] || "Prueba"} de ${p.asignatura}`),
        h("span", { class: "prb__cursos" }, p.cursos.join(" · "))),
      h("p", { class: "prb__fecha" }, "Evaluación: ", h("b", {}, fechaEvaluacion(p.fecha)),
        p.estado === "enviada" && atrasada ? h("span", { class: "prb__ojo" }, ` · llegó con ${p.habiles} ${p.habiles === 1 ? "día hábil" : "días hábiles"} de anticipación`) : ""),
      p.estado === "aprobada" || p.estado === "impresa" ? h("p", { class: "prb__total" }, `${p.copias} copias`) : "",
      p.comentario ? h("p", { class: "apr__motivo" }, h("b", {}, "Indicaciones: "), p.comentario) : "",
      p.estado === "devuelta" ? h("p", { class: "apr__motivo" }, h("b", {}, "Comentario de UTP: "), p.motivo) : "",
      archivo, extra,
      h("p", { class: "prb__meta" }, `Enviada por ${p.nombre || p.correo} el ${fechaT(p.t)}`,
        p.revisor && p.estado !== "enviada" ? ` · ${p.estado === "devuelta" ? "devuelta" : "aprobada"} por ${p.revisor} el ${fechaT(p.tRevision)}` : "",
        p.estado === "impresa" ? ` · impresa${p.impresor ? " por " + p.impresor : ""} el ${fechaT(p.tImpresa)}` : ""),
      acciones);
  }

  function panelMatricula() {
    const caja = h("div", {}, h("p", { class: "panel__help" }, "Cargando…"));
    const det = h("details", { class: "panel prb__matricula", ontoggle: () => { if (det.open && !det.dataset.listo) { det.dataset.listo = "1"; cargar(); } } },
      h("summary", {}, h("h2", {}, "Matrícula y copias"), h("p", { class: "panel__help" }, "Cuántos estudiantes tiene cada curso y cada electivo. De aquí salen las copias de cada prueba.")), caja);
    const cargar = () => pedirServidor("/panel/matricula").then((j) => {
      const inputs = [];
      const num = (curso, grupo) => {
        const v = (j.matricula[curso] || {})[grupo];
        const i = h("input", { type: "number", min: 0, max: 200, value: v == null ? "" : v, disabled: !j.puedeEditar, "aria-label": grupo ? `${curso}, ${grupo}` : curso });
        inputs.push({ curso, grupo, i });
        return i;
      };
      const filas = [];
      j.cursos.forEach((c) => {
        filas.push(h("tr", { class: "prb__curso" }, h("td", {}, h("b", {}, c.curso)), h("td", {}, "Curso completo"), h("td", {}, num(c.curso, ""))));
        c.asignaturas.filter((a) => a.electivo).forEach((a) => filas.push(h("tr", {}, h("td", {}), h("td", {}, a.nombre, h("small", {}, " electivo")), h("td", {}, num(c.curso, a.nombre)))));
      });
      const anticipacion = h("input", { type: "number", min: 0, max: 15, value: j.anticipacion, disabled: !j.puedeEditar });
      const extra = h("input", { type: "number", min: 0, max: 20, value: j.extra, disabled: !j.puedeEditar });
      const guardarBtn = h("button", { type: "button", class: "btn btn--primary", onclick: async () => {
        guardarBtn.disabled = true;
        try {
          await pedirServidor("/panel/matricula", { matricula: inputs.map((x) => ({ curso: x.curso, grupo: x.grupo, n: x.i.value })), anticipacion: anticipacion.value, extra: extra.value });
          toast("Matrícula guardada. Las próximas pruebas calcularán sus copias con estos números.", "ok");
        } catch (e) { toast(e.message, "error"); }
        guardarBtn.disabled = false;
      } }, "Guardar matrícula");
      const llenar = h("button", { type: "button", class: "btn btn--ghost", onclick: async () => {
        try {
          const { cuenta } = await pedirServidor("/panel/matricula/mi-curso");
          let n = 0;
          cuenta.forEach((x) => { const f = inputs.find((y) => y.curso === x.curso && !y.grupo); if (f && x.n) { f.i.value = x.n; n++; } });
          toast(n ? `Llené ${n} ${n === 1 ? "curso" : "cursos"} con las listas de «Mi curso». Revisa y presiona «Guardar matrícula».` : "Aún no hay listas de estudiantes en «Mi curso».", n ? "ok" : "error");
        } catch (e) { toast(e.message, "error"); }
      } }, "Llenar desde las listas de Mi curso");
      caja.replaceChildren(
        j.puedeEditar ? "" : h("p", { class: "panel__help" }, "Solo UTP cambia la matrícula."),
        h("div", { class: "kpi__fila prb__ajustes" },
          h("label", {}, "Copias extra por curso", extra),
          h("label", {}, "Días hábiles de anticipación pedidos", anticipacion)),
        h("p", { class: "panel__help" }, "Las copias extra son para el profesor, PIE o reemplazos. La anticipación solo avisa: el profesor puede enviar igual y tú ves cuántos días hábiles faltaban. Los electivos salen de «Horarios» (celdas con « | »)."),
        j.cursos.length ? h("table", { class: "est__tabla prb__tabla" },
          h("thead", {}, h("tr", {}, h("th", {}, "Curso"), h("th", {}, "Grupo"), h("th", {}, "Estudiantes"))), h("tbody", {}, filas))
          : h("p", { class: "empty" }, "No hay cursos en «Horarios»."),
        j.puedeEditar ? h("div", { class: "apr__acc" }, guardarBtn, llenar) : "");
    }).catch((e) => caja.replaceChildren(h("p", { class: "panel__help" }, e.message)));
    return det;
  }

  VISTAS.pruebas = {
    titulo: "Pruebas y guías",
    ayuda: "Pruebas y guías que los profesores envían desde la app (Mi curso → Pruebas para imprimir). UTP las revisa y, al aprobarlas, le llegan a impresiones con la cantidad de copias. Los archivos quedan solo en el servidor del colegio y se borran 30 días después de la evaluación.",
    render: () => {
      const caja = h("div", {}, h("p", { class: "panel__help" }, "Cargando…"));
      const cargar = () => pedirServidor("/panel/pruebas").then((j) => {
        const ciclo = cicloPruebas == null ? j.ciclo : cicloPruebas;
        const delCiclo = (p) => !ciclo || p.cursos.some((c) => (esPrimerCiclo(c) ? "1" : "2") === ciclo);
        const ver = j.pruebas.filter(delCiclo);
        const de = (estado) => ver.filter((p) => p.estado === estado);
        const lista = (arr, vacio) => (arr.length ? arr.map((p) => itemPrueba(p, j, cargar)) : [h("p", { class: "empty" }, vacio)]);
        const chips = j.utp ? h("div", { class: "est__rango", role: "group", "aria-label": "Ciclo" }, [["", "Todos los cursos"], ["1", "Primer ciclo (1° a 6° básico)"], ["2", "Segundo ciclo (7° básico a 4° medio)"]].map(([v, t]) =>
          h("button", { type: "button", class: "chip-adm" + (v === ciclo ? " is-active" : ""), onclick: () => { cicloPruebas = v; cargar(); } }, t))) : "";
        const porRevisar = de("enviada"), paraImprimir = de("aprobada"), devueltas = de("devuelta"), impresas = de("impresa").reverse();
        const actualizar = h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: (e) => { e.currentTarget.disabled = true; cargar(); } }, "Actualizar");
        caja.replaceChildren(
          h("div", { class: "prb__barra" }, chips, actualizar),
          j.utp && !j.impresiones.length ? h("p", { class: "panel__help est__aviso" },
            "Aún no hay una cuenta con el permiso «Impresiones», así que nadie recibe el aviso al aprobar. El dueño del panel la crea en «Usuarios y permisos» (cargo «Encargado de impresiones»). Mientras tanto, lo aprobado queda abajo en «Para imprimir».") : "",
          j.utp ? h("div", { class: "panel apr" }, h("h2", {}, porRevisar.length ? `Por revisar (${porRevisar.length})` : "Por revisar"), ...lista(porRevisar, "No hay pruebas ni guías esperando revisión.")) : "",
          h("div", { class: "panel apr" }, h("h2", {}, paraImprimir.length ? `Para imprimir (${paraImprimir.length})` : "Para imprimir"),
            j.utp && j.impresiones.length ? h("p", { class: "panel__help" }, `Las ve y las marca como impresas: ${j.impresiones.join(", ")}.`) : "",
            ...lista(paraImprimir, "No hay nada pendiente de imprimir.")),
          j.utp && devueltas.length ? h("details", { class: "panel apr" }, h("summary", {}, h("h2", {}, `Devueltas al profesor (${devueltas.length})`)), ...lista(devueltas, "")) : "",
          impresas.length ? h("details", { class: "panel apr" }, h("summary", {}, h("h2", {}, `Impresas (${impresas.length})`)), ...lista(impresas, "")) : "",
          j.utp ? panelMatricula() : "");
        contarPruebas();
      }).catch((e) => caja.replaceChildren(h("div", { class: "panel" }, h("p", { class: "panel__help" }, e.message))));
      cargar();
      return caja;
    },
  };

  VISTAS.estadisticas = {
    titulo: "Estadísticas de visitas",
    ayuda: "Cuántas veces se abrió cada página del sitio. No usa cookies ni guarda datos de las personas: solo suma una visita por página abierta (y si fue desde un celular).",
    render: () => {
      const s = servidorApp();
      if (!s) return sinServidor("Las estadísticas");
      const caja = h("div", {}, h("p", { class: "panel__help" }, "Cargando…"));
      const rango = h("div", { class: "est__rango", role: "group", "aria-label": "Período" }, [[7, "7 días"], [30, "30 días"], [90, "3 meses"], [365, "1 año"]].map(([n, t]) =>
        h("button", { type: "button", class: "chip-adm" + (n === diasEstadisticas ? " is-active" : ""), onclick: () => { diasEstadisticas = n; render(); } }, t)));
      fetch(`${s}/estadisticas?dias=${diasEstadisticas}`, { cache: "no-store" }).then((r) => r.json()).then((e) => {
        // Todos los días del período, aunque no tengan visitas
        const mapa = Object.fromEntries(e.porDia.map((x) => [x.dia, x.n]));
        const dias = [];
        for (let t = new Date(e.desde + "T12:00"); dias.length < e.dias; t.setDate(t.getDate() + 1)) {
          const k = t.toLocaleDateString("sv");
          dias.push({ dia: k, n: mapa[k] || 0 });
        }
        const total = dias.reduce((a, x) => a + x.n, 0);
        const max = Math.max(1, ...dias.map((x) => x.n));
        const tile = (num, txt) => h("div", { class: "est__tile" }, h("strong", {}, num.toLocaleString("es-CL")), h("span", {}, txt));
        const pctMovil = total ? Math.round((e.movil / total) * 100) : 0;
        const barras = h("div", { class: "est__barras", role: "img", "aria-label": `Visitas por día: ${total} en total` },
          dias.map((x) => h("div", { class: "est__col", title: `${fechaCorta(x.dia)}: ${x.n} ${x.n === 1 ? "visita" : "visitas"}` },
            h("i", { style: `height:${x.n ? Math.max(2, (x.n / max) * 100) : 0}%` }))));
        const eje = h("div", { class: "est__eje" }, h("span", {}, fechaCorta(dias[0].dia)), h("span", {}, "Máximo: " + max + " en un día"), h("span", {}, fechaCorta(dias[dias.length - 1].dia)));
        const tabla = h("table", { class: "est__tabla" },
          h("thead", {}, h("tr", {}, h("th", {}, "Página"), h("th", {}, "Visitas"))),
          h("tbody", {}, e.porPagina.length ? e.porPagina.map((x) => h("tr", {},
            h("td", {}, h("span", { class: "est__pag" }, nombrePagina(x.pagina)), h("i", { class: "est__bar", style: `width:${(x.n / e.porPagina[0].n) * 100}%` })),
            h("td", {}, x.n.toLocaleString("es-CL"))))
            : h("tr", {}, h("td", { colspan: 2 }, "Aún no hay visitas registradas en este período."))));
        caja.replaceChildren(
          h("div", { class: "est__tiles" }, tile(total, "visitas en total"), tile(Math.round(total / e.dias), "visitas por día, en promedio"), tile(pctMovil, "% desde celulares")),
          h("div", { class: "panel" }, h("h2", {}, "Visitas por día"), barras, eje),
          h("div", { class: "panel" }, h("h2", {}, "Páginas más vistas"), tabla));
      }).catch(() => caja.replaceChildren(h("p", { class: "panel__help" }, "No se pudo conectar con el servidor de estadísticas.")));
      return h("div", {}, rango, caja, state.rol === "dueno" && state.modo !== "correo" ? panelRegistroKpi() : "");
    },
  };

  VISTAS.mensajes = {
    titulo: "Mensajes de contacto",
    ayuda: "Mensajes enviados desde el formulario de la página Contacto. Para responder, toca el correo de la persona. Se borran solos después de un año.",
    render: () => {
      const s = servidorApp();
      if (!s) return sinServidor("El formulario de contacto");
      const caja = h("div", {}, h("p", { class: "panel__help" }, "Cargando…"));
      const pedir = (ruta, cuerpo) => fetch(s + ruta, { method: cuerpo ? "POST" : "GET", cache: "no-store",
        headers: { ...credencial(), ...(cuerpo ? { "Content-Type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
        .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || (r.status === 404 ? "El servidor aún no tiene esta función: vuelve a pegar servidor/notificaciones.js en Cloudflare." : r.status)); return j; });
      const fechaHora = (iso) => new Date(iso).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" });
      const quien = (a) => a.cargo ? `${a.cargo} (${a.nombre})` : a.nombre;
      // Cuadro para elegir a quiénes se asigna (una o varias cuentas del panel) y si se les reenvía al correo
      const asignador = (m, cuentas, cerrar) => {
        const ya = new Set(m.asignados.map((a) => a.correo));
        const cajas = cuentas.map((c) => ({ c, input: h("input", { type: "checkbox", checked: ya.has(c.correo) }) }));
        const reenviar = h("input", { type: "checkbox", checked: true });
        const guardar = h("button", { type: "button", class: "btn btn--primary btn--sm" }, "Guardar asignación");
        guardar.onclick = async () => {
          guardar.disabled = true;
          try {
            const r = await pedir("/mensajes/asignar", { id: m.id, correos: cajas.filter((x) => x.input.checked).map((x) => x.c.correo), reenviar: reenviar.checked });
            toast(!r.asignados ? "El mensaje quedó sin asignar." : r.sinCorreo ? "Asignado, pero no se pudo reenviar por correo: revisa «correo» en /estado del servidor."
              : r.reenviados ? `Asignado y reenviado al correo de ${r.reenviados} ${r.reenviados === 1 ? "persona" : "personas"}.` : "Asignación guardada.", r.sinCorreo ? "error" : "ok");
            cargar();
          } catch (err) { toast(err.message, "error"); guardar.disabled = false; }
        };
        return h("div", { class: "msg__asignar" },
          cuentas.length ? h("div", { class: "checks" }, cajas.map(({ c, input }) => h("label", { class: "check" }, input, " ", quien({ ...c, nombre: c.nombre || c.correo }))))
            : h("p", { class: "panel__help" }, "Aún no hay cuentas con correo del colegio. Créalas en «Usuarios y permisos»."),
          h("label", { class: "msg__reenviar" }, reenviar, " Reenviarlo también a su correo (solo a quienes se suman ahora)"),
          h("div", { class: "msg__acc" }, guardar, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: cerrar }, "Cancelar")));
      };
      const pintar = (j) => {
        const aviso = j.correo || !j.todos ? null : h("p", { class: "panel__help est__aviso" },
          "Los mensajes llegan solo a este panel. Para recibirlos también en un correo del colegio, sigue la sección «Formulario de Contacto» de servidor/GUIA.md.");
        const lista = j.mensajes.map((m) => {
          const pendiente = j.todos ? !m.leido : !m.miAtendido;
          const asignados = m.asignados.length ? h("p", { class: "msg__asig" }, "Asignado a: ",
            m.asignados.map((a, i) => [i ? ", " : "", h("span", { class: a.atendido ? "msg__hecho" : "" }, quien(a) + (a.atendido ? " ✓ atendido" : ""))])) : null;
          const acciones = h("div", { class: "msg__acc" });
          const zona = h("div", {});
          if (j.todos) {
            acciones.append(
              h("button", { type: "button", class: "btn btn--primary", onclick: () => {
                if (zona.firstChild) return zona.replaceChildren();
                zona.replaceChildren(asignador(m, j.cuentas || [], () => zona.replaceChildren()));
              } }, m.asignados.length ? "Cambiar asignación" : "Asignar"),
              h("button", { type: "button", class: "btn btn--ghost", onclick: async (e) => { e.target.disabled = true; await pedir("/mensajes/leido", { id: m.id, leido: !m.leido }).catch((err) => toast(err.message, "error")); cargar(); } }, m.leido ? "Marcar como no leído" : "Marcar como leído"),
              h("button", { type: "button", class: "btn btn--ghost btn--danger", onclick: async () => {
                if (!confirm("¿Borrar este mensaje? No se puede deshacer.")) return;
                await pedir("/mensajes/borrar", { id: m.id }).catch((err) => toast(err.message, "error")); cargar();
              } }, "Borrar"));
          } else {
            acciones.append(h("button", { type: "button", class: m.miAtendido ? "btn btn--ghost" : "btn btn--primary", onclick: async (e) => {
              e.target.disabled = true; await pedir("/mensajes/atendido", { id: m.id, atendido: !m.miAtendido }).catch((err) => toast(err.message, "error")); cargar();
            } }, m.miAtendido ? "Marcar como pendiente" : "Marcar como atendido"));
          }
          return h("article", { class: "msg" + (pendiente ? " msg--nuevo" : "") },
            h("header", { class: "msg__cab" },
              h("strong", {}, m.nombre), h("span", { class: "msg__motivo" }, m.motivo), h("time", {}, fechaHora(m.fecha))),
            h("p", { class: "msg__correo" }, h("a", { href: "mailto:" + m.email + "?subject=" + encodeURIComponent("Re: " + m.motivo + " (Colegio San Martín)") }, m.email),
              j.todos && m.enviado ? h("span", { class: "msg__ok" }, " · también llegó al correo") : null),
            h("p", { class: "msg__texto" }, m.mensaje), asignados, acciones, zona);
        });
        const nuevos = j.mensajes.filter((m) => (j.todos ? !m.leido : !m.miAtendido)).length;
        caja.replaceChildren(aviso || "", h("div", { class: "panel" },
          h("h2", {}, j.mensajes.length ? `${j.mensajes.length} ${j.mensajes.length === 1 ? "mensaje" : "mensajes"}${nuevos ? ` · ${nuevos} ${j.todos ? "sin leer" : "por atender"}` : ""}`
            : j.todos ? "Aún no hay mensajes" : "No tienes mensajes asignados"),
          j.todos ? null : h("p", { class: "panel__help" }, "Aquí ves los mensajes del formulario de Contacto que te asignaron. Para responder, toca el correo de la persona. Cuando lo resuelvas, márcalo como atendido."),
          h("div", { class: "msgs" }, lista)));
      };
      const cargar = () => pedir("/mensajes").then(pintar).catch((e) => caja.replaceChildren(h("p", { class: "panel__help" },
        /permiso/i.test(e.message) ? "Tu usuario no tiene permiso para ver los mensajes (solo administradores)." : "No se pudo conectar con el servidor: " + e.message)));
      cargar();
      return caja;
    },
  };

  VISTAS.emergencia = {
    titulo: "Emergencias y tsunami",
    ayuda: "Datos del colegio para la página «Emergencias y tsunami»: zona de seguridad, punto de encuentro, mapas de evacuación (aluvión, terremoto…), retiro de estudiantes y protocolo. Las instrucciones generales ante un sismo y los teléfonos de emergencia ya vienen en la página.",
    render: () => {
      const e = state.data.emergencia;
      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Zona de seguridad"),
          h("div", { class: "grid2" },
            campo({ k: "zona", label: "Nombre de la zona de seguridad", placeholder: "Ej.: Plaza … (sobre la cota 30)", full: true }, e),
            campo({ k: "direccion", label: "Dirección", placeholder: "Ej.: Calle … esquina …" }, e),
            campo({ k: "mapa", label: "Enlace al mapa (opcional)", placeholder: "https://maps.app.goo.gl/…", help: "En Google Maps busca el lugar, toca «Compartir» y pega aquí el enlace." }, e),
            campo({ k: "punto", label: "Punto de encuentro para apoderados", placeholder: "Dónde esperar o retirar a los estudiantes", full: true }, e),
            campo({ k: "imagen", label: "Mapa de evacuación (imagen, opcional)", type: "file", accept: "image/*", folder: "img/emergencias", ajustar: 2000, full: true, help: "Por ejemplo, el plano con la ruta desde el colegio hasta la zona de seguridad." }, e))),
        h("div", { class: "panel" }, h("h2", {}, "Mapas de evacuación"),
          h("p", { class: "panel__help" }, "Planos por tipo de emergencia: aluvión, terremoto, tsunami… Se muestran en la página uno debajo del otro."),
          editorLista({
            items: (e.mapas = e.mapas || []),
            textoAgregar: "Agregar mapa",
            vacio: "Aún no hay mapas.",
            nuevo: () => ({ tipo: "terremoto", titulo: "", imagen: "", descripcion: "" }),
            resumen: (it) => [it.titulo || "Mapa sin título", { aluvion: "Aluvión", terremoto: "Terremoto", tsunami: "Tsunami", incendio: "Incendio", otro: "Otro" }[it.tipo] || ""],
            miniatura: (it, el) => { if (it.imagen) el.append(h("img", { src: resolver(it.imagen), alt: "" })); else el.textContent = "🗺"; },
            campos: [
              { k: "tipo", label: "Tipo de emergencia", type: "select", options: [["aluvion", "Aluvión"], ["terremoto", "Terremoto"], ["tsunami", "Tsunami"], ["incendio", "Incendio"], ["otro", "Otro"]] },
              { k: "titulo", label: "Título", placeholder: "Ej.: Vía de evacuación del colegio en caso de terremoto" },
              { k: "imagen", label: "Imagen del mapa", type: "file", accept: "image/*", folder: "img/emergencias", ajustar: 2400, full: true },
              { k: "descripcion", label: "Descripción (opcional)", type: "textarea", full: true, placeholder: "Qué muestra el mapa y de dónde viene." },
              { k: "pendiente", label: "Nota (opcional)", full: true, placeholder: "Ej.: Pronto publicaremos la vía de evacuación del colegio.", help: "Se muestra destacada bajo el mapa. Bórrala cuando ya no haga falta." },
            ],
          })),
        h("div", { class: "panel" }, h("h2", {}, "Retiro de estudiantes y protocolo"),
          h("div", { class: "grid2" },
            campo({ k: "retiro", label: "Retiro de estudiantes después de una evacuación", type: "textarea", full: true, placeholder: "Ej.: Los estudiantes permanecen con sus profesores en la zona de seguridad. Solo se entregan a su apoderado o a la persona autorizada…" }, e),
            campo({ k: "protocolo", label: "Protocolo del colegio (opcional)", type: "textarea", full: true, help: "Puedes usar el mismo formato que las noticias: **negrita**, listas con «- » y enlaces." }, e))),
        h("p", { class: "panel__help" }, h("a", { href: SITIO + "emergencias/", target: "_blank", rel: "noopener" }, "Ver la página Emergencias y tsunami ↗")));
    },
  };

  // Copias de seguridad semanales (rama «respaldos», ver .github/workflows/respaldo.yml)
  VISTAS.respaldos = {
    titulo: "Copias de seguridad",
    ayuda: "Cada domingo se guarda una copia del contenido del panel (se conservan las últimas 52 semanas). Si algo se borró o cambió por error, puedes volver a una copia: se carga aquí y se publica al presionar «Guardar y publicar».",
    render: () => {
      const caja = h("div", { class: "panel" }, h("p", { class: "panel__help" }, "Cargando…"));
      gh("/contents/respaldos?ref=respaldos").then((lista) => {
        const fechas = lista.filter((x) => x.type === "dir").map((x) => x.name).sort().reverse();
        if (!fechas.length) throw Object.assign(new Error("vacío"), { status: 404 });
        caja.replaceChildren(h("h2", {}, `${fechas.length} ${fechas.length === 1 ? "copia" : "copias"}`),
          h("ul", { class: "respaldos" }, fechas.map((f) => h("li", {},
            h("strong", {}, new Date(f + "T12:00").toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })),
            h("span", { class: "respaldos__acc" },
              h("button", { type: "button", class: "btn btn--ghost", onclick: () => descargarRespaldo(f) }, "Descargar"),
              h("button", { type: "button", class: "btn btn--ghost", onclick: () => restaurarRespaldo(f) }, "Volver a esta copia"))))));
      }).catch((e) => caja.replaceChildren(h("p", { class: "panel__help" }, e.status === 404
        ? "Aún no hay copias. La primera se guarda el próximo domingo (o al ejecutar a mano la acción «Copia de seguridad semanal» en GitHub → Actions)."
        : "No se pudieron leer las copias: " + e.message)));
      return caja;
    },
  };
  /* Espacio y limpieza: archivos subidos que ya no usa ninguna sección. Solo con el token de GitHub:
     se borran todos en un solo cambio (una sola actualización del sitio). Siguen en el historial de GitHub. */
  const PROTEGIDOS = /^img\/(logo|comunicado|noticias\/guardadas)\/|^img\/compartir\.jpg$/;
  // La fecha de subida va al inicio del nombre (la pone el panel); un archivo sin ella no se ofrece
  const subidoEl = (ruta) => { const m = /^([a-z0-9]{7,9})-/.exec(ruta.split("/").pop()); const t = m ? parseInt(m[1], 36) : NaN; return t > 1.6e12 && t < Date.now() + 864e5 ? t : null; };
  const mb = (b) => (b / 1e6).toLocaleString("es-CL", { maximumFractionDigits: 1 }) + " MB";
  // Todo lo que podría usar un archivo: el contenido publicado, lo que está abierto en el panel y las copias de seguridad
  async function textoEnUso() {
    const partes = [JSON.stringify(state.data), ...Object.values(state.foto || {})];
    try { partes.push(b64ToUtf8((await gh(`/contents/${DATA_PATH}?ref=${encodeURIComponent(state.branch)}`)).content)); } catch (e) { throw new Error("no se pudo leer el contenido publicado"); }
    try {
      const copias = (await gh("/contents/respaldos?ref=respaldos")).filter((x) => x.type === "dir").map((x) => x.name);
      partes.push(...await Promise.all(copias.map((f) => gh(`/contents/respaldos/${f}/sitio.json?ref=respaldos`).then((r) => b64ToUtf8(r.content)).catch(() => ""))));
    } catch (e) { /* aún no hay copias */ }
    return partes.join("\n");
  }
  async function borrarEnUnCambio(rutas, mensaje) {
    const ref = await gh(`/git/ref/heads/${encodeURIComponent(state.branch)}`);
    const base = await gh(`/git/commits/${ref.object.sha}`);
    const arbol = await gh("/git/trees", { method: "POST", body: JSON.stringify({ base_tree: base.tree.sha, tree: rutas.map((path) => ({ path, mode: "100644", type: "blob", sha: null })) }) });
    const commit = await gh("/git/commits", { method: "POST", body: JSON.stringify({ message: mensaje, tree: arbol.sha, parents: [ref.object.sha] }) });
    await gh(`/git/refs/heads/${encodeURIComponent(state.branch)}`, { method: "PATCH", body: JSON.stringify({ sha: commit.sha }) });
  }
  VISTAS.limpieza = {
    titulo: "Espacio y limpieza",
    ayuda: "Fotos y documentos subidos que ya no usa ninguna sección del sitio. Borrarlos achica el sitio publicado. Siguen guardados en el historial de GitHub, así que se pueden recuperar.",
    render: () => {
      const caja = h("div", { class: "panel" }, h("p", { class: "panel__help" }, "Revisando los archivos del sitio…"));
      (async () => {
        const arbol = await gh(`/git/trees/${encodeURIComponent(state.branch)}?recursive=1`);
        const enUso = await textoEnUso();
        const archivos = arbol.tree.filter((f) => f.type === "blob" && /^(img|documentos)\//.test(f.path));
        const total = archivos.reduce((s, f) => s + (f.size || 0), 0);
        const limite = Date.now() - 30 * 864e5;
        const sinUso = archivos.filter((f) => !PROTEGIDOS.test(f.path) && !enUso.includes(f.path) && subidoEl(f.path) && subidoEl(f.path) < limite)
          .sort((a, b) => subidoEl(a.path) - subidoEl(b.path));
        const elegidos = new Set();
        const btn = h("button", { type: "button", class: "btn btn--danger", disabled: true, onclick: async () => {
          const rutas = [...elegidos];
          if (!confirm(`¿Borrar ${rutas.length} ${rutas.length === 1 ? "archivo" : "archivos"} del sitio? Quedan en el historial de GitHub por si hay que recuperarlos.`)) return;
          btn.disabled = true; btn.textContent = "Borrando…";
          try {
            // Se revisa otra vez justo antes, por si alguien empezó a usar alguno
            const ahora = await textoEnUso(), usados = rutas.filter((r) => ahora.includes(r));
            if (usados.length) throw new Error(`${usados.length} de esos archivos se empezó a usar recién. Vuelve a abrir esta sección.`);
            await borrarEnUnCambio(rutas, `Borrar ${rutas.length} archivos sin uso desde el panel`);
            toast(`Listo: se borraron ${rutas.length} archivos. El sitio se actualiza en 1 o 2 minutos.`, "ok");
            render();
          } catch (e) {
            toast("No se pudieron borrar: " + e.message, "error");
            btn.disabled = false; contar();
          }
        } });
        const contar = () => {
          const peso = sinUso.filter((f) => elegidos.has(f.path)).reduce((s, f) => s + (f.size || 0), 0);
          btn.disabled = !elegidos.size; btn.textContent = elegidos.size ? `Borrar ${elegidos.size} seleccionados (${mb(peso)})` : "Borrar seleccionados";
        };
        const casillas = sinUso.map((f) => h("input", { type: "checkbox", onchange: (e) => { if (e.target.checked) elegidos.add(f.path); else elegidos.delete(f.path); contar(); } }));
        contar();
        caja.replaceChildren(
          h("h2", {}, "Espacio usado"),
          h("p", {}, `Fotos y documentos del sitio: ${archivos.length} archivos, ${mb(total)}. El límite recomendado por GitHub es de 1.000 MB.`),
          h("h2", {}, "Archivos sin uso"),
          sinUso.length ? h("p", { class: "panel__help" }, `Estos ${sinUso.length} archivos (${mb(sinUso.reduce((s, f) => s + (f.size || 0), 0))}) no los usa ninguna sección ni copia de seguridad y se subieron hace más de 30 días. Revisa la vista previa antes de borrar.`)
            : h("p", { class: "panel__help" }, "No hay archivos para limpiar. Solo aparecen los que no usa ninguna sección ni copia de seguridad y se subieron hace más de 30 días (los más nuevos pueden estar en un borrador)."),
          sinUso.length ? h("div", { class: "limpieza__acc" },
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { casillas.forEach((c, i) => { c.checked = true; elegidos.add(sinUso[i].path); }); contar(); } }, "Marcar todos"),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { casillas.forEach((c) => { c.checked = false; }); elegidos.clear(); contar(); } }, "Desmarcar"), btn) : null,
          sinUso.length ? h("div", { class: "limpieza" }, sinUso.map((f, i) => h("label", { class: "limpieza__item" }, casillas[i],
            /\.(jpe?g|png|webp|gif)$/i.test(f.path) ? h("img", { src: resolver(f.path), alt: "", loading: "lazy" }) : h("span", { class: "limpieza__doc" }, (f.path.split(".").pop() || "").toUpperCase()),
            h("span", { class: "limpieza__nombre" }, f.path.split("/").pop().replace(/^[a-z0-9]{7,9}-/, "")),
            h("small", {}, `${mb(f.size || 0)} · ${new Date(subidoEl(f.path)).toLocaleDateString("es-CL")}`)))) : null);
      })().catch((e) => caja.replaceChildren(h("p", { class: "panel__help" }, "No se pudieron revisar los archivos: " + e.message)));
      return caja;
    },
  };
  const leerRespaldo = async (f) => JSON.parse(b64ToUtf8((await gh(`/contents/respaldos/${f}/sitio.json?ref=respaldos`)).content));
  async function descargarRespaldo(f) {
    try {
      const datos = await leerRespaldo(f);
      const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" })), download: `respaldo-sitio-${f}.json` });
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch (e) { toast("No se pudo descargar: " + e.message, "error"); }
  }
  async function restaurarRespaldo(f) {
    if (!confirm(`¿Volver al contenido del ${f}? Se reemplazará todo el contenido del panel por esa copia (no los usuarios ni las imágenes). Revisa y luego presiona «Guardar y publicar» para publicarlo.`)) return;
    try {
      state.data = await leerRespaldo(f);
      normalizar();
      setDirty(true);
      toast(`Copia del ${f} cargada. Revísala y presiona «${textoGuardar()}» para publicarla.`, "ok");
    } catch (e) { toast("No se pudo cargar la copia: " + e.message, "error"); }
  }

  /* ---------- Fechas para leer (Inicio y Aviso urgente) ---------- */
  const DIAS_LARGOS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const ymd = (t) => `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  const deYmd = (f) => { const [y, m, d] = String(f).split("-").map(Number); return new Date(y, m - 1, d); };
  const masDias = (f, n) => { const t = deYmd(f); t.setDate(t.getDate() + n); return ymd(t); };
  const diaLargo = (f) => { const t = deYmd(f); return `${DIAS_LARGOS[t.getDay()]} ${t.getDate()} de ${MESES_LARGOS[t.getMonth()]}`; };
  const diaCorto = (f) => { const t = deYmd(f); return `${DIAS_LARGOS[t.getDay()].slice(0, 3)} ${t.getDate()}`; };
  const fechaHoraLarga = (s) => { const t = new Date(s); return `${diaLargo(ymd(t))} a las ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; };

  /* ---------- Inicio: lo pendiente de cada cargo ----------
     Tarjetas con lo que espera respuesta (pruebas por revisar, mensajes, noticias por aprobar, el aviso
     urgente, las fechas de la semana) y atajos a lo que ese cargo más usa. Cada cargo ve solo lo suyo. */
  const irA = (vista, despues) => {
    state.view = vista; menuMovil(false); render(); window.scrollTo(0, 0);
    if (despues) setTimeout(() => { const el = despues($("#view")); if (el) { if (el.tagName === "DETAILS") el.open = true; else el.click(); el.scrollIntoView({ block: "start" }); } }, 60);
  };
  const botonCon = (texto) => (raiz) => [...raiz.querySelectorAll("button")].find((b) => b.textContent.trim() === texto);
  const tarjetaInicio = ({ n, titulo, texto, boton, ir, tono = "" }) => h("div", { class: "ini__tarjeta" + (tono ? " ini__tarjeta--" + tono : "") },
    h("span", { class: "ini__n" }, String(n)), h("strong", {}, titulo), texto ? h("p", {}, texto) : null,
    boton ? h("button", { type: "button", class: "btn btn--sm " + (tono === "urgente" ? "btn--primary" : "btn--ghost"), onclick: ir }, boton) : null);
  const deVerdad = (a) => !!(a && a.activo && (a.titulo || a.texto));
  function estadoAviso(a) {
    if (!deVerdad(a)) return "apagado";
    if (a.hasta && new Date(a.hasta) < new Date()) return "vencido";
    if (a.desde && new Date(a.desde) > new Date()) return "programado";
    return "publicado";
  }

  VISTAS.inicio = {
    get titulo() { const n = String(state.nombre || "").trim().split(/\s+/)[0]; return n ? "Hola, " + n : "Inicio"; },
    menu: "Inicio",
    get ayuda() { return `Lo que tienes pendiente hoy, ${diaLargo(ymd(new Date()))}.`; },
    render: () => {
      // Un lugar por tarjeta, en orden de urgencia; las que llegan del servidor se llenan después
      const lugares = { pruebas: h("div"), mensajes: h("div"), aprobar: h("div"), aviso: h("div"), semana: h("div") };
      const tarjetas = h("div", { class: "ini__tarjetas" }, Object.values(lugares));
      const poner = (k, ...ts) => { lugares[k].replaceWith(...ts.filter(Boolean)); delete lugares[k]; };
      const s = servidorApp();

      if (puede("pruebas") && s) {
        pedirServidor("/panel/pruebas").then((j) => {
          const ciclo = cicloPruebas == null ? j.ciclo : cicloPruebas;
          const ver = j.pruebas.filter((p) => !ciclo || p.cursos.some((c) => (esPrimerCiclo(c) ? "1" : "2") === ciclo));
          const de = (e) => ver.filter((p) => p.estado === e).sort((a, b) => a.fecha.localeCompare(b.fecha));
          const revisar = de("enviada"), devueltas = de("devuelta"), imprimiendo = de("aprobada");
          const nombre = (p) => `${p.tipo === "guia" ? "la guía" : "la prueba"} de ${p.asignatura} (${p.cursos.join(", ")})`;
          poner("pruebas",
            revisar.length ? tarjetaInicio({ n: revisar.length, tono: "urgente", titulo: revisar.length === 1 ? "Prueba por revisar" : "Pruebas por revisar",
              texto: `La más urgente es ${nombre(revisar[0])}, para el ${diaLargo(revisar[0].fecha)}.`, boton: "Revisar ahora", ir: () => irA("pruebas") })
              : tarjetaInicio({ n: "✓", tono: "ok", titulo: "Sin pruebas por revisar", texto: "Cuando un profesor envíe una, aparecerá aquí." }),
            devueltas.length ? tarjetaInicio({ n: devueltas.length, titulo: devueltas.length === 1 ? "Devuelta al profesor" : "Devueltas a los profesores",
              texto: devueltas.length === 1 ? `${devueltas[0].asignatura} ${devueltas[0].cursos.join(", ")}. Esperando que ${devueltas[0].nombre || "el profesor"} la corrija.` : "Esperando que las corrijan.",
              boton: "Ver", ir: () => irA("pruebas") }) : null,
            imprimiendo.length ? tarjetaInicio({ n: imprimiendo.length, tono: "ok", titulo: "En impresión",
              texto: imprimiendo.length === 1 ? `${imprimiendo[0].tipo === "guia" ? "Guía" : "Prueba"} de ${imprimiendo[0].asignatura} ${imprimiendo[0].cursos.join(", ")}, aprobada. Aún no se marca como impresa.` : "Aprobadas, aún no marcadas como impresas." }) : null);
        }).catch(() => poner("pruebas"));
      } else poner("pruebas");

      if (s) {
        fetch(s + "/mensajes", { cache: "no-store", headers: credencial() }).then((r) => (r.ok ? r.json() : Promise.reject(r.status))).then((j) => {
          const pendientes = (j.mensajes || []).filter((m) => (j.todos ? !m.leido : !m.miAtendido));
          if (!pendientes.length) return poner("mensajes");
          const m = pendientes[0];
          const extracto = String(m.mensaje || "").replace(/\s+/g, " ").slice(0, 90);
          poner("mensajes", tarjetaInicio({ n: pendientes.length, tono: "urgente",
            titulo: pendientes.length === 1 ? (j.todos ? "Mensaje de contacto sin leer" : "Mensaje por atender") : (j.todos ? "Mensajes de contacto sin leer" : "Mensajes por atender"),
            texto: `«${extracto}${String(m.mensaje || "").length > 90 ? "…" : ""}»${m.nombre ? " · " + m.nombre : ""}`, boton: j.todos ? "Leer o asignar" : "Ver", ir: () => irA("mensajes") }));
        }).catch(() => poner("mensajes"));
      } else poner("mensajes");

      if (apruebaNoticias() && s) {
        pedirServidor("/panel/aprobacion").then(({ pendientes }) => {
          const n = pendientes.filter((p) => ![...porAprobar.values()].includes(p.id)).length;
          poner("aprobar", n ? tarjetaInicio({ n, tono: "urgente", titulo: n === 1 ? "Noticia por aprobar" : "Noticias por aprobar",
            texto: "Enviadas por CGPA, CEAL u otras cuentas con aprobación.", boton: "Revisar", ir: () => irA("noticias") }) : null);
        }).catch(() => poner("aprobar"));
      } else poner("aprobar");

      if (puede("aviso")) {
        const a = state.data.aviso || {};
        const e = estadoAviso(a);
        poner("aviso", e === "publicado" || e === "programado"
          ? tarjetaInicio({ n: "!", tono: "alerta", titulo: e === "publicado" ? "Aviso urgente publicado" : "Aviso urgente programado",
            texto: `«${a.titulo || a.texto}». ${e === "programado" ? `Aparece el ${fechaHoraLarga(a.desde)}.` : a.hasta ? `Se apaga solo el ${fechaHoraLarga(a.hasta)}.` : "Se muestra hasta que lo apagues."}`,
            boton: "Ver o apagar", ir: () => irA("aviso") })
          : tarjetaInicio({ n: "✓", tono: "ok", titulo: "Sin aviso urgente publicado", texto: "El sitio y la app muestran la jornada normal.", boton: "Publicar aviso", ir: () => irA("aviso") }));
      } else poner("aviso");

      // Fechas del calendario escolar de hoy a 7 días
      const hoyS = ymd(new Date()), hasta = masDias(hoyS, 6);
      const semana = (state.data.eventos || []).filter((e) => e.fecha && e.fecha <= hasta && (e.fin && e.fin >= e.fecha ? e.fin : e.fecha) >= hoyS)
        .sort((a, b) => a.fecha.localeCompare(b.fecha));
      poner("semana", semana.length ? tarjetaInicio({ n: semana.length, titulo: semana.length === 1 ? "Fecha esta semana" : "Fechas esta semana",
        texto: semana.slice(0, 3).map((e) => `${e.titulo} (${diaCorto(e.fecha < hoyS ? hoyS : e.fecha)})`).join(" · ") + (semana.length > 3 ? ` y ${semana.length - 3} más.` : "."),
        boton: puede("eventos") ? "Ver calendario" : null, ir: () => irA("eventos") }) : null);

      // Atajos: lo que ese cargo más usa
      const atajos = [
        puede("noticias") && !soloPropuestas() && ["noticia", "Publicar noticia", () => irA("noticias", botonCon("+ Nueva noticia"))],
        puede("noticias") && !soloPropuestas() && ["comunicado", "Generar comunicado", () => irA("noticias", (r) => r.querySelector("details.com"))],
        puede("noticias") && !soloPropuestas() && ["flyer", "Publicar flyer", () => irA("noticias", (r) => r.querySelector("details.fly"))],
        puede("pruebas") && ["impresora", "Pruebas y guías", () => irA("pruebas")],
        puede("eventos") && ["calendario", "Agregar fecha al calendario", () => irA("eventos", botonCon("+ Nuevo evento"))],
        puede("galeria") && ["foto", "Subir fotos a la galería", () => irA("galeria", botonCon("+ Nuevo álbum"))],
        puede("micurso") && ["escuela", "Ver un curso", () => irA("micurso")],
        puede("aviso") && ["alerta", "Aviso urgente", () => irA("aviso")],
      ].filter(Boolean).slice(0, 6);
      return h("div", { class: "ini" }, tarjetas,
        atajos.length ? h("h2", { class: "ini__titulo" }, "Hacer algo rápido") : null,
        atajos.length ? h("div", { class: "ini__atajos" }, atajos.map(([icono, texto, ir]) => h("button", { type: "button", class: "ini__atajo", onclick: ir },
          h("span", { class: "ini__ico", html: ICONOS_INICIO[icono] }), texto))) : null);
    },
  };
  const ICONOS_INICIO = Object.fromEntries(Object.entries({
    noticia: "M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Zm-9 14H6v-2h5v2Zm7-4H6v-2h12v2Zm0-4H6V7h12v2Z",
    comunicado: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z",
    flyer: "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5Z",
    foto: "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5Z",
    impresora: "M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3Zm-3 11H8v-5h8v5Zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM18 3H6v4h12V3Z",
    calendario: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V9h14v11ZM7 11h5v5H7v-5Z",
    escuela: "M12 3 1 9l11 6 9-4.91V17h2V9L12 3Zm-6.82 9.5L5 16.18 12 20l7-3.82v-3.68L12 16.5l-6.82-4Z",
    alerta: "M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z",
    salir: "M10.09 15.59 11.5 17l5-5-5-5-1.41 1.41L12.67 11H3v2h9.67l-2.58 2.59ZM19 3H5a2 2 0 0 0-2 2v4h2V5h14v14H5v-4H3v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2Z",
  }).map(([k, d]) => [k, `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`]));

  /* ---------- Aviso urgente ----------
     Primero se ve si hay un aviso publicado (con «Apagar aviso» a mano). Para publicar uno se elige qué avisar:
     el texto se escribe solo con la hora o el día, se ve cómo queda y se publica con un botón.
     «Ver todas las opciones» abre el formulario completo (enlace, programar, color). */
  let avisoRapido = null;
  let avisoCompleto = false;
  const MODELOS_AVISO = {
    retiro: { nombre: "Retiro anticipado", desc: "Los estudiantes salen antes. Escribes solo la hora.", nivel: "importante", color: "#c27d0e", icono: "salir", dia: "hoy", hora: "12:00" },
    suspension: { nombre: "Suspensión de clases", desc: "Un día sin clases. Eliges el día y escribes el motivo.", nivel: "importante", color: "#7a1f35", icono: "escuela", dia: "manana" },
    emergencia: { nombre: "Emergencia", desc: "Sismo, tsunami, corte de servicios. Sale en rojo.", nivel: "urgente", color: "#b3261e", icono: "alerta" },
  };
  const NIVEL_NOTIF = { urgente: "Urgente", importante: "Importante", info: "Aviso" };
  // El día elegido del aviso: hoy, mañana u otro
  const fechaAviso = (r) => (r.dia === "hoy" ? ymd(new Date()) : r.dia === "manana" ? masDias(ymd(new Date()), 1) : r.fecha);
  // Título y texto que se escriben solos con lo elegido (hasta que se cambien a mano)
  function textoModelo(r) {
    const f = fechaAviso(r);
    const larga = f ? diaLargo(f) : "______";
    const corto = r.dia === "hoy" ? "hoy" : r.dia === "manana" ? "mañana" : f ? diaLargo(f) : "______";
    const cuando = r.dia === "hoy" ? "Hoy " + larga : r.dia === "manana" ? "Mañana " + larga : "El " + larga;
    const motivo = String(r.motivo || "").trim();
    const hora = r.hora || "__:__";
    if (r.modelo === "retiro") return { titulo: `Retiro anticipado ${corto} a las ${hora}`, texto: `${cuando} las clases terminan a las ${hora}${motivo ? " por " + motivo : ""}. Les pedimos retirar a sus hijos e hijas a esa hora.` };
    if (r.modelo === "suspension") return { titulo: `Suspensión de clases ${corto}`, texto: `${cuando} no habrá clases${motivo ? " por " + motivo : ""}.` };
    if (r.modelo === "emergencia") return { titulo: "Emergencia en el colegio", texto: "Los estudiantes se encuentran a resguardo junto a sus profesores. Informaremos por aquí los próximos pasos." };
    return { titulo: r.titulo || "", texto: r.texto || "" };
  }
  // Retiro y suspensión se apagan solos al terminar ese día; la emergencia, cuando se apague a mano
  const hastaAuto = (r) => (["retiro", "suspension"].includes(r.modelo) && fechaAviso(r) ? fechaAviso(r) + "T23:59" : "");
  const nuevoAviso = (modelo) => {
    const m = MODELOS_AVISO[modelo] || {};
    const r = { modelo, dia: m.dia || "hoy", fecha: "", hora: m.hora || "", motivo: "", nivel: m.nivel || "importante", notificar: true, tocado: false,
      enlace: "", textoEnlace: "", desde: "", hasta: "", hastaTocado: false };
    Object.assign(r, textoModelo(r));
    r.hasta = hastaAuto(r);
    return r;
  };
  const vistaPreviaAviso = (a) => {
    const nivel = a.nivel || "urgente";
    return h("div", { class: "pv-aviso pv-aviso--" + nivel },
      h("span", { class: "pv-aviso__ico" }, nivel === "info" ? "i" : "!"),
      h("span", { class: "pv-aviso__txt" }, a.titulo ? h("strong", {}, a.titulo + " ") : null, a.texto || "Escribe el aviso…",
        a.enlace ? h("u", {}, " " + (a.textoEnlace || "Más información") + " →") : null));
  };
  const vistaPreviaNotif = (a) => h("div", { class: "av-notif" }, h("i", { "aria-hidden": "true" }),
    h("div", {}, h("strong", {}, `${NIVEL_NOTIF[a.nivel] || "Urgente"}: ${a.titulo || "Aviso del colegio"}`), h("span", {}, a.texto || "")));

  async function publicarAviso(r, boton) {
    const titulo = r.titulo.trim(), texto = r.texto.trim();
    if (!titulo && !texto) return toast("Escribe el aviso antes de publicarlo.", "error");
    if (/__/.test(titulo + texto)) return toast("Completa los espacios en blanco (__) antes de publicarlo.", "error");
    const a = state.data.aviso || (state.data.aviso = {});
    Object.assign(a, { activo: true, nivel: r.nivel, titulo, texto });
    for (const k of ["enlace", "textoEnlace", "desde", "hasta"]) { const v = String(r[k] || "").trim(); if (v) a[k] = v; else delete a[k]; }
    if (r.notificar) delete a.notificar; else a.notificar = false;
    setDirty(true);
    boton.disabled = true;
    await guardar();
    if (state.dirty) { boton.disabled = false; return; }
    avisoRapido = null;
    render();
    window.scrollTo(0, 0);
  }
  async function apagarAviso(boton) {
    if (!confirm("¿Apagar el aviso ahora? Deja de mostrarse en el sitio y en la app.")) return;
    state.data.aviso.activo = false;
    setDirty(true);
    boton.disabled = true;
    await guardar();
    if (state.dirty) boton.disabled = false;
  }

  // Lo primero: ¿hay un aviso publicado?
  function estadoAvisoTarjeta(a) {
    const e = estadoAviso(a);
    if (e === "publicado" || e === "programado") {
      return h("div", { class: "av-estado av-estado--" + (a.nivel || "urgente") },
        h("div", { class: "av-estado__cab" }, h("strong", {}, e === "publicado" ? "Hay un aviso publicado" : "Hay un aviso programado"),
          h("span", {}, e === "programado" ? `Aparece el ${fechaHoraLarga(a.desde)}${a.notificar === false ? "" : ", con notificación a los celulares"}.`
            : a.hasta ? `Se apaga solo el ${fechaHoraLarga(a.hasta)}.` : "Se muestra hasta que lo apagues.")),
        vistaPreviaAviso(a),
        h("div", { class: "av-acciones" },
          h("button", { type: "button", class: "btn av-apagar", onclick: (ev) => apagarAviso(ev.currentTarget) }, e === "publicado" ? "Apagar aviso" : "Cancelar aviso"),
          h("button", { type: "button", class: "btn btn--ghost", onclick: () => {
            avisoRapido = { ...nuevoAviso("libre"), titulo: a.titulo || "", texto: a.texto || "", nivel: a.nivel || "urgente", tocado: true,
              enlace: a.enlace || "", textoEnlace: a.textoEnlace || "", desde: a.desde || "", hasta: a.hasta || "", hastaTocado: true, editando: true,
              // Corregir el texto de un aviso ya enviado no vuelve a notificar, salvo que se pida
              notificar: e === "programado" ? a.notificar !== false : false };
            render();
          } }, "Cambiar el texto")));
    }
    return h("div", { class: "av-estado av-estado--ok" }, h("b", { "aria-hidden": "true" }, "✓"),
      h("div", { class: "av-estado__cab" }, h("strong", {}, "Ahora no hay ningún aviso publicado"),
        h("span", {}, e === "vencido" ? "El último aviso ya venció y no se muestra." : "El sitio y la app muestran «Sin avisos por ahora».")));
  }

  // Paso 2: lo propio de cada modelo, el texto, la vista previa y «Publicar ahora»
  function formularioAvisoRapido(r) {
    const tituloIn = h("input", { type: "text", maxlength: 80, value: r.titulo, oninput: (e) => { r.titulo = e.target.value; r.tocado = true; pintar(); } });
    const textoIn = h("textarea", { rows: 4, oninput: (e) => { r.texto = e.target.value; r.tocado = true; pintar(); } });
    textoIn.value = r.texto;
    const previa = h("div"), notif = h("div"), resumen = h("p", { class: "av-resumen" });
    const hastaIn = h("input", { type: "datetime-local", value: r.hasta, oninput: (e) => { r.hasta = e.target.value; r.hastaTocado = true; pintar(); } });
    function pintar() {
      if (!r.tocado) { Object.assign(r, textoModelo(r)); tituloIn.value = r.titulo; textoIn.value = r.texto; }
      if (!r.hastaTocado) { r.hasta = hastaAuto(r); hastaIn.value = r.hasta; }
      previa.replaceChildren(vistaPreviaAviso(r));
      notif.replaceChildren(r.notificar ? vistaPreviaNotif(r) : h("p", { class: "panel__help" }, "No se enviará notificación a los celulares."));
      resumen.textContent = (r.desde ? `Aparece el ${fechaHoraLarga(r.desde)}` : "Se publica al tiro en el sitio y en la app")
        + (r.hasta ? ` y se apaga solo el ${fechaHoraLarga(r.hasta)}` : " y queda hasta que lo apagues")
        + (r.notificar ? ". Llega una notificación a los celulares." : ".");
    }
    const etiqueta = (texto, control, ayuda) => h("label", { class: "field" }, h("span", { class: "av-etq" }, texto), control, ayuda ? h("small", {}, ayuda) : null);
    const chips = (opciones, actual, elegir) => h("div", { class: "av-chips", role: "group" }, opciones.map(([v, t]) =>
      h("button", { type: "button", class: "chip-adm" + (v === actual ? " is-active" : ""), "aria-pressed": String(v === actual), onclick: () => elegir(v) }, t)));
    const propio = [];
    if (r.modelo === "retiro" || r.modelo === "suspension") {
      const opciones = r.modelo === "retiro" ? [["hoy", "Hoy"], ["manana", "Mañana"], ["otro", "Otro día"]] : [["manana", "Mañana"], ["hoy", "Hoy"], ["otro", "Otro día"]];
      propio.push(h("div", { class: "field" }, h("span", { class: "av-etq" }, "¿Qué día?"),
        chips(opciones, r.dia, (v) => { r.dia = v; if (v === "otro" && !r.fecha) r.fecha = masDias(ymd(new Date()), 1); render(); }),
        r.dia === "otro" ? h("input", { type: "date", value: r.fecha, min: ymd(new Date()), "aria-label": "Día", oninput: (e) => { r.fecha = e.target.value; pintar(); } }) : null));
      if (r.modelo === "retiro") propio.push(etiqueta("¿A qué hora salen?", h("input", { type: "time", value: r.hora, oninput: (e) => { r.hora = e.target.value; pintar(); } })));
      propio.push(etiqueta("¿Por qué? (opcional)", h("input", { type: "text", maxlength: 80, value: r.motivo, placeholder: r.modelo === "retiro" ? "Ej.: reunión de profesores" : "Ej.: corte de agua en el sector",
        oninput: (e) => { r.motivo = e.target.value; pintar(); } })));
    }
    const notificar = h("label", { class: "av-switch" }, h("input", { type: "checkbox", checked: r.notificar, onchange: (e) => { r.notificar = e.target.checked; pintar(); } }),
      h("span", {}, "Enviar notificación a los celulares"));
    const publicar = h("button", { type: "button", class: "btn btn--primary av-publicar", onclick: (e) => publicarAviso(r, e.currentTarget) },
      state.modo === "revision" ? "Enviar para publicar" : r.desde ? "Programar aviso" : "Publicar ahora");
    const mas = h("details", { class: "av-mas", open: !!(r.enlace || r.desde) },
      h("summary", {}, "Más opciones: color, enlace, programar"),
      h("div", { class: "grid2" },
        etiqueta("Color", h("select", { onchange: (e) => { r.nivel = e.target.value; pintar(); } },
          [["urgente", "Urgente (rojo)"], ["importante", "Importante (amarillo)"], ["info", "Informativo (azul)"]].map(([v, t]) => h("option", { value: v, selected: v === r.nivel }, t)))),
        etiqueta("Enlace (opcional)", h("input", { type: "text", value: r.enlace, placeholder: "https://… o noticia/?id=…", oninput: (e) => { r.enlace = e.target.value; pintar(); } })),
        etiqueta("Texto del enlace", h("input", { type: "text", maxlength: 40, value: r.textoEnlace, placeholder: "Más información", oninput: (e) => { r.textoEnlace = e.target.value; pintar(); } })),
        etiqueta("Mostrar desde (para programarlo)", h("input", { type: "datetime-local", value: r.desde, oninput: (e) => { r.desde = e.target.value; publicar.textContent = state.modo === "revision" ? "Enviar para publicar" : e.target.value ? "Programar aviso" : "Publicar ahora"; pintar(); } }),
          "Vacío: aparece al publicar."),
        etiqueta("Se apaga solo el", hastaIn, "Vacío: queda hasta que lo apagues.")));
    pintar();
    const m = MODELOS_AVISO[r.modelo];
    return h("div", { class: "av-dos" },
      h("div", { class: "panel" }, h("h2", {}, r.editando ? "Cambiar el aviso" : m ? m.nombre : "Aviso nuevo"),
        propio.length ? h("div", { class: "av-campos" }, propio) : null,
        h("div", { class: "av-campos" }, etiqueta("Título", tituloIn), etiqueta("Texto del aviso", textoIn, r.tocado || !m ? null : "Se escribe solo con lo que elijas arriba. Puedes cambiarlo.")),
        notificar, mas, resumen,
        h("div", { class: "av-acciones" }, publicar, h("button", { type: "button", class: "btn btn--ghost", onclick: () => { avisoRapido = null; render(); } }, "Cancelar"))),
      h("div", { class: "av-previa" }, h("h2", {}, "Así se verá"), h("p", { class: "panel__help" }, "En el sitio y en la app:"), previa,
        h("p", { class: "panel__help" }, "En los celulares:"), notif));
  }

  VISTAS.aviso = {
    titulo: "Aviso urgente",
    get ayuda() {
      return avisoCompleto ? "Formulario completo del aviso: color, enlace, programación y notificación. Se publica con el botón de arriba."
        : avisoRapido ? "Revisa el texto y publícalo. Sale arriba de todas las páginas del sitio, en la app y en los celulares."
        : "Franja arriba de todas las páginas del sitio y en la app, para suspensiones, retiros o emergencias. Elige qué quieres avisar: lo demás se llena solo.";
    },
    render: () => {
      const d = state.data;
      const a = d.aviso || (d.aviso = { activo: false, nivel: "urgente" });
      if (avisoCompleto) return h("div", {},
        h("p", {}, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { avisoCompleto = false; render(); } }, "← Volver a la vista simple")),
        formularioAvisoCompleto(a));
      if (avisoRapido) return formularioAvisoRapido(avisoRapido);
      return h("div", { class: "av" }, estadoAvisoTarjeta(a),
        h("h2", { class: "ini__titulo" }, deVerdad(a) && estadoAviso(a) !== "vencido" ? "¿Quieres avisar otra cosa?" : "¿Qué quieres avisar?"),
        h("div", { class: "av-modelos" }, Object.entries(MODELOS_AVISO).map(([k, m]) => h("button", { type: "button", class: "av-modelo", onclick: () => { avisoRapido = nuevoAviso(k); render(); window.scrollTo(0, 0); } },
          h("span", { class: "av-modelo__ico", style: "background:" + m.color, html: ICONOS_INICIO[m.icono] }), h("strong", {}, m.nombre), h("span", {}, m.desc)))),
        h("div", { class: "av-acciones" },
          h("button", { type: "button", class: "btn btn--ghost", onclick: () => { avisoRapido = { ...nuevoAviso("libre"), nivel: "importante" }; render(); } }, "Escribir otro aviso desde cero"),
          h("button", { type: "button", class: "btn-link", onclick: () => { avisoCompleto = true; render(); } }, "Ver todas las opciones")),
        state.rol === "dueno" ? panelApp() : null);
    },
  };

  // Formulario completo del aviso (todas las opciones)
  function formularioAvisoCompleto(a) {
    const vista = h("div", { class: "pv-aviso" });
    const estado = h("p", { class: "panel__help pv-hero__estado" });
    const pintar = () => {
      const nivel = a.nivel || "urgente";
      vista.className = "pv-aviso pv-aviso--" + nivel;
      vista.replaceChildren(
        h("span", { class: "pv-aviso__ico" }, nivel === "info" ? "i" : "!"),
        h("span", { class: "pv-aviso__txt" }, a.titulo ? h("strong", {}, a.titulo + " ") : null, a.texto || "Escribe el aviso…",
          a.enlace ? h("u", {}, " " + (a.textoEnlace || "Más información") + " →") : null));
      const vencido = a.hasta && new Date(a.hasta) < new Date();
      estado.textContent = !a.activo ? "Apagado: no se muestra en el sitio."
        : vencido ? "Venció: ya no se muestra. Cambia o borra la fecha «Mostrar hasta»."
        : a.desde && new Date(a.desde) > new Date() ? "Programado: aparecerá en el sitio y en la app el " + new Date(a.desde).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" }) + (a.notificar === false ? "." : ", y a esa hora se enviará la notificación.")
        : !(a.titulo || a.texto) ? "Encendido, pero sin texto: escribe el aviso para que aparezca."
        : "Encendido: se muestra arriba de todas las páginas" + (a.hasta ? " hasta el " + new Date(a.hasta).toLocaleString("es-CL", { dateStyle: "long", timeStyle: "short" }) : "") + ".";
    };
    const sel = () => () => pintar();
    pintar();
    // Modelos rápidos (los mismos de la app de Inspectoría): se completan los espacios en blanco
    const MODELOS = [
      { nombre: "Retiro anticipado", nivel: "importante", titulo: "Retiro anticipado de estudiantes", texto: "Hoy las clases terminan a las __:__ por ______. Les pedimos retirar a sus hijos e hijas a esa hora." },
      { nombre: "Suspensión de clases", nivel: "importante", titulo: "Suspensión de clases", texto: "El día ______ no habrá clases por ______." },
      { nombre: "Emergencia", nivel: "urgente", titulo: "Emergencia en el colegio", texto: "Los estudiantes se encuentran a resguardo junto a sus profesores. Informaremos por aquí los próximos pasos." },
    ];
    const modelos = h("div", { class: "modelos" }, h("span", {}, "Usar un modelo:"), MODELOS.map((m) => h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
      if ((a.titulo || a.texto) && !confirm("¿Reemplazar el aviso actual por este modelo?")) return;
      Object.assign(a, { activo: true, nivel: m.nivel, titulo: m.titulo, texto: m.texto });
      delete a.desde; delete a.hasta; delete a.notificar;
      setDirty(true); render();
      toast("Completa los espacios en blanco (__) y presiona «" + textoGuardar() + "».", "ok");
    } }, m.nombre)));
    return h("div", {},
      h("div", { class: "panel" }, h("h2", {}, "Aviso"), modelos,
        h("div", { class: "grid2" },
          campo({ k: "activo", label: "Estado", type: "select", options: [["", "Apagado"], ["si", "Encendido: mostrar en el sitio"]] },
            { get activo() { return a.activo ? "si" : ""; }, set activo(v) { a.activo = v === "si"; } }, pintar),
          campo({ k: "nivel", label: "Tipo", type: "select", options: [["urgente", "Urgente (rojo)"], ["importante", "Importante (amarillo)"], ["info", "Informativo (azul)"]] }, a, sel()),
          campo({ k: "titulo", label: "Título corto", placeholder: "Ej.: Suspensión de clases", max: 80, full: true }, a, pintar),
          campo({ k: "texto", label: "Texto", type: "textarea", full: true, placeholder: "Ej.: Mañana martes 15 no habrá clases por corte de agua. Las actividades se retoman el miércoles." }, a, pintar),
          campo({ k: "enlace", label: "Enlace (opcional)", placeholder: "https://… o noticia/?id=…", help: "Por ejemplo, la noticia con el detalle o un documento PDF." }, a, pintar),
          campo({ k: "textoEnlace", label: "Texto del enlace", placeholder: "Más información", max: 40 }, a, pintar),
          campo({ k: "desde", label: "Mostrar desde (opcional)", type: "datetime-local", help: "Para programarlo: aparece solo en esta fecha y hora (hora de Chile). Vacío: se muestra al publicar." }, a, pintar),
          campo({ k: "hasta", label: "Mostrar hasta (opcional)", type: "datetime-local", help: "Pasada esta fecha y hora, el aviso se oculta solo. Vacío: se muestra hasta que lo apagues." }, a, pintar),
          campo({ k: "notificar", label: "Notificación a la app", type: "select", options: [["si", "Sí: enviar notificación a los celulares"], ["no", "No: solo mostrarlo"]],
            help: "Se envía una sola vez, al publicar un aviso encendido nuevo o con otro texto. Llega en uno o dos minutos." },
            { get notificar() { return a.notificar === false ? "no" : "si"; }, set notificar(v) { if (v === "no") a.notificar = false; else delete a.notificar; } }, pintar))),
      h("div", { class: "panel" }, h("h2", {}, "Vista previa"), vista, estado,
        h("p", { class: "panel__help" }, "Recuerda presionar «" + textoGuardar() + "». Quien ya tenga el sitio abierto lo verá al recargar o al cambiar de página.")),
      state.rol === "dueno" ? panelApp() : null);
  }

  // App del colegio (/app/): dirección del servidor de notificaciones (solo el dueño; ver servidor/GUIA.md)
  function panelApp() {
    const d = state.data;
    const app = d.app || (d.app = {});
    const estado = h("p", { class: "panel__help" });
    let espera = 0;
    const probar = async () => {
      const u = String(app.servidor || "").trim().replace(/\/+$/, "");
      if (!u) { estado.textContent = "Sin servidor: la app funciona, pero no envía notificaciones."; return; }
      if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(u)) { estado.textContent = "La dirección debe ser como https://avisos-colegio.tu-cuenta.workers.dev"; return; }
      estado.textContent = "Revisando el servidor…";
      try {
        const r = await (await fetch(u + "/estado", { cache: "no-store" })).json();
        if (!r.ok) throw new Error(r.error || "sin respuesta");
        estado.textContent = `Servidor funcionando: ${r.celulares} ${r.celulares === 1 ? "celular" : "celulares"} con notificaciones activadas.` +
          (r.ultimoEnvio ? ` Último envío: ${new Date(r.ultimoEnvio.inicio).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })} (${r.ultimoEnvio.enviadas}).` : "");
      } catch (e) { estado.textContent = "No se pudo conectar con el servidor: " + e.message; }
    };
    probar();
    return h("div", { class: "panel" }, h("h2", {}, "App del colegio"),
      h("p", { class: "panel__help" }, "La app está en ", h("a", { href: SITIO + "app/", target: "_blank", rel: "noopener" }, "colegiosm.cl/app"),
        ". Muestra este aviso, los horarios y el calendario. Para enviar notificaciones necesita el servidor de Cloudflare (guía en servidor/GUIA.md del repositorio)."),
      h("div", { class: "grid2" },
        campo({ k: "servidor", label: "Dirección del servidor de notificaciones", placeholder: "https://avisos-colegio.tu-cuenta.workers.dev", full: true,
          help: "Solo la ve y la cambia el dueño. Déjala vacía para no enviar notificaciones." }, app, () => { clearTimeout(espera); espera = setTimeout(probar, 700); })),
      estado);
  }

  // Días de la semana en el orden de Date.getDay(): 0 = domingo
  const DIAS_PORTADA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
  let diaPortada = "";
  VISTAS.portada = {
    titulo: "Portada del inicio",
    ayuda: "Imagen que acompaña al lema en la mitad izquierda de la portada. Puedes poner una distinta para cada día de la semana: el sitio usa el día que marca el equipo de quien lo visita. A la derecha se muestran solas las últimas 5 noticias en un carrusel.",
    render: () => {
      const d = state.data;
      const base = d.portada || (d.portada = {});
      const dias = base.dias || {};
      // Lo que se edita: la imagen predeterminada o la de un día
      const p = diaPortada === "" ? base : (dias[diaPortada] || {});
      const guardarDia = () => {
        if (diaPortada === "") return;
        const vacio = !Object.keys(p).some((k) => p[k]);
        if (vacio) delete dias[diaPortada]; else dias[diaPortada] = p;
        if (Object.keys(dias).length) base.dias = dias; else delete base.dias;
      };
      const c = d.colores || {};
      const foto = h("div", { class: "pv-hero__foto" }, h("img", { alt: "" }));
      const vista = h("div", { class: "pv-hero", style: `--p:${c.primario || "#0b1f3a"};--s:${c.secundario || "#1d4f91"};--a:${c.acento || "#c9a24b"}` },
        foto, h("div", { class: "pv-hero__txt" }, h("small", {}, "Iquique · Educación Básica y Media"), h("strong", {}, "Una escuela para ", h("em", {}, "aprender"), ", crecer y convivir")),
        h("div", { class: "pv-hero__card" }, h("span", {}, "Carrusel de noticias")));
      const estado = h("p", { class: "panel__help pv-hero__estado" });
      const pintar = () => {
        guardarDia();
        // La vista previa muestra lo que se vería ese día (o la predeterminada si el día no tiene imagen)
        const v = p.imagen ? p : base;
        const png = /\.png(\?|$)/i.test(v.imagen || "");
        const modo = v.modo || (png ? "original" : "duotono");
        const ajuste = v.ajuste || (modo === "original" && png ? "completa" : "cubrir");
        foto.hidden = !v.imagen;
        foto.className = `pv-hero__foto pv-hero__foto--${modo === "duotono" ? "duo" : "original"} pv-hero__foto--${ajuste}`;
        foto.style.opacity = { suave: ".3", media: ".55", fuerte: ".85" }[v.intensidad] || (modo === "duotono" ? ".55" : ".35");
        foto.firstChild.src = resolver(v.imagen || "");
        const quien = diaPortada === "" ? "Todos los días sin imagen propia" : `El ${DIAS_PORTADA[diaPortada].toLowerCase()}`;
        estado.textContent = !v.imagen ? `${quien}: sin imagen, la portada se ve como siempre.`
          : diaPortada !== "" && !p.imagen ? `${quien} no tiene imagen propia: se usa la predeterminada.`
          : `${quien}: se muestra ${modo === "duotono" ? "en duotono con los colores del sitio" : "con sus colores originales"}.`;
        chips.querySelectorAll("[data-dia]").forEach((b) => b.classList.toggle("tiene", !!(b.dataset.dia === "" ? base.imagen : dias[b.dataset.dia] && dias[b.dataset.dia].imagen)));
      };
      const limpiar = (k) => () => { if (!p[k]) delete p[k]; pintar(); };
      const hoy = new Date().getDay();
      const orden = [1, 2, 3, 4, 5, 6, 0];
      const chips = h("div", { class: "dias" },
        h("button", { type: "button", "data-dia": "", class: "dias__btn" + (diaPortada === "" ? " is-active" : "") }, "Predeterminada"),
        orden.map((i) => h("button", { type: "button", "data-dia": String(i), class: "dias__btn" + (diaPortada === String(i) ? " is-active" : ""), title: i === hoy ? "Hoy" : "" },
          DIAS_PORTADA[i] + (i === hoy ? " · hoy" : ""))));
      chips.addEventListener("click", (e) => {
        const b = e.target.closest("[data-dia]");
        if (!b) return;
        diaPortada = b.dataset.dia; render();
      });
      pintar();
      const titulo = diaPortada === "" ? "Imagen predeterminada" : "Imagen del " + DIAS_PORTADA[diaPortada].toLowerCase();
      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Imagen junto al lema"),
          h("p", { class: "panel__help" }, "Elige «Predeterminada» o un día. La predeterminada se usa los días que no tienen imagen propia. Los días con imagen aparecen marcados."),
          chips),
        h("div", { class: "panel" }, h("h2", {}, titulo),
          h("p", { class: "panel__help" }, "En automático, un PNG con fondo transparente se muestra suave y con sus propios colores, y una foto normal (JPG) se pinta en duotono con los colores de «Colores», para que combine con la portada; si cambias los colores, la imagen cambia con ellos."),
          h("div", { class: "grid2" },
            campo({ k: "imagen", label: "Imagen", type: "file", accept: "image/png,image/jpeg,image/webp", folder: "img/portada", ajustar: 1800, full: true,
              placeholder: diaPortada === "" ? "Sube un PNG transparente o una foto" : "Vacío: se usa la predeterminada" }, p, pintar),
            campo({ k: "modo", label: "Colores", type: "select", options: [["", "Automático"], ["original", "Colores originales"], ["duotono", "Duotono con los colores del sitio"]] }, p, limpiar("modo")),
            campo({ k: "ajuste", label: "Encaje", type: "select", options: [["", "Automático"], ["cubrir", "Cubrir toda la mitad (puede recortar)"], ["completa", "Mostrar la imagen completa"]] }, p, limpiar("ajuste")),
            campo({ k: "intensidad", label: "Intensidad", type: "select", options: [["", "Automática"], ["suave", "Suave (más transparente)"], ["media", "Media"], ["fuerte", "Fuerte"]] }, p, limpiar("intensidad"))),
          p.imagen ? h("p", {}, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
            ["imagen", "modo", "ajuste", "intensidad"].forEach((k) => delete p[k]);
            guardarDia(); setDirty(true); render();
          } }, diaPortada === "" ? "Quitar imagen predeterminada" : "Quitar imagen de este día")) : null),
        h("div", { class: "panel" }, h("h2", {}, "Vista previa"), vista, estado));
    },
  };

  VISTAS.logo = {
    titulo: "Logo y lema",
    ayuda: "Sube el logo o insignia del colegio. Se ajusta solo: se recortan los bordes vacíos y se reduce a un tamaño estándar, aunque la imagen original sea muy grande.",
    render: () => {
      const d = state.data;
      const actual = d.logo && d.logo.imagen ? d.logo : null;
      const info = h("p", { class: "logo__info" });
      const pintarInfo = () => {
        info.textContent = actual
          ? `Imagen guardada de ${actual.ancho} × ${actual.alto} px${actual.original ? ` (la original era de ${actual.original[0]} × ${actual.original[1]} px)` : ""}. Se muestra a 52 px de alto en la cabecera.`
          : "Ahora se muestra el escudo provisional «SM».";
      };
      pintarInfo();
      const marca = (claro) => actual
        ? h("img", { src: resolver(actual.imagen), alt: "Logo" })
        : h("span", { class: "logo__sm", html: '<svg viewBox="0 0 48 56"><path d="M24 2 4 9v17c0 14 9 23 20 28 11-5 20-14 20-28V9L24 2z" fill="currentColor"/><text x="24" y="33" text-anchor="middle" font-family="Fraunces, serif" font-size="15" font-weight="700" fill="#c9a24b">SM</text></svg>' });
      const c = d.colores || {};
      const vista = h("div", { class: "logo__preview" },
        h("div", { class: "logo__bar" }, h("span", { class: "logo__mark" }, marca(true)), h("span", { class: "logo__name", style: `color:${c.primario || "#0b1f3a"}` }, h("strong", {}, "Colegio San Martín"), h("small", {}, "Iquique"))),
        h("div", { class: "logo__bar logo__bar--pie", style: `background:${c.primario || "#0b1f3a"}` }, h("span", { class: "logo__mark logo__mark--pie" }, marca(false)), h("span", { class: "logo__name" }, h("strong", {}, "Colegio San Martín"), h("small", {}, "Pie de página"))),
        actual && actual.icono ? h("div", { class: "logo__icons" },
          h("div", { class: "logo__tab" }, h("img", { src: resolver(actual.icono), alt: "" }), h("span", {}, "Colegio San Martín Iquique"), h("small", {}, "Pestaña del navegador")),
          actual.apple ? h("div", { class: "logo__app" }, h("img", { src: resolver(actual.apple), alt: "" }), h("small", {}, "Acceso directo en el celular")) : null) : null);

      const input = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/svg+xml", class: "sr-only", onchange: async (e) => {
        const f = e.target.files[0];
        if (!f) return;
        toast("Ajustando y subiendo " + f.name + "…");
        try {
          const r = await procesarLogo(f);
          const nombre = slug(f.name.replace(/\.[^.]+$/, ""));
          const imagen = await subirArchivo(new File([r.grande], nombre + ".png", { type: "image/png" }), "img/logo");
          for (const ic of r.iconos) await subirFijo(ic.ruta, ic.blob, ic.dataUrl);
          d.logo = { imagen, icono: FAVICONS[0].ruta, apple: FAVICONS[2].ruta, version: Date.now().toString(36), ancho: r.ancho, alto: r.alto, original: r.original };
          setDirty(true); render();
          toast(`Logo ajustado de ${r.original[0]} × ${r.original[1]} a ${r.ancho} × ${r.alto} px. Presiona «${textoGuardar()}».`, "ok");
        } catch (err) {
          toast("No se pudo subir el logo: " + err.message, "error");
        } finally { e.target.value = ""; }
      } });

      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Imagen"),
          h("p", { class: "panel__help" }, "Ideal: PNG con fondo transparente. Se guarda con un máximo de 256 px de alto y con la misma imagen se crea el favicon: el ícono de la pestaña (32 px), el de Android (192 px) y el de iPhone (180 px, con fondo blanco)."),
          h("div", { class: "imp__btns" },
            h("label", { class: "btn btn--primary btn--sm" }, actual ? "Cambiar logo…" : "Subir logo…", input),
            actual ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
              if (!confirm("¿Quitar el logo y el favicon y volver al escudo provisional?")) return;
              borrarFavicons().catch((err) => toast("No se pudo borrar el favicon: " + err.message, "error"));
              delete d.logo; setDirty(true); render();
            } }, "Quitar logo") : null),
          info),
        h("div", { class: "panel" }, h("h2", {}, "Vista previa"), vista),
        h("div", { class: "panel" }, h("h2", {}, "Lema"),
          h("p", { class: "panel__help" }, "Frase breve que aparece junto a la cita de la portada, en «Nuestro colegio» y en el pie de página."),
          campo({ k: "lema", label: "Lema del colegio", full: true, placeholder: "Ej.: Aprender, crecer y convivir con sentido." }, d)));
    },
  };

  /* ==========================================================
     Horarios: importación desde Excel, colores y edición
     ========================================================== */
  const H = window.HORARIOS;
  const DIAS_N = H.DIAS.map(H.norm);
  const ultimoImport = {};

  // Antes de publicar: los bloques administrativos de un docente nunca llegan al sitio
  function prepararHorarios() {
    const hs = state.data.horarios;
    hs.docentes.forEach((d) => d.filas.forEach((f) => { f.celdas = f.celdas.map((c) => (H.esAdministrativo(c) ? "" : c)); }));
    const usadas = new Set(H.asignaturas(hs.cursos.concat(hs.docentes)).concat(hs.asignaturas).map(H.norm));
    for (const k in hs.colores) if (!usadas.has(H.norm(k))) delete hs.colores[k];
  }

  // El lector de Excel (SheetJS) solo se descarga cuando se usa
  let xlsxListo = null;
  const cargarXLSX = () => xlsxListo || (xlsxListo = new Promise((ok, fail) => {
    if (window.XLSX) return ok(window.XLSX);
    const sc = document.createElement("script");
    sc.src = "vendor/xlsx/xlsx.core.min.js";
    sc.onload = () => ok(window.XLSX);
    sc.onerror = () => { xlsxListo = null; fail(new Error("No se pudo cargar el lector de Excel.")); };
    document.head.append(sc);
  }));

  // Las celdas combinadas (un bloque doble, un recreo de lado a lado) se repiten en cada celda
  function rellenarCombinadas(ws, XLSX) {
    (ws["!merges"] || []).forEach((m) => {
      const origen = ws[XLSX.utils.encode_cell(m.s)];
      if (!origen) return;
      for (let r = m.s.r; r <= m.e.r; r++) for (let c = m.s.c; c <= m.e.c; c++) {
        if (r !== m.s.r || c !== m.s.c) ws[XLSX.utils.encode_cell({ r, c })] = { ...origen };
      }
    });
  }

  // Una hoja = un horario. Busca la fila con los días; las columnas anteriores a «Lunes» forman la hora.
  function leerHoja(nombreHoja, ws, XLSX) {
    rellenarCombinadas(ws, XLSX);
    const filas = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "", blankrows: false });
    const iHead = filas.findIndex((r) => r.some((c) => H.norm(c) === "lunes"));
    if (iHead < 0) return null;
    const head = filas[iHead].map(H.norm);
    const cols = DIAS_N.map((d) => head.findIndex((x) => x === d || x === d.slice(0, 3)));
    const primeraDia = Math.min(...cols.filter((c) => c >= 0));
    const titulo = filas.slice(0, iHead).flat().map((c) => String(c).trim()).find(Boolean);
    const nombre = (titulo || nombreHoja).replace(/^(curso|docente|profesora?|nombre)\s*:\s*/i, "").trim();
    const out = filas.slice(iHead + 1).map((r) => ({
      hora: r.slice(0, primeraDia).map((c) => String(c).trim()).filter(Boolean).join(" – "),
      celdas: cols.map((c) => (c >= 0 ? String(r[c] || "").trim() : "")),
    })).filter((f) => f.hora || f.celdas.some(Boolean));
    return out.length ? { nombre, filas: out } : null;
  }

  // Todas las asignaturas: las agregadas a mano y las que aparecen en algún horario
  const todasAsignaturas = () => {
    const hs = state.data.horarios, vistas = new Map();
    hs.asignaturas.concat(H.asignaturas(hs.cursos.concat(hs.docentes))).forEach((a) => { if (a && !vistas.has(H.norm(a))) vistas.set(H.norm(a), a); });
    return [...vistas.values()];
  };

  // Da un color de la paleta a cada asignatura que aún no tiene uno
  function asignarColores() {
    const c = state.data.horarios.colores;
    const usados = new Set(Object.values(c));
    todasAsignaturas().forEach((a) => {
      if (Object.keys(c).some((k) => H.norm(k) === H.norm(a))) return;
      const libre = H.PALETA.find((x) => !usados.has(x)) || H.color(a, {});
      c[a] = libre; usados.add(libre);
    });
  }

  async function importarExcel(file, tipo) {
    const XLSX = await cargarXLSX();
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const leidos = wb.SheetNames.map((n) => leerHoja(n, wb.Sheets[n], XLSX)).filter(Boolean);
    if (!leidos.length) throw new Error("No encontré ninguna hoja con la fila de días (Lunes, Martes…). Usa la plantilla.");
    let omitidos = 0;
    if (tipo === "docentes") leidos.forEach((x) => x.filas.forEach((f) => {
      f.celdas = f.celdas.map((c) => (H.esAdministrativo(c) ? (omitidos++, "") : c));
    }));
    const lista = state.data.horarios[tipo];
    let nuevos = 0;
    leidos.forEach((x) => {
      const i = lista.findIndex((y) => H.norm(y.nombre) === H.norm(x.nombre));
      if (i >= 0) lista[i] = x; else { lista.push(x); nuevos++; }
    });
    asignarColores();
    setDirty(true);
    return { nombres: leidos.map((x) => x.nombre), nuevos, actualizados: leidos.length - nuevos, omitidos };
  }

  const BLOQUES = [["08:00 - 08:45"], ["08:45 - 09:30"], ["09:30 - 09:45", "Recreo"], ["09:45 - 10:30"], ["10:30 - 11:15"],
    ["11:15 - 11:30", "Recreo"], ["11:30 - 12:15"], ["12:15 - 13:00"], ["13:00 - 13:45", "Almuerzo"], ["13:45 - 14:30"], ["14:30 - 15:15"]];
  const EJEMPLOS = {
    cursos: [
      ["1° básico A", [
        ["Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación"],
        ["Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación", "Matemática", "Lenguaje y Comunicación"],
        ["Matemática", "Ciencias Naturales", "Inglés", "Historia y Geografía", "Educación Física"],
        ["Matemática", "Ciencias Naturales", "Inglés", "Historia y Geografía", "Educación Física"],
        ["Artes Visuales", "Música", "Educación Física", "Religión", "Orientación"],
        ["Artes Visuales", "Música", "Educación Física", "Tecnología", "Orientación"],
        ["Historia y Geografía", "Lenguaje y Comunicación", "Ciencias Naturales", "Lenguaje y Comunicación", ""],
        ["Taller de lectura", "Lenguaje y Comunicación", "Matemática", "Taller de lectura", ""],
      ]],
      ["3° medio A", [
        ["Lengua y Literatura", "Matemática", "Biología / Economía y sociedad", "Inglés", "Filosofía"],
        ["Lengua y Literatura", "Matemática", "Biología / Economía y sociedad", "Inglés", "Filosofía"],
        ["Educación Ciudadana", "Ciencias para la Ciudadanía", "Matemática", "Física / Comprensión histórica del presente", "Lengua y Literatura"],
        ["Educación Ciudadana", "Ciencias para la Ciudadanía", "Matemática", "Física / Comprensión histórica del presente", "Lengua y Literatura"],
        ["Científico: Química · Laboratorio | Humanista: Participación y argumentación · Sala 8", "Educación Física · Gimnasio", "Inglés", "Matemática", "Orientación"],
        ["Científico: Química · Laboratorio | Humanista: Participación y argumentación · Sala 8", "Educación Física · Gimnasio", "Inglés", "Matemática", "Religión"],
        ["Matemática", "Lengua y Literatura", "Artes Visuales", "Lengua y Literatura", ""],
        ["Matemática", "Lengua y Literatura", "Artes Visuales", "Lengua y Literatura", ""],
      ]],
      ["7° básico A", [
        ["Matemática · Sala 12", "Lengua y Literatura · Sala 12", "Ciencias Naturales · Laboratorio", "Matemática · Sala 12", "Inglés · Sala 12"],
        ["Matemática · Sala 12", "Lengua y Literatura · Sala 12", "Ciencias Naturales · Laboratorio", "Matemática · Sala 12", "Inglés · Sala 12"],
        ["Historia y Geografía", "Educación Física · Gimnasio", "Lengua y Literatura", "Tecnología · Sala de computación", "Música"],
        ["Historia y Geografía", "Educación Física · Gimnasio", "Lengua y Literatura", "Tecnología · Sala de computación", "Música"],
        ["Inglés", "Matemática", "Historia y Geografía", "Artes Visuales", "Orientación"],
        ["Inglés", "Matemática", "Historia y Geografía", "Artes Visuales", "Religión"],
        ["Lengua y Literatura", "Ciencias Naturales", "Educación Física · Gimnasio", "Lengua y Literatura", ""],
        ["Lengua y Literatura", "Ciencias Naturales", "Educación Física · Gimnasio", "Lengua y Literatura", ""],
      ]],
    ],
  };
  const INSTRUCCIONES = (tipo) => [
    [`Plantilla de horarios de ${tipo === "cursos" ? "cursos" : "docentes"} · Colegio San Martín Iquique`],
    [],
    ["1. Cada hoja es un horario. Escribe el nombre del " + (tipo === "cursos" ? "curso (ej.: 1° básico A)" : "docente, tal como aparece en el sitio") + " en la celda A1. Si la dejas vacía se usa el nombre de la hoja."],
    ["2. La fila de títulos debe decir: Hora, Lunes, Martes, Miércoles, Jueves, Viernes. También puedes usar dos columnas, Inicio y Fin, en lugar de Hora."],
    ["3. En cada celda escribe la asignatura. Para agregar sala o curso usa « · » o un salto de línea. Ejemplo: Matemática · Sala 12."],
    ["4. Recreos y almuerzo: escribe «Recreo» o «Almuerzo» en la columna Hora o en todas las celdas de esa fila."],
    ["5. Bloques dobles: repite la asignatura en filas seguidas o combina las celdas; en el sitio se unen solos."],
    ...(tipo === "cursos" ? [
      ["Electivos (un mismo bloque dividido entre planes): separa las asignaturas con « / ». La primera es del plan Científico y la segunda del Humanista. Ejemplo: Biología / Economía y sociedad."],
      ["   Para poner otros nombres de plan o salas, usa « | »: Científico: Química · Laboratorio | Humanista: Participación y argumentación · Sala 8."],
    ] : []),
    [],
    ["Puedes agregar todas las hojas que necesites. Esta hoja de instrucciones se ignora al importar."],
  ];

  function hojaHorario(XLSX, nombre, filas) {
    const ws = XLSX.utils.aoa_to_sheet([[nombre], [], ["Hora"].concat(H.DIAS)].concat(filas.map((f) => [f.hora].concat(f.celdas))));
    ws["!cols"] = [{ wch: 16 }].concat(H.DIAS.map(() => ({ wch: 26 })));
    return ws;
  }
  const nombreHoja = (n, usados) => {
    let base = (n || "Horario").replace(/[\\/?*[\]:]/g, " ").slice(0, 28).trim() || "Horario", x = base, i = 2;
    while (usados.has(x.toLowerCase())) x = `${base} ${i++}`;
    usados.add(x.toLowerCase());
    return x;
  };

  async function descargarExcel(tipo, actuales) {
    try {
      const XLSX = await cargarXLSX();
      const wb = XLSX.utils.book_new();
      const usados = new Set(["instrucciones"]);
      const ins = XLSX.utils.aoa_to_sheet(INSTRUCCIONES(tipo));
      ins["!cols"] = [{ wch: 120 }];
      XLSX.utils.book_append_sheet(wb, ins, "Instrucciones");
      const lista = actuales ? state.data.horarios[tipo]
        : EJEMPLOS[tipo].map(([nombre, celdas]) => {
          let k = 0;
          return { nombre, filas: BLOQUES.map(([hora, pausa]) => ({ hora, celdas: pausa ? H.DIAS.map(() => pausa) : celdas[k++] })) };
        });
      lista.forEach((x) => XLSX.utils.book_append_sheet(wb, hojaHorario(XLSX, x.nombre, x.filas), nombreHoja(x.nombre, usados)));
      XLSX.writeFile(wb, actuales ? `horarios-${tipo}.xlsx` : `plantilla-horarios-${tipo}.xlsx`);
    } catch (e) {
      toast(e.message, "error");
    }
  }

  // Tabla editable de un horario; cada celda toma el color de su asignatura
  function editorGrilla(hor, avisar, esDocente) {
    const cont = h("div", { class: "grid-ed" });
    hor.filas = hor.filas || [];
    // Sugerencias al escribir: todas las asignaturas conocidas
    const listaId = "asig-" + Math.random().toString(36).slice(2, 8);
    let enfocada = null;
    // Convierte la celda elegida en un electivo dividido entre Científico y Humanista
    const hacerElectivo = () => {
      if (!enfocada) return toast("Primero toca la celda del bloque que quieres dividir.", "error");
      const { inp, f, d } = enfocada;
      const v = inp.value.trim();
      if (H.electivos(v)) { inp.focus(); return toast("Esa celda ya es un electivo. Escribe cada asignatura después de «Científico:» y «Humanista:».", "ok"); }
      inp.value = f.celdas[d] = `${H.GRUPOS[0]}: ${v || "Asignatura"} | ${H.GRUPOS[1]}: `;
      tintar(inp); avisar(); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
    };
    const tintar = (inp) => {
      const v = inp.value.trim();
      const e = v && H.electivos(v);
      const bg = !v ? "" : esDocente && H.esAdministrativo(v) ? "#ececec" : H.pausa({ celdas: [v] }) ? "#f3efe4" : H.color(H.asignatura(v), state.data.horarios.colores);
      if (e) {
        // Un electivo se ve con los colores de cada plan, lado a lado
        const cs = e.map((x) => H.color(x.asignatura, state.data.horarios.colores));
        inp.style.background = `linear-gradient(90deg, ${cs.map((c, i) => `${c} ${(i * 100) / cs.length}% ${((i + 1) * 100) / cs.length}%`).join(", ")})`;
      } else inp.style.background = bg;
      inp.style.color = bg ? H.tinta(bg) : "";
      inp.title = e ? e.map((x) => `${x.grupo ? x.grupo + ": " : ""}${x.asignatura}${x.detalle ? " · " + x.detalle : ""}`).join("\n") : "";
      inp.classList.toggle("is-oculto", esDocente && H.esAdministrativo(v));
    };
    const pintar = () => {
      const filas = hor.filas.map((f, r) => {
        f.celdas = H.DIAS.map((_, d) => (f.celdas || [])[d] || "");
        return h("tr", {},
          h("td", {}, h("input", { value: f.hora || "", placeholder: "08:00 - 08:45", "aria-label": "Hora", oninput: (e) => { f.hora = e.target.value; avisar(); } })),
          H.DIAS.map((dia, d) => {
            const inp = h("input", { value: f.celdas[d], "aria-label": dia, list: listaId, onfocus: () => { enfocada = { inp, f, d }; },
              oninput: (e) => { f.celdas[d] = e.target.value; tintar(inp); avisar(); } });
            tintar(inp);
            return h("td", {}, inp);
          }),
          h("td", {}, h("button", { type: "button", class: "icon-btn icon-btn--danger", title: "Quitar bloque", "aria-label": "Quitar bloque",
            onclick: () => { hor.filas.splice(r, 1); avisar(); pintar(); } }, "✕")));
      });
      cont.replaceChildren(
        h("datalist", { id: listaId }, todasAsignaturas().map((a) => h("option", { value: a }))),
        h("div", { class: "grid-ed__scroll" }, h("table", {},
          h("thead", {}, h("tr", {}, h("th", {}, "Hora"), H.DIAS.map((d) => h("th", {}, d)), h("th", {}))),
          h("tbody", {}, filas))),
        h("div", { class: "grid-ed__foot" },
          h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => { hor.filas.push({ hora: "", celdas: H.DIAS.map(() => "") }); avisar(); pintar(); } }, "+ Agregar bloque"),
          esDocente ? null : h("button", { type: "button", class: "btn btn--ghost btn--sm", onmousedown: (e) => e.preventDefault(), onclick: hacerElectivo,
            title: "Divide la celda seleccionada entre Científico y Humanista" }, "Dividir en electivo"),
          h("small", {}, esDocente
            ? "Escribe «Recreo» o «Almuerzo» en toda la fila para una pausa. Los bloques «Administrativo» o «Planificación» se ven en gris y no se publican."
            : "Escribe «Recreo» o «Almuerzo» en toda la fila para una pausa. Usa « · » para agregar la sala: Matemática · Sala 12. Electivo: separa con « / », por ejemplo Biología / Economía y sociedad (la primera es Científico y la segunda Humanista).")));
    };
    pintar();
    return cont;
  }

  VISTAS.horarios = {
    titulo: "Horarios",
    ayuda: "Horarios de clases de cada curso. Impórtalos desde Excel o edítalos aquí. El color de cada celda depende de la asignatura.",
    render: () => {
      const hs = state.data.horarios;

      const importador = (tipo, titulo, texto) => {
        const r = ultimoImport[tipo];
        const input = h("input", { type: "file", accept: ".xlsx,.xls,.ods,.csv", class: "sr-only", onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          toast("Leyendo " + f.name + "…");
          try {
            ultimoImport[tipo] = await importarExcel(f, tipo);
            toast(`Horarios importados. Revisa y presiona «${textoGuardar()}».`, "ok");
            render();
          } catch (err) {
            toast("No se pudo importar: " + err.message, "error");
          } finally { e.target.value = ""; }
        } });
        return h("div", { class: "imp" },
          h("h3", {}, titulo), h("p", {}, texto),
          h("div", { class: "imp__btns" },
            h("label", { class: "btn btn--primary btn--sm" }, "Importar Excel…", input),
            h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => descargarExcel(tipo, false) }, "Descargar plantilla"),
            hs[tipo].length ? h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => descargarExcel(tipo, true) }, "Exportar actuales") : null),
          r ? h("p", { class: "imp__res" },
            `Importé ${r.nombres.length} ${r.nombres.length === 1 ? "horario" : "horarios"} (${r.nuevos} ${r.nuevos === 1 ? "nuevo" : "nuevos"}, ${r.actualizados} ${r.actualizados === 1 ? "reemplazado" : "reemplazados"}): ${r.nombres.join(", ")}.`,
            r.omitidos ? ` Omití ${r.omitidos} ${r.omitidos === 1 ? "bloque administrativo" : "bloques administrativos"}, que no se publican.` : "") : null);
      };

      const asigs = todasAsignaturas();
      const enUso = new Set(H.asignaturas(hs.cursos.concat(hs.docentes)).map(H.norm));
      const colores = asigs.length ? h("div", { class: "subj" }, asigs.map((a) => {
        const k = Object.keys(hs.colores).find((x) => H.norm(x) === H.norm(a)) || a;
        const bg = H.color(a, hs.colores);
        const muestra = h("span", { class: "subj__chip", style: `background:${bg};color:${H.tinta(bg)}` }, a);
        const inp = h("input", { type: "color", value: bg, "aria-label": "Color de " + a, oninput: (e) => {
          hs.colores[k] = e.target.value;
          muestra.style.background = e.target.value; muestra.style.color = H.tinta(e.target.value);
          setDirty(true);
        } });
        // Una asignatura agregada a mano que no está en ningún horario se puede quitar
        const quitar = enUso.has(H.norm(a)) ? null : h("button", { type: "button", class: "subj__x", title: "Quitar asignatura", "aria-label": "Quitar " + a,
          onclick: (e) => { e.preventDefault(); hs.asignaturas = hs.asignaturas.filter((x) => H.norm(x) !== H.norm(a)); delete hs.colores[k]; setDirty(true); render(); } }, "✕");
        return h("div", { class: "subj__item" }, h("label", { class: "subj__pick" }, inp, muestra), quitar);
      })) : h("p", { class: "empty" }, "Aún no hay asignaturas. Agrégalas aquí abajo o importa un horario.");
      // Agregar una asignatura nueva con su color
      const libre = H.PALETA.find((x) => !Object.values(hs.colores).includes(x)) || H.PALETA[0];
      const nuevaNombre = h("input", { type: "text", placeholder: "Ej.: Economía y sociedad", "aria-label": "Nombre de la asignatura", maxlength: 60 });
      const nuevaColor = h("input", { type: "color", value: libre, "aria-label": "Color de la asignatura" });
      const agregar = () => {
        const n = nuevaNombre.value.trim().replace(/\s+/g, " ");
        if (!n) return toast("Escribe el nombre de la asignatura.", "error");
        if (/[|/·:]/.test(n)) return toast("El nombre no puede llevar « / », « | », « · » ni « : ».", "error");
        if (asigs.some((x) => H.norm(x) === H.norm(n))) return toast("Esa asignatura ya existe.", "error");
        hs.asignaturas.push(n); hs.colores[n] = nuevaColor.value;
        setDirty(true); render();
        toast(`Agregué «${n}». Ya aparece como sugerencia al escribir en los horarios.`, "ok");
      };
      nuevaNombre.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); agregar(); } });
      const nueva = h("div", { class: "subj__nueva" }, nuevaColor, nuevaNombre,
        h("button", { type: "button", class: "btn btn--primary btn--sm", onclick: agregar }, "+ Agregar asignatura"));

      const lista = (tipo) => editorLista({
        items: hs[tipo],
        textoAgregar: tipo === "cursos" ? "Agregar curso" : "Agregar docente",
        vacio: tipo === "cursos" ? "Aún no hay horarios de cursos." : "Aún no hay horarios de docentes.",
        nuevo: () => {
          const base = hs.cursos[0] || hs.docentes[0];
          const horas = base ? base.filas.map((f) => [f.hora, H.pausa(f)]) : BLOQUES;
          return { nombre: "", filas: horas.map(([hora, p]) => ({ hora, celdas: H.DIAS.map(() => p || "") })) };
        },
        resumen: (it) => [it.nombre, `${(it.filas || []).filter((f) => !H.pausa(f)).length} bloques`],
        miniatura: (it, el) => {
          const n = it.nombre || "?";
          el.textContent = tipo === "cursos" ? (n.match(/\d+°?/) || [n.slice(0, 2)])[0] + ((n.match(/\b[A-Z]$/) || [""])[0])
            : n.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
        },
        campos: [
          { k: "nombre", label: tipo === "cursos" ? "Curso" : "Docente", full: true,
            placeholder: tipo === "cursos" ? "Ej.: 1° básico A" : "Nombre completo, igual que en «Docentes y personal»" },
          { k: "filas", label: "Horario", type: "custom", full: true, render: (obj, avisar) => editorGrilla(obj, avisar, tipo === "docentes") },
        ],
      });

      return h("div", {},
        h("div", { class: "panel" }, h("h2", {}, "Importar desde Excel"),
          h("div", { class: "imps" },
            importador("cursos", "Horarios de cursos", "Una hoja por curso. Si un curso ya existe, se reemplaza."))),
        h("div", { class: "panel" }, h("h2", {}, "Asignaturas y colores"),
          h("p", { class: "panel__help" }, "Cada asignatura tiene su color en todos los horarios. Toca el cuadro de color para cambiarlo. Agrega asignaturas nuevas (por ejemplo, electivos como Biología o Economía y sociedad) para tenerlas como sugerencia al escribir."),
          colores, nueva,
          asigs.length ? h("div", { class: "add-row" }, h("button", { type: "button", class: "btn btn--ghost btn--sm", onclick: () => {
            if (!confirm("¿Volver a asignar los colores automáticamente? Se perderán los colores que elegiste.")) return;
            state.data.horarios.colores = {}; asignarColores(); setDirty(true); render();
          } }, "Reasignar colores automáticamente")) : null),
        h("h2", { class: "sec-title" }, "Horarios de cursos"), lista("cursos"));
    },
  };

  /* ==========================================================
     Editor de página: HTML y CSS de cada página + Estilo visual
     ========================================================== */
  const SITIO = new URL("../", location.href).href;
  const PAGINAS = [
    { id: "inicio", ruta: "/index", nombre: "Inicio", archivo: "index.html", url: "" },
    { id: "colegio", ruta: "/colegio", nombre: "Nuestro colegio", archivo: "colegio/index.html", url: "colegio/" },
    { id: "directivos", ruta: "/directivos", nombre: "Equipo directivo", archivo: "directivos/index.html", url: "directivos/" },
    { id: "docentes", ruta: "/docentes", nombre: "Docentes", archivo: "docentes/index.html", url: "docentes/" },
    { id: "equipos", ruta: "/equipos", nombre: "Equipos y funcionarios", archivo: "equipos/index.html", url: "equipos/" },
    { id: "cgpa-ceal", ruta: "/cgpa-ceal", nombre: "CGPA y CEAL", archivo: "cgpa-ceal/index.html", url: "cgpa-ceal/" },
    { id: "departamentos", ruta: "/departamentos", nombre: "Departamentos", archivo: "departamentos/index.html", url: "departamentos/" },
    { id: "noticias", ruta: "/noticias", nombre: "Noticias", archivo: "noticias/index.html", url: "noticias/" },
    { id: "noticia", ruta: "/noticia", nombre: "Página de una noticia", archivo: "noticia/index.html", url: "noticia/" },
    { id: "calendario", ruta: "/calendario", nombre: "Calendario escolar", archivo: "calendario/index.html", url: "calendario/" },
    { id: "galeria", ruta: "/galeria", nombre: "Galería de fotos", archivo: "galeria/index.html", url: "galeria/" },
    { id: "horarios", ruta: "/horarios", nombre: "Horarios", archivo: "horarios/index.html", url: "horarios/" },
    { id: "admision", ruta: "/admision", nombre: "Admisión", archivo: "admision/index.html", url: "admision/" },
    { id: "documentos", ruta: "/documentos", nombre: "Documentos", archivo: "documentos/index.html", url: "documentos/" },
    { id: "emergencias", ruta: "/emergencias", nombre: "Emergencias y tsunami", archivo: "emergencias/index.html", url: "emergencias/" },
    { id: "contacto", ruta: "/contacto", nombre: "Contacto", archivo: "contacto/index.html", url: "contacto/" },
  ];
  const HOJAS = [{ id: "global", ruta: "Global", nombre: "Todas las páginas", archivo: "css/estilos.css", pagina: PAGINAS[0] }]
    .concat(PAGINAS.map((p) => ({ id: p.id, ruta: p.ruta, nombre: p.nombre, archivo: `css/paginas/${p.id}.css`, pagina: p })));

  // Zonas que el panel rellena con datos al cargar la página
  const ZONAS = {
    news: "Noticias", team: "Directivos", depts: "Departamentos", docs: "Documentos",
    socialGrid: "Redes sociales", pillars: "Pilares", staff: "Docentes o equipos", timetable: "Horarios", orgs: "CGPA y CEAL", heroNewsTitle: "Último comunicado de la portada", noticiaVer: "Texto de la noticia", contactForm: "Formulario de contacto",
    proximosEventos: "Próximos eventos", calGrilla: "Calendario", calLista: "Eventos del mes", galeria: "Galería de fotos",
    emergZonaDatos: "Zona de seguridad (Emergencias)",
  };

  const editor = { archivo: null, sha: null, original: "", dirty: false, api: null };
  const editorSucio = () => editor.dirty;
  window.addEventListener("beforeunload", (e) => { if (editor.dirty) { e.preventDefault(); e.returnValue = ""; } });

  async function leerArchivo(ruta, ref) {
    const f = await gh(`/contents/${ruta}?ref=${encodeURIComponent(ref || state.branch)}`);
    return { texto: b64ToUtf8(f.content), sha: f.sha };
  }

  function crearEditorCodigo(padre, modo, valor, onChange) {
    if (window.CodeMirror) {
      const cm = window.CodeMirror(padre, {
        value: valor, mode: modo === "html" ? "htmlmixed" : "css", lineNumbers: true, lineWrapping: true,
        tabSize: 2, indentUnit: 2, viewportMargin: 50,
      });
      cm.on("change", () => onChange(cm.getValue()));
      setTimeout(() => cm.refresh(), 0);
      return { get: () => cm.getValue(), set: (v) => cm.setValue(v) };
    }
    const ta = h("textarea", { class: "code-fallback", spellcheck: "false", oninput: () => onChange(ta.value) });
    ta.value = valor;
    padre.append(ta);
    return { get: () => ta.value, set: (v) => { ta.value = v; onChange(v); } };
  }

  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  function vistaPrevia() {
    return h("iframe", { class: "preview-frame", title: "Vista previa", loading: "lazy" });
  }

  function pintarHTMLPrevia(frame, item, texto) {
    const base = `<base href="${SITIO + item.url}">`;
    frame.srcdoc = /<head[^>]*>/i.test(texto) ? texto.replace(/<head[^>]*>/i, (m) => m + base) : base + texto;
  }

  function pintarCSSPrevia(frame, hoja, texto) {
    try {
      const doc = frame.contentDocument;
      if (!doc || !doc.head) return;
      const link = [...doc.querySelectorAll('link[rel="stylesheet"]')].find((l) => l.href.endsWith(hoja.archivo));
      if (link) link.disabled = true;
      let st = doc.getElementById("__preview_css");
      if (!st) { st = doc.createElement("style"); st.id = "__preview_css"; (link || doc.head.lastChild).after(st); }
      st.textContent = texto;
    } catch (e) { /* la vista previa no está disponible */ }
  }

  function vistaEditorArchivos(tipo) {
    const lista = tipo === "html" ? PAGINAS : HOJAS;
    const wrap = h("div", { class: "editor" });
    const side = h("nav", { class: "editor__files", "aria-label": tipo === "html" ? "Páginas" : "Hojas de estilo" });
    const area = h("div", { class: "editor__area" }, h("p", { class: "empty" }, "Elige " + (tipo === "html" ? "una página" : "una hoja de estilo") + " para editarla."));
    lista.forEach((it) => side.append(h("button", {
      type: "button", "data-file": it.archivo, class: editor.archivo === it.archivo ? "is-active" : "",
      onclick: () => abrir(it),
    }, h("code", {}, it.ruta), h("small", {}, it.nombre))));
    wrap.append(side, area);

    async function abrir(it) {
      if (editor.dirty && !confirm("Tienes cambios sin guardar en " + editor.archivo + ". ¿Descartarlos?")) return;
      side.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.file === it.archivo));
      area.replaceChildren(h("p", { class: "empty" }, "Cargando " + it.archivo + "…"));
      let f;
      try { f = await leerArchivo(it.archivo); } catch (e) {
        if (e.status === 404 && tipo === "css") f = { texto: `/* Estilos propios de la página ${it.ruta} */\n`, sha: null };
        else { area.replaceChildren(h("p", { class: "empty" }, "No se pudo abrir el archivo: " + e.message)); return; }
      }
      Object.assign(editor, { archivo: it.archivo, sha: f.sha, original: f.texto, dirty: false });

      const estado = h("span", { class: "editor__state" }, "Sin cambios");
      const marcar = (texto) => {
        editor.dirty = texto !== editor.original;
        estado.textContent = editor.dirty ? "Cambios sin guardar" : "Sin cambios";
        estado.classList.toggle("is-dirty", editor.dirty);
        btnGuardar.disabled = !editor.dirty;
      };
      const frame = vistaPrevia();
      const refrescar = debounce((texto) => tipo === "html" ? pintarHTMLPrevia(frame, it, texto) : pintarCSSPrevia(frame, it, texto), 450);

      const btnGuardar = h("button", { class: "btn btn--primary btn--sm", disabled: true,
        onclick: async () => { btnGuardar.disabled = true; await guardarArchivo(it, tipo); marcar(editor.api.get()); } }, textoGuardar());
      const btnDeshacer = h("button", { class: "btn btn--ghost btn--sm", onclick: () => { if (confirm("¿Volver a la versión publicada?")) editor.api.set(editor.original); } }, "Descartar cambios");
      const historial = h("select", { class: "editor__history", "aria-label": "Versiones anteriores", onchange: async (e) => {
        const sha = e.target.value; e.target.value = "";
        if (!sha) return;
        try {
          const v = await leerArchivo(it.archivo, sha);
          editor.api.set(v.texto);
          toast(`Versión cargada en el editor. Revísala y presiona «${textoGuardar()}» para restaurarla.`);
        } catch (err) { toast("No se pudo cargar esa versión: " + err.message, "error"); }
      } }, h("option", { value: "" }, "Historial de versiones…"));
      gh(`/commits?path=${encodeURIComponent(it.archivo)}&sha=${encodeURIComponent(state.branch)}&per_page=15`).then((commits) => {
        commits.forEach((c) => historial.append(h("option", { value: c.sha },
          new Date(c.commit.author.date).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) + " · " + c.commit.message.split("\n")[0].slice(0, 50))));
      }).catch(() => {});

      const nota = tipo === "html" ? notaZonas(f.texto) : h("p", { class: "editor__note" },
        it.id === "global"
          ? "Esta hoja define el diseño de todo el sitio. Para cambios simples (botones, fondos, fuentes) es más seguro usar «Estilo visual»."
          : `Las reglas que escribas aquí solo afectan a la página ${it.ruta} y se aplican encima de la hoja global.`);

      const codigo = h("div", { class: "editor__code" });
      area.replaceChildren(
        h("div", { class: "editor__bar" },
          h("div", {}, h("strong", {}, it.ruta), " ", h("code", { class: "editor__path" }, it.archivo), " ", estado),
          h("div", { class: "editor__actions" }, historial, btnDeshacer, btnGuardar)),
        nota,
        h("div", { class: "editor__split" }, codigo, h("div", { class: "editor__preview" },
          h("div", { class: "editor__previewbar" }, "Vista previa", h("a", { href: SITIO + (it.pagina || it).url, target: "_blank", rel: "noopener" }, "Abrir página ↗")), frame)));

      editor.api = crearEditorCodigo(codigo, tipo, f.texto, (texto) => { marcar(texto); refrescar(texto); });
      if (tipo === "html") pintarHTMLPrevia(frame, it, f.texto);
      else {
        frame.addEventListener("load", () => pintarCSSPrevia(frame, it, editor.api.get()));
        frame.src = SITIO + it.pagina.url;
      }
    }

    if (editor.archivo) {
      const actual = lista.find((x) => x.archivo === editor.archivo);
      editor.archivo = null; editor.dirty = false;
      if (actual) setTimeout(() => abrir(actual));
    }
    return wrap;
  }

  function notaZonas(texto) {
    const presentes = Object.keys(ZONAS).filter((id) => new RegExp(`id="${id}"`).test(texto));
    if (!presentes.length) return h("p", { class: "editor__note" }, "La cabecera, el menú y el pie de página son comunes a todas las páginas y no aparecen en este archivo.");
    return h("div", { class: "editor__note" },
      h("strong", {}, "Zonas automáticas: "),
      "estos bloques los rellena el panel con sus listas al cargar la página: ",
      presentes.map((id, i) => [i ? ", " : "", h("code", {}, `id="${id}"`), ` (${ZONAS[id]})`]),
      ". Puedes moverlos o cambiar el texto que los rodea, pero no borres su id ni escribas dentro: ese contenido se reemplaza. La cabecera, el menú y el pie son comunes a todas las páginas y no aparecen aquí.");
  }

  async function guardarArchivo(it, tipo) {
    const texto = editor.api.get();
    if (tipo === "html") {
      const faltan = Object.keys(ZONAS).filter((id) => editor.original.includes(`id="${id}"`) && !texto.includes(`id="${id}"`));
      if (faltan.length && !confirm("Se eliminaron zonas automáticas: " + faltan.map((id) => ZONAS[id]).join(", ") +
        ". Esa información dejará de mostrarse en la página. ¿Guardar de todos modos?")) return false;
      const doc = new DOMParser().parseFromString(texto, "text/html");
      if (!doc.querySelector('script[src*="layout.js"]') && !confirm("La página ya no carga la cabecera y el pie (js/layout.js). ¿Guardar de todos modos?")) return false;
    }
    try {
      const res = await escribir(it.archivo, utf8ToB64(texto), `Editar ${it.archivo} desde el panel`, { sha: editor.sha || null });
      Object.assign(editor, { original: texto, dirty: false });
      if (state.modo !== "revision") {
        editor.sha = res.content.sha;
        toast("Archivo publicado. El sitio se actualiza en 1 o 2 minutos.", "ok");
      } else {
        await enviar("Editar " + it.archivo);
        toast(state.rol === "trabajador" && tipo === "html"
          ? "Cambio enviado. Los cambios en el HTML se publican cuando el dueño los aprueba."
          : "Cambio enviado. Se revisa y publica solo en 1 o 2 minutos.", "ok");
      }
      return true;
    } catch (e) {
      toast(e.status === 409 || e.status === 422
        ? "El archivo cambió en GitHub desde que lo abriste. Copia tus cambios, recarga y vuelve a intentarlo."
        : "No se pudo guardar: " + e.message, "error");
      return false;
    }
  }

  /* ---------- Estilo visual ---------- */
  function vistaEstilo() {
    const est = state.data.estilo;
    let alcance = state.estiloAlcance || "global";
    const OP = window.ESTILO.OPCIONES;
    const valoresDe = (a) => a === "global" ? est.global : (est.paginas[a] = est.paginas[a] || {});
    const paginaPrevia = () => alcance === "global" ? PAGINAS[0] : PAGINAS.find((p) => p.id === alcance);

    const frame = vistaPrevia();
    const aplicarPrevia = () => {
      try {
        const w = frame.contentWindow;
        if (!w || !w.ESTILO) return;
        const p = paginaPrevia();
        (w.SITE && w.SITE.ready ? w.SITE.ready : Promise.resolve()).then(() => w.ESTILO.aplicar(est, p.id));
      } catch (e) { /* sin vista previa */ }
    };
    frame.addEventListener("load", aplicarPrevia);

    const controles = h("div", { class: "style-groups" });
    const pintarControles = () => {
      const vals = valoresDe(alcance);
      const heredado = (k) => alcance !== "global" && est.global[k] !== undefined ? est.global[k] : undefined;
      const grupos = {};
      OP.forEach((o) => (grupos[o.grupo] = grupos[o.grupo] || []).push(o));
      controles.replaceChildren(...Object.entries(grupos).map(([g, ops]) => h("section", { class: "panel style-group" }, h("h2", {}, g),
        ops.map((o) => {
          const actual = vals[o.k] !== undefined ? vals[o.k] : heredado(o.k) !== undefined ? heredado(o.k) : o.def;
          const propio = vals[o.k] !== undefined;
          const set = (v) => { vals[o.k] = v; setDirty(true); aplicarPrevia(); pintarControles(); };
          const reset = h("button", { type: "button", class: "link-btn", hidden: !propio, onclick: () => { delete vals[o.k]; setDirty(true); aplicarPrevia(); pintarControles(); } },
            alcance === "global" ? "Restablecer" : "Usar el estilo global");
          let control;
          if (o.tipo === "opciones") {
            control = h("div", { class: "seg" }, Object.entries(o.opciones).map(([v, [t]]) =>
              h("button", { type: "button", class: v === actual ? "is-on" : "", onclick: () => set(v) }, t)));
          } else if (o.tipo === "color") {
            const muestra = actual || (o.k === "btnFondo" ? state.data.colores.acento : state.data.colores.primario);
            control = h("div", { class: "color-row" },
              h("input", { type: "color", value: muestra, "aria-label": o.label, onchange: (e) => set(e.target.value) }),
              h("code", {}, actual ? actual : o.vacio || muestra));
          } else if (o.tipo === "fuente") {
            control = h("select", { onchange: (e) => set(e.target.value), style: `font-family:"${actual}"` },
              o.lista.map((f) => h("option", { value: f, selected: f === actual }, f)));
            window.ESTILO.cargarFuente(document, actual);
          } else if (o.tipo === "rango") {
            const out = h("output", {}, actual + o.unidad);
            control = h("div", { class: "range-row" },
              h("input", { type: "range", min: o.min, max: o.max, step: o.paso, value: actual,
                oninput: (e) => { out.textContent = e.target.value + o.unidad; },
                onchange: (e) => set(+e.target.value) }), out);
          }
          return h("div", { class: "style-row" + (propio ? " is-custom" : "") },
            h("div", { class: "style-row__label" }, h("span", {}, o.label), reset), control);
        }))));
    };

    const selector = h("select", { id: "estiloAlcance", onchange: (e) => {
      alcance = state.estiloAlcance = e.target.value;
      pintarControles();
      frame.src = SITIO + paginaPrevia().url;
    } }, h("option", { value: "global", selected: alcance === "global" }, "Todas las páginas"),
      PAGINAS.map((p) => h("option", { value: p.id, selected: alcance === p.id }, `Solo ${p.ruta} (${p.nombre})`)));

    pintarControles();
    frame.src = SITIO + paginaPrevia().url;
    return h("div", { class: "style-tool" },
      h("div", { class: "style-tool__controls" },
        h("div", { class: "panel" }, h("label", { for: "estiloAlcance", class: "style-scope" }, "Aplicar cambios a"), selector,
          h("p", { class: "editor__note", style: "margin:.8rem 0 0" }, "Lo que elijas para una página se aplica encima del estilo de «Todas las páginas». Los colores institucionales se cambian en «Colores».")),
        controles),
      h("div", { class: "style-tool__preview" }, h("div", { class: "editor__previewbar" }, "Vista previa en vivo"), frame));
  }

  Object.assign(VISTAS, {
    html: { titulo: "Editor de página · HTML", ayuda: "Edita el código de cada página. Verás el resultado en la vista previa antes de publicar.", render: () => vistaEditorArchivos("html") },
    css: { titulo: "Editor de página · CSS", ayuda: "Edita la hoja de estilos global o la propia de cada página.", render: () => vistaEditorArchivos("css") },
    estilo: { titulo: "Estilo visual", ayuda: "Cambia botones, fondos, tipografías y tarjetas sin tocar código. Se publica con el botón de arriba.", render: vistaEstilo },
  });

  function render() {
    const v = VISTAS[state.view];
    $("#viewTitle").textContent = v.titulo;
    $("#sideActual").textContent = v.menu || v.titulo;
    $("#viewHelp").textContent = v.ayuda + (state.rol === "trabajador" && state.view === "html"
      ? " Como administrador trabajador, tus cambios en el HTML quedan pendientes hasta que el dueño los apruebe." : "");
    $("#view").replaceChildren(v.render());
    document.querySelectorAll("#sideNav button[data-view]").forEach((b) => b.classList.toggle("is-active", b.dataset.view === state.view));
    plegarMenu();
    document.body.classList.toggle("is-wide", ["html", "css", "estilo"].includes(state.view));
    // Las cuentas con «Noticias con aprobación» no publican: envían cada noticia con su propio botón
    $(".bar__actions").hidden = soloPropuestas() || ((["html", "css", "pruebas", "inicio"].includes(state.view) || (state.view === "aviso" && !avisoCompleto)) && !state.dirty);
  }

  /* ---------- Menú: íconos, grupos plegables y números de pendientes ---------- */
  const ICONOS_MENU = {
    inicio: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
    aviso: "M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 0 0-5.5-6.84V3.5a1.5 1.5 0 0 0-3 0v.66A7 7 0 0 0 5 11v5l-2 2v1h18v-1l-2-2Z",
    noticias: "M20 3H4a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1Zm-9 14H6v-2h5v2Zm7-4H6v-2h12v2Zm0-4H6V7h12v2Z",
    pruebas: "M19 8H5a3 3 0 0 0-3 3v6h4v4h12v-4h4v-6a3 3 0 0 0-3-3Zm-3 11H8v-5h8v5Zm3-7a1 1 0 1 1 0-2 1 1 0 0 1 0 2ZM18 3H6v4h12V3Z",
    eventos: "M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 16H5V9h14v11ZM7 11h5v5H7v-5Z",
    mensajes: "M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2Zm0 4-8 5-8-5V6l8 5 8-5v2Z",
    micurso: "M12 3 1 9l11 6 9-4.91V17h2V9L12 3Zm-6.82 9.5L5 16.18 12 20l7-3.82v-3.68L12 16.5l-6.82-4Z",
    galeria: "M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2ZM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5Z",
    directivos: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5Z",
    personal: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Zm8 0c-.3 0-.7 0-1.1.1A4.2 4.2 0 0 1 17 17v2h7v-2c0-2.7-5.3-4-8-4Z",
    departamentos: "M12 7V3H2v18h20V7H12ZM6 19H4v-2h2v2Zm0-4H4v-2h2v2Zm0-4H4V9h2v2Zm0-4H4V5h2v2Zm4 12H8v-2h2v2Zm0-4H8v-2h2v2Zm0-4H8V9h2v2Zm0-4H8V5h2v2Zm10 12h-8v-2h2v-2h-2v-2h2v-2h-2V9h8v10Z",
    horarios: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16Zm.75-13h-1.5v6l5.2 3.12.75-1.23-4.45-2.64V7Z",
    documentos: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Zm-1 7V3.5L18.5 9H13Z",
    portada: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm0 4v10h16V8H4Z",
    pilares: "M3 7 12 2l9 5v2H3V7Zm2 4h3v7H5v-7Zm5.5 0h3v7h-3v-7Zm5.5 0h3v7h-3v-7ZM3 20h18v2H3v-2Z",
    organizaciones: "M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm-8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4Z",
    emergencia: "M1 21h22L12 2 1 21Zm12-3h-2v-2h2v2Zm0-4h-2v-4h2v4Z",
    redes: "M18 16a3 3 0 0 0-2.4 1.2l-7-3.6a3 3 0 0 0 0-1.2l7-3.6A3 3 0 1 0 15 7c0 .2 0 .4.1.6l-7 3.6a3 3 0 1 0 0 3.6l7 3.6A3 3 0 1 0 18 16Z",
    logo: "M12 2 4 5v6c0 5 3.4 9.7 8 11 4.6-1.3 8-6 8-11V5l-8-3Z",
    colores: "M12 3a9 9 0 0 0 0 18c.8 0 1.5-.7 1.5-1.5 0-.4-.1-.7-.4-1-.2-.3-.4-.6-.4-1 0-.8.7-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.4-4-8-9-8ZM6.5 12a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3-4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm3 4a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z",
    estilo: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
    html: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z",
    css: "M9.4 16.6 4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Zm5.2 0 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4Z",
    estadisticas: "M5 9.2h3V19H5V9.2ZM10.6 5h2.8v14h-2.8V5Zm5.6 8H19v6h-2.8v-6Z",
    usuarios: "M12.65 10A6 6 0 1 0 7 18a6 6 0 0 0 5.65-4H17v4h4v-4h2v-4H12.65ZM7 14a2 2 0 1 1 0-4 2 2 0 0 1 0 4Z",
    respaldos: "M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A6 6 0 0 0 6 20h13a5 5 0 0 0 .35-9.96Z",
    limpieza: "M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12ZM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4Z",
  };
  document.querySelectorAll("#sideNav button[data-view]").forEach((b) => {
    if (ICONOS_MENU[b.dataset.view]) b.prepend(h("span", { class: "side__icono", "aria-hidden": "true", html: `<svg viewBox="0 0 24 24"><path d="${ICONOS_MENU[b.dataset.view]}"/></svg>` }));
  });
  // Grupos plegados (se recuerda en este equipo): las páginas del sitio y el diseño, que se tocan pocas veces
  const PLEGADOS_KEY = STORE_KEY + "-plegados";
  const plegados = new Set((() => { try { return JSON.parse(localStorage.getItem(PLEGADOS_KEY) || "null") || ["paginas", "diseno"]; } catch (e) { return ["paginas", "diseno"]; } })());
  function plegarMenu() {
    document.querySelectorAll("#sideNav .side__bloque[data-bloque]").forEach((g) => {
      const visibles = [...g.querySelectorAll("button[data-view]")].filter((b) => !b.hidden);
      const plegado = plegados.has(g.dataset.bloque) && !visibles.some((b) => b.dataset.view === state.view);
      g.classList.toggle("is-plegado", plegado);
      const boton = g.querySelector(".side__plegar");
      boton.setAttribute("aria-expanded", String(!plegado));
      boton.querySelector(".side__cuenta").textContent = plegado ? String(visibles.length) : "";
    });
  }
  // Número en el menú (pendientes de una sección)
  function ponerNumero(vista, n, que) {
    const b = $(`.side__nav button[data-view=${vista}]`);
    if (!b) return;
    b.querySelector(".apr__badge")?.remove();
    if (n) b.append(h("span", { class: "apr__badge", title: n + que }, String(n)));
  }
  // Mensajes de contacto sin leer (o asignados y sin atender)
  async function contarMensajes() {
    const s = servidorApp();
    if (!s || !puede("mensajes")) return;
    try {
      const r = await fetch(s + "/mensajes", { cache: "no-store", headers: credencial() });
      if (!r.ok) return;
      const j = await r.json();
      ponerNumero("mensajes", (j.mensajes || []).filter((m) => (j.todos ? !m.leido : !m.miAtendido)).length, j.todos ? " sin leer" : " por atender");
    } catch (e) { /* sin servidor */ }
  }

  /* ---------- Rol: qué secciones ve cada uno ---------- */
  function aplicarRol() {
    document.querySelectorAll("#sideNav button[data-view]").forEach((b) => { b.hidden = !puede(b.dataset.view); });
    document.querySelectorAll("#sideNav .side__bloque").forEach((g) => { g.hidden = ![...g.querySelectorAll("button[data-view]")].some((b) => !b.hidden); });
    // «Descargar respaldo» solo para quien administra todo el sitio
    $("#exportBtn").hidden = !["dueno", "trabajador"].includes(state.rol);
    if (!puede(state.view)) state.view = state.rol === "utp" ? "noticias" : ([...document.querySelectorAll("#sideNav button[data-view]")].find((b) => !b.hidden) || { dataset: { view: "estadisticas" } }).dataset.view;
    plegarMenu();
    $("#saveBtn").textContent = textoGuardar();
    $("#sessionInfo").textContent = state.modo === "correo"
      ? `${state.nombre || state.login} · ${state.cargo || (state.permisos.includes("todo") ? "Control total" : "Cuenta del colegio")}`
      : `${state.nombre || "@" + state.login} · ${ROLES[state.rol].nombre}`;
  }

  /* ---------- Sesión ---------- */
  // El token nunca queda guardado para siempre: sin «Recordar» se borra al cerrar la pestaña;
  // con «Recordar», vence a las 12 horas (30 días en la app instalada). Además, la sesión se cierra tras 30 minutos sin uso.
  // En la app instalada en el celular («Panel del colegio») se recuerda 30 días, para no pegar el token cada vez
  const EN_APP = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const RECORDAR_HORAS = EN_APP ? 30 * 24 : 12;
  const INACTIVIDAD_MIN = 30;
  function guardarSesion(recordar) {
    const s = JSON.stringify({ owner: state.owner, repo: state.repo, branch: state.branch, token: state.token, sesion: state.sesion,
      vence: recordar ? Date.now() + RECORDAR_HORAS * 3600e3 : null });
    sessionStorage.setItem(STORE_KEY, s);
    if (recordar) localStorage.setItem(STORE_KEY, s); else localStorage.removeItem(STORE_KEY);
    marcarActividad();
  }
  function borrarSesion() {
    try { sessionStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY + "-uso"); } catch (e) { /* sin almacenamiento */ }
    state.token = null; state.sesion = null;
  }
  // El servidor dijo que la sesión con correo ya no sirve (venció, cambió la contraseña o el acceso)
  function sesionVencida() {
    if (state.dirty) return toast("Tu sesión venció o tu acceso cambió. Descarga un respaldo de tus cambios (abajo a la izquierda) y vuelve a entrar.", "error");
    borrarSesion();
    sessionStorage.setItem(STORE_KEY + "-aviso", "1");
    location.reload();
  }
  // Última actividad compartida entre pestañas
  let ultimoUso = Date.now();
  function marcarActividad() {
    ultimoUso = Date.now();
    try { localStorage.setItem(STORE_KEY + "-uso", String(ultimoUso)); } catch (e) { /* sin almacenamiento */ }
  }
  let marcaPendiente = false;
  ["pointerdown", "keydown", "scroll"].forEach((ev) => window.addEventListener(ev, () => {
    if (!(state.token || state.sesion) || marcaPendiente) return;
    marcaPendiente = true; setTimeout(() => { marcaPendiente = false; marcarActividad(); }, 5000);
  }, { passive: true, capture: true }));
  setInterval(() => {
    if (!(state.token || state.sesion)) return;
    let uso = ultimoUso, vence = null;
    try {
      uso = Math.max(uso, +localStorage.getItem(STORE_KEY + "-uso") || 0);
      vence = (JSON.parse(sessionStorage.getItem(STORE_KEY) || "null") || {}).vence;
    } catch (e) { /* sin almacenamiento */ }
    if (Date.now() > (vence || uso + INACTIVIDAD_MIN * 60e3)) {
      if (state.dirty) return; // no se pierden cambios sin publicar; se cerrará después de guardar
      borrarSesion();
      sessionStorage.setItem(STORE_KEY + "-aviso", "1");
      location.reload();
    }
  }, 30e3);

  // Freno a intentos repetidos de ingreso desde este equipo: 5 errores y hay que esperar (cada vez más)
  const BLOQUEO_KEY = STORE_KEY + "-intentos";
  const leerIntentos = () => { try { return JSON.parse(localStorage.getItem(BLOQUEO_KEY) || "null") || { n: 0, hasta: 0 }; } catch (e) { return { n: 0, hasta: 0 }; } };
  const anotarIntento = (ok) => {
    const i = leerIntentos();
    const nuevo = ok ? { n: 0, hasta: 0 } : { n: i.n + 1, hasta: i.n + 1 >= 5 ? Date.now() + Math.min(60, 2 ** (i.n + 1 - 5)) * 60e3 : 0 };
    try { localStorage.setItem(BLOQUEO_KEY, JSON.stringify(nuevo)); } catch (e) { /* sin almacenamiento */ }
  };

  async function entrar(recordar) {
    const yo = await api("/user");
    const repo = await gh("");
    await cargarDatos();
    state.login = yo.login;
    // Quien tiene permiso de escritura en el repositorio (dueño o administrador de la organización) publica directo
    if (repo.permissions && repo.permissions.push) {
      const u = state.roles.usuarios.find((x) => (x.github || "").toLowerCase() === yo.login.toLowerCase());
      Object.assign(state, { rol: "dueno", modo: "directo", nombre: (u && u.nombre) || yo.name || "" });
    } else {
      const u = state.roles.usuarios.find((x) => (x.github || "").toLowerCase() === yo.login.toLowerCase());
      if (!u || !ROLES[u.rol]) throw new Error(`Tu cuenta de GitHub (@${yo.login}) no tiene acceso al panel. Pídele al administrador que te agregue en «Usuarios y permisos».`);
      Object.assign(state, { rol: u.rol, modo: "revision", nombre: u.nombre || "" });
    }
    state.view = "inicio";
    aplicarRol();
    guardarSesion(recordar);
    $("#login").hidden = true;
    $("#app").hidden = false;
    setDirty(false);
    render();
    contarPorAprobar().then((n) => { if (n && state.view !== "inicio") toast(n === 1 ? "Tienes 1 noticia por aprobar en «Noticias»." : `Tienes ${n} noticias por aprobar en «Noticias».`); });
    contarPruebas();
    contarMensajes();
  }

  // Ingreso con el correo del colegio: el servidor del colegio revisa la cuenta y sus permisos
  async function entrarCorreo(recordar) {
    const yo = await pedirServidor("/panel/yo");
    [state.owner, state.repo] = yo.repo.split("/");
    Object.assign(state, { branch: "main", token: null, login: yo.correo, nombre: yo.nombre || "", cargo: yo.cargo || "", permisos: yo.permisos || [],
      modo: "correo", rol: (yo.permisos || []).includes("todo") ? "dueno" : "correo" });
    await cargarDatos();
    state.view = "inicio";
    aplicarRol();
    guardarSesion(recordar);
    $("#login").hidden = true;
    $("#app").hidden = false;
    setDirty(false);
    render();
    contarMensajes();
    contarPruebas().then((r) => { if (r && r.n && !["pruebas", "inicio"].includes(state.view)) toast(r.utp ? `Hay ${r.n} ${r.n === 1 ? "prueba o guía" : "pruebas o guías"} por revisar en «Pruebas y guías».` : `Hay ${r.n} ${r.n === 1 ? "prueba o guía" : "pruebas o guías"} para imprimir en «Pruebas y guías».`); });
  }

  // Pestañas del ingreso (se recuerda la última usada en este equipo)
  const MODO_KEY = STORE_KEY + "-modo";
  function elegirIngreso(modo) {
    document.querySelectorAll("[data-login]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.login === modo)));
    $("#correoForm").hidden = modo !== "correo";
    $("#loginForm").hidden = modo !== "token";
    $("#loginError").textContent = "";
    try { localStorage.setItem(MODO_KEY, modo); } catch (e) { /* sin almacenamiento */ }
  }
  document.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", () => elegirIngreso(b.dataset.login)));
  try { if (localStorage.getItem(MODO_KEY) === "token") elegirIngreso("token"); } catch (e) { /* sin almacenamiento */ }

  let paso = "entrar";
  const irPaso = (p) => {
    paso = p;
    document.querySelectorAll("#correoForm [data-paso]").forEach((d) => { d.hidden = d.dataset.paso !== p; });
    $("#loginError").textContent = "";
    const foco = { entrar: "#correoInput", codigo: "#codigoInput", clave: "#nuevaClave" }[p];
    setTimeout(() => $(foco).focus(), 0);
  };
  // Identificador al azar de este equipo: el servidor avisa por correo cuando alguien entra desde uno nuevo
  const equipo = () => {
    try {
      let e = localStorage.getItem(STORE_KEY + "-equipo");
      if (!e) { e = [...crypto.getRandomValues(new Uint8Array(18))].map((x) => x.toString(16).padStart(2, "0")).join(""); localStorage.setItem(STORE_KEY + "-equipo", e); }
      return e;
    } catch (err) { return ""; }
  };
  const correoEscrito = () => $("#correoInput").value.trim().toLowerCase();
  const ocupado = (btn, txt) => { const antes = btn.textContent; btn.disabled = true; btn.textContent = txt; return () => { btn.disabled = false; btn.textContent = antes; }; };
  document.querySelector("#correoForm [data-volver]").addEventListener("click", () => irPaso("entrar"));
  $("#primeraVez").addEventListener("click", async () => {
    const correo = correoEscrito();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { $("#loginError").textContent = "Escribe primero tu correo institucional."; $("#correoInput").focus(); return; }
    const listo = ocupado($("#primeraVez"), "Enviando el código…");
    try {
      const r = await pedirServidor("/panel/codigo", { correo }, false);
      $("#codigoTexto").textContent = `Te enviamos un código de 6 números a ${r.correo}. Escríbelo aquí.`;
      $("#codigoInput").value = "";
      irPaso("codigo");
    } catch (err) { $("#loginError").textContent = err.message === "Failed to fetch" ? "No se pudo conectar. Revisa tu internet." : err.message; }
    finally { listo(); }
  });
  $("#correoForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const recordar = $("#rememberCorreo").checked;
    const err = (m) => { $("#loginError").textContent = m === "Failed to fetch" ? "No se pudo conectar. Revisa tu internet." : m; };
    if (paso === "entrar") {
      const correo = correoEscrito(), clave = $("#claveInput").value;
      if (!correo || !clave) return err("Escribe tu correo y tu contraseña.");
      const listo = ocupado($("#correoBtn"), "Verificando…");
      try {
        state.sesion = (await pedirServidor("/panel/entrar", { correo, clave, equipo: equipo() }, false)).sesion;
        await entrarCorreo(recordar);
        $("#claveInput").value = "";
      } catch (x) { state.sesion = null; err(x.message); }
      finally { listo(); }
    } else if (paso === "codigo") {
      const codigo = $("#codigoInput").value.replace(/\D/g, "");
      if (codigo.length !== 6) return err("El código tiene 6 números.");
      const listo = ocupado($("#codigoBtn"), "Revisando…");
      try {
        state.sesion = (await pedirServidor("/panel/verificar", { correo: correoEscrito(), codigo, equipo: equipo() }, false)).sesion;
        irPaso("clave");
      } catch (x) { err(x.message); }
      finally { listo(); }
    } else {
      const c1 = $("#nuevaClave").value, c2 = $("#nuevaClave2").value;
      if (c1.length < 10) return err("La contraseña debe tener al menos 10 caracteres.");
      if (c1 !== c2) return err("Las dos contraseñas no son iguales.");
      const listo = ocupado($("#claveBtn"), "Guardando…");
      try {
        state.sesion = (await pedirServidor("/panel/clave", { clave: c1 })).sesion;
        $("#nuevaClave").value = $("#nuevaClave2").value = "";
        await entrarCorreo(recordar);
        irPaso("entrar");
      } catch (x) { err(x.message); }
      finally { listo(); }
    }
  });

  $("#loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const [owner, repo] = $("#repoInput").value.trim().split("/");
    Object.assign(state, { owner, repo, branch: $("#branchInput").value.trim() || "main", token: $("#token").value.trim() });
    const btn = $("#loginBtn");
    btn.disabled = true; btn.textContent = "Verificando…"; $("#loginError").textContent = "";
    const espera = leerIntentos().hasta - Date.now();
    if (espera > 0) {
      $("#loginError").textContent = `Demasiados intentos fallidos. Espera ${Math.ceil(espera / 60e3)} minuto(s) antes de volver a intentar.`;
      btn.disabled = false; btn.textContent = "Ingresar";
      return;
    }
    try {
      await entrar($("#remember").checked);
      anotarIntento(true);
      $("#token").value = "";
    } catch (err) {
      if (err.status === 401 || err.status === 403 || err.status === 404 || /no tiene acceso al panel/.test(err.message)) anotarIntento(false);
      state.token = null;
      $("#loginError").textContent = err.status === 401 ? "Token inválido o vencido."
        : err.status === 404 ? "No se encontró el repositorio o el archivo de datos, o el token no tiene acceso."
        : err.message;
    } finally {
      btn.disabled = false; btn.textContent = "Ingresar";
    }
  });

  $("#sideNav").addEventListener("click", (e) => {
    const g = e.target.closest(".side__plegar");
    if (g) {
      const k = g.parentElement.dataset.bloque;
      if (plegados.has(k)) plegados.delete(k); else plegados.add(k);
      try { localStorage.setItem(PLEGADOS_KEY, JSON.stringify([...plegados])); } catch (err) { /* sin almacenamiento */ }
      return plegarMenu();
    }
    const b = e.target.closest("button[data-view]");
    if (!b) return;
    if (state.view === "mensajes" && b.dataset.view !== "mensajes") contarMensajes();
    if (b.dataset.view === state.view) return menuMovil(false); // tocar la sección abierta solo cierra el menú en el celular
    if (editorSucio() && !confirm("Tienes cambios sin guardar en " + editor.archivo + ". ¿Descartarlos?")) return;
    editor.dirty = false; editor.archivo = null;
    if (b.dataset.view !== state.view) { avisoRapido = null; avisoCompleto = false; }
    state.view = b.dataset.view; menuMovil(false); render();
    window.scrollTo(0, 0);
  });
  // En el celular el menú de secciones se abre y cierra con un botón
  const menuMovil = (abrir) => {
    document.querySelector(".side").classList.toggle("is-open", abrir);
    document.body.classList.toggle("menu-abierto", abrir);
    $("#menuBtn").setAttribute("aria-expanded", String(abrir));
  };
  $("#menuBtn").addEventListener("click", () => menuMovil(!document.querySelector(".side").classList.contains("is-open")));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") menuMovil(false); });
  $("#saveBtn").addEventListener("click", guardar);
  $("#logoutBtn").addEventListener("click", async () => {
    if (state.dirty && !confirm("Tienes cambios sin publicar. ¿Cerrar sesión de todos modos?")) return;
    // Los borradores se terminan de guardar en la cuenta y no quedan en este equipo
    if (bor.cargado) {
      await guardarBorradores();
      if (!bor.error) { try { localStorage.removeItem(copiaLocal()); } catch (e) { /* nada */ } }
      else if (!confirm("Tus borradores no se pudieron guardar en tu cuenta y quedarán solo en este equipo. ¿Cerrar sesión igual?")) return;
    }
    borrarSesion();
    state.dirty = false; location.reload();
  });
  $("#exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `sitio-respaldo-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a); a.click(); a.remove();
  });

  // Repositorio del sitio: si el panel está en usuario.github.io/repositorio, se deduce solo de la dirección.
  // Así sigue funcionando aunque el repositorio cambie de cuenta o de nombre.
  const repoDeLaDireccion = (() => {
    const m = /^([a-z0-9-]+)\.github\.io$/i.exec(location.hostname);
    const seg = location.pathname.split("/").filter((x) => x && x !== "index.html");
    if (!m) return null;
    return seg.length >= 2 && seg[seg.length - 1] !== "admin" ? null : `${m[1]}/${seg.length >= 2 ? seg[0] : m[1] + ".github.io"}`;
  })();
  const mostrarDueno = () => {
    const dueno = ($("#repoInput").value.split("/")[0] || "").trim();
    document.querySelectorAll("[data-dueno-repo]").forEach((el) => { el.textContent = dueno || "la dueña del repositorio"; });
  };
  if (repoDeLaDireccion) $("#repoInput").value = repoDeLaDireccion;
  $("#repoInput").addEventListener("input", mostrarDueno);
  mostrarDueno();

  // Reanudar sesión guardada
  try {
    if (sessionStorage.getItem(STORE_KEY + "-aviso")) {
      sessionStorage.removeItem(STORE_KEY + "-aviso");
      $("#loginError").textContent = "Por seguridad, la sesión se cerró (pasaron 30 minutos sin uso o venció el «Recordar»). Ingresa de nuevo.";
    }
    const saved = JSON.parse(sessionStorage.getItem(STORE_KEY) || localStorage.getItem(STORE_KEY) || "null");
    const usoPrevio = +localStorage.getItem(STORE_KEY + "-uso") || 0;
    const vencida = saved && ((saved.vence && Date.now() > saved.vence) || !saved.vence && localStorage.getItem(STORE_KEY)
      || (!saved.vence && usoPrevio && Date.now() - usoPrevio > INACTIVIDAD_MIN * 60e3));
    if (vencida) {
      borrarSesion();
      $("#loginError").textContent = "Por seguridad, la sesión se cerró (pasaron 30 minutos sin uso o venció el «Recordar»). Ingresa de nuevo.";
    }
    else if (saved && saved.sesion) {
      state.sesion = saved.sesion;
      elegirIngreso("correo");
      entrarCorreo(!!saved.vence).catch((err) => {
        if (err instanceof TypeError) { $("#loginError").textContent = "No se pudo conectar. Revisa tu internet y vuelve a abrir el panel."; return; }
        borrarSesion();
        $("#loginError").textContent = err.status === 401 ? "Tu sesión venció o tu acceso cambió. Ingresa de nuevo." : err.message;
      });
    }
    else if (saved && saved.token) {
      Object.assign(state, saved);
      // Si el sitio ahora vive en otro repositorio, manda la dirección actual
      if (repoDeLaDireccion && repoDeLaDireccion.toLowerCase() !== `${saved.owner}/${saved.repo}`.toLowerCase()) [saved.owner, saved.repo] = repoDeLaDireccion.split("/");
      $("#repoInput").value = `${saved.owner}/${saved.repo}`;
      mostrarDueno();
      $("#branchInput").value = saved.branch;
      entrar(!!saved.vence).catch((err) => {
        // Sin internet no se borra la sesión guardada: se puede volver a intentar
        if (!(err instanceof TypeError)) borrarSesion();
        else $("#loginError").textContent = "No se pudo conectar. Revisa tu internet y vuelve a abrir el panel.";
      });
    }
  } catch (e) { /* almacenamiento no disponible */ }

  // App «Panel del colegio» instalable en el celular
  if (EN_APP) document.querySelectorAll(".js-recordar").forEach((el) => { el.textContent = "Recordar 30 días en este celular"; });
  if (window.INSTALAR) window.INSTALAR($("#instalarPanel"), "el panel");
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* se usa sin instalar */ });
})();
