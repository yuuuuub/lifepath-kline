
import React, { useState, useMemo } from 'react';
import LifeKLineChart, { groupByDaYun } from './components/LifeKLineChart';
import AnalysisResult from './components/AnalysisResult';
import BaziImageForm from './components/BaziImageForm';
import { LifeDestinyResult } from './types';
import { Sparkles, Download, Printer, Trophy, FileDown } from 'lucide-react';

const App: React.FC = () => {
  const [result, setResult] = useState<LifeDestinyResult | null>(null);
  const [userName, setUserName] = useState<string>('');

  const handleDataImport = (data: LifeDestinyResult) => {
    setResult(data);
    setUserName('');
  };

  const handleExportJson = () => {
    if (!result) return;

    const exportData = {
      bazi: result.analysis.bazi,
      summary: result.analysis.summary,
      summaryScore: result.analysis.summaryScore,
      personality: result.analysis.personality,
      personalityScore: result.analysis.personalityScore,
      industry: result.analysis.industry,
      industryScore: result.analysis.industryScore,
      fengShui: result.analysis.fengShui,
      fengShuiScore: result.analysis.fengShuiScore,
      wealth: result.analysis.wealth,
      wealthScore: result.analysis.wealthScore,
      marriage: result.analysis.marriage,
      marriageScore: result.analysis.marriageScore,
      health: result.analysis.health,
      healthScore: result.analysis.healthScore,
      family: result.analysis.family,
      familyScore: result.analysis.familyScore,
      crypto: result.analysis.crypto,
      cryptoScore: result.analysis.cryptoScore,
      cryptoYear: result.analysis.cryptoYear,
      cryptoStyle: result.analysis.cryptoStyle,
      chartPoints: result.chartData,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `命理分析_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSaveHtml = () => {
    if (!result) return;

    const now = new Date();
    const timeString = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

    const chartContainer = document.querySelector('.recharts-surface');
    const chartSvg = chartContainer ? chartContainer.outerHTML : '<div style="padding:20px;text-align:center;">图表导出失败，请截图保存</div>';

    const analysisContainer = document.getElementById('analysis-result-container');
    const analysisHtml = analysisContainer ? analysisContainer.innerHTML : '';

    const tableRows = result.chartData.map((item, index) => {
      const endAge = isYearly
        ? item.age
        : (index < result.chartData.length - 1
          ? result.chartData[index + 1].age - 1
          : Math.max(item.age + 9, 99));
      const scoreColor = item.close >= item.open ? 'text-green-600' : 'text-red-600';
      const trendIcon = item.close >= item.open ? '▲' : '▼';
      return `
        <tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
          <td class="p-3 border-r border-gray-100 text-center font-mono">${isYearly ? item.age : item.age + '-' + endAge}岁</td>
          <td class="p-3 border-r border-gray-100 text-center font-bold">${item.ganZhi}</td>
          <td class="p-3 border-r border-gray-100 text-center text-sm">${item.daYun || '-'}</td>
          <td class="p-3 border-r border-gray-100 text-center font-bold ${scoreColor}">
            ${item.score} <span class="text-xs">${trendIcon}</span>
          </td>
          <td class="p-3 text-sm text-gray-700 text-justify leading-relaxed">${item.reason}</td>
        </tr>
      `;
    }).join('');

    const detailedTableHtml = `
      <div class="mt-12 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div class="p-6 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
           <div class="w-1 h-5 bg-indigo-600 rounded-full"></div>
           <h3 class="text-xl font-bold text-gray-800 font-serif-sc">${isYearly ? '流年详批全表' : '大运详批全表'}</h3>
           <span class="text-xs text-gray-500 ml-2">(${isYearly ? '由于离线网页无法交互，特此列出所有流年详情' : '由于离线网页无法交互，特此列出所有大运详情'})</span>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="bg-gray-100 text-gray-600 text-sm font-bold uppercase tracking-wider">
                <th class="p-3 border-r border-gray-200 text-center w-24">年龄</th>
                <th class="p-3 border-r border-gray-200 text-center w-28">${isYearly ? '流年干支' : '大运干支'}</th>
                <th class="p-3 border-r border-gray-200 text-center w-28">${isYearly ? '大运' : '大运名称'}</th>
                <th class="p-3 border-r border-gray-200 text-center w-20">评分</th>
                <th class="p-3">${isYearly ? '流年批断' : '大运批断与建议'}</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </div>
      </div>
    `;

    const fullHtml = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${userName || '用户'} - 命运K线命理报告</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;700&family=Inter:wght@400;600&display=swap');
    body { font-family: 'Inter', sans-serif; background-color: #f8f9fa; }
    .font-serif-sc { font-family: 'Noto Serif SC', serif; }
    svg { width: 100% !important; height: auto !important; }
  </style>
</head>
<body class="bg-gray-50 min-h-screen p-4 md:p-12">
  <div class="max-w-6xl mx-auto space-y-10">
    
    <div class="text-center border-b border-gray-200 pb-8">
      <h1 class="text-4xl font-bold font-serif-sc text-gray-900 mb-2">${userName ? userName + '的' : ''}命运K线命理报告</h1>
      <p class="text-gray-500 text-sm">生成时间：${timeString}</p>
    </div>

    <div class="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div class="flex items-center gap-2 mb-6">
        <div class="w-1 h-6 bg-indigo-600 rounded-full"></div>
        <h3 class="text-xl font-bold text-gray-800 font-serif-sc">流年大运走势图</h3>
      </div>
      <div class="w-full overflow-hidden flex justify-center py-4">
        ${chartSvg}
      </div>
      <p class="text-center text-xs text-gray-400 mt-2">注：图表K线颜色根据运势涨跌绘制，数值越高代表运势越强。</p>
    </div>

    <div class="space-y-8">
       ${analysisHtml}
    </div>

    ${detailedTableHtml}

    <div class="text-center text-gray-400 text-sm py-12 border-t border-gray-200 mt-12">
      <p>&copy; ${now.getFullYear()} 命运K线 | 仅供娱乐与文化研究，请勿迷信</p>
    </div>

  </div>
</body>
</html>
    `;

    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${userName || 'User'}_Life_Kline_Report_${now.getTime()}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const peakYearItem = useMemo(() => {
    if (!result || !result.chartData.length) return null;
    return result.chartData.reduce((prev, current) => (prev.high > current.high) ? prev : current);
  }, [result]);

  const isYearly = useMemo(() => {
    return result ? result.chartData.length > 20 : false;
  }, [result]);

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

      <main className="w-full max-w-7xl mx-auto px-4 py-8 md:py-12 flex flex-col gap-12">

        {!result && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10 animate-fade-in">
            <div className="text-center max-w-2xl flex flex-col items-center">
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-indigo-50 border border-indigo-100 rounded-full mb-8 text-xs font-medium text-indigo-600">
                <Sparkles className="w-3.5 h-3.5" />
                传统命理 × 现代可视化
              </div>
              <h2 className="text-4xl md:text-6xl font-serif-sc font-bold text-gray-900 mb-6 leading-tight">
                洞悉命运起伏 <br />
                <span className="bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  预见人生轨迹
                </span>
              </h2>
              <p className="text-gray-500 text-lg leading-relaxed mb-8 max-w-xl mx-auto">
                结合<strong className="text-gray-700">传统八字命理</strong>与<strong className="text-gray-700">金融可视化技术</strong>，
                将您的一生运势绘制成直观的K线图。
              </p>

              <div className="bg-white/80 backdrop-blur p-6 rounded-2xl border border-gray-100 shadow-sm mb-8 text-left w-full max-w-lg">
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
                    系统自动调用 AI 识别并生成分析报告
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="flex-shrink-0 w-5 h-5 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                    自动渲染完整人生 K 线与详细分析
                  </li>
                </ol>
              </div>
            </div>

            <BaziImageForm
              onSuccess={(data, name) => {
                handleDataImport(data);
                setUserName(name);
              }}
            />
          </div>
        )}

        {result && (
          <div className="animate-fade-in space-y-10">

            <div className="flex flex-col md:flex-row justify-between items-end md:items-center pb-6 border-b border-gray-100 gap-4">
              <div>
                <h2 className="text-2xl font-bold font-serif-sc text-gray-900">
                  {userName ? `${userName}的` : ''}命盘分析报告
                </h2>
              </div>

              <div className="flex flex-wrap gap-2 no-print">
                <button
                  onClick={handleExportJson}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <FileDown className="w-4 h-4" />
                  导出JSON
                </button>
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Printer className="w-4 h-4" />
                  保存PDF
                </button>
                <button
                  onClick={handleSaveHtml}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Download className="w-4 h-4" />
                  保存网页
                </button>
                <button
                  onClick={() => { setResult(null); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-all text-sm"
                >
                  ← 重新排盘
                </button>
              </div>
            </div>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 break-inside-avoid">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 font-serif-sc">
                  <span className="w-1 h-5 bg-indigo-600 rounded-full"></span>
                  流年运势走势图
                </h3>
                {peakYearItem && (
                  <p className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1 inline-flex items-center gap-2 self-start mt-1">
                    <Trophy className="w-3 h-3 text-amber-500" />
                    人生巅峰：{peakYearItem.ganZhi} ({peakYearItem.age}岁)，评分 <span className="text-amber-600">{peakYearItem.high}</span>
                  </p>
                )}
              </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 no-print">
                    <span className="text-green-600 font-medium">绿色K线</span> 运势上涨，
                    <span className="text-red-600 font-medium">红色K线</span> 运势下跌，
                    <span className="text-amber-500">★</span> 为最高点
                  </p>
                  <LifeKLineChart data={result.chartData} mode="yearly" />
                </div>
            </section>

            <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4 break-inside-avoid">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2 font-serif-sc">
                  <span className="w-1 h-5 bg-purple-600 rounded-full"></span>
                  大运概览K线图
                </h3>
              </div>

                <div className="space-y-2">
                  <p className="text-xs text-gray-400 no-print">
                    <span className="text-green-600 font-medium">绿色K线</span> 大运上涨，
                    <span className="text-red-600 font-medium">红色K线</span> 大运下跌
                  </p>
                  <LifeKLineChart data={groupByDaYun(result.chartData, result.analysis.daYunReasons)} mode="dayun" />
                </div>
            </section>

            <section id="analysis-result-container">
              <AnalysisResult analysis={result.analysis} />
            </section>

            <div className="hidden print:block mt-8 break-before-page">
              <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2 mb-4">
                <div className="w-1 h-5 bg-indigo-600 rounded-full"></div>
                <h3 className="text-xl font-bold text-gray-800 font-serif-sc">{isYearly ? '流年详批全表' : '大运详批全表'}</h3>
              </div>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100 text-gray-600 font-bold uppercase tracking-wider">
                    <th className="p-2 border border-gray-200 text-center w-20">年龄</th>
                    <th className="p-2 border border-gray-200 text-center w-24">{isYearly ? '流年干支' : '大运干支'}</th>
                    <th className="p-2 border border-gray-200 text-center w-24">{isYearly ? '所属大运' : '大运名称'}</th>
                    <th className="p-2 border border-gray-200 text-center w-16">评分</th>
                    <th className="p-2 border border-gray-200">{isYearly ? '流年批断' : '大运批断'}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.chartData.map((item, index) => {
                    const endAge = isYearly ? item.age : (
                      index < result.chartData.length - 1
                        ? result.chartData[index + 1].age - 1
                        : Math.max(item.age + 9, 99)
                    );
                    return (
                    <tr key={item.age} className="border-b border-gray-100 break-inside-avoid">
                      <td className="p-2 border border-gray-100 text-center font-mono">{isYearly ? item.age : `${item.age}-${endAge}`}</td>
                      <td className="p-2 border border-gray-100 text-center font-bold">{item.ganZhi}</td>
                      <td className="p-2 border border-gray-100 text-center">{item.daYun || '-'}</td>
                      <td className={`p-2 border border-gray-100 text-center font-bold ${item.close >= item.open ? 'text-green-600' : 'text-red-600'}`}>
                        {item.score}
                      </td>
                      <td className="p-2 border border-gray-100 text-gray-700 text-justify text-xs leading-relaxed">
                        {item.reason}
                      </td>
                    </tr>
                  );
                  })}
                </tbody>
              </table>

              <div className="mt-8 pt-4 border-t border-gray-200 flex justify-center items-center text-xs text-gray-500">
                <span>生成时间：{new Date().toLocaleString()}</span>
              </div>
            </div>
          </div>
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
