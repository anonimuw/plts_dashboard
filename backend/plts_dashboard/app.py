"""
Flask API server untuk PLTS Dashboard (PURE LSTM, tanpa blend/forecast API).
Endpoint: /api/status, /api/forecast/daily, /api/forecast/weekly, /api/history
"""

import os
from datetime import datetime
from zoneinfo import ZoneInfo
from flask import Flask, jsonify
from flask_cors import CORS

WIB = ZoneInfo('Asia/Jakarta')

import forecast
import data_fetcher
from plts_physics import PLTS_CONFIG, calculate_plts_output

app = Flask(__name__)
CORS(app)

print("[app] Initializing model and scaler...")
forecast.init()
print("[app] Ready (pure LSTM seq-to-one autoregresif, persistence).")


@app.route('/api/status')
def api_status():
    try:
        current = data_fetcher.fetch_current_weather()
        if current and 'current' in current:
            c = current['current']
            ghi = c.get('shortwave_radiation', 0) or 0
            t_amb = c.get('temperature_2m', 25) or 25
            now = datetime.now(tz=WIB)
            plts = calculate_plts_output(ghi, t_amb, dt=now)
            is_day = ghi >= PLTS_CONFIG['ghi_night_threshold']

            return jsonify({
                'power_w': round(plts['P_out'], 1),
                'ghi_wm2': round(ghi, 0),
                'temperature_c': round(t_amb, 1),
                'timestamp': now.isoformat(),
                'is_daytime': is_day,
                'status': 'Produksi Aktif' if is_day else 'Malam / Tidak Ada Produksi',
            })
    except Exception as e:
        print(f"[api/status] Error: {e}")

    now = datetime.now(tz=WIB)
    return jsonify({
        'power_w': 0,
        'ghi_wm2': 0,
        'temperature_c': 25,
        'timestamp': now.isoformat(),
        'is_daytime': 6 <= now.hour <= 18,
        'status': 'Data tidak tersedia',
    })


@app.route('/api/forecast/daily')
def api_forecast_daily():
    try:
        return jsonify(forecast.forecast_daily())
    except Exception as e:
        print(f"[api/forecast/daily] Error: {e}")
        return jsonify(forecast.physics_fallback_daily([]))


@app.route('/api/forecast/weekly')
def api_forecast_weekly():
    try:
        return jsonify(forecast.forecast_weekly())
    except Exception as e:
        print(f"[api/forecast/weekly] Error: {e}")
        return jsonify(forecast.physics_fallback_weekly())


@app.route('/api/history')
def api_history():
    try:
        return jsonify(forecast.get_history(48))
    except Exception as e:
        print(f"[api/history] Error: {e}")
        return jsonify({'labels': [], 'values': [], 'predicted_values': []})


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000, use_reloader=False)
