import build from "@hono/vite-build/cloudflare-workers";
import adapter from "@hono/vite-dev-server/cloudflare";
import honox from "honox/vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const APP = fileURLToPath(new URL("./app", import.meta.url));

export default defineConfig(({ mode }) => {
  // Client bundle (islands): stable filenames so the shell can reference them.
  if (mode === "client") {
    return {
      build: {
        rollupOptions: {
          input: ["./app/client.ts"],
          output: {
            entryFileNames: "static/client.js",
            chunkFileNames: "static/chunks/[name]-[hash].js",
            assetFileNames: "static/assets/[name].[ext]",
          },
        },
        emptyOutDir: false,
      },
    };
  }
  return {
    plugins: [
      honox({
        devServer: {
          adapter,
        },
      }),
      build(),
    ],
    resolve: {
      alias: {
        "@": APP,
      },
    },
  };
});
