/* Run: node --test v2/tests/trip-qr.test.mjs
 * Browser-like smoke test for QR format v1 + optional compact planned times.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { TextEncoder, TextDecoder } from "node:util";
const window = {};
runInNewContext(readFileSync(new URL("../trip.js", import.meta.url), "utf8"), {
  window, TextEncoder, TextDecoder, URL, Uint8Array,
  btoa: value => Buffer.from(value, "latin1").toString("base64"),
  atob: value => Buffer.from(value, "base64").toString("latin1")
});
const io = window.TripIO;
const home = ["파주시청", 37.7595, 126.7792];
const visit = n => ["경기도 파주시 문산읍 임진각로 " + (177 + n), 37.7 + n * .003, 126.7 + n * .003];
const legacy = n => [1, "t-demo123", home, Array.from({ length: n }, (_, i) => visit(i))];
const hm = minutes => String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
  String(minutes % 60).padStart(2, "0");
function schedule(n) {
  return {
    departText: "08:00", returnText: "16:00",
    stops: Array.from({ length: n }, (_, i) => {
      const arrival = 500 + 20 * i;
      return {
        arrivalText: hm(arrival), startText: hm(arrival + 5),
        finishText: hm(arrival + 15), appointment: i % 3 === 0
      };
    })
  };
}
const url = "https://smile7962.github.io/paju-giljabi/v2/index.html";
test("legacy four-field QR round-trips unchanged", () => {
  const value = legacy(3);
  const decoded = io.decode(io.encode(value));
  assert.equal(decoded.length, 4);
  assert.equal(io.readSchedule(decoded), null);
  assert.equal(JSON.stringify(decoded), JSON.stringify(value));
});
for (const count of [1, 3, 10, 15]) {
  test(count + " stops: QR transfers all appointments and dwell times", () => {
    const value = io.withSchedule(legacy(count), schedule(count));
    const decoded = io.decode(io.encode(value));
    assert.equal(JSON.stringify(decoded), JSON.stringify(value));
    const time = io.readSchedule(decoded);
    assert.equal(time.stops.length, count);
    assert.equal(time.stops[0][3], 1);
    assert.equal(time.stops[count - 1][2] - time.stops[count - 1][1], 10);
    const shared = io.qrLink(value, url);
    assert.equal(shared.withTimes, true);
    assert.ok(shared.link.length <= 1900);
  });
}
test("QR overflow is explicit: times omitted only on capacity fallback", () => {
  const p = io.withSchedule(legacy(3), schedule(3));
  const short = io.qrLink(legacy(3), url).link.length;
  const full = io.qrLink(p, url).link.length;
  assert.ok(full > short);
  const mid = Math.floor((short + full) / 2);
  const outcome = io.qrLink(p, url, mid);
  assert.equal(outcome.reduced, true);
  assert.equal(outcome.withTimes, false);
  assert.throws(() => io.qrLink(p, url, short - 1), /QR 용량/);
});
test("reject malformed plans, unsupported minutes and missing rows", () => {
  const p = legacy(3);
  assert.throws(() => io.encode([...p, [480, 750, "BAD"]]), /올바르지/);
  assert.throws(() => io.withSchedule(p, { ...schedule(3), stops: schedule(2).stops }), /개수가/);
  assert.throws(() => io.withSchedule(p, {
    ...schedule(3), stops: [{ ...schedule(3).stops[0], arrivalText: "25:20" },
      schedule(3).stops[1], schedule(3).stops[2]]
  }), /HH:MM/);
});