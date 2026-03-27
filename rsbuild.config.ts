import { defineConfig, loadEnv } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginSass } from '@rsbuild/plugin-sass';

const { publicVars } = loadEnv({ prefixes: ['PUBLIC_'] });

export default defineConfig({
  plugins: [pluginReact(), pluginSass()],
  output: {
    distPath: {
      root: 'dist',
    },
  },
  html: {
    title: 'PrepShip V3 — DR PREPPER Fulfillment',
  },
  source: {
    entry: {
      index: './src/index.tsx',
    },
    define: publicVars,
  },
});
