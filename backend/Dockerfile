FROM python:3.15-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq-dev gcc libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
# PyTorch is installed first, from the CPU-only wheel index by default. The
# plain PyPI torch wheel bundles ~4-5GB of NVIDIA CUDA libraries, which are
# dead weight on any machine without an NVIDIA GPU passed through to Docker.
# For an NVIDIA host, build with docker-compose.gpu.yml, which overrides
# TORCH_INDEX to the CUDA wheels and reserves the GPU for the worker.
# torchvision must come from the same index — otherwise ultralytics pulls it
# from PyPI and drags the CUDA build of torch back in as a dependency.
# requirements.txt's torch==2.3.0 pin is then already satisfied (2.3.0+cpu
# matches it), so pip leaves this install alone.
ARG TORCH_INDEX=https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir torch==2.3.0 torchvision==0.18.0 --index-url ${TORCH_INDEX} \
    && pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p storage/images storage/models
RUN chmod +x docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["./docker-entrypoint.sh"]
