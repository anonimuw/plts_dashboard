"""
Modul forecasting: load model LSTM + scaler dari pkl v2 (timezone-aware),
dan jalankan prediksi blend (physics + LSTM) untuk daily (24h) dan weekly (168h).
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
BLEND_ALPHA = 0.5

_model = None
_scaler = None
_load_attempted = False
_forecast_cache: dict[str, tuple[float, dict]] = {}


def _build_model_arch():
    """Bangun arsitektur LSTM Vanilla v2 dari kode.

    Menghindari serialization mismatch (.keras / pickle) — arsitektur
    deterministik di kode, hanya bobot yang di-load dari .weights.h5.
    Arsitektur ini direkonstruksi dari config model training asli:
    LSTM(64, return_sequences=True) -> Dropout(0.2)
    -> LSTM(32) -> Dropout(0.2) -> Dense(1)
    """
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
    """Load LSTM weights dari .weights.h5 dan scaler dari .pkl.

    Arsitektur dibangun dari kode (_build_model_arch), bobot di-load
    dari file .weights.h5 (h5 berisi tensor numpy murni — paling
    portable lintas TF install/version). Scaler (sklearn MinMaxScaler)
    di-load dari pkl (sklearn pickle aman).
    """
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
        print(f"[forecast] LSTM weights loaded from npz, layers={len(_model.layers)}", flush=True)
    except Exception as e:
        print(f"[forecast] Failed to load weights: {e}", flush=True)
        _model = None

    try:
        with open(SCALER_PATH, 'rb') as f:
            _scaler = pickle.load(f)
        print(f"[forecast] Scaler loaded from {os.path.basename(SCALER_PATH)}, features: {FEATURE_COLS}", flush=True)
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
    """Konversi weather data menjadi array (N, 8) fitur ternormalisasi."""
    scaler = _get_scaler()
    if scaler is None:
        return None

    features = []
    for row in weather_rows:
        dt = datetime.fromisoformat(row['datetime'])
        feat = build_feature_row(
            dt=dt,
            ghi=row['GHI'],
            t_amb=row['T_amb'],
            wind_speed=row['wind_speed'],
        )
        features.append([feat[c] for c in FEATURE_COLS])

    arr = np.array(features)
    return scaler.transform(arr)


def _predict_step(window: np.ndarray) -> float:
    """Prediksi 1 langkah dari window (SEQ_LEN, N_FEATURES)."""
    model = _load_model()
    if model is None:
        return 0.0
    x = window.reshape(1, SEQ_LEN, N_FEATURES).astype(np.float32)
    # Direct call lebih cepat dari .predict() untuk single inference (no batching overhead)
    pred = model(x, training=False).numpy()
    return float(pred[0, 0])


def _predict_batch(windows: np.ndarray) -> np.ndarray:
    """Batch prediksi: input (N, SEQ_LEN, N_FEATURES) -> output (N,) ternormalisasi.

    100x+ lebih cepat dari loop _predict_step pada CPU karena hilangkan
    per-call TF overhead (callbacks, batching machinery, retracing).
    """
    model = _load_model()
    if model is None:
        return np.zeros(len(windows))
    x = windows.astype(np.float32)
    out = model(x, training=False).numpy()
    return out.flatten()


def _inverse_p_out_batch(scaled_values: np.ndarray) -> np.ndarray:
    """Inverse transform batch P_out (input N nilai ternormalisasi)."""
    scaler = _get_scaler()
    if scaler is None:
        return np.zeros(len(scaled_values))
    n = len(scaled_values)
    dummy = np.zeros((n, N_FEATURES))
    dummy[:, 0] = scaled_values
    inv = scaler.inverse_transform(dummy)
    return np.maximum(0.0, inv[:, 0])


def _inverse_p_out(scaled_value: float) -> float:
    """Inverse transform P_out saja dari nilai ternormalisasi."""
    scaler = _get_scaler()
    if scaler is None:
        return 0.0
    dummy = np.zeros((1, N_FEATURES))
    dummy[0, 0] = scaled_value
    inv = scaler.inverse_transform(dummy)
    return max(0.0, float(inv[0, 0]))


def _scale_row(row_dict: dict) -> np.ndarray:
    """Scale satu baris fitur ke array (8,)."""
    scaler = _get_scaler()
    arr = np.array([[row_dict[c] for c in FEATURE_COLS]])
    return scaler.transform(arr)[0]


def physics_fallback_daily(forecast_hours: list[dict]) -> dict:
    """Fallback: hitung P_out murni dari fisika (tanpa LSTM)."""
    now = datetime.now(tz=ZoneInfo('Asia/Jakarta'))
    labels = []
    values = []

    hours = forecast_hours[:24] if forecast_hours else []
    for i, row in enumerate(hours):
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
        'labels': labels,
        'values': values,
        'confidence_upper': [round(v * 1.2, 2) for v in values],
        'confidence_lower': [round(v * 0.8, 2) for v in values],
        'total_energy_wh': round(total, 1),
        'peak_power_w': round(peak, 1),
        'method': 'physics_fallback',
        'generated_at': now.isoformat(),
    }


def forecast_daily(ttl: int = 3600) -> dict:
    """Forecast 24 jam: blend physics (kurva) + LSTM (koreksi)."""
    t0 = time.time()
    print(f"[daily] start", flush=True)
    cache_key = 'daily'
    if cache_key in _forecast_cache:
        ts, data = _forecast_cache[cache_key]
        if time.time() - ts < ttl:
            print(f"[daily] cache hit, return ({time.time()-t0:.2f}s)", flush=True)
            return data

    print(f"[daily] fetching recent ({time.time()-t0:.2f}s)", flush=True)
    recent = data_fetcher.get_recent_hours(48)
    print(f"[daily] fetching forecast ({time.time()-t0:.2f}s)", flush=True)
    forecast_hours = data_fetcher.get_forecast_hours(days=2)
    print(f"[daily] fetched recent={len(recent or [])} forecast={len(forecast_hours or [])} ({time.time()-t0:.2f}s)", flush=True)

    if not recent or len(recent) < SEQ_LEN:
        return physics_fallback_daily(forecast_hours or [])

    model = _load_model()
    scaler = _get_scaler()

    if model is None or scaler is None:
        return physics_fallback_daily(forecast_hours or [])

    now = datetime.now(tz=ZoneInfo('Asia/Jakarta')).replace(minute=0, second=0, microsecond=0)

    fc_lookup = {}
    if forecast_hours:
        for row in forecast_hours:
            fc_lookup[row['datetime'][:13]] = row

    print(f"[daily] building physics+features ({time.time()-t0:.2f}s)", flush=True)
    p_physics = []
    future_rows = []
    for i in range(24):
        t = now + timedelta(hours=i)
        key = t.strftime('%Y-%m-%dT%H')
        if key in fc_lookup:
            fc = fc_lookup[key]
            ghi, tamb, ws = fc['GHI'], fc['T_amb'], fc['wind_speed']
        else:
            ghi, tamb, ws = 0, 25, 0
        plts = calculate_plts_output(ghi, tamb, dt=t)
        p_physics.append(plts['P_out'])
        future_rows.append(build_feature_row(t, ghi, tamb, ws))

    print(f"[daily] building seed window ({time.time()-t0:.2f}s)", flush=True)
    seed_rows = _build_seed_window(recent[-SEQ_LEN:])
    if seed_rows is None:
        return physics_fallback_daily(forecast_hours or [])

    future_scaled = np.array([_scale_row(r) for r in future_rows])
    all_scaled = np.vstack([seed_rows, future_scaled])

    windows = np.empty((24, SEQ_LEN, N_FEATURES))
    for i in range(24):
        win_start = max(0, len(seed_rows) + i - SEQ_LEN)
        window = all_scaled[win_start:len(seed_rows) + i]
        if len(window) < SEQ_LEN:
            pad = np.zeros((SEQ_LEN - len(window), N_FEATURES))
            window = np.vstack([pad, window])
        windows[i] = window
    print(f"[daily] running batch predict ({time.time()-t0:.2f}s)", flush=True)
    p_lstm = list(_inverse_p_out_batch(_predict_batch(windows)))
    print(f"[daily] predict done ({time.time()-t0:.2f}s)", flush=True)

    labels = []
    values = []
    alpha = BLEND_ALPHA
    for i in range(24):
        t = now + timedelta(hours=i)
        labels.append(t.strftime('%H:%M'))

        key = t.strftime('%Y-%m-%dT%H')
        fc = fc_lookup.get(key)
        ghi = fc['GHI'] if fc else 0

        if ghi < PLTS_CONFIG['ghi_night_threshold']:
            values.append(0.0)
        else:
            blended = alpha * p_lstm[i] + (1 - alpha) * p_physics[i]
            values.append(round(max(0, blended), 2))

    mape = 0.3043
    upper = [round(v * (1 + mape), 2) for v in values]
    lower = [round(max(0, v * (1 - mape)), 2) for v in values]
    total = sum(values)
    peak = max(values)

    result = {
        'labels': labels,
        'values': values,
        'confidence_upper': upper,
        'confidence_lower': lower,
        'total_energy_wh': round(total, 1),
        'peak_power_w': round(peak, 1),
        'method': 'lstm',
        'generated_at': now.isoformat(),
    }

    _forecast_cache[cache_key] = (time.time(), result)

    try:
        prediction_logger.log_batch('daily', now.isoformat(), values, 'lstm')
    except Exception:
        pass

    return result


def physics_fallback_weekly() -> dict:
    """Fallback mingguan: P_out fisika per hari, minggu ini (Senin-Minggu)."""
    now = datetime.now(tz=ZoneInfo('Asia/Jakarta'))
    today_idx = now.weekday()
    monday = (now - timedelta(days=today_idx)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
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
            key = t.strftime('%Y-%m-%dT%H')
            row = hour_lookup.get(key)
            if row:
                plts = calculate_plts_output(row['GHI'], row['T_amb'], dt=t)
                energy += plts['P_out']
        daily_energy.append(round(energy, 1))
        is_actual.append(day < today_idx)

    icons = data_fetcher.get_weekly_weather_icons()
    total = sum(daily_energy)
    avg = total / 7 if daily_energy else 0

    return {
        'labels': labels,
        'dates': dates,
        'values': daily_energy,
        'is_actual': is_actual,
        'confidence_upper': [
            v if is_actual[i] else round(v * 1.25, 1)
            for i, v in enumerate(daily_energy)
        ],
        'confidence_lower': [
            v if is_actual[i] else round(v * 0.75, 1)
            for i, v in enumerate(daily_energy)
        ],
        'weather_icons': icons,
        'total_energy_wh': round(total, 1),
        'avg_daily_wh': round(avg, 1),
        'method': 'physics_fallback',
        'generated_at': now.isoformat(),
    }


def forecast_weekly(ttl: int = 10800) -> dict:
    """Forecast minggu ini (Senin-Minggu): aktual hari lalu, blend hari depan."""
    cache_key = 'weekly'
    if cache_key in _forecast_cache:
        ts, data = _forecast_cache[cache_key]
        if time.time() - ts < ttl:
            return data

    now = datetime.now(tz=ZoneInfo('Asia/Jakarta')).replace(
        minute=0, second=0, microsecond=0
    )
    today_idx = now.weekday()
    monday = (now - timedelta(days=today_idx)).replace(hour=0)

    week_hours = data_fetcher.get_current_week_hours()
    if not week_hours:
        return physics_fallback_weekly()

    hour_lookup = {}
    for row in week_hours:
        hour_lookup[row['datetime'][:13]] = row

    recent = data_fetcher.get_recent_hours(48)
    model = _load_model()
    scaler = _get_scaler()
    can_lstm = (
        model is not None
        and scaler is not None
        and recent is not None
        and len(recent) >= SEQ_LEN
    )

    seed_rows = None
    if can_lstm:
        seed_rows = _build_seed_window(recent[-SEQ_LEN:])
        if seed_rows is None:
            can_lstm = False

    hourly_pout = []
    hourly_is_actual = []

    future_rows_list = []
    future_ghi_list = []
    future_physics_list = []
    future_start = None

    for i in range(168):
        t = monday + timedelta(hours=i)
        key = t.strftime('%Y-%m-%dT%H')
        row = hour_lookup.get(key)
        is_past = t < now

        if is_past and row:
            plts = calculate_plts_output(row['GHI'], row['T_amb'], dt=t)
            hourly_pout.append(plts['P_out'])
            hourly_is_actual.append(True)
        else:
            if row:
                ghi, tamb, ws = row['GHI'], row['T_amb'], row['wind_speed']
            else:
                ghi, tamb, ws = 0, 25, 0

            if future_start is None:
                future_start = len(hourly_pout)

            future_ghi_list.append(ghi)
            plts = calculate_plts_output(ghi, tamb, dt=t)
            future_physics_list.append(plts['P_out'])
            future_rows_list.append(build_feature_row(t, ghi, tamb, ws))

            hourly_pout.append(0.0)
            hourly_is_actual.append(False)

    if can_lstm and future_rows_list:
        future_scaled = np.array([_scale_row(r) for r in future_rows_list])
        all_scaled = np.vstack([seed_rows, future_scaled])

        n = len(future_rows_list)
        windows = np.empty((n, SEQ_LEN, N_FEATURES))
        for i in range(n):
            win_start = max(0, len(seed_rows) + i - SEQ_LEN)
            window = all_scaled[win_start:len(seed_rows) + i]
            if len(window) < SEQ_LEN:
                pad = np.zeros((SEQ_LEN - len(window), N_FEATURES))
                window = np.vstack([pad, window])
            windows[i] = window

        p_lstm_batch = _inverse_p_out_batch(_predict_batch(windows))

        for i in range(n):
            ghi = future_ghi_list[i]
            if ghi < PLTS_CONFIG['ghi_night_threshold']:
                hourly_pout[future_start + i] = 0.0
            else:
                blended = (
                    BLEND_ALPHA * p_lstm_batch[i]
                    + (1 - BLEND_ALPHA) * future_physics_list[i]
                )
                hourly_pout[future_start + i] = max(0, blended)
    elif future_rows_list:
        for i in range(len(future_rows_list)):
            ghi = future_ghi_list[i]
            if ghi < PLTS_CONFIG['ghi_night_threshold']:
                hourly_pout[future_start + i] = 0.0
            else:
                hourly_pout[future_start + i] = max(0, future_physics_list[i])

    day_names = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
    labels, dates, daily_energy, is_actual = [], [], [], []

    for day in range(7):
        d = monday + timedelta(days=day)
        labels.append(day_names[d.weekday()])
        dates.append(d.strftime('%Y-%m-%d'))

        start = day * 24
        end = start + 24
        energy = sum(hourly_pout[start:end])
        daily_energy.append(round(energy, 1))

        day_fully_past = all(hourly_is_actual[start:end])
        is_actual.append(day_fully_past)

    icons = data_fetcher.get_weekly_weather_icons()
    mape = 0.3043
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
        'labels': labels,
        'dates': dates,
        'values': daily_energy,
        'is_actual': is_actual,
        'confidence_upper': upper,
        'confidence_lower': lower,
        'weather_icons': icons,
        'total_energy_wh': round(total, 1),
        'avg_daily_wh': round(avg, 1),
        'method': 'lstm' if can_lstm else 'physics_fallback',
        'generated_at': now.isoformat(),
    }

    _forecast_cache[cache_key] = (time.time(), result)

    try:
        prediction_logger.log_batch(
            'weekly', now.isoformat(), daily_energy, result['method']
        )
    except Exception:
        pass

    return result


def get_history(n_hours: int = 48) -> dict:
    """Ambil data historis aktual dan prediksi dari archive."""
    recent = data_fetcher.get_recent_hours(n_hours)
    if not recent:
        return {
            'labels': [], 'values': [], 'predicted_values': [],
            'ghi': [], 't_amb': [], 't_cell': [],
            'humidity': [], 'wind_speed': [], 'i_out': [],
        }

    labels = []
    actual_values = []
    predicted_values = []
    ghi_values = []
    t_amb_values = []
    t_cell_values = []
    humidity_values = []
    wind_speed_values = []
    i_out_values = []

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
                p_scaled = _predict_step(window)
                p_real = _inverse_p_out(p_scaled)
                ghi = recent[i]['GHI']
                if ghi < PLTS_CONFIG['ghi_night_threshold']:
                    p_real = 0.0
                predicted_values.append(round(p_real, 2))

            padding = [None] * SEQ_LEN
            predicted_values = padding + predicted_values

    return {
        'labels': labels,
        'values': actual_values,
        'predicted_values': predicted_values,
        'ghi': ghi_values,
        't_amb': t_amb_values,
        't_cell': t_cell_values,
        'humidity': humidity_values,
        'wind_speed': wind_speed_values,
        'i_out': i_out_values,
    }
