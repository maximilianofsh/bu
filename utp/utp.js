/* ==========================================================
   App «Noticias UTP» (/utp/): el equipo UTP escribe, programa y publica noticias desde el
   celular con usuario y contraseña, sin cuenta de GitHub.
   Todo pasa por el servidor del colegio (Cloudflare, ver servidor/notificaciones.js): revisa la
   sesión, guarda los borradores y publica en el sitio con su propio token. Solo puede tocar
   las noticias y subir fotos o PDF de noticias.
   Las cuentas las crea el dueño en el panel: «Usuarios y permisos» → «Cuentas de la app Noticias UTP».
   ========================================================== */
(function () {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const esc = window.TEXTO.esc;
  const BASE = new URL("../", location.href).href;
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };
  const quitar = (k) => { try { localStorage.removeItem(k); } catch (e) { /* nada */ } };
  const SESION = "csm-utp-sesion", NOMBRE = "csm-utp-nombre";
  const TIPOS = [["comunicado", "Comunicado"], ["pedagogia", "Pedagogía"], ["comunidad", "Comunidad"]];
  const hoyChile = () => new Date().toLocaleDateString("sv", { timeZone: "America/Santiago" });
  const fechaBonita = (f) => f ? new Date(f + "T12:00").toLocaleDateString("es-CL", { day: "numeric", month: "long", year: "numeric" }) : "";
  const programada = (n) => n.publicar && new Date(n.publicar) > new Date();

  let servidor = "";
  let sesion = leer(SESION) || "";
  let nombre = leer(NOMBRE) || "";
  let noticias = [], deptos = [], borradores = [];
  let pestana = "borradores";
  let ocupado = false;
  let ed = null;            // noticia abierta: { modo: "borrador" | "publicada", id, n, cambios, estado }
  const locales = {};       // fotos recién subidas: se ven desde el celular mientras el sitio se actualiza

  /* ---------- Utilidades ---------- */
  let toastTimer;
  const toast = (msg, tipo = "ok") => {
    const t = $("toast");
    t.textContent = msg; t.className = "aviso-flotante aviso-flotante--" + tipo; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, tipo === "error" ? 6000 : 3500);
  };
  const sinRed = (e) => e && (e.message === "Failed to fetch" || e.name === "TypeError");
  const textoError = (e) => sinRed(e) ? "Sin conexión. Revisa internet e inténtalo de nuevo." : e.message;

  async function pedir(ruta, cuerpo = {}) {
    if (!servidor) throw new Error("La app aún no está conectada con el servidor del colegio.");
    const r = await fetch(servidor + ruta, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sesion, ...cuerpo }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      if (j.salir) { salir(); toast(j.error || "Vuelve a entrar.", "error"); }
      throw Object.assign(new Error(j.error || "No se pudo conectar con el servidor."), { salir: j.salir });
    }
    return j;
  }
  function salir() {
    sesion = ""; nombre = ""; quitar(SESION); quitar(NOMBRE);
    ed = null; noticias = []; borradores = [];
    pintar();
  }
  const asset = (u) => locales[u] || (/^(https?:|blob:|data:)/.test(u) ? u : BASE + String(u).replace(/^\.?\//, ""));

  // Achica la foto en el celular (máximo 1600 px) y la convierte a JPG: así sube rápido y se borra la ubicación
  async function achicar(archivo, max = 1600) {
    const img = await createImageBitmap(archivo, { imageOrientation: "from-image" }).catch(() => createImageBitmap(archivo));
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return new Promise((ok) => c.toBlob(ok, "image/jpeg", 0.85));
  }
  const aB64 = (blob) => new Promise((ok, mal) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(",")[1]); f.onerror = mal; f.readAsDataURL(blob); });
  async function subir(archivo) {
    const pdf = archivo.type === "application/pdf";
    if (pdf && archivo.size > 10e6) throw new Error("El PDF es muy grande (máximo 10 MB).");
    const blob = pdf ? archivo : await achicar(archivo);
    const r = await pedir("/utp/subir", { nombre: archivo.name, tipo: pdf ? "application/pdf" : "image/jpeg", datos: await aB64(blob) });
    if (!pdf) locales[r.ruta] = URL.createObjectURL(blob);
    return r.ruta;
  }

  /* ---------- Datos ---------- */
  async function conectar() {
    try {
      const r = await fetch("../data/sitio.json", { cache: "no-store" });
      const d = await r.json();
      const u = String((d.app && d.app.servidor) || "").trim().replace(/\/+$/, "");
      servidor = /^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(u) ? u : "";
      if (d.colores) {
        const s = document.documentElement.style;
        if (d.colores.primario) s.setProperty("--primario", d.colores.primario);
        if (d.colores.secundario) s.setProperty("--secundario", d.colores.secundario);
        if (d.colores.acento) s.setProperty("--acento", d.colores.acento);
      }
    } catch (e) { /* se reintenta al volver la conexión */ }
  }
  async function cargarListas() {
    const [a, b] = await Promise.all([pedir("/utp/noticias"), pedir("/utp/borradores")]);
    noticias = a.noticias || []; deptos = a.departamentos || []; borradores = b.borradores || [];
  }

  /* ---------- Pantallas ---------- */
  function pintar(cargando) {
    $("volver").hidden = !ed;
    $("barraTitulo").textContent = !sesion ? "Colegio San Martín" : ed ? (ed.modo === "publicada" ? "Editar noticia" : "Borrador") : (nombre ? "Hola, " + nombre.split(" ")[0] : "Colegio San Martín");
    if (!sesion) return pintarEntrar();
    if (ed) return pintarEditor();
    pintarLista(cargando);
  }

  function pintarEntrar(error) {
    $("pantalla").innerHTML = `
      <div class="tarjeta instalar" id="instalar" hidden></div>
      <form class="insp tarjeta" id="formEntrar">
        <h2>Entrar</h2>
        <p>Con la cuenta que te creó quien administra el panel del colegio.</p>
        <label class="campo">Usuario<input id="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required></label>
        <label class="campo">Contraseña<input type="password" id="clave" autocomplete="current-password" required></label>
        ${error ? `<p class="insp__msg insp__msg--error" role="alert">${esc(error)}</p>` : ""}
        <button class="btn btn--grande"${ocupado ? " disabled" : ""}>${ocupado ? "Revisando…" : "Entrar"}</button>
      </form>
      ${servidor ? "" : '<p class="pie-nota">Si no puedes entrar, revisa tu conexión a internet.</p>'}`;
    window.INSTALAR($("instalar"), "la app");
  }

  function tarjetaNoticia(n, tipo) {
    const meta = tipo === "borrador"
      ? "Guardado " + new Date(n.actualizado).toLocaleString("es-CL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
      : programada(n) ? "Se publica el " + new Date(n.publicar).toLocaleString("es-CL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : fechaBonita(n.fecha);
    const foto = n.imagen ? `<img src="${esc(asset(n.imagen))}" alt="" loading="lazy">` : `<span aria-hidden="true">${esc((n.titulo || "?").slice(0, 1).toUpperCase())}</span>`;
    return `<button type="button" class="nota" data-abrir="${tipo}" data-id="${esc(n.id)}">
        <span class="nota__foto">${foto}</span>
        <span class="nota__info"><strong>${esc(n.titulo || "(Sin título)")}</strong>
          <small>${programada(n) && tipo !== "borrador" ? '<b class="nota__prog">Programada</b> ' : ""}${esc(meta)}</small></span>
      </button>`;
  }

  function pintarLista(cargando) {
    const lista = pestana === "borradores" ? borradores : noticias.slice(0, 60);
    $("pantalla").innerHTML = `
      <div class="tarjeta instalar" id="instalar" hidden></div>
      <button type="button" class="btn btn--grande" data-nueva>+ Nueva noticia</button>
      <div class="segmento" role="tablist">
        <button type="button" role="tab" aria-selected="${pestana === "borradores"}" data-pestana="borradores">Mis borradores${borradores.length ? ` (${borradores.length})` : ""}</button>
        <button type="button" role="tab" aria-selected="${pestana === "publicadas"}" data-pestana="publicadas">Publicadas</button>
      </div>
      <div class="notas">${cargando ? '<p class="vacio">Cargando…</p>'
        : lista.length ? lista.map((n) => tarjetaNoticia(n, pestana === "borradores" ? "borrador" : "publicada")).join("")
        : `<p class="vacio">${pestana === "borradores" ? "No tienes borradores. Toca «+ Nueva noticia» para empezar: se guarda sola mientras escribes." : "Aún no hay noticias."}</p>`}</div>
      <div class="insp__pie"><button type="button" class="btn-texto" data-salir>Cerrar sesión</button>
        <a class="btn-texto" href="../noticias/" target="_blank" rel="noopener">Ver noticias en el sitio ↗</a></div>`;
    window.INSTALAR($("instalar"), "la app");
  }

  const opciones = (lista, actual) => lista.map(([v, t]) => `<option value="${esc(v)}"${v === (actual || "") ? " selected" : ""}>${esc(t)}</option>`).join("");
  function pintarEditor() {
    const n = ed.n;
    // Uno o varios departamentos o equipos (las noticias antiguas traen uno solo, en «departamento»)
    if (!Array.isArray(n.departamentos)) n.departamentos = n.departamento ? [n.departamento] : [];
    delete n.departamento;
    const grupos = [["academico", "Departamentos académicos"], ["apoyo", "Equipos de apoyo"]].map(([t, titulo]) => {
      const ds = deptos.filter((d) => (t === "academico") === (d.tipo === "academico"));
      return ds.length ? `<p class="deptos__titulo">${titulo}</p><div class="deptos__lista">${ds.map((d) => `<label class="depto"><input type="checkbox" data-depto="${esc(d.id)}"${n.departamentos.includes(d.id) ? " checked" : ""}> ${esc(String(d.nombre).replace(/^Departamento (de )?/i, ""))}</label>`).join("")}</div>` : "";
    }).join("");
    const adjunto = n.url ? (/\.pdf$/i.test(n.url) ? "PDF: " + n.url.split("/").pop() : n.url) : "";
    $("pantalla").innerHTML = `
      <form class="editor" id="editor" novalidate>
        <p class="editor__estado" id="estado">${esc(ed.estado || "")}</p>
        <label class="campo">Título<input data-k="titulo" maxlength="200" value="${esc(n.titulo)}" placeholder="Ej.: Feria científica de 2° ciclo" required></label>
        <label class="campo">Resumen<textarea data-k="resumen" maxlength="600" rows="3" placeholder="Una o dos frases. Se ven en la tarjeta de la noticia.">${esc(n.resumen)}</textarea></label>

        <div class="campo">Foto de portada
          <div class="portada">${n.imagen ? `<img src="${esc(asset(n.imagen))}" alt="Foto de portada">` : '<span class="portada__vacia">Sin foto (opcional). Mejor una foto horizontal.</span>'}</div>
          <div class="acciones">
            <label class="btn btn--suave btn--chico">${n.imagen ? "Cambiar foto" : "Elegir foto"}<input type="file" accept="image/*" data-subir="imagen" hidden></label>
            ${n.imagen ? '<button type="button" class="btn-texto" data-quitar="imagen">Quitar</button>' : ""}
          </div>
        </div>

        <div class="campo">Texto completo
          <div class="herramientas" role="toolbar" aria-label="Formato">
            <button type="button" data-formato="subtitulo">Subtítulo</button>
            <button type="button" data-formato="negrita"><b>Negrita</b></button>
            <button type="button" data-formato="lista">• Lista</button>
            <label>+ Fotos<input type="file" accept="image/*" data-subir="cuerpo" multiple hidden></label>
          </div>
          <textarea data-k="cuerpo" id="cuerpo" rows="12" placeholder="Escribe la noticia. Deja una línea en blanco entre párrafos.">${esc(n.cuerpo)}</textarea>
        </div>

        <div class="fila">
          <label class="campo">Categoría<select data-k="tipo">${opciones(TIPOS, n.tipo)}</select></label>
          <label class="campo">Fecha<input type="date" data-k="fecha" value="${esc(n.fecha)}"></label>
        </div>
        ${grupos ? `<fieldset class="campo deptos"><legend>Departamentos o equipos (opcional, puedes marcar varios)</legend>${grupos}</fieldset>` : ""}

        <details class="campo extra"${n.publicar || n.url ? " open" : ""}><summary>Más opciones: programar o adjuntar un PDF</summary>
          <label class="campo">Publicar el (opcional)<input type="datetime-local" data-k="publicar" value="${esc(n.publicar || "")}"></label>
          <p class="ayuda">Si eliges día y hora, la noticia aparece sola en el sitio en ese momento (hora de Chile).</p>
          <div class="campo">Documento adjunto (opcional)
            ${adjunto ? `<p class="adjunto">${esc(adjunto)} <button type="button" class="btn-texto" data-quitar="url">Quitar</button></p>` : ""}
            <label class="btn btn--suave btn--chico">${adjunto ? "Cambiar PDF" : "Adjuntar PDF"}<input type="file" accept="application/pdf" data-subir="url" hidden></label>
          </div>
        </details>

        <div class="previa" id="previa" hidden></div>
        <div class="editor__acc">
          <button type="button" class="btn btn--suave" data-previa>Vista previa</button>
          <button type="submit" class="btn btn--grande"${ocupado ? " disabled" : ""}>${ed.modo === "publicada" ? "Guardar cambios" : programada(n) ? "Programar noticia" : "Publicar noticia"}</button>
          <button type="button" class="btn-texto btn-texto--peligro" data-borrar>${ed.modo === "publicada" ? "Borrar esta noticia del sitio" : "Borrar borrador"}</button>
        </div>
      </form>`;
  }

  function pintarPrevia() {
    const n = ed.n, caja = $("previa");
    const tipo = (TIPOS.find(([v]) => v === n.tipo) || [, ""])[1];
    caja.innerHTML = `<p class="previa__rotulo">Así se verá en el sitio</p>
      ${n.imagen ? `<img class="previa__foto" src="${esc(asset(n.imagen))}" alt="">` : ""}
      <p class="previa__meta">${esc([fechaBonita(n.fecha), tipo].filter(Boolean).join(" · "))}</p>
      <h2>${esc(n.titulo || "(Sin título)")}</h2>
      ${n.resumen ? `<p class="previa__resumen">${esc(n.resumen)}</p>` : ""}
      <div class="previa__cuerpo">${window.TEXTO.html(n.cuerpo || "", asset)}</div>`;
  }

  /* ---------- Borradores: se guardan solos mientras se escribe ---------- */
  let autoTimer;
  const marcarEstado = (t) => { ed.estado = t; const e = $("estado"); if (e) e.textContent = t; };
  function cambio() {
    ed.cambios = true;
    if (ed.modo !== "borrador") { marcarEstado("Cambios sin guardar"); return; }
    marcarEstado("Guardando…");
    clearTimeout(autoTimer);
    autoTimer = setTimeout(guardarBorrador, 1500);
  }
  async function guardarBorrador() {
    if (!ed || ed.modo !== "borrador") return;
    clearTimeout(autoTimer);
    const actual = ed;
    try {
      const r = await pedir("/utp/borrador", { id: actual.id, datos: actual.n });
      actual.cambios = false;
      const b = borradores.find((x) => x.id === actual.id);
      if (b) Object.assign(b, actual.n, { actualizado: r.actualizado }); else borradores.unshift({ id: actual.id, ...actual.n, actualizado: r.actualizado });
      if (ed === actual) marcarEstado("Borrador guardado ✓");
    } catch (e) {
      if (ed === actual) marcarEstado(sinRed(e) ? "Sin conexión: se guardará al volver internet" : "No se pudo guardar: " + e.message);
    }
  }

  function abrir(modo, id) {
    if (modo === "nueva") {
      ed = { modo: "borrador", id: "b-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), n: { titulo: "", resumen: "", cuerpo: "", imagen: "", url: "", tipo: "comunicado", fecha: hoyChile(), departamentos: [], publicar: "" }, estado: "Se guarda solo mientras escribes" };
    } else {
      const fuente = (modo === "borrador" ? borradores : noticias).find((x) => x.id === id);
      if (!fuente) return;
      const { actualizado, id: _id, ...n } = fuente;
      ed = { modo, id, n: { titulo: "", resumen: "", cuerpo: "", imagen: "", url: "", tipo: "comunicado", fecha: hoyChile(), departamentos: [], publicar: "", ...n }, estado: modo === "borrador" ? "Borrador guardado ✓" : "" };
    }
    history.pushState({ editor: true }, "");
    pintar();
    window.scrollTo(0, 0);
  }
  async function cerrarEditor(desdeHistorial) {
    if (!ed) return;
    if (ed.modo === "publicada" && ed.cambios && !confirm("Tienes cambios sin guardar en esta noticia. ¿Salir sin guardarlos?")) {
      if (desdeHistorial) history.pushState({ editor: true }, "");
      return;
    }
    if (ed.modo === "borrador" && ed.cambios) await guardarBorrador();
    // Un borrador vacío no se guarda
    if (ed.modo === "borrador" && !ed.n.titulo && !ed.n.cuerpo && !ed.n.resumen && !ed.n.imagen) {
      const id = ed.id;
      borradores = borradores.filter((b) => b.id !== id);
      pedir("/utp/borrador/borrar", { id }).catch(() => {});
    }
    if (ed.modo === "borrador") pestana = "borradores";
    ed = null;
    if (!desdeHistorial && history.state && history.state.editor) history.back();
    pintar();
  }

  async function publicar() {
    const n = ed.n;
    if (!n.titulo.trim()) { toast("Escribe el título de la noticia.", "error"); document.querySelector('[data-k="titulo"]').focus(); return; }
    const prog = programada(n);
    const pregunta = ed.modo === "publicada" ? "¿Guardar los cambios? Se verán en el sitio en uno o dos minutos."
      : prog ? `¿Programar la noticia? Aparecerá sola en el sitio el ${new Date(n.publicar).toLocaleString("es-CL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })}.`
      : "¿Publicar la noticia? Se verá en el sitio en uno o dos minutos.";
    if (!confirm(pregunta)) return;
    ocupado = true; pintarEditor();
    try {
      // «departamento» (el primero) es para el servidor antiguo, mientras no se pegue la versión nueva
      const r = await pedir("/utp/guardar", { id: ed.modo === "publicada" ? ed.id : undefined, noticia: { ...n, departamento: (n.departamentos || [])[0] || "" } });
      if (ed.modo === "borrador") { const id = ed.id; borradores = borradores.filter((b) => b.id !== id); await pedir("/utp/borrador/borrar", { id }).catch(() => {}); }
      const i = noticias.findIndex((x) => x.id === r.noticia.id);
      if (i >= 0) noticias[i] = r.noticia; else noticias.unshift(r.noticia);
      noticias.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
      toast(ed.modo === "publicada" ? "Cambios guardados." : prog ? "Noticia programada." : "¡Noticia publicada! Se verá en el sitio en uno o dos minutos.");
      ed.cambios = false; ocupado = false;
      ed.modo = "publicada";   // ya no es borrador: no se vuelve a guardar como tal
      await cerrarEditor();
      pestana = "publicadas"; pintar();
    } catch (e) {
      ocupado = false; if (ed) pintarEditor();
      toast(textoError(e), "error");
    }
  }

  async function borrar() {
    if (ed.modo === "publicada") {
      if (!confirm("¿Borrar esta noticia del sitio? No se puede deshacer.")) return;
      try {
        await pedir("/utp/borrar", { id: ed.id });
        const id = ed.id; noticias = noticias.filter((x) => x.id !== id);
        toast("Noticia borrada.");
      } catch (e) { toast(textoError(e), "error"); return; }
    } else {
      if (!confirm("¿Borrar este borrador?")) return;
      const id = ed.id;
      clearTimeout(autoTimer);
      borradores = borradores.filter((b) => b.id !== id);
      pedir("/utp/borrador/borrar", { id }).catch(() => {});
    }
    ed = null;
    if (history.state && history.state.editor) history.back();
    pintar();
  }

  // Formato simple en el texto (las mismas marcas que usa el panel)
  function formato(tipo) {
    const t = $("cuerpo");
    const a = t.selectionStart, b = t.selectionEnd, sel = t.value.slice(a, b);
    let ins, cursor;
    if (tipo === "negrita") { ins = `**${sel || "texto"}**`; cursor = sel ? a + ins.length : a + 2; }
    else if (tipo === "subtitulo") { ins = `${a && t.value[a - 1] !== "\n" ? "\n\n" : ""}## ${sel || "Subtítulo"}\n\n`; cursor = a + ins.length; }
    else { ins = `${a && t.value[a - 1] !== "\n" ? "\n" : ""}- ${sel || ""}`; cursor = a + ins.length; }
    t.setRangeText(ins, a, b, "end");
    // Si no había texto marcado, queda seleccionada la palabra de ejemplo para escribir encima
    if (tipo === "negrita" && !sel) t.setSelectionRange(a + 2, a + 7);
    else if (tipo === "subtitulo" && !sel) { const i = a + ins.indexOf("Subtítulo"); t.setSelectionRange(i, i + 9); }
    else t.setSelectionRange(cursor, cursor);
    t.focus();
    ed.n.cuerpo = t.value; cambio();
  }

  /* ---------- Eventos ---------- */
  const pantalla = $("pantalla");
  pantalla.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (e.target.id === "formEntrar") {
      if (ocupado) return;
      const usuario = $("usuario").value.trim(), clave = $("clave").value;
      ocupado = true; pintarEntrar();
      try {
        if (!servidor) await conectar();
        const r = await pedir("/utp/entrar", { usuario, clave });
        sesion = r.sesion; nombre = r.nombre || usuario;
        guardar(SESION, sesion); guardar(NOMBRE, nombre);
        ocupado = false;
        pintar(true);
        await cargarListas(); pintar();
      } catch (err) {
        ocupado = false;
        if (!sesion) { pintarEntrar(textoError(err)); $("usuario").value = usuario; }
      }
      return;
    }
    if (e.target.id === "editor" && !ocupado) publicar();
  });
  pantalla.addEventListener("input", (e) => {
    const k = e.target.dataset && e.target.dataset.k;
    if (!k || !ed) return;
    ed.n[k] = e.target.value;
    if (k === "publicar" && ed.n.publicar) ed.n.fecha = ed.n.publicar.slice(0, 10);
    cambio();
    if (!$("previa").hidden) pintarPrevia();
  });
  pantalla.addEventListener("change", async (e) => {
    if (e.target.dataset && e.target.dataset.depto && ed) {
      const id = e.target.dataset.depto, set = new Set(ed.n.departamentos || []);
      if (e.target.checked) set.add(id); else set.delete(id);
      ed.n.departamentos = deptos.map((d) => d.id).filter((x) => set.has(x));
      cambio();
      return;
    }
    const campo = e.target.dataset && e.target.dataset.subir;
    if (!campo || !e.target.files[0]) return;
    const archivos = [...e.target.files];
    e.target.value = "";
    if (campo === "cuerpo") {
      // Varias fotos a la vez: se suben una tras otra y quedan juntas, como galería
      const t = $("cuerpo");
      const a = t ? t.selectionStart : ed.n.cuerpo.length;
      const rutas = [];
      let falla = null;
      for (const [i, f] of archivos.entries()) {
        toast(archivos.length > 1 ? `Subiendo foto ${i + 1} de ${archivos.length}…` : "Subiendo foto…");
        try { rutas.push(await subir(f)); } catch (err) { falla = err; }
      }
      if (!ed) return;
      if (rutas.length) {
        const antes = ed.n.cuerpo.slice(0, a).replace(/\s*$/, ""), despues = ed.n.cuerpo.slice(a).replace(/^\s*/, "");
        ed.n.cuerpo = (antes ? antes + "\n\n" : "") + rutas.map((r) => `![](${r})`).join("\n") + (despues ? "\n\n" + despues : "\n\n");
        cambio(); pintarEditor();
      }
      if (falla) toast((rutas.length ? `Se subieron ${rutas.length} de ${archivos.length}. ` : "") + textoError(falla), "error");
      else toast(rutas.length > 1 ? `${rutas.length} fotos agregadas.` : "Foto agregada.");
      return;
    }
    toast(campo === "url" ? "Subiendo PDF…" : "Subiendo foto…");
    try {
      const ruta = await subir(archivos[0]);
      if (!ed) return;
      ed.n[campo] = ruta;
      cambio(); pintarEditor();
      toast(campo === "url" ? "PDF adjuntado." : "Foto agregada.");
    } catch (err) { toast(textoError(err), "error"); }
  });
  pantalla.addEventListener("click", (e) => {
    const el = e.target.closest("button, [data-abrir]");
    if (!el) return;
    if (el.dataset.nueva !== undefined) return abrir("nueva");
    if (el.dataset.abrir) return abrir(el.dataset.abrir, el.dataset.id);
    if (el.dataset.pestana) { pestana = el.dataset.pestana; return pintarLista(); }
    if (el.dataset.salir !== undefined) { if (confirm("¿Cerrar sesión en este celular?")) salir(); return; }
    if (el.dataset.quitar) { ed.n[el.dataset.quitar] = ""; cambio(); return pintarEditor(); }
    if (el.dataset.formato) return formato(el.dataset.formato);
    if (el.dataset.previa !== undefined) {
      const p = $("previa"); p.hidden = !p.hidden;
      el.textContent = p.hidden ? "Vista previa" : "Ocultar vista previa";
      if (!p.hidden) { pintarPrevia(); p.scrollIntoView({ behavior: "smooth", block: "start" }); }
      return;
    }
    if (el.dataset.borrar !== undefined) return borrar();
  });
  $("volver").addEventListener("click", () => cerrarEditor());
  window.addEventListener("popstate", () => { if (ed) cerrarEditor(true); });
  window.addEventListener("beforeunload", (e) => { if (ed && ed.modo === "publicada" && ed.cambios) e.preventDefault(); });
  window.addEventListener("online", () => { $("sinRed").hidden = true; if (ed && ed.cambios && ed.modo === "borrador") guardarBorrador(); });
  window.addEventListener("offline", () => { $("sinRed").hidden = false; });
  $("sinRed").hidden = navigator.onLine;
  // Al volver a la app se actualiza la lista
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && sesion && !ed) cargarListas().then(() => { if (!ed) pintar(); }).catch(() => {});
  });

  /* ---------- Inicio ---------- */
  pintar(!!sesion);
  conectar().then(async () => {
    if (!sesion) return pintar();
    try { await pedir("/utp/yo"); await cargarListas(); } catch (e) { if (!e.salir && sesion) toast(textoError(e), "error"); }
    if (!ed) pintar();
  });
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => { /* se usa sin instalar */ });
})();
