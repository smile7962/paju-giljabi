/* 출장ON AI v0.5 · 방문지별 출장결과보고서
 * 서버 전송 없음. 현장사진·메모는 PC 브라우저 안에서만 관리.
 * 원본 사진을 수정하지 않고 문서 미리보기/인쇄에 사용한다.
 */
"use strict";
const $ = id => document.getElementById(id);
const PLAN_KEY = "tripon-last-plan";
const DB_NAME = "tripon-report-photos";
const MAX_PHOTOS = 60;
let trip, stops, currentId, draft, photos = [], db, imageUrls = new Map();
let draftContext = null;
let currentHwpxDownloadUrl = null;
function hwpxMessage(message, error = false) {
  $("hwpxStatus").textContent = message;
  $("hwpxExportMessage").textContent = message;
  $("hwpxExportFeedback").classList.toggle("error", error);
}
function clearHwpxLink() {
  $("downloadHwpx").hidden = true;
  $("downloadHwpx").removeAttribute("href");
  if (currentHwpxDownloadUrl) {
    URL.revokeObjectURL(currentHwpxDownloadUrl);
    currentHwpxDownloadUrl = null;
  }
}


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
    purpose: typeof saved.purpose === "string" ? saved.purpose : "",
    results: saved.results && typeof saved.results === "object" ? saved.results : {}
  };
}
function photoCount(id) { return photos.filter(ph => ph.visitId === id).length; }
function resultFor(id) {
  const value = draft.results[id];
  return value && typeof value === "object" ? value :
    { check: "", action: "", time: "", attendees: "", purpose: "" };
}
function saveCurrent() {
  if (!currentId) return;
  draft.results[currentId] = {
    ...resultFor(currentId),
    purpose: $("visitPurpose").value,
    check: $("checkMemo").value,
    action: $("actionMemo").value,
    time: $("visitTime").value,
    attendees: $("attendees").value
  };
  storeDraft();
}
function dismissDraft() {
  draftContext = null;
  $("draftReview").hidden = true;
}
function currentDraftInput() {
  return {
    purpose: $("visitPurpose").value,
    address: stops.find(s => s.id === currentId)?.name || "",
    time: $("visitTime").value,
    attendees: $("attendees").value,
    check: $("checkMemo").value,
    action: $("actionMemo").value
  };
}
function showDraftResult(result, source) {
  draftContext = { tripId: trip.id, visitId: currentId, original: JSON.stringify(currentDraftInput()) };
  $("suggestedPurpose").value = result.purpose;
  $("suggestedCheck").value = result.check;
  $("suggestedAction").value = result.action;
  $("draftReview").hidden = false;
  $("draftStatus").textContent = source + " 초안 생성 완료 · 사실관계 확인 후 적용하세요.";
}
function selectStop(id) {
  if (!stops.some(s => s.id === id)) return;
  if (currentId !== id) {
    dismissDraft();
    $("aiSyntheticConfirmed").checked = false;
    $("generateAiDraft").disabled = true;
    $("aiTestResult").textContent = "새 출장지를 선택했습니다. AI 전송 여부를 다시 확인하세요.";
  }
  currentId = id;
  const stop = stops.find(s => s.id === id);
  const entry = resultFor(id);
  $("selectedStop").textContent = stop.name;
  $("visitPurpose").value = entry.purpose || draft.purpose || "";
  $("checkMemo").value = entry.check || "";
  $("actionMemo").value = entry.action || "";
  $("visitTime").value = entry.time || "";
  $("attendees").value = entry.attendees || "";
  $("reportSubheading").textContent = stop.name + " · 개별 출장결과보고서";
  $("documentFilename").textContent = documentFileName() + ".pdf";
  document.title = documentFileName();
  renderVisits();
  renderDocument();
  renderPhotos();
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
    const progress = (entry.check || "").trim() ? "보고서 작성 중" : "본문 미작성";
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
function documentFileName() {
  const stop = stops.find(s => s.id === currentId);
  const address = (stop?.name || "출장지").replace(/^경기도\s*파주시\s*/, "")
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, "").slice(0, 35) || "출장지";
  const date = (draft.date || "").replace(/[^0-9]/g, "") || "날짜미작성";
  // PDF 인쇄 기본 파일명(사용자 브라우저 저장창에서 변경 가능)
  return "출장결과보고서_" + date + "_" + address + "_" + currentId + "_" + trip.id.slice(-6);
}
function reportLine(label, value) {
  const row = document.createElement("p");
  row.className = "report-line";
  row.append(text("span", "ㅇ " + label + ": ", "line-label"));
  row.append(text("span", noInfo(value), "line-value"));
  return row;
}
function buildBodyPage() {
  const stop = stops.find(s => s.id === currentId);
  const entry = resultFor(currentId);
  const count = photos.filter(ph => ph.visitId === currentId && previewSupported(ph)).length;
  const paper = document.createElement("section");
  paper.className = "paper official-report";
  const top = document.createElement("div");
  top.className = "official-header";
  const left = document.createElement("table");
  left.className = "official-meta";
  function addOfficeRow(key, value) {
    const tr = document.createElement("tr");
    tr.append(text("th", key), text("td", value || ""));
    left.append(tr);
  }
  addOfficeRow("문서번호", "");
  addOfficeRow("보존기간", "");
  addOfficeRow("보고일자", "");
  addOfficeRow("결재일자", "");
  addOfficeRow("공개여부", "");
  const right = document.createElement("div");
  right.className = "approval-box";
  const line = document.createElement("div");
  line.className = "approver-head";
  line.append(text("strong", ""), text("span", "결재란"));
  right.append(line);
  const blank = document.createElement("div");
  blank.className = "approver-blank";
  right.append(blank);
  const person = document.createElement("div");
  person.className = "approver-traveler";
  person.append(text("strong", "출장자"), text("span", ""));
  right.append(person);
  top.append(left, right);
  paper.append(top, text("h1", "출장결과보고서"));
  // Match the actual three-cell HWPX purpose row:
  // black fixed text / red editable purpose / black fixed text.
  const intro = document.createElement("div");
  intro.className = "report-intro";
  const purposeRow = document.createElement("div");
  purposeRow.className = "purpose-row";
  purposeRow.append(
    text("span", "명에 의거 『", "purpose-prefix"),
    text("span", noInfo(entry.purpose || draft.purpose), "purpose-value"),
    text("span", "』에", "purpose-suffix")
  );
  intro.append(
    purposeRow,
    text("div", "아래와 같이 출장하였기에 보고합니다.", "purpose-followup")
  );
  paper.append(intro);

  const heading = text("h2", "□ 개요", "section-title");
  paper.append(heading);
  const info = document.createElement("div");
  info.className = "overview-lines";
  info.append(
    reportLine("일시", entry.time || draft.date),
    reportLine("장소", stop.name),
    reportLine("참석", entry.attendees)
  );
  info.append(text("p", "ㅇ 내용", "report-line"));
  const contents = document.createElement("div");
  contents.className = "report-contents";
  if ((entry.check || "").trim()) {
    contents.append(text("div", "- " + entry.check.trim(), "content-line"));
  } else {
    contents.append(text("div", "- 현장 확인내용 미작성", "content-line empty-text"));
  }
  if ((entry.action || "").trim()) {
    contents.append(text("div", "- 조치사항: " + entry.action.trim(), "content-line"));
  }
  info.append(contents);
  paper.append(info);
  paper.append(text("p", count > 0 ? "붙임  현장사진 1부.  끝." : "붙임  현장사진 미첨부.  끝.", "annex"));
  paper.append(text("div", "파 주 시 장  귀하", "recipient"));
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
  const valid = photos.filter(ph => ph.visitId === currentId && previewSupported(ph));
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
  const visible = photos.filter(ph => !ph.visitId || ph.visitId === currentId)
    .sort((a, b) => (a.importedAt || "").localeCompare(b.importedAt || ""));
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
        draft.results[stop.id] = { ...entry, check: memo };
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
["tripDate"].forEach(id => {
  $(id).addEventListener("input", () => {
    draft.date = $("tripDate").value;

    $("documentFilename").textContent = documentFileName() + ".pdf";
    document.title = documentFileName();
    storeDraft();
    renderDocument();
  });
});
["visitPurpose", "checkMemo", "actionMemo", "visitTime", "attendees"].forEach(id => {
  $(id).addEventListener("input", () => {
    if (draftContext) {
      dismissDraft();
      $("aiSyntheticConfirmed").checked = false;
      $("generateAiDraft").disabled = true;
      $("draftStatus").textContent = "원본 내용이 변경되어 기존 초안을 취소했습니다. 합성자료를 재확인 후 생성하세요.";
    }
    saveCurrent(); renderVisits(); renderDocument();
  });
});
$("aiEndpoint").value = localStorage.getItem("tripon-ai-endpoint") || "";
// Deliberately never save the access token to localStorage, a file, or the URL.
$("aiAccessToken").value = "";
$("aiSyntheticConfirmed").checked = false;
$("aiSyntheticConfirmed").addEventListener("change", () => {
  $("generateAiDraft").disabled = !$("aiSyntheticConfirmed").checked;
  if (!$("aiSyntheticConfirmed").checked) dismissDraft();
});
$("testAiConnection").addEventListener("click", async () => {
  const button = $("testAiConnection");
  if (button.disabled) return;
  button.disabled = true;
  $("aiTestResult").textContent = "가상의 건축현장 메모로 AI 서버를 시험 중입니다…";
  try {
    const source = TripDraft.syntheticSample();
    const output = await TripDraft.aiDraft(
      $("aiEndpoint").value.trim(), source, $("aiAccessToken").value
    );
    $("aiTestResult").textContent =
      "연결 성공 · 시연용 AI 문장: " + (output.check || "(현장 확인내용 없음)") +
      " / " + (output.action || "(조치사항 없음)") +
      " · 실제 보고서에는 적용하지 않았습니다.";
  } catch (error) {
    $("aiTestResult").textContent = "연결 시험 실패: " + (error.message || "서버 설정 확인 필요");
  } finally { button.disabled = false; }
});
$("aiEndpoint").addEventListener("change", () => {
  try {
    const input = $("aiEndpoint").value.trim();
    if (input) {
      const parsed = new URL(input);
      if (parsed.protocol !== "https:" || parsed.search || parsed.hash || parsed.username || parsed.password) {
        throw Error("HTTPS 주소만 입력하세요. URL에 API 키·토큰·쿼리값을 넣지 마세요.");
      }
    }
    localStorage.setItem("tripon-ai-endpoint", input);
    $("draftStatus").textContent = input ? "AI 프록시 주소가 저장됐습니다. 실제 연결 및 기관 승인 여부를 확인하세요." : "AI 연결이 해제됐습니다.";
  } catch (err) { $("draftStatus").textContent = err.message || "AI 프록시 주소 오류"; }
});
$("localDraft").addEventListener("click", () => {
  try {
    showDraftResult(TripDraft.localDraft(currentDraftInput()), "로컬 문장 정리(생성형 AI 아님)");
  } catch (err) { $("draftStatus").textContent = err.message; }
});
$("generateAiDraft").addEventListener("click", async () => {
  const endpoint = $("aiEndpoint").value.trim();
  if (!endpoint) {
    $("draftStatus").textContent = "AI 프록시가 연결되지 않았습니다. 로컬 정리 기능을 이용하거나 승인된 프록시를 설정하세요.";
    return;
  }
  if (!$("aiSyntheticConfirmed").checked) {
    $("draftStatus").textContent = "합성자료 확인 체크 후에만 외부 AI로 내용을 전송할 수 있습니다.";
    return;
  }
  if (!confirm("현장메모와 장소·시간·참석정보가 외부 AI 프록시로 전송됩니다. 개인정보·비공개 민원자료가 없고 기관에서 승인된 연결인지 확인했습니까?")) return;
  const source = currentDraftInput();
  const stopId = currentId;
  const btn = $("generateAiDraft");
  btn.disabled = true;
  $("draftStatus").textContent = "AI 초안을 요청하고 있습니다…";
  try {
    const result = await TripDraft.aiDraft(endpoint, source, $("aiAccessToken").value);
    if (!$("aiSyntheticConfirmed").checked ||
        currentId !== stopId || JSON.stringify(currentDraftInput()) !== JSON.stringify(source)) {
      $("draftStatus").textContent = "AI 응답을 기다리는 동안 방문지·원본메모가 변경돼 결과를 폐기했습니다.";
      return;
    }
    showDraftResult(result, "생성형 AI");
  } catch (err) {
    $("draftStatus").textContent = "AI 요청 실패: " + (err.message || "연결 상태 확인 필요");
  } finally { btn.disabled = false; }
});
$("applyDraft").addEventListener("click", () => {
  if (!draftContext || draftContext.tripId !== trip.id || draftContext.visitId !== currentId ||
      draftContext.original !== JSON.stringify(currentDraftInput())) {
    dismissDraft();
    $("draftStatus").textContent = "방문지나 원본이 변경돼 초안을 적용하지 않았습니다.";
    return;
  }
  $("visitPurpose").value = $("suggestedPurpose").value;
  $("checkMemo").value = $("suggestedCheck").value;
  $("actionMemo").value = $("suggestedAction").value;
  dismissDraft();
  saveCurrent();
  renderVisits(); renderDocument();
  $("draftStatus").textContent = "확인된 초안을 이 출장지에만 적용했습니다. HWPX 저장 전 사실관계를 최종 검토하세요.";
});
$("cancelDraft").addEventListener("click", () => {
  dismissDraft();
  $("draftStatus").textContent = "초안을 취소했습니다. 원본 내용은 변경되지 않았습니다.";
});
$("photoFiles").addEventListener("change", async event => {
  const files = [...event.target.files];
  event.target.value = "";
  await importFiles(files);
});
$("applyMobileMemo").addEventListener("click", applyCopiedMemo);
/* Export a COPY of the uploaded genuine HWPX. The browser never uploads or
 * modifies the original file, and keeps the same report/stop separation.
 */
$("hwpxTemplate").addEventListener("change", () => {
  const file = $("hwpxTemplate").files?.[0];
  $("hwpxStatus").textContent = file
    ? file.name + " 선택됨 · 원본은 수정하지 않습니다."
    : "파주시 원본 출장결과보고서.hwpx를 선택하세요.";
});
$("saveHwpx").addEventListener("click", async () => {
  const button = $("saveHwpx");
  if (button.disabled) return;
  clearHwpxLink();
  button.disabled = true;
  let step = "출력 준비";
  try {
    const file = $("hwpxTemplate").files?.[0];
    if (!file) throw Error("원본 출장결과보고서.hwpx를 먼저 선택하세요.");
    if (!rootHasExportModules()) throw Error("HWPX 생성 스크립트가 로드되지 않았습니다. Ctrl+F5로 다시 불러오세요.");
    const stop = stops.find(s => s.id === currentId);
    if (!stop) throw Error("선택한 출장장소가 없습니다.");
    const entry = resultFor(currentId);
    const missing = [];
    if (!(entry.purpose || draft.purpose || "").trim()) missing.push("출장목적");
    if (!(entry.check || "").trim()) missing.push("현장 확인내용");
    if (!(entry.attendees || "").trim()) missing.push("참석");
    if (missing.length && !confirm(missing.join("·") + "이(가) 미작성입니다. 이대로 작성하시겠습니까?")) {
      hwpxMessage("작성 작업을 취소했습니다. 기존 입력내용은 유지됩니다.");
      return;
    }
    const selected = photos.filter(p => p.visitId === currentId);
    const include = $("includeHwpxPhotos").checked;
    const attached = include
      ? selected.map(photo => ({ ...photo, visitName: stop.name }))
      : [];
    if (attached.length > TripPhotos.LIMIT) {
      throw Error("한 출장지당 현장사진 " + TripPhotos.LIMIT + "장까지 첨부할 수 있습니다. 현재 " + attached.length + "장입니다.");
    }
    const unsupported = attached.filter(p => !previewSupported(p));
    if (unsupported.length) {
      throw Error("선택한 현장사진 " + unsupported.length + "장은 JPG/PNG/WEBP가 아닙니다. HEIC라면 JPEG로 변환하거나 '사진 제외' 후 본문만 저장하세요.");
    }
    if (!confirm((include && attached.length ? "현장사진 " + attached.length + "장을 포함합니다." :
      "현장사진 없이 본문만 작성합니다.") + "\n\n" + stop.name + " 결과보고서 HWPX를 생성하시겠습니까?")) {
      hwpxMessage("작성 작업을 취소했습니다.");
      return;
    }
    const placeId = currentId;
    step = "원본 HWPX 읽기";
    hwpxMessage(step + "…");
    const blob = await TripHwpx.generate(file, {
      date: draft.date,
      purpose: entry.purpose || draft.purpose,
      address: stop.name,
      visitTime: entry.time,
      attendees: entry.attendees,
      check: entry.check,
      action: entry.action
    }, attached, (phase) => {
      step = phase;
      hwpxMessage(phase);
    });
    if (placeId !== currentId) {
      throw Error("생성 중 다른 출장지가 선택되어 결과를 취소했습니다. 다시 저장하세요.");
    }
    step = "파일 다운로드 준비";
    currentHwpxDownloadUrl = URL.createObjectURL(blob);
    const name = documentFileName() + ".hwpx";
    const link = $("downloadHwpx");
    link.href = currentHwpxDownloadUrl;
    link.download = name;
    link.hidden = false;
    // Some browsers suppress programmatic downloads after awaited operations.
    // Always retain a real, visible link for a user-initiated download.
    hwpxMessage("HWPX 생성 완료 · " + Math.ceil(blob.size / 1024) + "KB · 사진 " +
      attached.length + "장. 자동 저장이 시작되지 않으면 'HWPX 직접 다운로드'를 클릭하세요.");
    link.click();
  } catch (error) {
    hwpxMessage("HWPX 저장 실패 [" + step + "]: " +
      (error?.message || "알 수 없는 오류") +
      " · 먼저 '사진 포함' 선택을 해제하고 본문 저장이 되는지 확인해 주세요.", true);
  } finally {
    button.disabled = false;
  }
});
function rootHasExportModules() {
  return typeof TripHwpx !== "undefined" && typeof TripPhotos !== "undefined" &&
    typeof JSZip !== "undefined";
}
$("hwpxTemplate").addEventListener("change", () => {
  clearHwpxLink();
  const filename = $("hwpxTemplate").files?.[0]?.name;
  hwpxMessage(filename ? "원본 선택됨: " + filename : "원본 HWPX를 선택하세요.");
});
$("includeHwpxPhotos").addEventListener("change", () => {
  clearHwpxLink();
  hwpxMessage($("includeHwpxPhotos").checked
    ? "HWPX 저장 시 해당 출장지의 사진을 자동 포함합니다."
    : "HWPX 저장 시 사진을 제외하고 본문만 생성합니다.");
});

$("printReport").addEventListener("click", () => {
  const selected = resultFor(currentId);
  const missing = (selected.check || "").trim() ? 0 : 1;
  const unknown = photos.filter(p => !p.visitId).length;
  const unsupported = photos.filter(p => p.visitId === currentId && !previewSupported(p)).length;
  const warnings = [];
  if (missing) warnings.push("선택한 출장장소의 현장 확인내용 미작성");
  if (unknown) warnings.push("방문지 미분류 사진 " + unknown + "장 (현재 PDF에서 제외)");
  if (unsupported) warnings.push("PDF 출력 미지원 형식 사진 " + unsupported + "장");
  if (!(selected.purpose || draft.purpose || "").trim()) warnings.push("출장목적 미작성");
  if (!(selected.attendees || "").trim()) warnings.push("선택한 장소의 참석자 미작성");
  if (warnings.length && !confirm(warnings.join("\n") + "\n\n이 장소의 보고서만 인쇄하시겠습니까?")) return;
  document.title = documentFileName(); // PDF 저장 시 장소별 권장 파일명
  window.print();
});
start();