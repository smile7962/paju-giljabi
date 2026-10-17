/* 출장ON AI | original HWPX report template fill
 * User picks the genuine .hwpx on this PC. Only Contents/section0.xml changes.
 * Clear only the two pre-filled red HEADER values (3년/건축신고3팀장).
 * All other Onnara labels, cells, geometry and styles remain unchanged.
 * Other package entries including header/styles remain from the ORIGINAL file.
 * Optional image annex is appended after original report without editing source layout.
 */
(function (root) {
  "use strict";
  const NS = "http://www.hancom.co.kr/hwpml/2011/paragraph";
  const HH = "http://www.hancom.co.kr/hwpml/2011/head";
  const children = (node, local) =>
    Array.from(node?.children || []).filter(child => child.localName === local);
  const first = (node, local) => children(node, local)[0] || null;
  const rows = table => children(table, "tr");

  function cell(table, rowNumber, colNumber) {
    const row = rows(table)[rowNumber];
    if (!row) throw Error("HWPX 표 행 구조가 원본과 다릅니다.");
    const matched = children(row, "tc").find(tc => {
      const addr = first(tc, "cellAddr");
      return Number(addr?.getAttribute("colAddr")) === colNumber;
    });
    if (!matched) throw Error("HWPX 표 셀 구조가 원본과 다릅니다.");
    return matched;
  }
  function paragraphs(tc) {
    const sub = first(tc, "subList");
    return children(sub, "p");
  }
  function content(tc) {
    return paragraphs(tc).flatMap(p => Array.from(p.getElementsByTagNameNS("*", "t")))
      .map(t => t.textContent || "").join("");
  }
  function fillParagraph(paragraph, value) {
    if (!paragraph) throw Error("HWPX 본문 항목을 찾지 못했습니다.");
    const run = first(paragraph, "run");
    if (!run) throw Error("HWPX 문단 서식이 원본과 다릅니다.");
    let t = first(run, "t");
    if (!t) {
      t = paragraph.ownerDocument.createElementNS(NS, "hp:t");
      run.appendChild(t);
    }
    t.textContent = value;
  }
  function fillCell(table, row, col, value) {
    const p = paragraphs(cell(table, row, col))[0];
    fillParagraph(p, value);
  }
  function oneLine(value) {
    return String(value || "").replace(/\s*\r?\n\s*/g, " / ").trim();
  }
  function mustFit(value, label, max) {
    if (value.length > max) {
      throw Error(label + "이(가) 원본 서식에서 너무 깁니다. (" + value.length + "자 / 권장 " + max + "자)");
    }
    return value;
  }
  // Clone the ORIGINAL purpose paragraph style and change alignment only.
  // Existing centered style 14 uses a slightly different line spacing (161%
  // vs. the purpose cell's 160%), so a dedicated clone preserves typography.
  async function addCenteredPurposeStyle(zip) {
    const headerFile = zip.file("Contents/header.xml");
    if (!headerFile) throw Error("원본 HWPX의 문단 서식 정보를 찾지 못했습니다.");
    const dom = new DOMParser().parseFromString(await headerFile.async("string"), "application/xml");
    if (dom.getElementsByTagName("parsererror").length) throw Error("HWPX 문단 서식 XML 오류");
    const list = dom.getElementsByTagNameNS(HH, "paraProperties")[0];
    if (!list) throw Error("HWPX 문단 서식 목록을 찾지 못했습니다.");
    const entries = Array.from(list.getElementsByTagNameNS(HH, "paraPr"));
    const source = entries.find(item => item.getAttribute("id") === "1");
    if (!source) throw Error("원본 출장목적 문단 서식을 찾지 못했습니다.");
    const id = Math.max(...entries.map(item => Number(item.getAttribute("id")))) + 1;
    const centered = source.cloneNode(true);
    centered.setAttribute("id", String(id));
    const align = centered.getElementsByTagNameNS(HH, "align")[0];
    if (!align) throw Error("출장목적 문단 정렬 속성을 찾지 못했습니다.");
    align.setAttribute("horizontal", "CENTER");
    list.appendChild(centered);
    list.setAttribute("itemCnt", String(entries.length + 1));
    zip.file("Contents/header.xml", new XMLSerializer().serializeToString(dom), { compression: "DEFLATE" });
    return id;
  }
  function fillOriginal(xml, data, purposeStyleId = 14) {
    const dom = new DOMParser().parseFromString(xml, "application/xml");
    if (dom.getElementsByTagName("parsererror").length) {
      throw Error("HWPX 원본 XML을 읽지 못했습니다.");
    }
    const tables = Array.from(dom.getElementsByTagNameNS("*", "tbl"));
    if (tables.length !== 2 ||
        !content(cell(tables[0], 0, 0)).includes("문서번호") ||
        !content(cell(tables[1], 0, 0)).includes("출장결과보고서") ||
        !content(cell(tables[1], 3, 0)).includes("ㅇ 일시:")) {
      throw Error("제공된 파주시 출장결과보고서 원본 서식과 구조가 다릅니다. 원본 파일을 선택하세요.");
    }
    const header = tables[0], body = tables[1];
    // Reject a previous filled report used accidentally as the template.
    // Onnara fields must start blank and remain entirely untouched.
    for (const [row, col] of [[0, 1], [4, 1], [7, 4]]) {
      if (content(cell(header, row, col)).trim()) {
        throw Error("온나라 입력란이 이미 작성된 파일입니다. 빈 원본 출장결과보고서.hwpx를 선택하세요.");
      }
    }
    // The source template itself includes two RED pre-filled sample values.
    // Onnara supplies them when registering the document, so leave only
    // these two VALUE cells blank; retain all labels and table formatting.
    // Clear only the preset VALUES in the known header positions, even if
    // the team name or retention label later changes in the supplied form.
    fillCell(header, 0, 3, ""); // red team-lead sample text
    fillCell(header, 1, 1, ""); // red preservation-term sample text
    const date = oneLine(data.date).replace(/-/g, ". ");
    const dateTime = oneLine(data.visitTime) || date;
    const purpose = mustFit(oneLine(data.purpose), "출장목적", 130);
    const notes = mustFit(oneLine(data.check), "현장 확인내용", 1100);
    const actions = mustFit(oneLine(data.action), "조치사항", 1000);

    // The FIRST TABLE is Onnara-owned: doc no, retention period,
    // reporting/approval dates, disclosure, signer and approval stamps.
    // Never modify it. Also preserve the BLACK introductory text verbatim.
    fillCell(body, 1, 1, purpose);
    // Only center the red purpose text between the black fixed phrases.
    // Keep its original red character style, cell size and every other value.
    const purposeParagraph = paragraphs(cell(body, 1, 1))[0];
    if (!purposeParagraph) throw Error("출장목적 입력 문단을 찾지 못했습니다.");
    purposeParagraph.setAttribute("paraPrIDRef", String(purposeStyleId));
    const pp = paragraphs(cell(body, 3, 0));
    if (pp.length < 10 ||
        !content(cell(body, 3, 0)).includes("ㅇ 내용") ||
        !content(cell(body, 1, 0)).includes("명에 의거 『")) {
      throw Error("원본 출장결과보고서 본문 구조가 예상과 다릅니다.");
    }
    // Fixed red labels (개요/일시/장소/참석/내용) keep their original format.
    // Change only the variable text belonging to the report body.
    fillParagraph(pp[1], "  ㅇ 일시: " + dateTime);
    fillParagraph(pp[2], "  ㅇ 장소: " + oneLine(data.address));
    fillParagraph(pp[3], "  ㅇ 참석: " + oneLine(data.attendees));
    fillParagraph(pp[5], "    - " + notes);
    if (actions) fillParagraph(pp[6], "    - 조치사항: " + actions);
    // Keep unused bullet lines and "붙임 현장사진 1부" unchanged.
    // The optional photo annex is added separately AFTER the source report.
    const output = new XMLSerializer().serializeToString(dom);
    const check = new DOMParser().parseFromString(output, "application/xml");
    if (check.getElementsByTagName("parsererror").length) {
      throw Error("작성한 HWPX XML 확인에 실패했습니다.");
    }
    return output;
  }
  async function generate(file, data, photoRecords = [], onProgress = () => {}) {
    if (typeof JSZip === "undefined") {
      throw Error("HWPX 편집 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    }
    if (!file || !/\.hwpx$/i.test(file.name) || file.size > 20 * 1024 * 1024) {
      throw Error("20MB 이하의 원본 .hwpx 파일을 선택하세요.");
    }
    onProgress("원본 HWPX 확인 중…");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    if (!zip.file("mimetype") || !zip.file("Contents/section0.xml")) {
      throw Error("HWPX 파일의 필수 구성요소를 찾을 수 없습니다.");
    }
    const mime = (await zip.file("mimetype").async("string")).trim();
    if (mime !== "application/hwp+zip") throw Error("정상적인 HWPX 원본 파일이 아닙니다.");
    const original = await zip.file("Contents/section0.xml").async("string");
    const purposeStyleId = await addCenteredPurposeStyle(zip);
    const filled = fillOriginal(original, data, purposeStyleId);
    onProgress("출장결과보고서 본문 작성 완료");
    if (photoRecords.length > 0) {
      if (!root.TripPhotos) throw Error("현장사진 HWPX 모듈을 불러오지 못했습니다.");
      await root.TripPhotos.embed(zip, filled, photoRecords, onProgress);
    } else {
      zip.file("Contents/section0.xml", filled, { compression: "DEFLATE" });
    }
    // HWPX spec: mimetype first and stored uncompressed (JSZip retains imported entry order).
    zip.file("mimetype", mime, { compression: "STORE" });
    onProgress("HWPX 파일 압축·생성 중…");
    const generated = await zip.generateAsync({
      type: "blob", compression: "DEFLATE",
      compressionOptions: { level: 6 }, mimeType: "application/hwp+zip"
    });
    if (!generated || !generated.size) throw Error("생성된 HWPX 데이터가 비어 있습니다.");
    onProgress("HWPX 생성 완료 · " + Math.ceil(generated.size / 1024) + "KB");
    return generated;
  }
  root.TripHwpx = { generate, fillOriginal };
})(window);