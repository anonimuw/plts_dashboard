import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'PLTS Dashboard — Monitoring & Forecasting',
  description: 'Dashboard interaktif untuk monitoring dan forecasting output PLTS off-grid 400Wp',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
