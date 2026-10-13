/* 출장ON AI 모바일 현장출장 v0.2
 * QR 계획 → 내비 → 사진 로컬저장 → 사용자 이메일 공유.
 * 사진/GPS/메모를 서버나 AI API로 전송하지 않는다.
 */
"use strict";
const $ = id => document.getElementById(id);
const prefix = "tripon-";
const DB_NAME = "tripon-photos";
let trip, origin, stops, index = 0, state, photos = [], db;
let map, mapLayer, roadLayer, routeToken = 0, imageUrls = [];

function notice(message) { $("photoStatus").textContent = message; }
function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(prefix + trip.id) || "{}");
    return { done: value.done || [], arrived: value.arrived || [], memos: value.memos || {} };
  } catch (_) { return { done: [], arrived: [], memos: {} }; }
}
function saveState() {
  try { localStorage.setItem(prefix + trip.id, JSON.stringify(state)); }
  catch (_) { notice("메모 자동저장에 실패했습니다. 출장기록을 복사해 보관하세요."); }
}
function unpack(payload) {
  return {
    id: payload[1],
    origin: { name: payload[2][0], lat: payload[2][1], lng: payload[2][2] },
    stops: payload[3].map((p, i) => ({
      id: "S" + String(i + 1).padStart(2, "0"),
      name: p[0], lat: p[1], lng: p[2]
    }))
  };
}
function openDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error("브라우저 사진 저장소를 사용할 수 없습니다."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("photos", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function dbOperation(method, data) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    const store = tx.objectStore("photos");
    const req = method === "put" ? store.put(data) : store.delete(data);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function readPhotos() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const req = tx.objectStore("photos").getAll();
    req.onsuccess = () => resolve(req.result.filter(p => p.tripId === trip.id));
    req.onerror = () => reject(req.error);
  });
}
function displayError(message) {
  $("errorScreen").hidden = false;
  $("mobileMain").hidden = true;
  $("errorText").textContent = message;
}
function sanitize(value) {
  return value.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "").slice(0, 48) || "출장지";
}
function extFor(file) {
  const byMime = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif" };
  if (byMime[file.type]) return byMime[file.type];
  const match = file.name && file.name.match(/\.(jpe?g|png|webp|heic|heif)$/i);
  return match ? match[1].toLowerCase() : "jpg";
}
function buildName(stop, seq, file) {
  return trip.id + "_" + stop.id + "_" + sanitize(stop.name) + "_" + String(seq).padStart(2, "0") + "." + extFor(file);
}
function current() { return stops[index]; }
function navLinks(stop) {
  const dest = encodeURIComponent(stop.name);
  $("kakaoNav").href = "https://map.kakao.com/link/to/" + dest + "," + stop.lat + "," + stop.lng;
  const app = encodeURIComponent(location.origin + location.pathname);
  $("naverNav").href = "nmap://route/car?dlat=" + stop.lat + "&dlng=" + stop.lng + "&dname=" + dest + "&appname=" + app;
  $("tmapNav").href = "tmap://route?goalname=" + dest + "&goalx=" + stop.lng + "&goaly=" + stop.lat;
}
function makePin(n, home) {
  return L.divIcon({
    className: "",
    html: '<div class="pin' + (home ? ' home' : '') + '">' + n + "</div>",
    iconSize: [29, 29], iconAnchor: [14, 14]
  });
}
function drawMap() {
  if (typeof L === "undefined") {
    $("mapNote").textContent = "지도를 불러오지 못했습니다. 외부 내비 버튼을 이용하세요.";
    return;
  }
  if (!map) {
    map = L.map("fieldMap").setView([current().lat, current().lng], 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);
  }
  if (mapLayer) map.removeLayer(mapLayer);
  if (roadLayer) map.removeLayer(roadLayer);
  const prior = index ? stops[index - 1] : origin;
  const dest = current();
  mapLayer = L.featureGroup([
    L.marker([prior.lat, prior.lng], { icon: makePin("출", true) }),
    L.marker([dest.lat, dest.lng], { icon: makePin(index + 1, false) })
  ]).addTo(map);
  map.fitBounds(mapLayer.getBounds().pad(0.35));
  setTimeout(() => map.invalidateSize(), 50);
  const token = ++routeToken;
  $("mapNote").textContent = "계획된 이동구간 계산 중… 실제 내비 경로는 외부 앱에서 확인하세요.";
  fetch("https://router.project-osrm.org/route/v1/driving/" +
        prior.lng + "," + prior.lat + ";" + dest.lng + "," + dest.lat +
        "?overview=full&geometries=geojson")
    .then(r => { if (!r.ok) throw Error("route"); return r.json(); })
    .then(d => {
      if (token !== routeToken) return;
      const coords = d.routes && d.routes[0] && d.routes[0].geometry && d.routes[0].geometry.coordinates;
      if (!coords) throw Error("route");
      roadLayer = L.polyline(coords.map(c => [c[1], c[0]]), { color: "#155eef", weight: 5 }).addTo(map);
      map.fitBounds(roadLayer.getBounds().pad(0.15));
      $("mapNote").textContent = "이전 계획지점부터 현재 목적지까지의 예상 도로경로입니다. 실시간 길안내는 내비를 이용하세요.";
    })
    .catch(() => {
      if (token !== routeToken) return;
      $("mapNote").textContent = "도로경로를 확인할 수 없습니다. 지도에는 출발·목적지 위치만 표시했습니다.";
    });
}
function setupPicker() {
  $("stopPicker").replaceChildren();
  stops.forEach((stop, i) => {
    const o = document.createElement("option");
    o.value = String(i);
    o.textContent = (i + 1) + ". " + stop.name;
    $("stopPicker").append(o);
  });
}
function render() {
  const stop = current();
  const done = state.done.includes(stop.id);
  const arrived = state.arrived.includes(stop.id);
  $("stopPicker").value = String(index);
  $("progress").textContent = state.done.length + "/" + stops.length + " 완료";
  $("destination").textContent = stop.name;
  $("source").textContent = "사무실에서 확정한 계획주소 · GPS 주소변환 사용 안 함";
  $("phaseLabel").textContent = done ? "방문 완료한 현장" : arrived ? "현장 도착" : "다음 목적지 · " + (index + 1) + "/" + stops.length;
  $("navbox").hidden = arrived || done;
  $("onsite").hidden = !arrived && !done;
  $("completed").hidden = state.done.length !== stops.length;
  $("finish").textContent = done ? "방문 완료됨" : "방문 완료 · 다음 현장";
  $("finish").disabled = done;
  $("memo").value = state.memos[stop.id] || "";
  navLinks(stop);
  drawMap();
  renderPhotos();
}
function renderPhotos() {
  imageUrls.forEach(url => URL.revokeObjectURL(url));
  imageUrls = [];
  const list = $("photoList");
  list.replaceChildren();
  const visible = photos.filter(p => p.stopId === current().id).sort((a, b) => a.seq - b.seq);
  notice("이 출장지에 저장된 사진 " + visible.length + "장 · 전체 " + photos.length + "장");
  visible.forEach(photo => {
    const li = document.createElement("li");
    const img = document.createElement("img");
    const url = URL.createObjectURL(photo.blob);
    imageUrls.push(url);
    img.src = url;
    img.alt = "현장사진";
    const details = document.createElement("div");
    const title = document.createElement("div");
    title.className = "name";
    title.textContent = photo.name;
    const controls = document.createElement("div");
    controls.className = "controls";
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "파일 저장";
    save.addEventListener("click", () => downloadPhoto(photo));
    const del = document.createElement("button");
    del.type = "button";
    del.textContent = "삭제";
    del.addEventListener("click", async () => {
      if (!confirm("선택한 현장사진을 삭제할까요?")) return;
      try {
        await dbOperation("delete", photo.key);
        photos = photos.filter(p => p.key !== photo.key);
        renderPhotos();
      } catch (_) { notice("사진을 삭제하지 못했습니다."); }
    });
    controls.append(save, del);
    details.append(title, controls);
    li.append(img, details);
    list.append(li);
  });
  $("sharePhotos").disabled = photos.length === 0;
}
function downloadPhoto(photo) {
  const url = URL.createObjectURL(photo.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = photo.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function saveFiles(files) {
  if (!db) return notice("휴대폰 사진 저장소를 열지 못했습니다. 사진 촬영을 진행하지 마세요.");
  const stop = current();
  let seq = Math.max(0, ...photos.filter(p => p.stopId === stop.id).map(p => p.seq));
  for (const file of files) {
    if (!file.type.startsWith("image/") || file.size > 25 * 1024 * 1024) {
      notice("사진 파일만 지원하며 한 장당 25MB 이하만 저장할 수 있습니다.");
      continue;
    }
    seq++;
    const record = {
      key: trip.id + "|" + stop.id + "|" + seq,
      tripId: trip.id, stopId: stop.id, seq,
      name: buildName(stop, seq, file),
      type: file.type, blob: file, capturedAt: new Date().toISOString()
    };
    try {
      await dbOperation("put", record);
      photos.push(record);
      notice("휴대폰 사진 저장 완료: " + record.name);
    } catch (_) {
      notice("사진 저장 실패: 휴대폰 저장공간·브라우저 설정을 확인하세요. 다른 파일로 전송하기 전 이 사진을 별도로 저장하세요.");
      break;
    }
  }
  renderPhotos();
}
async function sharePhotos() {
  if (!photos.length) return;
  const files = photos.map(p => new File([p.blob], p.name, { type: p.type || "image/jpeg" }));
  if (!navigator.share || !navigator.canShare || !navigator.canShare({ files })) {
    alert("이 기기는 사진 여러 장 공유를 지원하지 않습니다. 방문지별 사진의 '파일 저장' 버튼을 이용한 후 허용된 업무메일에 첨부하세요.");
    return;
  }
  try {
    await navigator.share({ files, title: "출장ON AI 현장사진" });
    alert("공유 메뉴를 종료했습니다. 이메일 앱에서 실제 전송 여부를 확인하세요.");
  } catch (err) {
    if (err.name !== "AbortError") alert("사진 공유에 실패했습니다. 사진별 파일 저장을 이용하세요.");
  }
}
async function copyMemo() {
  const text = [
    "출장ID: " + trip.id,
    ...stops.flatMap((s, i) => [
      (i + 1) + ". " + s.name + " [" + (state.done.includes(s.id) ? "방문완료" : "미완료") + "]",
      "현장메모: " + (state.memos[s.id] || "미입력"),
      ...photos.filter(p => p.stopId === s.id).map(p => "사진: " + p.name)
    ])
  ].join("\n");
  try {
    await navigator.clipboard.writeText(text);
    alert("출장기록을 복사했습니다. 업무메일 본문 등에 붙여넣을 수 있습니다.");
  } catch (_) {
    alert("자동 복사가 차단되었습니다. HTTPS 환경에서 다시 시도하세요.");
  }
}
async function init() {
  try {
    const encoded = new URLSearchParams(location.hash.replace(/^#/, "")).get("trip");
    if (!encoded) throw Error("출장계획 링크가 없습니다. PC에서 QR을 다시 생성하세요.");
    trip = unpack(TripIO.decode(encoded));
    origin = trip.origin;
    stops = trip.stops;
    state = loadState();
    index = Math.max(0, stops.findIndex(s => !state.done.includes(s.id)));
    try { db = await openDB(); photos = await readPhotos(); }
    catch (_) { db = null; }
    setupPicker();
    $("mobileMain").hidden = false;
    render();
    if (!db) notice("이 브라우저에서는 사진 영구저장을 사용할 수 없습니다. 다른 브라우저 또는 HTTPS에서 다시 여세요.");
  } catch (err) { displayError(err.message || "출장계획을 불러오지 못했습니다."); }
}
$("stopPicker").addEventListener("change", e => { index = Number(e.target.value); render(); });
$("arrive").addEventListener("click", () => {
  const id = current().id;
  if (!state.arrived.includes(id)) state.arrived.push(id);
  saveState();
  render();
});
$("backToTravel").addEventListener("click", () => {
  state.arrived = state.arrived.filter(id => id !== current().id);
  saveState();
  render();
});
$("finish").addEventListener("click", () => {
  const id = current().id;
  if (!state.done.includes(id)) state.done.push(id);
  saveState();
  const next = stops.findIndex(s => !state.done.includes(s.id));
  if (next >= 0) index = next;
  render();
});
$("memo").addEventListener("input", e => {
  state.memos[current().id] = e.target.value;
  saveState();
});
$("camera").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  await saveFiles(files);
});
$("photosInput").addEventListener("change", async e => {
  const files = [...e.target.files];
  e.target.value = "";
  await saveFiles(files);
});
$("sharePhotos").addEventListener("click", sharePhotos);
$("copyMemo").addEventListener("click", copyMemo);
init();