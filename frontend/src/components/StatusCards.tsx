'use client';

import { motion } from 'framer-motion';
import { Zap, Sun, Thermometer, Radio, BatteryCharging, TrendingUp } from 'lucide-react';
import type { StatusData, DailyForecast } from '@/types';

interface Props {
  data: StatusData | undefined;
  daily: DailyForecast | undefined;
  isLoading: boolean;
}

function Skeleton() {
  return <div className="h-8 w-24 animate-pulse rounded-md bg-white/10" />;
}

export default function StatusCards({ data, daily, isLoading }: Props) {
  const cards = [
    {
      key: 'power',
      label: 'Daya Output',
      value: data ? `${data.power_w.toFixed(1)}` : '—',
      sub: 'Watt',
      icon: Zap,
      color: 'text-amber-400',
    },
    {
      key: 'ghi',
      label: 'Irradiance (GHI)',
      value: data ? `${data.ghi_wm2.toFixed(0)}` : '—',
      sub: 'W/m²',
      icon: Sun,
      color: 'text-yellow-400',
    },
    {
      key: 'temp',
      label: 'Suhu Udara',
      value: data ? `${data.temperature_c.toFixed(1)}` : '—',
      sub: '°C',
      icon: Thermometer,
      color: 'text-orange-400',
    },
    {
      key: 'status',
      label: 'Status Sistem',
      value: data ? (data.is_daytime ? 'Aktif' : 'Malam') : '—',
      sub: data
        ? new Date(data.timestamp).toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
          }) + ' WIB'
        : '',
      icon: Radio,
      color: 'text-emerald-400',
      valueColor: data?.is_daytime ? 'text-emerald-400' : data ? 'text-red-400' : '',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Status Cards Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card, i) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition-all hover:border-amber-400/30 hover:bg-white/10"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {card.label}
                </span>
                <Icon size={16} className={card.color} />
              </div>
              {isLoading ? (
                <Skeleton />
              ) : (
                <>
                  <div className={`font-mono text-2xl font-bold sm:text-3xl ${'valueColor' in card && card.valueColor ? card.valueColor : 'text-white'}`}>
                    {card.value}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{card.sub}</div>
                </>
              )}
              <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-400/5 transition-all group-hover:bg-amber-400/10" />
            </motion.div>
          );
        })}
      </div>

      {/* Summary Row */}
      {daily && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.35 }}
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
            <BatteryCharging size={20} className="text-amber-400" />
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Energi Hari Ini</div>
              <div className="font-mono text-lg font-bold text-white">
                {daily.total_energy_wh.toFixed(0)} <span className="text-xs text-slate-400">Wh</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm">
            <TrendingUp size={20} className="text-amber-400" />
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Puncak Daya</div>
              <div className="font-mono text-lg font-bold text-white">
                {daily.peak_power_w.toFixed(1)} <span className="text-xs text-slate-400">W</span>
              </div>
            </div>
          </div>
          <div className="hidden items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur-sm sm:flex">
            <div className={`h-2.5 w-2.5 rounded-full ${daily.method === 'lstm' ? 'bg-emerald-400' : 'bg-red-400'}`} />
            <div>
              <div className="text-[10px] font-semibold uppercase text-slate-500">Metode</div>
              <div className="text-sm font-bold text-white">
                {daily.method === 'lstm' ? 'Hybrid (LSTM + Fisika)' : 'Physics Fallback'}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
