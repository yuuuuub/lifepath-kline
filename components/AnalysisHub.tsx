import React, { useState } from "react";
import { DirectionType, DirectionResult, OcrContext, LifeDestinyResult } from "../types";
import { generateDirectionAnalysis, getDirectionLabel } from "../services/deepseekService";
import LifeKLineChart, { groupByDaYun } from "./LifeKLineChart";
import AnalysisResult from "./AnalysisResult";
import { ArrowLeft, Sparkles, Loader2, ChevronDown, ChevronUp, Heart } from "lucide-react";

interface AnalysisHubProps {
  ocrContext: OcrContext;
  onReset: () => void;
}

const DIRECTION_CARDS: Array<{ type: DirectionType; desc: string }> = [
  { type: "kline", desc: "完整八字分析 + 1-100岁流年K线图" },
  { type: "wealth", desc: "财星旺衰、投资风格、财运高峰低谷" },
  { type: "marriage", desc: "配偶宫星、桃花年份、正缘特征" },
  { type: "career", desc: "官杀旺衰、适合行业、升迁关键年" },
  { type: "health", desc: "五行体质、易病脏腑、养生建议" },
  { type: "family", desc: "家庭关系、子女缘分、贵人小人" },
];

const SECTION_ORDER = ["基础信息", "四柱排盘", "原局神煞", "原局干支关系", "岁运干支关系", "大运排盘", "当前流年", "流月"];

const renderMarkdownHTML = (md: string): string => {
  const lines = md.split('\n');
  const out: string[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableHeader = false;
  let inList = false;

  const flushTable = () => {
    if (!inTable) return;
    let html = '<table class="w-full text-xs border-collapse border border-gray-200"><tbody>';
    for (let i = 0; i < tableRows.length; i++) {
      const tag = i === 0 && tableHeader ? 'th' : 'td';
      const cellClass = i === 0 && tableHeader ? 'bg-gray-100 font-medium' : '';
      html += '<tr>';
      for (const cell of tableRows[i]) {
        html += `<${tag} class="border border-gray-200 px-2 py-1 ${cellClass}">${cell}</${tag}>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    out.push(html);
    tableRows = [];
    tableHeader = false;
    inTable = false;
  };

  const flushList = () => {
    if (inList) { out.push('</ul>'); inList = false; }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { flushList(); continue; }

    // 表格行
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      flushList();
      const cells = trimmed.slice(1, -1).split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{3,}:?$/.test(c))) {
        tableHeader = true;
        continue;
      }
      tableRows.push(cells);
      inTable = true;
      continue;
    }

    flushTable();

    // 列表项
    if (trimmed.startsWith('- ')) {
      if (!inList) { out.push('<ul class="list-disc pl-4 space-y-0.5">'); inList = true; }
      out.push(`<li>${trimmed.slice(2)}</li>`);
      continue;
    }

    flushList();
    out.push(`<p class="mb-1">${trimmed}</p>`);
  }

  flushTable();
  flushList();

  let html = out.join('\n');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return html;
};

const AnalysisHub: React.FC<AnalysisHubProps> = ({ ocrContext, onReset }) => {
  const [orientation, setOrientation] = useState<"异性恋" | "同性恋" | "双性恋">("异性恋");
  const [activeDirection, setActiveDirection] = useState<DirectionType | null>(null);
  const [directionResult, setDirectionResult] = useState<DirectionResult | LifeDestinyResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);

  const handleDirectionSelect = async (direction: DirectionType) => {
    setError(null);
    setActiveDirection(direction);
    setLoading(true);
    setProgress(0);

    const ctx: OcrContext = {
      ...ocrContext,
      orientation: direction === "marriage" ? orientation : undefined,
    };

    try {
      const result = await generateDirectionAnalysis(ctx, direction, (pct) => setProgress(pct));
      setDirectionResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "分析失败");
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setActiveDirection(null);
    setDirectionResult(null);
    setError(null);
  };

  if (activeDirection && directionResult) {
    if (activeDirection === "kline") {
      const kline = directionResult as LifeDestinyResult;
      return (
        <div className="animate-fade-in space-y-6">
          <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium no-print">
            <ArrowLeft className="w-4 h-4" />
            返回方向选择
          </button>
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-6 space-y-3">
            <h3 className="text-lg font-bold text-gray-800 font-serif-sc">流年运势走势图</h3>
            <LifeKLineChart data={kline.chartData} mode="yearly" />
          </section>
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 sm:p-6">
            <h3 className="text-lg font-bold text-gray-800 font-serif-sc mb-4">大运概览K线图</h3>
            <LifeKLineChart data={groupByDaYun(kline.chartData, kline.analysis.daYunReasons)} mode="dayun" />
          </section>
          <section>
            <AnalysisResult analysis={kline.analysis} />
          </section>
        </div>
      );
    }

    const dr = directionResult as DirectionResult;
    return (
      <div className="animate-fade-in space-y-6">
        <button onClick={handleBack} className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-800 font-medium no-print">
          <ArrowLeft className="w-4 h-4" />
          返回方向选择
        </button>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-800 font-serif-sc">{dr.title}</h2>
            <div className="flex items-center gap-2 bg-indigo-50 px-3 py-1 rounded-full text-xs font-bold text-indigo-700">
              评分 {dr.score}/10
            </div>
          </div>

          {dr.preference && (
            <div className="bg-pink-50 border border-pink-200 rounded-xl px-5 py-3 flex items-center gap-3">
              <Heart className="w-5 h-5 text-pink-500 flex-shrink-0" />
              <p className="text-sm font-medium text-pink-800">{dr.preference}</p>
            </div>
          )}

          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{dr.content}</p>
          </div>

          {dr.highlights.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider">关键发现</h3>
              <div className="grid gap-2">
                {dr.highlights.map((h, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-gray-700 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5">
                    <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    {h}
                  </div>
                ))}
              </div>
            </div>
          )}

          {dr.timeline && dr.timeline.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-bold text-gray-600 uppercase tracking-wider">人生各阶段</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {dr.timeline.map((t, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <h4 className="font-bold text-gray-800 mb-1.5">{t.label}</h4>
                    <p className="text-sm text-gray-600 leading-relaxed">{t.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (loading && activeDirection) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-gray-600 font-medium">
          正在生成「{getDirectionLabel(activeDirection)}」分析...
        </p>
        <div className="w-full max-w-md h-2 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-xs text-gray-400">{progress}%</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-800 font-serif-sc mb-2">选择分析方向</h2>
        <p className="text-sm text-gray-500">
          八字已识别完成，请选择想要深入了解的方向
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {DIRECTION_CARDS.map((card) => (
          <button
            key={card.type}
            onClick={() => handleDirectionSelect(card.type)}
            disabled={loading}
            className="text-left bg-white rounded-xl border border-gray-200 p-5 hover:border-indigo-300 hover:shadow-md hover:shadow-indigo-100/50 transition-all disabled:opacity-50 group"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{card.type === "kline" ? "📈" : card.type === "wealth" ? "💰" : card.type === "marriage" ? "💕" : card.type === "career" ? "💼" : card.type === "health" ? "🏥" : "👨‍👩‍👧‍👦"}</span>
              <h3 className="font-bold text-gray-800 font-serif-sc group-hover:text-indigo-700 transition-colors">{getDirectionLabel(card.type)}</h3>
            </div>
            <p className="text-xs text-gray-500">{card.desc}</p>
          </button>
        ))}
      </div>

      {ocrContext.baziSections && Object.keys(ocrContext.baziSections).length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <button
            onClick={() => setSectionsExpanded(!sectionsExpanded)}
            className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
          >
            <h3 className="text-sm font-bold text-gray-600">八字排盘数据一览</h3>
            {sectionsExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
          </button>
          {sectionsExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {SECTION_ORDER.map((section) => {
                const content = ocrContext.baziSections?.[section];
                if (!content) return null;
                return (
                  <div key={section} className="border border-gray-100 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-600">{section}</div>
                    <div className="p-3 text-xs text-gray-700 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderMarkdownHTML(content) }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-3">
        <h3 className="text-sm font-bold text-gray-600">情感分析设置</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">性取向：</span>
          {(["异性恋", "同性恋", "双性恋"] as const).map((o) => (
            <button
              key={o}
              onClick={() => setOrientation(o)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                orientation === o
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>

      <div className="text-center">
        <button
          onClick={onReset}
          className="text-sm text-gray-400 hover:text-gray-600 underline"
        >
          重新上传图片
        </button>
      </div>
    </div>
  );
};

export default AnalysisHub;
