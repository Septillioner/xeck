export const HOST_NAME = '127.0.0.1';
export const DEFAULT_HOST_PORT = 8787;
export const HOST_PORT = readHostPort();

export const VITE_DEV_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const;
export const ELECTRON_FILE_ORIGIN = 'null';
// Declared as a plain list, not a literal tuple: the CORS callback compares it
// against an arbitrary request origin, which is a `string`.
export const ALLOWED_ORIGINS: readonly string[] = [...VITE_DEV_ORIGINS, ELECTRON_FILE_ORIGIN];

function readHostPort(): number {
  const configured = Number(process.env.XECK_HOST_PORT ?? process.env.POYRAZ_HOST_PORT);
  if (Number.isInteger(configured) && configured > 0 && configured <= 65_535) return configured;
  return DEFAULT_HOST_PORT;
}
