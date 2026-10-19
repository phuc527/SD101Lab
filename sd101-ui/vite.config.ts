import react from '@vitejs/plugin-react'
import { fork, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

// SD101/labs.json maps topic -> level -> port of that level's api.js
const root = fileURLToPath(new URL('..', import.meta.url))
const labs: Record<string, Record<string, number>> = JSON.parse(readFileSync(`${root}labs.json`, 'utf8'))

// /api/<topic>/<level>/feed  ->  http://localhost:<port>/feed
const proxy = Object.fromEntries(
  Object.entries(labs).flatMap(([topic, levels]) =>
    Object.entries(levels).map(([level, port]) => {
      const prefix = `/api/${topic}/${level}`
      return [prefix, { target: `http://localhost:${port}`, rewrite: (p: string) => p.slice(prefix.length) || '/' }]
    }),
  ),
)

// `npm run dev` also starts every lab backend (set SD101_NO_APIS=1 to run them yourself)
function labApis(): Plugin {
  let child: ChildProcess | undefined
  const stop = () => child?.kill()
  return {
    name: 'sd101-lab-apis',
    apply: 'serve',
    configureServer(server) {
      if (process.env.SD101_NO_APIS) return
      child = fork(`${root}start-apis.js`, { stdio: 'inherit' })
      server.httpServer?.once('close', stop)
      process.once('exit', stop)
    },
  }
}

export default defineConfig({
  plugins: [react(), labApis()],
  server: { proxy },
})
