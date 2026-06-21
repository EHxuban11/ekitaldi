---
name: wedding-gallery
description: Create, publish, and tweak a WEDDING photo gallery in ekitaldi (Gallery.type="wedding") — sections/tabs, face recognition, video, logo, and a custom client URL. Use whenever a client sends a structured wedding photo folder, or the user wants to publish/edit a wedding gallery, add or reorder section tabs, set the banner, or give the gallery a pretty URL. Wedding mode is isolated from normal galleries, so nothing here affects regular ones.
---

# Wedding gallery ("modo bodas") for ekitaldi

A wedding gallery is `Gallery.type = "wedding"`: a richer layout (section tabs,
face recognition, video, logo, custom URL) kept fully separate from normal
galleries (`type = "normal"`), which render exactly as before. Repo:
`C:\Users\Usuario\ekitaldi`.

## The one rule: the couple comes first, always

Prioritize the married couple over everything, for BOTH the banner and the tab
order:
- **First tab = "Los novios"** (`novios_solos`). It is the default view when the
  gallery loads (the array order in `lib/wedding.ts` decides the tabs; the first
  entry is the default). Keep `novios_solos` first.
- **Banner/cover = a photo of the couple.** Never a logo, a framed print, or a
  random guest. See "Choosing the banner" below.

## Step 0 — read the client's folder and its README.TXT files

The client delivers a structured folder, one subfolder per section, plus
`README.TXT` files that explain what they want. **Read every README.TXT first** —
they say which photo is the principal, what each section is, etc. Typical layout:

| Folder | section key | content |
|---|---|---|
| `TODAS_LAS_FOTOS_SIN_MARCO` | `todas` | all originals (face recognition runs here) |
| `FAMILIA_IMPORTANTE` | `familia_importante` | family, no frame |
| `FAMILIA_MARCO` | `familia_marco` | family framed; has `principal.jpg` (the couple) + `padres_*.jpg` |
| `novios_solos` | `novios_solos` | the couple alone |
| `novios_con_amigos` | `novios_con_amigos` | group shots |
| `PRINTS` | `prints` | framed prints with the couple's logo |
| `VIDEOS` | `videos` | mp4 clips |
| `LOGOS` | (logo) | `*_Largo.png` (long) + `Logo*.png` (round) |

A UI tab can combine several section keys (e.g. "Familia" = `familia_marco` +
`familia_importante`, because the client asked for framed AND unframed family
together).

## Step 1 — detect faces (on "todas" only)

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
$vpy = "C:\Users\Usuario\ekitaldi\face_pipeline\.venv\Scripts\python.exe"
& $vpy face_pipeline\detect_faces.py --images "<root>\TODAS_LAS_FOTOS_SIN_MARCO" --out "<root>\faces.json"
```

`person_001` and `person_002` end up being the two most-photographed people, i.e.
the couple. That is what the cover heuristic and the People bar rely on.

## Step 2 — publish

```powershell
node --env-file=.env.local scripts/publish-wedding.mjs "Couple Name" "<root>" `
  --password <pw> --date "2026-06-20" --language es --faces-json "<root>\faces.json"
```

This: creates the `type="wedding"` gallery, uploads every section (images +
videos) and the logo, runs the person clusters from `todas`, and sets a couple
landscape shot as the cover. It uploads a lot (~1.5 GB for a full wedding); it
runs section by section without per-file logging.

## Step 3 — finish (data tweaks, no re-deploy needed)

These are DB changes, live immediately:

```powershell
# face-crop avatars for the People bar
node --env-file=.env.local scripts/set-avatars.mjs <id> "<root>\faces.json" "<root>\TODAS_LAS_FOTOS_SIN_MARCO"
# custom client URL (slug)  ->  /gallery/ainhoa-eta-adrian
node --env-file=.env.local scripts/set-gallery.mjs <id> --slug ainhoa-eta-adrian
# banner: the principal photo the client named (see below)
node --env-file=.env.local scripts/set-cover.mjs <id> --photo principal.jpg
# reorder photos inside a section (pin to the front, in order)
node --env-file=.env.local scripts/reorder-section.mjs <id> <photoId1> <photoId2>
```

## Choosing the banner (couple first)

1. **Read the client's README.TXT.** It usually names the principal explicitly,
   e.g. `FAMILIA_MARCO` says *"la principal, los novios juntos"* → use
   `principal.jpg`.
2. Otherwise auto-pick: `set-cover.mjs <id>` chooses a **landscape** photo from
   `todas` containing **both `person_001` and `person_002`** (the couple), and
   skips logos. Use `--photo <filename>` to force a specific one.
3. To find which file a reference image is (e.g. the client sends a cropped
   banner), use `face_pipeline/find_source.py --ref <img> --folder <todas>` (ORB
   match).
4. If the cover is a **framed** photo, the hero does NOT overlay the logo (it
   already carries branding — avoid double logo).

## Custom URL for the client (slug)

`set-gallery.mjs <id> --slug ainhoa-eta-adrian` → the gallery lives at
`https://www.ekitaldi.org/gallery/ainhoa-eta-adrian`. Slugs must be unique. The
old cuid URL keeps working: the view/auth/download/metadata routes resolve the
`[id]` segment by **slug OR cuid** (`OR: [{id}, {slug}]`). Per-photo share links
(`?p=...`) and the landing links automatically use the slug.

## Adding / reordering section tabs

- **Tab config:** `lib/wedding.ts` → `WEDDING_SECTIONS` (array order = tab order;
  first entry = default tab). Labels (en/es/eu) in the same file's `LABELS`.
- **Add a tab x/y/z:** (1) add the folder→section mapping in
  `scripts/publish-wedding.mjs` `SECTIONS`; (2) add an entry to `WEDDING_SECTIONS`
  (its `sections: []` lists the photo.section keys it shows; one tab can combine
  several); (3) add `LABELS` for it.
- **Reorder tabs:** reorder the `WEDDING_SECTIONS` array. **Keep `novios_solos`
  first.** Then build + deploy (it's a code change).

## Video, faces, privacy

- **Video:** mp4 served as `<video>` (browser shows the first frame; no ffmpeg /
  posters). Lives in the `videos` section.
- **Faces:** run only on `todas`. The People bar (with face-crop avatars) shows
  only on the "Todas las fotos" tab. There are no per-photo hover chips.
- **Privacy:** weddings are private. Set a password (`set-gallery --password`);
  the public landing censors locked galleries' covers.

## Deploy (important)

This repo does **NOT** auto-deploy on `git push`. Ship code changes with:

```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
npx --yes vercel --prod --yes   # builds remotely, aliases www.ekitaldi.org
```

Validate locally first with `npx next build` (use that, not `npm run build`,
which can hit a Windows Prisma DLL lock). Data-only tweaks (slug, language,
cover, password, reorder) need no deploy.

## Schema (all additive, no regressions)

- `Gallery`: `type`, `slug`, `logoKey`, `language`, `faceRecognitionEnabled`
- `GalleryPhoto`: `section`, `mediaType` (image|video), `posterR2Key`,
  `personIds`, `order`

## Helper scripts (in `scripts/`)

`publish-wedding`, `set-avatars`, `set-cover`, `set-gallery` (`--slug` /
`--language` / `--password` / `--name` / `--date`), `reorder-section`,
`replace-photo`, `delete-gallery`, `list-galleries`. First real wedding:
**Ainhoa eta Adrian** (`/gallery/ainhoa-eta-adrian`).
