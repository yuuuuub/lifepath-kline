import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

// Dev-only plugin to proxy Baidu OCR and D1 results API
function devApiProxy(env: Record<string, string>): Plugin {
  let cachedToken: string | null = null;
  let tokenExpiry = 0;

  return {
    name: 'dev-api-proxy',
    configureServer(server) {
      // Handle /api/baidu-ocr (server-side token exchange + OCR call)
      server.middlewares.use('/api/baidu-ocr', async (req, res) => {
        if (req.method === 'OPTIONS') {
          res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST',
            'Access-Control-Allow-Headers': 'Content-Type',
          });
          res.end();
          return;
        }
        if (req.method !== 'POST') {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const apiKey = env.VITE_BAIDU_OCR_API_KEY || '';
        const secretKey = env.VITE_BAIDU_OCR_SECRET_KEY || '';
        if (!apiKey || !secretKey) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: '请配置 VITE_BAIDU_OCR_API_KEY 和 VITE_BAIDU_OCR_SECRET_KEY' }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const body = JSON.parse(Buffer.concat(chunks).toString());
          const { imageBase64 } = body;

          if (!imageBase64) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: '缺少 imageBase64' }));
            return;
          }

          // Get access token (with cache)
          if (!cachedToken || Date.now() >= tokenExpiry) {
            const tokenRes = await fetch(
              `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${apiKey}&client_secret=${secretKey}`,
              { method: 'POST' }
            );
            const tokenData = (await tokenRes.json()) as any;
            if (!tokenData.access_token) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: `百度鉴权失败：${tokenData.error_description || '未知错误'}` }));
              return;
            }
            cachedToken = tokenData.access_token;
            tokenExpiry = Date.now() + (tokenData.expires_in - 300) * 1000;
          }

          // Call Baidu OCR
          const formData = new URLSearchParams();
          formData.append('image', imageBase64);
          const ocrRes = await fetch(
            `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${cachedToken}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: formData.toString(),
            }
          );
          const ocrData = (await ocrRes.json()) as any;

          if (ocrData.error_code) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: `百度 OCR 错误：${ocrData.error_msg}` }));
            return;
          }

          const words = ocrData.words_result?.map((w: any) => w.words) || [];
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ rawText: words.join('\n') }));
        } catch (e: any) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });

      // Handle /api/results (D1 not available in dev, return stub)
      server.middlewares.use('/api/results', async (req, res) => {
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(null));
          return;
        }
        if (req.method === 'POST') {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true, dev: true }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(null));
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');

  return {
    plugins: [react(), devApiProxy(env)],
    base: './',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom'],
            charts: ['recharts'],
            icons: ['lucide-react'],
          },
        },
      },
    },
    server: {
      proxy: {
        '/api/deepseek': {
          target: 'https://api.deepseek.com/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/deepseek/, ''),
          headers: {
            Authorization: `Bearer ${env.VITE_DEEPSEEK_API_KEY || ''}`,
          },
        },
        '/api/vision': {
          target:
            env.VITE_VISION_BASE_URL ||
            'https://dashscope.aliyuncs.com/compatible-mode/v1',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/vision/, ''),
        },
      },
    },
    define: {
      'process.env.API_KEY': JSON.stringify(
        env.API_KEY || env.VITE_API_KEY || ''
      ),
    },
  };
});
