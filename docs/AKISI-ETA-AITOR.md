# Akassi eta Aitor

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

This keeps the reviewed assignments and labels for the 413 individual photos,
and converts coordinates without running a model. The source JSON stays untouched.
It produces 120 nonempty All Photos filters. The other 68 filters shown by the
friend's preview occur only in photo strips; their assignments remain in the
original JSON. That JSON covers 413 photos, 133 strips and 11 absent files.
Participant consent to publish the supplied filters was confirmed by Xuban on
2026-09-27. The manifest's `people.consentConfirmed` records that confirmation.

For a new event, `npm run event:publish -- <slug>` uploads media and supplied
assignments. Do not re-publish this existing slug. `scripts/import-gallery-faces.mjs`
can attach reviewed metadata to an already uploaded gallery without replacing
existing person data; use its `--dry-run` option first.

## Event presentation

The manifest's `presentation` settings pin the five opening photos in the
friend's exact order, prioritize Akassi and Aitor in the people bar, display the
wedding logo, and set the cover's horizontal position to 56%. These settings are
stored in this gallery's `brandingJson`; other galleries keep their existing
ordering and cover appearance. Person search is not enabled.

For an existing event, preview and apply its presentation with:

```sh
node --env-file=.env.local scripts/sync-event-presentation.mjs akisi-eta-aitor
node --env-file=.env.local scripts/sync-event-presentation.mjs akisi-eta-aitor --apply
```

This also honors `people.avatarSelection: "reviewed"`, restoring each supplied
`example_faces[0]` thumbnail with the same crop and image finishing as the friend's
preview. All 120 choices exist in the delivery. It does not alter recognition
assignments or passwords. Previous presentation and avatar references are backed
up locally under ignored `exports/`; existing R2 objects are retained. The event
publisher automatically runs this step when an event has presentation settings.
Do not run the older best-face avatar selector afterwards, since that would
overwrite the reviewed choices.

## Admin access

A valid GitHub admin session grants access to password-protected galleries and
downloads. It does not create a guest password cookie, so signing out restores
the password gate unless the visitor previously entered that gallery's password.
Responses with gallery contents and downloads use `private, no-store` caching.
Guests continue using each gallery's password.

The homepage keeps every gallery tile. Guests see "Protected Gallery" with a
generic image and an opaque gallery-ID link for protected events; dates and media
counts remain visible. Signed-in admins see the actual names, covers and slugs.
The list response is private and never cached. The homepage refreshes on focus
and browser history restoration so login/logout in another tab is reflected.

Run `npm test` for access and tab compatibility tests, and `npm run build` for
production type checking and compilation. Production is the existing Vercel
project `photo_selector` under `xubanceccons-projects`; Git pushes do not deploy it.

The confirmed spelling is **Akassi**. The event manifest overrides the supplied
`person_001` label through `people.labels`, preserving the original source JSON.
The existing URL and delivery-directory identifier are retained for compatibility.
