'use client';

import { Sun, Moon, LayoutDashboard, MapPin, TrendingUp, CalendarDays, Clock, Info } from 'lucide-react';
import { useTheme } from './ThemeProvider';

export type Page = 'dashboard' | 'location' | 'daily' | 'weekly' | 'history' | 'about';

const MENU_ITEMS: { key: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'location', label: 'Lokasi & Sistem', icon: MapPin },
  { key: 'daily', label: 'Forecast Harian', icon: TrendingUp },
  { key: 'weekly', label: 'Forecast Mingguan', icon: CalendarDays },
  { key: 'history', label: 'Historis', icon: Clock },
  { key: 'about', label: 'Tentang', icon: Info },
];

interface Props {
  activePage: Page;
  onNavigate: (page: Page) => void;
}

export default function Sidebar({ activePage, onNavigate }: Props) {
  const { theme, toggle } = useTheme();

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-slate-900/95 backdrop-blur-xl md:flex">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
          <span className="text-2xl">☀️</span>
          <div>
            <h1 className="text-base font-bold text-amber-400">PLTS Dashboard</h1>
            <p className="text-[10px] text-slate-500">400Wp Off-Grid Monitoring</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activePage === item.key;
            return (
              <button
                key={item.key}
                onClick={() => onNavigate(item.key)}
                className={`group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all ${
                  active
                    ? 'bg-amber-400/15 text-amber-400'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <Icon
                  size={18}
                  className={active ? 'text-amber-400' : 'text-slate-500 group-hover:text-slate-300'}
                />
                {item.label}
                {active && (
                  <div className="ml-auto h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Theme Toggle */}
        <div className="border-t border-white/10 px-3 py-4">
          <button
            onClick={toggle}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-400 transition-all hover:bg-white/5 hover:text-slate-200"
          >
            {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
            {theme === 'dark' ? 'Dark Mode' : 'Light Mode'}
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex border-t border-white/10 bg-slate-900/95 backdrop-blur-xl md:hidden">
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.key;
          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-all ${
                active ? 'text-amber-400' : 'text-slate-500'
              }`}
            >
              <Icon size={20} />
              <span className="truncate">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
