import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'

// The version this build is, taken from the project's version.json (the same one the installer and /version
// use), so the "What's new" window knows which release it is running - on the phone too, where the PC's
// /version would be the PC's, not the phone app's.
const appVersion = JSON.parse(readFileSync(new URL('../../version.json', import.meta.url), 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
})
