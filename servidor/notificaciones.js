/* ==========================================================
   Servidor de notificaciones de la app del colegio (Cloudflare Workers, plan gratis).

   Qué hace:
   - Guarda los celulares que activaron las notificaciones en la app (/app/).
   - Cada minuto revisa el aviso publicado en el sitio (data/sitio.json). Cuando se enciende
     un aviso nuevo con «Enviar notificación a la app», avisa a todos esos celulares.
   - La notificación no lleva el texto: el celular lo lee del sitio al recibirla. Así este
     servidor no guarda ni envía datos personales.

   - Pantalla «Inspectoría» de la app: quien tenga la clave publica o apaga el aviso sin
     entrar al panel. El servidor revisa la clave, guarda el aviso en el sitio (GitHub) y
     notifica al tiro, sin esperar a que el sitio se actualice.

   - Estadísticas de visitas del sitio, sin cookies ni datos personales: solo cuenta cuántas
     veces se abre cada página por día (y si fue desde celular o computador).
   - App «Noticias UTP» (/utp/): el equipo UTP entra con usuario y contraseña (sin GitHub) y solo
     puede escribir, editar, borrar y programar noticias. El servidor guarda en el sitio por ellos.
   - Recordatorios: la tarde anterior a un evento del calendario marcado con «Recordar»,
     avisa a los celulares con la app (desde las 18:00, una vez por día).
   - «Mi curso» en la app: calendario de cada curso solo para sus apoderados, estudiantes y
     profesores (entran con un código que llega a su correo institucional).
   - Panel SM (/admin/) con el correo del colegio: directivos y funcionarios entran con su correo
     institucional y su contraseña (código al correo la primera vez), sin GitHub. Cada cuenta tiene
     permisos que da el dueño en el panel; el servidor guarda en el sitio solo lo permitido.
   - Pruebas y guías: los profesores las envían desde la app, UTP las aprueba y le llegan a impresiones
     con la cantidad de copias (según la matrícula de cada curso o electivo). Los archivos quedan solo aquí.
   - Registro privado de cambios: anota cada cambio del sitio (quién, cuándo, qué) para el registro
     de KPI del encargado web. Solo lo descarga el dueño en el panel.
   - Formulario de Contacto: guarda cada mensaje para verlo en el panel («Mensajes de contacto»)
     y, si está configurado, lo reenvía al correo del colegio con un script de Google (ver la guía).

   Cómo se instala: ver servidor/GUIA.md. Necesita una base de datos D1 enlazada con el
   nombre DB y un «Cron Trigger» cada minuto. Crea solo sus llaves de notificación la primera
   vez y las guarda en la base de datos. Para la pantalla «Inspectoría» necesita además dos
   secretos: CLAVE_INSPECTORIA (la clave que se escribe en la app) y GITHUB_TOKEN (token con
   permiso para escribir en el repositorio del sitio). Nunca salen del servidor.

   Direcciones:
     GET  /clave       llave pública para que la app pueda suscribirse
     POST /suscribir   { endpoint, keys }  guarda un celular
     POST /baja        { endpoint }        lo borra
     POST /enviar      revisa el aviso y manda el siguiente grupo (lo llama la acción de GitHub)
     GET  /estado      cuántos celulares hay, el último envío y el último error de cada servicio
     POST /probar      { endpoint }        manda una notificación de prueba solo a ese celular
     GET  /aviso       aviso publicado desde Inspectoría mientras el sitio se actualiza
     POST /inspectoria/entrar    { clave }            entrega una sesión para ese celular
     POST /inspectoria/publicar  { sesion, aviso }    publica o apaga el aviso
     POST /visita      { p }               suma una visita a la página p (lo envía cada página del sitio)
     POST /notif/personal { endpoint }     mensaje pendiente solo para ese celular (avisos de pruebas a los profesores)
     GET  /estadisticas?dias=30            visitas por día y por página
     POST /contacto    { nombre, email, motivo, mensaje }   mensaje del formulario de Contacto
     GET  /mensajes    (token del panel)   mensajes recibidos; POST /mensajes/leido y /mensajes/borrar { id },
                       /mensajes/asignar { id, correos, reenviar }. Las cuentas con correo a las que se les asignó
                       un mensaje ven solo esos y lo marcan con POST /mensajes/atendido { id, atendido }
     POST /utp/entrar  { usuario, clave }  sesión de la app «Noticias UTP»; con { sesion }: /utp/noticias,
                       /utp/guardar, /utp/borrar, /utp/subir, /utp/borradores, /utp/borrador, /utp/borrador/borrar
     POST /curso/codigo { quien, id } · /curso/verificar { quien, id, codigo } · /curso/entrar { correo, clave }
                       «Mi curso»; con { sesion }: /curso/yo, /curso/fechas, /curso/fecha, /curso/fecha/borrar, /curso/clave,
                       /curso/notificaciones { endpoint, activar } (profesores: avisos de sus pruebas en ese celular)
                       Apoderados: /curso/codigo y /curso/verificar con quien «apoderado» o /curso/colegio { codigo } dan un «pase»
                       del estudiante; /curso/apoderado/correo { pase, correo } · /curso/apoderado/registrar { pase, correo, codigo }
                       · /curso/apoderado/agregar { sesion, pase } · /curso/apoderado/codigo { correo } · /curso/apoderado/entrar { correo, codigo }
     GET  /curso/listas (token del panel); POST /curso/estudiantes, /curso/profesores, /curso/anio, /curso/estudiante/borrar,
                       /curso/codigo-apoderado { rut } (código del colegio, se ve una sola vez), /curso/apoderado/quitar { rut }
     POST /panel/codigo { correo } · /panel/verificar { correo, codigo } · /panel/entrar { correo, clave }
                       Panel con correo; con «Authorization: Panel <sesión>»: /panel/yo, /panel/clave, /panel/guardar,
                       /panel/github, /panel/borradores. Cuentas (dueño o «todo»): /panel/cuentas, /panel/cuenta,
                       /panel/cuenta/borrar, /panel/invitar (correo de bienvenida), /panel/registro
     GET  /panel/propuestas, POST /panel/propuesta { noticia, id } y /panel/propuesta/retirar { id }: noticias con aprobación
     GET  /panel/aprobacion (token del dueño)  noticias por aprobar; POST /panel/aprobacion/aprobar, /rechazar { id, motivo }, /correo { correo }
     POST /pruebas/catalogo, /pruebas/mias, /pruebas/retirar ({ sesion } de «Mi curso», profesores) y /pruebas/subir?m=… (archivo en base64, «Authorization: Curso <sesión>»; sin archivo y con «desde» en m, reutiliza el de otra prueba del profesor)
     GET  /panel/pruebas, /panel/pruebas/archivo?id=, /panel/matricula; POST /panel/pruebas/aprobar, /devolver, /impresa, /anular, /panel/matricula, /panel/matricula/mi-curso
     GET  /panel/kpi?desde=AAAA-MM-DD (token del dueño)  registro privado de cambios del sitio y visitas por día
     GET  /utp/cuentas (token del dueño)   cuentas UTP; POST /utp/cuentas { usuario, nombre, clave } y /utp/cuentas/borrar
   ========================================================== */

// Versión de este código (se ve en /estado para saber si ya se pegó la última en Cloudflare)
const VERSION = "2026-10-28-avisos-profes";
// Sitio del colegio: de aquí se lee el aviso
const SITIO = "https://colegiosm.cl/";
// Páginas que pueden usar este servidor
const ORIGENES = ["https://colegiosm.cl", "https://www.colegiosm.cl", "https://colegiosanmartin.github.io"];
// Servicios de notificación de Google, Apple, Mozilla y Microsoft (no se aceptan otras direcciones)
const SERVICIOS = /^https:\/\/([a-z0-9-]+\.)*(fcm\.googleapis\.com|push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com)\//i;
// El plan gratis permite 50 conexiones por vez: se envía en grupos
const GRUPO = 40;
// Repositorio del sitio y archivo donde vive el aviso
const REPO = "colegiosanmartin/sitio-colegio-san-martin";
const DATOS = "data/sitio.json";
// Un aviso publicado desde Inspectoría manda hasta que el sitio lo muestre (máximo 1 hora)
const VIGENCIA_DIRECTO = 60 * 60 * 1000;
// Sesión de Inspectoría en el celular (se corta al cambiar la clave en Cloudflare)
const DURACION_SESION = 90 * 864e5;

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const texto = (s) => new TextEncoder().encode(s);

async function preparar(db) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS subs (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT UNIQUE NOT NULL, creado TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS estado (k TEXT PRIMARY KEY, v TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS intentos (ip TEXT PRIMARY KEY, fallos INTEGER NOT NULL, hasta INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS visitas (dia TEXT NOT NULL, pagina TEXT NOT NULL, movil INTEGER NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (dia, pagina, movil))"),
    db.prepare("CREATE TABLE IF NOT EXISTS mensajes (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, nombre TEXT, email TEXT, motivo TEXT, mensaje TEXT, enviado INTEGER NOT NULL DEFAULT 0, leido INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS asignaciones (mensaje INTEGER NOT NULL, correo TEXT NOT NULL, t TEXT NOT NULL, atendido TEXT, PRIMARY KEY (mensaje, correo))"),
    db.prepare("CREATE TABLE IF NOT EXISTS envios_contacto (ip TEXT NOT NULL, t INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS cuentas_utp (usuario TEXT PRIMARY KEY, nombre TEXT, sal TEXT NOT NULL, hash TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, creado TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS borradores_utp (usuario TEXT NOT NULL, id TEXT NOT NULL, datos TEXT NOT NULL, actualizado TEXT NOT NULL, PRIMARY KEY (usuario, id))"),
    db.prepare("CREATE TABLE IF NOT EXISTS estudiantes (rut TEXT PRIMARY KEY, nombre TEXT, curso TEXT NOT NULL, correo TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS estudiantes_correo ON estudiantes (correo)"),
    db.prepare("CREATE TABLE IF NOT EXISTS profesores (correo TEXT PRIMARY KEY, nombre TEXT, cursos TEXT NOT NULL DEFAULT '[]', sal TEXT, hash TEXT, version INTEGER NOT NULL DEFAULT 1)"),
    db.prepare("CREATE TABLE IF NOT EXISTS codigos (correo TEXT PRIMARY KEY, hash TEXT NOT NULL, vence INTEGER NOT NULL, intentos INTEGER NOT NULL DEFAULT 0)"),
    db.prepare("CREATE TABLE IF NOT EXISTS envios_codigo (ip TEXT NOT NULL, correo TEXT NOT NULL, t INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS funcionarios (correo TEXT PRIMARY KEY, nombre TEXT, cargo TEXT, permisos TEXT NOT NULL DEFAULT '[]', sal TEXT, hash TEXT, version INTEGER NOT NULL DEFAULT 1, creado TEXT, ultimo TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS registro_panel (id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT NOT NULL, correo TEXT, nombre TEXT, accion TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS equipos_panel (correo TEXT NOT NULL, equipo TEXT NOT NULL, t TEXT NOT NULL, PRIMARY KEY (correo, equipo))"),
    db.prepare("CREATE TABLE IF NOT EXISTS invitaciones (correo TEXT PRIMARY KEY, t TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS borradores_panel (correo TEXT PRIMARY KEY, datos TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1)"),
    db.prepare("CREATE TABLE IF NOT EXISTS pruebas (id TEXT PRIMARY KEY, correo TEXT NOT NULL, nombre TEXT, cursos TEXT NOT NULL, asignatura TEXT NOT NULL, electivo INTEGER NOT NULL DEFAULT 0, fecha TEXT NOT NULL, tipo TEXT, comentario TEXT, archivo TEXT, tam INTEGER, partes INTEGER NOT NULL DEFAULT 0, copias INTEGER, estado TEXT NOT NULL, motivo TEXT, t TEXT NOT NULL, habiles INTEGER, revisor TEXT, t_rev TEXT, impresor TEXT, t_imp TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS pruebas_partes (id TEXT NOT NULL, n INTEGER NOT NULL, datos TEXT NOT NULL, PRIMARY KEY (id, n))"),
    db.prepare("CREATE TABLE IF NOT EXISTS matricula (curso TEXT NOT NULL, grupo TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (curso, grupo))"),
    db.prepare("CREATE TABLE IF NOT EXISTS noticias_pendientes (id TEXT PRIMARY KEY, correo TEXT NOT NULL, nombre TEXT, cargo TEXT, t TEXT NOT NULL, datos TEXT NOT NULL, rechazo TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS registro_kpi (sha TEXT NOT NULL, n INTEGER NOT NULL, t TEXT NOT NULL, quien TEXT, tipo TEXT NOT NULL, detalle TEXT, datos TEXT, PRIMARY KEY (sha, n))"),
    db.prepare("CREATE INDEX IF NOT EXISTS registro_kpi_t ON registro_kpi (t)"),
    db.prepare("CREATE TABLE IF NOT EXISTS apoderados (rut TEXT PRIMARY KEY, correo TEXT NOT NULL, creado TEXT, via TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS apoderados_correo ON apoderados (correo)"),
    db.prepare("CREATE TABLE IF NOT EXISTS codigos_colegio (rut TEXT PRIMARY KEY, hash TEXT NOT NULL, vence INTEGER NOT NULL, creado TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS subs_profes (endpoint TEXT PRIMARY KEY, correo TEXT NOT NULL, t TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS notif_personales (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL, titulo TEXT, cuerpo TEXT, url TEXT, t INTEGER NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS notif_personales_endpoint ON notif_personales (endpoint)"),
    db.prepare("CREATE TABLE IF NOT EXISTS fechas_curso (id INTEGER PRIMARY KEY AUTOINCREMENT, curso TEXT NOT NULL, fecha TEXT NOT NULL, fin TEXT, hora TEXT, titulo TEXT NOT NULL, tipo TEXT, descripcion TEXT, autor TEXT, creado TEXT)"),
  ]);
}
const leerEstado = async (db, k) => {
  const r = await db.prepare("SELECT v FROM estado WHERE k = ?").bind(k).first();
  return r ? JSON.parse(r.v) : null;
};

// Llaves VAPID: se crean una sola vez
async function llaves(db) {
  let g = await leerEstado(db, "vapid");
  if (!g) {
    const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    g = {
      privada: await crypto.subtle.exportKey("jwk", par.privateKey),
      publica: b64url(await crypto.subtle.exportKey("raw", par.publicKey)),
    };
    await db.prepare("INSERT OR IGNORE INTO estado (k, v) VALUES ('vapid', ?)").bind(JSON.stringify(g)).run();
    g = await leerEstado(db, "vapid");
  }
  return g;
}

// Firma para cada servicio de notificación (Google, Apple…)
async function firma(g, audiencia) {
  const key = await crypto.subtle.importKey("jwk", g.privada, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cab = b64url(texto(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const cue = b64url(texto(JSON.stringify({ aud: audiencia, exp: Math.floor(Date.now() / 1000) + 3600, sub: SITIO.replace(/\/$/, "") })));
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, texto(`${cab}.${cue}`));
  return `vapid t=${cab}.${cue}.${b64url(sig)}, k=${g.publica}`;
}

// Manda un aviso sin texto a un celular (el texto lo lee el celular desde el sitio)
async function empujar(g, firmas, endpoint) {
  const aud = new URL(endpoint).origin;
  firmas[aud] = firmas[aud] || firma(g, aud);
  // Sin encabezado «Topic»: Apple lo rechaza (BadWebPushTopic) y no hace falta
  return fetch(endpoint, { method: "POST", headers: { Authorization: await firmas[aud], TTL: "43200", Urgency: "high", "Content-Length": "0" } });
}
// Guarda el último rechazo de cada servicio (Apple, Google…) para revisarlo en /estado
async function anotarErrores(db, errores) {
  if (!Object.keys(errores).length) return;
  const prev = (await leerEstado(db, "errores")) || {};
  await db.prepare("INSERT INTO estado (k, v) VALUES ('errores', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({ ...prev, ...errores })).run();
}
const describir = async (res, aud) => ({ servicio: new URL(aud).hostname, estado: res.status, detalle: (await res.text().catch(() => "")).slice(0, 200), fecha: new Date().toISOString() });

// Aviso publicado hace poco desde Inspectoría (el sitio puede tardar un par de minutos en mostrarlo)
async function avisoDirecto(db) {
  const d = await leerEstado(db, "directo");
  return d && Date.now() - d.t < VIGENCIA_DIRECTO ? d.aviso : null;
}

// Cuando el sitio ya muestra el aviso de Inspectoría, vuelve a mandar el sitio (así un cambio
// posterior hecho en el panel no queda tapado)
const mismoAviso = (a, b) => JSON.stringify([!!(a && a.activo), a && a.nivel, a && a.titulo, a && a.texto]) === JSON.stringify([!!(b && b.activo), b && b.nivel, b && b.titulo, b && b.texto]);
async function revisarDirecto(db) {
  const d = await avisoDirecto(db);
  if (!d) return;
  const r = await fetch(SITIO + DATOS + "?t=" + Date.now(), { cf: { cacheTtl: 0 } });
  if (r.ok && mismoAviso((await r.json()).aviso, d)) await db.prepare("DELETE FROM estado WHERE k = 'directo'").run();
}

// Fecha y hora escritas en el panel (hora de Chile, sin zona horaria) → instante real.
// Considera el horario de verano de Chile.
function horaChile(s) {
  s = String(s || "");
  if (!s) return null;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return new Date(s);
  const m = /^(\d{4})-(\d\d)-(\d\d)(?:[T ](\d\d):(\d\d))?/.exec(s);
  if (!m) return null;
  const utc = Date.UTC(+m[1], m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
    .formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const visto = Date.UTC(+p.year, p.month - 1, +p.day, +p.hour, +p.minute);
  return new Date(utc - (visto - utc));
}

// Aviso vigente y su «huella» para no repetir el envío (null: no hay aviso que notificar)
async function avisoActual(db) {
  let a = await avisoDirecto(db);
  if (!a) {
    const r = await fetch(SITIO + DATOS + "?t=" + Date.now(), { cf: { cacheTtl: 0 } });
    if (!r.ok) throw new Error("No se pudo leer el sitio (" + r.status + ")");
    a = (await r.json()).aviso;
  }
  if (!a || !a.activo || a.notificar === false || !(a.titulo || a.texto)) return null;
  if (a.hasta && horaChile(a.hasta) < new Date()) return null;
  // Aviso programado: se notifica recién cuando llega su hora
  if (a.desde && horaChile(a.desde) > new Date()) return null;
  const huella = b64url(await crypto.subtle.digest("SHA-256", texto([a.nivel, a.titulo, a.texto, a.hasta].join("|")))).slice(0, 22);
  return { huella };
}

// Envía el siguiente grupo. Devuelve cuántos quedan.
async function enviar(db) {
  await preparar(db);
  const aviso = await avisoActual(db);
  let envio = await leerEstado(db, "envio");
  if (aviso && (!envio || envio.huella !== aviso.huella)) {
    const nuevo = { huella: aviso.huella, cursor: 0, enviadas: 0, inicio: new Date().toISOString() };
    // Solo uno empieza el envío aunque lleguen dos llamadas juntas
    const r = await db.prepare("INSERT INTO estado (k, v) VALUES ('envio', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1 WHERE v = ?2")
      .bind(JSON.stringify(nuevo), envio ? JSON.stringify(envio) : "").run();
    envio = r.meta.changes ? nuevo : await leerEstado(db, "envio");
  }
  // Sin aviso: se olvida el último, así si se vuelve a encender el mismo aviso se notifica de nuevo
  if (!aviso) {
    if (envio && envio.huella) await db.prepare("UPDATE estado SET v = ? WHERE k = 'envio' AND v = ?").bind(JSON.stringify({ ...envio, huella: "" }), JSON.stringify(envio)).run();
    return { quedan: 0, enviadas: 0, aviso: false };
  }
  if (!envio) return { quedan: 0, enviadas: 0 };
  return mandarGrupo(db, "envio", envio);
}

// Manda el siguiente grupo de un envío (aviso o recordatorio) guardado en estado[k]
async function mandarGrupo(db, k, envio) {
  // Reserva el grupo moviendo el cursor (si otra llamada se adelantó, no se repite nadie)
  const lote = (await db.prepare("SELECT id, endpoint FROM subs WHERE id > ? ORDER BY id LIMIT ?").bind(envio.cursor, GRUPO).all()).results;
  if (!lote.length) return { quedan: 0, enviadas: envio.enviadas, huella: envio.huella };
  const siguiente = { ...envio, cursor: lote[lote.length - 1].id, enviadas: envio.enviadas + lote.length };
  const r = await db.prepare("UPDATE estado SET v = ? WHERE k = ? AND v = ?").bind(JSON.stringify(siguiente), k, JSON.stringify(envio)).run();
  if (!r.meta.changes) return { quedan: 1, enviadas: envio.enviadas, ocupado: true };

  const g = await llaves(db);
  const firmas = {};
  const vencidos = [];
  const errores = {};
  await Promise.all(lote.map(async (s) => {
    try {
      const res = await empujar(g, firmas, s.endpoint);
      if (res.status === 404 || res.status === 410) vencidos.push(s.id);
      else if (!res.ok) { const aud = new URL(s.endpoint).origin; errores[aud] = await describir(res, aud); }
    } catch (e) { /* se reintenta en el próximo aviso */ }
  }));
  await anotarErrores(db, errores);
  if (vencidos.length) await db.prepare(`DELETE FROM subs WHERE id IN (${vencidos.map(() => "?").join(",")})`).bind(...vencidos).run();
  const resto = await db.prepare("SELECT COUNT(*) AS n FROM subs WHERE id > ?").bind(siguiente.cursor).first();
  return { quedan: resto.n, enviadas: siguiente.enviadas, huella: envio.huella, grupo: lote.length };
}

/* ---------- Recordatorios del calendario ----------
   La tarde anterior (desde las 18:00 de Chile) a un evento marcado con «Recordar» en el panel,
   avisa a los celulares con la app. Como los avisos, la notificación no lleva texto: el celular
   ve en el sitio qué eventos hay mañana. Se envía una sola vez por día. */
const HORA_RECORDATORIO = 18;
function ahoraChile(dias) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
    .formatToParts(new Date(Date.now() + (dias || 0) * 864e5)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: +p.hour };
}
async function recordatorios(db) {
  const { hora } = ahoraChile();
  if (hora < HORA_RECORDATORIO || hora >= 23) return { quedan: 0, enviadas: 0 };
  const manana = ahoraChile(1).dia;
  let envio = await leerEstado(db, "recordatorio");
  if (envio && envio.dia === manana && envio.listo) return { quedan: 0, enviadas: envio.enviadas || 0 };
  // Sin eventos para mañana: se vuelve a mirar cada 15 minutos (por si agregan uno)
  if (envio && envio.dia === manana && envio.sin && Date.now() - envio.revisado < 15 * 60e3) return { quedan: 0, enviadas: 0 };
  if (!envio || envio.dia !== manana || envio.sin) {
    const r = await fetch(SITIO + DATOS + "?t=" + Date.now(), { cf: { cacheTtl: 0 } });
    if (!r.ok) return { quedan: 0, enviadas: 0 };
    const eventos = (await r.json()).eventos;
    const hay = (Array.isArray(eventos) ? eventos : []).some((e) => e && e.recordar && e.titulo && e.fecha === manana);
    const nuevo = hay ? { dia: manana, cursor: 0, enviadas: 0, inicio: new Date().toISOString() } : { dia: manana, sin: true, revisado: Date.now() };
    // Solo uno empieza el envío aunque lleguen dos llamadas juntas
    const w = await db.prepare("INSERT INTO estado (k, v) VALUES ('recordatorio', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1 WHERE v = ?2")
      .bind(JSON.stringify(nuevo), envio ? JSON.stringify(envio) : "").run();
    if (!hay) return { quedan: 0, enviadas: 0 };
    envio = w.meta.changes ? nuevo : await leerEstado(db, "recordatorio");
    if (!envio || envio.dia !== manana || envio.sin || envio.listo) return { quedan: 0, enviadas: 0 };
  }
  const res = await mandarGrupo(db, "recordatorio", envio);
  if (!res.quedan && !res.ocupado) {
    const actual = await leerEstado(db, "recordatorio");
    if (actual && actual.dia === manana) await db.prepare("UPDATE estado SET v = ? WHERE k = 'recordatorio' AND v = ?").bind(JSON.stringify({ ...actual, listo: true }), JSON.stringify(actual)).run();
  }
  return res;
}

/* ---------- Inspectoría ---------- */
const b64aTexto = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));
const textoAB64 = (s) => {
  const bytes = texto(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const llaveSesion = (clave) => crypto.subtle.importKey("raw", texto(clave), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);

async function crearSesion(clave) {
  const vence = Date.now() + DURACION_SESION;
  const sig = await crypto.subtle.sign("HMAC", await llaveSesion(clave), texto("inspectoria|" + vence));
  return vence + "." + b64url(sig);
}
async function sesionValida(clave, sesion) {
  const m = /^(\d{10,16})\.([A-Za-z0-9_-]{20,})$/.exec(String(sesion || ""));
  if (!m || +m[1] < Date.now()) return false;
  const sig = Uint8Array.from(atob(m[2].replace(/-/g, "+").replace(/_/g, "/") + "===".slice((m[2].length + 3) % 4)), (c) => c.charCodeAt(0));
  return crypto.subtle.verify("HMAC", await llaveSesion(clave), sig, texto("inspectoria|" + m[1]));
}
// Compara la clave sin revelar por el tiempo de respuesta cuántas letras coinciden
async function mismaClave(a, b) {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", texto(String(s)))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let dif = 0;
  for (let i = 0; i < u.length; i++) dif |= u[i] ^ v[i];
  return dif === 0;
}

// Tras 5 claves equivocadas desde una misma conexión, espera cada vez más larga (15 min, 30 min… hasta 1 día)
async function entrar(db, env, ip, clave) {
  const ahora = Date.now();
  const reg = await db.prepare("SELECT fallos, hasta FROM intentos WHERE ip = ?").bind(ip).first();
  if (reg && reg.hasta > ahora) return { error: `Demasiados intentos. Espera ${Math.ceil((reg.hasta - ahora) / 60000)} minutos e inténtalo de nuevo.`, estado: 429 };
  if (clave && await mismaClave(clave, env.CLAVE_INSPECTORIA)) {
    await db.prepare("DELETE FROM intentos WHERE ip = ?").bind(ip).run();
    return { sesion: await crearSesion(env.CLAVE_INSPECTORIA) };
  }
  const fallos = (reg ? reg.fallos : 0) + 1;
  const hasta = fallos >= 5 ? ahora + Math.min(15 * 60000 * 2 ** (fallos - 5), 864e5) : 0;
  await db.prepare("INSERT INTO intentos (ip, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(ip) DO UPDATE SET fallos = ?2, hasta = ?3").bind(ip, fallos, hasta).run();
  return { error: fallos >= 5 ? "Clave incorrecta. Por seguridad, espera 15 minutos antes de volver a intentar." : "Clave incorrecta.", estado: 401 };
}

// Revisa lo que llega desde la app: solo se acepta el aviso, con largo limitado
function limpiarAviso(d) {
  if (!d || d.activo !== true) return { activo: false };
  const titulo = String(d.titulo || "").trim().slice(0, 120);
  const textoAviso = String(d.texto || "").trim().slice(0, 700);
  if (!titulo && !textoAviso) return null;
  return {
    activo: true,
    nivel: ["urgente", "importante", "info"].includes(d.nivel) ? d.nivel : "urgente",
    titulo,
    texto: textoAviso,
    notificar: d.notificar !== false,
  };
}

// Escribe el aviso en data/sitio.json del repositorio (el sitio se publica solo con cada cambio)
async function guardarEnGitHub(env, aviso) {
  return cambiarDatos(env, (datos) => {
    // Al apagar se conserva el resto del aviso (como hace el panel)
    datos.aviso = aviso.activo ? aviso : { ...(datos.aviso || {}), activo: false };
    return datos.aviso;
  }, aviso.activo ? "Aviso publicado desde la app (Inspectoría)" : "Aviso apagado desde la app (Inspectoría)");
}

async function publicar(db, env, d) {
  if (!(await sesionValida(env.CLAVE_INSPECTORIA, d.sesion))) return { error: "La sesión venció o la clave cambió. Vuelve a entrar.", estado: 401, salir: true };
  const aviso = limpiarAviso(d.aviso);
  if (!aviso) return { error: "Escribe al menos el título o el texto del aviso.", estado: 400 };
  let guardado;
  try {
    guardado = await guardarEnGitHub(env, aviso);
  } catch (e) {
    if (e.message === "token") return { error: "El servidor no tiene permiso para guardar en el sitio (el token de GitHub venció o fue anulado). Avisa a quien administra el sitio.", estado: 502 };
    return { error: String(e.message || e), estado: 502 };
  }
  await db.prepare("INSERT INTO estado (k, v) VALUES ('directo', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({ t: Date.now(), aviso: guardado })).run();
  return { ok: true, aviso: guardado };
}

/* ---------- App «Noticias UTP»: usuario y contraseña, sin cuenta de GitHub ----------
   Las cuentas las crea el dueño en el panel («Usuarios y permisos»). Las contraseñas se guardan
   solo como huella (PBKDF2), nunca en texto. El servidor guarda en el sitio con su propio token
   (GITHUB_TOKEN) y solo deja tocar las noticias y subir imágenes o PDF de noticias. */
const DURACION_UTP = 30 * 864e5;
const ITERACIONES = 20000;
const TIPOS_NOTICIA = ["comunicado", "pedagogia", "comunidad"];
const hexDe = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const deB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const slugUtp = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").slice(0, 70).replace(/^-+|-+$/g, "");
const PARECE_TOKEN = /\b(github_pat_[A-Za-z0-9_]{20,}|gh[pousr]_[A-Za-z0-9]{20,})/;

async function huella(clave, sal) {
  const k = await crypto.subtle.importKey("raw", texto(clave), "PBKDF2", false, ["deriveBits"]);
  return hexDe(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: texto(sal), iterations: ITERACIONES }, k, 256));
}
const llaveUtp = (env) => crypto.subtle.importKey("raw", texto("utp|" + env.GITHUB_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
async function sesionUtp(env, cuenta) {
  const datos = b64url(texto(JSON.stringify({ u: cuenta.usuario, v: cuenta.version, e: Date.now() + DURACION_UTP })));
  return datos + "." + b64url(await crypto.subtle.sign("HMAC", await llaveUtp(env), texto(datos)));
}
// Devuelve la cuenta si la sesión es válida (se corta al borrar la cuenta o cambiar su contraseña)
async function cuentaDeSesion(db, env, sesion) {
  const m = /^([A-Za-z0-9_-]{10,400})\.([A-Za-z0-9_-]{20,})$/.exec(String(sesion || ""));
  if (!m || !(await crypto.subtle.verify("HMAC", await llaveUtp(env), deB64url(m[2]), texto(m[1])))) return null;
  let d; try { d = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { return null; }
  if (!d || d.e < Date.now()) return null;
  const c = await db.prepare("SELECT usuario, nombre, version FROM cuentas_utp WHERE usuario = ?").bind(d.u).first();
  return c && c.version === d.v ? c : null;
}

async function entrarUtp(db, env, ip, usuario, clave) {
  const ahora = Date.now(), llave = "utp|" + ip;
  const reg = await db.prepare("SELECT fallos, hasta FROM intentos WHERE ip = ?").bind(llave).first();
  if (reg && reg.hasta > ahora) return { error: `Demasiados intentos. Espera ${Math.ceil((reg.hasta - ahora) / 60000)} minutos e inténtalo de nuevo.`, estado: 429 };
  const c = await db.prepare("SELECT * FROM cuentas_utp WHERE usuario = ?").bind(usuario).first();
  const h = await huella(clave, c ? c.sal : "sin-cuenta");
  if (c && clave && await mismaClave(h, c.hash)) {
    await db.prepare("DELETE FROM intentos WHERE ip = ?").bind(llave).run();
    return { sesion: await sesionUtp(env, c), nombre: c.nombre || c.usuario };
  }
  const fallos = (reg ? reg.fallos : 0) + 1;
  const hasta = fallos >= 5 ? ahora + Math.min(15 * 60000 * 2 ** (fallos - 5), 864e5) : 0;
  await db.prepare("INSERT INTO intentos (ip, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(ip) DO UPDATE SET fallos = ?2, hasta = ?3").bind(llave, fallos, hasta).run();
  return { error: fallos >= 5 ? "Usuario o contraseña incorrectos. Por seguridad, espera 15 minutos antes de volver a intentar." : "Usuario o contraseña incorrectos.", estado: 401 };
}

// Lee data/sitio.json del repositorio, aplica un cambio y lo guarda (reintenta si alguien guardó al mismo tiempo)
const cabGitHub = (env) => ({ Authorization: "Bearer " + env.GITHUB_TOKEN, Accept: "application/vnd.github+json", "User-Agent": "avisos-colegio", "X-GitHub-Api-Version": "2022-11-28" });
const FIRMA = { name: "App del colegio", email: "app@colegiosm.cl" };
async function leerDatosGitHub(env) {
  const r = await fetch(`https://api.github.com/repos/${REPO}/contents/${DATOS}?ref=main&t=${Date.now()}`, { headers: cabGitHub(env) });
  if (r.status === 401 || r.status === 403 || r.status === 404) throw new Error("token");
  if (!r.ok) throw new Error("GitHub respondió " + r.status);
  const archivo = await r.json();
  // Los archivos de más de 1 MB llegan sin contenido: se piden aparte
  const contenido = archivo.content ? b64aTexto(archivo.content)
    : await (await fetch(`https://api.github.com/repos/${REPO}/git/blobs/${archivo.sha}`, { headers: { ...cabGitHub(env), Accept: "application/vnd.github.raw" } })).text();
  return { sha: archivo.sha, datos: JSON.parse(contenido) };
}
async function cambiarDatos(env, cambiar, mensaje) {
  for (let intento = 0; intento < 3; intento++) {
    const { sha, datos } = await leerDatosGitHub(env);
    const resultado = cambiar(datos);
    const json = JSON.stringify(datos, null, 2) + "\n";
    if (PARECE_TOKEN.test(json)) throw Object.assign(new Error("El contenido parece incluir una clave de GitHub. No se guardó."), { estado: 400 });
    const w = await fetch(`https://api.github.com/repos/${REPO}/contents/${DATOS}`, {
      method: "PUT", headers: { ...cabGitHub(env), "Content-Type": "application/json" },
      body: JSON.stringify({ message: mensaje, content: textoAB64(json), sha, branch: "main", committer: FIRMA, author: FIRMA }),
    });
    if (w.ok) return resultado;
    if (w.status === 401 || w.status === 403) throw new Error("token");
    if (w.status !== 409 && w.status !== 422) throw new Error("GitHub respondió " + w.status);
  }
  throw new Error("El sitio estaba ocupado guardando otro cambio. Inténtalo de nuevo.");
}

// Revisa una noticia que llega desde la app: solo campos conocidos, con largo limitado
const RUTA_IMAGEN = /^img\/noticias\/[a-z0-9][a-z0-9._-]{0,120}\.(jpe?g|png|webp)$/;
const RUTA_ADJUNTO = /^(documentos\/noticias\/[a-z0-9][a-z0-9._-]{0,120}\.pdf|img\/noticias\/[a-z0-9][a-z0-9._-]{0,120}\.(jpe?g|png|webp))$/;
function limpiarNoticia(d, deptos) {
  const s = (v, n) => String(v == null ? "" : v).replace(/\r/g, "").trim().slice(0, n);
  const n = {
    titulo: s(d.titulo, 200),
    fecha: /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) ? d.fecha : new Intl.DateTimeFormat("sv", { timeZone: "America/Santiago" }).format(new Date()),
    tipo: TIPOS_NOTICIA.includes(d.tipo) ? d.tipo : "comunicado",
    resumen: s(d.resumen, 600),
    cuerpo: s(d.cuerpo, 30000),
    imagen: RUTA_IMAGEN.test(d.imagen || "") ? d.imagen : "",
    url: RUTA_ADJUNTO.test(d.url || "") || /^https:\/\/[^\s"<>]{3,500}$/.test(d.url || "") ? d.url : "",
  };
  // Uno o varios departamentos o equipos (las versiones antiguas de la app mandan uno solo, en «departamento»)
  const elegidos = [...new Set((Array.isArray(d.departamentos) ? d.departamentos : [d.departamento]).filter((x) => deptos.includes(x)))];
  if (elegidos.length) n.departamentos = elegidos;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.publicar || "")) { n.publicar = d.publicar; n.fecha = d.publicar.slice(0, 10); }
  if (!n.titulo) return null;
  return n;
}
const idDepto = (x) => x.id || slugUtp(String(x.nombre || "").replace(/^Departamento (de )?/i, "")) || "departamento";

async function noticiasUtp(env) {
  const { datos } = await leerDatosGitHub(env);
  return {
    noticias: (datos.noticias || []).slice(0, 200),
    departamentos: (datos.departamentos || []).map((x) => ({ id: idDepto(x), nombre: x.nombre, tipo: x.tipo })),
    servidor: (datos.app && datos.app.servidor) || "",
  };
}
async function guardarNoticiaUtp(env, d, c) {
  let nueva = null;
  const r = await cambiarDatos(env, (datos) => {
    datos.noticias = datos.noticias || [];
    const n = limpiarNoticia(d.noticia || {}, (datos.departamentos || []).map(idDepto));
    if (!n) throw Object.assign(new Error("Falta el título de la noticia."), { estado: 400 });
    const i = d.id ? datos.noticias.findIndex((x) => x.id === d.id) : -1;
    if (d.id && i < 0) throw Object.assign(new Error("Esa noticia ya no existe (quizás alguien la borró)."), { estado: 404 });
    if (i >= 0) {
      const prev = datos.noticias[i];
      n.id = prev.id;
      if (prev.autor) n.autor = prev.autor;
      if (prev.autorCargo) n.autorCargo = prev.autorCargo;
      datos.noticias[i] = n;
    } else {
      // Autoría de la noticia nueva: el nombre de la cuenta UTP
      n.autor = c.nombre || c.usuario; n.autorCargo = "UTP";
      const usados = new Set(datos.noticias.map((x) => x.id));
      const base = slugUtp(`${n.fecha} ${n.titulo}`) || "noticia";
      let id = base, k = 2;
      while (usados.has(id)) id = `${base}-${k++}`;
      n.id = id; datos.noticias.unshift(n);
    }
    datos.noticias.sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")));
    nueva = n;
    return n;
  }, d.id ? "Noticia editada desde la app UTP" : "Noticia publicada desde la app UTP");
  return { ok: true, noticia: r || nueva };
}
async function borrarNoticiaUtp(env, id) {
  await cambiarDatos(env, (datos) => {
    const antes = (datos.noticias || []).length;
    datos.noticias = (datos.noticias || []).filter((x) => x.id !== id);
    if (datos.noticias.length === antes) throw Object.assign(new Error("Esa noticia ya no existe."), { estado: 404 });
  }, "Noticia borrada desde la app UTP");
  return { ok: true };
}
// Sube una imagen (ya achicada en el celular) o un PDF a la carpeta de noticias
async function subirArchivoUtp(env, d) {
  const pdf = d.tipo === "application/pdf";
  const ext = pdf ? "pdf" : d.tipo === "image/png" ? "png" : d.tipo === "image/webp" ? "webp" : "jpg";
  if (!pdf && !/^image\/(jpeg|png|webp)$/.test(d.tipo || "")) return { error: "Solo se aceptan fotos (JPG, PNG o WEBP) o PDF.", estado: 400 };
  const datos = String(d.datos || "").replace(/^data:[^,]*,/, "");
  if (!/^[A-Za-z0-9+/=]+$/.test(datos) || datos.length > (pdf ? 14e6 : 6e6)) return { error: pdf ? "El PDF es muy grande (máximo 10 MB)." : "La foto es muy grande.", estado: 400 };
  const nombre = (slugUtp(String(d.nombre || "").replace(/\.[a-z0-9]+$/i, "")).slice(0, 40) || "archivo");
  const ruta = `${pdf ? "documentos/noticias" : "img/noticias"}/${Date.now().toString(36)}-${nombre}.${ext}`;
  const w = await fetch(`https://api.github.com/repos/${REPO}/contents/${ruta}`, {
    method: "PUT", headers: { ...cabGitHub(env), "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Subir ${nombre}.${ext} desde la app UTP`, content: datos, branch: "main", committer: FIRMA, author: FIRMA }),
  });
  if (w.status === 401 || w.status === 403) throw new Error("token");
  if (!w.ok) return { error: "GitHub respondió " + w.status, estado: 502 };
  return { ok: true, ruta };
}

// Solo quien tiene permiso de escritura en el repositorio (el dueño) administra las cuentas UTP
async function esDueno(req) {
  const token = (/^Bearer\s+(\S{20,200})$/.exec(req.headers.get("Authorization") || "") || [])[1];
  if (!token) return false;
  const r = await fetch(`https://api.github.com/repos/${REPO}`, { headers: { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "avisos-colegio", "X-GitHub-Api-Version": "2022-11-28" } });
  return r.ok && !!((await r.json()).permissions || {}).push;
}
async function cuentasUtp(db, url, d) {
  if (url.pathname === "/utp/cuentas" && !d) {
    return { cuentas: (await db.prepare("SELECT usuario, nombre, creado FROM cuentas_utp ORDER BY nombre").all()).results };
  }
  const usuario = String(d.usuario || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return { error: "El usuario debe tener entre 3 y 30 letras o números, sin espacios.", estado: 400 };
  if (url.pathname === "/utp/cuentas/borrar") {
    await db.batch([db.prepare("DELETE FROM cuentas_utp WHERE usuario = ?").bind(usuario), db.prepare("DELETE FROM borradores_utp WHERE usuario = ?").bind(usuario)]);
    return { ok: true };
  }
  const nombre = String(d.nombre || "").trim().slice(0, 80);
  const clave = String(d.clave || "");
  const existe = await db.prepare("SELECT version FROM cuentas_utp WHERE usuario = ?").bind(usuario).first();
  if (!existe && !clave) return { error: "Escribe una contraseña para la cuenta nueva.", estado: 400 };
  if (clave && (clave.length < 8 || clave.length > 100)) return { error: "La contraseña debe tener al menos 8 caracteres.", estado: 400 };
  if (clave) {
    const sal = hexDe(crypto.getRandomValues(new Uint8Array(16)));
    const hash = await huella(clave, sal);
    await db.prepare(`INSERT INTO cuentas_utp (usuario, nombre, sal, hash, version, creado) VALUES (?1, ?2, ?3, ?4, 1, ?5)
      ON CONFLICT(usuario) DO UPDATE SET nombre = ?2, sal = ?3, hash = ?4, version = version + 1`).bind(usuario, nombre, sal, hash, new Date().toISOString().slice(0, 10)).run();
  } else await db.prepare("UPDATE cuentas_utp SET nombre = ? WHERE usuario = ?").bind(nombre, usuario).run();
  return { ok: true };
}

async function rutaUtp(db, env, req, url) {
  const d = await req.json().catch(() => ({}));
  if (url.pathname === "/utp/entrar") {
    return entrarUtp(db, env, req.headers.get("CF-Connecting-IP") || "?", String(d.usuario || "").trim().toLowerCase().slice(0, 30), String(d.clave || "").slice(0, 100));
  }
  const c = await cuentaDeSesion(db, env, d.sesion);
  if (!c) return { error: "La sesión venció o la cuenta cambió. Vuelve a entrar.", estado: 401, salir: true };
  switch (url.pathname) {
    case "/utp/yo": return { nombre: c.nombre || c.usuario, usuario: c.usuario };
    case "/utp/noticias": return noticiasUtp(env);
    case "/utp/guardar": return guardarNoticiaUtp(env, d, c);
    case "/utp/borrar": return borrarNoticiaUtp(env, String(d.id || ""));
    case "/utp/subir": return subirArchivoUtp(env, d);
    case "/utp/borradores":
      return { borradores: (await db.prepare("SELECT id, datos, actualizado FROM borradores_utp WHERE usuario = ? ORDER BY actualizado DESC").bind(c.usuario).all()).results
        .map((b) => ({ id: b.id, actualizado: b.actualizado, ...JSON.parse(b.datos) })) };
    case "/utp/borrador": {
      const id = String(d.id || "");
      if (!/^[a-z0-9-]{6,40}$/.test(id)) return { error: "Borrador no válido.", estado: 400 };
      const datos = JSON.stringify(d.datos || {});
      if (datos.length > 60000) return { error: "El borrador es muy largo.", estado: 400 };
      if (PARECE_TOKEN.test(datos)) return { error: "El texto parece incluir una clave de GitHub. No se guardó.", estado: 400 };
      const n = await db.prepare("SELECT COUNT(*) AS n FROM borradores_utp WHERE usuario = ?").bind(c.usuario).first();
      if (n.n >= 50) return { error: "Tienes demasiados borradores. Publica o borra algunos.", estado: 400 };
      const ahora = new Date().toISOString();
      await db.prepare("INSERT INTO borradores_utp (usuario, id, datos, actualizado) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(usuario, id) DO UPDATE SET datos = ?3, actualizado = ?4")
        .bind(c.usuario, id, datos, ahora).run();
      return { ok: true, actualizado: ahora };
    }
    case "/utp/borrador/borrar":
      await db.prepare("DELETE FROM borradores_utp WHERE usuario = ? AND id = ?").bind(c.usuario, String(d.id || "")).run();
      return { ok: true };
  }
  return { error: "No encontrado", estado: 404 };
}

/* ---------- Estadísticas de visitas (sin cookies ni datos personales) ---------- */
const hoyChile = () => new Intl.DateTimeFormat("sv", { timeZone: "America/Santiago" }).format(new Date());

async function visita(db, req) {
  const d = JSON.parse((await req.text()).slice(0, 500) || "{}");
  const pagina = String(d.p || "/").toLowerCase().replace(/index\.html$/, "").replace(/\/?$/, "/");
  if (!/^\/[a-z0-9\-\/]{0,80}$/.test(pagina) || pagina.startsWith("/admin")) return;
  if (/bot|crawl|spider|slurp|preview|headless/i.test(req.headers.get("User-Agent") || "")) return;
  const movil = d.m ? 1 : 0;
  await db.prepare("INSERT INTO visitas (dia, pagina, movil, n) VALUES (?1, ?2, ?3, 1) ON CONFLICT(dia, pagina, movil) DO UPDATE SET n = n + 1")
    .bind(hoyChile(), pagina, movil).run();
}

async function estadisticas(db, dias) {
  dias = Math.min(Math.max(+dias || 30, 1), 400);
  const desde = new Intl.DateTimeFormat("sv", { timeZone: "America/Santiago" }).format(new Date(Date.now() - (dias - 1) * 864e5));
  const q = (sql) => db.prepare(sql).bind(desde).all().then((r) => r.results);
  const [porDia, porPagina, equipo] = await Promise.all([
    q("SELECT dia, SUM(n) AS n FROM visitas WHERE dia >= ? GROUP BY dia ORDER BY dia"),
    q("SELECT pagina, SUM(n) AS n FROM visitas WHERE dia >= ? GROUP BY pagina ORDER BY n DESC LIMIT 60"),
    q("SELECT movil, SUM(n) AS n FROM visitas WHERE dia >= ? GROUP BY movil"),
  ]);
  return { desde, dias, porDia, porPagina, movil: (equipo.find((x) => x.movil) || {}).n || 0, computador: (equipo.find((x) => !x.movil) || {}).n || 0 };
}

/* ---------- Pruebas y guías para imprimir ----------
   Los profesores (con su cuenta de «Mi curso» en la app) envían pruebas y guías en PDF o Word.
   UTP (permiso «pruebas») las aprueba o las devuelve con un comentario. Al aprobarse, le llega un correo
   a quien tiene el permiso «impresiones», que las descarga en el panel y las marca como impresas.
   Las copias salen de la matrícula de cada curso o electivo, más las copias extra.
   Los archivos se guardan aquí, en la base de datos del servidor (en trozos, como texto base64),
   nunca en el repositorio del sitio, que es público. Se borran 30 días después de la fecha de evaluación, y hay un tope de espacio
   (la base de datos gratuita admite 500 MB en total). */
const PRUEBA_MAX = 15 * 1024 * 1024;
const PRUEBAS_ESPACIO = 300 * 1024 * 1024;
const TROZO = 1500000;
const TIPOS_PRUEBA = { prueba: "Prueba", guia: "Guía" };
// Firma de cada formato en base64: PDF («%PDF»), Word nuevo (ZIP «PK») y Word antiguo
const FORMATOS_PRUEBA = { pdf: /^JVBER/, docx: /^UEsDB/, doc: /^0M8R4KGx/ };
const AJUSTES_PRUEBAS = { anticipacion: 2, extra: 1 };
const esPrimerCiclo = (curso) => /^[1-6]° básico/i.test(curso);
async function ajustesPruebas(db) {
  return { ...AJUSTES_PRUEBAS, ...((await leerEstado(db, "pruebas")) || {}) };
}
// Días hábiles (lunes a viernes) desde hoy hasta la fecha de evaluación
function diasHabiles(hasta) {
  const [y, m, d] = String(hasta).split("-").map(Number);
  if (!y) return 0;
  let t = new Date(hoyChile() + "T12:00:00Z"), fin = new Date(Date.UTC(y, m - 1, d, 12)), n = 0;
  while (t < fin) { t = new Date(t.getTime() + 864e5); if (t.getUTCDay() % 6) n++; }
  return n;
}
// Cursos y asignaturas, tomados de los horarios del sitio. Las celdas con « | » son electivos (grupos aparte).
async function catalogoPruebas() {
  const sitio = await fetch(SITIO + DATOS + "?t=" + Date.now(), { cf: { cacheTtl: 0 } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const cursos = ((sitio.horarios || {}).cursos || []).map((c) => {
    const asig = new Map();
    for (const f of c.filas || []) for (const celda of f.celdas || []) {
      const partes = String(celda || "").split(/\s*\|\s*/).map((x) => x.trim()).filter(Boolean);
      for (const p of partes) {
        const nombre = /^Taller/i.test(p) ? p : p.split(" · ")[0];
        if (/^(recreo|colaci[oó]n|almuerzo)$/i.test(nombre)) continue;
        if (partes.length > 1 || !asig.has(nombre)) asig.set(nombre, partes.length > 1 || !!(asig.get(nombre) || {}).electivo ? { nombre, electivo: true } : { nombre, electivo: false });
      }
    }
    return { curso: c.nombre, asignaturas: [...asig.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) };
  });
  return cursos;
}
async function matriculaMapa(db) {
  const m = {};
  for (const r of (await db.prepare("SELECT curso, grupo, n FROM matricula").all()).results) (m[r.curso] = m[r.curso] || {})[r.grupo] = r.n;
  return m;
}
// Copias: estudiantes de cada curso (o del electivo) más las extra por curso. null si falta algún dato.
function calcularCopias(cursos, asignatura, electivo, matricula, extra) {
  let total = 0;
  for (const c of cursos) {
    const n = (matricula[c] || {})[electivo ? asignatura : ""];
    if (n == null) return null;
    total += n + extra;
  }
  return total;
}
const filaPrueba = (r) => ({ id: r.id, correo: r.correo, nombre: r.nombre, cursos: JSON.parse(r.cursos || "[]"), asignatura: r.asignatura, electivo: !!r.electivo,
  fecha: r.fecha, tipo: r.tipo, comentario: r.comentario || "", archivo: r.archivo, tam: r.tam, copias: r.copias, estado: r.estado, motivo: r.motivo || "",
  t: r.t, revisor: r.revisor || "", tRevision: r.t_rev || "", impresor: r.impresor || "", tImpresa: r.t_imp || "", habiles: r.habiles, conArchivo: r.partes > 0 });
const fechaLarga = (f) => { const [y, m, d] = String(f).split("-"); return `${+d}-${+m}-${y}`; };
// «jueves 5 de noviembre» (para las notificaciones, que se leen rápido)
const fechaTexto = (f) => {
  const [y, m, d] = String(f).split("-").map(Number);
  if (!y) return String(f);
  const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${dias[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()]} ${d} de ${meses[m - 1]}`;
};
const resumenPrueba = (p) => `${TIPOS_PRUEBA[p.tipo] || "Prueba"} de ${p.asignatura} · ${p.cursos.join(", ")} · evaluación el ${fechaLarga(p.fecha)}`;

// Correo a las cuentas del panel que tienen un permiso (UTP: solo las de su ciclo, si las hay)
async function avisarPermiso(db, env, permiso, cursos, asunto, cuerpo) {
  if (!env.CORREO_URL || !env.CORREO_CLAVE) return 0;
  const cuentas = (await db.prepare("SELECT correo, nombre, cargo, permisos FROM funcionarios").all()).results
    .filter((f) => permisosDe(f).includes(permiso));
  const ciclo = (f) => (/primer ciclo/i.test(f.cargo || "") ? "1" : /segundo ciclo/i.test(f.cargo || "") ? "2" : "");
  const delCiclo = permiso === "pruebas" ? cuentas.filter((f) => !ciclo(f) || cursos.some((c) => (esPrimerCiclo(c) ? "1" : "2") === ciclo(f))) : cuentas;
  let n = 0;
  for (const f of delCiclo.length ? delCiclo : cuentas) if (await llamarCorreo(db, env, { tipo: "mensaje", para: f.correo, asunto: asunto.slice(0, 150), cuerpo })) n++;
  return n;
}

// Notificación a los celulares de un profesor (los que activó en «Mi curso»). Como los avisos, llega sin texto:
// el celular lo pide en /notif/personal. Si falla, igual le llega el correo.
async function avisarProfe(db, correo, titulo, cuerpo) {
  try {
    const subs = (await db.prepare("SELECT p.endpoint FROM subs_profes p JOIN subs s ON s.endpoint = p.endpoint WHERE p.correo = ? LIMIT 5").bind(correo).all()).results;
    if (!subs.length) return 0;
    const t = Date.now();
    await db.batch(subs.map((s) => db.prepare("INSERT INTO notif_personales (endpoint, titulo, cuerpo, url, t) VALUES (?, ?, ?, ?, ?)").bind(s.endpoint, titulo.slice(0, 120), cuerpo.slice(0, 240), "./#micurso", t)));
    const g = await llaves(db), firmas = {};
    const res = await Promise.all(subs.map((s) => empujar(g, firmas, s.endpoint).catch(() => null)));
    return res.filter((r) => r && r.ok).length;
  } catch (e) { return 0; }
}

// Rutas del profesor (sesión de «Mi curso»)
async function rutaPruebasProfe(db, env, req, url) {
  const auth = /^Curso\s+(\S+)$/.exec(req.headers.get("Authorization") || "");
  const d = url.pathname === "/pruebas/subir" ? {} : await req.json().catch(() => ({}));
  const q = await quienCurso(db, auth ? auth[1] : d.sesion);
  if (!q || q.rol !== "profe") return { error: "La sesión venció. Vuelve a entrar en «Mi curso».", estado: 401, salir: true };
  const p = q.profe;
  if (url.pathname === "/pruebas/catalogo") {
    const [cursos, matricula, aj] = await Promise.all([catalogoPruebas(), matriculaMapa(db), ajustesPruebas(db)]);
    // «reusar»: este servidor acepta enviar de nuevo el archivo de una prueba anterior (ver «desde» en /pruebas/subir)
    return { cursos, mios: p.cursos, matricula, extra: aj.extra, anticipacion: aj.anticipacion, hoy: hoyChile(), reusar: true };
  }
  if (url.pathname === "/pruebas/mias") {
    const filas = (await db.prepare("SELECT * FROM pruebas WHERE correo = ? ORDER BY t DESC LIMIT 60").bind(p.correo).all()).results;
    return { pruebas: filas.map(filaPrueba) };
  }
  if (url.pathname === "/pruebas/retirar") {
    const r = await db.prepare("SELECT estado FROM pruebas WHERE id = ? AND correo = ?").bind(String(d.id || ""), p.correo).first();
    if (!r) return { error: "No se encontró ese envío.", estado: 404 };
    if (!["enviada", "devuelta"].includes(r.estado)) return { error: "Ya fue aprobada: pídele a UTP que la anule.", estado: 409 };
    await db.batch([db.prepare("DELETE FROM pruebas WHERE id = ?").bind(d.id), db.prepare("DELETE FROM pruebas_partes WHERE id = ?").bind(d.id)]);
    return { ok: true };
  }
  if (url.pathname !== "/pruebas/subir" || req.method !== "POST") return { error: "No encontrado", estado: 404 };
  // Datos en la dirección (?m=…) y el archivo en el cuerpo, como texto base64 (así el servidor no tiene que convertirlo)
  let m; try { m = JSON.parse(url.searchParams.get("m") || "{}"); } catch (e) { return { error: "Datos no válidos.", estado: 400 }; }
  const catalogo = await catalogoPruebas();
  const cursos = [...new Set((Array.isArray(m.cursos) ? m.cursos : []).map(String))].filter((c) => catalogo.some((x) => x.curso === c));
  if (!cursos.length) return { error: "Elige al menos un curso.", estado: 400 };
  const asignatura = String(m.asignatura || "").trim().slice(0, 100);
  const enCurso = cursos.map((c) => catalogo.find((x) => x.curso === c).asignaturas.find((a) => a.nombre === asignatura));
  if (!asignatura || enCurso.some((a) => !a)) return { error: "Esa asignatura no está en el horario de todos los cursos elegidos.", estado: 400 };
  const electivo = enCurso.some((a) => a.electivo);
  if (!/^\d{4}-\d\d-\d\d$/.test(m.fecha || "") || m.fecha < hoyChile()) return { error: "Revisa la fecha de evaluación.", estado: 400 };
  const tipo = TIPOS_PRUEBA[m.tipo] ? m.tipo : "prueba";
  const comentario = String(m.comentario || "").trim().slice(0, 600);
  const previa = m.id ? await db.prepare("SELECT * FROM pruebas WHERE id = ? AND correo = ?").bind(String(m.id), p.correo).first() : null;
  if (m.id && (!previa || !["enviada", "devuelta"].includes(previa.estado))) return { error: "Ese envío ya no se puede cambiar.", estado: 409 };
  const datos = (await req.text()).trim();
  // «desde»: sin archivo nuevo, se usa el de otra prueba del mismo profesor (la misma prueba para otro curso)
  const origen = !datos && m.desde ? await db.prepare("SELECT id, archivo, tam, partes FROM pruebas WHERE id = ? AND correo = ? AND partes > 0").bind(String(m.desde), p.correo).first() : null;
  if (!datos && m.desde && !origen) return { error: "Ese archivo ya no está en el servidor (se borran 30 días después de la evaluación). Súbelo de nuevo.", estado: 400 };
  let archivo = previa ? previa.archivo : "", ext = "", partes = previa ? previa.partes : 0, tam = previa ? previa.tam : 0;
  if (origen) {
    ({ archivo, tam, partes } = origen);
    const ocupado = (await db.prepare("SELECT COALESCE(SUM(tam), 0) AS n FROM pruebas WHERE partes > 0 AND id != ?").bind(String(m.id || "")).first()).n;
    if (ocupado + tam > PRUEBAS_ESPACIO) return { error: "El espacio para pruebas del servidor está lleno. Avísale a UTP o al encargado web.", estado: 507 };
  } else if (datos) {
    ext = (/\.([a-z]+)$/i.exec(String(m.archivo || "")) || [])[1];
    ext = ext && ext.toLowerCase();
    if (!FORMATOS_PRUEBA[ext] || !FORMATOS_PRUEBA[ext].test(datos)) return { error: "Sube el archivo en PDF o Word (.docx).", estado: 400 };
    tam = Math.floor(datos.length * 3 / 4);
    if (tam > PRUEBA_MAX) return { error: "El archivo es muy grande (máximo 15 MB).", estado: 400 };
    archivo = String(m.archivo).replace(/[^\p{L}\p{N} ._()-]/gu, "").slice(-120) || "prueba." + ext;
    partes = Math.ceil(datos.length / TROZO);
    const ocupado = (await db.prepare("SELECT COALESCE(SUM(tam), 0) AS n FROM pruebas WHERE partes > 0 AND id != ?").bind(String(m.id || "")).first()).n;
    if (ocupado + tam > PRUEBAS_ESPACIO) return { error: "El espacio para pruebas del servidor está lleno. Avísale a UTP o al encargado web.", estado: 507 };
  } else if (!previa) return { error: "Adjunta el archivo de la prueba o guía.", estado: 400 };
  const aj = await ajustesPruebas(db);
  const copias = calcularCopias(cursos, asignatura, electivo, await matriculaMapa(db), aj.extra);
  const id = previa ? previa.id : Date.now().toString(36) + hexDe(crypto.getRandomValues(new Uint8Array(3)));
  const habiles = diasHabiles(m.fecha);
  const sentencias = [db.prepare(`INSERT INTO pruebas (id, correo, nombre, cursos, asignatura, electivo, fecha, tipo, comentario, archivo, tam, partes, copias, estado, motivo, t, habiles)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, 'enviada', NULL, ?14, ?15)
    ON CONFLICT(id) DO UPDATE SET cursos = ?4, asignatura = ?5, electivo = ?6, fecha = ?7, tipo = ?8, comentario = ?9, archivo = ?10, tam = ?11, partes = ?12, copias = ?13,
      estado = 'enviada', motivo = NULL, t = ?14, habiles = ?15`)
    .bind(id, p.correo, p.nombre || "", JSON.stringify(cursos), asignatura, electivo ? 1 : 0, m.fecha, tipo, comentario, archivo, tam, partes, copias, new Date().toISOString(), habiles)];
  if (datos) {
    sentencias.push(db.prepare("DELETE FROM pruebas_partes WHERE id = ?").bind(id));
    for (let i = 0; i < partes; i++) sentencias.push(db.prepare("INSERT INTO pruebas_partes (id, n, datos) VALUES (?, ?, ?)").bind(id, i, datos.slice(i * TROZO, (i + 1) * TROZO)));
  } else if (origen && origen.id !== id) {
    sentencias.push(db.prepare("DELETE FROM pruebas_partes WHERE id = ?").bind(id));
    sentencias.push(db.prepare("INSERT INTO pruebas_partes (id, n, datos) SELECT ?1, n, datos FROM pruebas_partes WHERE id = ?2").bind(id, origen.id));
  }
  await db.batch(sentencias);
  const fila = filaPrueba(await db.prepare("SELECT * FROM pruebas WHERE id = ?").bind(id).first());
  await avisarPermiso(db, env, "pruebas", cursos, `${previa ? "Corregida" : "Por aprobar"}: ${TIPOS_PRUEBA[tipo]} de ${asignatura} · ${cursos.join(", ")}`,
    `${p.nombre || p.correo} ${previa ? "corrigió" : "envió"} una ${TIPOS_PRUEBA[tipo].toLowerCase()} para imprimir:\n\n${resumenPrueba(fila)}\n` +
    (copias != null ? `Copias: ${copias}\n` : "Copias: falta la matrícula de algún curso\n") + (comentario ? `Comentario: ${comentario}\n` : "") +
    (habiles < aj.anticipacion ? `\nOjo: llegó con ${habiles} ${habiles === 1 ? "día hábil" : "días hábiles"} de anticipación (lo pedido son ${aj.anticipacion}).\n` : "") +
    `\nPara revisarla y aprobarla, entra al Panel SM (${SITIO}admin/) → «Pruebas y guías».`);
  return { ok: true, prueba: fila, atrasada: habiles < aj.anticipacion, anticipacion: aj.anticipacion };
}

// Rutas del panel: UTP («pruebas»), impresiones («impresiones») o el dueño con el token
async function rutaPruebasPanel(db, env, req, url, f, d) {
  const utp = tiene(f, "pruebas"), imprime = tiene(f, "pruebas", "impresiones");
  if (!imprime) return { error: "Tu cuenta no tiene acceso a las pruebas.", estado: 403 };
  if (url.pathname === "/panel/pruebas") {
    const filas = (await db.prepare(`SELECT * FROM pruebas WHERE ${utp ? "1" : "estado IN ('aprobada', 'impresa')"} AND (estado NOT IN ('impresa', 'devuelta') OR t >= ?) ORDER BY fecha, t LIMIT 400`)
      .bind(new Date(Date.now() - 45 * 864e5).toISOString()).all()).results;
    const imp = (await db.prepare("SELECT correo, nombre, permisos FROM funcionarios").all()).results.filter((x) => permisosDe(x).includes("impresiones"));
    return { pruebas: filas.map(filaPrueba), utp, ciclo: /primer ciclo/i.test(f.cargo || "") ? "1" : /segundo ciclo/i.test(f.cargo || "") ? "2" : "",
      impresiones: imp.map((x) => x.nombre || x.correo), ...(await ajustesPruebas(db)) };
  }
  if (url.pathname === "/panel/pruebas/archivo") {
    const id = url.searchParams.get("id") || d.id;
    const p = await db.prepare("SELECT estado, partes FROM pruebas WHERE id = ?").bind(String(id || "")).first();
    if (!p || (!utp && !["aprobada", "impresa"].includes(p.estado))) return { error: "No se encontró esa prueba.", estado: 404 };
    if (!p.partes) return { error: "El archivo ya se borró (se guardan hasta 30 días después de la evaluación).", estado: 410 };
    // Se envía por partes, sin juntar todo en memoria
    let i = 0;
    const flujo = new ReadableStream({ async pull(ctrl) {
      if (i >= p.partes) return ctrl.close();
      const r = await db.prepare("SELECT datos FROM pruebas_partes WHERE id = ? AND n = ?").bind(id, i++).first();
      ctrl.enqueue(texto(r ? r.datos : ""));
    } });
    return { flujo };
  }
  if (url.pathname === "/panel/matricula") {
    if (req.method === "GET") return { cursos: await catalogoPruebas(), matricula: await matriculaMapa(db), ...(await ajustesPruebas(db)), puedeEditar: utp };
    if (!utp) return { error: "Solo UTP cambia la matrícula.", estado: 403 };
    const filas = (Array.isArray(d.matricula) ? d.matricula : []).slice(0, 400)
      .map((x) => ({ curso: String(x.curso || "").slice(0, 40), grupo: String(x.grupo || "").slice(0, 100), n: x.n === "" || x.n == null ? null : Math.max(0, Math.min(200, Math.round(+x.n))) }))
      .filter((x) => x.curso && (x.n == null || Number.isFinite(x.n)));
    const aj = { anticipacion: Math.max(0, Math.min(15, Math.round(+d.anticipacion))), extra: Math.max(0, Math.min(20, Math.round(+d.extra))) };
    await db.batch([
      ...filas.map((x) => x.n == null ? db.prepare("DELETE FROM matricula WHERE curso = ? AND grupo = ?").bind(x.curso, x.grupo)
        : db.prepare("INSERT INTO matricula (curso, grupo, n) VALUES (?1, ?2, ?3) ON CONFLICT(curso, grupo) DO UPDATE SET n = ?3").bind(x.curso, x.grupo, x.n)),
      db.prepare("INSERT INTO estado (k, v) VALUES ('pruebas', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({
        anticipacion: Number.isFinite(aj.anticipacion) ? aj.anticipacion : AJUSTES_PRUEBAS.anticipacion, extra: Number.isFinite(aj.extra) ? aj.extra : AJUSTES_PRUEBAS.extra })),
    ]);
    return { ok: true };
  }
  if (url.pathname === "/panel/matricula/mi-curso") {
    return { cuenta: (await db.prepare("SELECT curso, COUNT(*) AS n FROM estudiantes GROUP BY curso").all()).results };
  }
  const p = await db.prepare("SELECT * FROM pruebas WHERE id = ?").bind(String(d.id || "")).first();
  if (!p) return { error: "Esa prueba ya no existe.", estado: 404 };
  const fila = filaPrueba(p);
  const quien = f.nombre || f.cargo || "UTP";
  const alProfe = (asunto, cuerpo) => (env.CORREO_URL && env.CORREO_CLAVE ? llamarCorreo(db, env, { tipo: "mensaje", para: p.correo, asunto: asunto.slice(0, 150), cuerpo }) : false);
  if (url.pathname === "/panel/pruebas/aprobar") {
    if (!utp) return { error: "Solo UTP aprueba las pruebas.", estado: 403 };
    if (p.estado !== "enviada") return { error: "Esa prueba ya fue revisada.", estado: 409 };
    const copias = Math.round(+d.copias);
    if (!(copias > 0 && copias <= 2000)) return { error: "Escribe cuántas copias se imprimen.", estado: 400 };
    await db.prepare("UPDATE pruebas SET estado = 'aprobada', copias = ?, revisor = ?, t_rev = ? WHERE id = ?").bind(copias, quien, new Date().toISOString(), p.id).run();
    await anotar(db, f, "Aprobó para imprimir: " + resumenPrueba(fila));
    const avisados = await avisarPermiso(db, env, "impresiones", fila.cursos, `Para imprimir: ${copias} copias · ${fila.asignatura} · ${fila.cursos.join(", ")}`,
      `UTP aprobó una ${TIPOS_PRUEBA[p.tipo].toLowerCase()} para imprimir:\n\n${resumenPrueba(fila)}\nCopias: ${copias}\nDocente: ${p.nombre || p.correo}\n` +
      (p.comentario ? `Indicaciones: ${p.comentario}\n` : "") + `\nDescárgala en el Panel SM (${SITIO}admin/) → «Pruebas y guías» → «Para imprimir», y márcala como impresa al terminar.`);
    await avisarProfe(db, p.correo, `UTP aprobó tu ${TIPOS_PRUEBA[p.tipo].toLowerCase()} de ${fila.asignatura}`,
      `${fila.cursos.join(", ")}: se imprimirán ${copias} copias para la evaluación del ${fechaTexto(fila.fecha)}.`);
    await alProfe(`Aprobada: ${fila.asignatura} · ${fila.cursos.join(", ")}`,
      `Hola${p.nombre ? " " + p.nombre.split(" ")[0] : ""}:\n\nUTP aprobó tu ${TIPOS_PRUEBA[p.tipo].toLowerCase()} (${resumenPrueba(fila)}) y la envió a impresión (${copias} copias).\n\nColegio San Martín`);
    return { ok: true, avisados };
  }
  if (url.pathname === "/panel/pruebas/devolver") {
    if (!utp) return { error: "Solo UTP devuelve las pruebas.", estado: 403 };
    const motivo = String(d.motivo || "").trim().slice(0, 1000) || "Necesita algunos cambios.";
    await db.prepare("UPDATE pruebas SET estado = 'devuelta', motivo = ?, revisor = ?, t_rev = ? WHERE id = ?").bind(motivo, quien, new Date().toISOString(), p.id).run();
    await anotar(db, f, "Devolvió con comentarios: " + resumenPrueba(fila));
    await avisarProfe(db, p.correo, `UTP pidió un cambio en tu ${TIPOS_PRUEBA[p.tipo].toLowerCase()} de ${fila.asignatura}`, motivo.slice(0, 180));
    const avisado = await alProfe(`Con comentarios de UTP: ${fila.asignatura} · ${fila.cursos.join(", ")}`,
      `Hola${p.nombre ? " " + p.nombre.split(" ")[0] : ""}:\n\nUTP revisó tu ${TIPOS_PRUEBA[p.tipo].toLowerCase()} (${resumenPrueba(fila)}) y pide cambios antes de imprimirla:\n\n${motivo}\n\nCorrígela en la app del colegio (${SITIO}app/) → «Mi curso» → «Pruebas para imprimir» → «Corregir y reenviar».\n\nColegio San Martín`);
    return { ok: true, avisado };
  }
  if (url.pathname === "/panel/pruebas/impresa") {
    if (!["aprobada", "impresa"].includes(p.estado)) return { error: "Esa prueba aún no está aprobada.", estado: 409 };
    const lista = d.impresa !== false;
    await db.prepare("UPDATE pruebas SET estado = ?, impresor = ?, t_imp = ? WHERE id = ?").bind(lista ? "impresa" : "aprobada", lista ? quien : null, lista ? new Date().toISOString() : null, p.id).run();
    if (lista && p.estado !== "impresa") await avisarProfe(db, p.correo, `Tu ${TIPOS_PRUEBA[p.tipo].toLowerCase()} de ${fila.asignatura} está impresa`,
      `${p.copias} copias listas para la evaluación del ${fechaTexto(fila.fecha)} (${fila.cursos.join(", ")}).`);
    return { ok: true };
  }
  if (url.pathname === "/panel/pruebas/anular") {
    if (!utp) return { error: "Solo UTP anula las pruebas.", estado: 403 };
    await db.batch([db.prepare("DELETE FROM pruebas WHERE id = ?").bind(p.id), db.prepare("DELETE FROM pruebas_partes WHERE id = ?").bind(p.id)]);
    await anotar(db, f, "Anuló: " + resumenPrueba(fila));
    return { ok: true };
  }
  return { error: "No encontrado", estado: 404 };
}

/* ---------- Noticias con aprobación (por ejemplo, CGPA y CEAL) ----------
   Las cuentas con el permiso «propuestas» no publican: su noticia queda guardada aquí y le llega un
   correo al encargado web, que la revisa en el panel (entrando con el token) y la aprueba o pide cambios. */
const MAX_PENDIENTES = 20;
const leerPendiente = (r) => ({ id: r.id, correo: r.correo, nombre: r.nombre, cargo: r.cargo, t: r.t, rechazo: r.rechazo || "", noticia: JSON.parse(r.datos) });
async function propuestas(db, env, url, f, d) {
  if (!tiene(f, "propuestas", "noticias")) return { error: "Tu cuenta no puede enviar noticias.", estado: 403 };
  if (url.pathname === "/panel/propuestas") {
    const filas = (await db.prepare("SELECT * FROM noticias_pendientes WHERE correo = ? ORDER BY t DESC").bind(f.correo).all()).results;
    return { propuestas: filas.map(leerPendiente) };
  }
  const id = /^[a-z0-9]{6,20}$/.test(d.id || "") ? d.id : "";
  const previa = id ? await db.prepare("SELECT * FROM noticias_pendientes WHERE id = ?").bind(id).first() : null;
  if (previa && previa.correo !== f.correo) return { error: "Esa noticia no es tuya.", estado: 403 };
  if (url.pathname === "/panel/propuesta/retirar") {
    if (previa) await db.prepare("DELETE FROM noticias_pendientes WHERE id = ?").bind(id).run();
    return { ok: true };
  }
  // Se revisa igual que en la app UTP: solo campos conocidos, con largo limitado y departamentos que existen
  const sitio = await fetch(SITIO + DATOS + "?t=" + Date.now(), { cf: { cacheTtl: 0 } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  const n = limpiarNoticia(d.noticia || {}, (sitio.departamentos || []).map(idDepto));
  if (!n) return { error: "Escribe un título antes de enviarla.", estado: 400 };
  if (d.noticia && d.noticia.flyer) n.flyer = true;
  if (f.nombre) n.autor = f.nombre;
  if (f.cargo) n.autorCargo = f.cargo;
  if (!previa) {
    const c = await db.prepare("SELECT COUNT(*) AS n FROM noticias_pendientes WHERE correo = ?").bind(f.correo).first();
    if (c.n >= MAX_PENDIENTES) return { error: `Ya tienes ${MAX_PENDIENTES} noticias esperando aprobación. Espera a que se revisen.`, estado: 429 };
  }
  const nuevoId = previa ? id : Date.now().toString(36) + hexDe(crypto.getRandomValues(new Uint8Array(3)));
  await db.prepare(`INSERT INTO noticias_pendientes (id, correo, nombre, cargo, t, datos) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(id) DO UPDATE SET t = ?5, datos = ?6, rechazo = NULL`).bind(nuevoId, f.correo, f.nombre || "", f.cargo || "", new Date().toISOString(), JSON.stringify(n)).run();
  await anotar(db, f, "Envió para aprobación: " + n.titulo);
  // Aviso por correo al encargado web (si dejó su correo en el panel)
  const destino = await leerEstado(db, "aprobacion");
  let avisado = false;
  if (destino && destino.correo && env.CORREO_URL && env.CORREO_CLAVE) {
    avisado = await llamarCorreo(db, env, { tipo: "mensaje", para: destino.correo, responder: f.correo,
      asunto: `Noticia por aprobar: ${n.titulo}`.slice(0, 150),
      cuerpo: `${f.nombre || f.correo}${f.cargo ? ` (${f.cargo})` : ""} ${previa ? "corrigió" : "envió"} una noticia para publicar en el sitio:\n\n${n.titulo}\n${n.resumen || ""}\n\nPara revisarla y aprobarla, entra al Panel SM con tu token: ${SITIO}admin/ → Noticias → «Por aprobar».` });
  }
  return { ok: true, id: nuevoId, avisado };
}
async function aprobacion(db, env, url, d) {
  if (url.pathname === "/panel/aprobacion") {
    const filas = (await db.prepare("SELECT * FROM noticias_pendientes WHERE rechazo IS NULL ORDER BY t").all()).results;
    return { pendientes: filas.map(leerPendiente), correo: ((await leerEstado(db, "aprobacion")) || {}).correo || "" };
  }
  if (url.pathname === "/panel/aprobacion/correo") {
    const correo = normalizarCorreo(d.correo);
    if (d.correo && (!correo || !correoDelColegio(correo))) return { error: `Usa un correo institucional (@${DOMINIO_COLEGIO}).`, estado: 400 };
    await db.prepare("INSERT INTO estado (k, v) VALUES ('aprobacion', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({ correo: correo || "" })).run();
    return { ok: true, correo: correo || "" };
  }
  const p = await db.prepare("SELECT * FROM noticias_pendientes WHERE id = ?").bind(String(d.id || "")).first();
  if (!p) return { error: "Esa noticia ya no está esperando aprobación.", estado: 404 };
  const titulo = JSON.parse(p.datos).titulo;
  const avisar = (asunto, cuerpo) => (env.CORREO_URL && env.CORREO_CLAVE ? llamarCorreo(db, env, { tipo: "mensaje", para: p.correo, asunto, cuerpo }) : false);
  const dueno = { correo: "dueño (GitHub)", nombre: "Dueño del panel" };
  if (url.pathname === "/panel/aprobacion/aprobar") {
    await db.prepare("DELETE FROM noticias_pendientes WHERE id = ?").bind(p.id).run();
    await anotar(db, dueno, `Aprobó la noticia de ${p.nombre || p.correo}: ${titulo}`);
    const avisado = await avisar(`Tu noticia ya está publicada: ${titulo}`.slice(0, 150),
      `Hola${p.nombre ? " " + p.nombre.split(" ")[0] : ""}:\n\nTu noticia «${titulo}» fue aprobada y ya está publicada en ${SITIO}noticias/ (el sitio se actualiza en 1 o 2 minutos).\n\nColegio San Martín`);
    return { ok: true, avisado };
  }
  if (url.pathname === "/panel/aprobacion/rechazar") {
    const motivo = String(d.motivo || "").trim().slice(0, 1000) || "Necesita algunos cambios antes de publicarse.";
    await db.prepare("UPDATE noticias_pendientes SET rechazo = ? WHERE id = ?").bind(motivo, p.id).run();
    await anotar(db, dueno, `Pidió cambios a la noticia de ${p.nombre || p.correo}: ${titulo}`);
    const avisado = await avisar(`Tu noticia necesita cambios: ${titulo}`.slice(0, 150),
      `Hola${p.nombre ? " " + p.nombre.split(" ")[0] : ""}:\n\nTu noticia «${titulo}» todavía no se publicó. Comentario del encargado web:\n\n${motivo}\n\nPara corregirla, entra al Panel SM (${SITIO}admin/) → Noticias → «Enviadas para aprobación» → «Seguir editando».\n\nColegio San Martín`);
    return { ok: true, avisado };
  }
  return { error: "No encontrado", estado: 404 };
}

/* ---------- Registro privado de cambios (para el registro de KPI) ----------
   Cada minuto, si no hay un envío de notificaciones en curso, el servidor lee los cambios nuevos
   del repositorio y anota cada uno: cuándo, quién, de qué tipo y el detalle (título de la noticia,
   aviso encendido o apagado, archivos subidos…). Incluye lo que se guarda con el token de GitHub,
   con las cuentas con correo y desde las apps. Queda solo en esta base de datos (no en el sitio
   público) y lo descarga el dueño en el panel: Estadísticas → «Descargar registro de KPI». */
const INICIO_KPI = "2026-10-09T03:00:00Z";
const API_REPO = "https://api.github.com/repos/" + REPO;
const SECCIONES_EXTRA = { colores: "Colores", estilo: "Diseño de las páginas", logo: "Logo", lema: "Lema", app: "App del colegio" };
const CLASE_NOTICIA = (n) => (n.flyer ? "Flyer" : n.comunicado ? "Comunicado" : "Noticia");

async function huellaCorta(s) {
  return hexDe(await crypto.subtle.digest("SHA-1", texto(s))).slice(0, 16);
}
// Lo justo de data/sitio.json para saber qué cambió en el siguiente guardado
async function resumenSitio(d) {
  d = d && typeof d === "object" ? d : {};
  const r = { n: {}, a: null, k: {} };
  for (const [k, v] of Object.entries(d)) if (k !== "noticias" && k !== "aviso") r.k[k] = await huellaCorta(JSON.stringify(v));
  for (const n of Array.isArray(d.noticias) ? d.noticias : []) {
    if (n && n.id) r.n[n.id] = { t: String(n.titulo || "Sin título").slice(0, 200), c: CLASE_NOTICIA(n), h: await huellaCorta(JSON.stringify(n)) };
  }
  const a = d.aviso || {};
  r.a = { on: !!a.activo, t: String(a.titulo || a.texto || "").slice(0, 200), h: await huellaCorta(JSON.stringify([a.nivel, a.titulo, a.texto, a.desde, a.hasta])) };
  return r;
}
function cambiosSitio(antes, d, despues) {
  const ev = [];
  for (const n of Array.isArray(d.noticias) ? d.noticias : []) {
    if (!n || !n.id) continue;
    const p = antes.n[n.id], ahora = despues.n[n.id];
    const datos = { id: n.id, fecha: n.fecha || "", cat: n.tipo || "", clase: ahora.c, autor: n.autor || "", publicar: n.publicar || "" };
    if (!p) ev.push({ tipo: "Publicación", detalle: `${ahora.c}: ${ahora.t}`, datos });
    else if (p.h !== ahora.h) ev.push({ tipo: "Publicación editada", detalle: `${ahora.c}: ${ahora.t}`, datos });
  }
  for (const [id, p] of Object.entries(antes.n)) if (!despues.n[id]) ev.push({ tipo: "Publicación borrada", detalle: `${p.c}: ${p.t}`, datos: { id } });
  const a0 = antes.a || {}, a1 = despues.a;
  if (!a0.on && a1.on) ev.push({ tipo: "Aviso urgente publicado", detalle: a1.t });
  else if (a0.on && !a1.on) ev.push({ tipo: "Aviso urgente apagado", detalle: a0.t });
  else if (a1.on && a0.h !== a1.h) ev.push({ tipo: "Aviso urgente editado", detalle: a1.t });
  const secciones = [...new Set([...Object.keys(antes.k), ...Object.keys(despues.k)])].filter((k) => antes.k[k] !== despues.k[k]);
  if (secciones.length) ev.push({ tipo: "Contenido", detalle: "Cambios en: " + secciones.map((k) => NOMBRES_SECCION[k] || SECCIONES_EXTRA[k] || k).join(", ") });
  return ev;
}
// Quién hizo el cambio, sin mostrar usuarios de GitHub: las cuentas con correo y las apps van entre paréntesis en el mensaje
function quienHizo(c, roles) {
  const msg = c.commit.message.split("\n")[0];
  const a = c.commit.author || {};
  if (a.email === FIRMA.email) {
    const m = / \(([^()]{1,80})\)$/.exec(msg);
    if (m) return m[1] === "Inspectoría" ? "Inspectoría (app)" : m[1];
    return / app UTP$/.test(msg) ? "Noticias UTP (app)" : "App del colegio";
  }
  if (/anthropic\.com$/i.test(a.email || "") || a.name === "Claude") return "Claude (mejoras)";
  const login = String((c.author && c.author.login) || "").toLowerCase();
  const u = login && (roles.usuarios || []).find((x) => String(x.github || "").toLowerCase() === login && x.nombre);
  return u ? u.nombre : "Encargado web";
}
const lista = (xs) => xs.slice(0, 5).join(", ") + (xs.length > 5 ? ` y ${xs.length - 5} más` : "");
const ES_CODIGO = /\.(html?|css|js|mjs|json|webmanifest|ya?ml|xml|gs|md|txt)$|^(CNAME|\.nojekyll)$/i;

// Procesa los cambios nuevos del repositorio, de a poco (máximo «presupuesto» consultas a GitHub)
async function registrarCambios(db, env, presupuesto = 14) {
  const cab = env.GITHUB_TOKEN ? cabGitHub(env) : { Accept: "application/vnd.github+json", "User-Agent": "avisos-colegio", "X-GitHub-Api-Version": "2022-11-28" };
  const pedir = async (ruta, accept) => {
    presupuesto--;
    const r = await fetch(API_REPO + ruta, { headers: accept ? { ...cab, Accept: accept } : cab });
    if (!r.ok && r.status !== 404) throw new Error("GitHub respondió " + r.status);
    return r;
  };
  const sitioEn = async (sha) => {
    const r = await pedir(`/contents/${DATOS}?ref=${sha}`, "application/vnd.github.raw");
    if (!r.ok) return {};
    try { return JSON.parse(await r.text()); } catch (e) { return null; }
  };
  let viejo = await db.prepare("SELECT v FROM estado WHERE k = 'kpi'").first();
  let est = viejo ? JSON.parse(viejo.v) : null;
  const guardar = async (nuevo, filas) => {
    const sentencias = filas.map((f) => db.prepare("INSERT OR IGNORE INTO registro_kpi (sha, n, t, quien, tipo, detalle, datos) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(f.sha, f.n, f.t, f.quien, f.tipo, String(f.detalle || "").slice(0, 400), f.datos ? JSON.stringify(f.datos) : null));
    // Si otra revisión se adelantó, no se guarda nada (así no se repite ningún cambio)
    sentencias.push(viejo ? db.prepare("UPDATE estado SET v = ? WHERE k = 'kpi' AND v = ?").bind(JSON.stringify(nuevo), viejo.v)
      : db.prepare("INSERT OR IGNORE INTO estado (k, v) VALUES ('kpi', ?)").bind(JSON.stringify(nuevo)));
    const res = await db.batch(sentencias);
    if (!res[res.length - 1].meta.changes) return false;
    viejo = { v: JSON.stringify(nuevo) };
    return true;
  };
  try {
    if (!est) {
      // Primera vez: se parte del sitio como estaba al inicio del registro y se suman las acciones del panel ya anotadas
      const previos = await (await pedir(`/commits?sha=main&per_page=1&until=${INICIO_KPI}`)).json();
      const base = Array.isArray(previos) && previos[0] ? previos[0].sha : (await (await pedir("/commits/main")).json()).sha;
      const panel = (await db.prepare("SELECT id, t, nombre, accion FROM registro_panel WHERE t >= ? ORDER BY id").bind(INICIO_KPI).all()).results
        .map((r) => accionPanel(r.accion) && { sha: "panel-" + r.id, n: 0, t: r.t, quien: quienPanel(r.nombre), ...accionPanel(r.accion) }).filter(Boolean);
      est = { sha: base, r: await resumenSitio((await sitioEn(base)) || {}), t: INICIO_KPI };
      if (!(await guardar(est, panel))) return;
    }
    const ref = await pedir("/git/ref/heads/main");
    const head = ref.ok && (await ref.json()).object.sha;
    if (!head || head === est.sha) {
      if (est.error) await guardar({ ...est, error: undefined }, []);
      return;
    }
    const cmp = await pedir(`/compare/${est.sha}...${head}?per_page=10&page=1`);
    if (!cmp.ok) {
      // El cambio de partida ya no está en el historial: se sigue desde el sitio actual
      await guardar({ sha: head, r: await resumenSitio((await sitioEn(head)) || {}), t: new Date().toISOString(), error: "Se reinició el registro desde " + new Date().toISOString().slice(0, 10) }, []);
      return;
    }
    const commits = (await cmp.json()).commits || [];
    const roles = await fetch(SITIO + "data/roles.json?t=" + Date.now(), { cf: { cacheTtl: 0 } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    presupuesto--;
    let sitios = 0;
    for (const c of commits) {
      const msg = c.commit.message.split("\n")[0];
      const a = c.commit.author || {};
      const t = a.date || c.commit.committer.date;
      const quien = quienHizo(c, roles);
      let ev = [];
      let r = est.r;
      if (/\[bot\]/.test(a.name || "") || (c.author && c.author.type === "Bot")) {
        // Páginas que el sitio arma solo: no son un cambio de nadie
      } else if (/^Subir (.+?) desde (el panel|la app UTP)/.test(msg)) {
        ev = [{ tipo: "Archivo subido", detalle: /^Subir (.+?) desde/.exec(msg)[1], datos: { n: 1 } }];
      } else {
        // Hace falta ver qué archivos cambió (y, si cambió el contenido, compararlo con el anterior)
        if (presupuesto < 3) break;
        const det = await pedir(`/commits/${c.sha}`);
        const archivos = det.ok ? (await det.json()).files || [] : [];
        if (archivos.some((f) => f.filename === DATOS)) {
          if (sitios >= 2 || presupuesto < 2) break;
          sitios++;
          const d = await sitioEn(c.sha);
          if (d) {
            r = await resumenSitio(d);
            const cambios = cambiosSitio(est.r, d, r);
            ev.push(...(cambios.length ? cambios : [{ tipo: "Contenido", detalle: "Guardó el contenido (sin cambios visibles)" }]));
          } else ev.push({ tipo: "Contenido", detalle: msg });
        }
        if (archivos.some((f) => f.filename === "data/roles.json")) ev.push({ tipo: "Usuarios y permisos", detalle: msg });
        const resto = archivos.filter((f) => f.filename !== DATOS && f.filename !== "data/roles.json" && !/^noticia\//.test(f.filename));
        const codigo = resto.filter((f) => ES_CODIGO.test(f.filename));
        if (codigo.length) ev.push({ tipo: quien === "Claude (mejoras)" ? "Mejora del sitio" : "Código del sitio", detalle: msg, datos: { archivos: codigo.slice(0, 20).map((f) => f.filename) } });
        const otros = resto.filter((f) => !ES_CODIGO.test(f.filename));
        const nombre = (f) => f.filename.split("/").pop();
        const subidos = otros.filter((f) => f.status === "added"), borrados = otros.filter((f) => f.status === "removed");
        const cambiados = otros.filter((f) => f.status !== "added" && f.status !== "removed");
        if (subidos.length) ev.push({ tipo: "Archivo subido", detalle: lista(subidos.map(nombre)), datos: { n: subidos.length } });
        if (borrados.length) ev.push({ tipo: "Archivo borrado", detalle: lista(borrados.map(nombre)), datos: { n: borrados.length } });
        if (cambiados.length) ev.push({ tipo: "Contenido", detalle: "Archivos reemplazados: " + lista(cambiados.map(nombre)) });
        if (!ev.length && archivos.length) ev.push({ tipo: "Otros", detalle: msg });
      }
      const filas = ev.map((e, n) => ({ sha: c.sha, n, t, quien, ...e }));
      if (!(await guardar({ sha: c.sha, r, t }, filas))) return;
      est = { sha: c.sha, r, t };
    }
  } catch (e) {
    if (est) await guardar({ ...est, error: String(e.message || e).slice(0, 200) }, []).catch(() => {});
  }
}
// Para /estado: hasta qué cambio está al día el registro (sin detalles)
async function estadoKpi(db) {
  const e = await leerEstado(db, "kpi");
  if (!e) return "empieza en el próximo minuto";
  const n = await db.prepare("SELECT COUNT(*) AS n FROM registro_kpi").first();
  return { alDiaHasta: e.t, cambiosAnotados: n.n, ...(e.error ? { error: e.error } : {}) };
}
const quienPanel = (nombre) => (!nombre || nombre === "Dueño del panel" ? "Encargado web" : nombre);
// Acciones del panel que no cambian el sitio (cuentas y mensajes de contacto)
function accionPanel(accion) {
  if (/^(Dio acceso|Quitó el acceso|Envió las instrucciones)/.test(accion)) return { tipo: "Usuarios y permisos", detalle: accion };
  if (/^(Asignó el mensaje|Marcó como atendido|Volvió a dejar pendiente)/.test(accion)) return { tipo: "Mensajes de contacto", detalle: accion };
  return null;
}
async function registroKpi(db, env, desde) {
  // Antes de entregarlo, se pone al día con lo último
  await registrarCambios(db, env, 30).catch(() => {});
  desde = /^\d{4}-\d\d-\d\d$/.test(desde || "") ? desde : INICIO_KPI.slice(0, 10);
  const [cambios, visitas, paginas, est] = await Promise.all([
    db.prepare("SELECT sha, t, quien, tipo, detalle, datos FROM registro_kpi WHERE t >= ? ORDER BY t, sha, n LIMIT 20000").bind(desde).all().then((r) => r.results),
    db.prepare("SELECT dia, SUM(n) AS n, SUM(CASE WHEN movil = 1 THEN n ELSE 0 END) AS movil FROM visitas WHERE dia >= ? GROUP BY dia ORDER BY dia").bind(desde).all().then((r) => r.results),
    db.prepare("SELECT pagina, SUM(n) AS n FROM visitas WHERE pagina LIKE '/noticia/%' GROUP BY pagina").all().then((r) => r.results),
    leerEstado(db, "kpi"),
  ]);
  return { desde, cambios: cambios.map((c) => ({ ...c, datos: c.datos ? JSON.parse(c.datos) : null })), visitas, paginas, alDia: est ? est.t : null, error: est && est.error || null };
}

/* ---------- Formulario de Contacto ---------- */
const MOTIVOS = ["Consulta", "Admisión 2027", "Reclamo", "Felicitación"];
async function contacto(db, env, ip, d) {
  if (d.web) return { ok: true }; // campo trampa: solo lo llenan los robots
  const nombre = String(d.nombre || "").trim().slice(0, 120);
  const email = String(d.email || "").trim().slice(0, 160);
  const motivo = MOTIVOS.includes(d.motivo) ? d.motivo : "Consulta";
  const mensaje = String(d.mensaje || "").trim().slice(0, 4000);
  if (nombre.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || mensaje.length < 10) return { error: "Revisa los datos del formulario.", estado: 400 };
  // Máximo 5 mensajes por hora desde una misma conexión y 200 al día en total
  const ahora = Date.now();
  await db.prepare("DELETE FROM envios_contacto WHERE t < ?").bind(ahora - 864e5).run();
  const [mios, todos] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS n FROM envios_contacto WHERE ip = ? AND t > ?").bind(ip, ahora - 3600e3).first(),
    db.prepare("SELECT COUNT(*) AS n FROM envios_contacto").first(),
  ]);
  if (mios.n >= 5 || todos.n >= 200) return { error: "Se enviaron demasiados mensajes. Inténtalo más tarde o llámanos por teléfono.", estado: 429 };
  await db.prepare("INSERT INTO envios_contacto (ip, t) VALUES (?, ?)").bind(ip, ahora).run();
  const fila = await db.prepare("INSERT INTO mensajes (fecha, nombre, email, motivo, mensaje) VALUES (?, ?, ?, ?, ?) RETURNING id")
    .bind(new Date().toISOString(), nombre, email, motivo, mensaje).first();
  // Reenvío al correo del colegio con el script de Google (si está configurado)
  if (env.CORREO_URL && env.CORREO_CLAVE) {
    try {
      const r = await fetch(env.CORREO_URL, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clave: env.CORREO_CLAVE, nombre, email, motivo, mensaje, fecha: new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" }) }) });
      if (r.ok && /ok/i.test(await r.text())) await db.prepare("UPDATE mensajes SET enviado = 1 WHERE id = ?").bind(fila.id).run();
    } catch (e) { /* queda guardado en el panel */ }
  }
  return { ok: true };
}

// Solo quienes administran el panel (dueño o administrador trabajador) leen los mensajes.
// Se revisa su token de GitHub contra GitHub; el servidor no lo guarda.
async function puedeLeerMensajes(req) {
  const token = (/^Bearer\s+(\S{20,200})$/.exec(req.headers.get("Authorization") || "") || [])[1];
  if (!token) return false;
  const h = { Authorization: "Bearer " + token, Accept: "application/vnd.github+json", "User-Agent": "avisos-colegio", "X-GitHub-Api-Version": "2022-11-28" };
  const [yo, repo] = await Promise.all([fetch("https://api.github.com/user", { headers: h }), fetch(`https://api.github.com/repos/${REPO}`, { headers: h })]);
  if (!yo.ok || !repo.ok) return false;
  if (((await repo.json()).permissions || {}).push) return true;
  const login = String((await yo.json()).login || "").toLowerCase();
  const roles = await fetch(SITIO + "data/roles.json?t=" + Date.now(), { cf: { cacheTtl: 0 } }).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return (roles.usuarios || []).some((u) => String(u.github || "").toLowerCase() === login && u.rol === "trabajador");
}

// Mensajes de contacto. «todos»: quien los administra (ve todos, los asigna, marca leídos y borra).
// Si no, la cuenta «f» ve solo los mensajes asignados a ella y los marca como atendidos.
async function rutaMensajes(db, env, req, url, f, todos) {
  const d = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const id = +d.id || 0;
  if (req.method === "GET" && url.pathname === "/mensajes") {
    const lista = todos ? (await db.prepare("SELECT * FROM mensajes ORDER BY id DESC LIMIT 300").all()).results
      : (await db.prepare("SELECT m.*, a.atendido AS miAtendido FROM mensajes m JOIN asignaciones a ON a.mensaje = m.id WHERE a.correo = ? ORDER BY m.id DESC LIMIT 300").bind(f.correo).all()).results;
    const asig = lista.length ? (await db.prepare(`SELECT a.mensaje, a.correo, a.t, a.atendido, fu.nombre, fu.cargo FROM asignaciones a LEFT JOIN funcionarios fu ON fu.correo = a.correo
      WHERE a.mensaje IN (${lista.map(() => "?").join(",")})`).bind(...lista.map((m) => m.id)).all()).results : [];
    const mensajes = lista.map((m) => ({ ...m, asignados: asig.filter((a) => a.mensaje === m.id).map((a) => ({ correo: a.correo, nombre: a.nombre || a.correo, cargo: a.cargo || "", t: a.t, atendido: a.atendido })) }));
    const cuentas = todos ? (await db.prepare("SELECT correo, nombre, cargo FROM funcionarios ORDER BY cargo, nombre").all()).results : undefined;
    return { mensajes, todos, cuentas, correo: !!(env.CORREO_URL && env.CORREO_CLAVE) };
  }
  if (req.method !== "POST") return { error: "No encontrado", estado: 404 };
  if (url.pathname === "/mensajes/atendido") {
    if (!f) return { error: "Para marcarlo como atendido, entra con tu correo del colegio.", estado: 403 };
    const r = await db.prepare("UPDATE asignaciones SET atendido = ? WHERE mensaje = ? AND correo = ?").bind(d.atendido === false ? null : new Date().toISOString(), id, f.correo).run();
    if (!(r.meta && r.meta.changes)) return { error: "Ese mensaje no está asignado a ti.", estado: 404 };
    const m = await db.prepare("SELECT nombre FROM mensajes WHERE id = ?").bind(id).first();
    await anotar(db, f, (d.atendido === false ? "Volvió a dejar pendiente" : "Marcó como atendido") + " el mensaje de " + (m ? m.nombre : "contacto"));
    return { ok: true };
  }
  if (!todos) return { error: "Solo quien administra los mensajes puede hacer esto.", estado: 403 };
  if (url.pathname === "/mensajes/leido") await db.prepare("UPDATE mensajes SET leido = ? WHERE id = ?").bind(d.leido === false ? 0 : 1, id).run();
  else if (url.pathname === "/mensajes/borrar") await db.batch([db.prepare("DELETE FROM mensajes WHERE id = ?").bind(id), db.prepare("DELETE FROM asignaciones WHERE mensaje = ?").bind(id)]);
  else if (url.pathname === "/mensajes/asignar") return asignarMensaje(db, env, f, id, d);
  else return { error: "No encontrado", estado: 404 };
  return { ok: true };
}
// Deja el mensaje asignado exactamente a «correos» y (si se pide) se lo reenvía al correo a quienes recién se suman
async function asignarMensaje(db, env, f, id, d) {
  const m = await db.prepare("SELECT * FROM mensajes WHERE id = ?").bind(id).first();
  if (!m) return { error: "Ese mensaje ya no existe.", estado: 404 };
  const pedidos = [...new Set((Array.isArray(d.correos) ? d.correos : []).map(normalizarCorreo).filter(Boolean))].slice(0, 40);
  const cuentas = pedidos.length ? (await db.prepare(`SELECT correo, nombre FROM funcionarios WHERE correo IN (${pedidos.map(() => "?").join(",")})`).bind(...pedidos).all()).results : [];
  const antes = (await db.prepare("SELECT correo FROM asignaciones WHERE mensaje = ?").bind(id).all()).results.map((a) => a.correo);
  const nuevos = cuentas.filter((c) => !antes.includes(c.correo));
  const ahora = new Date().toISOString();
  await db.batch([
    db.prepare(`DELETE FROM asignaciones WHERE mensaje = ? AND correo NOT IN (${["''", ...cuentas.map(() => "?")].join(",")})`).bind(id, ...cuentas.map((c) => c.correo)),
    ...nuevos.map((c) => db.prepare("INSERT OR IGNORE INTO asignaciones (mensaje, correo, t) VALUES (?, ?, ?)").bind(id, c.correo, ahora)),
    db.prepare("UPDATE mensajes SET leido = 1 WHERE id = ?").bind(id),
  ]);
  if (f) await anotar(db, f, `Asignó el mensaje de ${m.nombre} a ${cuentas.map((c) => c.nombre || c.correo).join(", ") || "nadie"}`);
  let reenviados = 0;
  if (d.reenviar !== false && nuevos.length && env.CORREO_URL && env.CORREO_CLAVE) {
    const fecha = new Date(m.fecha).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "medium", timeStyle: "short" });
    for (const c of nuevos) {
      const cuerpo = `Hola${c.nombre ? " " + c.nombre.split(" ")[0] : ""}:\n\n` +
        `${f && f.nombre ? f.nombre + " te asignó" : "Se te asignó"} este mensaje, que llegó por el formulario de Contacto de colegiosm.cl.\n\n` +
        `De: ${m.nombre} <${m.email}>\nMotivo: ${m.motivo}\nFecha: ${fecha}\n\n${m.mensaje}\n\n` +
        `Para responder, usa «Responder»: la respuesta le llega directo a ${m.nombre}.\n` +
        `También lo ves en el Panel SM (colegiosm.cl/admin) → «Mensajes de contacto». Cuando lo atiendas, márcalo ahí como atendido.\n\n` +
        "Colegio San Martín · colegiosm.cl";
      if (await llamarCorreo(db, env, { tipo: "mensaje", para: c.correo, asunto: `Mensaje de contacto para ti: ${m.motivo} — ${m.nombre}`, cuerpo, responder: m.email })) reenviados++;
    }
  }
  return { ok: true, asignados: cuentas.length, reenviados, sinCorreo: d.reenviar !== false && nuevos.length > reenviados };
}

function respuesta(datos, origen, estado = 200) {
  const h = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origen) { h["Access-Control-Allow-Origin"] = origen; h["Vary"] = "Origin"; }
  return new Response(JSON.stringify(datos), { status: estado, headers: h });
}

/* ---------- «Mi curso»: calendario de cada curso, solo para su comunidad ----------
   - Apoderados y estudiantes entran con el RUT o el correo institucional del estudiante: se les
     envía un código de 6 dígitos a ese correo institucional y quedan dentro en ese celular.
   - Profesores: la primera vez (o si olvidan su contraseña) reciben un código en su correo
     institucional y crean su contraseña. Agregan, editan y borran fechas de sus cursos.
   - Las listas de estudiantes y profesores las sube el panel (Excel) y quedan solo aquí, en la
     base de datos del servidor: nunca en la página pública. Las fechas de cada curso, igual.
   - «Cierre de año»: el panel manda a qué curso pasa cada estudiante (o si sale de la lista).
   Los correos con el código los envía el script de Google (servidor/correo-contacto.gs). */
const DURACION_FAMILIA = 300 * 864e5;
const DURACION_PROFE = 120 * 864e5;
const VIGENCIA_CODIGO = 15 * 60000;
const TIPOS_FECHA = ["prueba", "trabajo", "salida", "reunion", "actividad", "otro"];

// RUT: solo números y dígito verificador → «12345678-9». null si no es válido.
// Acepta los RUT provisorios (IPE) de estudiantes extranjeros, que parten en 100.000.000.
function normalizarRut(v) {
  const s = String(v || "").toUpperCase().replace(/[^0-9K]/g, "");
  if (s.length < 2 || s.length > 10) return null;
  const cuerpo = s.slice(0, -1), dv = s.slice(-1);
  if (!/^\d+$/.test(cuerpo)) return null;
  let suma = 0, mult = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) { suma += +cuerpo[i] * mult; mult = mult === 7 ? 2 : mult + 1; }
  const r = 11 - (suma % 11);
  const esperado = r === 11 ? "0" : r === 10 ? "K" : String(r);
  return dv === esperado ? `${+cuerpo}-${dv}` : null;
}
const normalizarCorreo = (v) => { const c = String(v || "").trim().toLowerCase(); return /^[^\s@]{1,64}@[a-z0-9.-]+\.[a-z]{2,}$/.test(c) && c.length <= 120 ? c : null; };
const ocultarCorreo = (c) => { const [u, d] = c.split("@"); return (u.length <= 2 ? u[0] + "*" : u.slice(0, 2) + "*".repeat(Math.min(u.length - 2, 6))) + "@" + d; };

// Llave propia para firmar las sesiones (se crea sola la primera vez; no necesita secretos)
async function llaveCurso(db, uso = "curso") {
  let k = await leerEstado(db, "llave_curso");
  if (!k) {
    await db.prepare("INSERT OR IGNORE INTO estado (k, v) VALUES ('llave_curso', ?)").bind(JSON.stringify(b64url(crypto.getRandomValues(new Uint8Array(32))))).run();
    k = await leerEstado(db, "llave_curso");
  }
  return crypto.subtle.importKey("raw", texto(uso + "|" + k), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sesionCurso(db, datos, duracion) {
  const p = b64url(texto(JSON.stringify({ ...datos, e: Date.now() + duracion })));
  return p + "." + b64url(await crypto.subtle.sign("HMAC", await llaveCurso(db), texto(p)));
}
// Quién es la sesión: { rol: "familia", estudiante } o { rol: "profe", profe }. null si venció o ya no está en las listas.
async function quienCurso(db, sesion) {
  const m = /^([A-Za-z0-9_-]{10,400})\.([A-Za-z0-9_-]{20,})$/.exec(String(sesion || ""));
  if (!m || !(await crypto.subtle.verify("HMAC", await llaveCurso(db), deB64url(m[2]), texto(m[1])))) return null;
  let d; try { d = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { return null; }
  if (!d || d.e < Date.now()) return null;
  if (d.r === "f") {
    const est = await db.prepare("SELECT rut, nombre, curso FROM estudiantes WHERE rut = ?").bind(d.id).first();
    return est ? { rol: "familia", estudiante: est } : null;
  }
  // Apoderado: entra con su propio correo y ve a todos los estudiantes que registró (uno o más)
  if (d.r === "a") {
    const hijos = (await db.prepare("SELECT e.rut, e.nombre, e.curso FROM apoderados a JOIN estudiantes e ON e.rut = a.rut WHERE a.correo = ? ORDER BY e.nombre").bind(d.id).all()).results;
    return hijos.length ? { rol: "familia", apoderado: d.id, hijos, estudiante: hijos[0] } : null;
  }
  if (d.r === "p") {
    const p = await db.prepare("SELECT correo, nombre, cursos, version, hash FROM profesores WHERE correo = ?").bind(d.id).first();
    return p && p.version === d.v ? { rol: "profe", profe: { correo: p.correo, nombre: p.nombre, cursos: JSON.parse(p.cursos || "[]"), conClave: !!p.hash } } : null;
  }
  return null;
}

// Límite de envíos: cada correo, 1 código por minuto y 6 por hora; cada conexión, 15 por hora
async function puedeEnviarCodigo(db, ip, correo) {
  const hora = Date.now() - 3600e3;
  await db.prepare("DELETE FROM envios_codigo WHERE t < ?").bind(hora).run();
  const porIp = await db.prepare("SELECT COUNT(*) AS n FROM envios_codigo WHERE ip = ?").bind(ip).first();
  const porCorreo = await db.prepare("SELECT COUNT(*) AS n, MAX(t) AS ult FROM envios_codigo WHERE correo = ?").bind(correo).first();
  if (porIp.n >= 15 || porCorreo.n >= 6) return "Se enviaron muchos códigos. Espera una hora e inténtalo de nuevo.";
  if (porCorreo.ult && Date.now() - porCorreo.ult < 60e3) return "Ya enviamos un código hace menos de un minuto. Revisa el correo (también la carpeta de spam).";
  return "";
}

// Busca a quién corresponde lo escrito: familia (RUT o correo del estudiante) o profesor (correo)
async function buscarCuenta(db, quien, id) {
  if (quien === "profe") {
    const correo = normalizarCorreo(id);
    const p = correo && await db.prepare("SELECT correo, nombre FROM profesores WHERE correo = ?").bind(correo).first();
    return p ? { correo: p.correo, nombre: p.nombre, id: p.correo } : null;
  }
  const rut = /@/.test(id) ? null : normalizarRut(id);
  const correo = rut ? null : normalizarCorreo(id);
  const est = rut ? await db.prepare("SELECT rut, nombre, correo FROM estudiantes WHERE rut = ?").bind(rut).first()
    : correo ? await db.prepare("SELECT rut, nombre, correo FROM estudiantes WHERE correo = ?").bind(correo).first() : null;
  return est && est.correo ? { correo: est.correo, nombre: est.nombre, id: est.rut } : null;
}

// Pide al script de Google (servidor/correo-contacto.gs) que envíe un correo. Si falla, la causa queda en /estado.
async function llamarCorreo(db, env, datos) {
  const r = await fetch(env.CORREO_URL, { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clave: env.CORREO_CLAVE, ...datos }) }).catch((e) => ({ ok: false, status: 0, text: async () => String(e && e.message || e) }));
  const resp = await r.text().catch(() => "");
  if (r.ok && /^\s*ok\s*$/i.test(resp)) {
    await db.prepare("INSERT INTO estado (k, v) VALUES ('correo', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({ ok: true, fecha: new Date().toISOString() })).run();
    return true;
  }
  // Queda anotado para verlo en /estado: «no» = la clave o el dominio no coinciden con el script
  await db.prepare("INSERT INTO estado (k, v) VALUES ('correo', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({
    ok: false, fecha: new Date().toISOString(), estado: r.status,
    respuesta: resp.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
    causa: /^\s*no\s*$/i.test(resp) ? "El script respondió «no»: CORREO_CLAVE no es igual a la CLAVE del script, o el script publicado es una versión antigua (Implementar → Gestionar implementaciones → Nueva versión)."
      : r.status === 401 || r.status === 403 || /iniciar sesi|sign in|accounts\.google/i.test(resp) ? "Google pidió iniciar sesión: el acceso de la implementación debe ser «Cualquier usuario»."
      : !r.ok ? "La dirección CORREO_URL no respondió bien: revisa que sea la URL de la aplicación web y termine en /exec."
      : "El script respondió algo inesperado.",
  })).run();
  return false;
}

// Envía un código de 6 dígitos al correo con el script de Google y lo guarda (solo su huella) por 15 minutos.
// «llave» separa los códigos de «Mi curso» de los del panel.
async function mandarCodigo(db, env, ip, correo, nombre, quien, llave) {
  const espera = await puedeEnviarCodigo(db, ip, correo);
  if (espera) return { error: espera, estado: 429 };
  const codigo = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const hash = hexDe(await crypto.subtle.digest("SHA-256", texto(llave + "|" + codigo)));
  if (!(await llamarCorreo(db, env, { tipo: "codigo", para: correo, codigo, nombre, quien }))) {
    return { error: "No se pudo enviar el correo con el código. Inténtalo de nuevo en unos minutos.", estado: 502 };
  }
  await db.batch([
    db.prepare("INSERT INTO codigos (correo, hash, vence, intentos) VALUES (?1, ?2, ?3, 0) ON CONFLICT(correo) DO UPDATE SET hash = ?2, vence = ?3, intentos = 0").bind(llave, hash, Date.now() + VIGENCIA_CODIGO),
    db.prepare("INSERT INTO envios_codigo (ip, correo, t) VALUES (?, ?, ?)").bind(ip, correo, Date.now()),
  ]);
  return { ok: true, correo: ocultarCorreo(correo) };
}
// Revisa el código escrito: true si es correcto (y lo borra), o el error. 5 intentos y hay que pedir otro.
async function comprobarCodigo(db, llave, codigo) {
  codigo = String(codigo || "").replace(/\D/g, "");
  const reg = await db.prepare("SELECT hash, vence, intentos FROM codigos WHERE correo = ?").bind(llave).first();
  if (!reg || reg.vence < Date.now() || reg.intentos >= 5) return { error: "El código venció. Pide uno nuevo.", estado: 401 };
  const hash = hexDe(await crypto.subtle.digest("SHA-256", texto(llave + "|" + codigo)));
  if (!(await mismaClave(hash, reg.hash))) {
    await db.prepare("UPDATE codigos SET intentos = intentos + 1 WHERE correo = ?").bind(llave).run();
    return { error: reg.intentos >= 4 ? "Código incorrecto. Pide uno nuevo." : "Código incorrecto. Revísalo e inténtalo otra vez.", estado: 401 };
  }
  await db.prepare("DELETE FROM codigos WHERE correo = ?").bind(llave).run();
  return true;
}

async function enviarCodigo(db, env, ip, d) {
  if (!env.CORREO_URL || !env.CORREO_CLAVE) return { error: "El colegio aún no activa el envío de códigos por correo. Inténtalo más adelante.", estado: 503 };
  const quien = d.quien === "profe" ? "profe" : "familia";
  const id = String(d.id || "").trim().slice(0, 120);
  if (quien === "familia" && !/@/.test(id) && !normalizarRut(id)) return { error: "Ese RUT no es válido. Escríbelo con su dígito verificador, por ejemplo 12.345.678-9.", estado: 400 };
  const c = await buscarCuenta(db, quien, id);
  if (!c) return { error: quien === "profe" ? "Ese correo no está en la lista de profesores. Consulta en UTP." : "No encontramos ese RUT o correo en la lista de estudiantes. Revisa que esté bien escrito o consulta en el colegio.", estado: 404 };
  return mandarCodigo(db, env, ip, c.correo, c.nombre, quien, c.correo);
}

async function verificarCodigo(db, d) {
  const quien = d.quien === "profe" ? "profe" : "familia";
  const apoderado = d.quien === "apoderado";
  const c = await buscarCuenta(db, quien, String(d.id || "").trim().slice(0, 120));
  if (!c) return { error: "El código venció. Pide uno nuevo.", estado: 401 };
  const ok = await comprobarCodigo(db, c.correo, d.codigo);
  if (ok !== true) return ok;
  if (apoderado) {
    const est = await db.prepare("SELECT nombre, curso FROM estudiantes WHERE rut = ?").bind(c.id).first();
    return { pase: await pase(db, c.id, "correo"), nombre: est.nombre, curso: est.curso };
  }
  if (quien === "familia") return { sesion: await sesionCurso(db, { r: "f", id: c.id }, DURACION_FAMILIA) };
  const p = await db.prepare("SELECT version FROM profesores WHERE correo = ?").bind(c.correo).first();
  return { sesion: await sesionCurso(db, { r: "p", id: c.correo, v: p.version }, DURACION_PROFE), crearClave: true };
}

async function entrarProfe(db, ip, correo, clave) {
  const ahora = Date.now(), llave = "curso|" + ip;
  const reg = await db.prepare("SELECT fallos, hasta FROM intentos WHERE ip = ?").bind(llave).first();
  if (reg && reg.hasta > ahora) return { error: `Demasiados intentos. Espera ${Math.ceil((reg.hasta - ahora) / 60000)} minutos e inténtalo de nuevo.`, estado: 429 };
  const p = correo && await db.prepare("SELECT * FROM profesores WHERE correo = ?").bind(correo).first();
  if (p && !p.hash) return { error: "Aún no creas tu contraseña. Toca «Primera vez u olvidé mi contraseña».", estado: 401 };
  const h = await huella(clave, p ? p.sal : "sin-cuenta");
  if (p && clave && await mismaClave(h, p.hash)) {
    await db.prepare("DELETE FROM intentos WHERE ip = ?").bind(llave).run();
    return { sesion: await sesionCurso(db, { r: "p", id: p.correo, v: p.version }, DURACION_PROFE) };
  }
  const fallos = (reg ? reg.fallos : 0) + 1;
  const hasta = fallos >= 5 ? ahora + Math.min(15 * 60000 * 2 ** (fallos - 5), 864e5) : 0;
  await db.prepare("INSERT INTO intentos (ip, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(ip) DO UPDATE SET fallos = ?2, hasta = ?3").bind(llave, fallos, hasta).run();
  return { error: fallos >= 5 ? "Correo o contraseña incorrectos. Por seguridad, espera 15 minutos antes de volver a intentar." : "Correo o contraseña incorrectos.", estado: 401 };
}

// Revisa una fecha que envía un profesor
function limpiarFecha(f, cursos) {
  const fecha = String(f.fecha || "");
  const fin = String(f.fin || "");
  const curso = String(f.curso || "");
  if (!cursos.includes(curso)) return { error: "No tienes ese curso asignado." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Elige la fecha." };
  const titulo = String(f.titulo || "").trim().slice(0, 120);
  if (!titulo) return { error: "Escribe un título, por ejemplo «Prueba de Matemática»." };
  const todo = JSON.stringify(f);
  if (PARECE_TOKEN.test(todo)) return { error: "El texto parece incluir una clave. No se guardó." };
  return { curso, fecha, fin: /^\d{4}-\d{2}-\d{2}$/.test(fin) && fin > fecha ? fin : "", hora: String(f.hora || "").trim().slice(0, 30), titulo,
    tipo: TIPOS_FECHA.includes(f.tipo) ? f.tipo : "otro", descripcion: String(f.descripcion || "").trim().slice(0, 800) };
}
const fechasDe = async (db, cursos) => !cursos.length ? [] : (await db.prepare(
  `SELECT id, curso, fecha, fin, hora, titulo, tipo, descripcion, autor FROM fechas_curso WHERE curso IN (${cursos.map(() => "?").join(",")}) AND COALESCE(NULLIF(fin, ''), fecha) >= ? ORDER BY fecha, hora LIMIT 500`)
  .bind(...cursos, new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10)).all()).results;

/* ---------- Apoderados ----------
   El apoderado registra su propio correo (por ejemplo Gmail), uno por estudiante. Para registrarlo primero demuestra que
   es del estudiante: con un código que llega al correo institucional del estudiante, o con un código del colegio que UTP
   o Inspectoría genera en el panel y le entrega en persona. Eso da un «pase» de 30 minutos. Después confirma su propio
   correo con otro código y queda registrado. Con más hijos, agrega cada uno de la misma forma. */
const DURACION_PASE = 30 * 60000;
const VIGENCIA_CODIGO_COLEGIO = 30 * 864e5;
const LETRAS_CODIGO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const huellaColegio = async (codigo) => hexDe(await crypto.subtle.digest("SHA-256", texto("colegio|" + String(codigo || "").toUpperCase().replace(/[^A-Z0-9]/g, ""))));
const pase = (db, rut, via) => sesionCurso(db, { r: "t", id: rut, via }, DURACION_PASE);
async function leerPase(db, valor) {
  const m = /^([A-Za-z0-9_-]{10,400})\.([A-Za-z0-9_-]{20,})$/.exec(String(valor || ""));
  if (!m || !(await crypto.subtle.verify("HMAC", await llaveCurso(db), deB64url(m[2]), texto(m[1])))) return null;
  let d; try { d = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { return null; }
  if (!d || d.r !== "t" || d.e < Date.now()) return null;
  const est = await db.prepare("SELECT rut, nombre, curso FROM estudiantes WHERE rut = ?").bind(d.id).first();
  return est ? { ...est, via: d.via } : null;
}
// Une el estudiante al correo del apoderado (si ya tenía otro, se reemplaza: uno por estudiante)
async function unirApoderado(db, p, correo) {
  if (p.via === "colegio") {
    const r = await db.prepare("DELETE FROM codigos_colegio WHERE rut = ?").bind(p.rut).run();
    if (!r.meta.changes) return { error: "Ese código del colegio ya se usó. Pide uno nuevo en el colegio.", estado: 410 };
  }
  await db.prepare("INSERT INTO apoderados (rut, correo, creado, via) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(rut) DO UPDATE SET correo = ?2, creado = ?3, via = ?4")
    .bind(p.rut, correo, new Date().toISOString(), p.via === "colegio" ? "colegio" : "correo").run();
  return null;
}
async function rutaApoderado(db, env, ip, url, d) {
  if (url.pathname === "/curso/colegio") {
    // Código del colegio: 10 intentos fallidos por conexión y se bloquea una hora
    const llave = "colegio|" + ip, ahora = Date.now();
    const reg = await db.prepare("SELECT fallos, hasta FROM intentos WHERE ip = ?").bind(llave).first();
    if (reg && reg.hasta > ahora) return { error: "Demasiados intentos. Espera una hora e inténtalo de nuevo.", estado: 429 };
    const c = await db.prepare("SELECT rut, vence FROM codigos_colegio WHERE hash = ?").bind(await huellaColegio(d.codigo)).first();
    if (!c || c.vence < ahora) {
      const fallos = (reg ? reg.fallos : 0) + 1;
      await db.prepare("INSERT INTO intentos (ip, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(ip) DO UPDATE SET fallos = ?2, hasta = ?3").bind(llave, fallos, fallos >= 10 ? ahora + 3600e3 : 0).run();
      return { error: c ? "Ese código venció. Pide uno nuevo en el colegio." : "Ese código no es válido. Revísalo (son 8 letras y números).", estado: 401 };
    }
    const est = await db.prepare("SELECT nombre, curso FROM estudiantes WHERE rut = ?").bind(c.rut).first();
    if (!est) return { error: "Ese estudiante ya no está en la lista del colegio.", estado: 404 };
    return { pase: await pase(db, c.rut, "colegio"), nombre: est.nombre, curso: est.curso };
  }
  if (url.pathname === "/curso/apoderado/codigo" || url.pathname === "/curso/apoderado/entrar") {
    const correo = normalizarCorreo(d.correo);
    const tiene = correo && await db.prepare("SELECT 1 FROM apoderados WHERE correo = ?").bind(correo).first();
    if (url.pathname === "/curso/apoderado/codigo") {
      if (!env.CORREO_URL || !env.CORREO_CLAVE) return { error: "El colegio aún no activa el envío de códigos por correo. Inténtalo más adelante.", estado: 503 };
      if (!tiene) return { error: "Ese correo aún no está registrado. Toca «Registrarme» y sigue los pasos.", estado: 404 };
      return mandarCodigo(db, env, ip, correo, "", "apoderado", "apo|" + correo);
    }
    if (!tiene) return { error: "El código venció. Pide uno nuevo.", estado: 401 };
    const ok = await comprobarCodigo(db, "apo|" + correo, d.codigo);
    return ok === true ? { sesion: await sesionCurso(db, { r: "a", id: correo }, DURACION_FAMILIA) } : ok;
  }
  if (url.pathname === "/curso/apoderado/agregar") {
    const q = await quienCurso(db, d.sesion);
    if (!q || !q.apoderado) return { error: "La sesión venció. Vuelve a entrar.", estado: 401, salir: true };
    const p = await leerPase(db, d.pase);
    if (!p) return { error: "Pasó demasiado tiempo. Empieza de nuevo.", estado: 401 };
    if (q.hijos.length >= 10) return { error: "Ya tienes muchos estudiantes registrados.", estado: 400 };
    const e = await unirApoderado(db, p, q.apoderado);
    return e || { ok: true, nombre: p.nombre, curso: p.curso };
  }
  // Registro: con el pase, el apoderado confirma su propio correo con un código
  const p = await leerPase(db, d.pase);
  if (!p) return { error: "Pasó demasiado tiempo. Empieza de nuevo.", estado: 401 };
  const correo = normalizarCorreo(d.correo);
  if (!correo) return { error: "Escribe un correo válido, por ejemplo nombre@gmail.com.", estado: 400 };
  if (url.pathname === "/curso/apoderado/correo") {
    if (!env.CORREO_URL || !env.CORREO_CLAVE) return { error: "El colegio aún no activa el envío de códigos por correo. Inténtalo más adelante.", estado: 503 };
    return mandarCodigo(db, env, ip, correo, "", "apoderado", "apo|" + correo);
  }
  if (url.pathname === "/curso/apoderado/registrar") {
    const ok = await comprobarCodigo(db, "apo|" + correo, d.codigo);
    if (ok !== true) return ok;
    const e = await unirApoderado(db, p, correo);
    return e || { sesion: await sesionCurso(db, { r: "a", id: correo }, DURACION_FAMILIA), nombre: p.nombre, curso: p.curso };
  }
  return { error: "No encontrado", estado: 404 };
}

async function rutaCurso(db, env, req, url) {
  const d = await req.json().catch(() => ({}));
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  if (url.pathname === "/curso/codigo") return enviarCodigo(db, env, ip, d);
  if (url.pathname === "/curso/verificar") return verificarCodigo(db, d);
  if (url.pathname === "/curso/entrar") return entrarProfe(db, ip, normalizarCorreo(d.correo), String(d.clave || "").slice(0, 100));
  if (url.pathname === "/curso/colegio" || url.pathname.startsWith("/curso/apoderado/")) return rutaApoderado(db, env, ip, url, d);
  const q = await quienCurso(db, d.sesion);
  if (!q) return { error: "La sesión venció o ya no estás en la lista del colegio. Vuelve a entrar.", estado: 401, salir: true };
  switch (url.pathname) {
    case "/curso/yo":
      return q.apoderado ? { rol: "familia", apoderado: true, correo: q.apoderado, hijos: q.hijos.map((h) => ({ nombre: h.nombre, curso: h.curso })), nombre: q.estudiante.nombre, curso: q.estudiante.curso }
        : q.rol === "familia" ? { rol: "familia", nombre: q.estudiante.nombre, curso: q.estudiante.curso }
        : { rol: "profe", nombre: q.profe.nombre, cursos: q.profe.cursos, conClave: q.profe.conClave };
    case "/curso/fechas":
      return { fechas: await fechasDe(db, q.apoderado ? [...new Set(q.hijos.map((h) => h.curso))] : q.rol === "familia" ? [q.estudiante.curso] : q.profe.cursos), hoy: hoyChile() };
    // El profesor recibe en este celular los avisos de sus pruebas (aprobada, devuelta, impresa)
    case "/curso/notificaciones": {
      if (q.rol !== "profe") return { error: "No permitido.", estado: 403 };
      const ep = String(d.endpoint || "");
      if (!SERVICIOS.test(ep)) return { error: "Suscripción no válida.", estado: 400 };
      if (d.activar === false) {
        await db.prepare("DELETE FROM subs_profes WHERE endpoint = ? AND correo = ?").bind(ep, q.profe.correo).run();
        return { ok: true };
      }
      if (!(await db.prepare("SELECT id FROM subs WHERE endpoint = ?").bind(ep).first())) return { error: "Activa primero las notificaciones de la app en este celular.", estado: 400 };
      await db.prepare("INSERT INTO subs_profes (endpoint, correo, t) VALUES (?1, ?2, ?3) ON CONFLICT(endpoint) DO UPDATE SET correo = ?2, t = ?3")
        .bind(ep, q.profe.correo, new Date().toISOString()).run();
      return { ok: true };
    }
    case "/curso/clave": {
      if (q.rol !== "profe") return { error: "No permitido.", estado: 403 };
      const clave = String(d.clave || "");
      if (clave.length < 8 || clave.length > 100) return { error: "La contraseña debe tener al menos 8 caracteres.", estado: 400 };
      const sal = hexDe(crypto.getRandomValues(new Uint8Array(16)));
      await db.prepare("UPDATE profesores SET sal = ?, hash = ?, version = version + 1 WHERE correo = ?").bind(sal, await huella(clave, sal), q.profe.correo).run();
      const p = await db.prepare("SELECT version FROM profesores WHERE correo = ?").bind(q.profe.correo).first();
      // Cambiar la contraseña cierra las otras sesiones; esta sigue con una nueva
      return { ok: true, sesion: await sesionCurso(db, { r: "p", id: q.profe.correo, v: p.version }, DURACION_PROFE) };
    }
    case "/curso/fecha": {
      if (q.rol !== "profe") return { error: "Solo los profesores agregan fechas.", estado: 403 };
      const f = limpiarFecha(d.fecha || {}, q.profe.cursos);
      if (f.error) return { error: f.error, estado: 400 };
      const id = +((d.fecha || {}).id) || 0;
      if (id) {
        const ant = await db.prepare("SELECT curso FROM fechas_curso WHERE id = ?").bind(id).first();
        if (!ant || !q.profe.cursos.includes(ant.curso)) return { error: "Esa fecha ya no existe o no es de tus cursos.", estado: 404 };
        await db.prepare("UPDATE fechas_curso SET curso = ?, fecha = ?, fin = ?, hora = ?, titulo = ?, tipo = ?, descripcion = ?, autor = ? WHERE id = ?")
          .bind(f.curso, f.fecha, f.fin, f.hora, f.titulo, f.tipo, f.descripcion, q.profe.nombre || q.profe.correo, id).run();
        return { ok: true, id };
      }
      const n = await db.prepare("SELECT COUNT(*) AS n FROM fechas_curso WHERE curso = ?").bind(f.curso).first();
      if (n.n >= 400) return { error: "Ese curso tiene demasiadas fechas guardadas. Borra algunas antiguas.", estado: 400 };
      const r = await db.prepare("INSERT INTO fechas_curso (curso, fecha, fin, hora, titulo, tipo, descripcion, autor, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id")
        .bind(f.curso, f.fecha, f.fin, f.hora, f.titulo, f.tipo, f.descripcion, q.profe.nombre || q.profe.correo, new Date().toISOString()).first();
      return { ok: true, id: r.id };
    }
    case "/curso/fecha/borrar": {
      if (q.rol !== "profe") return { error: "Solo los profesores borran fechas.", estado: 403 };
      const ant = await db.prepare("SELECT curso FROM fechas_curso WHERE id = ?").bind(+d.id || 0).first();
      if (ant && q.profe.cursos.includes(ant.curso)) await db.prepare("DELETE FROM fechas_curso WHERE id = ?").bind(+d.id).run();
      return { ok: true };
    }
  }
  return { error: "No encontrado", estado: 404 };
}

// Panel (dueño o administrador): listas, cierre de año
async function rutaCursoPanel(db, env, req, url) {
  if (url.pathname === "/curso/listas" && req.method === "GET") {
    const est = (await db.prepare(`SELECT e.rut, e.nombre, e.curso, e.correo, a.correo AS apoderado, c.vence AS codigo
      FROM estudiantes e LEFT JOIN apoderados a ON a.rut = e.rut LEFT JOIN codigos_colegio c ON c.rut = e.rut AND c.vence > ? ORDER BY e.curso, e.nombre`).bind(Date.now()).all()).results;
    const pro = (await db.prepare("SELECT correo, nombre, cursos, hash FROM profesores ORDER BY nombre").all()).results
      .map((p) => ({ correo: p.correo, nombre: p.nombre, cursos: JSON.parse(p.cursos || "[]"), activo: !!p.hash }));
    const fechas = (await db.prepare("SELECT curso, COUNT(*) AS n FROM fechas_curso GROUP BY curso").all()).results;
    return { estudiantes: est, profesores: pro, fechas, correo: !!(env.CORREO_URL && env.CORREO_CLAVE) };
  }
  const d = await req.json().catch(() => ({}));
  const cursosValidos = Array.isArray(d.cursos) ? d.cursos.map(String) : [];
  if (url.pathname === "/curso/estudiantes") {
    const lista = Array.isArray(d.lista) ? d.lista : [];
    if (!lista.length || lista.length > 3000) return { error: "La lista está vacía o es demasiado larga.", estado: 400 };
    const filas = [], errores = [], vistos = new Set();
    lista.forEach((e, i) => {
      const rut = normalizarRut(e.rut), correo = normalizarCorreo(e.correo), curso = String(e.curso || "").trim(), nombre = String(e.nombre || "").trim().slice(0, 120);
      if (!rut) errores.push(`Fila ${i + 2}: RUT no válido (${String(e.rut || "vacío").slice(0, 20)})`);
      else if (vistos.has(rut)) errores.push(`Fila ${i + 2}: RUT repetido (${rut})`);
      else if (!correo) errores.push(`Fila ${i + 2}: correo no válido (${String(e.correo || "vacío").slice(0, 60)})`);
      else if (cursosValidos.length && !cursosValidos.includes(curso)) errores.push(`Fila ${i + 2}: curso desconocido «${curso.slice(0, 30)}»`);
      else { vistos.add(rut); filas.push([rut, nombre, curso, correo]); }
    });
    if (errores.length) return { error: "Revisa la lista: " + errores.slice(0, 8).join(" · ") + (errores.length > 8 ? ` · y ${errores.length - 8} más` : ""), estado: 400 };
    // «reemplazar»: la lista nueva es la lista completa. «agregar»: suma o actualiza solo esos estudiantes.
    const agregar = d.modo === "agregar";
    const ops = (agregar ? [] : [db.prepare("DELETE FROM estudiantes")]).concat(filas.map((f) =>
      db.prepare("INSERT INTO estudiantes (rut, nombre, curso, correo) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(rut) DO UPDATE SET nombre = ?2, curso = ?3, correo = ?4").bind(...f)));
    for (let i = 0; i < ops.length; i += 90) await db.batch(ops.slice(i, i + 90));
    const n = await db.prepare("SELECT COUNT(*) AS n FROM estudiantes").first();
    return { ok: true, total: filas.length, estudiantes: n.n };
  }
  if (url.pathname === "/curso/profesores") {
    const lista = Array.isArray(d.lista) ? d.lista : [];
    if (!lista.length || lista.length > 500) return { error: "La lista está vacía o es demasiado larga.", estado: 400 };
    const filas = [], errores = [], vistos = new Set();
    lista.forEach((p, i) => {
      const correo = normalizarCorreo(p.correo);
      const cursos = (Array.isArray(p.cursos) ? p.cursos : []).map((c) => String(c).trim()).filter(Boolean);
      const malos = cursosValidos.length ? cursos.filter((c) => !cursosValidos.includes(c)) : [];
      if (!correo) errores.push(`Fila ${i + 2}: correo no válido (${String(p.correo || "vacío").slice(0, 60)})`);
      else if (vistos.has(correo)) errores.push(`Fila ${i + 2}: correo repetido`);
      else if (malos.length) errores.push(`Fila ${i + 2}: curso desconocido «${malos[0].slice(0, 30)}»`);
      else { vistos.add(correo); filas.push([correo, String(p.nombre || "").trim().slice(0, 120), JSON.stringify([...new Set(cursos)])]); }
    });
    if (errores.length) return { error: "Revisa la lista: " + errores.slice(0, 8).join(" · ") + (errores.length > 8 ? ` · y ${errores.length - 8} más` : ""), estado: 400 };
    // Se conserva la contraseña de quienes siguen; quienes no están en la lista nueva salen
    const ops = [db.prepare(`DELETE FROM profesores WHERE correo NOT IN (${filas.map(() => "?").join(",")})`).bind(...filas.map((f) => f[0]))]
      .concat(filas.map((f) => db.prepare("INSERT INTO profesores (correo, nombre, cursos, version) VALUES (?1, ?2, ?3, 1) ON CONFLICT(correo) DO UPDATE SET nombre = ?2, cursos = ?3").bind(...f)));
    for (let i = 0; i < ops.length; i += 90) await db.batch(ops.slice(i, i + 90));
    return { ok: true, total: filas.length };
  }
  if (url.pathname === "/curso/anio") {
    // cambios: [{ rut, curso }] (curso vacío = sale de la lista: egresa, se retira o no sigue)
    const cambios = Array.isArray(d.cambios) ? d.cambios : [];
    const ops = [];
    for (const c of cambios) {
      const rut = normalizarRut(c.rut);
      if (!rut) continue;
      const curso = String(c.curso || "").trim();
      if (curso && cursosValidos.length && !cursosValidos.includes(curso)) return { error: `Curso desconocido «${curso.slice(0, 30)}».`, estado: 400 };
      ops.push(curso ? db.prepare("UPDATE estudiantes SET curso = ? WHERE rut = ?").bind(curso, rut) : db.prepare("DELETE FROM estudiantes WHERE rut = ?").bind(rut));
    }
    if (d.borrarFechas) ops.push(db.prepare("DELETE FROM fechas_curso"));
    for (let i = 0; i < ops.length; i += 90) await db.batch(ops.slice(i, i + 90));
    const n = await db.prepare("SELECT COUNT(*) AS n FROM estudiantes").first();
    return { ok: true, estudiantes: n.n };
  }
  if (url.pathname === "/curso/calendario") return { fechas: await fechasDe(db, [String(d.curso || "")]), hoy: hoyChile() };
  if (url.pathname === "/curso/estudiante/borrar") {
    const rut = normalizarRut(d.rut);
    if (rut) await db.batch([db.prepare("DELETE FROM estudiantes WHERE rut = ?").bind(rut), db.prepare("DELETE FROM apoderados WHERE rut = ?").bind(rut), db.prepare("DELETE FROM codigos_colegio WHERE rut = ?").bind(rut)]);
    return { ok: true };
  }
  // Código del colegio para el apoderado que no tiene acceso al correo institucional del estudiante.
  // Se muestra una sola vez (aquí solo queda su huella); sirve una vez y vence en 30 días.
  if (url.pathname === "/curso/codigo-apoderado") {
    const rut = normalizarRut(d.rut);
    const est = rut && await db.prepare("SELECT nombre, curso FROM estudiantes WHERE rut = ?").bind(rut).first();
    if (!est) return { error: "Ese estudiante no está en la lista.", estado: 404 };
    const azar = crypto.getRandomValues(new Uint8Array(8));
    const codigo = [...azar].map((x) => LETRAS_CODIGO[x % LETRAS_CODIGO.length]).join("");
    await db.prepare("INSERT INTO codigos_colegio (rut, hash, vence, creado) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(rut) DO UPDATE SET hash = ?2, vence = ?3, creado = ?4")
      .bind(rut, await huellaColegio(codigo), Date.now() + VIGENCIA_CODIGO_COLEGIO, new Date().toISOString()).run();
    return { codigo: codigo.slice(0, 4) + "-" + codigo.slice(4), nombre: est.nombre, curso: est.curso, vence: new Date(Date.now() + VIGENCIA_CODIGO_COLEGIO).toISOString() };
  }
  if (url.pathname === "/curso/apoderado/quitar") {
    const rut = normalizarRut(d.rut);
    if (rut) await db.prepare("DELETE FROM apoderados WHERE rut = ?").bind(rut).run();
    return { ok: true };
  }
  return { error: "No encontrado", estado: 404 };
}

/* ---------- Panel SM con el correo del colegio (sin GitHub) ----------
   Directora, Inspectoría, UTP, Convivencia, sostenedora… entran al panel /admin/ con su correo
   institucional y una contraseña que eligen ellos. La primera vez (o si la olvidan) reciben un
   código en ese correo. Las cuentas y sus permisos los da el dueño en el panel («Usuarios y
   permisos»): viven solo en esta base de datos, nunca en el sitio público.
   Las contraseñas se guardan solo como huella (PBKDF2 con sal propia de cada cuenta): nadie,
   ni quien administra el servidor, puede leerlas.
   El servidor guarda en el sitio con su propio token (GITHUB_TOKEN) y solo lo que cada cuenta puede. */
const DURACION_PANEL = 30 * 864e5;
const DOMINIO_COLEGIO = "colegiosm.cl";
const PERMISOS_PANEL = ["todo", "noticias", "propuestas", "pruebas", "impresiones", "aviso", "eventos", "galeria", "contenido", "cursos", "listas", "mensajes"];
// Partes del contenido (data/sitio.json) que abre cada permiso. Lo demás (colores, estilo, logo, app…) solo «todo».
const SECCIONES_PERMISO = {
  noticias: ["noticias"], aviso: ["aviso"], eventos: ["eventos"], galeria: ["galeria"],
  contenido: ["directivos", "personal", "departamentos", "documentos", "organizaciones", "pilares", "portada", "emergencia", "redes", "horarios"],
};
// Carpetas donde cada permiso puede subir archivos nuevos (sin SVG ni HTML, que pueden ejecutar código)
const CARPETAS_PERMISO = { noticias: /^(img|documentos)\/noticias\//, propuestas: /^(img|documentos)\/noticias\//, galeria: /^img\/galeria\//, contenido: /^(img|documentos)\/(?!noticias\/)/ };
const SUBIBLE = /^[a-z0-9][a-z0-9/._-]{0,200}\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|pptx?|odt|ods|odp|txt|csv|mp3|mp4)$/i;
const URL_PELIGROSA = /^\s*(javascript|data|vbscript|file):/i;
const NOMBRES_SECCION = { noticias: "Noticias", aviso: "Aviso urgente", eventos: "Calendario escolar", galeria: "Galería", directivos: "Directivos", personal: "Docentes y personal",
  departamentos: "Departamentos", documentos: "Documentos", organizaciones: "CGPA y CEAL", pilares: "Pilares", portada: "Portada", emergencia: "Emergencias", redes: "Redes sociales", horarios: "Horarios" };

// Lo que se le explica a cada persona en el correo de bienvenida, según sus permisos
const FUNCIONES = {
  todo: "Control total: todo el panel, incluidos el diseño del sitio, las copias de seguridad y dar o quitar acceso a otras personas.",
  noticias: "Noticias: publicar, programar, editar y borrar las noticias del sitio, con fotos y documentos. Puedes guardar borradores antes de publicarlas.",
  pruebas: "Pruebas y guías: revisar las que envían los profesores desde la app, aprobarlas (se envían solas a impresión con la cantidad de copias) o devolverlas con comentarios, y cargar la matrícula de cada curso y electivo.",
  impresiones: "Impresiones: te llega un correo con cada prueba o guía aprobada por UTP; la descargas en el panel con la cantidad de copias y la marcas como impresa.",
  propuestas: "Noticias con aprobación: escribir noticias y flyers con fotos. Se publican en el sitio cuando el encargado web las aprueba; te llega un correo cuando se publican o si necesitan cambios.",
  aviso: "Aviso urgente: publicar o apagar la franja de aviso que aparece en todas las páginas (retiro anticipado, suspensión de clases, emergencia), con notificación a los celulares que tienen la app del colegio. Trae modelos listos para completar.",
  eventos: "Calendario escolar: agregar, cambiar y borrar fechas del calendario del colegio.",
  galeria: "Galería de fotos: crear álbumes y subir fotos.",
  contenido: "Contenido del sitio: directivos, docentes y personal, departamentos, documentos, horarios, emergencias, portada, pilares, CGPA y CEAL y redes sociales.",
  cursos: "Ver los cursos: en «Mi curso (app)» ves los estudiantes y profesores de cada curso y las fechas (pruebas, entregas, salidas, reuniones) que publican los profesores.",
  listas: "Listas de «Mi curso»: subir las listas de estudiantes y profesores desde Excel y hacer el cierre de año (paso de curso).",
  mensajes: "Mensajes de contacto: leer todos los mensajes que llegan desde el formulario de Contacto del sitio y asignarlos a otras personas.",
};
const correoDelColegio = (c) => { const dom = (c || "").split("@")[1] || ""; return dom === DOMINIO_COLEGIO || dom.endsWith("." + DOMINIO_COLEGIO); };
const permisosDe = (f) => { try { return JSON.parse(f.permisos || "[]").filter((p) => PERMISOS_PANEL.includes(p)); } catch (e) { return []; } };
const tiene = (f, ...p) => !!f && (f.permisos.includes("todo") || p.some((x) => f.permisos.includes(x)));
function enlacesPeligrosos(valor, ruta = "") {
  if (typeof valor === "string") return URL_PELIGROSA.test(valor) ? [ruta] : [];
  if (valor && typeof valor === "object") return Object.entries(valor).flatMap(([k, v]) => enlacesPeligrosos(v, ruta ? `${ruta}.${k}` : k));
  return [];
}
async function anotar(db, f, accion) {
  accion = String(accion).slice(0, 300);
  const t = new Date().toISOString();
  const fila = await db.prepare("INSERT INTO registro_panel (t, correo, nombre, accion) VALUES (?, ?, ?, ?) RETURNING id").bind(t, f.correo, f.nombre || "", accion).first();
  // Las acciones que no cambian el sitio (cuentas, mensajes) van también al registro de KPI
  const kpi = accionPanel(accion);
  if (kpi && fila) await db.prepare("INSERT OR IGNORE INTO registro_kpi (sha, n, t, quien, tipo, detalle) VALUES (?, 0, ?, ?, ?, ?)").bind("panel-" + fila.id, t, quienPanel(f.nombre), kpi.tipo, kpi.detalle).run();
}

async function sesionPanel(db, f) {
  const p = b64url(texto(JSON.stringify({ c: f.correo, v: f.version, e: Date.now() + DURACION_PANEL })));
  return p + "." + b64url(await crypto.subtle.sign("HMAC", await llaveCurso(db, "panel"), texto(p)));
}
// La cuenta que pide (cabecera «Authorization: Panel <sesión>»), con sus permisos de ahora.
// Al borrar la cuenta o cambiar su contraseña, sus sesiones dejan de servir.
async function funcionarioDe(db, req) {
  const s = (/^Panel\s+(\S{20,700})$/.exec(req.headers.get("Authorization") || "") || [])[1];
  const m = s && /^([A-Za-z0-9_-]{10,500})\.([A-Za-z0-9_-]{20,})$/.exec(s);
  if (!m || !(await crypto.subtle.verify("HMAC", await llaveCurso(db, "panel"), deB64url(m[2]), texto(m[1])))) return null;
  let d; try { d = JSON.parse(new TextDecoder().decode(deB64url(m[1]))); } catch (e) { return null; }
  if (!d || d.e < Date.now()) return null;
  const f = await db.prepare("SELECT correo, nombre, cargo, permisos, version, hash FROM funcionarios WHERE correo = ?").bind(d.c).first();
  return f && f.version === d.v ? { correo: f.correo, nombre: f.nombre, cargo: f.cargo, permisos: permisosDe(f), conClave: !!f.hash, version: f.version } : null;
}
// ¿Puede usar esta parte del panel? Cuenta con correo (según sus permisos) o token de GitHub (dueño o trabajador)
async function puedePanel(db, req, ...permisos) {
  if (/^Panel\s/.test(req.headers.get("Authorization") || "")) return tiene(await funcionarioDe(db, req), ...permisos);
  return puedeLeerMensajes(req);
}
// Administrar cuentas: el dueño (token de GitHub con permiso de escritura) o una cuenta con «todo»
async function puedeAdministrar(db, req) {
  if (/^Panel\s/.test(req.headers.get("Authorization") || "")) { const f = await funcionarioDe(db, req); return !!f && f.permisos.includes("todo"); }
  return esDueno(req);
}

// Freno a contraseñas equivocadas: por conexión (5 intentos) y por cuenta (8 intentos, aunque vengan de muchas
// conexiones). Al bloquearse la cuenta, la persona puede volver a entrar con un código a su correo.
async function entrarPanel(db, ip, correo, clave) {
  const ahora = Date.now(), llave = "panel|" + ip, llaveCuenta = "panelcuenta|" + (correo || "?");
  const [reg, regCuenta] = await Promise.all([llave, llaveCuenta].map((k) => db.prepare("SELECT fallos, hasta FROM intentos WHERE ip = ?").bind(k).first()));
  if (reg && reg.hasta > ahora) return { error: `Demasiados intentos. Espera ${Math.ceil((reg.hasta - ahora) / 60000)} minutos e inténtalo de nuevo.`, estado: 429 };
  if (regCuenta && regCuenta.hasta > ahora) return { error: "Por seguridad, esta cuenta quedó bloqueada un rato por muchas contraseñas equivocadas. Puedes entrar ahora con «Primera vez u olvidé mi contraseña» (te llega un código al correo).", estado: 429 };
  const f = correo && await db.prepare("SELECT * FROM funcionarios WHERE correo = ?").bind(correo).first();
  if (f && !f.hash) return { error: "Aún no creas tu contraseña. Toca «Primera vez u olvidé mi contraseña».", estado: 401 };
  const h = await huella(clave, f ? f.sal : "sin-cuenta");
  if (f && clave && await mismaClave(h, f.hash)) {
    await db.batch([db.prepare("DELETE FROM intentos WHERE ip IN (?, ?)").bind(llave, llaveCuenta), db.prepare("UPDATE funcionarios SET ultimo = ? WHERE correo = ?").bind(new Date().toISOString(), f.correo)]);
    return { sesion: await sesionPanel(db, f), cuenta: f };
  }
  const fallos = (reg ? reg.fallos : 0) + 1;
  const hasta = fallos >= 5 ? ahora + Math.min(15 * 60000 * 2 ** (fallos - 5), 864e5) : 0;
  const ops = [db.prepare("INSERT INTO intentos (ip, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(ip) DO UPDATE SET fallos = ?2, hasta = ?3").bind(llave, fallos, hasta)];
  if (f) {
    const fc = (regCuenta ? regCuenta.fallos : 0) + 1;
    const hc = fc >= 8 ? ahora + Math.min(15 * 60000 * 2 ** (fc - 8), 864e5) : 0;
    ops.push(db.prepare("INSERT INTO intentos (ip, fallos, hasta) VALUES (?1, ?2, ?3) ON CONFLICT(ip) DO UPDATE SET fallos = ?2, hasta = ?3").bind(llaveCuenta, fc, hc));
  }
  await db.batch(ops);
  return { error: fallos >= 5 ? "Correo o contraseña incorrectos. Por seguridad, espera 15 minutos antes de volver a intentar." : "Correo o contraseña incorrectos.", estado: 401 };
}

// Aviso al correo de la persona cuando alguien entra a su cuenta desde un equipo nuevo (no la primera vez)
function describirEquipo(req) {
  const ua = req.headers.get("User-Agent") || "";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "un navegador";
  const so = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "";
  const cf = req.cf || {};
  const lugar = [cf.city, cf.country].filter(Boolean).join(", ");
  return `${nav}${so ? " en " + so : ""}${lugar ? " (cerca de " + lugar + ")" : ""}`;
}
async function avisarEquipoNuevo(db, env, req, f, equipo) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(equipo || ""))) return;
  const huellaEq = hexDe(await crypto.subtle.digest("SHA-256", texto(f.correo + "|" + equipo)));
  const conocidos = (await db.prepare("SELECT equipo FROM equipos_panel WHERE correo = ?").bind(f.correo).all()).results.map((x) => x.equipo);
  if (conocidos.includes(huellaEq)) { await db.prepare("UPDATE equipos_panel SET t = ? WHERE correo = ? AND equipo = ?").bind(new Date().toISOString(), f.correo, huellaEq).run(); return; }
  await db.prepare("INSERT INTO equipos_panel (correo, equipo, t) VALUES (?, ?, ?)").bind(f.correo, huellaEq, new Date().toISOString()).run();
  if (!conocidos.length || !env.CORREO_URL || !env.CORREO_CLAVE) return; // primer equipo: es la propia persona creando su cuenta
  const cuando = new Date().toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "full", timeStyle: "short" });
  await llamarCorreo(db, env, { tipo: "mensaje", para: f.correo, asunto: "Nuevo ingreso a tu cuenta del Panel SM",
    cuerpo: `Hola${f.nombre ? " " + f.nombre : ""}:\n\nAlguien entró a tu cuenta del Panel SM (colegiosm.cl/admin) desde un equipo nuevo:\n\n  • ${cuando}\n  • ${describirEquipo(req)}\n\n` +
      "Si fuiste tú, no tienes que hacer nada.\n\nSi NO fuiste tú, entra a colegiosm.cl/admin, toca «Primera vez u olvidé mi contraseña» y crea una contraseña nueva: así se cierran todas las sesiones abiertas. Luego avisa respondiendo este correo.\n\nColegio San Martín · colegiosm.cl" }).catch(() => {});
}

// Guarda en el contenido del sitio solo las secciones que la cuenta puede cambiar (mezcladas con lo último publicado)
async function guardarPanel(db, env, f, d) {
  const cambios = d.cambios && typeof d.cambios === "object" && !Array.isArray(d.cambios) ? d.cambios : null;
  const claves = cambios ? Object.keys(cambios).filter((k) => /^[a-z][a-zA-Z0-9_]{0,40}$/.test(k)) : [];
  if (!claves.length) return { error: "No hay cambios para guardar.", estado: 400 };
  const todo = f.permisos.includes("todo");
  const abiertas = new Set(f.permisos.flatMap((p) => SECCIONES_PERMISO[p] || []));
  const fuera = todo ? [] : claves.filter((k) => !abiertas.has(k));
  if (fuera.length) return { error: `Tu cuenta no puede cambiar: ${fuera.map((k) => NOMBRES_SECCION[k] || k).join(", ")}.`, estado: 403 };
  const json = JSON.stringify(cambios);
  if (json.length > 5e6) return { error: "El contenido es demasiado grande.", estado: 400 };
  if (PARECE_TOKEN.test(json)) return { error: "El contenido incluye un token de GitHub pegado por error. Bórralo del campo y vuelve a guardar.", estado: 400 };
  if (!todo) {
    const malos = claves.flatMap((k) => enlacesPeligrosos(cambios[k], k));
    if (malos.length) return { error: `Hay enlaces no permitidos (javascript:, data:…) en: ${malos.slice(0, 5).join(", ")}.`, estado: 400 };
  }
  const nombres = claves.map((k) => NOMBRES_SECCION[k] || k).join(", ");
  await cambiarDatos(env, (datos) => {
    // Autoría: una noticia nueva lleva el nombre y cargo de quien la publica; al editarla se conserva el autor original
    if (Array.isArray(cambios.noticias)) {
      const antes = new Map((datos.noticias || []).map((n) => [n.id, n]));
      for (const n of cambios.noticias) {
        if (!n || typeof n !== "object") continue;
        const prev = n.id && antes.get(n.id);
        delete n.autor; delete n.autorCargo;
        if (prev) { if (prev.autor) n.autor = prev.autor; if (prev.autorCargo) n.autorCargo = prev.autorCargo; }
        else { if (f.nombre) n.autor = f.nombre; if (f.cargo) n.autorCargo = f.cargo; }
      }
    }
    for (const k of claves) datos[k] = cambios[k];
  }, `Cambios desde el panel: ${nombres} (${f.nombre || f.cargo || "cuenta del colegio"})`);
  // El aviso se muestra y se notifica al tiro, sin esperar a que el sitio se actualice (como en Inspectoría)
  if (claves.includes("aviso") && cambios.aviso && typeof cambios.aviso === "object") {
    await db.prepare("INSERT INTO estado (k, v) VALUES ('directo', ?1) ON CONFLICT(k) DO UPDATE SET v = ?1").bind(JSON.stringify({ t: Date.now(), aviso: cambios.aviso })).run();
  }
  await anotar(db, f, "Publicó cambios en: " + nombres);
  return { ok: true };
}

// El panel habla con GitHub a través del servidor. Leer: todo (el repositorio es público).
// Escribir: solo subir archivos nuevos a las carpetas de sus permisos; «todo» puede cambiar cualquier archivo.
const RUTA_REPO = "/repos/" + REPO;
async function githubPanel(db, env, f, d) {
  const metodo = String(d.metodo || "GET").toUpperCase();
  const ruta = String(d.ruta || "");
  const resto = ruta.slice(RUTA_REPO.length);
  if (ruta.slice(0, RUTA_REPO.length).toLowerCase() !== RUTA_REPO.toLowerCase() || !/^($|[/?])/.test(resto) || /\.\.|%2e%2e|[\s\\]/i.test(ruta)) return { error: "No permitido.", estado: 403 };
  let cuerpo = null;
  if (metodo !== "GET") {
    const mc = /^\/contents\/([^?#]+)$/.exec(resto);
    if (!mc || !["PUT", "DELETE"].includes(metodo)) return { error: "Tu cuenta no puede hacer ese cambio.", estado: 403 };
    let archivo; try { archivo = decodeURIComponent(mc[1]); } catch (e) { return { error: "Archivo no válido.", estado: 400 }; }
    cuerpo = d.cuerpo && typeof d.cuerpo === "object" ? { ...d.cuerpo } : {};
    if (cuerpo.branch && cuerpo.branch !== "main") return { error: "Solo se puede guardar en el sitio publicado.", estado: 403 };
    if (/^\.github\//.test(archivo)) return { error: "Ese archivo no se cambia desde el panel.", estado: 403 };
    // Código del sitio (páginas, estilos, scripts) y permisos de GitHub: solo con el token del dueño, nunca con una cuenta con correo
    if (/\.(html?|css|js|mjs|svg|xml|json|webmanifest)$/i.test(archivo) || /^(admin|js|servidor)\//.test(archivo) || /^(CNAME|_config\.yml)$/.test(archivo)) {
      return { error: "El código del sitio (HTML, CSS, scripts) solo se cambia entrando con el token de GitHub.", estado: 403 };
    }
    if (!f.permisos.includes("todo")) {
      if (metodo === "DELETE" || cuerpo.sha) return { error: "Tu cuenta solo puede subir archivos nuevos.", estado: 403 };
      const carpeta = Object.entries(CARPETAS_PERMISO).some(([p, re]) => f.permisos.includes(p) && re.test(archivo));
      if (!carpeta || !SUBIBLE.test(archivo)) return { error: "Tu cuenta no puede subir ese archivo ahí. Usa PNG, JPG, WEBP, GIF, PDF o un documento de Office.", estado: 403 };
    }
    cuerpo.message = `${String(cuerpo.message || "Cambio desde el panel").slice(0, 150)} (${f.nombre || f.cargo || "cuenta del colegio"})`;
    cuerpo.committer = FIRMA; cuerpo.author = FIRMA;
  }
  const r = await fetch("https://api.github.com" + ruta, { method: metodo, headers: { ...cabGitHub(env), ...(cuerpo ? { "Content-Type": "application/json" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
  if (r.status === 401) throw new Error("token");
  if (cuerpo && r.ok) await anotar(db, f, (metodo === "DELETE" ? "Borró " : "Subió ") + decodeURIComponent(resto.slice("/contents/".length)));
  return { crudo: await r.text(), estado: r.status };
}

async function cuentasPanel(db, env, url, d, quien) {
  if (url.pathname === "/panel/cuentas") {
    const lista = (await db.prepare("SELECT f.correo, f.nombre, f.cargo, f.permisos, f.hash, f.creado, f.ultimo, i.t AS invitado FROM funcionarios f LEFT JOIN invitaciones i ON i.correo = f.correo ORDER BY f.nombre").all()).results
      .map((f) => ({ correo: f.correo, nombre: f.nombre, cargo: f.cargo, permisos: permisosDe(f), activa: !!f.hash, creado: f.creado, ultimo: f.ultimo, invitado: f.invitado }));
    return { cuentas: lista, permisos: PERMISOS_PANEL };
  }
  if (url.pathname === "/panel/registro") {
    return { registro: (await db.prepare("SELECT t, nombre, correo, accion FROM registro_panel ORDER BY id DESC LIMIT 150").all()).results };
  }
  const correo = normalizarCorreo(d.correo);
  if (!correo || !correoDelColegio(correo)) return { error: `Usa un correo institucional (@${DOMINIO_COLEGIO}): ahí llega el código para entrar.`, estado: 400 };
  if (url.pathname === "/panel/invitar") {
    // Correo de bienvenida: cómo entrar y qué puede hacer (máximo uno cada 10 minutos por persona)
    if (!env.CORREO_URL || !env.CORREO_CLAVE) return { error: "Falta configurar el envío de correos del servidor (ver la guía).", estado: 503 };
    const f = await db.prepare("SELECT correo, nombre, cargo, permisos FROM funcionarios WHERE correo = ?").bind(correo).first();
    if (!f) return { error: "Esa cuenta ya no existe.", estado: 404 };
    const prev = await db.prepare("SELECT t FROM invitaciones WHERE correo = ?").bind(correo).first();
    if (prev && Date.now() - Date.parse(prev.t) < 10 * 60000) return { error: "A esa persona ya se le enviaron las instrucciones hace menos de 10 minutos.", estado: 429 };
    const permisos = permisosDe(f);
    const funciones = (permisos.includes("todo") ? ["todo"] : permisos).map((p) => FUNCIONES[p]).filter(Boolean)
      .concat(permisos.includes("todo") || permisos.includes("mensajes") ? [] : ["Mensajes de contacto que te asignen: los ves en el panel, te llegan también a tu correo y los marcas como atendidos."])
      .concat("Estadísticas de visitas: cuántas personas visitan el sitio y qué páginas leen.");
    if (!(await llamarCorreo(db, env, { tipo: "invitacion", para: f.correo, nombre: f.nombre, cargo: f.cargo, funciones }))) {
      return { error: "No se pudo enviar el correo. Revisa «correo» en /estado del servidor, o publica la versión nueva del script de Google (ahora envía estas instrucciones).", estado: 502 };
    }
    await db.prepare("INSERT INTO invitaciones (correo, t) VALUES (?1, ?2) ON CONFLICT(correo) DO UPDATE SET t = ?2").bind(f.correo, new Date().toISOString()).run();
    await anotar(db, quien, "Envió las instrucciones de acceso a " + f.correo);
    return { ok: true };
  }
  if (url.pathname === "/panel/cuenta/borrar") {
    await db.batch([db.prepare("DELETE FROM funcionarios WHERE correo = ?").bind(correo), db.prepare("DELETE FROM borradores_panel WHERE correo = ?").bind(correo), db.prepare("DELETE FROM invitaciones WHERE correo = ?").bind(correo), db.prepare("DELETE FROM equipos_panel WHERE correo = ?").bind(correo), db.prepare("DELETE FROM asignaciones WHERE correo = ?").bind(correo)]);
    await anotar(db, quien, "Quitó el acceso de " + correo);
    return { ok: true };
  }
  if (url.pathname === "/panel/cuenta") {
    const permisos = [...new Set((Array.isArray(d.permisos) ? d.permisos : []).filter((p) => PERMISOS_PANEL.includes(p)))];
    const nombre = String(d.nombre || "").trim().slice(0, 80), cargo = String(d.cargo || "").trim().slice(0, 60);
    if (!nombre) return { error: "Escribe el nombre de la persona.", estado: 400 };
    if (!permisos.length) return { error: "Marca al menos un permiso.", estado: 400 };
    await db.prepare(`INSERT INTO funcionarios (correo, nombre, cargo, permisos, version, creado) VALUES (?1, ?2, ?3, ?4, 1, ?5)
      ON CONFLICT(correo) DO UPDATE SET nombre = ?2, cargo = ?3, permisos = ?4, version = version + ?6`)
      .bind(correo, nombre, cargo, JSON.stringify(permisos), new Date().toISOString().slice(0, 10), d.cerrarSesiones ? 1 : 0).run();
    await anotar(db, quien, `Dio acceso a ${correo}: ${permisos.join(", ")}`);
    return { ok: true };
  }
  return { error: "No encontrado", estado: 404 };
}

async function rutaPanel(db, env, req, url) {
  const ip = req.headers.get("CF-Connecting-IP") || "?";
  const d = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (url.pathname === "/panel/codigo") {
    if (!env.CORREO_URL || !env.CORREO_CLAVE) return { error: "Falta configurar el envío de correos del servidor (ver la guía).", estado: 503 };
    const correo = normalizarCorreo(d.correo);
    const f = correo && await db.prepare("SELECT correo, nombre FROM funcionarios WHERE correo = ?").bind(correo).first();
    if (!f) return { error: "Ese correo no tiene acceso al panel. Pídele a quien administra el sitio que te lo dé.", estado: 404 };
    return mandarCodigo(db, env, ip, f.correo, f.nombre, "panel", "panel|" + f.correo);
  }
  if (url.pathname === "/panel/verificar") {
    const correo = normalizarCorreo(d.correo);
    const f = correo && await db.prepare("SELECT * FROM funcionarios WHERE correo = ?").bind(correo).first();
    if (!f) return { error: "El código venció. Pide uno nuevo.", estado: 401 };
    const ok = await comprobarCodigo(db, "panel|" + f.correo, d.codigo);
    if (ok !== true) return ok;
    // El código prueba que es la persona: se levanta el bloqueo por contraseñas equivocadas
    await db.batch([db.prepare("UPDATE funcionarios SET ultimo = ? WHERE correo = ?").bind(new Date().toISOString(), f.correo), db.prepare("DELETE FROM intentos WHERE ip = ?").bind("panelcuenta|" + f.correo)]);
    await avisarEquipoNuevo(db, env, req, f, d.equipo);
    return { sesion: await sesionPanel(db, f), crearClave: true };
  }
  if (url.pathname === "/panel/entrar") {
    const { cuenta, ...r } = await entrarPanel(db, ip, normalizarCorreo(d.correo), String(d.clave || "").slice(0, 200));
    if (cuenta) await avisarEquipoNuevo(db, env, req, cuenta, d.equipo);
    return r;
  }

  // Pruebas y guías: cuentas con correo (según sus permisos) o el token del dueño o administrador
  if (url.pathname.startsWith("/panel/pruebas") || url.pathname.startsWith("/panel/matricula")) {
    const conCorreo = /^Panel\s/.test(req.headers.get("Authorization") || "");
    const f = conCorreo ? await funcionarioDe(db, req) : (await puedeLeerMensajes(req)) ? { correo: "dueño (GitHub)", nombre: "Encargado web", cargo: "", permisos: ["todo"] } : null;
    if (!f) return { error: conCorreo ? "La sesión venció o tu acceso cambió. Vuelve a entrar." : "Sin permiso.", estado: 401, salir: conCorreo };
    return rutaPruebasPanel(db, env, req, url, f, d || {});
  }
  // Noticias por aprobar: solo el dueño (token de GitHub con permiso de escritura) las ve, aprueba o rechaza
  if (url.pathname === "/panel/aprobacion" || url.pathname.startsWith("/panel/aprobacion/")) {
    if (!(await esDueno(req))) return { error: "Solo el dueño del panel aprueba las noticias, entrando con el token de GitHub.", estado: 403 };
    return aprobacion(db, env, url, d);
  }
  // Registro de cambios para el KPI: solo el dueño (token de GitHub con permiso de escritura)
  if (url.pathname === "/panel/kpi") {
    if (!(await esDueno(req))) return { error: "El registro de KPI solo lo descarga el dueño del panel, entrando con el token de GitHub.", estado: 403 };
    return registroKpi(db, env, url.searchParams.get("desde"));
  }
  if (["/panel/cuentas", "/panel/registro", "/panel/cuenta", "/panel/cuenta/borrar", "/panel/invitar"].includes(url.pathname)) {
    if (!(await puedeAdministrar(db, req))) return { error: "Solo quien tiene control total del panel administra las cuentas.", estado: 403 };
    const quien = (await funcionarioDe(db, req)) || { correo: "dueño (GitHub)", nombre: "Dueño del panel" };
    return cuentasPanel(db, env, url, d, quien);
  }

  const f = await funcionarioDe(db, req);
  if (!f) return { error: "La sesión venció o tu acceso cambió. Vuelve a entrar.", estado: 401, salir: true };
  switch (url.pathname) {
    case "/panel/yo": return { correo: f.correo, nombre: f.nombre, cargo: f.cargo, permisos: f.permisos, conClave: f.conClave, repo: REPO };
    case "/panel/clave": {
      const clave = String(d.clave || "");
      if (clave.length < 10 || clave.length > 200) return { error: "La contraseña debe tener al menos 10 caracteres.", estado: 400 };
      if (clave.toLowerCase().includes(f.correo.split("@")[0])) return { error: "La contraseña no puede contener tu correo.", estado: 400 };
      const sal = hexDe(crypto.getRandomValues(new Uint8Array(16)));
      await db.prepare("UPDATE funcionarios SET sal = ?, hash = ?, version = version + 1 WHERE correo = ?").bind(sal, await huella(clave, sal), f.correo).run();
      // Cambiar la contraseña cierra las demás sesiones; esta sigue con una nueva
      return { ok: true, sesion: await sesionPanel(db, { ...f, version: f.version + 1 }) };
    }
    case "/panel/guardar": return guardarPanel(db, env, f, d);
    case "/panel/propuestas": case "/panel/propuesta": case "/panel/propuesta/retirar": return propuestas(db, env, url, f, d);
    case "/panel/github": return githubPanel(db, env, f, d);
    case "/panel/borradores": {
      if (req.method === "GET") {
        const b = await db.prepare("SELECT datos, version FROM borradores_panel WHERE correo = ?").bind(f.correo).first();
        return b ? { texto: b.datos, version: b.version } : { texto: "", version: 0 };
      }
      const datos = String(d.texto || "");
      if (datos.length > 400000) return { error: "Los borradores son demasiado grandes. Publica o borra algunos.", estado: 400 };
      const r = await db.prepare(`INSERT INTO borradores_panel (correo, datos, version) VALUES (?1, ?2, 1)
        ON CONFLICT(correo) DO UPDATE SET datos = ?2, version = version + 1 WHERE version = ?3 RETURNING version`).bind(f.correo, datos, +d.version || 0).first();
      if (!r) return { error: "Se guardaron borradores desde otro equipo.", estado: 409 };
      return { ok: true, version: r.version };
    }
  }
  return { error: "No encontrado", estado: 404 };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const o = req.headers.get("Origin");
    const origen = o && (ORIGENES.includes(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o)) ? o : "";
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: origen ? { "Access-Control-Allow-Origin": origen, "Access-Control-Allow-Methods": "GET, POST", "Access-Control-Allow-Headers": "Content-Type, Authorization", "Access-Control-Max-Age": "86400", Vary: "Origin" } : {} });
    }
    if (!env.DB) return respuesta({ error: "Falta enlazar la base de datos D1 con el nombre DB (ver la guía)." }, origen, 500);
    const db = env.DB;
    try {
      await preparar(db);
      if (req.method === "GET" && url.pathname === "/clave") return respuesta({ clave: (await llaves(db)).publica }, origen);
      if (req.method === "GET" && url.pathname === "/estado") {
        const n = await db.prepare("SELECT COUNT(*) AS n FROM subs").first();
        const e = await leerEstado(db, "envio");
        const rec = await leerEstado(db, "recordatorio");
        const porServicio = (await db.prepare("SELECT endpoint FROM subs").all()).results.reduce((m, r) => {
          const k = /apple/.test(r.endpoint) ? "iPhone" : /google/.test(r.endpoint) ? "Android/Chrome" : "Otros";
          m[k] = (m[k] || 0) + 1;
          return m;
        }, {});
        const co = await leerEstado(db, "correo");
        const correo = !(env.CORREO_URL && env.CORREO_CLAVE) ? "sin configurar" : co || "configurado, sin envíos todavía";
        return respuesta({ ok: true, celulares: n.n, porServicio, correo, ultimoEnvio: e ? { inicio: e.inicio, enviadas: e.enviadas } : null, ultimoRecordatorio: rec && !rec.sin ? { para: rec.dia, inicio: rec.inicio, enviadas: rec.enviadas } : null, registroKpi: await estadoKpi(db), version: VERSION, errores: Object.values((await leerEstado(db, "errores")) || {}) }, origen);
      }
      if (req.method === "POST" && (url.pathname === "/suscribir" || url.pathname === "/baja")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        const d = await req.json().catch(() => ({}));
        const ep = String(d.endpoint || "");
        if (ep.length > 1000 || !SERVICIOS.test(ep)) return respuesta({ error: "Suscripción no válida" }, origen, 400);
        if (url.pathname === "/baja") await db.prepare("DELETE FROM subs WHERE endpoint = ?").bind(ep).run();
        else await db.prepare("INSERT OR IGNORE INTO subs (endpoint, creado) VALUES (?, ?)").bind(ep, new Date().toISOString().slice(0, 10)).run();
        return respuesta({ ok: true }, origen);
      }
      if (req.method === "POST" && url.pathname === "/probar") {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        const d = await req.json().catch(() => ({}));
        const ep = String(d.endpoint || "");
        const sub = SERVICIOS.test(ep) && await db.prepare("SELECT id FROM subs WHERE endpoint = ?").bind(ep).first();
        if (!sub) return respuesta({ error: "Este celular no está registrado. Desactiva y vuelve a activar las notificaciones." }, origen, 404);
        const res = await empujar(await llaves(db), {}, ep);
        const info = await describir(res, new URL(ep).origin);
        if (res.status === 404 || res.status === 410) await db.prepare("DELETE FROM subs WHERE id = ?").bind(sub.id).run();
        else if (!res.ok) await anotarErrores(db, { [new URL(ep).origin]: info });
        return respuesta({ ok: res.ok, ...info }, origen);
      }
      // El celular de un profesor lee aquí el mensaje que le corresponde (la notificación llega sin texto)
      if (req.method === "POST" && url.pathname === "/notif/personal") {
        const d = await req.json().catch(() => ({}));
        const ep = String(d.endpoint || "");
        if (!SERVICIOS.test(ep)) return respuesta({ mensaje: null }, origen);
        const m = await db.prepare("SELECT id, titulo, cuerpo, url FROM notif_personales WHERE endpoint = ? AND t > ? ORDER BY id LIMIT 1").bind(ep, Date.now() - 2 * 864e5).first();
        if (m) await db.prepare("DELETE FROM notif_personales WHERE id = ?").bind(m.id).run();
        return respuesta({ mensaje: m ? { titulo: m.titulo, cuerpo: m.cuerpo, url: m.url } : null }, origen);
      }
      if (req.method === "POST" && url.pathname === "/enviar") return respuesta(await enviar(db), origen);
      if (req.method === "POST" && url.pathname === "/visita") {
        if (origen) await visita(db, req).catch(() => {});
        return new Response(null, { status: 204, headers: origen ? { "Access-Control-Allow-Origin": origen, Vary: "Origin" } : {} });
      }
      if (req.method === "GET" && url.pathname === "/estadisticas") return respuesta(await estadisticas(db, url.searchParams.get("dias")), origen);
      if (req.method === "POST" && url.pathname === "/contacto") {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        const { estado, ...r } = await contacto(db, env, req.headers.get("CF-Connecting-IP") || "?", await req.json().catch(() => ({})));
        return respuesta(r, origen, estado || 200);
      }
      if (url.pathname === "/mensajes" || url.pathname.startsWith("/mensajes/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        // Quien tiene «mensajes» (o el token de administración) ve todos; las demás cuentas, solo los que se les asignaron
        const conCorreo = /^Panel\s/.test(req.headers.get("Authorization") || "");
        const f = conCorreo ? await funcionarioDe(db, req) : null;
        const todos = conCorreo ? tiene(f, "mensajes") : await puedeLeerMensajes(req);
        if (!todos && !f) return respuesta({ error: "Sin permiso para ver los mensajes." }, origen, 403);
        const { estado, ...r } = await rutaMensajes(db, env, req, url, f, todos);
        return respuesta(r, origen, estado || 200);
      }
      if (req.method === "GET" && url.pathname === "/aviso") return respuesta({ aviso: await avisoDirecto(db) }, origen);
      if (req.method === "POST" && url.pathname.startsWith("/inspectoria/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        if (!env.CLAVE_INSPECTORIA || !env.GITHUB_TOKEN) return respuesta({ error: "Falta configurar la clave o el token de Inspectoría en Cloudflare (ver la guía)." }, origen, 503);
        const d = await req.json().catch(() => ({}));
        const ip = req.headers.get("CF-Connecting-IP") || "?";
        const r = url.pathname === "/inspectoria/entrar" ? await entrar(db, env, ip, String(d.clave || "").slice(0, 200))
          : url.pathname === "/inspectoria/publicar" ? await publicar(db, env, d) : { error: "No encontrado", estado: 404 };
        const { estado, ...cuerpo } = r;
        return respuesta(cuerpo, origen, estado || 200);
      }
      if (url.pathname === "/utp/cuentas" || url.pathname.startsWith("/utp/cuentas/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        if (!(await puedeAdministrar(db, req))) return respuesta({ error: "Solo el dueño del panel administra las cuentas UTP." }, origen, 403);
        const { estado, ...r } = await cuentasUtp(db, url, req.method === "POST" ? await req.json().catch(() => ({})) : null);
        return respuesta(r, origen, estado || 200);
      }
      if (url.pathname.startsWith("/pruebas/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        const { estado, ...r } = await rutaPruebasProfe(db, env, req, url);
        return respuesta(r, origen, estado || 200);
      }
      if (url.pathname.startsWith("/curso/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        const panel = ["/curso/listas", "/curso/calendario", "/curso/estudiantes", "/curso/profesores", "/curso/anio", "/curso/estudiante/borrar", "/curso/codigo-apoderado", "/curso/apoderado/quitar"].includes(url.pathname);
        // Ver los cursos y dar códigos a apoderados: permiso «cursos» o «listas». Cambiar las listas: solo «listas».
        const soloVer = ["/curso/listas", "/curso/calendario", "/curso/codigo-apoderado", "/curso/apoderado/quitar"].includes(url.pathname);
        if (panel && !(await (soloVer ? puedePanel(db, req, "cursos", "listas") : puedePanel(db, req, "listas")))) return respuesta({ error: "Tu cuenta no puede usar esta parte de «Mi curso»." }, origen, 403);
        if (!panel && req.method !== "POST") return respuesta({ error: "No encontrado" }, origen, 404);
        const { estado, ...r } = panel ? await rutaCursoPanel(db, env, req, url) : await rutaCurso(db, env, req, url);
        return respuesta(r, origen, estado || 200);
      }
      if (url.pathname.startsWith("/panel/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        let r;
        try { r = await rutaPanel(db, env, req, url); }
        catch (e) {
          r = e.message === "token" ? { error: "El servidor no tiene permiso para guardar en el sitio (el token de GitHub venció o fue anulado). Avisa a quien administra el sitio.", estado: 502 }
            : { error: String(e.message || e), estado: e.estado || 502 };
        }
        if (r.flujo) return new Response(r.flujo, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origen, Vary: "Origin" } });
        if (r.crudo !== undefined) return new Response(r.crudo, { status: r.estado, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": origen, Vary: "Origin" } });
        const { estado, ...cuerpo } = r;
        return respuesta(cuerpo, origen, estado || 200);
      }
      if (req.method === "POST" && url.pathname.startsWith("/utp/")) {
        if (!origen) return respuesta({ error: "Origen no permitido" }, "", 403);
        if (!env.GITHUB_TOKEN) return respuesta({ error: "Falta configurar el token de GitHub del servidor en Cloudflare (ver la guía)." }, origen, 503);
        let r;
        try { r = await rutaUtp(db, env, req, url); }
        catch (e) {
          r = e.message === "token" ? { error: "El servidor no tiene permiso para guardar en el sitio (el token de GitHub venció o fue anulado). Avisa a quien administra el sitio.", estado: 502 }
            : { error: String(e.message || e), estado: e.estado || 502 };
        }
        const { estado, ...cuerpo } = r;
        return respuesta(cuerpo, origen, estado || 200);
      }
      if (url.pathname === "/") return respuesta({ ok: true, servicio: "Notificaciones de la app del Colegio San Martín" }, origen);
      return respuesta({ error: "No encontrado" }, origen, 404);
    } catch (e) {
      return respuesta({ error: String(e && e.message || e) }, origen, 500);
    }
  },
  // Cada minuto: si hay un aviso nuevo o un envío a medias, manda el siguiente grupo
  async scheduled(evento, env, ctx) {
    if (!env.DB) return;
    ctx.waitUntil((async () => {
      const a = await enviar(env.DB);
      await revisarDirecto(env.DB);
      const b = await recordatorios(env.DB);
      // Registro de cambios para el KPI, solo si no se está enviando un grupo (el plan gratis permite 50 conexiones por vez)
      if (!(a && a.grupo) && !(b && b.grupo)) await registrarCambios(env.DB, env);
    })());
    // Una vez al día (3 de la mañana) se borran visitas de hace más de 13 meses, mensajes de hace más de 1 año
    // y el registro de cambios de hace más de 3 años; los archivos de pruebas, 30 días después de la evaluación
    if (new Date(evento.scheduledTime || Date.now()).getUTCHours() === 6 && new Date(evento.scheduledTime || Date.now()).getUTCMinutes() === 0) {
      ctx.waitUntil(env.DB.batch([
        env.DB.prepare("DELETE FROM visitas WHERE dia < ?").bind(new Date(Date.now() - 400 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM notif_personales WHERE t < ?").bind(Date.now() - 3 * 864e5),
        env.DB.prepare("DELETE FROM subs_profes WHERE endpoint NOT IN (SELECT endpoint FROM subs)"),
        env.DB.prepare("DELETE FROM mensajes WHERE fecha < ?").bind(new Date(Date.now() - 365 * 864e5).toISOString()),
        env.DB.prepare("DELETE FROM asignaciones WHERE mensaje NOT IN (SELECT id FROM mensajes)"),
        env.DB.prepare("DELETE FROM registro_panel WHERE t < ?").bind(new Date(Date.now() - 365 * 864e5).toISOString()),
        env.DB.prepare("DELETE FROM pruebas_partes WHERE id IN (SELECT id FROM pruebas WHERE fecha < ?)").bind(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("UPDATE pruebas SET partes = 0 WHERE fecha < ?").bind(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10)),
        env.DB.prepare("DELETE FROM pruebas WHERE t < ?").bind(new Date(Date.now() - 2 * 365 * 864e5).toISOString()),
        env.DB.prepare("DELETE FROM apoderados WHERE rut NOT IN (SELECT rut FROM estudiantes)"),
        env.DB.prepare("DELETE FROM codigos_colegio WHERE vence < ?").bind(Date.now()),
        env.DB.prepare("DELETE FROM registro_kpi WHERE t < ?").bind(new Date(Date.now() - 3 * 365 * 864e5).toISOString()),
      ]));
    }
  },
};
