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

  function syntheticSample() {
    return {
      purpose: "가상 건축현장 안전관리 현황 확인",
      address: "시연용 가상현장 (실제 위치 아님)",
      time: "2026. 10. 17. 14:00",
      attendees: "가상 현장 관계자 1명",
      check: "시연용 가상 건축현장 주변에 자재가 적치된 상황을 확인함",
      action: "가상 현장 관계자에게 통행공간 정리를 요청함"
    };
  }

  function field(value, label, maxLength) {
    const result = String(value ?? "");
    if (result.length > maxLength) {
      throw Error(label + "이(가) " + maxLength + "자를 초과했습니다. 초안을 요청하기 전에 줄여 주세요.");
    }
    return result;
  }

  async function aiDraft(endpoint, data, token) {
    const url = new URL(String(endpoint || "").trim());
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash) {
      throw Error("기관에서 승인한 HTTPS AI 프록시 주소만 입력하세요. URL에 API 키·토큰을 포함하지 마세요.");
    }
    if (!(data.check || "").trim() && !(data.action || "").trim()) {
      throw Error("AI 초안을 만들 현장 확인내용이나 조치사항을 먼저 입력하세요.");
    }
    if (typeof token !== "string" || token.length < 32 || token.length > 256 ||
        !/^[\x21-\x7E]+$/.test(token)) {
      throw Error("AI 프록시 접근 토큰(32자 이상)을 입력하세요. 이 값은 브라우저에 저장하지 않습니다.");
    }
    const payload = {
      purpose: field(data.purpose, "출장목적", 150),
      address: field(data.address, "출장주소", 150),
      visitTime: field(data.time, "출장일시", 100),
      attendees: field(data.attendees, "참석자", 150),
      check: field(data.check, "현장 확인내용", 4000),
      action: field(data.action, "조치사항", 2500)
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(url.href, {
        method: "POST", mode: "cors", cache: "no-store",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
        body: JSON.stringify(payload), signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) throw Error("25초 내에 AI 서버가 응답하지 않았습니다.");
      throw Error("AI 프록시에 연결할 수 없습니다. 배포된 주소·CORS 설정·네트워크를 확인하세요.");
    } finally { clearTimeout(timer); }
    if (!response.ok) {
      const defaults = {
        400: "AI 요청을 처리할 수 없습니다.",
        401: "AI 프록시 접근 토큰이 올바르지 않습니다.",
        403: "허용되지 않은 웹사이트 또는 접근입니다.",
        413: "AI 요청 용량을 초과했습니다.",
        429: "AI 요청 횟수 제한에 도달했습니다.",
        503: "AI 서버 비밀키·호출 제한 설정이 필요합니다.",
        502: "Gemini API 모델·키·사용량을 확인하세요.",
        504: "Gemini 응답 시간이 초과됐습니다."
      };
      let serverError = "";
      try {
        const body = await response.json();
        if (typeof body?.error === "string") serverError = body.error.slice(0, 250);
      } catch (_) { /* Fallback to generic status message */ }
      throw Error(serverError || defaults[response.status] || "AI 서버 오류 (" + response.status + ").");
    }
    const result = await response.json();
    if (!result || typeof result !== "object" ||
        typeof result.purpose !== "string" ||
        typeof result.check !== "string" || typeof result.action !== "string") {
      throw Error("AI 초안 응답 형식이 올바르지 않습니다.");
    }
    if (result.purpose.length > 150 || result.check.length > 5000 || result.action.length > 3000) {
      throw Error("AI 초안이 입력 허용 길이를 초과했습니다.");
    }
    for (const key of ["purpose", "check", "action"]) {
      if (!payload[key].trim() && result[key].trim()) {
        throw Error("AI가 미입력 항목(" + key + ")에 사실을 추가하여 초안을 거부했습니다.");
      }
    }
    return { purpose: result.purpose, check: result.check, action: result.action };
  }

  root.TripDraft = { localDraft, aiDraft, syntheticSample };
})(window);