/* 출장ON AI · 모바일 ↔ PC 현장기록 인계 공통 규칙
 * 파일명과 출장ID/방문지 주소를 검증한다. 서버 전송 없음.
 */
(function (root) {
  "use strict";
  const LIMIT = 100000;
  function addressPart(address) {
    return String(address || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "")
      .replace(/\s+/g, "").slice(0, 48) || "출장지";
  }
  function photoMatch(filename, tripId, stops) {
    if (typeof filename !== "string" || typeof tripId !== "string" ||
        !filename.startsWith(tripId + "_")) return "";
    const tail = filename.slice(tripId.length + 1);
    const match = /^(S\d{2})_(.+)_(\d{1,4})\.(jpe?g|png|webp|heic|heif)$/i.exec(tail);
    if (!match) return "";
    const stop = stops.find(item => item.id === match[1]);
    if (!stop) return "";
    const address = addressPart(stop.name);
    // Keep the original mobile/PC convention: address whitespace removed.
    // Accept a filename with spaces too, if an email app preserved that form.
    return match[2] === address || match[2].replace(/\s+/g, "") === address ?
      stop.id : "";
  }
  function photoNumber(filename) {
    const m = /_(\d{1,4})\.(?:jpe?g|png|webp|heic|heif)$/i.exec(filename);
    return m ? Number(m[1]) : null;
  }
  function memoText(tripId, stops, state, photos) {
    if (!/^[a-z0-9-]{6,40}$/.test(tripId)) throw Error("출장 ID를 확인하세요.");
    const lines = ["출장ID: " + tripId];
    stops.forEach((stop, i) => {
      lines.push((i + 1) + ". " + stop.name +
        " [" + (state.done.includes(stop.id) ? "방문완료" : "미완료") + "]");
      lines.push("현장메모: " + (state.memos[stop.id] || "미입력"));
      photos.filter(photo => photo.stopId === stop.id).forEach(photo =>
        lines.push("사진: " + photo.name));
    });
    const content = lines.join("\n");
    if (content.length > LIMIT) throw Error("출장기록이 너무 깁니다. 방문지 메모를 줄여주세요.");
    return content;
  }
  function readMemo(content, tripId, stops) {
    if (typeof content !== "string" || content.length > LIMIT) {
      throw Error("출장기록은 텍스트 10만 자 이하여야 합니다.");
    }
    const lines = content.replace(/^\uFEFF/, "").replace(/\r/g, "").split("\n");
    const foundId = /^출장ID:\s*(.+?)\s*$/.exec(lines[0]?.trim() || "")?.[1];
    if (foundId !== tripId) throw Error("출장 ID가 현재 출장계획과 다릅니다.");
    let current = null, collecting = false, buffer = [], skipped = 0;
    const found = [];
    const flush = () => {
      if (!current) return;
      const memo = buffer.join("\n").trim();
      if (memo && memo !== "미입력") found.push({ stopId: current.id, memo });
    };
    for (const line of lines.slice(1)) {
      const match = /^(\d+)\.\s+(.+?)\s+\[(방문완료|미완료)\]\s*$/.exec(line);
      if (match) {
        flush();
        const index = Number(match[1]) - 1;
        current = stops[index]?.name === match[2] ? stops[index] : null;
        collecting = false; buffer = [];
        if (!current) skipped++;
        continue;
      }
      if (!current) continue;
      if (line.startsWith("현장메모:")) {
        collecting = true; buffer = [line.slice(5).trim()];
      } else if (line.startsWith("사진:")) {
        collecting = false;
      } else if (collecting) {
        buffer.push(line);
      }
    }
    flush();
    return { found, skipped };
  }
  root.TripHandoff = { addressPart, photoMatch, photoNumber, memoText, readMemo };
})(window);