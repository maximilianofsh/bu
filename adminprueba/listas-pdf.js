/* Lee una lista de curso en PDF (N°, Run, A.P, A.M, Nombres…) y arma el correo institucional:
   apellido1.apellido2.primernombre@colegiosm.cl. Todo se hace en este navegador: el PDF no se sube a ningún lado. */
(function (raiz) {
  const DOMINIO = "colegiosm.cl";
  const RUT = /^\d{1,3}(?:\.?\d{3}){2}-[\dkK]$|^\d{7,9}-[\dkK]$/;
  const FECHA = /^\d{1,2}\/\d{1,2}\/\d{4}$/;
  const PARTICULAS = new Set(["de", "del", "la", "las", "los", "y", "da", "do", "dos", "das", "van", "von", "di"]);
  const ORDINALES = { primero: 1, primer: 1, segundo: 2, tercero: 3, tercer: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, "séptimo": 7, octavo: 8 };

  // «MILAGROS JEANETTE» → «Milagros Jeanette»; «DE LA CRUZ» → «de la Cruz»
  const capitalizar = (s) => String(s || "").toLowerCase().split(/\s+/).filter(Boolean)
    .map((p, i) => (i && PARTICULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
  // Para el correo: minúsculas, sin tildes, ñ → n, sin espacios ni signos
  const plano = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");

  function correoDe(ap, am, nombres) {
    const avisos = [];
    const n1 = String(nombres || "").trim().split(/\s+/)[0] || "";
    if (!ap) avisos.push("Falta el apellido paterno");
    if (!am) avisos.push("Falta el apellido materno");
    if (!n1) avisos.push("Falta el nombre");
    if (/\s/.test(String(ap || "").trim()) || /\s/.test(String(am || "").trim())) avisos.push("Apellido compuesto: revisa cómo quedó el correo");
    if (/[-']/.test(ap + am + n1)) avisos.push("Tiene guion o apóstrofo: revisa el correo");
    const partes = [plano(ap), plano(am), plano(n1)].filter(Boolean);
    return { correo: partes.length ? partes.join(".") + "@" + DOMINIO : "", avisos };
  }

  // «Lista de alumnos Tercero Medio A» → «3° medio A»
  function cursoDelTitulo(texto) {
    const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const m = /(primero|primer|segundo|tercero|tercer|cuarto|quinto|sexto|septimo|octavo|[1-8])\s*(?:°|º|o)?\s*(medio|basico)\s*([a-z])?\b/.exec(t);
    if (!m) return "";
    const num = ORDINALES[m[1]] || +m[1];
    return `${num}° ${m[2] === "medio" ? "medio" : "básico"}${m[3] ? " " + m[3].toUpperCase() : ""}`;
  }

  // Filas del PDF agrupando los textos que están a la misma altura
  async function filasDelPdf(pdfjs, datos) {
    const doc = await pdfjs.getDocument({ data: datos }).promise;
    const filas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const items = (await (await doc.getPage(p)).getTextContent()).items.filter((it) => it.str && it.str.trim());
      const porAltura = [];
      for (const it of items) {
        const y = it.transform[5];
        let fila = porAltura.find((f) => Math.abs(f.y - y) < 3);
        if (!fila) porAltura.push(fila = { y, items: [] });
        fila.items.push({ x: it.transform[4], s: it.str.trim() });
      }
      porAltura.sort((a, b) => b.y - a.y).forEach((f) => filas.push(f.items.sort((a, b) => a.x - b.x)));
    }
    return filas;
  }

  // Convierte las filas en estudiantes. Entre el RUN y el número de matrícula vienen A.P, A.M y Nombres:
  // las columnas se aprenden de las filas que traen exactamente esos tres textos.
  function estudiantesDe(filas) {
    const titulo = filas.slice(0, 6).map((f) => f.map((i) => i.s).join(" ")).find((t) => /lista|curso|medio|b[aá]sico/i.test(t) && cursoDelTitulo(t)) || "";
    const curso = cursoDelTitulo(titulo);
    const datos = filas.map((f) => {
      const iRut = f.findIndex((i) => RUT.test(i.s.replace(/\s/g, "")));
      if (iRut < 0) return null;
      let fin = f.length;
      if (fin > iRut + 1 && FECHA.test(f[fin - 1].s)) fin--;
      if (fin > iRut + 1 && /^\d{1,5}$/.test(f[fin - 1].s)) fin--;
      return { n: iRut > 0 && /^\d{1,3}$/.test(f[iRut - 1].s) ? +f[iRut - 1].s : null, rut: f[iRut].s.replace(/\s/g, ""), medio: f.slice(iRut + 1, fin) };
    }).filter(Boolean);
    const conTres = datos.filter((d) => d.medio.length === 3);
    const mediana = (l) => { const o = l.slice().sort((a, b) => a - b); return o[Math.floor(o.length / 2)]; };
    const cols = conTres.length ? [0, 1, 2].map((k) => mediana(conTres.map((d) => d.medio[k].x))) : null;
    return { curso, titulo, estudiantes: datos.map((d) => {
      let [ap, am, nombres] = ["", "", ""];
      const avisos = [];
      if (d.medio.length === 3) [ap, am, nombres] = d.medio.map((i) => i.s);
      else if (cols) {
        const partes = ["", "", ""];
        d.medio.forEach((i) => { const k = cols.reduce((m, c, j) => (i.x >= c - 6 ? j : m), 0); partes[k] = (partes[k] + " " + i.s).trim(); });
        [ap, am, nombres] = partes;
        avisos.push("La fila venía distinta: revisa nombre y apellidos");
      } else { nombres = d.medio.map((i) => i.s).join(" "); avisos.push("No pude separar nombre y apellidos"); }
      const c = correoDe(ap, am, nombres);
      return { n: d.n, rut: d.rut, ap: capitalizar(ap), am: capitalizar(am), nombres: capitalizar(nombres), nombre: capitalizar([nombres, ap, am].filter(Boolean).join(" ")),
        correo: c.correo, curso, avisos: avisos.concat(c.avisos) };
    }) };
  }

  // Marca los correos repetidos (por ejemplo, hermanos con el mismo primer nombre)
  function marcarRepetidos(lista) {
    const vistos = {};
    lista.forEach((e) => { if (e.correo) (vistos[e.correo] = vistos[e.correo] || []).push(e); });
    lista.forEach((e) => { e.avisos = e.avisos.filter((a) => !/repetido/.test(a)); if (e.correo && vistos[e.correo].length > 1) e.avisos.push("Correo repetido con otro estudiante"); });
    return lista;
  }

  raiz.ListasPdf = { filasDelPdf, estudiantesDe, correoDe, cursoDelTitulo, capitalizar, plano, marcarRepetidos, DOMINIO };
})(typeof window !== "undefined" ? window : globalThis);
