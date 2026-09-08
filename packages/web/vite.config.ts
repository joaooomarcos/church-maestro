import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Em produção o build sai em dist/ e é servido estaticamente pelo próprio hub;
// em desenvolvimento o hub roda separado em :8700, então tudo que é API/WS
// precisa ser encaminhado para lá.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8700',
        changeOrigin: true,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:8700',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
});
