import path from 'path'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import Sitemap from 'vite-plugin-sitemap'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  if (command === 'build') {
    // A production bundle with these missing silently ships localhost or a
    // blank page. Fail the build instead.
    const required = ['VITE_API_URL', 'VITE_CLERK_PUBLISHABLE_KEY']
    const missing = required.filter((key) => !env[key])
    if (missing.length > 0) {
      throw new Error(`Missing required build environment variables: ${missing.join(', ')}`)
    }
  }

  return {
    plugins: [
      // TanStack Router plugin must come before React plugin
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      tailwindcss(),
      react(),
      Sitemap({
        hostname: env.VITE_SITE_URL || 'http://localhost:5173',
        exclude: [
          '/dashboard',
          '/notes',
          '/summaries',
          '/todos',
          '/meals',
          '/vinyl',
          '/friends',
          '/settings',
          '/feedback',
          '/sign-in',
          '/sign-up',
          '/admin',
        ],
        changefreq: 'monthly',
        robots: [
          {
            userAgent: '*',
            allow: ['/'],
            disallow: [
              '/dashboard',
              '/notes',
              '/summaries',
              '/todos',
              '/meals',
              '/vinyl',
              '/friends',
              '/settings',
              '/feedback',
              '/sign-in',
              '/sign-up',
              '/admin',
            ],
          },
        ],
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
  }
})
