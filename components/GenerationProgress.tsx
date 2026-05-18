import React, { useState, useEffect, useCallback } from "react";
import { Camera, Brain, ChevronRight, Sparkles } from "lucide-react";
import { ProgressStage } from "../services/deepseekService";
import { BAZI_FACTS } from "../constants";

interface GenerationProgressProps {
  stage: ProgressStage | null;
  progress: number;
  visible: boolean;
}

const GenerationProgress: React.FC<GenerationProgressProps> = ({ stage, progress, visible }) => {
  const [factIndex, setFactIndex] = useState(0);
  const [fade, setFade] = useState(true);

  const nextFact = useCallback(() => {
    setFade(false);
    setTimeout(() => {
      setFactIndex((prev) => (prev + 1) % BAZI_FACTS.length);
      setFade(true);
    }, 300);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(nextFact, 10000);
    return () => clearInterval(interval);
  }, [visible, nextFact]);

  if (!visible) return null;

  const isOcr = stage === "ocr";
  const isCached = stage === "cached";
  const isGenerating = stage === "generating";
  const pct = progress || 5;

  const stageLabel = (() => {
    if (isCached) return "命中缓存，秒开结果...";
    if (isGenerating && pct >= 90) return "即将完成...";
    if (isGenerating) return `AI 正在生成完整报告（${pct}%）...`;
    if (isOcr) return "识别图片中的八字信息...";
    return "准备中...";
  })();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-3 sm:mx-4 bg-white rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-indigo-600 text-white p-2.5 rounded-xl">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-gray-800 font-serif-sc">正在生成命运K线</h3>
            <p className="text-xs text-gray-500">{stageLabel}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mb-3 text-xs font-medium">
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${isCached ? 'bg-green-500 text-white' : isOcr ? 'bg-indigo-600 text-white scale-110 shadow-lg shadow-indigo-200' : isGenerating ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {isGenerating || isCached ? '\u2713' : '1'}
            </div>
            <span className={isOcr ? 'text-indigo-700' : isGenerating || isCached ? 'text-green-600' : 'text-gray-400'}>识别</span>
          </div>
          <ChevronRight className={`w-3 h-3 ${isGenerating || isCached ? 'text-green-400' : 'text-gray-300'}`} />
          <div className="flex items-center gap-1.5">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 ${isGenerating ? 'bg-indigo-600 text-white scale-110 shadow-lg shadow-indigo-200' : isCached ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {isCached ? '\u2713' : '2'}
            </div>
            <span className={isGenerating ? 'text-indigo-700' : isCached ? 'text-green-600' : 'text-gray-400'}>生成</span>
          </div>
        </div>

        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className="h-full rounded-full transition-all duration-300 ease-out"
            style={{
              width: `${Math.max(2, pct)}%`,
              background: 'linear-gradient(90deg, #6366f1, #a855f7)',
            }}
          />
        </div>
        <p className="text-right text-xs text-gray-400 mb-5">{pct}%</p>

        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            {isOcr && <Camera className="w-4 h-4 text-indigo-500 animate-pulse" />}
            {isCached && <Brain className="w-4 h-4 text-green-500" />}
            {isGenerating && <Brain className="w-4 h-4 text-purple-500 animate-pulse" />}
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">
              {isOcr ? 'OCR 识别' : isCached ? '命中缓存' : isGenerating ? 'AI 推理' : '初始化'}
            </span>
          </div>
        </div>

        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100 min-h-[80px] flex items-center">
          <div className={`w-full transition-opacity duration-300 ${fade ? 'opacity-100' : 'opacity-0'}`}>
            <p className="text-sm text-indigo-900 leading-relaxed font-serif-sc">
              {BAZI_FACTS[factIndex]}
            </p>
            <p className="text-xs text-indigo-400 mt-2 text-right">
              {factIndex + 1}/{BAZI_FACTS.length}
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">
          {isCached ? '相同八字已生成过，直接返回上次结果' : pct >= 90 ? '即将完成...' : '数据量较大，请耐心等待'}
        </p>
      </div>
    </div>
  );
};

export default GenerationProgress;
