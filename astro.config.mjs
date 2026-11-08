import { defineConfig } from 'astro/config';

export default defineConfig({
  trailingSlash: "always",
  site: 'https://www.niemand.blog',
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
    },
  },
});
