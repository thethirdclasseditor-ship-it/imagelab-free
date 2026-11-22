import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://imagelab-free.pages.dev',
  integrations: [
    react(),
    icon(),
    sitemap({
      filter: (page) =>
        !page.includes('/remove-background') &&
        !page.includes('/photo-enhancer') &&
        !page.includes('/404'),
    }),
  ],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@jsquash/jpeg', '@jsquash/webp'],
    },
    worker: {
      format: 'es',
    },
  },
});
