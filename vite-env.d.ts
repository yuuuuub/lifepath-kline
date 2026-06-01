/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_API_KEY: string;
  readonly VITE_BAIDU_OCR_API_KEY: string;
  readonly VITE_BAIDU_OCR_SECRET_KEY: string;
  readonly VITE_VISION_API_KEY: string;
  readonly VITE_VISION_BASE_URL: string;
  readonly PROD: boolean;
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
