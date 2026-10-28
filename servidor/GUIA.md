# Notificaciones de la app: cómo activar el servidor

La app del colegio (colegiosm.cl/app) muestra el aviso urgente, los horarios y el calendario.
Para que **los celulares reciban una notificación** cuando se enciende un aviso en el panel, hace falta
un pequeño servidor gratuito en Cloudflare. Se configura **una sola vez** (unos 15 minutos).

> No hay que mover el dominio colegiosm.cl a Cloudflare ni tocar el DNS. El correo no se ve afectado.

## 1. Crear la cuenta
1. Entra a <https://dash.cloudflare.com/sign-up> y crea una cuenta gratis (puede ser con el correo del colegio).
2. La primera vez que entres a **Workers y Pages**, Cloudflare te pedirá un **subdominio** de `workers.dev`.
   Elige uno neutro, por ejemplo `colegiosm`. **Ese nombre queda a la vista en la dirección del servidor**,
   así que no uses tu nombre.

## 2. Crear el servidor
1. Menú izquierdo: **Compute (Workers) → Workers y Pages → Crear → Worker** («Comenzar con Hello World»).
2. Nombre: `avisos-colegio`. Presiona **Implementar** (Deploy).
3. Presiona **Editar código**. Borra todo lo que aparece y pega el contenido completo del archivo
   [`servidor/notificaciones.js`](notificaciones.js) de este repositorio.
4. Presiona **Implementar** (Deploy).

## 3. Crear la base de datos
1. Menú izquierdo: **Almacenamiento y bases de datos → D1 → Crear base de datos**.
2. Nombre: `avisos`. Presiona **Crear**.

## 4. Unir el servidor con la base de datos
1. Vuelve a **Workers y Pages → avisos-colegio → Configuración → Enlaces (Bindings) → Agregar**.
2. Elige **Base de datos D1**. Nombre de la variable: `DB` (en mayúsculas). Base de datos: `avisos`.
3. Guarda / **Implementar**.

## 5. Revisar cada minuto
1. En **avisos-colegio → Configuración → Activadores (Triggers) → Eventos Cron → Agregar**.
2. Elige «cada minuto» (expresión `* * * * *`) y guarda.

## 6. Conectar el panel
1. Copia la dirección del servidor, que aparece arriba en la página del worker. Se ve así:
   `https://avisos-colegio.colegiosm.workers.dev`
2. En el panel **/admin → Aviso urgente → App del colegio**, pégala en «Dirección del servidor de notificaciones».
3. Debe aparecer «Servidor funcionando: 0 celulares…». Presiona **Guardar y publicar**.

## Probar
1. En tu celular abre **colegiosm.cl/app**, instálala y toca **Activar notificaciones**.
   - **Android:** funciona desde Chrome, instalada o no.
   - **iPhone:** primero «Compartir → Agregar a inicio» y abrir la app desde el ícono (iOS 16.4 o más nuevo).
2. En el panel enciende un aviso (con «Notificación a la app: Sí») y publícalo. En uno o dos minutos llega la notificación.
3. Apaga el aviso cuando termine la prueba.

## Pantalla «Inspectoría» (publicar avisos sin entrar al panel)
En la app, al pie de **Avisos**, está el enlace **«Acceso Inspectoría»**. Quien tenga la clave puede
publicar o apagar el aviso desde el celular, sin token de GitHub. Se configura una sola vez:

1. **Actualizar el código del servidor:** en Cloudflare, **avisos-colegio → Editar código**, borra todo,
   pega de nuevo el contenido completo de [`servidor/notificaciones.js`](notificaciones.js) y presiona **Implementar**.
2. **Crear un token solo para el servidor** en GitHub: *Settings → Developer settings → Personal access tokens →
   Fine-grained tokens → Generate new token*.
   - Nombre: `servidor-avisos`. Vencimiento: 1 año (anótalo; al vencer hay que crear otro y pegarlo aquí).
   - **Resource owner:** `colegiosanmartin`. **Only select repositories:** `sitio-colegio-san-martin`.
   - **Permissions → Contents: Read and write.** Nada más.
   - Copia el token. **No lo pegues en el panel ni en el chat**: solo en Cloudflare (paso 3).
3. **Guardar los dos secretos** en Cloudflare: **avisos-colegio → Configuración → Variables y secretos → Agregar**.
   - Tipo **Secreto**, nombre `GITHUB_TOKEN`, valor: el token del paso 2.
   - Tipo **Secreto**, nombre `CLAVE_INSPECTORIA`, valor: la clave que usará la inspectora
     (mínimo 10 caracteres, que no sea fácil de adivinar).
   - Presiona **Implementar** (Deploy).
4. **Probar:** en el celular, abre la app → Avisos → «Acceso Inspectoría», escribe la clave y entra.
   Aparece la pestaña **Publicar** y el celular queda con acceso abierto (90 días).

**Seguridad:**
- El token y la clave quedan solo en Cloudflare: no viajan al celular ni al sitio. En el celular queda solo una «sesión».
- Tras 5 claves equivocadas, el servidor hace esperar 15 minutos (y más si se sigue intentando).
- **Si se pierde el celular o cambia la persona:** cambia `CLAVE_INSPECTORIA` en Cloudflare. Todas las sesiones abiertas se cierran al tiro.
- Los cambios quedan en el historial del repositorio como «Aviso publicado desde la app (Inspectoría)».

## Estadísticas de visitas y formulario de Contacto
Las dos usan este mismo servidor. Basta con **actualizar el código** (avisos-colegio → Editar código, pegar
`servidor/notificaciones.js` completo e Implementar). Desde ese momento:
- Cada página del sitio suma una visita (sin cookies ni datos personales). Se ven en el panel: **Estadísticas de visitas**.
- Los mensajes del formulario de Contacto se guardan y se ven en el panel: **Mensajes de contacto**
  (solo el dueño y los administradores trabajadores). Se borran solos al año.

### Recibir los mensajes de Contacto en un correo del colegio (opcional)
Se hace con un pequeño script de Google, desde una cuenta del colegio (el correo sale desde esa cuenta):
1. Con la cuenta del colegio, entra a <https://script.google.com> → **Nuevo proyecto**.
2. Borra lo que aparece y pega el contenido de [`servidor/correo-contacto.gs`](correo-contacto.gs).
3. Cambia `PARA` por el correo que recibirá los mensajes, y `CLAVE` por una clave larga inventada.
4. **Implementar → Nueva implementación** → tipo **Aplicación web**:
   - Ejecutar como: **Yo**. Quién tiene acceso: **Cualquier usuario**.
   - Presiona Implementar, acepta los permisos (Google avisa que la app no está verificada: «Configuración avanzada → Ir al proyecto»).
   - Copia la **URL de la aplicación web** (termina en `/exec`).
5. En Cloudflare, avisos-colegio → Configuración → **Variables y secretos**, agrega dos de tipo **Secreto**:
   - `CORREO_URL`: la URL del paso 4.
   - `CORREO_CLAVE`: la misma clave del paso 3.
6. Envía un mensaje de prueba desde colegiosm.cl/contacto. En el panel, el mensaje dirá «también llegó al correo».

## Apps del panel en el celular: Panel, Noticias UTP e Inspectoría
Las tres se instalan desde el navegador del celular («Agregar a pantalla de inicio»):
- **Panel del colegio**: colegiosm.cl/admin. Entra con el token de GitHub; en la app instalada se recuerda 30 días.
- **Noticias UTP**: colegiosm.cl/utp. Entra con usuario y contraseña, sin GitHub. Solo escribe, programa, edita y borra noticias.
- **Inspectoría**: colegiosm.cl/inspectoria. Entra con la clave de Inspectoría. Solo publica o apaga el aviso urgente.

Noticias UTP e Inspectoría usan este servidor y su secreto `GITHUB_TOKEN` (el mismo token «servidor-avisos»
de la sección de Inspectoría: solo el repositorio del sitio, permiso *Contents: Read and write*).
Después de actualizar el código del servidor, el dueño crea las cuentas UTP en el panel:
**Usuarios y permisos → Cuentas de la app «Noticias UTP»**. Las contraseñas se guardan solo como huella
(no se pueden leer); si alguien la olvida, se le pone una nueva desde ahí.

## Recordatorios del calendario

La tarde anterior (desde las 18:00) a un evento marcado con 🔔 «Recordatorio en la app» en el panel
(«Calendario escolar»), el servidor avisa a los celulares con la app. No hay que configurar nada más:
solo tener pegada la última versión de `notificaciones.js`. Para saber si ya está, abre
`/estado` en la dirección del servidor: debe decir `"version": "2026-10-17-recordatorios"` y, después
del primer envío, `ultimoRecordatorio` con la fecha y cuántos celulares lo recibieron.

## «Mi curso» en la app (calendario de cada curso)

Apoderados y estudiantes entran con el RUT o el correo institucional del estudiante y reciben un
código de 6 dígitos en ese correo. Los profesores reciben un código la primera vez y crean su
contraseña. Para que funcione:

1. Vuelve a pegar `servidor/notificaciones.js` en Cloudflare («Editar código» → «Implementar»).
   En `/estado` debe aparecer `"version": "2026-10-17-mi-curso"`.
2. Los códigos los envía el mismo script de Google del formulario de Contacto
   (`servidor/correo-contacto.gs`, que ahora también envía códigos):
   - Si **ya lo tenías**: en script.google.com reemplaza todo el código por el nuevo (deja tu `PARA` y tu
     `CLAVE`), guarda y ve a «Implementar» → «Gestionar implementaciones» → lápiz → «Versión: nueva» → «Implementar».
     La dirección no cambia.
   - Si **no lo tenías**: sigue la sección «Estadísticas de visitas y formulario de Contacto» de esta guía (crea `CORREO_URL` y `CORREO_CLAVE`).
   - El script debe estar en una cuenta @colegiosm.cl: los correos salen desde esa cuenta, y solo
     se envían a correos del dominio `DOMINIO` (por defecto colegiosm.cl).
3. En el panel, sección «Mi curso (app)», sube la lista de estudiantes y la de profesores (hay plantillas).

Al terminar el año, en esa misma sección usa «Cierre de año» para pasar a todos de curso.

## Panel SM con el correo del colegio (sin GitHub)

Directora, Inspectoría, UTP, Convivencia, la sostenedora y quien tú quieras entran a colegiosm.cl/admin con su correo @colegiosm.cl y una contraseña que eligen ellos. No necesitan cuenta de GitHub ni token.

Necesita lo mismo que «Mi curso»: el secreto `GITHUB_TOKEN`, el script de Google publicado y los secretos `CORREO_URL` y `CORREO_CLAVE`. Si ya cambiaste el script, publica una **versión nueva**: el correo del código ahora dice «Panel SM».

1. Pega la versión nueva de `servidor/notificaciones.js` en Cloudflare («Editar código» → «Implementar»). En `/estado` debe aparecer `"version": "2026-10-20-seguridad"` (o una posterior).
2. Entra al panel con tu token, ve a **Usuarios y permisos → Cuentas con correo del colegio** y agrega a cada persona.
   - Escribe su nombre y su correo, y elige el cargo: se marcan solos sus permisos, y puedes ajustarlos.
3. Avísales que entren a colegiosm.cl/admin, escriban su correo y toquen **«Primera vez u olvidé mi contraseña»**. Les llega un código, lo escriben y crean su contraseña (mínimo 10 caracteres).

Qué conviene saber:

- **Contraseñas.** Se guardan solo como huella cifrada (PBKDF2 con una sal distinta para cada cuenta): nadie puede verlas, ni tú ni quien administra Cloudflare.
- **Permisos.** Puedes cambiarlos o quitar el acceso cuando quieras, y se aplica al tiro. Con «Cerrar las sesiones que tenga abiertas» se le cierra la sesión en todos sus equipos.
- **Quién guarda.** El servidor guarda en el sitio solo lo que cada cuenta puede cambiar. El cambio queda firmado como «App del colegio» con el nombre de la persona, y se ve en «Actividad de estas cuentas».
- **Seguridad.** Tras 8 contraseñas equivocadas (aunque vengan de distintas conexiones) la cuenta se bloquea un rato; la persona puede entrar igual con «Primera vez u olvidé mi contraseña». Cada vez que alguien entra a una cuenta desde un equipo nuevo, le llega un correo avisándole. El código del sitio (HTML, CSS, scripts) y los usuarios de GitHub solo se cambian entrando con el token.
- **Autoría.** Las noticias nuevas que publica una cuenta con correo (o de la app UTP) muestran «Por Nombre, Cargo». Las que publica el dueño con el token no muestran autor.
- **Correo de bienvenida.** Al crear una cuenta puedes enviarle un correo con los pasos para entrar y lo que puede hacer, o después con «Enviar instrucciones». Sale desde la cuenta de Google que publicó el script; para que salga desde contacto@colegiosm.cl, publica el script con esa cuenta. Las respuestas siempre llegan a contacto@colegiosm.cl.
- **Asignar mensajes de contacto.** En «Mensajes de contacto», «Asignar» envía un mensaje a una o varias cuentas (por ejemplo Convivencia Escolar o UTP de ambos ciclos). Esas personas lo ven en su panel y, si dejas marcado «Reenviarlo también a su correo», les llega a su correo institucional; al responder desde ahí, la respuesta le llega directo a quien escribió. Ellas lo marcan como atendido y tú lo ves. Solo quien tiene el permiso «Mensajes de contacto» (o el token) ve todos, asigna y borra. Para que la respuesta llegue a quien escribió, publica la versión nueva de correo-contacto.gs.
- **Si el código no llega.** Abre `/estado` y mira `correo`: ahí aparece la causa del último envío fallido.

## Noticias con aprobación (CGPA, CEAL)

1. Pega la versión nueva de `servidor/notificaciones.js` en Cloudflare. En `/estado` debe aparecer `"version": "2026-10-24-aprobacion"` (o una posterior).
2. En el panel, con el token: «Usuarios y permisos» → cuenta nueva con el cargo «CGPA (asesora)» o «CEAL (asesor/a)» (permiso «Noticias con aprobación»).
3. En «Noticias» → «Por aprobar», escribe tu correo del colegio para recibir el aviso de cada noticia nueva.
   Desde ahí la apruebas, la editas antes de publicarla o pides cambios (a quien la envió le llega un correo).

## Registro de cambios para el KPI

1. Pega la versión nueva de `servidor/notificaciones.js` en Cloudflare («Editar código» → «Implementar»).
   En `/estado` debe aparecer `"version": "2026-10-24-kpi"` y `registroKpi` con la fecha hasta la que va.
2. La primera vez revisa el historial desde el 9 de octubre de 2026, de a poco (unos 70 minutos). Después
   anota cada cambio un minuto después de hacerse: quién, cuándo, qué tipo y el detalle.
3. Se descarga en el panel, entrando con el token de GitHub: «Estadísticas de visitas» → «Descargar registro de KPI».
   Queda solo en la base de datos del servidor (no en el sitio público) y se guarda 3 años.

## Pruebas y guías para imprimir (profesores → UTP → impresiones)

1. Pega la versión nueva de `servidor/notificaciones.js` en Cloudflare. En `/estado` debe aparecer `"version": "2026-10-26-pruebas"` (o una posterior).
   No hay que cambiar el Apps Script: los avisos usan el mismo envío de correos.
2. En «Usuarios y permisos», marca «Pruebas y guías (UTP)» en las cuentas de UTP primer ciclo y segundo ciclo
   (cada una recibe los avisos de su ciclo, según su cargo), y crea la cuenta del encargado de impresiones
   con el cargo «Encargado de impresiones» (permiso «Impresiones»).
3. UTP, en el panel → «Pruebas y guías» → «Matrícula y copias»: «Llenar desde las listas de Mi curso», escribe los
   estudiantes de cada electivo de 3° y 4° medio, las copias extra por curso y los días hábiles de anticipación, y «Guardar matrícula».
4. Los profesores entran a la app (`/app/` → «Mi curso», también desde el computador) → «Pruebas para imprimir».
   Deben estar en la lista de profesores de «Mi curso (app)».

Los archivos (PDF o Word, hasta 15 MB) se guardan en la base de datos del servidor, nunca en el sitio público,
y se borran 30 días después de la fecha de evaluación. Si el espacio de pruebas llega a 300 MB, el servidor pide esperar.

## Apoderados en «Mi curso» (con su propio correo)

1. Pega la versión nueva de `servidor/notificaciones.js` en Cloudflare. En `/estado` debe aparecer `"version": "2026-10-27-apoderados"` (o una posterior).
2. Pega la versión nueva de `servidor/correo-contacto.gs` en script.google.com (deja tu CLAVE como estaba) y publica
   una versión nueva: Implementar → Gestionar implementaciones → editar → Versión: «Nueva versión» → Implementar.
   Sin esto no llegan los códigos a los Gmail de los apoderados.
3. El apoderado entra a la app → «Mi curso» → «Soy apoderado» → «Registrarme»: escribe el correo institucional del
   estudiante, recibe un código ahí, y después confirma su propio correo con otro código. Con más hijos usa «+ Agregar otro estudiante».
4. Si no tiene acceso al correo institucional del estudiante: en el panel → «Mi curso (app)» → busca al estudiante →
   «Código para apoderado» y entrégaselo en persona (sirve una vez y vence en 30 días).

## Pruebas más fáciles y avisos a los profesores (octubre 2026)

1. Pega la versión nueva de `servidor/notificaciones.js` en Cloudflare. En `/estado` debe aparecer `"version": "2026-10-28-avisos-profes"` (o una posterior).
   Crea solas sus tablas nuevas la primera vez; no hay secretos nuevos.
2. Con eso:
   - Los profesores pueden **usar de nuevo** una prueba ya enviada para otro curso, sin volver a subir el archivo.
   - Si el profesor toca «Activar avisos» en «Mi curso», su celular recibe una **notificación** cuando UTP aprueba,
     devuelve o marca impresa su prueba (además del correo). Si sale de «Mi curso», deja de recibirlas en ese celular.
3. La dirección **colegiosm.cl/imprimir** abre la app directo en «Enviar prueba o guía» (sirve para guardarla en
   favoritos del computador de la sala de profesores o ponerla en un código QR). No necesita configuración.

El script de Google (`correo-contacto.gs`) no cambia en esta versión.

## Invitar por correo a los profesores que aún no entran

En el panel, «Mi curso (app)» → «Profesores» muestra quiénes ya entraron y quiénes no. Para los que aún no entran:

- **«Invitar a los N»** les envía a todos un correo con lo que pueden hacer en «Mi curso» y un enlace que abre la app
  en «Crear contraseña» con su correo ya escrito (por ejemplo `colegiosm.cl/app/#primeravez=nombre%40colegiosm.cl`).
  Ahí tocan «Enviar código», escriben el código que les llega y crean su contraseña.
- **«Invitar por correo»** o **«Reenviar invitación»** en cada profesor, para uno solo. Se ve la fecha de la última invitación.
- **«Ver el correo que les llega»** muestra el texto antes de enviarlo.

Lo pueden usar las cuentas con «Ver los cursos» o «Listas de Mi curso» (por ejemplo UTP). Si el profesor responde
el correo, la respuesta le llega a quien envió la invitación. Para no repetir: a la misma persona, una invitación
cada 10 minutos como máximo; el botón general se salta a quienes ya la recibieron en las últimas 24 horas; y en total,
hasta 200 invitaciones por día (Google limita los correos diarios de cada cuenta). El correo sale por el mismo script
de Google, como «mensaje»: **no hay que cambiar el script**. Cuando el profesor crea su contraseña, deja de aparecer
como pendiente y su registro de invitación se borra solo.

## Cómo funciona y qué guarda
- Para las notificaciones, el servidor guarda solo la «dirección de notificación» anónima que entrega cada celular (Google, Apple, etc.). No guarda nombres, correos ni teléfonos.
- Si un profesor activa los avisos de sus pruebas, el servidor une esa dirección a su correo institucional, y guarda por
  hasta 2 días el texto del aviso (por ejemplo, «UTP aprobó tu prueba de Matemática») hasta que el celular lo lea.
- Las estadísticas guardan solo el número de visitas por página y día. Los mensajes de Contacto sí guardan lo que la persona escribió (nombre, correo y mensaje), por un año.
- La notificación no lleva el texto: al recibirla, el celular lee el aviso desde colegiosm.cl.
- Cada aviso se notifica una vez. Si se cambia el texto o se apaga y vuelve a encender, se notifica de nuevo.
- Plan gratis: alcanza de sobra para un colegio. Envía de a 40 celulares por vez; la acción de GitHub
  «Notificaciones de la app» acelera el envío y el servidor revisa solo cada minuto por si algo falla.
- Si alguna vez se usa una dirección propia (que no termine en `workers.dev`), hay que permitirla en la línea
  `connect-src` de `app/index.html` y `admin/index.html`.
