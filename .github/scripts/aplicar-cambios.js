/* ==========================================================
   Revisa y publica los cambios que los funcionarios envían desde el panel /admin/.

   Los funcionarios no pueden escribir en el repositorio: el panel guarda sus cambios
   en una rama de su copia (fork) y abre una solicitud de cambios (pull request).
   Esta acción la revisa según el rol de su autor en data/roles.json (leído siempre
   desde main, nunca desde la solicitud) y:
     - si todo está permitido, aplica los cambios en main y cierra la solicitud;
     - si incluye páginas HTML de un «trabajador», la deja abierta para que el dueño la apruebe;
     - si algo no está permitido, la rechaza explicando por qué.
   Nunca ejecuta código de la solicitud: solo lee sus archivos como datos.
   ========================================================== */
"use strict";

const ROLES = { dueno: "Administrador (dueño)", trabajador: "Administrador (trabajador)", utp: "UTP" };
const SECCIONES = {
  noticias: "Noticias", directivos: "Directivos", departamentos: "Departamentos", personal: "Docentes y personal",
  documentos: "Documentos", redes: "Redes sociales", colores: "Colores", estilo: "Estilo visual",
  horarios: "Horarios", logo: "Logo", organizaciones: "CGPA y CEAL", pilares: "Pilares", lema: "Lema", portada: "Portada del inicio", aviso: "Aviso urgente", eventos: "Calendario escolar", galeria: "Galería de fotos", app: "App del colegio", emergencia: "Emergencias y tsunami",
};
// Solo el dueño puede tocar el código del panel, los scripts, los permisos y la configuración
const PROTEGIDO = /^(\.github\/|admin\/|js\/|data\/roles\.json$|CNAME$|_config\.yml$)/;
// Archivos que un funcionario puede subir (sin SVG ni HTML, que pueden ejecutar código)
const SUBIBLE = /\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|mp3|mp4)$/i;
const URL_PELIGROSA = /^\s*(javascript|data|vbscript|file):/i;

const norm = (s) => String(s || "").toLowerCase();

function permitido(rol, ruta) {
  if (rol === "dueno") return "ok";
  if (PROTEGIDO.test(ruta)) return "no";
  if (rol === "utp") {
    if (/^(img|documentos)\/noticias\//.test(ruta) && SUBIBLE.test(ruta)) return "ok";
    return "no";
  }
  // trabajador
  if (/^(img|documentos)\//.test(ruta)) return SUBIBLE.test(ruta) ? "ok" : "no";
  if (/^css\/.+\.css$/.test(ruta)) return "ok";
  if (/\.html$/.test(ruta)) return "aprobar";
  return "no";
}

// Busca enlaces peligrosos (javascript:, data:…) en cualquier texto del contenido
function enlacesPeligrosos(valor, ruta = "") {
  if (typeof valor === "string") return URL_PELIGROSA.test(valor) ? [ruta] : [];
  if (valor && typeof valor === "object") return Object.entries(valor).flatMap(([k, v]) => enlacesPeligrosos(v, ruta ? `${ruta}.${k}` : k));
  return [];
}

function resumenSitio(antes, despues, claves) {
  return claves.map((k) => {
    const nombre = SECCIONES[k] || k;
    const a = antes[k], d = despues[k];
    if (Array.isArray(a) && Array.isArray(d) && a.length !== d.length) {
      const dif = d.length - a.length;
      return `${nombre} (${dif > 0 ? "+" : ""}${dif})`;
    }
    return nombre;
  });
}

module.exports = async ({ github, context, core }) => {
  const pr = context.payload.pull_request;
  const { owner, repo } = context.repo;
  const base = pr.base.ref;
  const autor = pr.user.login;
  const numero = pr.number;

  const comentar = (body) => github.rest.issues.createComment({ owner, repo, issue_number: numero, body });
  const etiquetar = (label) => github.rest.issues.addLabels({ owner, repo, issue_number: numero, labels: [label] }).catch(() => {});
  const cerrar = () => github.rest.pulls.update({ owner, repo, pull_number: numero, state: "closed" });
  const rechazar = async (motivos) => {
    await comentar(`❌ **No se publicó.**\n\n${motivos.map((m) => "- " + m).join("\n")}\n\nSi necesitas este cambio, pídeselo a un administrador${avisar ? " (" + avisar + ")" : ""}.`);
    await etiquetar("rechazado");
    await cerrar();
    core.info("Rechazado: " + motivos.join("; "));
  };

  const leer = async (ruta, ref) => {
    try {
      const { data } = await github.rest.repos.getContent({ owner, repo, path: ruta, ref });
      if (data.content && data.encoding === "base64") return Buffer.from(data.content, "base64").toString("utf8");
      const blob = await github.rest.git.getBlob({ owner, repo, file_sha: data.sha });
      return Buffer.from(blob.data.content, "base64").toString("utf8");
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  };

  // 1. Rol del autor, siempre según main
  const roles = JSON.parse((await leer("data/roles.json", base)) || '{"usuarios":[]}');
  const ficha = (roles.usuarios || []).find((u) => norm(u.github) === norm(autor));
  // Quien puede escribir en el repositorio (dueño o administrador de la organización) es dueño
  let escritura = norm(autor) === norm(owner);
  if (!escritura) {
    try {
      const { data } = await github.rest.repos.getCollaboratorPermissionLevel({ owner, repo, username: autor });
      escritura = ["admin", "maintain", "write"].includes(data.permission);
    } catch (e) { core.info("Permiso del autor: " + e.message); }
  }
  const rol = escritura ? "dueno" : ficha && ROLES[ficha.rol] ? ficha.rol : null;
  // A quién se avisa: las cuentas con rol «dueño» en Usuarios y permisos (o el dueño del repositorio, si es una persona)
  const duenos = (roles.usuarios || []).filter((u) => u.rol === "dueno" && u.github).map((u) => "@" + u.github);
  const avisar = duenos.length ? duenos.join(" ") : context.payload.repository && context.payload.repository.owner.type === "User" ? "@" + owner : "";
  const quien = ficha && ficha.nombre ? `${ficha.nombre} (@${autor}${rol ? ", " + ROLES[rol] : ""})` : `@${autor}${rol ? " (" + ROLES[rol] + ")" : ""}`;
  if (!rol) return rechazar([`La cuenta @${autor} no tiene permisos en el panel.`]);

  // 2. Archivos de la solicitud, comparados con el punto desde donde partió
  const archivos = await github.paginate(github.rest.pulls.listFiles, { owner, repo, pull_number: numero, per_page: 100 });
  const { data: cmp } = await github.rest.repos.compareCommitsWithBasehead({ owner, repo, basehead: `${pr.base.sha}...${pr.head.sha}` });
  const origen = cmp.merge_base_commit.sha;

  const motivos = [];
  const aprobar = [];
  let sitio = null; // { antes, despues, claves }
  for (const f of archivos) {
    const rutas = [f.filename].concat(f.previous_filename ? [f.previous_filename] : []);
    for (const ruta of rutas) {
      if (ruta === "data/sitio.json") continue;
      const p = permitido(rol, ruta);
      if (p === "no") motivos.push(`Tu rol (${ROLES[rol]}) no permite modificar \`${ruta}\`.`);
      if (p === "aprobar") aprobar.push(ruta);
    }
    if (f.filename === "data/sitio.json") {
      if (f.status === "removed") { motivos.push("No se puede borrar el archivo de contenido del sitio."); continue; }
      const antes = JSON.parse((await leer("data/sitio.json", origen)) || "{}");
      let despues;
      try { despues = JSON.parse(await leer("data/sitio.json", pr.head.sha)); } catch (e) { motivos.push("El archivo de contenido no es válido."); continue; }
      const claves = [...new Set(Object.keys(antes).concat(Object.keys(despues)))]
        .filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
      if (rol === "utp") {
        const otras = claves.filter((k) => k !== "noticias");
        if (otras.length) motivos.push(`Tu rol (UTP) solo permite modificar noticias, no: ${otras.map((k) => SECCIONES[k] || k).join(", ")}.`);
      }
      if (/\b(github_pat_|gh[pousr]_)[A-Za-z0-9_]{20,}/.test(JSON.stringify(despues))) motivos.push("El contenido incluye un token de GitHub pegado por error. Bórralo del campo y vuelve a enviar (y anula ese token en GitHub).");
      // La dirección del servidor de notificaciones solo la cambia el dueño
      if (rol !== "dueno" && claves.includes("app")) motivos.push("Solo el dueño puede cambiar la configuración de la app del colegio.");
      if (rol !== "dueno") {
        const malos = claves.flatMap((k) => enlacesPeligrosos(despues[k], k));
        if (malos.length) motivos.push(`Hay enlaces no permitidos (javascript:, data:…) en: ${malos.slice(0, 5).join(", ")}.`);
      }
      sitio = { antes, despues, claves };
    }
  }
  if (motivos.length) return rechazar(motivos);

  // 3. Páginas HTML de un trabajador: las aprueba el dueño
  if (aprobar.length) {
    await comentar(`🕓 **Pendiente de aprobación.** ${avisar ? avisar + ", " : ""}${quien} quiere cambiar ${aprobar.map((r) => "`" + r + "`").join(", ")}.\n\n` +
      "Las páginas HTML pueden incluir código, así que no se publican solas. Revisa la pestaña «Files changed» y presiona «Merge pull request» si estás de acuerdo, o ciérrala si no.");
    await etiquetar("pendiente");
    return;
  }

  // 4. Aplicar en main: el contenido se mezcla por secciones, para no pisar cambios hechos mientras tanto
  for (let intento = 0; intento < 3; intento++) {
    const { data: ref } = await github.rest.git.getRef({ owner, repo, ref: `heads/${base}` });
    const { data: actual } = await github.rest.git.getCommit({ owner, repo, commit_sha: ref.object.sha });
    const arbol = [];
    for (const f of archivos) {
      if (f.filename === "data/sitio.json") continue;
      if (f.previous_filename) arbol.push({ path: f.previous_filename, mode: "100644", type: "blob", sha: null });
      arbol.push(f.status === "removed"
        ? { path: f.filename, mode: "100644", type: "blob", sha: null }
        : { path: f.filename, mode: "100644", type: "blob", sha: f.sha });
    }
    if (sitio && sitio.claves.length) {
      const hoy = JSON.parse((await leer("data/sitio.json", ref.object.sha)) || "{}");
      for (const k of sitio.claves) {
        if (k in sitio.despues) hoy[k] = sitio.despues[k]; else delete hoy[k];
      }
      arbol.push({ path: "data/sitio.json", mode: "100644", type: "blob", content: JSON.stringify(hoy, null, 2) + "\n" });
    }
    if (!arbol.length) {
      await comentar("ℹ️ No había cambios para publicar.");
      await cerrar();
      return;
    }
    let tree;
    try {
      ({ data: tree } = await github.rest.git.createTree({ owner, repo, base_tree: actual.tree.sha, tree: arbol }));
    } catch (e) {
      // Si GitHub no encuentra los archivos subidos en este repositorio, se copian desde la copia (fork) del autor
      core.info("Copiando archivos desde la copia del autor: " + e.message);
      for (const item of arbol) {
        if (!item.sha) continue;
        const { data: b } = await github.rest.git.getBlob({ owner: pr.head.repo.owner.login, repo: pr.head.repo.name, file_sha: item.sha });
        const { data: nuevo } = await github.rest.git.createBlob({ owner, repo, content: b.content, encoding: "base64" });
        item.sha = nuevo.sha;
      }
      ({ data: tree } = await github.rest.git.createTree({ owner, repo, base_tree: actual.tree.sha, tree: arbol }));
    }
    const titulo = `Cambios de ${quien} desde el panel`;
    const { data: commit } = await github.rest.git.createCommit({
      owner, repo, message: `${titulo}\n\nSolicitud #${numero}`, tree: tree.sha, parents: [ref.object.sha],
    });
    try {
      await github.rest.git.updateRef({ owner, repo, ref: `heads/${base}`, sha: commit.sha });
    } catch (e) {
      if (intento < 2) { core.info("main cambió mientras se aplicaba; reintentando."); continue; }
      throw e;
    }

    const partes = [];
    if (sitio && sitio.claves.length) partes.push(...resumenSitio(sitio.antes, sitio.despues, sitio.claves));
    const otros = archivos.filter((f) => f.filename !== "data/sitio.json");
    if (otros.length) partes.push(`${otros.length} ${otros.length === 1 ? "archivo" : "archivos"} (${otros.slice(0, 6).map((f) => "`" + f.filename + "`").join(", ")}${otros.length > 6 ? "…" : ""})`);
    const aviso = rol === "trabajador" && avisar ? `\n\n${avisar}: les avisamos porque este cambio lo hizo ${quien}.` : "";
    await comentar(`✅ **Publicado.** Cambió: ${partes.join(" · ") || "sin detalles"}.\nEl sitio se actualiza en 1 o 2 minutos.${aviso}`);
    await etiquetar("publicado");
    await cerrar();

    // GitHub Pages no siempre se reconstruye con commits hechos por una acción: se lo pedimos
    await github.request("POST /repos/{owner}/{repo}/pages/builds", { owner, repo }).catch((e) => core.info("Pages: " + e.message));
    core.info(`Publicado ${commit.sha}`);
    return;
  }
};

module.exports.permitido = permitido;
module.exports.enlacesPeligrosos = enlacesPeligrosos;
