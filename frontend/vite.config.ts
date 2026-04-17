import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_COMMIT_ID': JSON.stringify(
      process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local'
    ),
  },
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':  ['react', 'react-dom'],
          'vendor-pdf':    ['jspdf', 'jspdf-autotable'],
          'vendor-xlsx':   ['xlsx'],
          'vendor-charts': ['date-fns'],
        },
      },
    },
  },
});
