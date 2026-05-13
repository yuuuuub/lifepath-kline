import React from 'react';
import {
  ComposedChart,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LabelList,
  Line
} from 'recharts';
import { KLinePoint } from '../types';

interface LifeKLineChartProps {
  data: KLinePoint[];
  mode?: 'yearly' | 'dayun';
}

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const dataPoint = payload[0].payload as KLinePoint & { _allData?: KLinePoint[]; _index?: number };
    const isUp = dataPoint.close >= dataPoint.open;

    return (
      <div className="bg-white/95 backdrop-blur-sm p-5 rounded-xl shadow-2xl border border-gray-200 z-50 w-[320px] md:w-[400px]">
        <div className="flex justify-between items-start mb-3 border-b border-gray-100 pb-2">
          <div>
            <p className="text-xl font-bold text-gray-800 font-serif-sc">
              {dataPoint.ganZhi} <span className="text-base text-gray-500 font-sans">({dataPoint.age}岁)</span>
            </p>
            <p className="text-sm text-indigo-600 font-medium mt-1">
              {dataPoint.daYun || ''}
            </p>
          </div>
          <div className={`text-base font-bold px-2 py-1 rounded ${isUp ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
            {isUp ? '吉 ▲' : '凶 ▼'}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs text-gray-500 mb-4 bg-gray-50 p-2 rounded">
          <div className="text-center">
            <span className="block scale-90">开盘</span>
            <span className="font-mono text-gray-700 font-bold">{dataPoint.open}</span>
          </div>
          <div className="text-center">
            <span className="block scale-90">收盘</span>
            <span className="font-mono text-gray-700 font-bold">{dataPoint.close}</span>
          </div>
          <div className="text-center">
            <span className="block scale-90">最高</span>
            <span className="font-mono text-gray-700 font-bold">{dataPoint.high}</span>
          </div>
          <div className="text-center">
            <span className="block scale-90">最低</span>
            <span className="font-mono text-gray-700 font-bold">{dataPoint.low}</span>
          </div>
        </div>

        <div className="text-sm text-gray-700 leading-relaxed text-justify max-h-[200px] overflow-y-auto custom-scrollbar">
          {dataPoint.reason}
        </div>
      </div>
    );
  }
  return null;
};

const CandleShape = (props: any) => {
  const { x, y, width, height, payload, yAxis } = props;

  if (!payload || typeof payload.close !== 'number' || typeof payload.open !== 'number') {
    return null;
  }

  const isUp = payload.close >= payload.open;
  const color = isUp ? '#22c55e' : '#ef4444';
  const strokeColor = isUp ? '#15803d' : '#b91c1c';

  let highY = y;
  let lowY = y + height;

  if (yAxis && typeof yAxis.scale === 'function') {
    try {
      highY = yAxis.scale(payload.high);
      lowY = yAxis.scale(payload.low);
    } catch (e) {
      highY = y;
      lowY = y + height;
    }
  }

  const center = x + width / 2;
  const renderHeight = height < 2 ? 2 : height;

  return (
    <g>
      <line x1={center} y1={highY} x2={center} y2={lowY} stroke={strokeColor} strokeWidth={2} />
      <rect
        x={x}
        y={y}
        width={width}
        height={renderHeight}
        fill={color}
        stroke={strokeColor}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
};

const PeakLabel = (props: any) => {
  const { x, y, width, value, maxHigh } = props;
  if (value !== maxHigh) return null;
  return (
    <g>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        transform={`translate(${x + width / 2 - 6}, ${y - 24}) scale(0.5)`}
        fill="#ef4444"
        stroke="#b91c1c"
        strokeWidth="1"
      />
      <text
        x={x + width / 2}
        y={y - 28}
        fill="#b91c1c"
        fontSize={10}
        fontWeight="bold"
        textAnchor="middle"
      >
        {value}
      </text>
    </g>
  );
};

const YearlyKLineChart: React.FC<{ data: KLinePoint[] }> = ({ data }) => {
  const transformedData = data.map((d, i) => ({
    ...d,
    bodyRange: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
    _allData: data,
    _index: i,
  }));

  const maxHigh = data.length > 0 ? Math.max(...data.map(d => d.high)) : 100;

  return (
    <div className="w-full h-[500px] bg-white p-2 md:p-6 rounded-xl border border-gray-200 shadow-sm relative">
      <div className="mb-4 flex justify-between items-center px-2">
        <h3 className="text-xl font-bold text-gray-800 font-serif-sc">流年K线图</h3>
        <div className="flex gap-4 text-xs font-medium">
          <span className="flex items-center text-green-700 bg-green-50 px-2 py-1 rounded">
            <div className="w-2 h-2 bg-green-500 mr-2 rounded-full"></div> 吉运 (涨)
          </span>
          <span className="flex items-center text-red-700 bg-red-50 px-2 py-1 rounded">
            <div className="w-2 h-2 bg-red-500 mr-2 rounded-full"></div> 凶运 (跌)
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="88%">
        <ComposedChart data={transformedData} margin={{ top: 30, right: 10, left: 0, bottom: 20 }}>
          <defs>
            <linearGradient id="yearlyColor" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0.05} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

          <XAxis
            dataKey="age"
            tick={{ fontSize: 11, fill: '#6b7280' }}
            interval={9}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
            label={{ value: '年龄（岁）', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#9ca3af' }}
          />

          <YAxis
            domain={[0, 'auto']}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            label={{ value: '运势分', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }} />

          <Area
            type="monotone"
            dataKey="score"
            stroke="#22c55e"
            fill="url(#yearlyColor)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 4, fill: '#22c55e', stroke: '#fff', strokeWidth: 2 }}
          />

          <Line
            type="monotone"
            dataKey="high"
            stroke="#ef4444"
            strokeWidth={0.5}
            strokeOpacity={0.3}
            dot={false}
            activeDot={false}
          />

          <Bar
            dataKey="bodyRange"
            shape={<CandleShape />}
            isAnimationActive={true}
            animationDuration={800}
            maxBarSize={12}
          >
            <LabelList
              dataKey="high"
              position="top"
              content={<PeakLabel maxHigh={maxHigh} />}
            />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

const DaYunKLineChart: React.FC<{ data: KLinePoint[] }> = ({ data }) => {
  const transformedData = data.map((d, i) => ({
    ...d,
    bodyRange: [Math.min(d.open, d.close), Math.max(d.open, d.close)],
    labelPoint: d.high,
    _allData: data,
    _index: i,
  }));

  const maxHigh = data.length > 0 ? Math.max(...data.map(d => d.high)) : 100;

  return (
    <div className="w-full h-[550px] bg-white p-2 md:p-6 rounded-xl border border-gray-200 shadow-sm relative">
      <div className="mb-6 flex justify-between items-center px-2">
        <h3 className="text-xl font-bold text-gray-800 font-serif-sc">大运K线图</h3>
        <div className="flex gap-4 text-xs font-medium">
          <span className="flex items-center text-green-700 bg-green-50 px-2 py-1 rounded">
            <div className="w-2 h-2 bg-green-500 mr-2 rounded-full"></div> 吉运 (涨)
          </span>
          <span className="flex items-center text-red-700 bg-red-50 px-2 py-1 rounded">
            <div className="w-2 h-2 bg-red-500 mr-2 rounded-full"></div> 凶运 (跌)
          </span>
        </div>
      </div>

      <ResponsiveContainer width="100%" height="88%">
        <ComposedChart data={transformedData} margin={{ top: 30, right: 10, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />

          <XAxis
            dataKey="ganZhi"
            tick={{ fontSize: 12, fill: '#374151', fontWeight: 600, fontFamily: 'serif' }}
            interval={0}
            axisLine={{ stroke: '#e5e7eb' }}
            tickLine={false}
            label={{ value: '大运', position: 'insideBottomRight', offset: -5, fontSize: 10, fill: '#9ca3af' }}
          />

          <YAxis
            domain={[0, 'auto']}
            tick={{ fontSize: 10, fill: '#6b7280' }}
            axisLine={false}
            tickLine={false}
            label={{ value: '运势分', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#9ca3af' }}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#9ca3af', strokeWidth: 1, strokeDasharray: '4 4' }} />

          <Bar
            dataKey="bodyRange"
            shape={<CandleShape />}
            isAnimationActive={true}
            animationDuration={1500}
            maxBarSize={60}
          >
            <LabelList
              dataKey="high"
              position="top"
              content={<PeakLabel maxHigh={maxHigh} />}
            />
          </Bar>
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export function groupByDaYun(chartData: KLinePoint[], daYunReasons?: Record<string, string>): KLinePoint[] {
  const groups: Map<string, KLinePoint[]> = new Map();
  for (const point of chartData) {
    const key = point.daYun || '童限';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(point);
  }

  return Array.from(groups.entries()).map(([daYun, points]) => {
    const first = points[0];
    const last = points[points.length - 1];
    const ganZhi = daYun === '童限' ? '童限' : daYun.replace('大运', '');
    const avgScore = Math.round(points.reduce((s, p) => s + p.score, 0) / points.length);
    const customReason = daYunReasons?.[daYun];
    return {
      age: first.age,
      year: first.year,
      daYun,
      ganZhi,
      open: first.open,
      close: last.close,
      high: Math.max(...points.map(p => p.high)),
      low: Math.min(...points.map(p => p.low)),
      score: avgScore,
      reason: customReason || `${daYun}：${points[0].age}-${points[points.length - 1].age}岁，均分${avgScore}`,
    };
  });
}

const LifeKLineChart: React.FC<LifeKLineChartProps> = ({ data, mode }) => {
  if (!data || data.length === 0) {
    return <div className="h-[500px] flex items-center justify-center text-gray-400">无数据</div>;
  }

  const resolvedMode = mode || (data.length > 20 ? 'yearly' : 'dayun');

  if (resolvedMode === 'yearly') {
    return <YearlyKLineChart data={data} />;
  }

  return <DaYunKLineChart data={data} />;
};

export default LifeKLineChart;
