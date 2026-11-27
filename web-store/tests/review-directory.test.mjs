import assert from "node:assert/strict";
import test from "node:test";
import { reviewFilters, reviewHref, reviewsPageSize } from "../src/lib/review-directory.ts";

test("review navigation rejects ambiguous filters and invalid page or rating values", () => {
  const defaults = { filter: "all", q: "", rating: null, page: 1 };
  for (const input of [{}, { q: ["conflict"], rating: "6", page: "0", filter: "published" },
    { page: "1000000000", rating: "-1" }, { page: "1e3", rating: "3.5" }, { page: ["2"], rating: ["4"] }]) {
    assert.deepEqual(reviewFilters(input), defaults);
  }
  assert.equal(reviewHref(defaults), "/admin/reviews");
  assert.equal(reviewFilters({ q: "x".repeat(101) }).q.length, 100);
});

test("review page and tab links preserve literal search and rating through a deep page", () => {
  const filters = reviewFilters({ q: "  رنا & Amy  ", rating: "4", filter: "needs_reply", page: "11" });
  assert.equal(reviewsPageSize, 20);
  assert.deepEqual(filters, { filter: "needs_reply", q: "رنا & Amy", rating: 4, page: 11 });
  const current = new URL(reviewHref(filters), "https://example.invalid");
  assert.deepEqual(reviewFilters(Object.fromEntries(current.searchParams)), filters);
  const switched = new URL(reviewHref({ ...filters, filter: "hidden", page: 1 }), current);
  assert.equal(switched.searchParams.has("page"), false);
  assert.equal(switched.searchParams.get("q"), filters.q);
  assert.equal(switched.searchParams.get("rating"), "4");
  assert.equal(switched.searchParams.get("filter"), "hidden");
});
