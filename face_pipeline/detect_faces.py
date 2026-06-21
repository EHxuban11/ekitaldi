#!/usr/bin/env python3
"""
Anonymous face detection + clustering for an ekitaldi photo gallery.

Stage 1 of the "find me in the photos" pipeline. Reads a folder of already
filtered/valid images, detects every face (InsightFace buffalo_l = RetinaFace
detector + ArcFace 512-D embeddings), clusters faces into anonymous people
(DBSCAN, cosine), and writes ONE JSON file with RELATIVE filenames so the Node
publisher (scripts/publish-gallery.mjs) can map each face to an uploaded photo.

Differences from the original fotomaton script this is adapted from:
  * outputs a single JSON (not 3 CSVs)
  * stores RELATIVE basenames, never absolute paths
  * adds face_index + example_files so the gallery can show avatars
  * CPU by default (matches the plain onnxruntime wheel); --gpu to use CUDA

Output JSON shape:
{
  "version": 1,
  "params": { "eps": 0.4, "min_samples": 3, "det_size": 640, "model": "buffalo_l" },
  "stats": { "images": N, "faces": N, "people": N, "photos_with_people": N },
  "photos":  [ { "filename": "IMG_4104.JPG", "person_ids": ["person_001", ...] }, ... ],
  "clusters":[ { "person_id": "person_001", "size": 37,
                 "example_faces": ["IMG_4104.JPG#face00", ...],
                 "example_files": ["IMG_4104.JPG", ...] }, ... ],
  "faces":   [ { "face_id": "IMG_4104.JPG#face00", "filename": "IMG_4104.JPG",
                 "face_index": 0, "bbox": [x1,y1,x2,y2],
                 "confidence": 0.93, "person_id": "person_001" }, ... ]
}
"""
import argparse
import json
import os
import sys
from collections import defaultdict

import numpy as np

IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff"}


def log(*a):
    print(*a, file=sys.stderr, flush=True)


def load_app(det_size, use_gpu):
    from insightface.app import FaceAnalysis

    providers = (
        ["CUDAExecutionProvider", "CPUExecutionProvider"]
        if use_gpu
        else ["CPUExecutionProvider"]
    )
    app = FaceAnalysis(name="buffalo_l", providers=providers)
    app.prepare(ctx_id=0 if use_gpu else -1, det_size=(det_size, det_size))
    return app


def imread_robust(path):
    """cv2.imread with a PIL fallback (cv2 chokes on some JPEGs/paths)."""
    import cv2

    img = cv2.imread(path)
    if img is not None:
        return img
    try:
        from PIL import Image

        pil = Image.open(path).convert("RGB")
        return cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        return None


def stable_person_ids(labels, embeddings):
    """Map DBSCAN labels -> person_001.. deterministically.

    Clusters are ordered by descending size (ties broken by centroid) so
    person_001 is always the most-photographed person and IDs are reproducible
    across re-runs of the same photo set.
    """
    clusters = defaultdict(list)
    for idx, lab in enumerate(labels):
        if lab == -1:
            continue  # noise / not enough detections
        clusters[lab].append(idx)

    summaries = []
    for lab, idxs in clusters.items():
        vecs = embeddings[idxs]
        centroid = vecs.mean(axis=0)
        n = np.linalg.norm(centroid)
        if n > 0:
            centroid = centroid / n
        summaries.append((lab, len(idxs), centroid))

    summaries.sort(key=lambda s: (-s[1], tuple(np.round(s[2], 4))))

    label_to_pid = {}
    for rank, (lab, _size, _centroid) in enumerate(summaries, start=1):
        label_to_pid[lab] = f"person_{rank:03d}"
    return label_to_pid


def main():
    ap = argparse.ArgumentParser(description="Anonymous face clustering -> JSON")
    ap.add_argument("--images", required=True, help="Folder of images")
    ap.add_argument("--out", default="faces.json", help="Output JSON path")
    ap.add_argument("--eps", type=float, default=0.40, help="DBSCAN eps (cosine)")
    ap.add_argument("--min-samples", type=int, default=3, help="DBSCAN min_samples")
    ap.add_argument("--det-size", type=int, default=640, help="Detector input size")
    ap.add_argument("--gpu", action="store_true", help="Use CUDA (needs onnxruntime-gpu)")
    args = ap.parse_args()

    folder = args.images
    if not os.path.isdir(folder):
        log(f"ERROR: not a folder: {folder}")
        sys.exit(2)

    files = sorted(
        f for f in os.listdir(folder)
        if os.path.splitext(f)[1].lower() in IMAGE_EXTS
        and os.path.isfile(os.path.join(folder, f))
    )
    if not files:
        log(f"ERROR: no images in {folder}")
        sys.exit(2)

    log(f"Loading InsightFace buffalo_l ({'GPU' if args.gpu else 'CPU'})…")
    app = load_app(args.det_size, args.gpu)

    from tqdm import tqdm

    face_rows = []      # dicts (without person_id yet)
    embeddings = []     # parallel to face_rows
    photos_seen = []    # preserve order of files actually read

    log(f"Detecting faces in {len(files)} images…")
    for fname in tqdm(files, unit="img"):
        img = imread_robust(os.path.join(folder, fname))
        if img is None:
            log(f"  skip (unreadable): {fname}")
            continue
        photos_seen.append(fname)
        faces = app.get(img)
        for i, f in enumerate(faces):
            emb = f.normed_embedding
            if emb is None:
                continue
            x1, y1, x2, y2 = (int(v) for v in f.bbox)
            face_rows.append({
                "face_id": f"{fname}#face{i:02d}",
                "filename": fname,
                "face_index": i,
                "bbox": [x1, y1, x2, y2],
                "confidence": float(f.det_score),
            })
            embeddings.append(emb)

    if not face_rows:
        log("No faces detected. Writing empty result.")
        result = {
            "version": 1,
            "params": {"eps": args.eps, "min_samples": args.min_samples,
                       "det_size": args.det_size, "model": "buffalo_l"},
            "stats": {"images": len(photos_seen), "faces": 0, "people": 0,
                      "photos_with_people": 0},
            "photos": [{"filename": f, "person_ids": []} for f in photos_seen],
            "clusters": [],
            "faces": [],
        }
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump(result, fh, indent=2)
        return

    log(f"Clustering {len(face_rows)} faces (DBSCAN eps={args.eps}, "
        f"min_samples={args.min_samples}, cosine)…")
    from sklearn.cluster import DBSCAN

    emb_mat = np.vstack(embeddings).astype("float32")
    labels = DBSCAN(
        eps=args.eps, min_samples=args.min_samples, metric="cosine", n_jobs=-1
    ).fit_predict(emb_mat)

    label_to_pid = stable_person_ids(labels, emb_mat)

    # attach person_id to each face
    for row, lab in zip(face_rows, labels):
        row["person_id"] = label_to_pid.get(int(lab))  # None for noise

    # per-photo sorted unique person_ids
    photo_people = defaultdict(set)
    for row in face_rows:
        if row["person_id"]:
            photo_people[row["filename"]].add(row["person_id"])
    photos = [
        {"filename": f, "person_ids": sorted(photo_people.get(f, set()))}
        for f in photos_seen
    ]

    # per-cluster summary
    by_pid = defaultdict(list)
    for row in face_rows:
        if row["person_id"]:
            by_pid[row["person_id"]].append(row)
    clusters = []
    for pid in sorted(by_pid.keys()):
        rows = by_pid[pid]
        example_faces = [r["face_id"] for r in rows[:6]]
        seen, example_files = set(), []
        for r in rows:
            if r["filename"] not in seen:
                seen.add(r["filename"])
                example_files.append(r["filename"])
            if len(example_files) >= 6:
                break
        clusters.append({
            "person_id": pid,
            "size": len(rows),
            "example_faces": example_faces,
            "example_files": example_files,
        })
    clusters.sort(key=lambda c: int(c["person_id"].split("_")[1]))

    result = {
        "version": 1,
        "params": {"eps": args.eps, "min_samples": args.min_samples,
                   "det_size": args.det_size, "model": "buffalo_l"},
        "stats": {
            "images": len(photos_seen),
            "faces": len(face_rows),
            "people": len(clusters),
            "photos_with_people": sum(1 for p in photos if p["person_ids"]),
        },
        "photos": photos,
        "clusters": clusters,
        "faces": face_rows,
    }
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)

    s = result["stats"]
    log(f"\nDone: {s['faces']} faces across {s['images']} images "
        f"-> {s['people']} people; {s['photos_with_people']} photos have people.")
    log(f"Wrote {args.out}")


if __name__ == "__main__":
    main()
