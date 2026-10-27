/* ==========================================================
   Correos que envía el servidor del colegio desde una cuenta del colegio:
   - Reenvía al correo del colegio los mensajes del formulario de Contacto de colegiosm.cl.
   - Envía el código para entrar a «Mi curso» en la app o al Panel SM (solo a correos del dominio del colegio,
     salvo el del apoderado, que registra su propio correo).
   - Envía el correo de bienvenida al Panel SM: cómo entrar y qué puede hacer cada persona.
   Conviene publicarlo desde la cuenta contacto@colegiosm.cl: los correos salen desde la cuenta que lo publica.
   Se pega en script.google.com con una cuenta del colegio (ver servidor/GUIA.md,
   sección «Formulario de Contacto»). El correo sale desde esa cuenta.
   ========================================================== */

// 1) Correo que recibe los mensajes (puede ser una lista separada por comas)
const PARA = "contacto@colegiosm.cl";

// 2) Clave: invéntala (larga, sin espacios) y pega LA MISMA en Cloudflare como CORREO_CLAVE
const CLAVE = "cambia-esta-clave";

// 3) Dominio de los correos institucionales: los códigos de «Mi curso» solo se envían a estos correos
const DOMINIO = "colegiosm.cl";

function doPost(e) {
  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput("error"); }
  if (!CLAVE || CLAVE === "cambia-esta-clave" || d.clave !== CLAVE) return ContentService.createTextOutput("no");
  const limpio = (v, n) => String(v || "").slice(0, n);
  if (d.tipo === "codigo") return enviarCodigo(d, limpio);
  if (d.tipo === "invitacion") return enviarInvitacion(d, limpio);
  if (d.tipo === "mensaje") return enviarMensaje(d, limpio);
  MailApp.sendEmail({
    to: PARA,
    replyTo: limpio(d.email, 160),
    subject: "Contacto web: " + limpio(d.motivo, 40) + " — " + limpio(d.nombre, 120),
    body:
      "Mensaje enviado desde el formulario de colegiosm.cl/contacto\n\n" +
      "Nombre: " + limpio(d.nombre, 120) + "\n" +
      "Correo: " + limpio(d.email, 160) + "\n" +
      "Motivo: " + limpio(d.motivo, 40) + "\n" +
      "Fecha: " + limpio(d.fecha, 40) + "\n\n" +
      limpio(d.mensaje, 4000) + "\n\n" +
      "Para responder, usa «Responder»: le llega a la persona.",
  });
  return ContentService.createTextOutput("ok");
}

// Código de 6 dígitos para entrar a «Mi curso» en la app o al Panel SM (solo a correos del colegio)
function enviarCodigo(d, limpio) {
  const para = limpio(d.para, 120).trim().toLowerCase();
  const dominio = para.split("@")[1] || "";
  // El apoderado registra su propio correo (por ejemplo Gmail): solo a él se le envía fuera del dominio
  const apoderado = d.quien === "apoderado";
  if (!/^\d{6}$/.test(String(d.codigo)) || !(apoderado || dominio === DOMINIO || dominio.endsWith("." + DOMINIO))) return ContentService.createTextOutput("no");
  const panel = d.quien === "panel";
  const profe = d.quien === "profe";
  MailApp.sendEmail({
    to: para,
    subject: (panel ? "Tu código para el Panel SM del Colegio San Martín: " : "Tu código para la app del Colegio San Martín: ") + d.codigo,
    body:
      "Hola" + (d.nombre ? " " + limpio(d.nombre, 120) : "") + ":\n\n" +
      (panel ? "Tu código para entrar al Panel SM (administración del sitio colegiosm.cl) es:\n\n"
        : "Tu código para entrar a «Mi curso» en la app del Colegio San Martín es:\n\n") +
      "    " + d.codigo + "\n\n" +
      "Vence en 15 minutos. " + (panel || profe ? "Después podrás crear tu contraseña." : apoderado ? "Con él confirmas tu correo de apoderado en la app." : "Puedes entrar con él en el celular del apoderado y en el del estudiante.") + "\n\n" +
      "Si no lo pediste, ignora este correo: nadie puede entrar sin este código.\n\n" +
      "Colegio San Martín · " + (panel ? "colegiosm.cl/admin" : "colegiosm.cl/app"),
  });
  return ContentService.createTextOutput("ok");
}

// Correo de bienvenida al Panel SM: cómo entrar la primera vez y qué funciones tiene la persona
function enviarInvitacion(d, limpio) {
  const para = limpio(d.para, 120).trim().toLowerCase();
  const dominio = para.split("@")[1] || "";
  if (!(dominio === DOMINIO || dominio.endsWith("." + DOMINIO))) return ContentService.createTextOutput("no");
  const funciones = (Array.isArray(d.funciones) ? d.funciones : []).slice(0, 12).map(function (f) { return "  • " + limpio(f, 400); }).join("\n\n");
  MailApp.sendEmail({
    to: para,
    name: "Colegio San Martín",
    replyTo: "contacto@colegiosm.cl",
    subject: "Tu acceso al Panel SM del Colegio San Martín",
    body:
      "Hola" + (d.nombre ? " " + limpio(d.nombre, 120) : "") + ":\n\n" +
      "Te dimos acceso al Panel SM, la administración del sitio colegiosm.cl" + (d.cargo ? ", como " + limpio(d.cargo, 60) : "") + ".\n\n" +
      "LO QUE PUEDES HACER\n\n" + funciones + "\n\n" +
      "CÓMO ENTRAR LA PRIMERA VEZ\n\n" +
      "  1. Abre colegiosm.cl/admin en el computador o en el celular.\n" +
      "  2. En «Correo del colegio», escribe este correo: " + para + "\n" +
      "  3. Toca «Primera vez u olvidé mi contraseña».\n" +
      "  4. Te llegará otro correo con un código de 6 números. Escríbelo en el panel.\n" +
      "  5. Crea tu contraseña (al menos 10 caracteres). Se guarda cifrada: nadie más puede verla, ni quien administra el sitio.\n\n" +
      "Después entras siempre con tu correo y tu contraseña. Si la olvidas, toca otra vez «Primera vez u olvidé mi contraseña».\n\n" +
      "En el celular puedes dejar el panel como una app: ábrelo en el navegador y elige «Agregar a pantalla de inicio».\n\n" +
      "Si tienes dudas, responde este correo.\n\n" +
      "Colegio San Martín · colegiosm.cl",
  });
  return ContentService.createTextOutput("ok");
}

// Avisos del servidor a una persona del colegio (un ingreso desde un equipo nuevo, un mensaje de contacto asignado)
function enviarMensaje(d, limpio) {
  const para = limpio(d.para, 120).trim().toLowerCase();
  const dominio = para.split("@")[1] || "";
  if (!(dominio === DOMINIO || dominio.endsWith("." + DOMINIO)) || !d.asunto) return ContentService.createTextOutput("no");
  // «responder»: a quién le llega la respuesta (por ejemplo, quien escribió un mensaje de contacto reenviado)
  const responder = limpio(d.responder, 160).trim();
  MailApp.sendEmail({ to: para, name: "Colegio San Martín", replyTo: /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(responder) ? responder : "contacto@colegiosm.cl",
    subject: limpio(d.asunto, 150), body: limpio(d.cuerpo, 5000) });
  return ContentService.createTextOutput("ok");
}
