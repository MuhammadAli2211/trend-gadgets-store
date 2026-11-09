"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  detectProductAudience,
  generateProductContent,
  analyzePostingTimes,
  summarizeMetrics,
} = require("../services/organicGrowthEngine");

test("detects stationery audience from product category and tags", () => {
  const result = detectProductAudience({ name: "Exam Notebook", category: "Stationery", tags: ["school", "study"] });
  assert.equal(result.category, "Stationery");
  assert.ok(result.audience.includes("students"));
  assert.match(result.researchNote, /not Meta audience insights/);
});

test("detects toys when category is missing", () => {
  const result = detectProductAudience({ name: "Kids Building Blocks", description: "Creative toy set" });
  assert.equal(result.category, "Toys");
  assert.ok(result.audience.includes("parents"));
});

test("content generation creates distinct variants without inventing claims", () => {
  const product = { name: "Desk Organizer", category: "Stationery", description: "Plastic desk organizer", price: 450 };
  const first = generateProductContent(product, { variant: 0 });
  const second = generateProductContent(product, { variant: 1 });
  assert.notEqual(first.caption, second.caption);
  assert.ok(first.hashtags.includes("#StationeryPakistan"));
  assert.equal(first.generatedWithoutExternalAI, true);
  assert.doesNotMatch(first.caption, /best quality|guaranteed|limited stock/i);
});

test("metrics remain unavailable when there are no actual non-zero values", () => {
  const result = summarizeMetrics([{ views: 0, likes: 0, comments: 0, shares: 0 }]);
  assert.equal(result.available, false);
  assert.equal(result.postsWithMetrics, 0);
});

test("posting time analysis does not recommend from fewer than three posts", () => {
  const result = analyzePostingTimes([
    { publishedAt: "2026-11-01T10:00:00Z", views: 100, likes: 10 },
    { publishedAt: "2026-11-02T10:00:00Z", views: 100, likes: 12 },
  ]);
  assert.equal(result.available, false);
  assert.equal(result.sampleSize, 2);
});
