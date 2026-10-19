/* AI UI request contract tests: node --test v2/tests/draft-ai.test.mjs
 * Mock provider only; no real key, no network, no office records.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const src = readFileSync(new URL("../draft.js", import.meta.url), "utf8");
const sample = {
  purpose: "가상 건축현장 안전관리 현황 확인",
  address: "시연용 가상현장",
  time: "2026. 10. 19. 14:00",
  attendees: "가상 관계자",
  check: "가상 현장 바닥 자재 적치 확인",
  action: "가상 관계자에게 정리 요청"
};
const token = "test-demo-token-1234567890123456789012";
function harness(fetchStub) {
  const window = {};
  runInNewContext(src, { window, URL, AbortController, setTimeout, clearTimeout, fetch: fetchStub });
  return window.TripDraft;
}
test("builds only six allowed fields from synthetic text", async () => {
  const sent = [];
  const api = harness(async (url, options) => {
    sent.push({url,options});
    return {ok:true,json:async()=>({purpose:sample.purpose,check:sample.check,action:sample.action})};
  });
  const result = await api.aiDraft("https://example.workers.dev/draft", sample, token);
  assert.equal(result.check, sample.check);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].options.method, "POST");
  assert.match(sent[0].options.headers.Authorization, /^Bearer /);
  const obj = JSON.parse(sent[0].options.body);
  assert.deepEqual(Object.keys(obj), ["purpose","address","visitTime","attendees","check","action"]);
  assert.equal(obj.visitTime, sample.time);
  assert.ok(!sent[0].options.body.includes(token));
});
test("does not silently truncate long administrative notes", async () => {
  let calls=0;
  const api = harness(async () => {calls++;return {ok:true};});
  await assert.rejects(api.aiDraft("https://example.workers.dev/draft",{
    ...sample,check:"X".repeat(4001)
  },token),/4000자를 초과/);
  assert.equal(calls, 0);
});
test("rejects query-string tokens and insecure proxy addresses", async () => {
  const api=harness(async()=>{throw Error("Should not fetch");});
  await assert.rejects(api.aiDraft("http://example.workers.dev/draft",sample,token),/HTTPS/);
  await assert.rejects(api.aiDraft("https://example.workers.dev/draft?key=secret",sample,token),/HTTPS/);
});
test("surfaces sanitized provider error but not raw response body", async () => {
  const api=harness(async()=>({
    ok:false,status:502,json:async()=>({error:"Gemini API 키 또는 프로젝트 접근권한을 확인하세요.",code:"PROVIDER_AUTH"})
  }));
  await assert.rejects(api.aiDraft("https://example.workers.dev/draft",sample,token),
    /Gemini API 키 또는 프로젝트 접근권한/);
});
test("refuses AI additions to blank action field", async () => {
  const api=harness(async()=>({
    ok:true,json:async()=>({purpose:sample.purpose,check:sample.check,action:"안전명령 완료"})
  }));
  await assert.rejects(api.aiDraft("https://example.workers.dev/draft",
    {...sample,action:""},token),/미입력 항목/);
});
test("rejects network failure with actionable message", async () => {
  const api=harness(async()=>{throw Error("Failed to fetch");});
  await assert.rejects(api.aiDraft("https://example.workers.dev/draft",sample,token),
    /배포된 주소·CORS 설정/);
});
