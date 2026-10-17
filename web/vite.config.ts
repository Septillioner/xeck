import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

const DEV_PORT = 5173;
const PREVIEW_PORT = 4173;
/** Bind address for both the dev server and the preview server. */
const BIND_HOST = '0.0.0.0';
const HOST_ORIGIN = 'http://127.0.0.1:8787';

/**
 * The host only allows the Vite dev origins and `null` in CORS, so the remote
 * build is served by `vite preview` instead of the host: the page and `/api`
 * share one origin and the proxy hops to the host server-side. That keeps the
 * browser on a single origin, so CORS never applies.
 */
const apiProxy = {
  '/api': HOST_ORIGIN,
};

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    reportCompressedSize: false,
  },
  server: {
    // 0.0.0.0 so the LAN address works too. The default binds `::1` only, and
    // `127.0.0.1` on some setups, which refuses anything but local traffic.
    host: BIND_HOST,
    port: DEV_PORT,
    // The dev server has no auth and reaches the host through `apiProxy`, so
    // anything on this network that can reach the port has full host access.
    // `true` drops Vite's DNS-rebinding guard so LAN-IP and hostname requests
    // are not rejected; set an explicit list instead if that guard matters.
    allowedHosts: true,
    proxy: apiProxy,
  },
  preview: {
    host: BIND_HOST,
    port: PREVIEW_PORT,
    proxy: apiProxy,
  },
});
