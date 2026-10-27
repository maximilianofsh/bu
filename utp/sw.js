/* Permite instalar esta app del panel en el celular. No guarda nada: todo se pide en línea,
   y sin internet muestra un aviso en vez de la página de error del navegador. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (e) => {
  if (e.request.mode !== "navigate") return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sin conexión</title>' +
    '<body style="font:17px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#f7f3ea;color:#1d2433;text-align:center;padding:1.5rem">' +
    '<div><h1 style="font-size:1.3rem">Sin conexión</h1><p>Revisa tu internet y vuelve a abrir la app.</p>' +
    '<button onclick="location.reload()" style="font:inherit;font-weight:600;border:0;border-radius:999px;padding:.7rem 1.4rem;background:#3b0d18;color:#fff">Reintentar</button></div>',
    { headers: { "Content-Type": "text/html; charset=utf-8" } })));
});
