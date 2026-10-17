/* Run with: node --test v2/tests/schedule.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("../schedule.js", import.meta.url), "utf8");
const window = {};
runInNewContext(source, { window });
const { validate, solve } = window.TripSchedule;
const m = [
  [0, 600, 1800, 900],
  [600, 0, 1200, 600],
  [1800, 1200, 0, 600],
  [900, 600, 600, 0]
];
const c = {
  depart: "09:00", dwell: 20, priority: 1, appointment: 2,
  appointmentTime: "10:00", deadline: "12:00"
};
test("priority is first, appointment is not late, return deadline met", () => {
  const result = solve(m, c);
  assert.equal(result.order[0], 1);
  assert.equal(result.order.length, 3);
  assert.equal(new Set(result.order).size, 3);
  const timed = result.stops.find(s => s.index === 2);
  assert.equal(timed.startText, "10:00");
  assert.equal(result.returnText, "11:00");
  assert.equal(result.dwellSeconds, 60 * 60);
});
test("over-constrained return is rejected, never silently ignored", () => {
  assert.throws(() => solve(m, { ...c, deadline: "10:30" }), /경로를 찾지 못했습니다/);
});
test("ordered mode rejects a priority conflicting with first visit", () => {
  assert.throws(() => solve(m, { ...c, priority: 2 }, true), /첫 번째 방문지/);
});
test("early appointment arrival waits rather than rewriting clock", () => {
  const result = solve(m, { ...c, priority: 2, appointment: 2, appointmentTime: "11:00", deadline: "14:00" });
  const timed = result.stops.find(s => s.index === 2);
  assert.ok(timed.waitMinutes > 0);
  assert.equal(timed.startText, "11:00");
});
test("bad HH:MM and overnight deadline are rejected", () => {
  assert.throws(() => validate({ ...c, depart: "25:00" }, 3), /HH:MM/);
  assert.throws(() => validate({ ...c, deadline: "08:00" }, 3), /이후/);
});
test("15 visits appear once each", () => {
  const matrix = Array.from({ length: 16 }, (_, i) =>
    Array.from({ length: 16 }, (_, j) => i === j ? 0 : 120 + 35 * Math.abs(i - j)));
  const result = solve(matrix, {
    depart: "07:00", dwell: 10, priority: -1, appointment: -1,
    appointmentTime: "", deadline: ""
  });
  assert.equal(result.order.length, 15);
  assert.equal(new Set(result.order).size, 15);
});