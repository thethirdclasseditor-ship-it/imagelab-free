import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://imagelab-free.pages.dev',
  trailingSlash: 'never',
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ['@jsquash/jpeg', '@jsquash/webp', '@huggingface/transformers'],
    },
    worker: {
      format: 'es',
    },
  },
});
