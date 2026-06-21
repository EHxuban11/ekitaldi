#!/usr/bin/env python3
"""Crop the same face region from N images and lay them side by side, labelled.
Usage: face_compare.py out "x1,y1,x2,y2" path1 label1 path2 label2 ..."""
import sys
import cv2
import numpy as np

out = sys.argv[1]
x1, y1, x2, y2 = [int(v) for v in sys.argv[2].split(",")]
rest = sys.argv[3:]
pairs = [(rest[i], rest[i + 1]) for i in range(0, len(rest), 2)]

pad = 0.35
bw, bh = x2 - x1, y2 - y1
px, py = int(bw * pad), int(bh * pad)
H = 760
panels = []
for path, label in pairs:
    img = cv2.imread(path)
    X1, Y1 = max(0, x1 - px), max(0, y1 - py)
    X2, Y2 = min(img.shape[1], x2 + px), min(img.shape[0], y2 + py)
    crop = img[Y1:Y2, X1:X2]
    s = H / crop.shape[0]
    crop = cv2.resize(crop, (int(crop.shape[1] * s), H))
    cv2.rectangle(crop, (0, 0), (crop.shape[1], 46), (0, 0, 0), -1)
    cv2.putText(crop, label, (12, 33), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
    panels.append(crop)
    panels.append(255 * np.ones((H, 10, 3), "uint8"))
panels = panels[:-1]
cv2.imwrite(out, cv2.hconcat(panels), [cv2.IMWRITE_JPEG_QUALITY, 92])
print(out)
