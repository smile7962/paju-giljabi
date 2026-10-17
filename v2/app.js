/* 출장ON AI v1.0
 * 기능 1: 주소 검색 → OSRM 도로경로 → Leaflet 표시
 * QR 인계 연결. AI·복명서는 별도 단계에서 연결한다.
 * 개인정보/비공개 출장정보를 공용 지도 API에 입력하지 말 것.
 */
"use strict";

const $ = id => document.getElementById(id);
const MAX_STOPS = 15;
const OSRM = "https://router.project-osrm.org";
const mapState = { map: null, path: null, pins: [] };
let running = false;
let confirmedTrip = null;
let printableRoute = null;

function cleanLines(text) {
  return text.split(/\r?\n/)
    .map(s => s.replace(/^\s*(?:\d+\s*[.)-]\s*)?/, "").trim())
    .filter(Boolean);
}
function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  return mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`;
}
function setStatus(message, kind = "") {
  $("status").textContent = message;
  $("status").className = "status" + (kind ? " " + kind : "");
}
function shortLabel(s) { return s.length > 40 ? s.slice(0, 37) + "…" : s; }

/* Optional time windows are indexed by the ORIGINAL one-line-per-stop input. */
function scheduleSettings() {
  return {
    depart: $("departTime").value,
    dwell: $("dwellMinutes").value,
    priority: $("priorityStop").value,
    appointment: $("appointmentStop").value,
    appointmentTime: $("appointmentTime").value,
    deadline: $("deadlineTime").value
  };
}
function inputSnapshot() {
  return JSON.stringify({
    start: $("start").value.trim(),
    stops: cleanLines($("locations").value),
    keepOrder: $("keepOrder").checked,
    constraints: $("useConstraints").checked,
    settings: $("useConstraints").checked ? scheduleSettings() : null
  });
}
function refreshConstraintStops() {
  const lines = cleanLines($("locations").value);
  for (const id of ["priorityStop", "appointmentStop"]) {
    const sel = $(id);
    const old = sel.value;
    sel.replaceChildren(new Option("지정 안 함", "-1"));
    lines.slice(0, MAX_STOPS).forEach((line, index) => {
      sel.add(new Option((index + 1) + ". " + shortLabel(line), String(index)));
    });
    sel.value = lines[Number(old)] && old !== "-1" ? old : "-1";
  }
  $("appointmentTime").disabled = $("appointmentStop").value === "-1";
}
function showSchedule(result) {
  const panel = $("scheduleSummary");
  if (!result.schedule) {
    panel.hidden = true;
    panel.textContent = "";
    return;
  }
  const plan = result.schedule;
  panel.textContent = "출발 " + plan.departText + " → 예상 복귀 " + plan.returnText +
    " · 현장 체류 " + formatDuration(plan.dwellSeconds) +
    " · 대기 " + formatDuration(plan.waitSeconds) +
    " · (도로이동은 OSRM 추정치)";
  panel.hidden = false;
}

/* 카카오 주소/장소 검색 → OpenStreetMap 폴백은 geocode.js에서 담당 */
const geocode = query => PajuGeo.geocode(query);

function coordinatePath(points) {
  return points.map(p => p.lng + "," + p.lat).join(";");
}

/* 경로 계산만 담당한다. AI가 임의로 거리와 시간을 작성하지 않는다. */
async function fetchRoute(points, keepOrder) {
  const isSingle = points.length === 2;
  const ordered = keepOrder || isSingle;
  const endpoint = ordered ? "/route/v1/driving/" : "/trip/v1/driving/";
  const coordList = ordered ? [...points, points[0]] : points;
  const params = ordered
    ? "?overview=full&geometries=geojson"
    : "?source=first&roundtrip=true&overview=full&geometries=geojson";
  const response = await fetch(OSRM + endpoint + coordinatePath(coordList) + params);
  if (!response.ok) throw new Error("도로경로 서버 오류 (" + response.status + ")");
  const data = await response.json();
  if (data.code !== "Ok") throw new Error("도로경로를 계산하지 못했습니다: " + (data.message || data.code));
  const trip = ordered ? data.routes?.[0] : data.trips?.[0];
  if (!trip || !trip.geometry || !Number.isFinite(trip.distance)) {
    throw new Error("OSRM에서 유효한 도로경로를 받지 못했습니다.");
  }
  let visits = points.slice(1);
  if (!ordered) {
    if (!Array.isArray(data.waypoints) || data.waypoints.length !== points.length) {
      throw new Error("최적 방문순서를 확인할 수 없습니다.");
    }
    visits = points.slice(1).map((point, index) => ({
      ...point, sequence: data.waypoints[index + 1]?.waypoint_index
    })).sort((a, b) => a.sequence - b.sequence);
    if (visits.some(p => !Number.isInteger(p.sequence) || p.sequence === 0)) {
      throw new Error("최적 방문순서를 검증할 수 없습니다.");
    }
  }
  return { visits, path: trip.geometry.coordinates, km: trip.distance / 1000, seconds: trip.duration };
}
function showStops(origin, result) {
  const schedule = result.schedule;
  const items = [
    { addr: origin.label, type: schedule ? "출발 · " + schedule.departText : "출발", home: true },
    ...result.visits.map((point, index) => {
      const time = schedule?.stops[index];
      return {
        addr: point.label,
        type: "방문지 " + (index + 1) + (time
          ? " · 도착 " + time.arrivalText + " / 업무 " + time.startText +
            "~" + time.finishText + (time.waitMinutes ? " (대기 " + time.waitMinutes + "분)" : "")
          : "")
      };
    }),
    { addr: origin.label, type: schedule ? "복귀 · " + schedule.returnText : "복귀", home: true }
  ];
  const list = $("itinerary");
  list.replaceChildren();
  items.forEach((item, index) => {
    const li = document.createElement("li");
    const circle = document.createElement("span");
    circle.className = "marker" + (item.home ? " home" : "");
    circle.textContent = item.home ? (index ? "↩" : "출") : String(index);
    const detail = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = item.addr;
    const note = document.createElement("small");
    note.textContent = item.type;
    detail.append(title, note);
    if (!item.home) {
      const stop = result.visits[index - 1];
      const nav = TripNav.urls({ name: stop.label, lat: stop.lat, lng: stop.lng }, location.href);
      const bar = document.createElement("div");
      bar.className = "stop-nav";
      for (const [provider, title, url] of [
        ["kakao", "카카오 길찾기", nav.kakao.web],
        ["naver", "네이버 검색", nav.naver.web]
      ]) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = title;
        link.setAttribute("aria-label", stop.label + " " + title);
        bar.append(link);
      }
      const tmap = document.createElement("button");
      tmap.type = "button";
      tmap.textContent = "T맵 · 휴대폰";
      tmap.setAttribute("aria-label", stop.label + " T맵 휴대폰 연결 QR");
      tmap.addEventListener("click", () => confirmAndShare(index - 1));
      bar.append(tmap);
      detail.append(bar);
    }
    li.append(circle, detail);
    list.append(li);
  });
}
function ensureMap() {
  if (mapState.map) return;
  if (typeof L === "undefined") {
    throw new Error("지도 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
  }
  const map = L.map("map", { zoomControl: true }).setView([37.76, 126.78], 10);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);
  mapState.map = map;
}
function showMap(origin, result) {
  ensureMap();
  if (mapState.path) mapState.map.removeLayer(mapState.path);
  mapState.pins.forEach(pin => mapState.map.removeLayer(pin));
  mapState.pins = [];
  mapState.path = L.polyline(result.path.map(([lng, lat]) => [lat, lng]), {
    color: "#155eef", weight: 5, opacity: 0.95
  }).addTo(mapState.map);
  const stops = [origin, ...result.visits];
  stops.forEach((point, index) => {
    const isHome = index === 0;
    const icon = L.divIcon({
      className: "",
      html: '<div class="pin' + (isHome ? ' home' : '') + '">' + (isHome ? 'H' : index) + "</div>",
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    const pin = L.marker([point.lat, point.lng], { icon })
      .bindPopup(document.createTextNode((isHome ? "출발·복귀: " : "방문 " + index + ": ") + shortLabel(point.label)))
      .addTo(mapState.map);
    mapState.pins.push(pin);
  });
  mapState.map.fitBounds(mapState.path.getBounds(), { padding: [26, 26] });
}
async function calculate() {
  if (running) return;
  const start = $("start").value.trim();
  const stops = cleanLines($("locations").value);
  const keepOrder = $("keepOrder").checked;
  const useConstraints = $("useConstraints").checked;
  const settings = useConstraints ? scheduleSettings() : null;
  const snapshot = inputSnapshot();
  if (!start) return setStatus("출발지를 입력하세요.", "error");
  if (!stops.length) return setStatus("방문지를 한 곳 이상 입력하세요.", "error");
  if (stops.length > MAX_STOPS) return setStatus("방문지는 최대 15곳까지 입력할 수 있습니다.", "error");
  if (new Set(stops).size !== stops.length) return setStatus("중복된 방문지를 확인하세요.", "error");
  try {
    if (useConstraints) TripSchedule.validate(settings, stops.length);
  } catch (error) {
    return setStatus(error.message, "error");
  }

  running = true;
  $("calculate").disabled = true;
  $("print").disabled = true;
  $("confirm").disabled = true;
  confirmedTrip = null;
  printableRoute = null;
  $("printQr").removeAttribute("src");
  try {
    ensureMap();
    setStatus("출발지 주소 확인 중…");
    const origin = await geocode(start);
    const points = [origin];
    for (let i = 0; i < stops.length; i++) {
      setStatus("방문지 주소 확인 중… " + (i + 1) + "/" + stops.length + " · " + stops[i]);
      points.push(await geocode(stops[i]));
    }
    setStatus("실제 도로망 기준 경로 계산 중…");
    let result;
    if (useConstraints) {
      setStatus("우선방문·방문약속·체류·복귀시간을 검토 중…");
      const matrix = await TripSchedule.fetchMatrix(points, OSRM);
      const schedule = TripSchedule.solve(matrix, settings, keepOrder);
      const orderedPoints = [origin, ...schedule.order.map(index => points[index + 1])];
      result = await fetchRoute(orderedPoints, true);
      result.schedule = schedule;
    } else {
      result = await fetchRoute(points, keepOrder);
    }
    if (snapshot !== inputSnapshot()) {
      throw new Error("계산 중 출장조건이 변경되었습니다. 다시 계산해 주세요.");
    }
    showMap(origin, result);
    showStops(origin, result);
    showSchedule(result);
    $("totalKm").textContent = result.km.toFixed(1) + "km";
    $("totalTime").textContent = formatDuration(result.seconds);
    setStatus("계산 완료 · " + result.visits.length + "개소 / " +
      (useConstraints
        ? "우선방문·방문약속·체류·복귀시간 반영. 도로망 추정이며 휴리스틱 경로 탐색으로 전역 최적해는 보장하지 않습니다."
        : "OSRM 최적경로. 시간약속·현장 체류시간은 반영하지 않았습니다."), "success");
    $("print").disabled = false;
    const simple = p => [p.label, +p.lat.toFixed(6), +p.lng.toFixed(6)];
    const tripId = "t-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
    confirmedTrip = [1, tripId, simple(origin), result.visits.map(simple)];
    printableRoute = {
      version: 1,
      origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
      visits: result.visits.map(p => ({ label: p.label, lat: p.lat, lng: p.lng })),
      path: result.path,
      km: result.km,
      seconds: result.seconds,
      trip: confirmedTrip
    };
    $("confirm").disabled = false;
  } catch (error) {
    setStatus(error.message || "계산 중 오류가 발생했습니다.", "error");
    $("totalKm").textContent = "—";
    $("totalTime").textContent = "—";
    $("scheduleSummary").hidden = true;
  } finally {
    running = false;
    $("calculate").disabled = false;
  }
}
function invalidatePlan() {
  if (!confirmedTrip) return;
  confirmedTrip = null;
  printableRoute = null;
  $("print").disabled = true;
  $("confirm").disabled = true;
  $("printQr").removeAttribute("src");
  $("itinerary").replaceChildren();
  $("totalKm").textContent = "—";
  $("totalTime").textContent = "—";
  $("scheduleSummary").hidden = true;
  if (mapState.path) {
    mapState.map.removeLayer(mapState.path);
    mapState.path = null;
  }
  mapState.pins.forEach(pin => mapState.map.removeLayer(pin));
  mapState.pins = [];
  setStatus("출장조건이 변경되었습니다. 경로를 다시 계산해 주세요.");
}
["start", "locations"].forEach(id => $(id).addEventListener("input", invalidatePlan));
$("locations").addEventListener("input", refreshConstraintStops);
$("keepOrder").addEventListener("change", invalidatePlan);
$("useConstraints").addEventListener("change", () => {
  $("constraintFields").hidden = !$("useConstraints").checked;
  invalidatePlan();
});
for (const id of ["departTime", "dwellMinutes", "deadlineTime", "appointmentTime"]) {
  $(id).addEventListener("input", invalidatePlan);
}
for (const id of ["priorityStop", "appointmentStop"]) {
  $(id).addEventListener("change", () => {
    $("appointmentTime").disabled = $("appointmentStop").value === "-1";
    invalidatePlan();
  });
}
refreshConstraintStops();

$("calculate").addEventListener("click", calculate);
$("sample").addEventListener("click", () => {
  invalidatePlan();
  $("start").value = "파주시청";
  $("locations").value = "경기도 파주시 탄현면 헤이리마을길 82-105\n경기도 파주시 문산읍 임진각로 177\n경기도 파주시 가온로 184";
  refreshConstraintStops();
  setStatus("실제 소재지의 도로명주소 3개소를 입력했습니다. 경로계산을 실행하세요.");
});
$("fitMap").addEventListener("click", () => {
  if (mapState.path) mapState.map.fitBounds(mapState.path.getBounds(), { padding: [26, 26] });
});
/* 별도 A4 인쇄 화면에서 전체 경로를 새 지도에 맞춰 그린다. */
$("print").addEventListener("click", () => {
  if (!printableRoute) return;
  try {
    localStorage.setItem("tripon-print-route-v1", JSON.stringify({
      ...printableRoute, savedAt: Date.now()
    }));
  } catch (_) {
    setStatus("경로표 데이터를 브라우저에 저장하지 못했습니다. 저장공간 또는 브라우저 설정을 확인하세요.", "error");
    return;
  }
  const tab = window.open("print.html", "_blank");
  if (tab) tab.opener = null;
  else window.location.href = "print.html";
});
ensureMap();


/* PC에서 계획 확정 → QR로 휴대폰 인계 */
function confirmAndShare(stopIndex = null) {
  if (!confirmedTrip) return;
  let link;
  try {
    const encoded = TripIO.encode(confirmedTrip);
    link = TripIO.locationLink(encoded, location.href);
    if (Number.isInteger(stopIndex)) {
      link += "&stop=S" + String(stopIndex + 1).padStart(2, "0");
    }
    try { localStorage.setItem("tripon-last-plan", JSON.stringify(confirmedTrip)); }
    catch (_) { /* 개인 브라우징/저장공간 제한 */ }
  } catch (err) {
    setStatus("출장계획 인계 실패: " + err.message, "error");
    return;
  }

  $("qrTitle").textContent = stopIndex === null ? "모바일 출장 인계" : "T맵 · 선택 출장지 보내기";
  $("qrDescription").textContent = stopIndex === null
    ? "아래 QR을 휴대폰 카메라로 스캔하면 확정된 출장지가 열립니다."
    : "휴대폰으로 스캔해 해당 출장지를 선택한 뒤 T맵 앱 실행 버튼을 누르세요.";
  const qrBox = $("qrcode");
  qrBox.replaceChildren();
  $("openMobile").href = link;
  $("copyLink").disabled = false;
  const isPublic = location.protocol === "https:" && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const hint = $("qrHint");
  if (!isPublic) {
    hint.textContent = "현재 로컬 실행 중입니다. 같은 브라우저에서 미리보기는 가능하지만 휴대폰 QR 인계는 HTTPS 배포 후 사용할 수 있습니다.";
  } else if (link.length > 1900) {
    hint.textContent = "방문지 정보가 길어 QR 생성에 적합하지 않습니다. 방문지명을 줄이거나 출장지를 나누어 주세요.";
  } else if (typeof QRCode !== "function") {
    hint.textContent = "QR 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.";
  } else {
    try {
      new QRCode(qrBox, {
        text: link, width: 240, height: 240,
        colorDark: "#102a56", colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.L
      });
      const canvas = qrBox.querySelector("canvas");
      if (stopIndex === null) {
        if (canvas) $("printQr").src = canvas.toDataURL("image/png");
        $("printDate").textContent = "계획 확정: " + new Date().toLocaleDateString("ko-KR");
      }
      hint.textContent = stopIndex === null ? "QR 생성 완료 · 경로표 인쇄에도 QR이 포함됩니다." : "선택한 방문지로 모바일 화면이 열립니다. T맵 실행은 휴대폰에서 선택합니다.";
    } catch (_) {
      qrBox.replaceChildren();
      hint.textContent = "QR 생성에 실패했습니다. 방문지명을 줄이고 다시 시도하세요.";
    }
  }
  $("qrDialog").showModal();
}
$("confirm").addEventListener("click", () => confirmAndShare());
$("qrClose").addEventListener("click", () => $("qrDialog").close());
$("copyLink").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText($("openMobile").href);
    $("qrHint").textContent = "모바일 링크를 복사했습니다. 링크를 공유할 때 출장지 정보가 노출되지 않도록 주의하세요.";
  } catch (_) {
    $("qrHint").textContent = "링크 복사가 차단되었습니다. HTTPS 환경에서 다시 시도하세요.";
  }
});
