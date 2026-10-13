/* 파주길잡이 주소검색 공통기능
   1. 카카오: 주소 또는 장소명 검색
   2. 실패 시 OpenStreetMap Nominatim 대체
   API 앱키는 기존 파주길잡이의 공개 JavaScript SDK 도메인 제한 키.
   개인·비공개 정보는 테스트하지 마세요.
*/
"use strict";
window.PajuGeo = (() => {
  const kakaoKey = "923bea2d923bf2e40d3ab24c3c07684c";
  const cache = new Map();
  let kakaoPromise, kakaoUnavailable = false, nextOsm = 0;

  function loadKakao() {
    if (kakaoUnavailable) return Promise.reject(Error("카카오 지도 SDK 사용 불가"));
    if (kakaoPromise) return kakaoPromise;
    kakaoPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => reject(Error("카카오 SDK 응답 지연")), 7000);
      script.src = "https://dapi.kakao.com/v2/maps/sdk.js?autoload=false&libraries=services&appkey=" + encodeURIComponent(kakaoKey);
      script.onload = () => {
        if (!window.kakao?.maps?.load) {
          clearTimeout(timeout);
          reject(Error("카카오 SDK 사용 불가"));
          return;
        }
        window.kakao.maps.load(() => {
          clearTimeout(timeout);
          resolve();
        });
      };
      script.onerror = () => {
        clearTimeout(timeout);
        reject(Error("카카오 SDK 접속 실패"));
      };
      document.head.appendChild(script);
    }).catch(error => {
      kakaoUnavailable = true; // 브라우저/도메인에서 불가하면 다음 주소부터 OSM 사용
      throw error;
    });
    return kakaoPromise;
  }
  async function kakaoSearch(query) {
    await loadKakao();
    return new Promise((resolve, reject) => {
      const statusOK = window.kakao.maps.services.Status.OK;
      function useResults(rows) {
        const p = rows.find(row => (row.address_name || row.road_address_name || "").includes("파주시"));
        if (!p) return null;
        const lat = Number(p.y), lng = Number(p.x);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, provider: "카카오" } : null;
      }
      function keyword() {
        new window.kakao.maps.services.Places().keywordSearch(query, (rows, status) => {
          const point = status === statusOK ? useResults(rows) : null;
          if (point) resolve(point);
          else reject(Error("카카오 검색결과 없음"));
        });
      }
      new window.kakao.maps.services.Geocoder().addressSearch(query, (rows, status) => {
        const point = status === statusOK ? useResults(rows) : null;
        if (point) resolve(point);
        else keyword();
      });
    });
  }

  async function osmSearch(query) {
    // Nominatim 공용 검색서버: 연속 요청 최소 1.15초 간격
    const wait = Math.max(0, nextOsm - Date.now());
    nextOsm = Math.max(Date.now(), nextOsm) + 1150;
    if (wait) await new Promise(resolve => setTimeout(resolve, wait));
    const params = new URLSearchParams({
      format: "json", limit: "5", countrycodes: "kr",
      "accept-language": "ko", q: query
    });
    const response = await fetch("https://nominatim.openstreetmap.org/search?" + params);
    if (!response.ok) throw Error("OSM 주소검색 서버 오류: " + response.status);
    const rows = await response.json();
    const row = rows.find(p => {
      const lat = Number(p.lat), lng = Number(p.lon);
      return lat >= 37.55 && lat <= 38.2 && lng >= 126.5 && lng <= 127.2;
    });
    return row ? { lat: Number(row.lat), lng: Number(row.lon), provider: "OpenStreetMap" } : null;
  }

  async function geocode(input) {
    const query = input.trim();
    if (cache.has(query)) return cache.get(query);
    let found = null;
    try {
      found = await kakaoSearch(query);
    } catch (_) { /* 카카오 검색 실패 때 공용 OpenStreetMap으로 대체 */ }
    if (!found) {
      const variants = [query];
      if (!/파주|경기도/.test(query)) variants.push("경기도 파주시 " + query);
      else if (/^파주시/.test(query)) variants.push("경기도 " + query);
      let serverProblem = false;
      for (const variant of [...new Set(variants)]) {
        try {
          found = await osmSearch(variant);
          if (found) break;
        } catch (_) { serverProblem = true; break; }
      }
      if (!found && serverProblem) throw Error("주소검색 서비스 연결에 실패했습니다. 잠시 후 다시 시도하세요.");
    }
    if (!found) throw Error("주소를 찾지 못했습니다: " + query + " (정확한 도로명주소나 지번주소를 입력하세요)");
    found.label = query; // 사용자가 계획한 원래 주소 이름을 그대로 유지
    cache.set(query, found);
    return found;
  }
  return { geocode };
})();