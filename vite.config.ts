import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget =
    env.VITE_API_PROXY_TARGET || `http://127.0.0.1:${env.PORT || 8787}`

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // El backend se ejecuta en otro puerto; el proxy evita CORS en desarrollo
      // y mantiene la API key de Gemini fuera del frontend.
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: false,
        },
      },
    },
  }
})
