/* PC ↔ 휴대폰 출장계획 인계: 서버 없는 최소 포맷 */
(function (root) {
  "use strict";
  const MAX_STOPS = 15;
  function validPoint(p) {
    return Array.isArray(p) && p.length === 3 &&
      typeof p[0] === "string" && p[0].length > 0 && p[0].length <= 100 &&
      typeof p[1] === "number" && p[1] >= 33 && p[1] <= 39 &&
      typeof p[2] === "number" && p[2] >= 124 && p[2] <= 132;
  }
  // Optional fifth field for planned times (minute-of-day integers):
  // [departure, return, [[arrival, start, finish, appointmentFlag], ...]]
  // Preserve v1 four-field links, and do not add personal notes or photos.
  const validMinute = n => Number.isInteger(n) && n >= 0 && n < 1440;
  function validSchedule(plan, count) {
    if (!Array.isArray(plan) || plan.length !== 3 ||
        !validMinute(plan[0]) || !validMinute(plan[1]) ||
        plan[1] < plan[0] || !Array.isArray(plan[2]) || plan[2].length !== count) return false;
    let previousFinish = plan[0];
    for (const times of plan[2]) {
      if (!Array.isArray(times) || times.length !== 4 ||
          !times.slice(0, 3).every(validMinute) ||
          ![0, 1].includes(times[3]) ||
          times[0] < previousFinish ||
          times[1] < times[0] || times[2] < times[1] || times[2] > plan[1]) return false;
      previousFinish = times[2];
    }
    return true;
  }
  function check(payload) {
    if (!Array.isArray(payload) || payload[0] !== 1 ||
        (payload.length !== 4 && payload.length !== 5) ||
        typeof payload[1] !== "string" || !/^[a-z0-9-]{6,40}$/.test(payload[1]) ||
        !validPoint(payload[2]) || !Array.isArray(payload[3]) ||
        payload[3].length < 1 || payload[3].length > MAX_STOPS ||
        !payload[3].every(validPoint) ||
        (payload.length === 5 && !validSchedule(payload[4], payload[3].length))) {
      throw new Error("출장계획 또는 예상시간표 데이터가 올바르지 않습니다.");
    }
    return payload;
  }
  function asMinute(time) {
    if (!/^(?:[01]\\d|2[0-3]):[0-5]\\d$/.test(time || "")) {
      throw Error("시간표의 HH:MM 형식이 올바르지 않습니다.");
    }
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }
  function withSchedule(payload, schedule) {
    const baseline = check(payload).slice(0, 4);
    if (!schedule) return baseline;
    if (!Array.isArray(schedule.stops) || schedule.stops.length !== baseline[3].length) {
      throw Error("방문시간표와 출장지 개수가 일치하지 않습니다.");
    }
    const times = [
      asMinute(schedule.departText), asMinute(schedule.returnText),
      schedule.stops.map(row => [
        asMinute(row.arrivalText), asMinute(row.startText),
        asMinute(row.finishText), row.appointment ? 1 : 0
      ])
    ];
    return check([...baseline, times]);
  }
  function qrLink(payload, href, maxLen = 1900) {
    const fullLink = locationLink(encode(payload), href);
    if (fullLink.length <= maxLen) return { link: fullLink, withTimes: payload.length === 5 };
    if (payload.length === 5) {
      const minimalLink = locationLink(encode(payload.slice(0, 4)), href);
      if (minimalLink.length <= maxLen) {
        return { link: minimalLink, withTimes: false, reduced: true };
      }
    }
    throw Error("QR 용량을 초과했습니다. 출장지명을 줄이거나 출장계획을 나누어 주세요.");
  }
  function toB64(bytes) {
    let text = "";
    for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function fromB64(str) {
    if (!/^[A-Za-z0-9_-]+$/.test(str) || str.length > 10000) throw Error("출장 링크 형식이 올바르지 않습니다.");
    const text = atob(str.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(text, char => char.charCodeAt(0));
  }
  function encode(payload) {
    return toB64(new TextEncoder().encode(JSON.stringify(check(payload))));
  }
  function decode(value) {
    return check(JSON.parse(new TextDecoder().decode(fromB64(value))));
  }
  function locationLink(encoded, href) {
    const url = new URL("mobile.html", href);
    url.hash = "trip=" + encoded;
    return url.href;
  }
  root.TripIO = { encode, decode, locationLink, withSchedule, qrLink };
})(window);