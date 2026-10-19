/* Run: node --test v2/tests/handoff.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const window = {};
runInNewContext(readFileSync(new URL("../handoff.js", import.meta.url), "utf8"), { window });
const h = window.TripHandoff;
const tripId = "t-abc123-xyzz";
const stops = [
  {id:"S01",name:"경기도 파주시 문산읍 임진각로 177"},
  {id:"S02",name:"경기도 파주시 탄현면 헤이리마을길 82-105"}
];
const state = {
  done:["S01"],
  memos:{
    S01:"현장 외부 도로 확인함\n담당자에게 안전조치 안내함",
    S02:"두 번째 장소 점검"
  }
};
const pictures = stops.map((s, i) => ({
  stopId:s.id,
  name:tripId+"_"+s.id+"_"+h.addressPart(s.name)+"_"+
    String(i+1).padStart(2,"0")+".jpg"
}));
test("existing phone filename convention removes address whitespace", () => {
  assert.equal(h.addressPart(stops[0].name), "경기도파주시문산읍임진각로177");
  assert.equal(h.photoMatch(pictures[0].name, tripId, stops), "S01");
  assert.equal(h.photoMatch(pictures[1].name, tripId, stops), "S02");
  assert.equal(h.photoNumber(pictures[1].name), 2);
});
test("wrong trip / wrong stop / wrong planned address cannot be auto classified", () => {
  assert.equal(h.photoMatch(pictures[0].name, "t-other123", stops), "");
  assert.equal(h.photoMatch(pictures[0].name.replace("_S01_","_S15_"), tripId, stops), "");
  assert.equal(h.photoMatch(pictures[0].name, tripId,
    [{ ...stops[0], name:"경기도 파주시 다른 주소 55" },stops[1]]), "");
  assert.equal(h.photoMatch("IMG_0001.jpg", tripId, stops), "");
});
test("TXT and copy text are identical, parse multiline Korean safely", () => {
  const generated = h.memoText(tripId, stops, state, pictures);
  const parsed = h.readMemo("\uFEFF"+generated.replace(/\n/g,"\r\n"), tripId, stops);
  assert.equal(parsed.found.length, 2);
  assert.equal(parsed.found[0].memo, state.memos.S01);
  assert.equal(parsed.found[1].memo, state.memos.S02);
  assert.equal(parsed.skipped, 0);
});
test("wrong ID rejected; altered planned address skipped, not assigned to other stop", () => {
  const content = h.memoText(tripId,stops,state,pictures);
  assert.throws(() => h.readMemo(content,"t-wrongid",stops),/출장 ID/);
  const changed = [stops[0],{...stops[1],name:"경기도 파주시 교하동 11-11"}];
  const parsed = h.readMemo(content,tripId,changed);
  assert.equal(parsed.found.length,1);
  assert.equal(parsed.skipped,1);
});
test("empty stop memo is not imported as invented inspection", () => {
  const copied = h.memoText(tripId,stops,{done:[],memos:{}},[]);
  const parsed = h.readMemo(copied,tripId,stops);
  assert.equal(parsed.found.length,0);
});
test("oversized or broken TXT rejected", () => {
  assert.throws(()=>h.readMemo("x".repeat(100001),tripId,stops),/10만/);
  assert.throws(()=>h.readMemo("출장ID 없음",tripId,stops),/출장 ID/);
});
