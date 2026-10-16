/* 출장ON AI · 현장메모 공문서체 초안
 * 로컬 정리는 규칙 기반(생성형 AI 아님), 외부 AI는 기관 승인된 프록시 연결 시만 사용.
 * 초안은 반드시 사용자 검토 후 별도 버튼으로 적용한다.
 */
(function (root) {
  "use strict";

  function normalize(source) {
    return String(source || "")
      .replace(/\r/g, "")
      .split("\n").map(line => line.trim().replace(/^[\-•ㅇ○]+\s*/, ""))
      .filter(Boolean).map(line => /[.!?。]$/.test(line) ? line : line + ".")
      .join("\n");
  }

  function localDraft(data) {
    const originalCheck = String(data.check || "").trim();
    const originalAction = String(data.action || "").trim();
    if (!originalCheck && !originalAction) {
      throw Error("먼저 현장 확인내용 또는 실제 조치사항을 입력하세요.");
    }
    return {
      purpose: String(data.purpose || "").trim(),
      check: normalize(originalCheck),
      action: normalize(originalAction)
    };
  }

  async function aiDraft(endpoint, data) {
    const url = new URL(String(endpoint || "").trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.hash) {
      throw Error("기관에서 승인한 HTTPS AI 프록시 주소가 필요합니다.");
    }
    if (!(data.check || "").trim() && !(data.action || "").trim()) {
      throw Error("AI 초안을 만들 현장 확인내용이나 조치사항을 먼저 입력하세요.");
    }
    const payload = {
      purpose: String(data.purpose || "").slice(0, 150),
      address: String(data.address || "").slice(0, 150),
      visitTime: String(data.time || "").slice(0, 100),
      attendees: String(data.attendees || "").slice(0, 150),
      check: String(data.check || "").slice(0, 4000),
      action: String(data.action || "").slice(0, 2500)
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(url.href, {
        method: "POST", mode: "cors", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload), signal: controller.signal
      });
    } finally { clearTimeout(timer); }
    if (!response.ok) throw Error("AI 서버 오류 (" + response.status + "). 프록시 설정을 확인하세요.");
    const result = await response.json();
    if (!result || typeof result !== "object" ||
        typeof result.purpose !== "string" ||
        typeof result.check !== "string" || typeof result.action !== "string") {
      throw Error("AI 초안 응답 형식이 올바르지 않습니다.");
    }
    if (result.purpose.length > 150 || result.check.length > 5000 || result.action.length > 3000) {
      throw Error("AI 초안이 입력 허용 길이를 초과했습니다.");
    }
    return { purpose: result.purpose, check: result.check, action: result.action };
  }

  root.TripDraft = { localDraft, aiDraft };
})(window);