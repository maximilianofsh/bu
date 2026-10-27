# Pruebas y guías para imprimir: especificación

Estado: **construido el 26-10-2026** (Worker `2026-10-26-pruebas`). Diferencias con esta propuesta: los archivos se guardan en la
base de datos D1 en trozos de texto base64 (no en Drive), el ciclo de UTP sale de su cargo y la matrícula la edita quien tiene «pruebas».
Pasos de activación en `servidor/GUIA.md`.

## Qué se pide

Los docentes suben sus pruebas y guías (`.docx` o `.pdf`) desde el celular o el computador. UTP las aprueba o las devuelve
con un comentario. Al aprobarse, le llegan **automáticamente** al encargado de impresiones con la cantidad de copias.

Lo que completa el docente:

- **Nivel y asignatura**, elegidos de listas predefinidas (no se escriben a mano).
- **Fecha de evaluación**.
- Tipo (prueba o guía), el archivo y un comentario opcional (doble cara, tamaño oficio…).

La **cantidad de copias** sale sola del curso y la asignatura. Cada curso tiene distinta matrícula, y los electivos
(3° y 4° medio) tienen grupos propios. La matrícula se carga en el panel (ver «Matrícula» abajo).

La sección no se enlaza desde el sitio público. Solo la ven los docentes con sesión, UTP e impresiones.

## Cómo está armado hoy (lo que se reutiliza)

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Servidor (Cloudflare Worker, plan gratis) | `servidor/notificaciones.js` | Rutas, base de datos D1 (`env.DB`), `VERSION`, cron cada minuto. Se pega a mano en Cloudflare después de cada cambio (`servidor/GUIA.md`). |
| Docentes con cuenta | Tabla D1 `profesores (correo, nombre, cursos, sal, hash…)`; rutas `/curso/*` | Los profesores ya entran a la app (`/app/` → «Mi curso») con su correo institucional, un código y su contraseña (`entrarProfe`, `quienCurso`). Sus cursos vienen de la lista que se sube en el panel. |
| Cuentas del panel con correo | Tabla `funcionarios`, `PERMISOS_PANEL`, `SECCIONES_PERMISO`, `tiene(f, …)`; en el panel `PERMISOS`, `CARGOS`, `VISTA_PERMISO` | UTP primer ciclo y UTP segundo ciclo ya tienen cuenta. Se agregan permisos nuevos igual que `propuestas`. |
| Patrón de aprobación | Noticias con aprobación: tabla `noticias_pendientes`, funciones `propuestas()` y `aprobacion()`, y en el panel `panelPropuestas()` / `panelAprobacion()` | Mismo flujo: enviada → aprobada o «necesita cambios» con comentario, avisos por correo, «Seguir editando». |
| Correos | `servidor/correo-contacto.gs` (Apps Script) vía `llamarCorreo(db, env, { tipo: "mensaje", para, asunto, cuerpo })` | Solo envía a correos `@colegiosm.cl`. Para adjuntar o guardar archivos hay que extender el script (ver «Archivos»). |
| Estudiantes por curso | Tabla `estudiantes (rut, nombre, curso, correo)` | Sirve para proponer la matrícula de cada curso. |
| Cursos y asignaturas | `data/sitio.json` → `horarios.cursos[].nombre` y las celdas de `horarios.cursos[].filas[].celdas` | Hay 20 cursos (1° básico A … 4° medio). Las celdas con « \| » son electivos paralelos, por ejemplo «Economía y Sociedad \| Geometría 3D». |

## Archivos: nunca en el repositorio

El repositorio es **público**, así que una prueba subida ahí quedaría a la vista de los estudiantes. Opciones:

1. **Recomendada: Google Drive del colegio, a través del Apps Script.** El Worker recibe el archivo y se lo pasa al script.
   El script lo guarda en una carpeta privada «Pruebas por aprobar», y al aprobarse lo mueve a «Para imprimir».
   Los permisos de esas carpetas se comparten solo con UTP e impresiones. El script ya existe y queda dentro de Google Workspace.
   Requiere una versión nueva del script con permiso de Drive (`DriveApp`), que el usuario autoriza una vez.
2. Cloudflare R2 (10 GB gratis). Hay que activarlo en la cuenta y enlazarlo al Worker.
3. D1 no sirve: cada fila admite como máximo unos 2 MB.

Límites que hay que respetar: archivos de máximo **15 MB** (el base64 crece un 33 % y el Apps Script acepta unos 50 MB por
llamada), solo `.pdf` y `.docx`, revisando el tipo por la firma del archivo (`%PDF` y `PK`).

## Diseño propuesto

### Datos (D1)

- `pruebas (id, correo_profe, nombre_profe, cursos JSON, asignatura, grupo, fecha_eval, tipo, comentario, archivo_id, archivo_nombre, copias, estado, motivo, t_envio, t_revision, revisor, t_impresa)`.
  Estados: `enviada` → `aprobada` (se envía a impresiones) → `impresa`; o `devuelta` (con `motivo`), y vuelve a `enviada` al corregirse.
- `matricula (curso, grupo, n, PRIMARY KEY (curso, grupo))`: `grupo = ""` es el curso completo; si no, el nombre del electivo.
- `estado` k=`impresiones`: `{ correo, extra }`, es decir, el correo del encargado de impresiones y las copias extra por curso (por ejemplo, +1 para el docente).

### Copias

`copias = Σ (matricula[curso, grupo] o matricula[curso, ""]) + extra`, para cada curso elegido.
Si la asignatura es un electivo, se usa el grupo de ese electivo. Si un curso no tiene matrícula cargada, se avisa y UTP
escribe el número a mano al aprobar.

### Permisos nuevos (servidor y panel)

- `pruebas`: UTP. Ve, aprueba o devuelve. Cada cuenta puede limitarse a sus niveles: primer ciclo 1°–6° básico,
  segundo ciclo 7° básico–4° medio. Propuesta: un campo `niveles` por cuenta, o dos permisos `pruebas1` y `pruebas2`.
- `impresiones`: ve la lista «Para imprimir», descarga y marca «Impresa».
- `matricula`: carga la matrícula (también la tiene el dueño con token).
- Cargo sugerido nuevo: «Encargado de impresiones» → `impresiones`.

### Rutas del Worker

- Docente (sesión de `/curso`): `POST /pruebas/subir { sesion, cursos, asignatura, grupo, fecha, tipo, comentario, nombre, datos(base64) }`,
  `POST /pruebas/mias { sesion }`, `POST /pruebas/retirar { sesion, id }`, `POST /pruebas/catalogo { sesion }`.
  El catálogo devuelve los cursos y las asignaturas del docente (de `horarios`, partiendo los electivos por « | »)
  y las copias calculadas para mostrarlas antes de enviar.
- UTP e impresiones (sesión `Panel`): `GET /panel/pruebas`, `POST /panel/pruebas/aprobar { id, copias }`,
  `/panel/pruebas/devolver { id, motivo }`, `/panel/pruebas/impresa { id }`, `GET /panel/pruebas/archivo?id=` (descarga).
- Matrícula: `GET/POST /panel/matricula`, y `POST /panel/matricula/desde-mi-curso`, que propone `n` contando la tabla `estudiantes` por curso.

### Correos (Apps Script)

- Al subir: a UTP (las cuentas con `pruebas` de ese nivel), «Prueba por aprobar: 5° básico A · Matemática · 30-10».
- Al aprobar: a impresiones, con el enlace de Drive (o el adjunto), el curso, la asignatura, la fecha de evaluación, las **copias** y el comentario.
  Al docente: «Aprobada y enviada a impresión».
- Al devolver: al docente, con el comentario.

### Pantallas

- **App (`/app/` → Mi curso, rol profesor)**: pestaña «Pruebas y guías» con el formulario (cursos, asignatura, fecha,
  tipo, archivo, comentario y la vista de «Se imprimirán N copias») y la lista «Mis envíos» con su estado.
  Funciona igual en el computador entrando a `colegiosm.cl/app/`.
- **Panel (`/admin/`)**:
  - Vista «Pruebas por aprobar» (permiso `pruebas`), como `panelAprobacion`: ver o descargar, «Aprobar y enviar a impresión» (permite ajustar copias) y «Devolver con comentario».
  - Vista «Para imprimir» (permiso `impresiones`): lista por fecha de evaluación, con descarga y «Marcar como impresa».
  - Vista «Matrícula para impresiones» (dueño o `matricula`): tabla curso × grupo editable, «Llenar desde Mi curso», importar o exportar Excel (ya existe `bajarExcel` y SheetJS en `admin/vendor/xlsx`), y las copias extra.

## Archivos que se tocan

`servidor/notificaciones.js` (tablas, rutas, permisos, `FUNCIONES`, `VERSION`), `servidor/correo-contacto.gs` (guardar,
mover o descargar en Drive; adjunto o enlace en el correo), `servidor/GUIA.md` (pasos para el usuario), `app/app.js`,
`app/index.html` y `app/app.css`, `admin/admin.js`, `admin/index.html` (botones del menú) y `admin/admin.css`.

## Preguntas abiertas (para el jueves)

1. ¿Cómo le llega a impresiones: solo por correo, también con una vista en el panel, o hay una impresora con correo propio?
2. ¿Con cuántos días de anticipación se debe subir antes de la fecha de evaluación? ¿Se bloquea o solo se avisa?
3. ¿Qué UTP aprueba cada nivel? Se asume primer ciclo 1°–6° básico y segundo ciclo 7° básico–4° medio.
4. ¿Copias extra por curso (docente, PIE, NEE)?
5. ¿Guardar en Drive (recomendado) o en R2?
6. ¿Una prueba puede ir a varios cursos del mismo nivel a la vez? Se asume que sí (5° A y 5° B con un solo envío).

## Cómo probar

En este proyecto se probó cada función con el Worker en Node (D1 simulado con `node:sqlite`, `fetch` simulado para GitHub y el
Apps Script) y Playwright con Chromium contra `python3 -m http.server`. No hay pruebas en el repositorio. Después de cambiar
el Worker, el usuario debe pegarlo en Cloudflare y revisar `/estado` (versión nueva). Después de cambiar el `.gs`, debe
publicar una versión nueva del script.
