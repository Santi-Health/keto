/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves the app from /<repo-name>/. Override with VITE_BASE if the repo is named differently.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE ?? '/keto-tracker/') : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Keto Tracker',
        short_name: 'Keto',
        description: 'Track food, macros, electrolytes, glucose and ketones.',
        theme_color: '#2f7d5b',
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
        navigateFallbackDenylist: [/^\/auth/],
      },
    }),
  ],
  test: {
    environment: 'node',
  },
}))
