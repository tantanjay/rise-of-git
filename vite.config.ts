import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  base: "./",
  // JSX goes through src/jsx: React's runtime, with emoji in element text drawn as line icons (components/ui/glyphs.tsx)
  plugins: [react({ jsxImportSource: "@glyph" })],
  resolve: {
    alias: [
      { find: /^@glyph\/(jsx-runtime|jsx-dev-runtime)$/, replacement: fileURLToPath(new URL("./src/jsx/$1.ts", import.meta.url)) },
      { find: /^@\//, replacement: fileURLToPath(new URL("./src/", import.meta.url)) }
    ]
  },
  server: {
    port: 5173,
    proxy: {
      "/castle/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      },
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: "dist",
    // three.js alone is ~700 kB minified and cannot be split further
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      onwarn(warning, warn) {
        // lucide-react ships "use client" for React Server Components; meaningless in this SPA
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
      output: {
        // Long-lived vendor chunks so app changes don't invalidate the 3D engine in browser caches
        codeSplitting: {
          groups: [
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "r3f", test: /node_modules[\\/](@react-three|three-stdlib|@monogrid|troika|maath|camera-controls)/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            // World-map models, apart from the app so model and UI changes cache separately.
            // Listed after the vendor groups (first, it swallows three.js). The HD hero models stay out: they split off
            // on their own behind their dynamic import (hdModelsLoader.ts), loaded only when HD is on, and the Codex-only
            // HD showcase stays lazy with the Codex. (A group of their own would also capture their dependencies,
            // React and the icons among them, and load with the page.)
            { name: "world", test: /src[\\/]components[\\/]3d[\\/]world[\\/](?!HighGraphicsSingularity|singularityModel|hdModels\.ts|hero[A-Z]\w*\.ts|heroes\.ts|HeroBatch|BossBatch|HeroMount|bossParts|HighGraphicsEmpyrean)/ }
          ]
        }
      }
    }
  }
});
