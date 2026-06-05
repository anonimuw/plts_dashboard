import useSWR from 'swr';
import { fetchApi, REFRESH_INTERVALS } from '@/lib/api';
import type { StatusData, DailyForecast, WeeklyForecast, HistoryData } from '@/types';

const fetcher = <T>(url: string) => fetchApi<T>(url);

export function useStatus() {
  return useSWR<StatusData>('/api/status', fetcher, {
    refreshInterval: REFRESH_INTERVALS.status,
    revalidateOnFocus: false,
  });
}

export function useDailyForecast() {
  return useSWR<DailyForecast>('/api/forecast/daily', fetcher, {
    refreshInterval: REFRESH_INTERVALS.forecast,
    revalidateOnFocus: false,
  });
}

export function useWeeklyForecast() {
  return useSWR<WeeklyForecast>('/api/forecast/weekly', fetcher, {
    refreshInterval: REFRESH_INTERVALS.forecast,
    revalidateOnFocus: false,
  });
}

export function useHistory() {
  return useSWR<HistoryData>('/api/history', fetcher, {
    refreshInterval: REFRESH_INTERVALS.forecast,
    revalidateOnFocus: false,
  });
}
