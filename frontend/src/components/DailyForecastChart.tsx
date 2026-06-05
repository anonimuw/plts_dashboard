'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import type { DailyForecast } from '@/types';

interface Props {
  data: DailyForecast | undefined;
  isLoading: boolean;
}

export default function DailyForecastChart({ data, isLoading }: Props) {
  const [useKwh, setUseKwh] = useState(false);
  const convert = (v: number) => (useKwh ? v / 1000 : v);
  const unit = useKwh ? 'kW' : 'W';
  const energyUnit = useKwh ? 'kWh' : 'Wh';

  const chartData = data
    ? data.labels.map((label, i) => ({
        time: label,
        value: convert(data.values[i]),
        upper: convert(data.confidence_upper?.[i] ?? data.values[i]),
        lower: convert(data.confidence_lower?.[i] ?? data.values[i]),
      }))
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.2 }}
      className="space-y-0"
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-400" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Forecast Harian (24 Jam)
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setUseKwh(!useKwh)}
              className="rounded-lg border border-white/10 px-3 py-1 font-mono text-xs font-bold text-amber-400 transition-all hover:border-amber-400/50 hover:bg-amber-400/10"
            >
              {unit}
            </button>
            {data?.method && (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                  data.method === 'lstm'
                    ? 'bg-amber-400/15 text-amber-400'
                    : 'bg-red-400/15 text-red-400'
                }`}
              >
                {data.method === 'lstm' ? 'Hybrid 50/50' : 'Fallback'}
              </span>
            )}
          </div>
        </div>

        <div className="p-4">
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-600 border-t-amber-400" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorBand" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.08} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                />
                <YAxis
                  tick={{ fill: '#94a3b8', fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  label={{
                    value: `Daya (${unit})`,
                    angle: -90,
                    position: 'insideLeft',
                    fill: '#94a3b8',
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid rgba(245,158,11,0.3)',
                    borderRadius: '12px',
                    fontSize: '13px',
                    color: '#f1f5f9',
                  }}
                  labelStyle={{ color: '#f1f5f9', fontWeight: 600 }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => [`${value.toFixed(2)} ${unit}`, 'Prediksi']}
                  labelFormatter={(label) => `Jam ${label}`}
                />
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="none"
                  fill="url(#colorBand)"
                  fillOpacity={1}
                  tooltipType="none"
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="none"
                  fill="transparent"
                  tooltipType="none"
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  fill="url(#colorValue)"
                  fillOpacity={1}
                  dot={{ fill: '#f59e0b', r: 2 }}
                  activeDot={{ r: 5, fill: '#f59e0b', stroke: '#fff', strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {data && (
          <div className="flex flex-wrap gap-6 border-t border-white/10 px-5 py-3">
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                Total Energi
              </span>
              <div className="font-mono text-sm font-bold text-white">
                {convert(data.total_energy_wh).toFixed(1)} {energyUnit}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                Puncak Daya
              </span>
              <div className="font-mono text-sm font-bold text-white">
                {convert(data.peak_power_w).toFixed(1)} {unit}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-semibold uppercase text-slate-500">
                Dibuat
              </span>
              <div className="font-mono text-sm text-slate-400">
                {new Date(data.generated_at).toLocaleString('id-ID')}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
