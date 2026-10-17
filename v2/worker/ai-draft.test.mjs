// Run in v2/worker: node --test
// All prompts and addresses in these tests are synthetic.
import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "./ai-draft.js";

const valid = {
  purpose: "가상 현장 확인", address: "합성 가상현장", visitTime: "14:00",
  attendees: "가상 관계자", check: "자재 적치 확인", action: "가상 관계자에게 정리 요청"
};
const root = "https://smile7962.github.io";
const endpoint = "https://worker.example/draft";
const access = "test-very-long-demo-token-1234567890";
const env = {
  GEMINI_API_KEY: "test-placeholder-not-real",
  TRIPON_DEMO_TOKEN: access,
  GEMINI_MODEL: "gemini-3.5-flash-lite",
  DRAFT_RATE_LIMITER: { limit: async () => ({ success: true }) }
};
function request(body = valid, token = access, origin = root) {
  return new Request(endpoint, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json",
      Authorization: "Bearer " + token },
    body: JSON.stringify(body)
  });
}
function fakeGemini(data) {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }]
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("missing token fails with 401 before Gemini call", async () => {
  const result = await handler.fetch(request(valid, "wrong"), env);
  assert.equal(result.status, 401);
});
test("wrong Origin is rejected", async () => {
  const result = await handler.fetch(request(valid, access, "https://evil.example"), env);
  assert.equal(result.status, 403);
});
test("fails closed if rate limiting not configured", async () => {
  const result = await handler.fetch(request(), { ...env, DRAFT_RATE_LIMITER: undefined });
  assert.equal(result.status, 503);
});
test("enforces rate limit", async () => {
  const result = await handler.fetch(request(), {
    ...env, DRAFT_RATE_LIMITER: { limit: async () => ({ success: false }) }
  });
  assert.equal(result.status, 429);
});
test("valid structured Gemini output is delivered", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => fakeGemini({ purpose: valid.purpose, check: valid.check, action: valid.action });
  try {
    const result = await handler.fetch(request(), env);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { purpose: valid.purpose, check: valid.check, action: valid.action });
  } finally { globalThis.fetch = originalFetch; }
});
test("prevents invented completed action from a blank action field", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => fakeGemini({ purpose: valid.purpose, check: valid.check, action: "공사중지 명령 완료" });
  try {
    const result = await handler.fetch(request({ ...valid, action: "" }), env);
    assert.equal(result.status, 422);
  } finally { globalThis.fetch = originalFetch; }
});
test("rejects unexpected PII fields before AI call", async () => {
  const result = await handler.fetch(request({ ...valid, residentId: "fake-id" }), env);
  assert.equal(result.status, 422);
});
test("rejects duplicate-location fields for a different visit", async () => {
  const result = await handler.fetch(request({ ...valid, stopId: "S02" }), env);
  assert.equal(result.status, 422);
});
