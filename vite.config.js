import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const commitSha = (process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_COMMIT || 'local').slice(0, 7)
const buildDate = new Date().toLocaleDateString('en-GB')

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_SHA__: JSON.stringify(commitSha),
    __BUILD_DATE__: JSON.stringify(buildDate),
  },
})
