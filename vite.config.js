import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // host: true expone el servidor en la red local, para abrirlo desde el celular
    host: true,
    port: 5180,
  },
})
