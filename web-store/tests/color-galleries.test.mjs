import assert from "node:assert/strict";
import test from "node:test";
import { galleryLines, initialProductColor, parseGalleryFields, resolveColorGallery } from "../src/lib/color-galleries.ts";

const black = ["hero", "side", "detail"].map(view => `https://shop.example/black/${view}.webp`);
const navy = ["front", "back", "lining"].map(view => `https://shop.example/navy/${view}.webp`);
const product = {
  colors: ["أسود", "كحلي"],
  image_path: black[0], image_paths: [...black, ...navy],
  color_images: { "أسود": black[0], "كحلي": navy[0] },
  color_galleries: { "أسود": black, "كحلي": navy },
  product_variants: [{ color: "أسود", size: "M", stock: 0 }, { color: "كحلي", size: "L", stock: 4 }],
};

test("initial color follows stock and selection uses only that color's ordered photos", () => {
  assert.equal(initialProductColor(product), "كحلي");
  assert.deepEqual(resolveColorGallery(product, initialProductColor(product)), navy);
  assert.deepEqual(resolveColorGallery(product, "أسود"), black);
  assert.equal(initialProductColor({ colors: product.colors, product_variants: [] }), "أسود");
  assert.equal(initialProductColor({ colors: [] }), "");
});

test("legacy rows use the selected color cover and deduplicate shared photos", () => {
  const row = { ...product, image_paths: [navy[0], black[1], black[1]], color_galleries: {} };
  assert.deepEqual(resolveColorGallery(row, "كحلي"), [navy[0], black[1]]);
  assert.deepEqual(resolveColorGallery(row, ""), [black[0], navy[0], black[1]]);
  assert.deepEqual(resolveColorGallery({ image_path: null }, ""), []);
});

function parse(raw, field = "color_galleries") {
  const form = new FormData();
  form.set(field, raw);
  return parseGalleryFields(form, product.colors);
}

test("admin parsing preserves order, derives covers, and supports older forms", () => {
  assert.deepEqual(galleryLines("  " + black.join(" \r\n\n") + " "), black);
  assert.deepEqual(parse(JSON.stringify(product.color_galleries)), {
    color_galleries: product.color_galleries, color_images: product.color_images,
  });
  assert.deepEqual(parse(JSON.stringify(product.color_images), "color_images"), {
    color_galleries: { "أسود": [black[0]], "كحلي": [navy[0]] }, color_images: product.color_images,
  });
  assert.deepEqual(parse("{}"), { color_images: {}, color_galleries: {} });
  assert.deepEqual(parseGalleryFields(new FormData(), product.colors), {});
});

test("admin parsing rejects invalid maps, colors, counts, and URL elements", () => {
  for (const raw of ["broken", "null", "false", "[]", JSON.stringify({ other: black })]) {
    assert.equal(parse(raw), null);
  }
  for (const entry of [black[0], [], Array(9).fill(black[0]), [17], [""], ["not a URL"],
    ["http://shop.example/black.webp"], ["https://"], ["https://user:pass@shop.example/secret"]]) {
    assert.equal(parse(JSON.stringify({ "أسود": entry })), null);
  }
  assert.ok(parse(JSON.stringify({ "أسود": Array.from({ length: 8 }, (_, i) => black[0] + "?v=" + i) })));
});
