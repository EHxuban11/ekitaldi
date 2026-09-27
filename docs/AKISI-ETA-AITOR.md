# Akisi eta Aitor

Live gallery: https://www.ekitaldi.org/gallery/akisi-eta-aitor

The delivery contains 413 individual photos, 133 photo strips and 130 videos.
The event manifest maps these to All photos, Tiras and Bideoak. Existing galleries
continue using their original tabs. No database schema change is required.

Source media and supplied face data belong in the ignored `events/akisi-eta-aitor/source/`
and `exports/` directories. They are excluded from Git and Vercel deployments.
The gallery password is kept in the ignored `.env.local` as `GALLERY_PASSWORD`.

## Supplied face metadata

The supplied OpenCV metadata uses normalized x/y/width/height boxes; Ekitaldi's
avatar script expects pixel x1/y1/x2/y2 boxes. Prepare the compatible copy with:

```sh
node scripts/prepare-event-faces.mjs akisi-eta-aitor
npm run event:check -- akisi-eta-aitor
```

This keeps the reviewed assignments and labels, filters out references to photos
absent from the delivery, and converts coordinates without running a model.
The source JSON stays untouched. It produces 120 nonempty person filters.
Participant consent to publish the supplied filters was confirmed by Xuban on
2026-09-27. The manifest's `people.consentConfirmed` records that confirmation.

For a new event, `npm run event:publish -- <slug>` uploads media and supplied
assignments. Do not re-publish this existing slug. `scripts/import-gallery-faces.mjs`
can attach reviewed metadata to an already uploaded gallery without replacing
existing person data; use its `--dry-run` option first. `scripts/set-avatars.mjs`
generates the avatar crops from the converted metadata.

## Admin access

A valid GitHub admin session grants access to password-protected galleries and
downloads. It does not create a guest password cookie, so signing out restores
the password gate unless the visitor previously entered that gallery's password.
Responses with gallery contents and downloads use `private, no-store` caching.
Guests continue using each gallery's password.

Run `npm test` for access and tab compatibility tests, and `npm run build` for
production type checking and compilation. Production is the existing Vercel
project `photo_selector` under `xubanceccons-projects`; Git pushes do not deploy it.
