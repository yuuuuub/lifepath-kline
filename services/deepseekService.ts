import { LifeDestinyResult, DirectionResult, DirectionType, OcrContext, ParsedBaziOcr, BaziPillars, AnalysisData } from "../types";
import { extractBaziFromImageBaidu, BaiduOcrConfig } from "./baiduOcrService";
import { getFromCache, saveToCache, getDirectionCache, saveDirectionCache } from "./cacheService";

const DEFAULT_MODEL = "deepseek-v4-pro";

const getBaseUrl = (): string => {
  return import.meta.env.PROD ? "/api/deepseek" : "/api/deepseek";
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
  console.log('extractJson 输入长度:', content.length, '前80:', content.substring(0, 80));
  const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    console.log('extractJson 匹配到 markdown 代码块');
    jsonContent = jsonMatch[1].trim();
  } else {
    // 推理模型可能在 JSON 前输出思考文字，尝试从最后一个换行后的 { 开始
    const newlineBrace = [...jsonContent.matchAll(/\n\{/g)];
    if (newlineBrace.length > 0) {
      const lastIdx = newlineBrace[newlineBrace.length - 1].index! + 1;
      const candidate = jsonContent.substring(lastIdx);
      console.log('extractJson 尝试从最后一个 \\n{ 截取, 位置:', lastIdx);
      jsonContent = candidate;
    } else {
      const jsonStartIndex = jsonContent.indexOf("{");
      const jsonEndIndex = jsonContent.lastIndexOf("}");
      if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
        jsonContent = jsonContent.substring(jsonStartIndex, jsonEndIndex + 1);
      }
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

const normalizeAnalysis = (data: any): LifeDestinyResult["analysis"] => {
  if (!data || typeof data !== 'object') {
    console.warn('normalizeAnalysis 收到无效 data:', data);
    data = {};
  }
  return {
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
  };
};



const isNetworkError = (e: any): boolean => {
  return e.message === "Failed to fetch" || e.name === "TypeError" ||
    e.message?.includes("网络连接") || e.message?.includes("网络请求失败") ||
    e.message?.includes("Connection closed") || e.message?.includes("protocol error");
};

const parseSSEStream = async (response: Response, signal?: AbortSignal): Promise<string> => {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';

  try {
    while (true) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith(':') || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          fullContent += chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.delta?.reasoning_content || '';
        } catch {}
      }
    }

    if (buffer.trim().startsWith('data: ') && buffer.trim().slice(6).trim() !== '[DONE]') {
      try {
        const chunk = JSON.parse(buffer.trim().slice(6).trim());
        fullContent += chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.delta?.reasoning_content || '';
      } catch {}
    }
  } catch (e) {
    reader.cancel();
    throw e;
  }

  return fullContent;
};

const fetchDeepSeekContent = async (
  requestBody: Record<string, any>,
  signal: AbortSignal,
): Promise<string> => {
  const isProd = import.meta.env.PROD;
  const url = `${getBaseUrl()}/chat/completions`;

  const reqHeaders: Record<string, string> = { "Content-Type": "application/json" };
  // In dev mode, Vite proxy injects Authorization header
  // In prod mode, Cloudflare Functions inject Authorization header
  // So we don't need to set it here in either case

  const response = await fetch(url, {
    method: "POST",
    headers: reqHeaders,
    signal,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`请求失败（${response.status}）：${text || "未知错误"}`);
  }

  if (isProd) {
    return parseSSEStream(response, signal);
  }
  const json = await response.json();
  return json?.choices?.[0]?.message?.content || '';
};

const fetchDeepSeekContentWithRetry = async (
  requestBody: Record<string, any>,
  signal: AbortSignal,
  maxRetries = 2,
): Promise<string> => {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fetchDeepSeekContent(requestBody, signal);
    } catch (e: any) {
      // Don't retry on AbortError (timeout) - the signal is already aborted
      if (e.name === 'AbortError') throw e;
      if (attempt < maxRetries && isNetworkError(e)) {
        await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        if (signal.aborted) throw e;
        continue;
      }
      throw e;
    }
  }
  throw new Error("请求失败");
};

const callDeepSeekAPI = async (
  messages: Array<{ role: string; content: string }>,
  signal: AbortSignal,
  options?: { model?: string; maxTokens?: number; temperature?: number },
): Promise<LifeDestinyResult> => {
  console.log('callDeepSeekAPI 开始, model:', options?.model || DEFAULT_MODEL, 'maxTokens:', options?.maxTokens);
  const content = await fetchDeepSeekContentWithRetry({
    model: options?.model || DEFAULT_MODEL,
    temperature: options?.temperature ?? 0.5,
    max_tokens: options?.maxTokens || MAX_TOKENS,
    messages,
  }, signal);
  console.log('callDeepSeekAPI content 长度:', content?.length, '前100字:', content?.substring(0, 100));
  if (!content) throw new Error("模型未返回有效内容");
  const data = extractJson(content);
  console.log('callDeepSeekAPI extractJson 返回:', typeof data, data === null ? 'null' : Array.isArray(data) ? 'array[' + data.length + ']' : 'keys=' + Object.keys(data || {}).slice(0, 8));
  return {
    chartData: data.chartPoints || [],
    analysis: normalizeAnalysis(data),
  };
};

const getBaiduOcrConfig = (): BaiduOcrConfig => {
  return {
    apiKey: "",
    secretKey: "",
    // 始终通过代理转发，API Key 由服务端注入，不暴露到前端
    proxyUrl: "/api/baidu-ocr",
  };
};

const GANZHI_RE = /[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]/;

const splitCleanLines = (rawText: string): string[] =>
  rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

const findAfterLabel = (lines: string[], label: string): string | undefined => {
  const index = lines.findIndex(line => line === label || line.startsWith(`${label}：`) || line.startsWith(`${label}:`));
  if (index === -1) return undefined;
  const sameLine = lines[index].match(new RegExp(`^${label}[：:](.+)$`))?.[1]?.trim();
  if (sameLine) return sameLine;
  return lines.slice(index + 1).find(line => line && !["年柱", "月柱", "日柱", "时柱"].includes(line));
};

const collectRelation = (rawText: string, label: string): string[] => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = rawText.match(new RegExp(`${escaped}[：:]([^\\n]+)`));
  if (!match?.[1]) return [];
  return match[1]
    .split(/[1,，、；;|\s]+/)
    .map(item => item.trim())
    .filter(item => item && item !== "无");
};

const getPillars = (ctx: OcrContext): BaziPillars => {
  return ctx.parsed?.pillars || parseBaziOcr(ctx.rawText, ctx.name, ctx.gender).pillars;
};

const extractPillars = (lines: string[]): ParsedBaziOcr["pillars"] => {
  const stemRowIndex = lines.findIndex(line => line === "天干");
  const branchRowIndex = lines.findIndex(line => line === "地支");
  const hiddenStemIndex = lines.findIndex(line => line === "藏干");

  if (stemRowIndex !== -1 && branchRowIndex !== -1 && branchRowIndex > stemRowIndex) {
    const stems = lines
      .slice(stemRowIndex + 1, branchRowIndex)
      .filter(line => /^[甲乙丙丁戊己庚辛壬癸]$/.test(line));
    const branches = lines
      .slice(branchRowIndex + 1, hiddenStemIndex === -1 ? branchRowIndex + 16 : hiddenStemIndex)
      .filter(line => /^[子丑寅卯辰巳午未申酉戌亥]$/.test(line));
    const pairs = stems.map((stem, index) => `${stem}${branches[index] || ""}`).filter(pillar => GANZHI_RE.test(pillar));

    if (pairs.length >= 6) {
      return {
        year: pairs[2],
        month: pairs[3],
        day: pairs[4],
        hour: pairs[5],
      };
    }

    if (pairs.length >= 4) {
      return {
        year: pairs[0],
        month: pairs[1],
        day: pairs[2],
        hour: pairs[3],
      };
    }
  }

  const pillarLabelIndex = lines.findIndex((line, index) =>
    line === "年柱" &&
    lines[index + 1] === "月柱" &&
    lines[index + 2] === "日柱" &&
    lines[index + 3] === "时柱"
  );

  const dayMarkerIndex = lines.findIndex(line => line === "元男" || line === "元女" || line === "日元");
  if (dayMarkerIndex >= 2 && GANZHI_RE.test(lines[dayMarkerIndex - 2]) && GANZHI_RE.test(lines[dayMarkerIndex - 1])) {
    return {
      year: lines[dayMarkerIndex - 2],
      month: lines[dayMarkerIndex - 1],
      day: lines[dayMarkerIndex + 1],
      hour: lines[dayMarkerIndex + 2],
    };
  }

  if (pillarLabelIndex !== -1) {
    const candidates = lines
      .slice(pillarLabelIndex + 4, pillarLabelIndex + 30)
      .filter(line => GANZHI_RE.test(line));
    if (candidates.length >= 4) {
      return {
        year: candidates[0],
        month: candidates[1],
        day: candidates[2],
        hour: candidates[3],
      };
    }
  }

  const allGanZhi = lines.filter(line => GANZHI_RE.test(line));
  return {
    year: allGanZhi[0],
    month: allGanZhi[1],
    day: allGanZhi[2],
    hour: allGanZhi[3],
  };
};

const extractDaYun = (lines: string[]): ParsedBaziOcr["daYun"] => {
  const startIndex = lines.findIndex(line => line === "大运");
  if (startIndex === -1) return [];

  const window = lines.slice(startIndex + 1, startIndex + 90);
  const years = window.filter(line => /^(19|20)\d{2}$/.test(line)).slice(0, 10);
  const ages = window.filter(line => /^\d+\s*岁$/.test(line)).slice(0, 10);
  let pillars = window.filter(line => GANZHI_RE.test(line) && line.length <= 8).slice(0, 10);

  if (pillars.length < 4) {
    const stems = window.filter(line => /^[甲乙丙丁戊己庚辛壬癸]/.test(line) && !GANZHI_RE.test(line)).slice(0, 10);
    const branches = window.filter(line => /^[子丑寅卯辰巳午未申酉戌亥]/.test(line) && !GANZHI_RE.test(line)).slice(0, 10);
    if (stems.length >= 4 && branches.length >= 4) {
      pillars = stems.map((stem, index) => `${stem[0]}${branches[index]?.[0] || ""}`).filter(pillar => pillar.length === 2);
    }
  }

  return pillars.map((pillar, index) => ({
    startYear: years[index],
    endYear: years[index + 1],
    age: ages[index],
    pillar,
  }));
};

export const parseBaziOcr = (rawText: string, fallbackName: string, fallbackGender: "男" | "女"): ParsedBaziOcr => {
  const lines = splitCleanLines(rawText);
  const lunarLine = lines.find(line => line.includes("农历"));
  const solarLine = lines.find(line => line.includes("阳历") || line.includes("公历"));
  const ageLine = lines.find(line => /^\d+\s*岁$/.test(line));
  const nameLine = lines.find((line, index) => line === fallbackName || (index > 0 && lines[index - 1]?.includes("断事笔记") && line.length <= 8));

  const keyShenSha = Array.from(new Set(lines.filter(line =>
    /(天乙贵人|太极贵人|文昌贵人|福星贵人|德秀贵人|桃花|驿马|华盖|将星|金舆|红艳煞|空亡|羊刃|禄神)/.test(line)
  ))).slice(0, 30);

  return {
    name: nameLine || fallbackName,
    gender: rawText.includes("坤造") ? "女" : rawText.includes("乾造") ? "男" : fallbackGender,
    calendar: {
      lunar: lunarLine?.replace(/^农历[：:]?/, "").trim(),
      solar: solarLine?.replace(/^(阳历|公历)[：:]?/, "").trim(),
    },
    pillars: extractPillars(lines),
    startLuck: lines.find(line => line.startsWith("起运")),
    transferLuck: lines.find(line => line.startsWith("交运")),
    commander: findAfterLabel(lines, "司令"),
    currentAge: ageLine,
    daYun: extractDaYun(lines),
    relations: {
      originalHeavenly: collectRelation(rawText, "原局天干"),
      originalEarthly: collectRelation(rawText, "原局地支"),
      originalPillar: collectRelation(rawText, "原局整柱"),
      luckHeavenly: collectRelation(rawText, "岁运天干"),
      luckEarthly: collectRelation(rawText, "岁运地支"),
      luckPillar: collectRelation(rawText, "岁运整柱"),
    },
    keyShenSha,
    rawPreview: lines.slice(0, 80).join("\n"),
  };
};

const buildStructuredBaziContext = (ctx: OcrContext): string => {
  const parsed = ctx.parsed || parseBaziOcr(ctx.rawText, ctx.name, ctx.gender);
  const hasPillars = Object.values(parsed.pillars).filter(Boolean).length >= 4;
  const payload = {
    name: ctx.name,
    gender: ctx.gender,
    parsed,
    baziSections: ctx.baziSections,
  };

  return `以下排盘数据已由系统从 OCR 本地结构化提取。请直接基于 JSON 分析，不要重新整理 OCR，不要复述原始排盘。

结构化排盘 JSON：
${JSON.stringify(payload, null, 2)}
${hasPillars ? "" : `\n\n解析兜底 OCR 片段：\n${parsed.rawPreview}`}`;
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

== baziSections（八字排盘八大板块整理）==
- 将 OCR 识别结果按以下板块整理，每个字段值为 Markdown 格式：
  { "基础信息": "...", "四柱排盘": "...", "原局神煞": "...", "原局干支关系": "...", "岁运干支关系": "...", "大运排盘": "...", "当前流年": "...", "流月": "..." }
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

  const parsed = parseBaziOcr(rawText, input.name, input.gender);
  const cached = await getFromCache(input.name, input.gender, parsed.pillars);
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
    const baziSections = buildLocalOcrSections(rawText);
    const baziContext = buildStructuredBaziContext({
      rawText,
      imageBase64: input.imageBase64,
      name: input.name,
      gender: input.gender,
      baziSections,
      parsed,
    });

    const result = await callDeepSeekAPI([
      {
        role: "system",
        content: "你是专业命理分析大师。基于结构化排盘 JSON 生成命理分析 JSON。输出完整严格 JSON，禁止 markdown。分析要详尽具体，流年批断要贴合命理。",
      },
      {
        role: "user",
        content: `${buildFullPrompt(input.name, input.gender)}\n\n${baziContext}`,
      },
    ], controller.signal);

    result.imageBase64 = input.imageBase64;
    await saveToCache(input.name, input.gender, parsed.pillars, result);
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

export const generateKlineFromOcr = async (
  ctx: OcrContext,
  onProgress?: (pct: number) => void,
): Promise<LifeDestinyResult> => {
  const pillars = getPillars(ctx);
  const cached = await getFromCache(ctx.name, ctx.gender, pillars);
  if (cached) {
    onProgress?.(100);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startTime = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    onProgress?.(Math.min(95, 15 + Math.round((elapsed / 1200000) * 80)));
  }, 10000);

  try {
    onProgress?.(15);
    const baziContext = buildStructuredBaziContext(ctx);

    const result = await callDeepSeekAPI([
      {
        role: "system",
        content: "你是专业命理分析大师。基于结构化排盘 JSON 生成完整严格 JSON，禁止 markdown。分析要详尽具体，流年批断要贴合命理。",
      },
      {
        role: "user",
        content: `${buildFullPrompt(ctx.name, ctx.gender)}\n\n${baziContext}`,
      },
    ], controller.signal);

    result.imageBase64 = ctx.imageBase64;
    result.analysis.baziSections = ctx.baziSections || result.analysis.baziSections;
    await saveToCache(ctx.name, ctx.gender, pillars, result);
    onProgress?.(100);
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

const buildOverviewPrompt = (name: string, gender: string): string => {
  return `请为用户生成命理总览报告，先不要生成K线图数据。

用户：${name} (${gender})

只输出纯 JSON，字段如下：
{
  "bazi": ["年柱", "月柱", "日柱", "时柱"],
  "summary": "总评，180-250字",
  "summaryScore": 0-10,
  "personality": "性格分析，100-150字",
  "personalityScore": 0-10,
  "industry": "事业分析，100-150字",
  "industryScore": 0-10,
  "fengShui": "风水建议，100-150字",
  "fengShuiScore": 0-10,
  "wealth": "财富分析，100-150字",
  "wealthScore": 0-10,
  "marriage": "婚姻分析，100-150字",
  "marriageScore": 0-10,
  "health": "健康分析，80-120字",
  "healthScore": 0-10,
  "family": "六亲分析，80-120字",
  "familyScore": 0-10,
  "crypto": "投资理财建议，100-150字",
  "cryptoScore": 0-10,
  "cryptoYear": "财运最佳年份",
  "cryptoStyle": "指数基金定投/行业ETF/个股精选",
  "daYunReasons": {}
}

不要输出 chartPoints，不要输出 markdown。`;
};

export const generateKlineOverviewFromOcr = async (
  ctx: OcrContext,
  onProgress?: (pct: number) => void,
): Promise<LifeDestinyResult> => {
  const pillars = getPillars(ctx);
  const cached = await getFromCache(ctx.name, ctx.gender, pillars);
  if (cached) {
    onProgress?.(100);
    return cached;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    onProgress?.(20);
    const baziContext = buildStructuredBaziContext(ctx);

    const result = await callDeepSeekAPI([
      {
        role: "system",
        content: "你是专业命理分析大师。基于结构化排盘 JSON 先生成总览 JSON，禁止 markdown，禁止生成 chartPoints。",
      },
      {
        role: "user",
        content: `${buildOverviewPrompt(ctx.name, ctx.gender)}\n\n${baziContext}`,
      },
    ], controller.signal, { maxTokens: 8192, temperature: 0.5 });

    result.imageBase64 = ctx.imageBase64;
    result.analysis.baziSections = ctx.baziSections || result.analysis.baziSections;
    if (!Array.isArray(result.chartData)) result.chartData = [];
    onProgress?.(100);
    return result;
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new Error("总览生成超时，请稍后重试");
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

export const doOCR = async (imageBase64: string): Promise<string> => {
  const ocrConfig = getBaiduOcrConfig();
  let lastError: any;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      const { rawText } = await extractBaziFromImageBaidu(imageBase64, ocrConfig);
      return rawText;
    } catch (e: any) {
      lastError = e;
      if (attempt < 2) {
        await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
        continue;
      }
    }
  }
  throw lastError || new Error("OCR 识别失败");
};

export const buildLocalOcrSections = (rawText: string): Record<string, string> => {
  const lines = rawText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length === 0) return {};

  const sectionMatchers: Array<[string, RegExp]> = [
    ["基础信息", /(姓名|乾造|坤造|公历|阳历|农历|出生|起运|交运|年龄|司令)/],
    ["四柱排盘", /(年柱|月柱|日柱|时柱|天干|地支|藏干|主星|副星|空亡|纳音|星运|自坐)/],
    ["原局神煞", /(神煞|桃花|驿马|华盖|天乙|太极|文昌|将星|禄神|羊刃)/],
    ["原局干支关系", /(天干|地支|合|冲|刑|害|破|三合|六合|半合|拱合)/],
    ["岁运干支关系", /(流年|岁运|太岁|值年|大运.*流年|流年.*大运)/],
    ["大运排盘", /(大运|起止|运势|运程|\d+\s*岁)/],
    ["当前流年", /(当前流年|今年|明年|流年)/],
    ["流月", /(流月|节气|立春|惊蛰|清明|立夏|芒种|小暑|立秋|白露|寒露|立冬|大雪|小寒)/],
  ];

  const buckets: Record<string, string[]> = {};
  for (const [section] of sectionMatchers) buckets[section] = [];

  for (const line of lines) {
    const matched = sectionMatchers.find(([, re]) => re.test(line));
    const key = matched?.[0] || "基础信息";
    buckets[key].push(`- ${line}`);
  }

  return Object.fromEntries(
    Object.entries(buckets)
      .filter(([, value]) => value.length > 0)
      .map(([key, value]) => [key, value.join("\n")])
  );
};

export const organizeOcrSections = async (rawText: string, onProgress?: (pct: number) => void): Promise<Record<string, string>> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const startTime = Date.now();
  const timer = setInterval(() => {
    const elapsed = Date.now() - startTime;
    onProgress?.(Math.min(95, Math.round((elapsed / 300000) * 90)));
  }, 5000);

  try {
    const content = await fetchDeepSeekContentWithRetry({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      max_tokens: 16384,
      messages: [
        {
          role: "system",
          content: "你是八字排盘数据整理专家。直接输出纯 JSON，禁止输出任何模板、注释、解释文字或 markdown 代码块。各字段值用 Markdown 排版。",
        },
        {
          role: "user",
          content: `从以下 OCR 文本提取八字排盘信息，输出为 8 个字段的 JSON。不准改动干支与神煞。过滤 OCR 噪声（界面按钮、菜单项），保留日期数字。

字段及格式：
1. 基础信息：列表，包含姓名、性别乾造/坤造、农历/阳历日期、起运、交运、当前大运、年龄、司令
2. 四柱排盘：表格，列：柱位|天干|地支|藏干|星运|自坐|空亡|纳音|主星。藏干例：己（七杀）
3. 原局神煞：列表，每条"年柱 XX：神煞"
4. 原局干支关系：列表，天干/地支/整柱关系
5. 岁运干支关系：列表，岁运天干/地支/整柱关系
6. 大运排盘：表格，列：大运|年龄|起止年份|天干地支|神煞。年份合并如1997-2004
7. 当前流年：当前大运内所有流年干支
8. 流月：表格，列：节气|日期|干支

OCR 文本：
${rawText}`,
        },
      ],
    }, controller.signal);

    if (!content) throw new Error("模型未返回有效内容");
    const data = extractJson(content) as Record<string, string>;
    onProgress?.(100);
    return data;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("整理超时，请稍后重试");
    throw e;
  } finally {
    clearInterval(timer);
    clearTimeout(timeoutId);
  }
};

const DIRECTION_CONFIG: Record<DirectionType, { label: string; icon: string }> = {
  kline: { label: "命运K线", icon: "📈" },
  wealth: { label: "财富运势", icon: "💰" },
  marriage: { label: "情感姻缘", icon: "💕" },
  career: { label: "事业发展", icon: "💼" },
  health: { label: "健康养生", icon: "🏥" },
  family: { label: "六亲人际", icon: "👨‍👩‍👧‍👦" },
};

const KLINE_FIELD_MAP: Record<DirectionType, keyof AnalysisData> = {
  kline: 'summary',
  wealth: 'wealth',
  marriage: 'marriage',
  career: 'industry',
  health: 'health',
  family: 'family',
};

const KLINE_SCORE_MAP: Record<DirectionType, keyof AnalysisData> = {
  kline: 'summaryScore',
  wealth: 'wealthScore',
  marriage: 'marriageScore',
  career: 'industryScore',
  health: 'healthScore',
  family: 'familyScore',
};

const buildConsistencyConstraint = (direction: DirectionType, kline: AnalysisData): string => {
  const content = kline[KLINE_FIELD_MAP[direction]];
  const score = kline[KLINE_SCORE_MAP[direction]];
  if (!content || typeof content !== 'string' || !content.trim()) return '';
  const scoreStr = typeof score === 'number' ? score : '';
  let extra = '';
  if (direction === 'wealth' && kline.crypto) extra = `\n- 投资建议：${kline.cryptoStyle || ''}，最佳年份：${kline.cryptoYear || ''}`;
  return `

【一致性约束 - 重要】以下信息来自命理总评的已有结论，你必须在此基础上展开细化，不得推翻或严重偏离：
- 总评结论：${content}${extra}
${scoreStr ? `- 总评评分：${scoreStr}/10（你的评分需在±1范围内）` : ''}
请确保核心定性判断与总评一致，highlights 和 timeline 从总评结论中自然延伸。`;
};

export const getDirectionLabel = (d: DirectionType) => DIRECTION_CONFIG[d].label;

const buildDirectionPrompt = (ctx: OcrContext, direction: DirectionType, klineAnalysis?: AnalysisData): string => {
  const orientationNote = direction === "marriage" && ctx.orientation === "同性恋"
    ? "由于用户为同性恋取向，请完全按同性视角解读情感关系。正官/七杀对应同性伴侣，正财/偏财调整为同性缘分的辅助参考。preference 字段明确写出用户喜欢同性（男生喜欢男生/女生喜欢女生）。"
    : direction === "marriage" && ctx.orientation === "双性恋"
    ? "由于用户为双性恋取向，请综合异性恋和同性恋双重视角解读情感关系，兼顾正官/七杀（异性）、正财/偏财（传统异性）、同性十神映射（同性伴侣）的多元解读。preference 字段明确写出用户双性恋倾向，喜欢对象包括男生和女生。"
    : direction === "marriage"
    ? "由于用户为异性恋取向，请按传统异性视角解读情感关系。preference 字段明确写出用户喜欢异性（乾造喜欢女生/坤造喜欢男生）。"
    : "";

  const consistencyConstraint = klineAnalysis && direction !== 'kline'
    ? buildConsistencyConstraint(direction, klineAnalysis)
    : '';

  const prompts: Record<DirectionType, string> = {
    kline: `请为用户生成完整的命理分析报告和命运K线数据。

用户：${ctx.name} (${ctx.gender})

== 分析字段 ==
bazi（四柱数组）, summary（总评，180-250字）, summaryScore（0-10）, personality, industry, fengShui, wealth, marriage, health, family（各100-150字带score）, crypto, daYunReasons, baziSections（七大板块）

== chartPoints ==
- 共约100条，覆盖1-100岁每条流年
- 每项：age, year, daYun, ganZhi, open, close, high, low, score（0-10）, reason（20-40字批断）
- 起运前大运归为"童限"，让评分呈现明显波动

只返回纯 JSON。`,

    wealth: `你是专业命理分析大师。请基于以下八字信息，生成详尽的财富运势分析。

${orientationNote}
用户：${ctx.name} (${ctx.gender})

请输出 JSON：
{
  "title": "财富运势",
  "score": 0-10,
  "content": "150-250字综合财富分析",
  "highlights": ["3-5个关键发现点"],
  "timeline": [
    {"label": "少年", "desc": "少年时期财运简评"},
    {"label": "青年", "desc": "青年时期财运简评"},
    {"label": "中年", "desc": "中年时期财运简评"},
    {"label": "老年", "desc": "老年时期财运简评"}
  ]
}

timeline 按少年、青年、中年、老年四个阶段划分，共4条，desc 各80-120字。
分析要点：命局财星旺衰、正财偏财、适合投资风格（保守/进取/指数基金/行业ETF/个股）、财运最佳年份、避坑建议。`,

    marriage: `你是专业命理分析大师。请基于以下八字信息，生成详尽的情感姻缘分析。

${orientationNote}
用户：${ctx.name} (${ctx.gender})

请输出 JSON：
{
  "title": "情感姻缘",
  "score": 0-10,
  "content": "150-250字综合情感分析",
  "highlights": ["3-5个关键发现点"],
  "preference": "一句话明确用户的性取向偏好，如'命主为乾造男性，异性恋取向，喜欢女生，正财透干异性缘佳'或'命主为乾造男性，同性恋取向，喜欢男生，七杀为同性正缘'",
  "timeline": [
    {"label": "少年", "desc": "少年时期情感简评"},
    {"label": "青年", "desc": "青年时期情感简评"},
    {"label": "中年", "desc": "中年时期情感简评"},
    {"label": "老年", "desc": "老年时期情感简评"}
  ]
}

timeline 按少年、青年、中年、老年四个阶段划分，共4条，desc 各80-120字。
分析要点：配偶宫和配偶星的旺衰、桃花运年份、正缘特征、婚姻注意事项、情感高峰期和低谷期。`,

    career: `你是专业命理分析大师。请基于以下八字信息，生成详尽的事业发展分析。

用户：${ctx.name} (${ctx.gender})

请输出 JSON：
{
  "title": "事业发展",
  "score": 0-10,
  "content": "150-250字综合事业分析",
  "highlights": ["3-5个关键发现点"],
  "timeline": [
    {"label": "少年", "desc": "少年时期事业简评"},
    {"label": "青年", "desc": "青年时期事业简评"},
    {"label": "中年", "desc": "中年时期事业简评"},
    {"label": "老年", "desc": "老年时期事业简评"}
  ]
}

timeline 按少年、青年、中年、老年四个阶段划分，共4条，desc 各80-120字。
分析要点：官杀星旺衰、适合行业类型、贵人运、创业/打工建议、升迁关键年份、事业转型期。`,

    health: `你是专业命理分析大师。请基于以下八字信息，生成详尽的健康养生分析。

用户：${ctx.name} (${ctx.gender})

请输出 JSON：
{
  "title": "健康养生",
  "score": 0-10,
  "content": "150-250字综合健康分析",
  "highlights": ["3-5个关键发现点"],
  "timeline": [
    {"label": "少年", "desc": "少年时期健康简评"},
    {"label": "青年", "desc": "青年时期健康简评"},
    {"label": "中年", "desc": "中年时期健康简评"},
    {"label": "老年", "desc": "老年时期健康简评"}
  ]
}

timeline 按少年、青年、中年、老年四个阶段划分，共4条，desc 各80-120字。
分析要点：五行偏颇导致的体质特征、易病脏腑、重点防护年龄段、养生建议（饮食/运动/作息）。`,

    family: `你是专业命理分析大师。请基于以下八字信息，生成详尽的六亲人际分析。

用户：${ctx.name} (${ctx.gender})

请输出 JSON：
{
  "title": "六亲人际",
  "score": 0-10,
  "content": "150-250字综合人际分析",
  "highlights": ["3-5个关键发现点"],
  "timeline": [
    {"label": "少年", "desc": "少年时期人际简评"},
    {"label": "青年", "desc": "青年时期人际简评"},
    {"label": "中年", "desc": "中年时期人际简评"},
    {"label": "老年", "desc": "老年时期人际简评"}
  ]
}

timeline 按少年、青年、中年、老年四个阶段划分，共4条，desc 各80-120字。
分析要点：家庭关系、父母运势、子女缘分、社交圈特征、贵人/小人年份、人际关系高峰低谷期。`,
  };

  return (prompts[direction] || '') + consistencyConstraint;
};

export const generateDirectionAnalysis = async (
  ctx: OcrContext,
  direction: DirectionType,
  onProgress?: (pct: number) => void,
  klineAnalysis?: AnalysisData,
): Promise<DirectionResult | LifeDestinyResult> => {
  if (direction === "kline") {
    return generateKlineFromOcr(ctx, onProgress);
  }

  const pillars = getPillars(ctx);
  const cached = await getDirectionCache(ctx.name, ctx.gender, pillars, direction, ctx.orientation);
  if (cached) { onProgress?.(100); return cached; }

  onProgress?.(10);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  const startTime = Date.now();
  let timer: ReturnType<typeof setInterval> | null = null;

  try {
    const prompt = buildDirectionPrompt(ctx, direction, klineAnalysis);
    const baziContext = buildStructuredBaziContext(ctx);

    onProgress?.(30);
    timer = setInterval(() => {
      const elapsed = Date.now() - startTime;
      onProgress?.(Math.min(90, 30 + Math.round((elapsed / 300000) * 60)));
    }, 5000);

    const content = await fetchDeepSeekContentWithRetry({
      model: DEFAULT_MODEL,
      temperature: 0.2,
      max_tokens: 8192,
      messages: [
        { role: "system", content: "你是专业命理分析大师。基于结构化排盘 JSON 分析，输出纯 JSON，禁止 markdown。" },
        { role: "user", content: `${prompt}\n\n${baziContext}` },
      ],
    }, controller.signal);

    clearInterval(timer);
    onProgress?.(70);
    if (!content) throw new Error("模型未返回有效内容");

    const data = extractJson(content);
    const result: DirectionResult = {
      title: data.title || DIRECTION_CONFIG[direction].label,
      content: data.content || "",
      score: typeof data.score === "number" ? data.score : 5,
      highlights: Array.isArray(data.highlights) ? data.highlights : [],
      timeline: Array.isArray(data.timeline) ? data.timeline : undefined,
      preference: typeof data.preference === "string" ? data.preference : undefined,
    };

    saveDirectionCache(ctx.name, ctx.gender, pillars, direction, result, ctx.orientation);
    onProgress?.(100);
    return result;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error("请求超时，请稍后重试");
    throw e;
  } finally {
    if (timer) clearInterval(timer);
    clearTimeout(timeoutId);
  }
};
