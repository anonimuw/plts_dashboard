'use client';

import { motion } from 'framer-motion';
import {
  Info,
  LayoutDashboard,
  MapPin,
  TrendingUp,
  CalendarDays,
  Clock,
  AlertTriangle,
  Sun,
  Zap,
  Cpu,
} from 'lucide-react';

const FEATURES = [
  {
    icon: LayoutDashboard,
    title: 'Dashboard',
    color: 'text-blue-400',
    description:
      'Halaman utama yang menampilkan status real-time sistem PLTS. Informasi meliputi daya output saat ini (Watt), intensitas radiasi matahari (GHI), suhu udara, dan status operasi. Data diperbarui otomatis setiap 15 menit dari Open-Meteo API.',
  },
  {
    icon: MapPin,
    title: 'Lokasi & Sistem',
    color: 'text-amber-400',
    description:
      'Menampilkan peta interaktif lokasi instalasi PLTS di Pujon, Kabupaten Malang menggunakan Leaflet + OpenStreetMap. Di bawah peta terdapat spesifikasi teknis panel surya (kapasitas 400Wp, 2 panel, efisiensi 19%) dan metrik performa model LSTM yang digunakan untuk prediksi (R², RMSE, MAE, MAPE).',
  },
  {
    icon: TrendingUp,
    title: 'Forecast Harian',
    color: 'text-emerald-400',
    description:
      'Prediksi output daya PLTS untuk 24 jam ke depan dengan granularitas per jam. Menggunakan pendekatan hybrid blend: 50% prediksi LSTM + 50% kalkulasi fisika untuk meningkatkan robustness pada kondisi ekstrem. Ditampilkan sebagai line chart dengan confidence band (±MAPE). Prediksi malam hari (GHI < 10 W/m²) otomatis di-set ke 0.',
  },
  {
    icon: CalendarDays,
    title: 'Forecast Mingguan',
    color: 'text-purple-400',
    description:
      'Prediksi total energi harian (Wh) untuk 7 hari ke depan. Sistem menghitung 168 jam prediksi per-jam lalu mengagregasi per hari. Ditampilkan sebagai bar chart dengan ikon cuaca (cerah/berawan/hujan) dari prakiraan Open-Meteo dan confidence interval yang melebar untuk hari ke-5 sampai ke-7.',
  },
  {
    icon: Clock,
    title: 'Historis',
    color: 'text-cyan-400',
    description:
      'Menampilkan perbandingan data aktual vs prediksi untuk 48 jam terakhir. Garis biru menunjukkan output daya aktual (dihitung dari data cuaca nyata), sedangkan garis kuning putus-putus menunjukkan prediksi LSTM. Berguna untuk memvalidasi akurasi model secara visual (backtest).',
  },
  {
    icon: AlertTriangle,
    title: 'Alert & Notifikasi',
    color: 'text-yellow-400',
    description:
      'Banner peringatan otomatis di halaman Dashboard berdasarkan prediksi energi harian. Jika produksi diprediksi < 200 Wh, muncul peringatan "produksi rendah". Jika > 500 Wh, muncul notifikasi "produksi tinggi — waktu yang baik untuk charging". Threshold dapat dikonfigurasi.',
  },
];

const HOW_IT_WORKS = [
  {
    icon: Sun,
    step: '1',
    title: 'Ambil Data Cuaca',
    description: 'Sistem mengambil data radiasi matahari (GHI), suhu, dan kecepatan angin dari Open-Meteo API secara berkala.',
  },
  {
    icon: Cpu,
    step: '2',
    title: 'Hitung Fitur',
    description: 'Dari data cuaca, dihitung 8 fitur: P_out, GHI, T_amb, I_out, T_cell, wind_speed, solar_zenith, dan solar_azimuth menggunakan model fisika PLTS dan pvlib.',
  },
  {
    icon: TrendingUp,
    step: '3',
    title: 'Prediksi LSTM',
    description: 'Model LSTM menerima window 24 jam (24×8 fitur) yang sudah dinormalisasi, lalu memprediksi P_out jam berikutnya. Hasil di-blend dengan kalkulasi fisika.',
  },
  {
    icon: Zap,
    step: '4',
    title: 'Tampilkan Hasil',
    description: 'Prediksi ditampilkan dalam chart interaktif dengan confidence band. Hasil juga di-log ke SQLite untuk keperluan backtest di kemudian hari.',
  },
];

export default function About() {
  return (
    <div className="space-y-6">
      {/* Intro */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <Info size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Tentang PLTS Dashboard
          </h2>
        </div>
        <div className="p-5">
          <p className="text-sm leading-relaxed text-slate-300">
            PLTS Dashboard adalah web application untuk monitoring dan forecasting output daya
            sistem Pembangkit Listrik Tenaga Surya (PLTS) off-grid 400Wp yang berlokasi di Pujon,
            Kabupaten Malang, Jawa Timur. Dashboard ini menggabungkan model deep learning{' '}
            <span className="font-semibold text-amber-400">LSTM</span> dengan kalkulasi fisika
            untuk menghasilkan prediksi output daya yang akurat, dan menampilkannya dalam
            visualisasi interaktif yang terinspirasi dari Global Solar Atlas.
          </p>
        </div>
      </motion.div>

      {/* How It Works */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.1 }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <Zap size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Cara Kerja Sistem
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.15 + i * 0.08 }}
                className="relative rounded-xl border border-white/5 bg-white/5 p-4"
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400/15 text-xs font-bold text-amber-400">
                    {item.step}
                  </span>
                  <Icon size={16} className="text-slate-400" />
                </div>
                <h4 className="mb-1 text-sm font-semibold text-slate-200">{item.title}</h4>
                <p className="text-xs leading-relaxed text-slate-400">{item.description}</p>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

      {/* Feature List */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className="overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm"
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-5 py-3">
          <LayoutDashboard size={16} className="text-amber-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300">
            Fitur-Fitur
          </h2>
        </div>
        <div className="divide-y divide-white/5">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.25 + i * 0.06 }}
                className="flex gap-4 p-5"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5">
                  <Icon size={20} className={feature.color} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-200">{feature.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-400">
                    {feature.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </motion.div>

    </div>
  );
}
