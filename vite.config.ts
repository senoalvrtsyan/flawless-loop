// Vite, client only (D41 option A: "Vite dev-serves and builds `src/web` alone, proxying /api").
//
// Vite is a DEV-TIME dependency and absent from the running system, which is the whole reason D41
// concluded it does not violate D8's no-new-runtime-dependency rule. Nothing here may leak into
// the server: the API is reached over HTTP through the proxy below, never by importing server code.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The client fetches RELATIVE paths (`/api/snapshot`), so the same code works here behind the
    // proxy and in a packaged build served by the Node server itself. The alternative — absolute
    // `http://localhost:8787` URLs — would need CORS on the server and a different string in
    // production, i.e. two configurations where one will do.
    proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: true } },
  },
});
