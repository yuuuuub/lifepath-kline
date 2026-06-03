
import React, { useState, useCallback } from 'react';
import BaziImageForm from './components/BaziImageForm';
import AnalysisHub from './components/AnalysisHub';
import { OcrContext } from './types';
import { Sparkles, Feather } from 'lucide-react';

const App: React.FC = () => {
  const [ocrContext, setOcrContext] = useState<OcrContext | null>(null);
  const [resetCount, setResetCount] = useState(0);

  const handleReset = useCallback(() => {
    setOcrContext(null);
    setResetCount(c => c + 1);
  }, []);

  return (
    <div className="min-h-screen bg-[#f7f4ef] text-slate-900 flex flex-col items-center">
      <header className="w-full bg-white/75 backdrop-blur border-b border-slate-200/70 py-4 sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-sm">
              <Feather className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif-sc font-bold text-slate-900 tracking-wide">命运K线</h1>
              <p className="text-[10px] text-slate-500 uppercase tracking-[0.18em]">Lifepath K-Line</p>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full max-w-6xl mx-auto px-3 sm:px-4 py-6 md:py-10 flex flex-col gap-8 md:gap-12">

        {!ocrContext && (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_520px] items-center gap-8 md:gap-12 min-h-[72vh] animate-fade-in">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-white/80 border border-slate-200 rounded-full mb-7 text-xs font-medium text-slate-600 shadow-sm">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                先上传，再看结果
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif-sc font-bold text-slate-950 mb-4 sm:mb-6 leading-tight">
                一张排盘图
                <br />
                看清人生起伏
              </h2>
              <p className="text-slate-600 text-base sm:text-lg leading-relaxed mb-6 sm:mb-8 max-w-xl">
                上传截图后，系统会自动识别并整理，先给你一份清楚的总览，再展开更细的分析。
              </p>
              <div className="flex flex-wrap gap-2">
                <span className="px-3 py-1.5 rounded-full bg-white/90 border border-slate-200 text-xs text-slate-600 shadow-sm">总览先出</span>
                <span className="px-3 py-1.5 rounded-full bg-white/90 border border-slate-200 text-xs text-slate-600 shadow-sm">结果分段加载</span>
                <span className="px-3 py-1.5 rounded-full bg-white/90 border border-slate-200 text-xs text-slate-600 shadow-sm">看起来更轻</span>
              </div>
            </div>

            <BaziImageForm onSuccess={setOcrContext} />
          </div>
        )}

        {ocrContext && (
          <AnalysisHub
            key={resetCount}
            ocrContext={ocrContext}
            onReset={handleReset}
          />
        )}
      </main>

      <footer className="w-full border-t border-slate-200 bg-white py-6 mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-slate-400">&copy; {new Date().getFullYear()} 命运K线</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
