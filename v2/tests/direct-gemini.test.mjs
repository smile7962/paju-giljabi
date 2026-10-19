/* node --test v2/tests/direct-gemini.test.mjs
 * Synthetic-only client integration tests; no live API calls or keys.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
const source = readFileSync(new URL("../gemini-direct.js", import.meta.url), "utf8");
const key = "TEST_ONLY_NOT_REAL_GEMINI_API_KEY_12345";
const synthetic = {
  purpose:"가상 현장 점검", address:"시연 가상현장", time:"2026. 10. 19.",
  attendees:"가상 관계자", check:"가상 현장에서 안내판 확인",
  action:""
};
const output = {
  purpose:"가상 현장 점검", check:"가상 현장에서 안내판을 확인함.", action:""
};
function harness(fetchStub) {
  const window = {};
  runInNewContext(source, {
    window, fetch:fetchStub, AbortController, setTimeout, clearTimeout
  });
  return window.TripGeminiDirect;
}
function mock(body, status=200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body
  };
}
function sampleResult(value=output) {
  return mock({candidates:[{content:{parts:[{text:JSON.stringify(value)}]}}]});
}
test("model choice produces Gemini API request with server-compatible schema", async () => {
  const calls=[];
  const direct=harness(async (url, options)=>{calls.push({url,options});return sampleResult();});
  const result=await direct.request(key,"gemini-3.5-flash-lite",synthetic);
  assert.equal(result.action,"");
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/models\/gemini-3\.5-flash-lite:generateContent$/);
  assert.equal(calls[0].options.headers["x-goog-api-key"],key);
  assert.equal(calls[0].options.credentials,"omit");
  assert.equal(calls[0].options.referrerPolicy,"no-referrer");
  assert.ok(!calls[0].options.body.includes(key));
  const outbound=JSON.parse(calls[0].options.body);
  assert.equal(outbound.generationConfig.responseFormat.text.mimeType,"application/json");
  assert.equal(outbound.generationConfig.responseFormat.text.schema.additionalProperties,false);
  assert.deepEqual(outbound.generationConfig.responseFormat.text.schema.required,
    ["purpose","check","action"]);
  assert.deepEqual(Object.keys(JSON.parse(outbound.contents[0].parts[0].text)),
    ["purpose","address","visitTime","attendees","check","action"]);
});
test("supports high-performance Gemini 3.8 Flash and optional older model", async () => {
  const urls=[];
  const direct=harness(async url=>{urls.push(url);return sampleResult();});
  await direct.request(key,"gemini-3.8-flash",synthetic);
  await direct.request(key,"gemini-2.5-flash",synthetic);
  assert.match(urls[0],/gemini-3\.8-flash/);
  assert.match(urls[1],/gemini-2\.5-flash/);
});
test("refuses invalid API key or unknown model without calling provider", async () => {
  let calls=0;
  const direct=harness(async()=>{calls++;return sampleResult();});
  await assert.rejects(direct.request("short","gemini-3.5-flash-lite",synthetic),/API 키/);
  await assert.rejects(direct.request(key,"not-a-real-model",synthetic),/모델/);
  assert.equal(calls,0);
});
test("does not silently truncate notes and refuses an empty prompt", async () => {
  let calls=0;
  const direct=harness(async()=>{calls++;return sampleResult();});
  await assert.rejects(direct.request(key,"gemini-3.5-flash-lite",
    {...synthetic,check:"X".repeat(4001)}),/4000자를 초과/);
  await assert.rejects(direct.request(key,"gemini-3.5-flash-lite",
    {...synthetic,check:"",action:""}),/현장 확인내용/);
  assert.equal(calls,0);
});
test("rejects hallucinated action when action field is empty", async () => {
  const direct=harness(async()=>sampleResult({...output,action:"행정처분 완료"}));
  await assert.rejects(direct.request(key,"gemini-3.5-flash-lite",synthetic),/미입력 항목/);
});
test("returns actionable status guidance without leaking provider secrets", async () => {
  const direct=harness(async()=>mock({error:"sensitive provider details"},403));
  await assert.rejects(direct.request(key,"gemini-3.5-flash-lite",synthetic),
    /프로젝트의 API 접근권한/);
});
test("handles CORS/network blocks and invalid structured JSON", async () => {
  let direct=harness(async()=>{throw Error("Failed to fetch a real API key");});
  await assert.rejects(direct.request(key,"gemini-3.5-flash-lite",synthetic),
    /CORS·네트워크/);
  direct=harness(async()=>mock({candidates:[{content:{parts:[{text:"NOT JSON"}]}}]}));
  await assert.rejects(direct.request(key,"gemini-3.5-flash-lite",synthetic),/JSON 초안/);
});
test("direct module never persists a credential or logs it", () => {
  assert.ok(!/\b(?:localStorage|sessionStorage)\s*\./.test(source));
  assert.ok(!/\bconsole\s*\./.test(source));
  assert.ok(source.includes("x-goog-api-key"));
});
