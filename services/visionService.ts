const DEFAULT_VISION_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_VISION_MODEL = "deepseek-chat";

export interface VisionConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
}

export interface VisionResult {
  rawText: string;
}

const buildExtractionPrompt = (name: string, gender: string): string => {
  return [
    "你是一个专业的八字排盘信息提取助手，擅长从截图识别中国传统命理信息。",
    "请仔细观察这张问真八字排盘截图的每一行汉字，逐字识别，务必准确。",
    "",
    `用户姓名：${name}`,
    `用户性别：${gender}`,
    "",
    "【重要】请严格按照以下格式提取，不要遗漏、不要猜测、不要改写：",
    "",
    "1. 四柱（逐行对应截图中的年柱、月柱、日柱、时柱，原样复制天干地支）",
    "   输出格式：",
    "   年柱：甲子",
    "   月柱：乙丑",
    "   日柱：丙寅",
    "   时柱：丁卯",
    "",
    "2. 起运年龄（虚岁，直接读取截图中的数字）",
    "   输出格式：",
    "   起运年龄：5",
    "",
    "3. 大运列表（按截图顺序从左到右、从上到下，逐项列出每一步大运的干支，用顿号分隔）",
    "   输出格式：",
    "   大运：戊辰、己巳、庚午、辛未、壬申、癸酉、甲戌、乙亥",
    "",
    "4. 出生年份（从年柱或截图其他位置提取）",
    "   输出格式：",
    "   出生年份：1990",
    "",
    "【警告】",
    "- 只输出上述格式的纯文本，不要添加任何解释、markdown、额外字符",
    "- 如果截图模糊看不清某个字，请标注为「？」，不要猜测替代",
    "- 大运列表务必包含截图所示全部大运",
    "- 天干地支是成对出现的，如甲子、乙丑，不要拆散",
  ].join("\n");
};

export const extractBaziFromImage = async (
  imageBase64: string,
  imageMimeType: string,
  name: string,
  gender: string,
  config: VisionConfig
): Promise<VisionResult> => {
  const apiKey = config.apiKey.trim();
  if (!apiKey) {
    throw new Error("请配置 VITE_DEEPSEEK_API_KEY（用于图片文字识别和命理分析）");
  }

  const baseUrl = (config.baseUrl || DEFAULT_VISION_BASE_URL).trim().replace(/\/+$/, "");
  const model = (config.model || DEFAULT_VISION_MODEL).trim();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: buildExtractionPrompt(name, gender) },
            {
              type: "image_url",
              image_url: {
                url: `data:${imageMimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`图片识别失败（${response.status}）：${errText || "未知错误"}`);
  }

  const json = await response.json();
  const content = json?.choices?.[0]?.message?.content;

  if (!content || typeof content !== "string") {
    throw new Error("视觉模型未返回有效内容");
  }

  return { rawText: content };
};
