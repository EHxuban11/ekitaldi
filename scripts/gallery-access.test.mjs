import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const { NextRequest } = require("next/server");

// Use the existing TypeScript compiler and Node test runner. Only external
// services are mocked; route handlers, signed cookies and access checks run.
function harness() {
  const state = { admin: null, downloads: 0 };
  const gallery = {
    id: "gallery-id", slug: "wedding-slug", name: "Wedding", passwordHash: "protected",
    type: "wedding", brandingJson: JSON.stringify({ tabs: [{ key: "tiras", sections: ["tiras"] }] }),
    photos: [{ id: "photo-id", filename: "photo.jpg", r2Key: "photo", thumbR2Key: "thumb", section: "tiras", mediaType: "image" }],
    personClusters: [], faceRecognitionEnabled: false,
    _count: { photos: 1 },
  };
  const publicGallery = { ...gallery, id: "public-id", slug: "public-event", name: "Public Event", passwordHash: null };
  const mocks = {
    "@/lib/auth": { getAdminSession: async () => state.admin },
    "@/lib/db": { db: { gallery: { findFirst: async () => gallery, findMany: async () => [gallery, publicGallery] } } },
    "@/lib/r2": { getPublicUrl: (key) => `https://example.test/${key}` },
    "@/lib/local-event-preview": { localEventGallery: async () => null },
  };
  const cache = new Map();
  function load(relative) {
    if (cache.has(relative)) return cache.get(relative).exports;
    const filename = path.join(root, relative);
    const { outputText } = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    });
    const module = { exports: {} };
    cache.set(relative, module);
    vm.runInNewContext(outputText, {
      module, exports: module.exports, Buffer, console,
      process: { env: { NEXTAUTH_SECRET: "local-test-secret" } },
      Headers, Response,
      fetch: async () => { state.downloads++; return new Response("photo bytes", { headers: { "Content-Type": "image/jpeg" } }); },
      require: (name) => mocks[name] ?? (name.startsWith("@/") ? load(`${name.slice(2)}.ts`) : require(name)),
    }, { filename });
    return module.exports;
  }
  const request = (id, cookie) => new NextRequest(`http://localhost/api/gallery/${id}?photoId=photo-id`, {
    headers: cookie ? { Cookie: `gallery_${id}=${cookie}` } : {},
  });
  return { state, gallery, publicGallery, load, request };
}

for (const id of ["gallery-id", "wedding-slug"]) {
  test(`admin can view and download ${id} without a gallery cookie; logout revokes access`, async () => {
    const h = harness();
    h.state.admin = { user: { name: "admin" } };
    const view = h.load("app/api/gallery/[id]/route.ts").GET;
    const download = h.load("app/api/gallery/[id]/download/route.ts").GET;
    const response = await view(h.request(id), { params: { id } });
    const data = await response.json();
    assert.equal(data.authenticated, true);
    assert.equal(data.photos.length, 1);
    assert.equal(data.sectionTabs[0].key, "tiras");
    assert.equal(response.headers.get("set-cookie"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal((await download(h.request(id), { params: { id } })).status, 200);
    h.state.admin = null;
    const locked = await (await view(h.request(id), { params: { id } })).json();
    assert.equal(locked.authenticated, false);
    assert.equal(locked.photos, undefined);
    assert.equal((await download(h.request(id), { params: { id } })).status, 401);
    assert.equal(h.state.downloads, 1);
  });
}

test("guest password cookies still allow viewing and downloading", async () => {
  const h = harness();
  const id = "wedding-slug";
  const cookie = h.load("lib/gallery-auth.ts").signGalleryAccess(id);
  const response = await h.load("app/api/gallery/[id]/route.ts").GET(h.request(id, cookie), { params: { id } });
  assert.equal((await response.json()).authenticated, true);
  assert.equal((await h.load("app/api/gallery/[id]/download/route.ts").GET(h.request(id, cookie), { params: { id } })).status, 200);
});

for (const cookieType of ["missing", "malformed", "short-signature", "multibyte-signature", "other-gallery"]) {
  test(`guest with ${cookieType} cookie cannot view or download protected photos`, async () => {
    const h = harness();
    const id = "wedding-slug";
    const cookie = ({ missing: undefined, malformed: "bad", "short-signature": "gallery:wedding-slug:123.a",
      "multibyte-signature": `gallery:wedding-slug:123.${"é".repeat(64)}`,
      "other-gallery": h.load("lib/gallery-auth.ts").signGalleryAccess("different") })[cookieType];
    const response = await h.load("app/api/gallery/[id]/route.ts").GET(h.request(id, cookie), { params: { id } });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.authenticated, false);
    assert.equal(data.photos, undefined);
    assert.equal((await h.load("app/api/gallery/[id]/download/route.ts").GET(h.request(id, cookie), { params: { id } })).status, 401);
    assert.equal(h.state.downloads, 0);
  });
}

test("public galleries remain accessible to guests", async () => {
  const h = harness();
  h.gallery.passwordHash = null;
  const response = await h.load("app/api/gallery/[id]/route.ts").GET(h.request("gallery-id"), { params: { id: "gallery-id" } });
  assert.equal((await response.json()).authenticated, true);
});

test("legacy and malformed tab settings fall back; valid custom tabs preserve labels", () => {
  const { parseSectionTabs, sectionLabel, WEDDING_SECTIONS } = harness().load("lib/wedding.ts");
  for (const input of [null, "broken", "null", "{}", '{"tabs":[]}', '{"tabs":[{"key":"tiras","sections":"tiras"}]}']) {
    assert.equal(parseSectionTabs(input), undefined);
  }
  const tab = { key: "tiras", sections: ["tiras"], label: "Tiras", labels: { en: "Photo strips" } };
  const parsed = parseSectionTabs(JSON.stringify({ tabs: [tab] }));
  assert.equal(sectionLabel(parsed[0], "en"), "Photo strips");
  assert.equal(sectionLabel(parsed[0], "eu"), "Tiras");
  assert.equal(parseSectionTabs(JSON.stringify({ tabs: [tab, tab] })), undefined);
  assert.equal(WEDDING_SECTIONS[0].key, "novios_solos");
});

test("homepage keeps protected tiles but removes private names, slugs and covers for guests", async () => {
  const h = harness();
  const response = await h.load("app/api/gallery/public/route.ts").GET();
  const [locked, visible] = await response.json();
  assert.equal(locked.id, h.gallery.id);
  assert.equal(locked.name, "Protected Gallery");
  assert.equal(locked.slug, null);
  assert.equal(locked.coverUrl, null);
  assert.equal(visible.name, "Public Event");
  assert.equal(visible.slug, "public-event");
  assert.equal(visible.coverUrl, "https://example.test/thumb");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("vary"), "Cookie");
});

test("homepage shows actual protected names and covers to admins, then redacts after logout", async () => {
  const h = harness();
  const list = h.load("app/api/gallery/public/route.ts").GET;
  h.state.admin = { user: { name: "admin" } };
  const response = await list();
  const [adminGallery] = await response.json();
  assert.equal(adminGallery.name, "Wedding");
  assert.equal(adminGallery.slug, "wedding-slug");
  assert.equal(adminGallery.coverUrl, "https://example.test/thumb");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  h.state.admin = null;
  const [guestGallery] = await (await list()).json();
  assert.equal(guestGallery.name, "Protected Gallery");
  assert.equal(guestGallery.slug, null);
  assert.equal(guestGallery.coverUrl, null);
});

test("the wedding's configured opening photos, people priority and hero are returned together", async () => {
  const h = harness();
  h.state.admin = { user: { name: "admin" } };
  const event = JSON.parse(fs.readFileSync(path.join(root, "events/akisi-eta-aitor/event.json"), "utf8"));
  const pins = event.presentation.openingPhotos;
  h.gallery.brandingJson = JSON.stringify({ presentation: event.presentation });
  h.gallery.photos = [
    { id: "early", filename: "early.jpg", section: "todas", order: 0 },
    ...[...pins].sort((a, b) => a.filename.localeCompare(b.filename)).map((pin, i) => ({ ...pin, id: pin.filename, order: i + 1 })),
    { id: "late", filename: "late.jpg", section: "todas", order: 6 },
  ].map((p) => ({ ...p, r2Key: "photo", thumbR2Key: "thumb" }));
  h.gallery.coverPhotoId = pins[0].filename;
  h.gallery.faceRecognitionEnabled = true;
  h.gallery.personClusters = ["person_004", "person_001", "person_003", "person_002"].map((personId) => ({ personId, exampleKeys: [] }));
  const data = await (await h.load("app/api/gallery/[id]/route.ts").GET(h.request("gallery-id"), { params: { id: "gallery-id" } })).json();
  assert.deepEqual(data.photos.map((p) => p.filename), [...pins.map((pin) => pin.filename), "early.jpg", "late.jpg"]);
  assert.equal(new Set(data.photos.map((p) => p.id)).size, 7);
  assert.deepEqual(data.clusters.map((c) => c.personId), ["person_001", "person_002", "person_004", "person_003"]);
  assert.deepEqual(data.hero, { showLogo: true, positionX: 56 });
});

test("presentation pins match sections, ignore missing/duplicate photos, and do not mutate originals", () => {
  const { orderGalleryPhotos } = harness().load("lib/gallery-presentation.ts");
  const photos = [
    { id: "strip", filename: "same.jpg", section: "tiras", order: 0 },
    { id: "cover", filename: "cover.jpg", section: "todas", order: 2 },
    { id: "photo", filename: "same.jpg", section: "todas", order: 1 },
  ];
  const pin = { section: "todas", filename: "same.jpg" };
  const ordered = orderGalleryPhotos(photos, "cover", { openingPhotos: [pin, pin, { section: "todas", filename: "missing" }] });
  assert.equal(ordered.map((p) => p.id).join(","), "cover,photo,strip");
  assert.equal(photos.map((p) => p.id).join(","), "strip,cover,photo");
  assert.equal(orderGalleryPhotos(photos, "cover", {}).map((p) => p.id).join(","), "cover,strip,photo");
});

test("legacy/invalid presentation keeps defaults; normal galleries ignore wedding presentation", async () => {
  const h = harness();
  const { parsePresentation, orderGalleryPeople } = h.load("lib/gallery-presentation.ts");
  for (const input of [null, "broken", "null", "{}", '{"presentation":42}']) assert.equal(JSON.stringify(parsePresentation(input)), "{}");
  const invalid = parsePresentation('{"presentation":{"openingPhotos":[null],"peopleOrder":[3],"hero":{"positionX":101,"showLogo":"true"}}}');
  assert.equal(invalid.openingPhotos, undefined);
  assert.equal(invalid.peopleOrder, undefined);
  assert.equal(invalid.hero.positionX, undefined);
  assert.equal(invalid.hero.showLogo, undefined);
  assert.equal(orderGalleryPeople([{ personId: "b" }, { personId: "a" }], {}).map((p) => p.personId).join(","), "b,a");
  h.gallery.type = "normal";
  h.gallery.passwordHash = null;
  h.gallery.brandingJson = '{"presentation":{"hero":{"showLogo":true,"positionX":56}}}';
  const result = await (await h.load("app/api/gallery/[id]/route.ts").GET(h.request("gallery-id"), { params: { id: "gallery-id" } })).json();
  assert.equal(result.hero, undefined);
});
