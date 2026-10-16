/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "auto" (default) | "native" | "mock" — see shared/bridge/index.ts */
  readonly VITE_AURA_BRIDGE?: "auto" | "native" | "mock";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Side-effect CSS import aliased in vite.config.ts. */
declare module "@aura/design-tokens";
