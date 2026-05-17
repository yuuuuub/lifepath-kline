export interface BaiduOcrConfig {
  apiKey: string;
  secretKey: string;
  proxyUrl?: string;
}

export interface BaiduOcrResult {
  rawText: string;
}

let cachedToken: string | null = null;
let tokenExpiry = 0;

const getAccessToken = async (config: BaiduOcrConfig): Promise<string> => {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  const res = await fetch(
    `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${config.apiKey}&client_secret=${config.secretKey}`,
    { method: "POST" }
  );
  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`百度 OCR 鉴权失败：${data.error_description || data.error || "未知错误"}`);
  }
  cachedToken = data.access_token;
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;
  return cachedToken;
};

export const extractBaziFromImageBaidu = async (
  imageBase64: string,
  config: BaiduOcrConfig
): Promise<BaiduOcrResult> => {
  const useProxy = !!config.proxyUrl;

  if (!useProxy && (!config.apiKey || !config.secretKey)) {
    throw new Error("请配置 VITE_BAIDU_OCR_API_KEY 和 VITE_BAIDU_OCR_SECRET_KEY");
  }

  if (useProxy) {
    const res = await fetch(config.proxyUrl!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64 }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`百度 OCR 识别失败：${(err as any).error || res.status}`);
    }
    const data = await res.json();
    return { rawText: data.rawText || "" };
  }

  const token = await getAccessToken(config);
  const formData = new URLSearchParams();
  formData.append("image", imageBase64);

  const res = await fetch(
    `https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token=${token}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    }
  );

  if (!res.ok) {
    throw new Error(`百度 OCR 请求失败（${res.status}）`);
  }

  const data = await res.json();
  if (data.error_code) {
    throw new Error(`百度 OCR 识别失败：${data.error_msg}`);
  }

  const words = data.words_result?.map((w: any) => w.words) || [];
  return { rawText: words.join("\n") };
};
