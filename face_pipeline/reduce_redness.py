#!/usr/bin/env python3
"""
Reduce facial redness in a photo, harmoniously across one or more people.

Detects faces (InsightFace) and pulls down redness (LAB a* channel) on each
targeted face's skin only, with a feathered mask. Background and clothing are
untouched.

  --top N            edit the N largest faces (e.g. 2 = a couple). Default 1.
  --target female|male|largest   when --top is not given, pick one face this way.
  --strength 0..1    how much redness to remove (0.2 is a natural light touch).

  python reduce_redness.py --image in.jpg --out out.jpg --top 2 --strength 0.2
"""
import argparse
import sys

import cv2
import numpy as np


def imread(path):
    img = cv2.imread(path)
    if img is None:
        from PIL import Image
        img = cv2.cvtColor(np.array(Image.open(path).convert("RGB")), cv2.COLOR_RGB2BGR)
    return img


def edit_face(img, bbox, strength, pad=0.25):
    """De-redden one face's skin in place."""
    H, W = img.shape[:2]
    x1, y1, x2, y2 = [int(v) for v in bbox]
    bw, bh = x2 - x1, y2 - y1
    if bw < 8 or bh < 8:
        return
    px, py = int(bw * pad), int(bh * pad)
    X1, Y1 = max(0, x1 - px), max(0, y1 - py)
    X2, Y2 = min(W, x2 + px), min(H, y2 + py)
    roi = img[Y1:Y2, X1:X2]
    orig = roi.copy()

    ycrcb = cv2.cvtColor(roi, cv2.COLOR_BGR2YCrCb)
    Cr, Cb = ycrcb[:, :, 1], ycrcb[:, :, 2]
    skin = ((Cr >= 133) & (Cr <= 183) & (Cb >= 77) & (Cb <= 135)).astype(np.float32)
    ell = np.zeros(skin.shape, np.float32)
    cx, cy = (x1 + x2) // 2 - X1, (y1 + y2) // 2 - Y1
    cv2.ellipse(ell, (cx, cy), (int(bw * 0.62), int(bh * 0.75)), 0, 0, 360, 1, -1)
    mask = cv2.GaussianBlur(np.clip(skin * ell, 0, 1), (0, 0), sigmaX=max(3.0, bw * 0.05))
    mask = np.clip(mask, 0, 1)[..., None]

    lab = cv2.cvtColor(roi, cv2.COLOR_BGR2LAB).astype(np.float32)
    a = lab[:, :, 1]
    lab[:, :, 1] = a - np.clip(a - 128.0, 0, None) * strength
    edited = cv2.cvtColor(np.clip(lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2BGR).astype(np.float32)

    img[Y1:Y2, X1:X2] = np.clip(orig.astype(np.float32) * (1 - mask) + edited * mask, 0, 255).astype(np.uint8)


def sex_of(f):
    s = getattr(f, "sex", None)
    if s in ("M", "F"):
        return s
    g = getattr(f, "gender", None)  # insightface: 1=male, 0=female
    return "M" if g == 1 else ("F" if g == 0 else None)


def area(f):
    x1, y1, x2, y2 = f.bbox
    return (x2 - x1) * (y2 - y1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--image", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--strength", type=float, default=0.2)
    ap.add_argument("--top", type=int, default=1, help="edit the N largest faces")
    ap.add_argument("--target", default="largest", choices=["female", "male", "largest"])
    args = ap.parse_args()

    img = imread(args.image)

    from insightface.app import FaceAnalysis
    app = FaceAnalysis(name="buffalo_l", providers=["CPUExecutionProvider"])
    app.prepare(ctx_id=-1, det_size=(640, 640))
    faces = app.get(img)
    if not faces:
        print("No faces detected", file=sys.stderr)
        sys.exit(2)

    faces.sort(key=area, reverse=True)
    if args.top and args.top > 1:
        targets = faces[: args.top]
    elif args.target == "largest":
        targets = faces[:1]
    else:
        want = "F" if args.target == "female" else "M"
        picked = [f for f in faces if sex_of(f) == want] or faces
        targets = [max(picked, key=area)]

    for f in targets:
        edit_face(img, f.bbox, args.strength)

    cv2.imwrite(args.out, img, [cv2.IMWRITE_JPEG_QUALITY, 95])
    info = ", ".join(f"({int(f.bbox[0])},{int(f.bbox[1])}) {sex_of(f)}" for f in targets)
    print(f"edited {len(targets)} face(s): {info}", file=sys.stderr)
    print(args.out)


if __name__ == "__main__":
    main()
