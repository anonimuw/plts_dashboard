"""
Modul forecasting PURE LSTM seq-to-one autoregresif.

Pendekatan (final, dipakai produksi):
  - Output = 100% prediksi LSTM (TANPA hybrid blend fisika).
  - TANPA Open-Meteo Forecast API. Forecast dibuat auto-regresif: P_out hasil
    LSTM di-feedback ke window untuk langkah berikutnya; cuaca masa depan
    (GHI, suhu, angin) diambil dari PERSISTENCE — nilai jam yang sama 24 jam
    sebelumnya pada data observasi. Posisi matahari dihitung pvlib (deterministik).
  - Fisika tetap dipakai untuk: hitung target P_out (data), clamp malam
    (GHI < 10 -> 0), dan fallback jika model gagal dimuat.

Model LSTM Vanilla (24,8) + scaler dari file v2 (timezone-aware Asia/Jakarta).
"""

import os
import time
import pickle
import numpy as np
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from plts_physics import (
    PLTS_CONFIG, FEATURE_COLS, calculate_plts_output,
    build_feature_row, solar_position,
)
import data_fetcher
import prediction_logger

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
SCALER_PATH = os.path.join(ROOT_DIR, 'scaler.pkl')
WEIGHTS_PATH = os.path.join(ROOT_DIR, 'lstm_vanilla_v2.weights.npz')

SEQ_LEN = 24
N_FEATURES = 8

_model = None
_scaler = None
_load_attempted = False
_forecast_cache: dict[str, tuple[float, dict]] = {}


def _build_model_arch():
    """Arsitektur LSTM Vanilla v2: LSTM(64)->Dropout->LSTM(32)->Dropout->Dense(1)."""
    from tensorflow.keras.models import Sequential
    from tensorflow.keras.layers import LSTM, Dropout, Dense, Input

    model = Sequential([
        Input(shape=(SEQ_LEN, N_FEATURES)),
        LSTM(64, return_sequences=True, name='lstm_1'),
        Dropout(0.2, name='dropout_1'),
        LSTM(32, name='lstm_2'),
        Dropout(0.2, name='dropout_2'),
        Dense(1, name='output'),
    ])
    return model


def _load_pkl():
    """Load bobot LSTM dari .npz dan scaler dari .pkl."""
    global _model, _scaler, _load_attempted
    if _load_attempted:
        return
    _load_attempted = True
    try:
        data = np.load(WEIGHTS_PATH)
        _model = _build_model_arch()
        _model(np.zeros((1, SEQ_LEN, N_FEATURES), dtype=np.float32))
        for layer in _model.layers:
            keys = sorted([k for k in data.files if k.startswith(f'{layer.name}__')])
            if keys:
                layer.set_weights([data[k] for k in keys])
        print(f"[forecast] LSTM weights loaded, layers={len(_model.layers)}", flush=True)
    except Exception as e:
        print(f"[forecast] Failed to load weights: {e}", flush=True)
        _model = None

    try:
        with open(SCALER_PATH, 'rb') as f:
            _scaler = pickle.load(f)
        print(f"[forecast] Scaler loaded, features: {FEATURE_COLS}", flush=True)
    except Exception as e:
        print(f"[forecast] Failed to load scaler: {e}", flush=True)
        _scaler = None

    if _model is None or _scaler is None:
        print(f"[forecast] Falling back to physics (model={_model is not None}, scaler={_scaler is not None})", flush=True)


def _load_model():
    global _model
    if _model is None:
        _load_pkl()
    return _model


def _get_scaler():
    global _scaler
    if _scaler is None:
        _load_pkl()
    return _scaler


def init():
    _load_pkl()


def _build_seed_window(weather_rows: list[dict]) -> np.ndarray | None:
    scaler = _get_scaler()
    if scaler is None:
        return None
    features = []
    for row in weather_rows:
        dt = datetime.fromisoformat(row['datetime'])
        feat = build_feature_row(
            dt=dt, ghi=row['GHI'], t_amb=row['T_amb'], wind_speed=row['wind_speed'],
        )
        features.append([feat[c] for c in FEATURE_COLS])
    arr = np.array(features)
    return scaler.transform(arr)


def _predict_step(window: np.ndarray) -> float:
    model = _load_model()
    if model is None:
        return 0.0
    x = window.reshape(1, SEQ_LEN, N_FEATURES).astype(np.float32)
    pred = model(x, training=False).numpy()
    return float(pred[0, 0])


def _inverse_p_out(scaled_value: float) -> float:
    scaler = _get_scaler()
    if scaler is None:
        return 0.0
    dummy = np.zeros((1, N_FEATURES))
    dummy[0, 0] = scaled_value
    inv = scaler.inverse_transform(dummy)
    return max(0.0, float(inv[0, 0]))


def _scale_row(row_dict: dict) -> np.ndarray:
    scaler = _get_scaler()
    arr = np.array([[row_dict[c] for c in FEATURE_COLS]])
    return scaler.transform(arr)[0]


def physics_fallback_daily(forecast_hours: list[dict]) -> dict:
    """Fallback fisika murni (hanya dipakai jika model gagal load)."""
    now = datetime.now(tz=ZoneInfo('Asia/Jakarta'))
    labels, values = [], []
    hours = forecast_hours[:24] if forecast_hours else []
    for row in hours:
        dt = datetime.fromisoformat(row['datetime'])
        labels.append(dt.strftime('%H:%M'))
        plts = calculate_plts_output(row['GHI'], row['T_amb'], dt=dt)
        values.append(round(plts['P_out'], 2))
    while len(labels) < 24:
        t = now + timedelta(hours=len(labels))
        labels.append(t.strftime('%H:%M'))
        values.append(0.0)
    total = sum(values)
    peak = max(values) if values else 0
    return {
        'labels': labels, 'values': values,
        'confidence_upper': [round(v * 1.2, 2) for v in values],
        'confidence_lower': [round(v * 0.8, 2) for v in values],
        'total_energy_wh': round(total, 1), 'peak_power_w': round(peak, 1),
        'method': 'physics_fallback', 'generated_at': now.isoformat(),
    }


def forecast_daily(ttl: int = 3600) -> dict:
    """Forecast 24 jam — PURE LSTM seq-to-one autoregresif + cuaca persistence."""
    t0 = time.time()
    print(f"[daily] start", flush=True)
    cache_key = 'daily'
    if cache_key in _forecast_cache:
        ts, data = _forecast_cache[cache_key]
        if time.time() - ts < ttl:
            print(f"[daily] cache hit ({time.time()-t0:.2f}s)", flush=True)
            return data

    recent = data_fetcher.get_recent_hours(48)  # hanya data observasi (lampau)
    if not recent or len(recent) < SEQ_LEN:
        return physics_fallback_daily([])

    model = _load_model()
    scaler = _get_scaler()
    if model is None or scaler is None:
        return physics_fallback_daily([])

    now = datetime.now(tz=ZoneInfo('Asia/Jakarta')).replace(minute=0, second=0, microsecond=0)
    recent_by_key = {r['datetime'][:13]: r for r in recent}

    seed_rows = _build_seed_window(recent[-SEQ_LEN:])
    if seed_rows is None:
        return physics_fallback_daily([])
    window = seed_rows.copy()

    labels, values = [], []
    for i in range(24):
        p_real = _inverse_p_out(_predict_step(window))   # prediksi 1 langkah (pure LSTM)

        t = now + timedelta(hours=i)
        labels.append(t.strftime('%H:%M'))

        # cuaca masa depan = persistence 24 jam sebelumnya (observasi)
        pk = (t - timedelta(hours=24)).strftime('%Y-%m-%dT%H')
        wr = recent_by_key.get(pk)
        ghi, tamb, ws = (wr['GHI'], wr['T_amb'], wr['wind_speed']) if wr else (0.0, 25.0, 0.0)

        if ghi < PLTS_CONFIG['ghi_night_threshold']:
            p_real = 0.0
        p_real = max(0.0, p_real)
        values.append(round(p_real, 2))

        # feedback P_out hasil LSTM ke window, lalu geser
        row = build_feature_row(t, ghi, tamb, ws, p_out=p_real)
        window = np.vstack([window[1:], _scale_row(row)])

    mape = 0.2896
    upper = [round(v * (1 + mape), 2) for v in values]
    lower = [round(max(0, v * (1 - mape)), 2) for v in values]
    total = sum(values)
    peak = max(values) if values else 0

    result = {
        'labels': labels, 'values': values,
        'confidence_upper': upper, 'confidence_lower': lower,
        'total_energy_wh': round(total, 1), 'peak_power_w': round(peak, 1),
        'method': 'lstm', 'generated_at': now.isoformat(),
    }
    _forecast_cache[cache_key] = (time.time(), result)
    try:
        prediction_logger.log_batch('daily', now.isoformat(), values, 'lstm')
    except Exception:
        pass
    print(f"[daily] done ({time.time()-t0:.2f}s)", flush=True)
    return result


def physics_fallback_weekly() -> dict:
    now = datetime.now(tz=ZoneInfo('Asia/Jakarta'))
    today_idx = now.weekday()
    monday = (now - timedelta(days=today_idx)).replace(hour=0, minute=0, second=0, microsecond=0)
    day_names = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
    week_hours = data_fetcher.get_current_week_hours()
    hour_lookup = {}
    if week_hours:
        for row in week_hours:
            hour_lookup[row['datetime'][:13]] = row
    labels, dates, daily_energy, is_actual = [], [], [], []
    for day in range(7):
        d = monday + timedelta(days=day)
        labels.append(day_names[d.weekday()])
        dates.append(d.strftime('%Y-%m-%d'))
        energy = 0.0
        for h in range(24):
            t = d.replace(hour=h)
            row = hour_lookup.get(t.strftime('%Y-%m-%dT%H'))
            if row:
                plts = calculate_plts_output(row['GHI'], row['T_amb'], dt=t)
                energy += plts['P_out']
        daily_energy.append(round(energy, 1))
        is_actual.append(day < today_idx)
    total = sum(daily_energy)
    avg = total / 7 if daily_energy else 0
    return {
        'labels': labels, 'dates': dates, 'values': daily_energy, 'is_actual': is_actual,
        'confidence_upper': [v if is_actual[i] else round(v * 1.25, 1) for i, v in enumerate(daily_energy)],
        'confidence_lower': [v if is_actual[i] else round(v * 0.75, 1) for i, v in enumerate(daily_energy)],
        'weather_icons': ['partly_cloudy'] * 7,
        'total_energy_wh': round(total, 1), 'avg_daily_wh': round(avg, 1),
        'method': 'physics_fallback', 'generated_at': now.isoformat(),
    }


def forecast_weekly(ttl: int = 10800) -> dict:
    """Forecast minggu ini — PURE LSTM autoregresif + cuaca persistence.

    Hari lampau = energi aktual (observasi). Hari depan = murni LSTM autoregresif,
    cuaca dari persistence 24 jam sebelumnya (tanpa Open-Meteo forecast).
    """
    cache_key = 'weekly'
    if cache_key in _forecast_cache:
        ts, data = _forecast_cache[cache_key]
        if time.time() - ts < ttl:
            return data

    now = datetime.now(tz=ZoneInfo('Asia/Jakarta')).replace(minute=0, second=0, microsecond=0)
    today_idx = now.weekday()
    monday = (now - timedelta(days=today_idx)).replace(hour=0)

    week_hours = data_fetcher.get_current_week_hours()
    if not week_hours:
        return physics_fallback_weekly()
    hour_lookup = {row['datetime'][:13]: row for row in week_hours}

    recent = data_fetcher.get_recent_hours(48)
    model = _load_model()
    scaler = _get_scaler()
    if not (model is not None and scaler is not None and recent and len(recent) >= SEQ_LEN):
        return physics_fallback_weekly()
    seed_rows = _build_seed_window(recent[-SEQ_LEN:])
    if seed_rows is None:
        return physics_fallback_weekly()

    # observed lookup gabungan: minggu ini (hour_lookup) + 48 jam terakhir (recent),
    # supaya persistence "kemarin" untuk hari depan pertama tetap menemukan data.
    obs_lookup = dict(hour_lookup)
    for r in recent:
        obs_lookup[r['datetime'][:13]] = r

    # weather(t): observasi jika t<now & tersedia; selain itu persistence 24 jam sebelumnya
    weather_cache: dict[str, tuple] = {}

    def weather_at(t):
        key = t.strftime('%Y-%m-%dT%H')
        if t < now:
            row = obs_lookup.get(key)
            return (row['GHI'], row['T_amb'], row['wind_speed']) if row else (0.0, 25.0, 0.0)
        if key in weather_cache:
            return weather_cache[key]
        val = weather_at(t - timedelta(hours=24))  # persistence
        weather_cache[key] = val
        return val

    hourly_pout = [0.0] * 168
    hourly_is_actual = [False] * 168
    window = seed_rows.copy()

    for i in range(168):
        t = monday + timedelta(hours=i)
        if t < now:
            row = obs_lookup.get(t.strftime('%Y-%m-%dT%H'))
            if row:
                plts = calculate_plts_output(row['GHI'], row['T_amb'], dt=t)
                hourly_pout[i] = plts['P_out']
                hourly_is_actual[i] = True
            continue
        # masa depan: pure LSTM autoregresif, cuaca persistence
        p_real = _inverse_p_out(_predict_step(window))
        ghi, tamb, ws = weather_at(t)
        if ghi < PLTS_CONFIG['ghi_night_threshold']:
            p_real = 0.0
        p_real = max(0.0, p_real)
        hourly_pout[i] = p_real
        row = build_feature_row(t, ghi, tamb, ws, p_out=p_real)
        window = np.vstack([window[1:], _scale_row(row)])

    day_names = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
    labels, dates, daily_energy, is_actual = [], [], [], []
    for day in range(7):
        d = monday + timedelta(days=day)
        labels.append(day_names[d.weekday()])
        dates.append(d.strftime('%Y-%m-%d'))
        start, end = day * 24, day * 24 + 24
        daily_energy.append(round(sum(hourly_pout[start:end]), 1))
        is_actual.append(all(hourly_is_actual[start:end]))

    def energy_icon(e):
        if e >= 1100:
            return 'sunny'
        if e >= 700:
            return 'partly_cloudy'
        return 'cloudy'
    icons = [energy_icon(v) for v in daily_energy]

    mape = 0.2896
    upper, lower = [], []
    for i, v in enumerate(daily_energy):
        if is_actual[i]:
            upper.append(v)
            lower.append(v)
        else:
            upper.append(round(v * (1 + mape * 1.5), 1))
            lower.append(round(max(0, v * (1 - mape * 1.5)), 1))
    total = sum(daily_energy)
    avg = total / 7

    result = {
        'labels': labels, 'dates': dates, 'values': daily_energy, 'is_actual': is_actual,
        'confidence_upper': upper, 'confidence_lower': lower, 'weather_icons': icons,
        'total_energy_wh': round(total, 1), 'avg_daily_wh': round(avg, 1),
        'method': 'lstm', 'generated_at': now.isoformat(),
    }
    _forecast_cache[cache_key] = (time.time(), result)
    try:
        prediction_logger.log_batch('weekly', now.isoformat(), daily_energy, 'lstm')
    except Exception:
        pass
    return result


def get_history(n_hours: int = 48) -> dict:
    """Data aktual + prediksi LSTM 1-langkah pada data lampau (untuk halaman Historis)."""
    recent = data_fetcher.get_recent_hours(n_hours)
    if not recent:
        return {'labels': [], 'values': [], 'predicted_values': [], 'ghi': [],
                't_amb': [], 't_cell': [], 'humidity': [], 'wind_speed': [], 'i_out': []}

    labels, actual_values, predicted_values = [], [], []
    ghi_values, t_amb_values, t_cell_values = [], [], []
    humidity_values, wind_speed_values, i_out_values = [], [], []

    model = _load_model()
    scaler = _get_scaler()
    can_predict = model is not None and scaler is not None

    for row in recent:
        dt = datetime.fromisoformat(row['datetime'])
        labels.append(dt.strftime('%d/%m %H:%M'))
        plts = calculate_plts_output(row['GHI'], row['T_amb'], dt=dt)
        actual_values.append(round(plts['P_out'], 2))
        ghi_values.append(round(row['GHI'], 1))
        t_amb_values.append(round(row['T_amb'], 1))
        t_cell_values.append(round(plts['T_cell'], 1))
        humidity_values.append(round(row['humidity'], 1))
        wind_speed_values.append(round(row['wind_speed'], 1))
        i_out_values.append(round(plts['I_out'], 3))

    if can_predict and len(recent) >= SEQ_LEN:
        scaled_all = _build_seed_window(recent)
        if scaled_all is not None and len(scaled_all) >= SEQ_LEN:
            for i in range(SEQ_LEN, len(scaled_all)):
                window = scaled_all[i - SEQ_LEN:i]
                p_real = _inverse_p_out(_predict_step(window))
                if recent[i]['GHI'] < PLTS_CONFIG['ghi_night_threshold']:
                    p_real = 0.0
                predicted_values.append(round(p_real, 2))
            predicted_values = [None] * SEQ_LEN + predicted_values

    return {
        'labels': labels, 'values': actual_values, 'predicted_values': predicted_values,
        'ghi': ghi_values, 't_amb': t_amb_values, 't_cell': t_cell_values,
        'humidity': humidity_values, 'wind_speed': wind_speed_values, 'i_out': i_out_values,
    }
