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
  };
  const mocks = {
    "@/lib/auth": { getAdminSession: async () => state.admin },
    "@/lib/db": { db: { gallery: { findFirst: async () => gallery } } },
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
  return { state, gallery, load, request };
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
