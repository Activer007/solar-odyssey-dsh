import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext',
    minify: false,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], 'scene-helpers': ['@react-three/drei', '@react-three/postprocessing'] } },
    },
  },
});
