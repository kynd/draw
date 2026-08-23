import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [mdx()],
  site: 'https://www.kynd.info',
  base: '/draw',
  output: 'static',
  build: {
    assets: 'assets',
  },
  devToolbar: {
    enabled: false,
  },
});
