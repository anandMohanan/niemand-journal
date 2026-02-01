import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://niemand.journal',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
