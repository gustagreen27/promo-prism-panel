// Silent recovery page: instead of showing a scary error, briefly show a
// loading state and auto-recover. A sessionStorage guard prevents infinite
// reload loops — if we've already retried once, bounce to "/" instead.
export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>Carregando…</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <style>
      html, body { height: 100%; margin: 0; background: #0b0b0c; color: #e5e7eb; font: 14px/1.5 system-ui, -apple-system, sans-serif; }
      .wrap { position: fixed; inset: 0; display: grid; place-items: center; }
      .spin { width: 28px; height: 28px; border-radius: 50%; border: 2px solid #2a2a2f; border-top-color: #e5e7eb; animation: s .8s linear infinite; }
      @keyframes s { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <div class="wrap"><div class="spin" aria-label="Carregando"></div></div>
    <script>
      (function () {
        try {
          var KEY = "__lov_recover__";
          var now = Date.now();
          var last = Number(sessionStorage.getItem(KEY) || 0);
          var path = location.pathname + location.search;
          // If we already retried within the last 8s, don't loop — go home.
          if (last && now - last < 8000) {
            sessionStorage.removeItem(KEY);
            if (path !== "/") { location.replace("/"); return; }
            // Already at "/", just wait and try one more time silently.
            setTimeout(function(){ location.reload(); }, 1500);
            return;
          }
          sessionStorage.setItem(KEY, String(now));
          setTimeout(function(){ location.reload(); }, 600);
        } catch (_) {
          setTimeout(function(){ location.reload(); }, 800);
        }
      })();
    </script>
  </body>
</html>`;
}
