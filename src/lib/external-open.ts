/**
 * Helpers para forçar a abertura de um link no navegador externo do aparelho
 * quando o visitante está dentro de um in-app browser (Facebook/Instagram).
 */

export function isMetaInAppBrowser(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /FBAN|FBAV|FB_IAB|FBIOS|Instagram|Messenger/i.test(ua);
}

export function isAndroid(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /Android/i.test(ua);
}

export function isIOS(ua = typeof navigator !== "undefined" ? navigator.userAgent : "") {
  return /iPhone|iPad|iPod/i.test(ua);
}

/** Constrói a URL que sai do webview e cai no navegador padrão do sistema. */
export function externalOpenUrl(url: string): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  try {
    const u = new URL(url);
    if (isAndroid(ua)) {
      const withoutScheme = `${u.host}${u.pathname}${u.search}${u.hash}`;
      return `intent://${withoutScheme}#Intent;scheme=${u.protocol.replace(":", "")};action=android.intent.action.VIEW;S.browser_fallback_url=${encodeURIComponent(url)};end`;
    }
    if (isIOS(ua) && u.protocol === "https:") {
      return `x-safari-https://${u.host}${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    // URL inválida — devolve como está
  }
  return url;
}

/**
 * Tenta abrir no navegador externo e, se o sistema ignorar, mantém a navegação
 * normal como fallback (para não deixar o visitante numa tela em branco).
 */
export function openInExternalBrowser(url: string) {
  const target = externalOpenUrl(url);
  if (target === url) {
    window.location.href = url;
    return;
  }
  try {
    window.location.href = target;
  } catch {
    window.location.href = url;
  }
  setTimeout(() => {
    if (!document.hidden) window.location.href = url;
  }, 1200);
}
