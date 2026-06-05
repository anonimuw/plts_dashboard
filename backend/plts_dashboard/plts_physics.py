"""
Kalkulasi fisika PLTS — identik dengan retrained model (timezone-aware).
Menggunakan pvlib dengan datetime tz-localized ke Asia/Jakarta.
P_out dihitung dari G_tilt (bukan GHI langsung).
"""

import numpy as np
import pandas as pd
from datetime import datetime

from pvlib import location, irradiance
from pvlib.solarposition import get_solarposition

PLTS_CONFIG = {
    'panel_power_wp': 200,
    'num_panels': 2,
    'total_power_wp': 400,
    'vmp': 35.8,
    'panel_efficiency': 0.19,
    'system_voltage': 24,
    'scc_efficiency': 0.95,
    'performance_ratio': 0.77,
    'noct': 45,
    'temp_coeff_power': -0.0045,
    'g_stc': 1000,
    't_stc': 25,
    'latitude': -7.822269,
    'longitude': 112.441299,
    'altitude': 500,
    'tilt_angle': 12,
    'azimuth_panel': 0,
    'alert_low_wh': 200,
    'alert_high_wh': 500,
    'ghi_night_threshold': 10,
}

_site = location.Location(
    latitude=PLTS_CONFIG['latitude'],
    longitude=PLTS_CONFIG['longitude'],
    tz='Asia/Jakarta',
    altitude=PLTS_CONFIG['altitude'],
)


def solar_position(dt: datetime, lat: float = None, lon: float = None):
    """
    Hitung solar zenith dan azimuth menggunakan pvlib.
    datetime di-localize ke Asia/Jakarta agar match retrained model.
    """
    times = pd.DatetimeIndex([dt])
    if times.tz is None:
        times = times.tz_localize('Asia/Jakarta')
    sp = _site.get_solarposition(times)
    return float(sp['zenith'].iloc[0]), float(sp['azimuth'].iloc[0])


def compute_g_tilt(ghi: float, zenith: float, azimuth: float,
                   config: dict = None) -> float:
    """Hitung G_tilt menggunakan pvlib isotropic model (sama dengan notebook)."""
    c = config or PLTS_CONFIG
    if ghi <= 0:
        return 0.0

    dni_est = ghi * 0.8
    dhi_est = ghi * 0.2

    poa = irradiance.get_total_irradiance(
        surface_tilt=c['tilt_angle'],
        surface_azimuth=c['azimuth_panel'],
        solar_zenith=zenith,
        solar_azimuth=azimuth,
        dni=dni_est,
        ghi=ghi,
        dhi=dhi_est,
        model='isotropic',
    )
    g_tilt = float(poa['poa_global'])
    if g_tilt < 0:
        return 0.0

    sp_elevation = 90 - zenith
    if sp_elevation <= 0:
        return 0.0

    return g_tilt


def calculate_plts_output(ghi: float, t_amb: float, zenith: float = None,
                          azimuth: float = None, dt: datetime = None,
                          config: dict = None) -> dict:
    """
    Hitung output PLTS dari GHI, suhu, dan posisi matahari.
    Menggunakan G_tilt (sama dengan notebook training).
    """
    c = config or PLTS_CONFIG

    if zenith is None or azimuth is None:
        if dt is not None:
            zenith, azimuth = solar_position(dt)
        else:
            return {'P_out': 0.0, 'T_cell': t_amb, 'I_out': 0.0,
                    'G_tilt': 0.0, 'P_irr': 0.0, 'P_corrected': 0.0}

    g_tilt = compute_g_tilt(ghi, zenith, azimuth, c)
    elevation = 90 - zenith

    if ghi <= 0.01 or elevation <= 0 or g_tilt <= 0:
        return {'P_out': 0.0, 'T_cell': t_amb, 'I_out': 0.0,
                'G_tilt': 0.0, 'P_irr': 0.0, 'P_corrected': 0.0}

    t_cell = t_amb + ((c['noct'] - 20) / 800) * g_tilt
    p_irr = c['total_power_wp'] * (g_tilt / c['g_stc'])
    p_corrected = p_irr * (1 + c['temp_coeff_power'] * (t_cell - c['t_stc']))
    p_out = max(0, p_corrected * c['performance_ratio'])
    i_out = p_out / c['system_voltage'] if c['system_voltage'] > 0 else 0

    return {
        'P_out': round(p_out, 4),
        'T_cell': round(t_cell, 4),
        'I_out': round(i_out, 4),
        'G_tilt': round(g_tilt, 4),
        'P_irr': round(p_irr, 4),
        'P_corrected': round(p_corrected, 4),
    }


def build_feature_row(dt: datetime, ghi: float, t_amb: float, wind_speed: float,
                      p_out: float = None, config: dict = None) -> dict:
    """
    Bangun satu baris 8 fitur sesuai urutan model (identik dengan retrained model).
    datetime di-localize ke Asia/Jakarta.
    """
    c = config or PLTS_CONFIG
    zenith, azimuth = solar_position(dt)
    plts = calculate_plts_output(ghi, t_amb, zenith, azimuth, config=c)

    if p_out is not None:
        actual_p_out = p_out
    else:
        actual_p_out = plts['P_out']

    i_out = actual_p_out / c['system_voltage'] if c['system_voltage'] > 0 else 0

    return {
        'P_out': actual_p_out,
        'GHI': ghi,
        'T_amb': t_amb,
        'I_out': i_out,
        'T_cell': plts['T_cell'],
        'wind_speed': wind_speed,
        'solar_zenith': zenith,
        'solar_azimuth': azimuth,
    }


FEATURE_COLS = ['P_out', 'GHI', 'T_amb', 'I_out', 'T_cell', 'wind_speed', 'solar_zenith', 'solar_azimuth']
