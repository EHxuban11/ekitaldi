#!/usr/bin/env python3
"""
Find which photo in a folder a reference image (often a crop/edit) came from,
using ORB feature matching (robust to cropping/resizing/light edits).

Usage:
  python find_source.py --ref "/path/to/banner.png" --folder "/path/to/photos" [--top 5]

Prints the top matches as "<good_matches>\t<filename>" (best first).
"""
import argparse
import os
import sys

import cv2
import numpy as np


def load_gray(path, max_dim=1100):
    img = cv2.imread(path)
    if img is None:
        from PIL import Image
        img = cv2.cvtColor(np.array(Image.open(path).convert("RGB")), cv2.COLOR_RGB2BGR)
    h, w = img.shape[:2]
    s = max_dim / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", required=True)
    ap.add_argument("--folder", required=True)
    ap.add_argument("--top", type=int, default=5)
    a = ap.parse_args()

    orb = cv2.ORB_create(nfeatures=2000)
    ref = load_gray(a.ref)
    _, des1 = orb.detectAndCompute(ref, None)
    if des1 is None:
        print("No features in reference image", file=sys.stderr)
        sys.exit(2)
    bf = cv2.BFMatcher(cv2.NORM_HAMMING)

    exts = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
    files = [f for f in sorted(os.listdir(a.folder)) if os.path.splitext(f)[1].lower() in exts]
    scores = []
    for i, f in enumerate(files):
        try:
            g = load_gray(os.path.join(a.folder, f))
            _, des2 = orb.detectAndCompute(g, None)
            if des2 is None:
                scores.append((0, f))
                continue
            good = 0
            for pair in bf.knnMatch(des1, des2, k=2):
                if len(pair) < 2:
                    continue
                m, n = pair
                if m.distance < 0.75 * n.distance:
                    good += 1
            scores.append((good, f))
        except Exception:
            scores.append((0, f))
        print(f"\r{i + 1}/{len(files)}", end="", file=sys.stderr, flush=True)
    print("", file=sys.stderr)

    scores.sort(reverse=True)
    for s, f in scores[: a.top]:
        print(f"{s}\t{f}")


if __name__ == "__main__":
    main()
