/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo-name>/. Override with VITE_BASE if the repo is named differently.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? '/keto/') : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/keto/',
        // id stays /keto/ so the installed app updates in place instead of becoming a new one.
        name: 'Santi Grial',
        short_name: 'Santi Grial',
        description: 'Food, ketosis, glucose, training and a coach, all aimed at 12% body fat without losing muscle.',
        theme_color: '#14524a',
        background_color: '#f6f5f1',
        display: 'standalone',
        orientation: 'any',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Supabase calls must always hit the network; the app shell is cached for offline use.
        // google-link.html is where Google sends you back after re-linking; it must load itself, not the app shell.
        navigateFallbackDenylist: [/^\/auth/, /google-link\.html/],
        // Exercise pictures aren't in the install download; each is kept once it's been seen, for the gym's bad signal.
        runtimeCaching: [
          {
            urlPattern: /\/exercises\/.*\.webp$/,
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-photos', expiration: { maxEntries: 80 } },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}))
