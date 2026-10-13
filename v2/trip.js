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
  function check(payload) {
    if (!Array.isArray(payload) || payload[0] !== 1 ||
        typeof payload[1] !== "string" || !/^[a-z0-9-]{6,40}$/.test(payload[1]) ||
        !validPoint(payload[2]) || !Array.isArray(payload[3]) ||
        payload[3].length < 1 || payload[3].length > MAX_STOPS ||
        !payload[3].every(validPoint)) throw new Error("출장계획 데이터가 올바르지 않습니다.");
    return payload;
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
  root.TripIO = { encode, decode, locationLink };
})(window);