import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import mdx from "fumadocs-mdx/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ inspectorPort: 4010 }),
    mdx(),
    tailwindcss(),
    tanstackStart({
      pages: [{ path: "/api/search" }],
      spa: {
        enabled: true,
        prerender: {
          enabled: true,
        },
      },
    }),
    react(),
  ],
  server: {
    port: 3001,
  },
});
