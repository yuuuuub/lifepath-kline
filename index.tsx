import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

window.addEventListener('unhandledrejection', (event) => {
  console.error('[unhandledrejection]', event.reason);
});
window.addEventListener('error', (event) => {
  console.error('[global error]', event.error || event.message);
});

// 一次性清除旧版 IndexedDB 缓存（key 算法已从 rawText 改为 pillars）
// 仅执行一次，之后可安全删除这段代码
if (!localStorage.getItem('cache_v2_cleaned')) {
  (async () => {
    try {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('lifepath-kline-cache');
        req.onsuccess = () => { console.log('[cache] 旧缓存已清除'); resolve(); };
        req.onerror = () => reject(req.error);
        req.onblocked = () => { console.warn('[cache] 清除被阻塞，请关闭其他标签页后刷新'); resolve(); };
      });
      localStorage.setItem('cache_v2_cleaned', '1');
    } catch {}
  })();
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);