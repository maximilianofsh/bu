/* Prueba: listas de curso en PDF → tabla con nombre y correo institucional (y Excel para «Mi curso»).
   Todo ocurre en este navegador; no se guarda nada en el sitio ni en el servidor. */
import * as pdfjs from "../admin/vendor/pdfjs/pdf.min.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = new URL("../admin/vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;

const L = window.ListasPdf;
const $ = (s) => document.querySelector(s);
let lista = [];
let cursosColegio = [];
fetch("../data/sitio.json", { cache: "no-store" }).then((r) => r.json())
  .then((d) => { cursosColegio = ((d.horarios && d.horarios.cursos) || []).map((c) => c.nombre).filter(Boolean); }).catch(() => {});

let toastTimer;
function toast(msg, tipo = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast is-on " + (tipo ? "is-" + tipo : "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-on"), tipo === "error" ? 7000 : 3500);
}

// «3° medio A» → el curso como está escrito en «Horarios» («3° medio» si en el colegio hay uno solo)
const clave = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[°º]/g, "")
  .replace(/basico|basica/g, "b").replace(/medio|media/g, "m").replace(/[^a-z0-9]/g, "");
function cursoDelColegio(curso) {
  if (!curso || !cursosColegio.length) return curso;
  const k = clave(curso);
  const exacto = cursosColegio.find((c) => clave(c) === k);
  if (exacto) return exacto;
  const mismos = cursosColegio.filter((c) => clave(c).slice(0, 2) === k.slice(0, 2));
  return mismos.length === 1 ? mismos[0] : curso;
}

async function leer(archivos) {
  const pdfs = [...archivos].filter((f) => /\.pdf$/i.test(f.name) || f.type === "application/pdf");
  if (!pdfs.length) return estado("Elige un archivo PDF.", true);
  const avisos = [];
  for (const f of pdfs) {
    estado(`Leyendo ${f.name}…`);
    try {
      const r = L.estudiantesDe(await L.filasDelPdf(pdfjs, new Uint8Array(await f.arrayBuffer())));
      if (!r.estudiantes.length) { avisos.push(`${f.name}: no encontré estudiantes (¿es una lista con columna Run?)`); continue; }
      const curso = cursoDelColegio(r.curso);
      r.estudiantes.forEach((e) => {
        e.curso = curso;
        if (!curso) e.avisos.push("No encontré el curso en el título del PDF");
        e.archivo = f.name;
      });
      // Si se vuelve a subir el mismo curso, se reemplaza (no se duplica)
      const ruts = new Set(r.estudiantes.map((e) => e.rut));
      lista = lista.filter((e) => !ruts.has(e.rut)).concat(r.estudiantes);
    } catch (e) {
      avisos.push(`${f.name}: no se pudo leer (${e.message || e})`);
    }
  }
  L.marcarRepetidos(lista);
  pintar();
  estado(avisos.join(" · "), !!avisos.length);
}

function estado(texto, error = false) {
  const e = $("#estado");
  e.textContent = texto || "";
  e.classList.toggle("is-error", !!error);
}

function pintar() {
  $("#resultado").hidden = !lista.length;
  const cursos = [...new Set(lista.map((e) => e.curso).filter(Boolean))];
  const revisar = lista.filter((e) => e.avisos.length).length;
  $("#resumen").textContent = `${lista.length} ${lista.length === 1 ? "estudiante" : "estudiantes"}` + (cursos.length ? ` · ${cursos.join(", ")}` : "")
    + (revisar ? ` · ${revisar} para revisar` : " · todo en orden");
  const cuerpo = $("#filas");
  cuerpo.replaceChildren(...lista.map((e) => {
    const tr = document.createElement("tr");
    if (e.avisos.length) tr.className = "is-revisar";
    const celda = (texto, clase) => { const td = document.createElement("td"); td.textContent = texto ?? ""; if (clase) td.className = clase; return td; };
    const editable = (campo, etiqueta) => {
      const td = document.createElement("td");
      const i = document.createElement("input");
      i.value = e[campo]; i.setAttribute("aria-label", `${etiqueta} de ${e.nombre}`); i.spellcheck = false;
      i.addEventListener("change", () => {
        e[campo] = i.value.trim();
        if (campo === "correo") {
          e.correo = e.correo.toLowerCase();
          e.avisos = e.avisos.filter((a) => !/correo/i.test(a) || /repetido/.test(a));
          if (e.correo && !/^[a-z0-9._-]+@colegiosm\.cl$/.test(e.correo)) e.avisos.push("El correo no es @colegiosm.cl o tiene signos raros");
        }
        L.marcarRepetidos(lista); pintar();
      });
      td.append(i);
      return td;
    };
    tr.append(celda(e.n, "prueba__n"), editable("nombre", "Nombre"), editable("correo", "Correo"), celda(e.rut, "prueba__rut"), celda(e.curso, "prueba__curso"),
      celda(e.avisos.length ? e.avisos.join(". ") : "✓", "prueba__aviso" + (e.avisos.length ? "" : " is-ok")));
    return tr;
  }));
}

$("#archivos").addEventListener("change", (ev) => { leer(ev.target.files); ev.target.value = ""; });
const zona = $("#zona");
zona.addEventListener("dragover", (ev) => { ev.preventDefault(); zona.classList.add("is-encima"); });
zona.addEventListener("dragleave", () => zona.classList.remove("is-encima"));
zona.addEventListener("drop", (ev) => { ev.preventDefault(); zona.classList.remove("is-encima"); leer(ev.dataTransfer.files); });

// Formato pedido: Nombre | Correo | Curso | RUT (el RUT lo pide «Mi curso» y con él también entran los apoderados)
const rutConPuntos = (r) => { const m = /^(\d+)-([\dkK])$/.exec(String(r).replace(/\./g, "")); return m ? m[1].replace(/\B(?=(\d{3})+(?!\d))/g, ".") + "-" + m[2].toUpperCase() : r; };
$("#bajar").addEventListener("click", () => {
  const XLSX = window.XLSX;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([["Nombre", "Correo", "Curso", "RUT"]].concat(lista.map((e) => [e.nombre, e.correo, e.curso, rutConPuntos(e.rut)])));
  ws["!cols"] = [{ wch: 38 }, { wch: 42 }, { wch: 14 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, ws, "Estudiantes");
  const cursos = [...new Set(lista.map((e) => e.curso).filter(Boolean))];
  XLSX.writeFile(wb, "estudiantes-" + (cursos.length === 1 ? cursos[0].replace(/°/g, "").replace(/\s+/g, "-").toLowerCase() : "cursos") + ".xlsx");
});
$("#copiar").addEventListener("click", async () => {
  const texto = ["Nombre y apellido\tCorreo institucional"].concat(lista.map((e) => `${e.nombre}\t${e.correo}`)).join("\n");
  try { await navigator.clipboard.writeText(texto); toast("Tabla copiada: pégala en Excel o Google Sheets.", "ok"); }
  catch (e) { toast("No se pudo copiar. Usa «Descargar Excel».", "error"); }
});
$("#limpiar").addEventListener("click", () => { lista = []; pintar(); estado(""); });
