'use client';

import { motion } from 'framer-motion';
import {
  Lightbulb,
  BatteryCharging,
  BatteryLow,
  Sun,
  Moon,
  Zap,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import type { StatusData, DailyForecast } from '@/types';

interface Props {
  status: StatusData | undefined;
  daily: DailyForecast | undefined;
}

interface Advice {
  icon: typeof Lightbulb;
  iconColor: string;
  bgColor: string;
  borderColor: string;
  title: string;
  description: string;
  tips: string[];
}

function getAdvice(status: StatusData | undefined, daily: DailyForecast | undefined): Advice {
  if (!status) {
    return {
      icon: AlertTriangle,
      iconColor: 'text-slate-400',
      bgColor: 'bg-slate-400/5',
      borderColor: 'border-slate-400/20',
      title: 'Memuat Data...',
      description: 'Menunggu data status dari sistem PLTS.',
      tips: [],
    };
  }

  const power = status.power_w;
  const totalEnergy = daily?.total_energy_wh ?? 0;
  const peakPower = daily?.peak_power_w ?? 0;
  const maxCapacity = 400;
  const ratio = power / maxCapacity;

  if (!status.is_daytime) {
    return {
      icon: Moon,
      iconColor: 'text-indigo-400',
      bgColor: 'bg-indigo-400/5',
      borderColor: 'border-indigo-400/20',
      title: 'Mode Malam — Tidak Ada Produksi',
      description: 'Panel surya tidak menerima sinar matahari. Gunakan energi yang tersimpan di baterai dengan bijak.',
      tips: [
        'Matikan peralatan yang tidak diperlukan untuk menghemat baterai.',
        'Hindari penggunaan beban berat (pompa air, setrika) dari baterai.',
        'Pastikan baterai tidak terdischarge di bawah 50% (DoD aman).',
        totalEnergy > 500
          ? `Prediksi besok: ${totalEnergy.toFixed(0)} Wh — produksi cukup tinggi.`
          : totalEnergy > 0
            ? `Prediksi besok: ${totalEnergy.toFixed(0)} Wh — hemat energi malam ini.`
            : '',
      ].filter(Boolean),
    };
  }

  if (ratio >= 0.6) {
    return {
      icon: BatteryCharging,
      iconColor: 'text-emerald-400',
      bgColor: 'bg-emerald-400/5',
      borderColor: 'border-emerald-400/20',
      title: `Output Saat Ini Tinggi — ${power.toFixed(0)}W (${(ratio * 100).toFixed(0)}% kapasitas)`,
      description: 'Output daya sangat baik. Manfaatkan waktu ini untuk kebutuhan energi besar dan pengisian baterai.',
      tips: [
        'Prioritaskan charging baterai hingga penuh (100% SoC).',
        'Jalankan beban berat: pompa air, mesin cuci, atau peralatan daya tinggi.',
        'Charge perangkat elektronik (laptop, HP, power bank).',
        'Jika baterai sudah penuh, gunakan energi untuk beban produktif agar tidak terbuang.',
      ],
    };
  }

  if (ratio >= 0.35) {
    return {
      icon: Sun,
      iconColor: 'text-amber-400',
      bgColor: 'bg-amber-400/5',
      borderColor: 'border-amber-400/20',
      title: `Output Saat Ini Sedang — ${power.toFixed(0)}W (${(ratio * 100).toFixed(0)}% kapasitas)`,
      description: 'Output daya cukup untuk kebutuhan harian normal dan pengisian baterai secara bertahap.',
      tips: [
        'Charging baterai berjalan normal — hindari beban berat bersamaan.',
        'Cocok untuk beban ringan-sedang: lampu, kipas, TV, charger HP.',
        'Tunda penggunaan beban berat (>200W) hingga output meningkat.',
        peakPower > power
          ? `Peak hari ini diprediksi ${peakPower.toFixed(0)}W — tunggu puncak untuk beban berat.`
          : '',
      ].filter(Boolean),
    };
  }

  if (ratio >= 0.1) {
    return {
      icon: BatteryLow,
      iconColor: 'text-orange-400',
      bgColor: 'bg-orange-400/5',
      borderColor: 'border-orange-400/20',
      title: `Output Saat Ini Rendah — ${power.toFixed(0)}W (${(ratio * 100).toFixed(0)}% kapasitas)`,
      description: 'Output daya terbatas, kemungkinan cuaca mendung atau pagi/sore hari. Hemat penggunaan energi.',
      tips: [
        'Hanya gunakan beban esensial: lampu hemat energi, charger HP.',
        'Matikan peralatan yang tidak perlu (TV, kipas tambahan).',
        'Hindari charging baterai dari sumber lain kecuali darurat.',
        totalEnergy < 300
          ? `Total energi hari ini diprediksi rendah (${totalEnergy.toFixed(0)} Wh) — hemat energi.`
          : '',
      ].filter(Boolean),
    };
  }

  return {
    icon: AlertTriangle,
    iconColor: 'text-red-400',
    bgColor: 'bg-red-400/5',
    borderColor: 'border-red-400/20',
    title: `Output Saat Ini Sangat Rendah — ${power.toFixed(0)}W`,
    description: 'Hampir tidak ada output daya. Kemungkinan cuaca sangat mendung, hujan lebat, atau panel terhalang.',
    tips: [
      'Minimalisir semua penggunaan listrik — hanya untuk kebutuhan kritis.',
      'Periksa apakah panel surya tertutup debu, daun, atau bayangan.',
      'Gunakan baterai dengan hemat — jaga SoC di atas 50%.',
      'Pertimbangkan sumber energi cadangan jika tersedia.',
    ],
  };
}

export default function PowerAdvisor({ status, daily }: Props) {
  const advice = getAdvice(status, daily);
  const Icon = advice.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4 }}
      className={`overflow-hidden rounded-2xl border ${advice.borderColor} ${advice.bgColor} backdrop-blur-sm`}
    >
      <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
        <Lightbulb size={16} className="text-amber-400" />
        <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
          Rekomendasi Penggunaan Energi
        </h2>
      </div>

      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${advice.bgColor}`}>
            <Icon size={24} className={advice.iconColor} />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-slate-200">{advice.title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{advice.description}</p>
          </div>
        </div>

        {advice.tips.length > 0 && (
          <div className="mt-4 space-y-2">
            {advice.tips.map((tip, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: 0.5 + i * 0.08 }}
                className="flex items-start gap-2"
              >
                <CheckCircle size={14} className={`mt-0.5 shrink-0 ${advice.iconColor}`} />
                <p className="text-xs leading-relaxed text-slate-300">{tip}</p>
              </motion.div>
            ))}
          </div>
        )}

        {daily && status?.is_daytime && (
          <div className="mt-4 flex gap-3">
            <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-slate-500">Total Hari Ini</p>
              <p className="text-sm font-bold text-slate-200">{daily.total_energy_wh.toFixed(0)} Wh</p>
            </div>
            <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-slate-500">Peak Prediksi</p>
              <p className="text-sm font-bold text-slate-200">{daily.peak_power_w.toFixed(0)} W</p>
            </div>
            <div className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-center">
              <p className="text-[10px] uppercase text-slate-500">Saat Ini</p>
              <p className="text-sm font-bold text-slate-200">{status.power_w.toFixed(0)} W</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
