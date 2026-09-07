/// <reference types="vite/client" />

/** Set at build time by `vite.config.ts` — see `src/hooks/useAppData.tsx`. */
declare const __OFFLINE__: boolean

interface ImportMetaEnv {
  /** Base URL of the Laravel API, e.g. "http://localhost:8000/api". */
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
