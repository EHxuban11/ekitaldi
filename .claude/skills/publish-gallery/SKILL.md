---
name: publish-gallery
description: Publish a photo gallery to ekitaldi (ekitaldi.org) from a local folder of images, optionally with opt-in AI face recognition ("find me in the photos"). Use whenever the user wants to publish/deliver a gallery, upload a shoot, or create an event gallery with face filtering (e.g. "publish this shoot", "make a gallery from this folder", "deliver these photos with face recognition", "publish with faces"). For full WEDDINGS (sections, video, logo, custom URL) use the wedding-gallery skill instead.
---

# Publish an ekitaldi gallery (with optional face recognition)

ekitaldi is the user's self-hosted Pixieset alternative (Next.js + Prisma/Neon
Postgres + Cloudflare R2), deployed at **ekitaldi.org**. Galleries are published
from the local machine with a CLI (not a web upload UI) because Vercel's ~4.5 MB
request limit can't take full-res photos. Working copy: `C:\Users\Usuario\ekitaldi`.

Face recognition is **strictly opt-in per gallery** (`--faces`). Without it, a
gallery behaves exactly as before, so existing galleries are never affected.

For a full wedding (section tabs, video, logo, couple-first banner, slug) use the
[[wedding-gallery]] skill and `scripts/publish-wedding.mjs` instead. This skill is
for a single flat gallery.

## The one command

```powershell
# Node is not on PATH by default:
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
Set-Location C:\Users\Usuario\ekitaldi

# Normal gallery (no faces):
node --env-file=.env.local scripts/publish-gallery.mjs "Gallery Name" "C:\path\to\photos"

# With face recognition (detect + cluster + enable filtering):
node --env-file=.env.local scripts/publish-gallery.mjs "Gallery Name" "C:\path\to\photos" --faces
```

Options: `--faces` (enable face recognition), `--faces-json <path>` (reuse a
precomputed faces.json, skips re-running Python), `--password <pw>`,
`--date "2026-06-20"`, `--max <px>` (downscale longest side), `--python <path>`.

On success it prints `Gallery URL: https://www.ekitaldi.org/gallery/<id>`.

## How it works (folder to live gallery)

1. **(--faces only) Detect faces**: shells out to `face_pipeline/detect_faces.py`
   (InsightFace `buffalo_l` + DBSCAN, CPU). Produces anonymous clusters
   `person_001…` (person_001 = most photographed). ~1-2 img/s on CPU; first run
   downloads a ~300 MB model. See `face_pipeline/README.md`.
2. **Upload**: each photo to sharp re-encode (full JPEG q92 + 600px webp thumb,
   EXIF stripped, auto-rotated) to Cloudflare R2 (`galleries/<id>/…`).
3. **DB**: creates the Gallery (`faceRecognitionEnabled` = whether `--faces`),
   GalleryPhoto rows (with `personIds`), PersonCluster rows, Face rows.
4. The gallery page shows a **People bar** only when the gallery is face-enabled
   and has clusters; tapping a person filters the grid. (No per-photo hover chips.)

## After publishing (data tweaks, no re-deploy)

```powershell
# face-crop avatars for the People bar
node --env-file=.env.local scripts/set-avatars.mjs <id> <faces.json> <photosFolder>
# pick the cover (couple/group shot; skips logos). --photo forces one.
node --env-file=.env.local scripts/set-cover.mjs <id> [--photo IMG_1234.JPG]
# pretty client URL: /gallery/<slug>
node --env-file=.env.local scripts/set-gallery.mjs <id> --slug some-slug
# password / language
node --env-file=.env.local scripts/set-gallery.mjs <id> --password <pw> --language es
```

## Prerequisites

- `.env.local` in `C:\Users\Usuario\ekitaldi` (R2 + Neon secrets), already set up.
- For `--faces`: the Python venv at `face_pipeline/.venv`. If missing:
  ```powershell
  & "C:\Users\Usuario\AppData\Local\Programs\Python\Python312\python.exe" -m venv C:\Users\Usuario\ekitaldi\face_pipeline\.venv
  C:\Users\Usuario\ekitaldi\face_pipeline\.venv\Scripts\pip install -r C:\Users\Usuario\ekitaldi\face_pipeline\requirements.txt
  ```
- Schema face columns/tables are additive. If ever dropped, re-apply with
  `npx prisma db push` (additive only; verify `migrate diff` shows no DROP).

## Good-to-know / gotchas

- **Cover photo**: by default the first photo by name. Logo/title cards
  (`*_Corto.png`) sort first, so set a real cover afterwards with
  `scripts/set-cover.mjs`.
- **Tuning faces**: loosen/tighten with `face_pipeline` flags `--eps` /
  `--min-samples` (re-run detection, then publish with `--faces-json`).
- **Privacy**: clusters are anonymous (no names). Add `--password` for a private
  delivery; the landing page censors locked galleries' covers.
- **Deploy**: data tweaks are live instantly. Code changes need
  `npx vercel --prod --yes` (this repo does NOT deploy on git push).
- Related: feedback issues for ekitaldi are triaged via the [[check-issues]] flow.
