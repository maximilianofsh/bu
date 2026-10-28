/* ==========================================================
   Trabajador de la app (/app/): guarda la app y los datos en el celular para que
   horarios, calendario y el último aviso se vean aunque no haya internet.
   - La app (HTML, CSS, JS, íconos): se muestra lo guardado y se actualiza por detrás.
   - Los datos (data/sitio.json): siempre se piden frescos; sin conexión se usa la última copia.
   ========================================================== */
"use strict";

const CACHE = "csm-app-v15";
const APP = ["./", "index.html", "app.css", "app.js", "micurso.js", "manifest.webmanifest", "icono-v2-192.png", "icono-v2-apple-180.png", "icono-v3-notificacion-96.png", "icono-v3-notificacion-color-192.png", "../js/horarios.js"];
const DATOS = new URL("../data/sitio.json", self.location).pathname;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP.concat("../data/sitio.json"))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith("csm-app-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Primero internet; si falla, la copia guardada
const redPrimero = async (req) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res.ok) cache.put(DATOS, res.clone());
    return res;
  } catch (err) {
    const guardada = await cache.match(DATOS);
    if (guardada) return guardada;
    throw err;
  }
};

// Lo guardado al tiro; se actualiza por detrás para la próxima vez
const guardadoPrimero = async (req) => {
  const cache = await caches.open(CACHE);
  const guardada = await cache.match(req, { ignoreSearch: true });
  const nueva = fetch(req).then((res) => {
    if (res.ok || res.type === "opaque") cache.put(req, res.clone());
    return res;
  }).catch(() => null);
  return guardada || (await nueva) || Response.error();
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname === DATOS) return e.respondWith(redPrimero(req));
  const propio = url.origin === self.location.origin && (url.pathname.startsWith(new URL("./", self.location).pathname) || url.pathname.endsWith("/js/horarios.js"));
  const fuentes = /^https:\/\/fonts\.(googleapis|gstatic)\.com$/.test(url.origin);
  if (propio || fuentes) e.respondWith(guardadoPrimero(req));
});

// Notificaciones: el servidor solo avisa que hay algo nuevo; el texto se lee del sitio.
// Puede ser un aviso (urgente, importante…) o el recordatorio de la tarde anterior a un evento
// del calendario marcado con «Recordar». Para saber cuál es, el celular anota lo último que mostró:
// primero va un aviso que aún no se ha mostrado, después el recordatorio de mañana.
// iPhone exige mostrar la notificación pronto: cada consulta tiene un tiempo máximo y,
// si no alcanza, se muestra un aviso genérico.
const NIVEL = { urgente: "Urgente", importante: "Importante", info: "Aviso" };
const PRUEBA = new URL("__prueba", self.location).pathname;
// La marca de «Enviar una prueba» va en un caché aparte, que no se borra al actualizar la app
const CACHE_PRUEBA = "csm-prueba";
const AVISO_VISTO = new URL("__aviso-visto", self.location).pathname;
const RECORDATORIO_VISTO = new URL("__recordatorio-visto", self.location).pathname;
const conLimite = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("tiempo")), ms))]);
const marca = async (ruta) => { const r = await (await caches.open(CACHE)).match(ruta); return r ? r.text() : ""; };
const marcar = async (ruta, v) => (await caches.open(CACHE)).put(ruta, new Response(v));
// Fecha y hora de Chile (el celular puede estar en otra zona)
const ahoraChile = (dias) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Santiago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit" })
    .formatToParts(new Date(Date.now() + (dias || 0) * 864e5)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: +p.hour };
};
// Eventos con recordatorio que empiezan mañana
const recordatoriosDeManana = (datos) => {
  const manana = ahoraChile(1).dia;
  const lista = (Array.isArray(datos.eventos) ? datos.eventos : []).filter((e) => e && e.recordar && e.titulo && e.fecha === manana);
  return { dia: manana, lista };
};
const textoRecordatorio = (lista) => lista.length === 1
  ? { titulo: `Mañana: ${lista[0].titulo}`, cuerpo: [lista[0].hora, lista[0].lugar].filter(Boolean).join(" · ") || lista[0].descripcion || "Revisa el calendario del colegio." }
  : { titulo: "Mañana en el colegio", cuerpo: lista.map((e) => e.titulo + (e.hora ? ` (${e.hora})` : "")).join(" · ") };

self.addEventListener("push", (e) => {
  e.waitUntil((async () => {
    let titulo = "Colegio San Martín", cuerpo = "Hay un aviso nuevo del colegio. Toca para verlo.";
    let tag = "aviso", url = "./";
    try {
      // Prueba pedida desde la app en este mismo celular
      const prueba = await (await caches.open(CACHE_PRUEBA)).match(PRUEBA);
      if (prueba && Date.now() - +(await prueba.text()) < 120000) {
        await (await caches.open(CACHE_PRUEBA)).delete(PRUEBA);
        return self.registration.showNotification("Prueba recibida ✓", { body: "Las notificaciones del colegio funcionan en este celular.", icon: "icono-v3-notificacion-color-192.png", badge: "icono-v3-notificacion-96.png", tag: "prueba" });
      }
      const res = await conLimite(redPrimero(new Request(DATOS)), 5000);
      const datos = await res.json();
      let a = datos.aviso;
      // Si el aviso se publicó desde Inspectoría, el servidor lo tiene antes que el sitio
      const servidor = String((datos.app && datos.app.servidor) || "").trim().replace(/\/+$/, "");
      // Mensaje solo para este celular: por ejemplo, a un profesor cuando UTP aprueba o devuelve su prueba
      if (/^https:\/\/[a-z0-9.-]+$/i.test(servidor)) {
        try {
          const sub = await self.registration.pushManager.getSubscription();
          const r = sub && await conLimite(fetch(servidor + "/notif/personal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }), 3000);
          const m = r && r.ok ? (await r.json()).mensaje : null;
          if (m && m.titulo) {
            return self.registration.showNotification(m.titulo, { body: m.cuerpo || "", icon: "icono-v3-notificacion-color-192.png", badge: "icono-v3-notificacion-96.png",
              tag: "personal-" + Date.now(), data: { url: m.url || "./#micurso" } });
          }
        } catch (err) { /* sigue con el aviso del colegio */ }
      }
      if (/^https:\/\/[a-z0-9.-]+$/i.test(servidor)) {
        try {
          const r = await conLimite(fetch(servidor + "/aviso", { cache: "no-store" }), 3000);
          const directo = r.ok ? (await r.json()).aviso : null;
          if (directo) a = directo;
        } catch (err) { /* se usa el del sitio */ }
      }
      const hayAviso = a && a.activo && (a.titulo || a.texto);
      const claveAviso = hayAviso ? JSON.stringify([a.nivel, a.titulo, a.texto, a.hasta]) : "";
      const rec = recordatoriosDeManana(datos);
      const recPendiente = rec.lista.length && ahoraChile().hora >= 17 && (await marca(RECORDATORIO_VISTO)) !== rec.dia;
      if (recPendiente && (!hayAviso || (await marca(AVISO_VISTO)) === claveAviso)) {
        ({ titulo, cuerpo } = textoRecordatorio(rec.lista));
        tag = "recordatorio";
        url = "./#calendario";
        await marcar(RECORDATORIO_VISTO, rec.dia);
      } else if (hayAviso) {
        titulo = `${NIVEL[a.nivel] || "Urgente"}: ${a.titulo || "Aviso del colegio"}`;
        cuerpo = a.texto || cuerpo;
        await marcar(AVISO_VISTO, claveAviso);
      }
    } catch (err) { /* sin conexión: aviso genérico */ }
    await self.registration.showNotification(titulo, {
      body: cuerpo,
      icon: "icono-v3-notificacion-color-192.png",
      badge: "icono-v3-notificacion-96.png",
      tag,
      renotify: true,
      requireInteraction: tag === "aviso",
      data: { url },
    });
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const destino = new URL((e.notification.data && e.notification.data.url) || "./", self.location).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
    const w = ws.find((x) => x.url.startsWith(new URL("./", self.location).href));
    return w ? w.focus().then(() => w.navigate(destino)) : self.clients.openWindow(destino);
  }));
});
