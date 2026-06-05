# PLTS Dashboard Backend — Flask + TensorFlow LSTM
# Target: Hugging Face Spaces (Docker SDK, port 7860)

FROM python:3.11-slim

# System deps untuk build wheel TF/numpy/pandas
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps dulu (cache layer biar build cepat saat hanya code yang berubah)
COPY requirements-prod.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements-prod.txt

# Copy model files (forecast.py mengharapkannya di parent dir dari plts_dashboard/)
# - .npz: bobot LSTM (numpy raw, paling portable)
# - scaler.pkl: MinMaxScaler murni (tidak berisi Keras model — pickle aman)
COPY lstm_vanilla_v2.weights.npz scaler.pkl ./

# Copy backend source
COPY plts_dashboard/app.py \
     plts_dashboard/forecast.py \
     plts_dashboard/data_fetcher.py \
     plts_dashboard/plts_physics.py \
     plts_dashboard/prediction_logger.py \
     ./plts_dashboard/

WORKDIR /app/plts_dashboard

# HF Spaces default port
EXPOSE 7860

# 1 worker karena model TF di-load sekali ke memory
# timeout 120s karena weekly forecast (168 step auto-regressive) bisa makan waktu
# preload supaya model di-load saat startup, bukan per worker
CMD ["gunicorn", \
     "--bind", "0.0.0.0:7860", \
     "--workers", "1", \
     "--threads", "1", \
     "--timeout", "120", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "app:app"]
