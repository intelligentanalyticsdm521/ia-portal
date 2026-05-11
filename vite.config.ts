import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true
  },
  build: {
    // Main app chunk is currently ~930KB raw (208KB gzipped) — ARION pages are
    // still statically imported. Lazy-loading ARION is a separate iteration;
    // until then, raise the warning ceiling so it doesn't drown the build log.
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        // Pin large third-party deps into their own long-cacheable chunks so
        // a deploy that only touches app code doesn't invalidate vendor JS.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;

          // MSAL is heavy and only loaded once at auth time
          if (id.includes('@azure/msal')) return 'vendor-msal';

          // Recharts pulls in d3-* subpackages — group them all together
          if (
            id.includes('recharts') ||
            id.includes('victory-vendor') ||
            /[\\/]d3-/.test(id)
          ) {
            return 'vendor-recharts';
          }

          // Chart.js + react-chartjs-2 (used in a few legacy ARION pages)
          if (id.includes('chart.js') || id.includes('react-chartjs-2')) {
            return 'vendor-chartjs';
          }

          // Router is small but cacheable independently of React core
          if (id.includes('react-router')) return 'vendor-router';

          // React core — split so version bumps don't invalidate the app chunk
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/scheduler/')
          ) {
            return 'vendor-react';
          }

          // Icons — only a handful used, but the lib is large
          if (id.includes('lucide-react')) return 'vendor-icons';

          // Everything else from node_modules lands in a generic vendor chunk
          return 'vendor';
        }
      }
    }
  }
});
