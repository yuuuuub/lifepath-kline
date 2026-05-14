import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, '.', '');

  // Prioritize API_KEY, but fallback to VITE_API_KEY if the user followed standard Vite naming conventions
  const apiKey = env.API_KEY || env.VITE_API_KEY;

  return {
    plugins: [react()],
    base: './',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
    },
    server: {
      proxy: {
        '/api/deepseek': {
          target: 'https://api.deepseek.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
        },
        '/api/vision': {
          target: env.VITE_VISION_BASE_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/vision/, ''),
        },
      },
    },
    define: {
      // Safely stringify the key. If it's missing, it will be an empty string, 
      // which will be caught by the check in geminiService.ts
      'process.env.API_KEY': JSON.stringify(apiKey || '')
    }
  };
});