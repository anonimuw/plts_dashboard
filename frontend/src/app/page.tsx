'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ThemeProvider from '@/components/ThemeProvider';
import Sidebar, { type Page } from '@/components/Sidebar';
import AlertBanner from '@/components/AlertBanner';
import StatusCards from '@/components/StatusCards';
import LocationSystem from '@/components/LocationSystem';
import DailyForecastChart from '@/components/DailyForecastChart';
import WeeklyForecastChart from '@/components/WeeklyForecastChart';
import HistoryChart from '@/components/HistoryChart';
import PowerAdvisor from '@/components/PowerAdvisor';
import About from '@/components/About';
import { useStatus, useDailyForecast, useWeeklyForecast, useHistory } from '@/hooks/useApi';

const PAGE_TITLES: Record<Page, string> = {
  dashboard: 'Dashboard',
  location: 'Lokasi & Sistem',
  daily: 'Forecast Harian',
  weekly: 'Forecast Mingguan',
  history: 'Historis',
  about: 'Tentang',
};

export default function Home() {
  const [activePage, setActivePage] = useState<Page>('dashboard');

  const { data: status, isLoading: statusLoading } = useStatus();
  const { data: daily, isLoading: dailyLoading } = useDailyForecast();
  const { data: weekly, isLoading: weeklyLoading } = useWeeklyForecast();
  const { data: history, isLoading: historyLoading } = useHistory();

  return (
    <ThemeProvider>
      <div className="min-h-screen">
        <Sidebar activePage={activePage} onNavigate={setActivePage} />

        {/* Main Content */}
        <main className="pb-20 md:pl-64 md:pb-0">
          {/* Page Header */}
          <div className="border-b border-white/10 bg-slate-900/50 px-6 py-4 backdrop-blur-sm">
            <h2 className="text-lg font-bold text-white">{PAGE_TITLES[activePage]}</h2>
          </div>

          <div className="p-4 sm:p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={activePage}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                {activePage === 'dashboard' && (
                  <div className="space-y-4">
                    <AlertBanner totalEnergyWh={daily?.total_energy_wh} />
                    <StatusCards data={status} daily={daily} isLoading={statusLoading} />
                    <PowerAdvisor status={status} daily={daily} />
                  </div>
                )}

                {activePage === 'location' && <LocationSystem />}

                {activePage === 'daily' && (
                  <DailyForecastChart data={daily} isLoading={dailyLoading} />
                )}

                {activePage === 'weekly' && (
                  <WeeklyForecastChart data={weekly} isLoading={weeklyLoading} />
                )}

                {activePage === 'history' && (
                  <HistoryChart data={history} isLoading={historyLoading} />
                )}

                {activePage === 'about' && <About />}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <footer className="border-t border-white/5 px-6 py-4 text-center">
            <p className="text-[11px] text-slate-500">
              PLTS Dashboard 
            </p>
          </footer>
        </main>
      </div>
    </ThemeProvider>
  );
}
