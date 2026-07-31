import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      configPath: "./wrangler.jsonc",
      inspectorPort: 3010,
      viteEnvironment: { name: "ssr" },
    }),
    tailwindcss(),
    tanstackStart({
      prerender: {
        autoStaticPathsDiscovery: true,
        crawlLinks: true,
        enabled: true,
        failOnError: true,
      },
      sitemap: {
        host: "https://bmc.notdns.me",
      },
    }),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 3000,
  },
});
