import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',

  // EREBUS is a control console, not a website — render entirely client-side.
  ssr: false,
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  // better-sqlite3 is a native module — keep it external so its .node binding
  // resolves from node_modules in both dev and production builds.
  nitro: {
    externals: {
      external: ['better-sqlite3'],
    },
  },

  app: {
    head: {
      title: 'EREBUS',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'dark' },
      ],
    },
  },

  runtimeConfig: {
    // Server-side only. Override via NUXT_* env vars (see .env.example).
    dataDir: '',
    host: '127.0.0.1',
    port: 4521,
    public: {
      version: '0.1.0',
    },
  },

  devServer: {
    host: '127.0.0.1',
    port: 4521,
  },
})
