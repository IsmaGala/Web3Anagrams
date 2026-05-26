import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // Resolve workspace package from source so Vite hot-reloads changes
      // to metagame without a rebuild step.
      '@gala-games/metagame': path.resolve(__dirname, '../../packages/metagame/src/index.ts'),
    },
  },
})
