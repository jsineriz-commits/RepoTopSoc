import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://topsociedades.vercel.app',
        changeOrigin: true,
        secure: true
      }
    }
  }
});
