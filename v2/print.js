/* 출장ON AI · 독립 A4 경로표
   인쇄 화면은 별도 Leaflet 지도에서 전체 경로 좌표로 fitBounds 한다.
   사용자가 경로계산 후 저장한 브라우저 내 임시 데이터만 읽는다.
*/
"use strict";
const $ = id => document.getElementById(id);
const KEY = "tripon-print-route-v1";
let printableMap, routeBounds;

function fail(message) {
  $("sheet").hidden = true;
  $("error").hidden = false;
  $("errorMessage").textContent = message;
  $("loadState").textContent = "경로표 준비 실패";
  $("printButton").disabled = true;
}
function validPoint(point) {
  return point && typeof point.label === "string" &&
    Number.isFinite(point.lat) && Number.isFinite(point.lng) &&
    point.lat > 33 && point.lat < 39 && point.lng > 124 && point.lng < 132;
}
function readRoute() {
  const raw = localStorage.getItem(KEY);
  if (!raw) throw Error("이 브라우저에 계산된 출장경로가 없습니다.");
  const data = JSON.parse(raw);
  if (data.version !== 1 || Date.now() - data.savedAt > 3600000 ||
      !validPoint(data.origin) || !Array.isArray(data.visits) ||
      data.visits.length < 1 || data.visits.length > 15 ||
      !data.visits.every(validPoint) ||
      !Array.isArray(data.path) || data.path.length < 2 ||
      !data.path.every(p => Array.isArray(p) && p.length === 2 &&
         Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
         p[1] > 33 && p[1] < 39 && p[0] > 124 && p[0] < 132) ||
      !Number.isFinite(data.km) || !Number.isFinite(data.seconds) ||
      !Array.isArray(data.trip)) {
    throw Error("출장경로 데이터가 잘못되었거나 1시간이 지나 만료되었습니다.");
  }
  TripIO.encode(data.trip); // QR 데이터도 함께 유효성 검사
  return data;
}
function duration(seconds) {
  const m = Math.round(seconds / 60);
  return m >= 60 ? Math.floor(m / 60) + "시간 " + m % 60 + "분" : m + "분";
}
function addRow(label, subtitle, number, home) {
  const li = document.createElement("li");
  const marker = document.createElement("span");
  marker.className = "number" + (home ? " home" : "");
  marker.textContent = number;
  const body = document.createElement("div");
  const address = document.createElement("strong");
  address.textContent = label;
  const detail = document.createElement("small");
  detail.textContent = subtitle;
  body.append(address, detail);
  li.append(marker, body);
  $("stops").append(li);
}
function drawRoute(data) {
  if (typeof L === "undefined") throw Error("지도 라이브러리를 불러올 수 없습니다.");
  printableMap = L.map("routeMap", {
    zoomControl: false, attributionControl: false, dragging: false,
    scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false
  });
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18
  }).addTo(printableMap);
  const road = L.polyline(data.path.map(p => [p[1], p[0]]), {
    color: "#155eef", weight: 5, opacity: .96
  }).addTo(printableMap);
  routeBounds = road.getBounds();
  const visits = [data.origin, ...data.visits];
  visits.forEach((p, idx) => {
    const icon = L.divIcon({
      className: "",
      html: '<div class="route-pin' + (idx === 0 ? " home" : "") + '">' +
        (idx === 0 ? "H" : idx) + "</div>",
      iconSize: [27, 27], iconAnchor: [13, 13]
    });
    L.marker([p.lat, p.lng], { icon }).addTo(printableMap);
    routeBounds.extend([p.lat, p.lng]);
  });
  fitWholeRoute();
  // 화면과 인쇄 매체가 전환되어도 항상 "전체 경로"에 다시 맞춘다.
  window.addEventListener("beforeprint", fitWholeRoute);
  window.addEventListener("afterprint", () => setTimeout(fitWholeRoute, 80));
  tiles.once("load", () => {
    $("loadState").textContent = "경로 지도 준비 완료 · 인쇄할 수 있습니다.";
  });
  setTimeout(() => {
    fitWholeRoute();
    $("printButton").disabled = false;
    if ($("loadState").textContent.includes("불러오는")) {
      $("loadState").textContent = "경로 표시 완료 · 지도가 느리면 타일 로딩 후 인쇄하세요.";
    }
  }, 250);
}
function fitWholeRoute() {
  if (!printableMap || !routeBounds?.isValid()) return;
  printableMap.invalidateSize({ pan: false, animate: false });
  printableMap.fitBounds(routeBounds, { padding: [24, 24], animate: false, maxZoom: 14 });
}
function createQr(data) {
  if (typeof QRCode !== "function") {
    $("qrcode").textContent = "QR 라이브러리 확인 필요";
    return;
  }
  try {
    const encoded = TripIO.encode(data.trip);
    const url = TripIO.locationLink(encoded, new URL("index.html", location.href).href);
    if (url.length > 1900) throw Error("QR 데이터가 너무 깁니다.");
    new QRCode($("qrcode"), {
      text: url, width: 180, height: 180,
      colorDark: "#102a56", colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.L
    });
  } catch (_) {
    $("qrcode").textContent = "QR 생성 실패: 방문지명을 줄이고 다시 시도하세요.";
  }
}
function init() {
  try {
    const data = readRoute();
    $("sheet").hidden = false;
    $("date").textContent = new Date(data.savedAt).toLocaleDateString("ko-KR");
    $("count").textContent = data.visits.length + "개소";
    $("distance").textContent = data.km.toFixed(1) + "km";
    $("duration").textContent = duration(data.seconds);
    addRow(data.origin.label, "출발", "출", true);
    data.visits.forEach((p, i) => addRow(p.label, "방문지 " + (i + 1), i + 1, false));
    addRow(data.origin.label, "복귀", "↩", true);
    createQr(data);
    drawRoute(data);
  } catch (error) { fail(error.message || "경로표 생성 오류"); }
}
$("printButton").addEventListener("click", () => {
  fitWholeRoute();
  window.print();
});
init();