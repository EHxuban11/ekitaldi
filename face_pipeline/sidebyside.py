#!/usr/bin/env python3
"""Make a labelled before|after side-by-side JPEG. Usage: sidebyside.py before after out [labelA labelB]"""
import sys
import cv2
import numpy as np

a = cv2.imread(sys.argv[1])
b = cv2.imread(sys.argv[2])
out_path = sys.argv[3]
la = sys.argv[4] if len(sys.argv) > 4 else "BEFORE"
lb = sys.argv[5] if len(sys.argv) > 5 else "AFTER"

H = 1000
def rz(x):
    s = H / x.shape[0]
    return cv2.resize(x, (int(x.shape[1] * s), H))

a, b = rz(a), rz(b)
for img, label in ((a, la), (b, lb)):
    cv2.rectangle(img, (0, 0), (260, 56), (0, 0, 0), -1)
    cv2.putText(img, label, (16, 40), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2, cv2.LINE_AA)

gap = 255 * np.ones((H, 14, 3), "uint8")
cv2.imwrite(out_path, cv2.hconcat([a, gap, b]), [cv2.IMWRITE_JPEG_QUALITY, 92])
print(out_path)
