"""
SQLite logger untuk menyimpan prediksi dan aktual,
digunakan untuk backtest dan halaman historis.
"""

import os
import sqlite3
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, 'predictions.db')


def _get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('''
        CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            hour INTEGER,
            predicted_value REAL,
            actual_value REAL,
            method TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    conn.commit()
    return conn


def log_prediction(pred_type: str, timestamp: str, hour: int,
                   predicted: float, method: str = 'lstm'):
    conn = _get_conn()
    try:
        conn.execute(
            'INSERT INTO predictions (type, timestamp, hour, predicted_value, method) '
            'VALUES (?, ?, ?, ?, ?)',
            (pred_type, timestamp, hour, predicted, method)
        )
        conn.commit()
    finally:
        conn.close()


def log_batch(pred_type: str, timestamp: str, values: list[float],
              method: str = 'lstm'):
    conn = _get_conn()
    try:
        rows = [(pred_type, timestamp, i, v, method) for i, v in enumerate(values)]
        conn.executemany(
            'INSERT INTO predictions (type, timestamp, hour, predicted_value, method) '
            'VALUES (?, ?, ?, ?, ?)',
            rows
        )
        conn.commit()
    finally:
        conn.close()


def update_actual(pred_type: str, timestamp: str, hour: int, actual: float):
    conn = _get_conn()
    try:
        conn.execute(
            'UPDATE predictions SET actual_value = ? '
            'WHERE type = ? AND timestamp = ? AND hour = ?',
            (actual, pred_type, timestamp, hour)
        )
        conn.commit()
    finally:
        conn.close()


def get_recent_predictions(pred_type: str = 'daily', limit: int = 48) -> list[dict]:
    conn = _get_conn()
    try:
        rows = conn.execute(
            'SELECT * FROM predictions WHERE type = ? '
            'ORDER BY created_at DESC, hour ASC LIMIT ?',
            (pred_type, limit)
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()
