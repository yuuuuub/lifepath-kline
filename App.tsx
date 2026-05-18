
import React, { useState } from 'react';
import BaziImageForm from './components/BaziImageForm';
import AnalysisHub from './components/AnalysisHub';
import { OcrContext } from './types';
import { Sparkles } from 'lucide-react';

const App: React.FC = () => {
  const [ocrContext, setOcrContext] = useState<OcrContext | null>(null);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      <header className="w-full bg-gradient-to-r from-gray-900 via-gray-800 to-gray-900 border-b border-white/5 py-5 sticky top-0 z-50 no-print">
        <div className="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-lg shadow-indigo-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-serif-sc font-bold text-white tracking-wide">命运K线</h1>
              <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em]">Lifepath K-Line</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-indigo-300 font-medium bg-white/5 px-3 py-1.5 rounded-full border border-white/10">
            <Sparkles className="w-3.5 h-3.5" />
            AI 大模型驱动
          </div>
        </div>
      </header>

      <main className="w-full max-w-7xl mx-auto px-3 sm:px-4 py-6 md:py-12 flex flex-col gap-8 md:gap-12">

        {!ocrContext && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 animate-fade-in">
            <div className="text-center max-w-2xl flex flex-col items-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full mb-8 text-xs font-medium text-indigo-600">
                <Sparkles className="w-3.5 h-3.5" />
                传统命理 × 现代可视化
              </div>
              <h2 className="text-3xl sm:text-4xl md:text-6xl font-serif-sc font-bold text-gray-900 mb-4 sm:mb-6 leading-tight">
                洞悉命运起伏 <br />
                <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  预见人生轨迹
                </span>
              </h2>
              <p className="text-gray-500 text-base sm:text-lg leading-relaxed mb-6 sm:mb-8 max-w-xl mx-auto">
                结合<strong className="text-gray-700">传统八字命理</strong>与<strong className="text-gray-700">金融可视化技术</strong>，
                将您的一生运势绘制成直观的K线图。
              </p>

              <div className="bg-white/80 backdrop-blur p-4 sm:p-6 rounded-2xl border border-gray-100 shadow-sm mb-6 sm:mb-8 text-left w-full max-w-lg">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                  <span className="w-1 h-5 bg-indigo-600 rounded-full"></span>
                  使用方法
                </h3>
                <ol className="text-sm text-gray-500 space-y-3">
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                    输入姓名和性别，上传问真八字排盘截图
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                    系统自动识别八字，选择分析方向
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    每个方向独立 AI 深度分析，可反复切换
                  </li>
                </ol>
              </div>
            </div>

            <BaziImageForm onSuccess={setOcrContext} />
          </div>
        )}

        {ocrContext && (
          <AnalysisHub
            ocrContext={ocrContext}
            onReset={() => setOcrContext(null)}
          />
        )}
      </main>

      <footer className="w-full border-t border-gray-100 bg-white py-6 mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} 命运K线</p>
        </div>
      </footer>
    </div>
  );
};

export default App;
