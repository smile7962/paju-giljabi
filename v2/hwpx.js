/* 출장ON AI | original HWPX report template fill
 * User picks the genuine .hwpx on this PC. Only Contents/section0.xml changes.
 * Other package entries including header/styles remain from the ORIGINAL file.
 * Photos are NOT embedded in HWPX; attach separately in Onnara.
 */
(function (root) {
  "use strict";
  const NS = "http://www.hancom.co.kr/hwpml/2011/paragraph";
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
  function fillOriginal(xml, data) {
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
    const date = oneLine(data.date).replace(/-/g, ". ");
    const dateTime = oneLine(data.visitTime) || date;
    const reportDate = oneLine(data.reportDate).replace(/-/g, ". ");
    const purpose = mustFit(oneLine(data.purpose), "출장목적", 130);
    const notes = mustFit(oneLine(data.check), "현장 확인내용", 1100);
    const actions = mustFit(oneLine(data.action), "조치사항", 1000);

    // Top approval/header table. Never replace rows, cell geometry, font styles, or header.xml.
    fillCell(header, 0, 1, oneLine(data.docNumber));
    fillCell(header, 4, 1, reportDate);
    fillCell(header, 7, 4, oneLine(data.traveler));

    // Body table: preserve source paragraph positions.
    fillCell(body, 1, 0, (oneLine(data.reference) ? oneLine(data.reference) + " " : "") + "명에 의거 『");
    fillCell(body, 1, 1, purpose);
    const pp = paragraphs(cell(body, 3, 0));
    if (pp.length < 10) throw Error("원본 HWPX 개요 항목 배열이 예상과 다릅니다.");
    fillParagraph(pp[1], "  ㅇ 일시: " + dateTime);
    fillParagraph(pp[2], "  ㅇ 장소: " + oneLine(data.address));
    fillParagraph(pp[3], "  ㅇ 참석: " + oneLine(data.attendees));
    fillParagraph(pp[5], "    - " + notes);
    fillParagraph(pp[6], "    - " + (actions ? "조치사항: " + actions : ""));
    // Keep remaining original blank bullet and "붙임 현장사진 1부" untouched.
    // Photo annex must be attached separately. Never imply file embeds photos.
    const output = new XMLSerializer().serializeToString(dom);
    const check = new DOMParser().parseFromString(output, "application/xml");
    if (check.getElementsByTagName("parsererror").length) {
      throw Error("작성한 HWPX XML 확인에 실패했습니다.");
    }
    return output;
  }
  async function generate(file, data) {
    if (typeof JSZip === "undefined") {
      throw Error("HWPX 편집 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인하세요.");
    }
    if (!file || !/\.hwpx$/i.test(file.name) || file.size > 20 * 1024 * 1024) {
      throw Error("20MB 이하의 원본 .hwpx 파일을 선택하세요.");
    }
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    if (!zip.file("mimetype") || !zip.file("Contents/section0.xml")) {
      throw Error("HWPX 파일의 필수 구성요소를 찾을 수 없습니다.");
    }
    const mime = (await zip.file("mimetype").async("string")).trim();
    if (mime !== "application/hwp+zip") throw Error("정상적인 HWPX 원본 파일이 아닙니다.");
    const original = await zip.file("Contents/section0.xml").async("string");
    zip.file("Contents/section0.xml", fillOriginal(original, data), { compression: "DEFLATE" });
    // HWPX spec: mimetype first and stored uncompressed (JSZip retains imported entry order).
    zip.file("mimetype", mime, { compression: "STORE" });
    return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 }, mimeType: "application/hwp+zip" });
  }
  root.TripHwpx = { generate, fillOriginal };
})(window);