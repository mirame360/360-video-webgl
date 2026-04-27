import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    fs: {
      allow: ['../..'],
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'WebGL360Player',
      fileName: (format) => (
        format === 'es' ? 'webgl-360-player.min.js' : 'webgl-360-player.min.cjs'
      ),
      formats: ['es', 'cjs'],
    },
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      external: ['three', 'react', 'react-dom'],
    },
  },
});
