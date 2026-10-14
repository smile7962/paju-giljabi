/* 출장ON AI v0.4 · 사무실 출장복명
 * 서버 전송 없음. 현장사진·메모는 PC 브라우저 안에서만 관리.
 * 원본 사진을 수정하지 않고 문서 미리보기/인쇄에 사용한다.
 */
"use strict";
const $ = id => document.getElementById(id);
const PLAN_KEY = "tripon-last-plan";
const DB_NAME = "tripon-report-photos";
const MAX_PHOTOS = 60;
let trip, stops, currentId, draft, photos = [], db, imageUrls = new Map();

function text(tag, value, className) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = String(value);
  return el;
}
function p(tag, value, className) { return text(tag, value, className); }
function storeDraft() {
  try { localStorage.setItem("tripon-report-" + trip.id, JSON.stringify(draft)); }
  catch (_) { reportStatus("작성내용 자동저장에 실패했습니다. 브라우저 저장공간을 확인하세요.", true); }
}
function reportStatus(message, warning = false) {
  $("photoStatus").textContent = message;
  $("photoStatus").className = "status" + (warning ? " warn" : "");
}
function readPlan() {
  const raw = localStorage.getItem(PLAN_KEY);
  if (!raw) throw Error("확정된 출장계획이 없습니다.");
  // 공통 포맷 검증
  const plan = JSON.parse(raw);
  TripIO.encode(plan);
  const id = plan[1];
  return {
    id, origin: plan[2][0],
    visits: plan[3].map((item, index) => ({
      id: "S" + String(index + 1).padStart(2, "0"),
      name: item[0]
    }))
  };
}
function readDraft() {
  const today = new Date();
  const localDate = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem("tripon-report-" + trip.id) || "{}"); }
  catch (_) {}
  return {
    date: typeof saved.date === "string" && saved.date ? saved.date : localDate,
    traveler: typeof saved.traveler === "string" ? saved.traveler : "",
    purpose: typeof saved.purpose === "string" ? saved.purpose : "",
    results: saved.results && typeof saved.results === "object" ? saved.results : {}
  };
}
function photoCount(id) { return photos.filter(ph => ph.visitId === id).length; }
function resultFor(id) {
  const value = draft.results[id];
  return value && typeof value === "object" ? value : { check: "", action: "" };
}
function saveCurrent() {
  if (!currentId) return;
  draft.results[currentId] = { check: $("checkMemo").value, action: $("actionMemo").value };
  storeDraft();
}
function selectStop(id) {
  if (!stops.some(s => s.id === id)) return;
  currentId = id;
  const stop = stops.find(s => s.id === id);
  const entry = resultFor(id);
  $("selectedStop").textContent = stop.name;
  $("checkMemo").value = entry.check || "";
  $("actionMemo").value = entry.action || "";
  renderVisits();
}
function renderVisits() {
  const box = $("visitList");
  box.replaceChildren();
  stops.forEach((stop, index) => {
    const entry = resultFor(stop.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "visit" + (stop.id === currentId ? " active" : "");
    button.setAttribute("aria-pressed", String(stop.id === currentId));
    const progress = (entry.check || "").trim() ? "현장기록 작성" : "현장기록 미작성";
    button.append(
      text("span", (index + 1) + ". " + stop.name, "vname"),
      text("span", progress + " · 사진 " + photoCount(stop.id) + "장", "vmeta")
    );
    button.addEventListener("click", () => selectStop(stop.id));
    box.append(button);
  });
}
function noInfo(value) {
  const s = typeof value === "string" ? value.trim() : "";
  return s || "미작성";
}
function addMeta(table, title, value) {
  const tr = document.createElement("tr");
  tr.append(text("th", title), text("td", noInfo(value)));
  table.append(tr);
}
function buildBodyPage() {
  const paper = document.createElement("section");
  paper.className = "paper";
  paper.append(text("h1", "출장복명서"));
  const table = document.createElement("table");
  table.className = "meta";
  addMeta(table, "출장일자", draft.date);
  addMeta(table, "출장자", draft.traveler);
  addMeta(table, "출장목적", draft.purpose);
  addMeta(table, "출발·복귀지", trip.origin);
  paper.append(table);
  paper.append(text("h2", "현장 확인 및 조치사항"));
  stops.forEach((stop, i) => {
    const entry = resultFor(stop.id);
    const container = document.createElement("div");
    container.className = "entry";
    container.append(text("div", (i + 1) + ". " + stop.name, "entry-title"));
    container.append(text("strong", "현장 확인내용"));
    container.append(text("div", noInfo(entry.check), "value" + (!(entry.check || "").trim() ? " empty-text" : "")));
    container.append(text("strong", "조치사항"));
    container.append(text("div", noInfo(entry.action), "value" + (!(entry.action || "").trim() ? " empty-text" : "")));
    paper.append(container);
  });
  const annexCount = photos.filter(ph => ph.visitId && previewSupported(ph)).length;
  paper.append(text("div", "붙임: 현장사진 " + annexCount + "장" + (annexCount ? " (다음 페이지)" : " (첨부 없음)"), "annex"));
  return paper;
}
function previewSupported(ph) {
  return /\.(jpe?g|png|webp)$/i.test(ph.name);
}
function photoUrl(ph) {
  if (!imageUrls.has(ph.id)) imageUrls.set(ph.id, URL.createObjectURL(ph.blob));
  return imageUrls.get(ph.id);
}
function buildPhotoPages() {
  const valid = photos.filter(ph => ph.visitId && previewSupported(ph));
  const pages = [];
  for (let i = 0; i < valid.length; i += 2) {
    const sheet = document.createElement("section");
    sheet.className = "paper photo-page";
    sheet.append(text("h1", "붙임 · 현장사진"));
    for (const ph of valid.slice(i, i + 2)) {
      const location = stops.find(s => s.id === ph.visitId);
      const block = document.createElement("div");
      block.className = "photo-block";
      block.append(text("div", location?.name || "방문지 미분류", "photo-title"));
      const img = document.createElement("img");
      img.src = photoUrl(ph);
      img.alt = location?.name + " 현장사진";
      block.append(img, text("div", ph.caption || "사진설명 미작성", "photo-caption"));
      sheet.append(block);
    }
    pages.push(sheet);
  }
  return pages;
}
function renderDocument() {
  $("reportPages").replaceChildren(buildBodyPage(), ...buildPhotoPages());
}
function renderAll() {
  renderVisits();
  renderPhotos();
  renderDocument();
}
function fileId(file) {
  return trip.id + "|" + file.name + "|" + file.size + "|" + file.lastModified;
}
function expectedAddress(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "").slice(0, 48) || "출장지";
}
function autoMatch(filename) {
  // 휴대폰에서 생성한 원본 형식과 출장/방문지/계획주소 3가지가 모두 일치해야 함
  const prefix = trip.id + "_";
  if (!filename.startsWith(prefix)) return "";
  const suffix = filename.slice(prefix.length);
  const m = /^(S\d{2})_(.+)_(\d+)\.(jpe?g|png|webp|heic|heif)$/i.exec(suffix);
  if (!m) return "";
  const stop = stops.find(s => s.id === m[1]);
  return stop && m[2] === expectedAddress(stop.name) ? stop.id : "";
}
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function dbSave(item) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function dbDelete(id) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readwrite");
    tx.objectStore("photos").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
function dbRead() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("photos", "readonly");
    const req = tx.objectStore("photos").getAll();
    req.onsuccess = () => resolve(req.result.filter(ph => ph.tripId === trip.id));
    req.onerror = () => reject(req.error);
  });
}
async function importFiles(files) {
  if (!db) return reportStatus("사진 저장소를 열 수 없습니다. 다른 브라우저에서 다시 시도하세요.", true);
  let added = 0, unclassified = 0, skipped = 0;
  for (const file of files) {
    if (photos.length >= MAX_PHOTOS || file.size > 25 * 1024 * 1024 ||
      !(/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name))) {
      skipped++;
      continue;
    }
    const id = fileId(file);
    if (photos.some(ph => ph.id === id)) { skipped++; continue; }
    const visitId = autoMatch(file.name);
    const item = {
      id, tripId: trip.id, visitId, name: file.name, caption: "",
      blob: file, importedAt: new Date().toISOString()
    };
    try {
      await dbSave(item);
      photos.push(item);
      added++;
      if (!visitId) unclassified++;
    } catch (_) { skipped++; }
  }
  renderAll();
  reportStatus("사진 " + added + "장 추가 · 자동분류 안 됨 " + unclassified + "장 · 건너뜀 " + skipped + "장" +
    (photos.some(ph => !previewSupported(ph)) ? " · HEIC 사진은 브라우저에서 PDF 표시가 지원되지 않을 수 있으므로 JPEG로 변환하세요." : ""),
    unclassified > 0 || skipped > 0);
}
function renderPhotos() {
  const root = $("photoList");
  root.replaceChildren();
  const visible = [...photos].sort((a, b) => (a.importedAt || "").localeCompare(b.importedAt || ""));
  for (const ph of visible) {
    const card = document.createElement("div");
    card.className = "photo-item";
    const top = document.createElement("div");
    top.className = "photo-top";
    const thumb = previewSupported(ph) ? document.createElement("img") : text("span", "HEIC", "photo-name");
    if (thumb.tagName === "IMG") {
      thumb.src = photoUrl(ph);
      thumb.alt = "현장사진 미리보기";
    }
    const meta = document.createElement("div");
    meta.append(text("div", ph.name, "photo-name"));
    meta.append(text("div", ph.visitId ? "분류: " + (stops.find(s => s.id === ph.visitId)?.name || "") : "자동분류 불가 · 방문지 선택 필요", "photo-badge" + (!ph.visitId ? " warn" : "")));
    top.append(thumb, meta);
    card.append(top);
    const assignLabel = text("label", "연결할 방문지");
    const sel = document.createElement("select");
    const options = [{ id: "", name: "미분류 · 출력 제외" }, ...stops];
    for (const option of options) {
      const item = document.createElement("option");
      item.value = option.id;
      item.textContent = option.name;
      sel.append(item);
    }
    sel.value = ph.visitId || "";
    sel.addEventListener("change", async () => {
      const prev = ph.visitId;
      ph.visitId = sel.value;
      try { await dbSave(ph); renderAll(); }
      catch (_) { ph.visitId = prev; reportStatus("사진 분류를 저장하지 못했습니다.", true); }
    });
    const captionLabel = text("label", "사진설명");
    const caption = document.createElement("input");
    caption.type = "text";
    caption.maxLength = 240;
    caption.value = ph.caption || "";
    caption.placeholder = "사진 설명 입력";
    caption.addEventListener("change", async () => {
      const prev = ph.caption;
      ph.caption = caption.value;
      try { await dbSave(ph); renderDocument(); }
      catch (_) { ph.caption = prev; reportStatus("사진 설명을 저장하지 못했습니다.", true); }
    });
    const del = document.createElement("button");
    del.className = "remove";
    del.type = "button";
    del.textContent = "사진 제거";
    del.addEventListener("click", async () => {
      if (!confirm("PC 출장복명에서 이 사진을 제거할까요?")) return;
      try {
        await dbDelete(ph.id);
        photos = photos.filter(item => item.id !== ph.id);
        if (imageUrls.has(ph.id)) URL.revokeObjectURL(imageUrls.get(ph.id));
        imageUrls.delete(ph.id);
        renderAll();
      } catch (_) { reportStatus("사진 제거에 실패했습니다.", true); }
    });
    card.append(assignLabel, sel, captionLabel, caption, del);
    root.append(card);
  }
}
function applyCopiedMemo() {
  const lines = $("mobileMemo").value.replace(/\r/g, "").split("\n");
  const id = /^출장ID:\s*(.+)\s*$/.exec(lines[0]?.trim() || "")?.[1]?.trim();
  if (!id || id !== trip.id) {
    reportStatus("출장 ID가 현재 출장계획과 다릅니다. 다른 출장의 메모는 가져오지 않았습니다.", true);
    return;
  }
  let matched = 0, skipped = 0, stop = null, collecting = false, memoLines = [];
  const finish = () => {
    if (!stop) return;
    const memo = memoLines.join("\n").trim();
    if (memo && memo !== "미입력") {
      const entry = resultFor(stop.id);
      if ((entry.check || "").trim()) skipped++;
      else {
        draft.results[stop.id] = { check: memo, action: entry.action || "" };
        matched++;
      }
    }
  };
  for (const line of lines.slice(1)) {
    const heading = /^(\d+)\.\s+(.+?)\s+\[(방문완료|미완료)\]\s*$/.exec(line);
    if (heading) {
      finish();
      const idx = Number(heading[1]) - 1;
      stop = stops[idx]?.name === heading[2] ? stops[idx] : null;
      collecting = false; memoLines = [];
      if (!stop) skipped++;
      continue;
    }
    if (!stop) continue;
    if (line.startsWith("현장메모:")) {
      collecting = true;
      memoLines.push(line.slice("현장메모:".length).trim());
    } else if (line.startsWith("사진:")) {
      collecting = false;
    } else if (collecting) {
      memoLines.push(line);
    }
  }
  finish();
  storeDraft();
  selectStop(currentId);
  renderDocument();
  reportStatus("휴대폰 메모 " + matched + "개 출장지에 반영 · 기존 기록/주소 불일치 등 " + skipped + "개 건너뜀", skipped > 0);
}
async function start() {
  try {
    trip = readPlan();
    stops = trip.visits;
    draft = readDraft();
    currentId = stops[0].id;
    $("tripId").textContent = trip.id;
    $("tripDate").value = draft.date;
    $("traveler").value = draft.traveler;
    $("purpose").value = draft.purpose;
    $("workspace").hidden = false;
    selectStop(currentId);
    try {
      db = await openDB();
      photos = await dbRead();
    } catch (_) {
      reportStatus("사진 로컬 저장소를 사용할 수 없습니다. 비공개 모드나 브라우저 설정을 확인하세요.", true);
    }
    renderAll();
  } catch (error) {
    $("workspace").hidden = true;
    $("noPlan").hidden = false;
    $("noPlan").querySelector("p").textContent = error.message + " 출장계획을 확정한 동일 브라우저에서 열어 주세요.";
  }
}
["tripDate", "traveler", "purpose"].forEach(id => {
  $(id).addEventListener("input", () => {
    draft.date = $("tripDate").value;
    draft.traveler = $("traveler").value;
    draft.purpose = $("purpose").value;
    storeDraft();
    renderDocument();
  });
});
["checkMemo", "actionMemo"].forEach(id => {
  $(id).addEventListener("input", () => { saveCurrent(); renderVisits(); renderDocument(); });
});
$("photoFiles").addEventListener("change", async event => {
  const files = [...event.target.files];
  event.target.value = "";
  await importFiles(files);
});
$("applyMobileMemo").addEventListener("click", applyCopiedMemo);
$("printReport").addEventListener("click", () => {
  const missing = stops.filter(s => !(resultFor(s.id).check || "").trim()).length;
  const unknown = photos.filter(p => !p.visitId).length;
  const unsupported = photos.filter(p => p.visitId && !previewSupported(p)).length;
  const warnings = [];
  if (missing) warnings.push("현장 확인내용 미작성 " + missing + "개소");
  if (unknown) warnings.push("미분류 사진 " + unknown + "장");
  if (unsupported) warnings.push("PDF 출력 미지원 형식 사진 " + unsupported + "장");
  if (warnings.length && !confirm(warnings.join("\n") + "\n\n이대로 인쇄하시겠습니까?")) return;
  window.print();
});
start();