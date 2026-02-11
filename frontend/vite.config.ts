import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import Sitemap from 'vite-plugin-sitemap'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // TanStack Router plugin must come before React plugin
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    tailwindcss(),
    react(),
    Sitemap({
      hostname: process.env.VITE_SITE_URL || 'http://localhost:5173',
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
})
