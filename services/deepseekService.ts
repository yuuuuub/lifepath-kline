import { LifeDestinyResult } from "../types";
import { extractBaziFromImageBaidu, BaiduOcrConfig } from "./baiduOcrService";
import { getFromCache, saveToCache } from "./cacheService";

const DEFAULT_MODEL = "deepseek-v4-pro";

const getBaseUrl = (): string => {
  return import.meta.env.PROD ? "/api/deepseek" : "https://api.deepseek.com/v1";
};
const MAX_TOKENS = 32768;
const TIMEOUT_MS = 1200000;

export type ProgressStage = "ocr" | "cached" | "generating";
export type ProgressCallback = (stage: ProgressStage, progress?: number) => void;

export interface BaziImageInput {
  name: string;
  gender: "男" | "女";
  imageBase64: string;
  imageMimeType: string;
}

const extractJson = (content: string): any => {
  let jsonContent = content.trim();
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonContent = jsonMatch[1].trim();
  } else {
    const jsonStartIndex = jsonContent.indexOf("{");
    const jsonEndIndex = jsonContent.lastIndexOf("}");
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      jsonContent = jsonContent.substring(jsonStartIndex, jsonEndIndex + 1);
    }
  }

  try {
    return JSON.parse(jsonContent);
  } catch (e) {
    console.warn("JSON parse error, content start:", jsonContent.substring(0, 300));
    console.warn("JSON parse error, content end:", jsonContent.substring(Math.max(0, jsonContent.length - 300)));

    let repaired = jsonContent;
    let openBraces = 0;
    let openBrackets = 0;
    let inString = false;
    let escaped = false;

    for (const ch of repaired) {
      if (escaped) { escaped = false; continue; }
      if (ch === '\\') { escaped = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') openBraces++;
      if (ch === '}') openBraces--;
      if (ch === '[') openBrackets++;
      if (ch === ']') openBrackets--;
    }

    if (inString) repaired += '"';
    for (let i = 0; i < openBrackets; i++) repaired += ']';
    for (let i = 0; i < openBraces; i++) repaired += '}';

    try {
      return JSON.parse(repaired);
    } catch {
      if (jsonContent.length === 0) {
        throw new Error("模型未返回有效内容，请重试");
      }
      throw new Error(`JSON 解析失败：${(e as Error).message}`);
    }
  }
};

const ensureArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string' && v.trim()) return [v];
  return [];
};

const normalizeAnalysis = (data: any): LifeDestinyResult["analysis"] => ({
  bazi: ensureArray(data.bazi),
  summary: typeof data.summary === 'string' ? data.summary : "无摘要",
  summaryScore: typeof data.summaryScore === 'number' ? data.summaryScore : 5,
  personality: typeof data.personality === 'string' ? data.personality : "无性格分析",
  personalityScore: typeof data.personalityScore === 'number' ? data.personalityScore : 5,
  industry: typeof data.industry === 'string' ? data.industry : "无",
  industryScore: typeof data.industryScore === 'number' ? data.industryScore : 5,
  fengShui: typeof data.fengShui === 'string' ? data.fengShui : "建议多亲近自然，保持心境平和。",
  fengShuiScore: typeof data.fengShuiScore === 'number' ? data.fengShuiScore : 5,
  wealth: typeof data.wealth === 'string' ? data.wealth : "无",
  wealthScore: typeof data.wealthScore === 'number' ? data.wealthScore : 5,
  marriage: typeof data.marriage === 'string' ? data.marriage : "无",
  marriageScore: typeof data.marriageScore === 'number' ? data.marriageScore : 5,
  health: typeof data.health === 'string' ? data.health : "无",
  healthScore: typeof data.healthScore === 'number' ? data.healthScore : 5,
  family: typeof data.family === 'string' ? data.family : "无",
  familyScore: typeof data.familyScore === 'number' ? data.familyScore : 5,
  crypto: typeof data.crypto === 'string' ? data.crypto : "暂无投资建议",
  cryptoScore: typeof data.cryptoScore === 'number' ? data.cryptoScore : 5,
  cryptoYear: typeof data.cryptoYear === 'string' ? data.cryptoYear : "待定",
  cryptoStyle: typeof data.cryptoStyle === 'string' ? data.cryptoStyle : "指数基金定投",
  daYunReasons: typeof data.daYunReasons === 'object' && data.daYunReasons !== null ? data.daYunReasons : {},
  baziSections: typeof data.baziSections === 'object' && data.baziSections !== null ? data.baziSections : {},
});

const getDeepSeekApiKey = (): string => {
  return (import.meta.env.VITE_DEEPSEEK_API_KEY || "").trim();
};

const isNetworkError = (e: any): boolean => {
  return e.message === "Failed to fetch" || e.name === "TypeError" ||
    e.message?.includes("网络连接") || e.message?.includes("网络请求失败");
};

const callDeepSeekAPI = async (
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
): Promise<LifeDestinyResult> => {
  const isProd = import.meta.env.PROD;
  const apiKey = getDeepSeekApiKey();
  if (!isProd && !apiKey) throw new Error("请先配置 VITE_DEEPSEEK_API_KEY");

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (!isProd) reqHeaders["Authorization"] = `Bearer ${apiKey}`;

      const response = await fetch(`${getBaseUrl()}/chat/completions`, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        headers: reqHeaders,
        signal,
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          temperature: 0.5,
          max_tokens: MAX_TOKENS,
          messages,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`请求失败（${response.status}）：${text || "未知错误"}`);
      }

      const json = await response.json();
      const content = json?.choices?.[0]?.message?.content;
      if (!content || typeof content !== "string") {
        throw new Error("模型未返回有效内容");
      }

      const data = extractJson(content);
      return {
        chartData: data.chartPoints || [],
        analysis: normalizeAnalysis(data),
      };
    } catch (e: any) {
      if (attempt < 2 && isNetworkError(e)) {
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        continue;
      }
      throw e;
    }
  }
  throw new Error("请求失败");
};

const getBaiduOcrConfig = (): BaiduOcrConfig => {
  return {
    apiKey: (import.meta.env.VITE_BAIDU_OCR_API_KEY || "").trim(),
    secretKey: (import.meta.env.VITE_BAIDU_OCR_SECRET_KEY || "").trim(),
    proxyUrl: import.meta.env.PROD ? "/api/baidu-ocr" : undefined,
  };
};

const buildFullPrompt = (name: string, gender: string): string => {
  return `请为用户生成完整的命理分析报告和命运K线数据。

用户：${name} (${gender})

== 分析字段 ==
bazi（四柱数组）, summary（总评，180-250字）, summaryScore（0-10）,
personality（性格分析，100-150字）, personalityScore,
industry（事业分析，100-150字）, industryScore,
fengShui（风水建议，100-150字）, fengShuiScore,
wealth（财富分析，100-150字）, wealthScore,
marriage（婚姻分析，100-150字）, marriageScore,
health（健康分析，80-120字）, healthScore,
family（六亲分析，80-120字）, familyScore,
crypto（投资理财建议，100-150字）, cryptoScore, cryptoYear（财运最佳年份）, cryptoStyle（指数基金定投/行业ETF/个股精选）

== daYunReasons（大运整体批断）==
- 为每个出现的大运生成 20-50 字整体批断
- JSON 格式：{ "大运名": "批断内容", ... }
- 例：{ "甲子大运": "水木相生，少年得志...", "童限": "根基未稳，宜培养心性..." }

== baziSections（八字排盘七大板块整理）==
- 将 OCR 识别结果按以下七大板块整理成标准格式：
  { "基础信息": "...", "四柱排盘": "...", "神煞": "...", "干支关系": "...", "大运排盘": "...", "岁运关系": "...", "流年流月": "..." }
- 每个板块完整保留对应信息，不省略不修改

== chartPoints（流年K线）==
- 共约100条，覆盖1-100岁每条流年
- 每项：age, year, daYun（所属大运名称）, ganZhi（流年干支）, open, close, high, low, score（0-10）, reason（20-40字批断）
- 起运前大运归为"童限"
- 让评分呈现明显波动，体现人生起伏，禁止平滑直线

只返回纯 JSON，包含上述所有字段。`;
};

export const callDeepSeek = async (
  userPrompt: string,
): Promise<LifeDestinyResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await callDeepSeekAPI([
      {
        role: "system",
        content: "你是专业命理分析大师。输出完整严格 JSON，禁止 markdown。分析要详尽，流年批断要具体。",
      },
      { role: "user", content: userPrompt },
    ], controller.signal);
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    if (!navigator.onLine) {
      throw new Error("网络已断开，请检查网络连接后重试");
    }
    if (isNetworkError(e)) {
      throw new Error("网络请求失败，请检查网络连接或稍后重试。部分浏览器可能需要关闭广告拦截或隐私模式。");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const generateByBaziImage = async (
  input: BaziImageInput,
  onProgress?: ProgressCallback,
): Promise<LifeDestinyResult> => {
  const ocrConfig = getBaiduOcrConfig();

  onProgress?.("ocr", 10);
  const { rawText } = await extractBaziFromImageBaidu(
    input.imageBase64,
    ocrConfig
  );

  const cached = await getFromCache(input.name, input.gender, rawText);
  if (cached) {
    onProgress?.("cached", 100);
    return cached;
  }

  onProgress?.("generating", 20);

  const startTime = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const pct = Math.min(95, 20 + Math.round((elapsed / 1200000) * 75));
    onProgress?.("generating", pct);
  }, 10000);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const baziContext = `以下是从八字排盘截图中识别出的原始 OCR 文本。

请你先按以下要求整理识别结果，再做命理分析：

完整识别整张八字排盘图片所有内容，原样提取所有文字与干支信息，不准改动任何数据，按照【基础信息、四柱排盘、神煞、干支关系、大运排盘、岁运关系、流年流月】七大固定板块整理成文，沿用标准八字整理格式输出，纯提取无命理分析。

原始 OCR 文本：
${rawText}`;

    const result = await callDeepSeekAPI([
      {
        role: "system",
        content: "你是专业命理分析大师。收到 OCR 文本后，先按七大板块（基础信息、四柱排盘、神煞、干支关系、大运排盘、岁运关系、流年流月）原样整理数据，不准改动任何干支与神煞信息；整理完毕后再基于原文数据生成命理分析 JSON。输出完整严格 JSON，禁止 markdown。分析要详尽具体，流年批断要贴合命理。",
      },
      {
        role: "user",
        content: `${buildFullPrompt(input.name, input.gender)}\n\n${baziContext}`,
      },
    ], controller.signal);

    result.imageBase64 = input.imageBase64;
    await saveToCache(input.name, input.gender, rawText, result);
    onProgress?.("generating", 100);
    return result;
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("生成超时（20分钟），请稍后重试");
    }
    if (!navigator.onLine) {
      throw new Error("网络已断开，请检查网络连接后重试");
    }
    if (isNetworkError(e)) {
      throw new Error("网络请求失败，请检查网络连接或稍后重试。部分浏览器可能需要关闭广告拦截或隐私模式。");
    }
    throw e;
  } finally {
    clearInterval(timer);
    clearTimeout(timeoutId);
  }
};

export const generateByBaziImageDirect = async (input: BaziImageInput): Promise<LifeDestinyResult> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await callDeepSeekAPI([
      {
        role: "system",
        content: "你是专业命理分析大师。输出完整严格 JSON，禁止 markdown。分析详尽，流年批断具体。",
      },
      {
        role: "user",
        content: buildFullPrompt(input.name, input.gender),
      },
    ], controller.signal);
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("请求超时，请稍后重试");
    }
    if (!navigator.onLine) {
      throw new Error("网络已断开，请检查网络连接后重试");
    }
    if (isNetworkError(e)) {
      throw new Error("网络请求失败，请检查网络连接或稍后重试。部分浏览器可能需要关闭广告拦截或隐私模式。");
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }
};
