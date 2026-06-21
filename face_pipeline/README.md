# face_pipeline — "find me in the photos"

Stage 1 of ekitaldi's opt-in face recognition. Detects every face in a folder of
photos and clusters them into **anonymous** people (`person_001`, `person_002`,
…), writing a single `faces.json` that `scripts/publish-gallery.mjs` ingests.

- **Model:** InsightFace `buffalo_l` (RetinaFace detector + ArcFace 512-D embeddings)
- **Clustering:** DBSCAN, cosine distance, `eps=0.40`, `min_samples=3`
- **Stable IDs:** clusters sorted by size, so `person_001` = the most photographed
  person (e.g. the couple), reproducible across re-runs of the same photos.
- **Anonymous:** no names, just clusters. A person needs ≥3 detections to form a
  cluster; rarer faces are dropped as noise.

## Setup (once)

```bash
cd face_pipeline
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt   # Windows
# .venv/bin/pip install -r requirements.txt      # macOS/Linux
```

CPU by default (the plain `onnxruntime` wheel). For CUDA, install
`onnxruntime-gpu` and pass `--gpu`. First run downloads the buffalo_l model
(~300 MB) into `~/.insightface/models`.

## Run directly

```bash
.venv/Scripts/python detect_faces.py --images "/path/to/photos" --out faces.json
```

Output `faces.json`:

```jsonc
{
  "stats":    { "images": 268, "faces": 981, "people": 88, "photos_with_people": 259 },
  "photos":   [ { "filename": "IMG_3812.JPG", "person_ids": ["person_001","person_004"] } ],
  "clusters": [ { "person_id": "person_001", "size": 37, "example_files": ["IMG_3812.JPG"] } ],
  "faces":    [ { "face_id": "IMG_3812.JPG#face00", "filename": "IMG_3812.JPG",
                  "face_index": 0, "bbox": [x1,y1,x2,y2], "confidence": 0.93,
                  "person_id": "person_001" } ]
}
```

Filenames are **relative basenames** so the Node publisher can map each face to
its uploaded photo. You normally don't run this directly —
`scripts/publish-gallery.mjs --faces` runs it for you.

## Tuning

| flag | default | effect |
|------|---------|--------|
| `--eps` | 0.40 | larger = looser grouping (more merges, risk of mixing people) |
| `--min-samples` | 3 | minimum detections to count as a person |
| `--det-size` | 640 | detector input; larger finds smaller/farther faces, slower |
