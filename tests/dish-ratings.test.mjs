import test from "node:test";
import assert from "node:assert/strict";
import { summarizeReviews, initDishRatings } from "../src/dish-ratings.js";

const review = (stars, updatedAt = 1000, extra = {}) => ({
  nickname: "食客", stars, comment: "", createdAt: 100, updatedAt, ...extra
});

test("没有评价时显示空口碑，不伪造零分", () => {
  const result = summarizeReviews(null);
  assert.equal(result.average, null);
  assert.equal(result.count, 0);
  assert.deepEqual(result.bins, [0, 0, 0, 0, 0]);
});

test("五星按十分制计算均分与五档人数", () => {
  const result = summarizeReviews({ a: review(5), b: review(4), c: review(3) });
  assert.equal(result.average, "8.0");
  assert.equal(result.count, 3);
  assert.deepEqual(result.bins, [0, 0, 1, 1, 1]);
});

test("同一身份改分替换原记录，人数不增长", () => {
  const reviews = { a: review(5), b: review(4) };
  const before = summarizeReviews(reviews);
  reviews.a = review(1, 2000);
  const after = summarizeReviews(reviews);
  assert.equal(before.count, after.count);
  assert.equal(after.average, "5.0");
  assert.deepEqual(after.bins, [1, 0, 0, 1, 0]);
});

test("同一浏览器对不同菜品的评价各自累计", () => {
  const menuReviews = { 126: { a: review(5) }, 130: { a: review(2) } };
  assert.equal(summarizeReviews(menuReviews[126]).average, "10.0");
  assert.equal(summarizeReviews(menuReviews[130]).average, "4.0");
});

test("无效评分和损坏记录不参与均分或人数", () => {
  const result = summarizeReviews({
    valid: review(4), zero: review(0), high: review(6), fraction: review(3.5),
    text: review("5"), blank: review(5, 1000, { nickname: "  " }),
    long: review(5, 1000, { comment: "字".repeat(81) }),
    badTime: review(5, "yesterday"), missing: null
  });
  assert.equal(result.count, 1);
  assert.equal(result.average, "8.0");
});

test("评价按更新时间倒序展示，改分后的记录排在前面", () => {
  const result = summarizeReviews({ a: review(5, 1000), b: review(4, 3000), c: review(3, 2000) });
  assert.deepEqual(result.reviews.map(item => item.uid), ["b", "c", "a"]);
});

test("均分保留一位小数，不修改原始评价", () => {
  const source = { a: review(5), b: review(5), c: review(4) };
  const before = JSON.stringify(source);
  assert.equal(summarizeReviews(source).average, "9.3");
  assert.equal(JSON.stringify(source), before);
});

test("缓存中的旧页面缺少评分面板时不阻断点餐初始化", () => {
  const previousDocument = globalThis.document;
  globalThis.document = { getElementById: () => null };
  try {
    const ratings = initDishRatings({ menuData: [] });
    assert.equal(ratings.buttonHtml({ id: 130 }), "");
    assert.doesNotThrow(() => ratings.start());
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
