import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    emptyOutDir: false,
    lib: {
      entry: 'src/standalone.ts',
      name: 'WebGL360Player',
      fileName: () => 'webgl-360-player.standalone.umd.min.js',
      formats: ['umd'],
    },
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      external: ['react', 'react-dom'],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
        },
      },
    },
  },
});
