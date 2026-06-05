"""
Wrapper Open-Meteo API dengan TTL cache.
Dua endpoint: archive (historis) dan forecast (prakiraan).
"""

import time
import hashlib
import json
import requests
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

LAT = -7.822269
LON = 112.441299
TZ = 'Asia/Jakarta'
WIB = ZoneInfo(TZ)
HOURLY_PARAMS = 'shortwave_radiation,temperature_2m,relative_humidity_2m,wind_speed_10m'

ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

_cache: dict[str, tuple[float, dict]] = {}


def _cache_key(url: str, params: dict) -> str:
    raw = url + json.dumps(params, sort_keys=True)
    return hashlib.md5(raw.encode()).hexdigest()


def _get_cached(url: str, params: dict, ttl: int = 900) -> dict | None:
    key = _cache_key(url, params)
    if key in _cache:
        ts, data = _cache[key]
        if time.time() - ts < ttl:
            return data
    try:
        r = requests.get(url, params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        _cache[key] = (time.time(), data)
        return data
    except Exception as e:
        print(f"[data_fetcher] Error fetching {url}: {e}")
        if key in _cache:
            return _cache[key][1]
        return None


def fetch_archive(start_date: str, end_date: str, ttl: int = 900) -> dict | None:
    params = {
        'latitude': LAT,
        'longitude': LON,
        'start_date': start_date,
        'end_date': end_date,
        'hourly': HOURLY_PARAMS,
        'timezone': TZ,
    }
    return _get_cached(ARCHIVE_URL, params, ttl)


def fetch_forecast(days: int = 7, ttl: int = 3600) -> dict | None:
    params = {
        'latitude': LAT,
        'longitude': LON,
        'hourly': HOURLY_PARAMS,
        'forecast_days': days,
        'timezone': TZ,
    }
    return _get_cached(FORECAST_URL, params, ttl)


def fetch_current_weather(ttl: int = 900) -> dict | None:
    params = {
        'latitude': LAT,
        'longitude': LON,
        'current': 'shortwave_radiation,temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code',
        'timezone': TZ,
    }
    return _get_cached(FORECAST_URL, params, ttl)


def get_recent_hours(n_hours: int = 48, ttl: int = 900) -> list[dict] | None:
    """Ambil n_hours data terbaru via forecast API dengan past_days."""
    past_days = max(3, (n_hours // 24) + 2)
    params = {
        'latitude': LAT,
        'longitude': LON,
        'hourly': HOURLY_PARAMS,
        'past_days': past_days,
        'forecast_days': 1,
        'timezone': TZ,
    }
    data = _get_cached(FORECAST_URL, params, ttl)
    if not data or 'hourly' not in data:
        return None

    hourly = data['hourly']
    now = datetime.now(tz=WIB)
    cutoff = (now - timedelta(hours=1)).strftime('%Y-%m-%dT%H:00')

    rows = []
    for i, t in enumerate(hourly['time']):
        if t > cutoff:
            continue
        rows.append({
            'datetime': t,
            'GHI': hourly['shortwave_radiation'][i] or 0,
            'T_amb': hourly['temperature_2m'][i] or 25,
            'humidity': hourly['relative_humidity_2m'][i] or 50,
            'wind_speed': hourly['wind_speed_10m'][i] or 0,
        })

    return rows[-n_hours:] if rows else None


def get_forecast_hours(days: int = 7, ttl: int = 3600) -> list[dict] | None:
    """Ambil prakiraan cuaca per jam."""
    data = fetch_forecast(days, ttl)
    if not data or 'hourly' not in data:
        return None

    hourly = data['hourly']
    rows = []
    for i, t in enumerate(hourly['time']):
        rows.append({
            'datetime': t,
            'GHI': hourly['shortwave_radiation'][i] or 0,
            'T_amb': hourly['temperature_2m'][i] or 25,
            'humidity': hourly['relative_humidity_2m'][i] or 50,
            'wind_speed': hourly['wind_speed_10m'][i] or 0,
        })
    return rows


def get_current_week_hours(ttl: int = 900) -> list[dict] | None:
    """Ambil data cuaca per jam untuk minggu ini (Senin-Minggu)."""
    now = datetime.now(tz=WIB)
    past_days = now.weekday()
    forecast_days = 7 - now.weekday()

    params = {
        'latitude': LAT,
        'longitude': LON,
        'hourly': HOURLY_PARAMS,
        'past_days': past_days,
        'forecast_days': forecast_days,
        'timezone': TZ,
    }
    data = _get_cached(FORECAST_URL, params, ttl)
    if not data or 'hourly' not in data:
        return None

    hourly = data['hourly']
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    monday_str = monday.strftime('%Y-%m-%dT00:00')
    sunday_str = (monday + timedelta(days=6)).strftime('%Y-%m-%dT23:00')

    rows = []
    for i, t in enumerate(hourly['time']):
        if t < monday_str or t > sunday_str:
            continue
        rows.append({
            'datetime': t,
            'GHI': hourly['shortwave_radiation'][i] or 0,
            'T_amb': hourly['temperature_2m'][i] or 25,
            'humidity': hourly['relative_humidity_2m'][i] or 50,
            'wind_speed': hourly['wind_speed_10m'][i] or 0,
        })
    return rows if rows else None


WMO_TO_ICON = {
    0: 'sunny', 1: 'sunny', 2: 'partly_cloudy', 3: 'cloudy',
    45: 'cloudy', 48: 'cloudy',
    51: 'partly_cloudy', 53: 'partly_cloudy', 55: 'cloudy',
    56: 'cloudy', 57: 'cloudy',
    61: 'rainy', 63: 'rainy', 65: 'rainy',
    66: 'rainy', 67: 'rainy',
    71: 'cloudy', 73: 'cloudy', 75: 'cloudy', 77: 'cloudy',
    80: 'rainy', 81: 'rainy', 82: 'rainy',
    85: 'cloudy', 86: 'cloudy',
    95: 'rainy', 96: 'rainy', 99: 'rainy',
}


def get_daily_weather_icons(days: int = 7, ttl: int = 3600) -> list[str]:
    """Ambil ikon cuaca harian dari forecast API, pertimbangkan presipitasi aktual."""
    params = {
        'latitude': LAT,
        'longitude': LON,
        'daily': 'weather_code,precipitation_sum',
        'forecast_days': days,
        'timezone': TZ,
    }
    data = _get_cached(FORECAST_URL, params, ttl)
    if not data or 'daily' not in data:
        return ['partly_cloudy'] * days

    codes = data['daily'].get('weather_code', [])
    precip = data['daily'].get('precipitation_sum', [0] * days)

    icons = []
    for i, code in enumerate(codes):
        rain_mm = precip[i] if i < len(precip) else 0
        icon = WMO_TO_ICON.get(code, 'partly_cloudy')
        if icon == 'rainy' and (rain_mm or 0) < 5:
            icon = 'cloudy'
        icons.append(icon)
    return icons


def get_weekly_weather_icons(ttl: int = 3600) -> list[str]:
    """Ambil ikon cuaca untuk minggu ini (Senin-Minggu)."""
    now = datetime.now(tz=WIB)
    past_days = now.weekday()
    forecast_days = 7 - now.weekday()

    params = {
        'latitude': LAT,
        'longitude': LON,
        'daily': 'weather_code,precipitation_sum',
        'past_days': past_days,
        'forecast_days': forecast_days,
        'timezone': TZ,
    }
    data = _get_cached(FORECAST_URL, params, ttl)
    if not data or 'daily' not in data:
        return ['partly_cloudy'] * 7

    monday = (now - timedelta(days=now.weekday())).strftime('%Y-%m-%d')
    sunday = (now - timedelta(days=now.weekday()) + timedelta(days=6)).strftime('%Y-%m-%d')

    daily_data = data['daily']
    dates = daily_data.get('time', [])
    codes = daily_data.get('weather_code', [])
    precip = daily_data.get('precipitation_sum', [0] * len(dates))

    icons = []
    for i, date in enumerate(dates):
        if date < monday or date > sunday:
            continue
        code = codes[i] if i < len(codes) else 2
        rain_mm = precip[i] if i < len(precip) else 0
        icon = WMO_TO_ICON.get(code, 'partly_cloudy')
        if icon == 'rainy' and (rain_mm or 0) < 5:
            icon = 'cloudy'
        icons.append(icon)

    while len(icons) < 7:
        icons.append('partly_cloudy')
    return icons[:7]
