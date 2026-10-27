/* ==========================================================
   Calendario en formato iCalendar (.ics), el que entienden Google Calendar, iPhone y Outlook.
   - En el sitio: window.ICS.archivo([evento]) arma el archivo de un solo evento («Agregar a mi calendario»).
   - En la acción de GitHub: .github/scripts/calendario-ics.js lo usa para escribir
     calendario/colegio.ics con todos los eventos (el que se «suscribe» en el celular).
   Las horas se entienden como hora de Chile.
   ========================================================== */
(function (raiz, fabrica) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = fabrica();
  else raiz.ICS = fabrica();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const ZONA = "America/Santiago";
  const NOMBRE = "Colegio San Martín Iquique";
  const TIPOS = { evento: "Actividad", reunion: "Reunión", acto: "Acto", evaluacion: "Evaluación", feriado: "Feriado", vacaciones: "Vacaciones" };

  const pad = (n) => String(n).padStart(2, "0");
  const valido = (e) => e && e.titulo && /^\d{4}-\d{2}-\d{2}$/.test(e.fecha || "");
  const fin = (e) => (e.fin && /^\d{4}-\d{2}-\d{2}$/.test(e.fin) && e.fin >= e.fecha ? e.fin : e.fecha);
  const compacta = (f) => f.replace(/-/g, "");
  // Día siguiente (en .ics el final de un evento de día completo no se incluye)
  const siguiente = (f) => {
    const d = new Date(Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10) + 1));
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
  };
  // «19:00», «19.00 hrs», «08:00 a 13:00», «8:30-10:00» → [inicio, término]
  const horas = (h) => {
    const m = String(h || "").match(/(\d{1,2})[:.](\d{2})/g);
    if (!m) return null;
    const hhmm = (s) => { const [a, b] = s.split(/[:.]/).map(Number); return a < 24 && b < 60 ? `${pad(a)}${pad(b)}00` : null; };
    const ini = hhmm(m[0]);
    if (!ini) return null;
    let ter = m[1] ? hhmm(m[1]) : null;
    if (!ter || ter <= ini) ter = pad(Math.min(+ini.slice(0, 2) + 1, 23)) + ini.slice(2, 4) + "00";
    return [ini, ter];
  };
  const escapar = (s) => String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  // Líneas de máximo 75 bytes (regla del formato)
  const doblar = (linea) => {
    const bytes = (s) => (typeof TextEncoder !== "undefined" ? new TextEncoder().encode(s).length : Buffer.byteLength(s));
    if (bytes(linea) <= 75) return linea;
    const partes = [];
    let actual = "";
    for (const c of linea) {
      if (bytes(actual + c) > (partes.length ? 74 : 75)) { partes.push(actual); actual = ""; }
      actual += c;
    }
    partes.push(actual);
    return partes.join("\r\n ");
  };
  // Identificador estable del evento (mismo título y fecha → mismo evento, así no se duplica al actualizar)
  const uid = (e) => {
    let h = 5381;
    for (const c of `${e.fecha}|${e.titulo}`) h = ((h * 33) ^ c.codePointAt(0)) >>> 0;
    return `${e.fecha}-${h.toString(36)}@colegiosm.cl`;
  };
  const absoluta = (base, ruta) => (!ruta ? "" : /^https?:\/\//i.test(ruta) ? ruta : base ? base.replace(/\/?$/, "/") + String(ruta).replace(/^\.?\//, "") : "");

  function vevento(e, base, sello) {
    const hs = fin(e) === e.fecha ? horas(e.hora) : null;
    const enlace = absoluta(base, e.enlace);
    const desc = [TIPOS[e.tipo] || "", e.hora && !hs ? `Hora: ${e.hora}` : "", e.descripcion || "", enlace ? `Más información: ${enlace}` : ""].filter(Boolean).join("\n");
    const l = ["BEGIN:VEVENT", `UID:${uid(e)}`, `DTSTAMP:${sello}`];
    if (hs) l.push(`DTSTART;TZID=${ZONA}:${compacta(e.fecha)}T${hs[0]}`, `DTEND;TZID=${ZONA}:${compacta(e.fecha)}T${hs[1]}`);
    else l.push(`DTSTART;VALUE=DATE:${compacta(e.fecha)}`, `DTEND;VALUE=DATE:${siguiente(fin(e))}`);
    l.push(`SUMMARY:${escapar(e.titulo)}`);
    if (desc) l.push(`DESCRIPTION:${escapar(desc)}`);
    if (e.lugar) l.push(`LOCATION:${escapar(e.lugar)}`);
    if (enlace) l.push(`URL:${escapar(enlace)}`);
    l.push(`CATEGORIES:${escapar(TIPOS[e.tipo] || "Actividad")}`);
    l.push("TRANSP:TRANSPARENT", "END:VEVENT");
    return l;
  }

  // eventos: lista de data/sitio.json → texto del archivo .ics
  function archivo(eventos, opciones) {
    const o = opciones || {};
    const ahora = new Date();
    const sello = `${ahora.getUTCFullYear()}${pad(ahora.getUTCMonth() + 1)}${pad(ahora.getUTCDate())}T${pad(ahora.getUTCHours())}${pad(ahora.getUTCMinutes())}${pad(ahora.getUTCSeconds())}Z`;
    const l = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Colegio San Martin Iquique//Calendario escolar//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH"];
    if (o.suscripcion) {
      l.push(`X-WR-CALNAME:${escapar(NOMBRE)}`, `X-WR-CALDESC:${escapar("Calendario escolar: reuniones, evaluaciones, actos y feriados.")}`,
        `X-WR-TIMEZONE:${ZONA}`, "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H");
    }
    (eventos || []).filter(valido).forEach((e) => l.push(...vevento(e, o.base, sello)));
    l.push("END:VCALENDAR");
    return l.map(doblar).join("\r\n") + "\r\n";
  }

  // Enlace para agregar un solo evento en Google Calendar (sin descargar nada)
  function google(e, base) {
    const hs = fin(e) === e.fecha ? horas(e.hora) : null;
    const fechas = hs ? `${compacta(e.fecha)}T${hs[0]}/${compacta(e.fecha)}T${hs[1]}` : `${compacta(e.fecha)}/${siguiente(fin(e))}`;
    const enlace = absoluta(base, e.enlace);
    const p = new URLSearchParams({ action: "TEMPLATE", text: e.titulo, dates: fechas, ctz: ZONA });
    const det = [e.descripcion || "", enlace].filter(Boolean).join("\n\n");
    if (det) p.set("details", det);
    if (e.lugar) p.set("location", e.lugar);
    return "https://calendar.google.com/calendar/render?" + p.toString();
  }

  return { archivo, google, valido };
});
