
import React from 'react';
import { AnalysisData } from '../types';
import { ScrollText, Briefcase, Coins, Heart, Activity, Users, Star, Info, Brain, TrendingUp, Compass } from 'lucide-react';

interface AnalysisResultProps {
  analysis: AnalysisData;
}

const ScoreBar = ({ score }: { score: number }) => {
  const normalizedScore = score > 10 ? Math.round(score / 10) : score;

  let bgClass = "bg-gray-200";
  if (normalizedScore >= 9) bgClass = "bg-emerald-500";
  else if (normalizedScore >= 7) bgClass = "bg-indigo-500";
  else if (normalizedScore >= 5) bgClass = "bg-amber-400";
  else if (normalizedScore >= 3) bgClass = "bg-orange-500";
  else bgClass = "bg-red-400";

  return (
    <div className="flex items-center gap-3 mt-3">
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full ${bgClass} rounded-full transition-all duration-1000 ease-out`}
          style={{ width: `${normalizedScore * 10}%` }}
        />
      </div>
      <span className="text-xs font-bold text-gray-500 min-w-[2.5rem] text-right tabular-nums">
        {normalizedScore} / 10
      </span>
    </div>
  );
};


const Card = ({ title, icon: Icon, content, score, color, extraBadges }: any) => {
  let displayContent: React.ReactNode;

  if (React.isValidElement(content)) {
    displayContent = content;
  } else {
    // Clean content: remove markdown bold symbols (**) to ensure uniform plain text look
    // Ensure content is a string before calling replace to avoid "content.replace is not a function" error
    let safeContent = '';

    if (typeof content === 'string') {
      safeContent = content;
    } else if (content === null || content === undefined) {
      safeContent = '';
    } else if (typeof content === 'object') {
      // If AI returns an object or array (unexpected but possible), stringify it readable
      try {
        // If it's a simple array of strings, join them
        if (Array.isArray(content)) {
          safeContent = content.map((c: any) => String(c)).join('\n');
        } else {
          // Fallback for object
          safeContent = JSON.stringify(content);
        }
      } catch (e) {
        safeContent = String(content);
      }
    } else {
      safeContent = String(content);
    }

    displayContent = safeContent.replace(/\*\*/g, '');
  }

  return (
    <div className={`bg-white p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col h-full relative overflow-hidden`}>
      <div className={`flex items-center justify-between mb-3 ${color}`}>
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-lg bg-opacity-10 ${color.replace('text-', 'bg-')}`}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="font-serif-sc font-bold text-base text-gray-800">{title}</h3>
        </div>
        <Star className="w-3.5 h-3.5 opacity-30" />
      </div>

      {/* Extra Badges for Crypto */}
      {extraBadges && (
        <div className="flex flex-wrap gap-2 mb-3">
          {extraBadges}
        </div>
      )}

      <div className="text-gray-600 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap flex-grow">
        {displayContent}
      </div>
      {typeof score === 'number' && (
        <div className="pt-4 mt-2 border-t border-gray-50">
          <div className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wider">Rating</div>
          <ScoreBar score={score} />
        </div>
      )}
    </div>
  );
};

const AnalysisResult: React.FC<AnalysisResultProps> = ({ analysis }) => {
  return (
    <div className="w-full space-y-8 animate-fade-in-up">
      {/* Bazi Pillars */}
      <div className="flex justify-center gap-2 sm:gap-3 md:gap-8 bg-indigo-900 text-amber-50 p-6 sm:p-8 rounded-2xl shadow-xl overflow-x-auto">
        {(Array.isArray(analysis.bazi) ? analysis.bazi : []).map((pillar, index) => {
          const labels = ['年柱', '月柱', '日柱', '时柱'];
          const colors = ['text-amber-300', 'text-amber-200', 'text-amber-100', 'text-amber-200'];
          return (
            <div key={index} className="text-center min-w-[70px]">
              <div className="text-[10px] uppercase tracking-widest text-indigo-300 mb-2 font-medium">{labels[index]}</div>
              <div className={`text-xl sm:text-2xl md:text-3xl font-serif-sc font-bold tracking-[0.2em] ${colors[index]}`}>{pillar}</div>
            </div>
          );
        })}
      </div>

      {/* Summary with Score */}
      <div className="bg-gradient-to-br from-indigo-50/50 to-white p-4 sm:p-8 rounded-2xl border border-indigo-100">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
          <h3 className="flex items-center gap-2 sm:gap-2.5 font-serif-sc font-bold text-lg sm:text-xl text-indigo-900">
            <div className="p-1.5 bg-indigo-100 rounded-lg">
              <ScrollText className="w-4 h-4 text-indigo-600" />
            </div>
            命理总评
          </h3>
          <div className="w-full md:w-1/3">
            <ScoreBar score={analysis.summaryScore} />
          </div>
        </div>
        <p className="text-gray-600 leading-relaxed whitespace-pre-wrap">{analysis.summary}</p>
      </div>

      {/* Grid for categorical analysis with Scores */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">

        {/* 投资理财建议 */}
        <Card
          title="投资理财"
          icon={TrendingUp}
          content={analysis.crypto}
          score={analysis.cryptoScore}
          color="text-amber-600"
          extraBadges={
            <>
              <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-bold rounded border border-amber-200">
                📈 财运年: {analysis.cryptoYear}
              </span>
              <span className="px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold rounded border border-indigo-200">
                💼 建议: {analysis.cryptoStyle}
              </span>
            </>
          }
        />

        <Card
          title="性格分析"
          icon={Brain}
          content={analysis.personality}
          score={analysis.personalityScore}
          color="text-teal-600"
        />
        <Card
          title="事业行业"
          icon={Briefcase}
          content={analysis.industry}
          score={analysis.industryScore}
          color="text-blue-600"
        />

        {/* Feng Shui Analysis */}
        <Card
          title="发展风水"
          icon={Compass}
          content={analysis.fengShui}
          score={analysis.fengShuiScore}
          color="text-cyan-700"
        />

        <Card
          title="财富层级"
          icon={Coins}
          content={analysis.wealth}
          score={analysis.wealthScore}
          color="text-amber-600"
        />
        <Card
          title="婚姻情感"
          icon={Heart}
          content={analysis.marriage}
          score={analysis.marriageScore}
          color="text-pink-600"
        />
        <Card
          title="身体健康"
          icon={Activity}
          content={analysis.health}
          score={analysis.healthScore}
          color="text-emerald-600"
        />
        <Card
          title="六亲关系"
          icon={Users}
          content={analysis.family}
          score={analysis.familyScore}
          color="text-purple-600"
        />

        {/* Score Explanation Card */}
        <Card
          title="评分讲解"
          icon={Info}
          color="text-gray-500"
          content={
            <div className="space-y-4">
              <ul className="space-y-1 sm:space-y-1.5 font-mono text-[11px] sm:text-xs md:text-sm">
                <li className="flex justify-between items-center border-b border-gray-100 pb-1">
                  <span>0-2分</span>
                  <span className="text-xs px-2 py-0.5 bg-red-100 text-red-600 rounded font-bold">极差</span>
                </li>
                <li className="flex justify-between items-center border-b border-gray-100 pb-1">
                  <span>3-4分</span>
                  <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-600 rounded font-bold">差</span>
                </li>
                <li className="flex justify-between items-center border-b border-gray-100 pb-1">
                  <span>5-6分</span>
                  <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded font-bold">一般</span>
                </li>
                <li className="flex justify-between items-center border-b border-gray-100 pb-1">
                  <span>7-8分</span>
                  <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded font-bold">好</span>
                </li>
                <li className="flex justify-between items-center">
                  <span>9-10分</span>
                  <span className="text-xs px-2 py-0.5 bg-green-100 text-green-600 rounded font-bold">极好</span>
                </li>
              </ul>
              <p className="text-xs text-black leading-relaxed border-t border-gray-100 pt-2 text-justify">
                注：命运还受环境和个人选择影响，八字趋势不能完全代表真实人生，命理学不是玄学，而是帮助我们在人生列车上做出更好选择的哲学工具。一命二运三风水 四积阴德五读书 六名七相八敬神 九遇贵人十养生。
              </p>
            </div>
          }
        />
      </div>
    </div>
  );
};

export default AnalysisResult;
