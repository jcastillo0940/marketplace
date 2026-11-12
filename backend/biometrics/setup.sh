#!/usr/bin/env bash
# Installs the server-side face matcher used by BiometricVerificationController (App\Services\FaceMatcher).
# Free, commercially usable models from OpenCV Zoo: YuNet (MIT) and SFace (Apache 2.0).
# Run from anywhere: bash backend/biometrics/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

if [ ! -x .venv/bin/python ]; then
  # Debian ships python3 without ensurepip, so pip is bootstrapped separately.
  python3 -m venv --without-pip .venv
  curl -sSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
  .venv/bin/python -I /tmp/get-pip.py -q
  rm -f /tmp/get-pip.py
fi
.venv/bin/pip install -q opencv-python-headless==4.10.0.84 "numpy<2.3"

mkdir -p models
fetch() {
  local name=$1 url=$2 sum=$3
  if [ ! -f "models/$name" ] || ! echo "$sum  models/$name" | sha256sum -c --status; then
    curl -sSL -o "models/$name" "$url"
  fi
  echo "$sum  models/$name" | sha256sum -c
}
fetch face_detection_yunet_2023mar.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx \
  8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4
fetch face_recognition_sface_2021dec.onnx \
  https://github.com/opencv/opencv_zoo/raw/main/models/face_recognition_sface/face_recognition_sface_2021dec.onnx \
  0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79

.venv/bin/python -I -c "import cv2; assert hasattr(cv2, 'FaceRecognizerSF'); print('face matcher ready, OpenCV', cv2.__version__)"
