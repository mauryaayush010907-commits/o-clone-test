

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  const backend = (
    env.VITE_BACKEND_URL || "http://localhost:10000"
  ).replace(/\/+$/, "");

  return {
    plugins: [react(), tailwindcss()],
    css: {
      postcss: {
        plugins: [],
      },
    },

    server: {
      host: "localhost",
      port: 5173,
      strictPort: true,

      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
        },

        "/socket.io": {
          target: backend,
          changeOrigin: true,
          ws: true,
        },
      },
    },

    build: {
      sourcemap: false,
    },
  };
});
