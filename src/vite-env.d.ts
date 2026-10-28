/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** From package.json, set at build time (see vite.config.ts). */
declare const __APP_VERSION__: string
/** When the app was built, as an ISO date. */
declare const __BUILD_TIME__: string
