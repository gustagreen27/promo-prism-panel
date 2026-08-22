/**
 * Configuração central do app Meta (Facebook Login for Business / WhatsApp Embedded Signup).
 *
 * App ID e Configuration ID NÃO são segredos (aparecem no browser) e ficam aqui
 * como fonte única de verdade — sem hardcode espalhado e sem depender de hostname.
 * O App Secret vive apenas no servidor, em process.env.META_APP_SECRET.
 */
export const META_APP_ID = "985774237595087";
export const META_ES_CONFIG_ID = "1275080992357459";

/** Versão do JS SDK do Facebook usada no browser (independente da Graph server-side). */
export const META_JS_SDK_VERSION = "v26.0";
