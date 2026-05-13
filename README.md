# 命运K线

> 上传问真八字截图，AI 自动识别命盘并生成命运 K 线走势图与多维度命理分析报告。

---

## 功能

- **截图识别**：上传问真八字排盘截图，AI 自动 OCR 提取四柱、大运等信息
- **人生 K 线**：生成 1-100 岁流年 K 线图 + 大运概览 K 线图，直观呈现运势起伏
- **多维分析**：性格、事业、财富、婚姻、健康、六亲、风水建议、投资理财等全面批断
- **智能缓存**：同人同八字秒开，免重复调用 API
- **多格式导出**：支持导出 JSON、保存网页、打印 PDF

---

## 快速开始

### 环境变量

复制 `.env.example` 为 `.env`，填入以下 API Key：

```env
VITE_DEEPSEEK_API_KEY=sk-xxx   # DeepSeek API（命理分析）
VITE_VISION_API_KEY=sk-xxx     # 视觉识别 API（OCR，支持 OpenAI / Gemini 等）
VITE_VISION_BASE_URL=https://api.openai.com/v1
VITE_VISION_MODEL=gpt-4o
```

### 本地运行

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 生产构建
```

### Vercel 部署

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yuuuuub/lifepath-kline)

克隆后在 Vercel 的 **Environment Variables** 中设置上述 4 个环境变量即可。

---

## 使用流程

1. 输入姓名和性别，上传问真八字排盘截图
2. 系统调用视觉 API 识别八字信息
3. DeepSeek 大模型一次性生成完整分析 + 100 条流年数据
4. 自动渲染 K 线图和详细报告
5. 再次提交同一截图时直接命中缓存，秒开结果

---

## 技术栈

- React 19 + Vite + TypeScript
- Tailwind CSS
- Recharts（K 线图）
- DeepSeek API（命理分析）
- OpenAI GPT-4o（图片 OCR）
- IndexedDB（本地缓存）

---

**免责声明**：本项目仅供娱乐与文化研究，请理性看待分析结果。
