// Builds the web app for the native shell (Tauri runs this before bundling).
// Links that point off the device (policy, AI-assistant endpoint, email redirects) go to the hosted
// deployment, since the native app has no website of its own.
import { execSync } from 'node:child_process'

const HOSTED = (process.env.CALMLIST_HOSTED_URL ?? 'https://calmlist-steel.vercel.app').replace(/\/+$/, '')

execSync('npm run build --workspace web', {
  stdio: 'inherit',
  env: {
    ...process.env,
    BASE: './',
    VITE_WEB_APP_URL: process.env.VITE_WEB_APP_URL ?? `${HOSTED}/app/`,
    VITE_POLICY_URL: process.env.VITE_POLICY_URL ?? `${HOSTED}/legal.html`,
    VITE_MCP_URL: process.env.VITE_MCP_URL ?? `${HOSTED}/api/mcp`,
  },
})
