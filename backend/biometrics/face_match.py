"""Compares the face in a selfie with the face printed on a cédula.

Usage: face_match.py <selfie.jpg> <cedula.jpg>
Prints one JSON object. Exit code 0 even when no face is found: the caller reads "status".

Models (OpenCV Zoo, free for commercial use):
  - YuNet face detector, MIT license
  - SFace face recognizer, Apache 2.0 license
"""
import json
import os
import sys

import cv2
import numpy as np

MODELS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "models")
DETECTOR = os.path.join(MODELS, "face_detection_yunet_2023mar.onnx")
RECOGNIZER = os.path.join(MODELS, "face_recognition_sface_2021dec.onnx")

# Faces smaller than this (in pixels, after upscaling) are too blurry to compare.
MIN_FACE_PX = 60
# The face on a cédula is small, so the photo is enlarged before detection.
MAX_SIDE = 1600


def load(path):
    image = cv2.imread(path, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("unreadable")
    height, width = image.shape[:2]
    scale = MAX_SIDE / max(height, width)
    if scale > 1.0:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    elif scale < 1.0:
        image = cv2.resize(image, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    return image


def largest_face(detector, image):
    height, width = image.shape[:2]
    detector.setInputSize((width, height))
    _, faces = detector.detect(image)
    if faces is None or len(faces) == 0:
        return None, 0
    faces = sorted(faces, key=lambda face: face[2] * face[3], reverse=True)
    return faces[0], len(faces)


def sharpness(image, face):
    x, y, w, h = [int(max(v, 0)) for v in face[:4]]
    crop = image[y:y + h, x:x + w]
    if crop.size == 0:
        return 0.0
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def describe(detector, recognizer, path, label):
    image = load(path)
    face, count = largest_face(detector, image)
    if face is None:
        return None, {"label": label, "faces": 0}
    size = float(min(face[2], face[3]))
    info = {
        "label": label,
        "faces": count,
        "face_px": round(size, 1),
        "detector_score": round(float(face[14]), 3),
        "sharpness": round(sharpness(image, face), 1),
    }
    if size < MIN_FACE_PX:
        return None, info
    aligned = recognizer.alignCrop(image, face)
    return recognizer.feature(aligned), info


def main():
    if len(sys.argv) != 3:
        print(json.dumps({"status": "error", "message": "usage"}))
        return 2
    detector = cv2.FaceDetectorYN.create(DETECTOR, "", (320, 320), 0.7, 0.3, 5000)
    recognizer = cv2.FaceRecognizerSF.create(RECOGNIZER, "")

    try:
        selfie_feature, selfie = describe(detector, recognizer, sys.argv[1], "selfie")
        cedula_feature, cedula = describe(detector, recognizer, sys.argv[2], "cedula")
    except ValueError:
        print(json.dumps({"status": "error", "message": "unreadable_image"}))
        return 0

    result = {"selfie": selfie, "cedula": cedula}
    if selfie_feature is None:
        result["status"] = "no_face_selfie"
    elif cedula_feature is None:
        result["status"] = "no_face_cedula"
    else:
        result["status"] = "ok"
        result["cosine"] = round(float(recognizer.match(selfie_feature, cedula_feature, cv2.FaceRecognizerSF_FR_COSINE)), 4)
        result["l2"] = round(float(recognizer.match(selfie_feature, cedula_feature, cv2.FaceRecognizerSF_FR_NORM_L2)), 4)
    print(json.dumps(result))
    return 0


if __name__ == "__main__":
    np.seterr(all="ignore")
    sys.exit(main())
