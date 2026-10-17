/* 출장ON AI v0.8 · original HWPX photo annex
 * Only appends HWPX image paragraphs and a matching BinData/manifest entry.
 * Does not change the user's existing approval table, text styles or report body.
 * Two wide photo cards per attachment page; each card is a 3-row bordered HWPX table.
 * No upload/network/LLM call. Hancom rendering requires verification.
 */
(function (root) {
  "use strict";
  const HP = "http://www.hancom.co.kr/hwpml/2011/paragraph";
  const HC = "http://www.hancom.co.kr/hwpml/2011/core";
  const OPF = "http://www.idpf.org/2007/opf/";
  const HH = "http://www.hancom.co.kr/hwpml/2011/head";
  const LIMIT = 12;

  function xml(input) {
    const doc = new DOMParser().parseFromString(input, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw Error("HWPX XML 파싱 실패");
    return doc;
  }
  function node(doc, tag, parent, attrs = {}) {
    const ns = tag.startsWith("hc:") ? HC : tag.startsWith("opf:") ? OPF : tag.startsWith("hh:") ? HH : HP;
    const el = doc.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    parent?.appendChild(el);
    return el;
  }
  function dimensions(w, h) {
    if (!(w > 0 && h > 0)) throw Error("사진 크기를 읽을 수 없습니다.");
    // HWP unit 7200/in. Wide three-row cards: image max 171 mm x 86 mm.
    // Centered, proportional fit: never crop or stretch a field photo.
    const scale = Math.min(48500 / w, 24500 / h);
    return { w: Math.max(1000, Math.round(w * scale)), h: Math.max(1000, Math.round(h * scale)) };
  }
  function safeCaption(value) {
    return String(value || "현장사진").replace(/[\r\n]+/g, " ").trim().slice(0, 100);
  }
  function para(doc, section, words, opts = {}) {
    const p = node(doc, "hp:p", section, {
      id: String(opts.id || 0), paraPrIDRef: String(opts.paraPr || 15),
      styleIDRef: "0", pageBreak: opts.pageBreak ? "1" : "0",
      columnBreak: "0", merged: "0"
    });
    const run = node(doc, "hp:run", p, { charPrIDRef: String(opts.charPr || 8) });
    if (words) node(doc, "hp:t", run).textContent = words;
    return run;
  }
  function picture(doc, parent, id, w, h, seq) {
    const pic = node(doc, "hp:pic", parent, {
      id: 770000 + seq, zOrder: 0, numberingType: "PICTURE",
      textWrap: "TOP_AND_BOTTOM", textFlow: "BOTH_SIDES",
      lock: 0, dropcapstyle: "None", href: "", groupLevel: 0,
      instid: 9900000 + seq, reverse: 0
    });
    node(doc, "hp:offset", pic, { x: 0, y: 0 });
    node(doc, "hp:orgSz", pic, { width: w, height: h });
    node(doc, "hp:curSz", pic, { width: w, height: h });
    node(doc, "hp:flip", pic, { horizontal: 0, vertical: 0 });
    node(doc, "hp:rotationInfo", pic, {
      angle: 0, centerX: Math.floor(w / 2), centerY: Math.floor(h / 2), rotateimage: 0
    });
    const rendering = node(doc, "hp:renderingInfo", pic);
    for (const kind of ["transMatrix", "scaMatrix", "rotMatrix"]) {
      node(doc, "hc:" + kind, rendering, { e1: 1, e2: 0, e3: 0, e4: 0, e5: 1, e6: 0 });
    }
    node(doc, "hc:img", pic, { binaryItemIDRef: id, bright: 0, contrast: 0, effect: "REAL_PIC", alpha: 0 });
    const rect = node(doc, "hp:imgRect", pic);
    for (const [tag, x, y] of [["pt0", 0, 0], ["pt1", w, 0], ["pt2", w, h], ["pt3", 0, h]]) {
      node(doc, "hc:" + tag, rect, { x, y });
    }
    node(doc, "hp:imgClip", pic, { left: 0, right: w, top: 0, bottom: h });
    node(doc, "hp:inMargin", pic, { left: 0, right: 0, top: 0, bottom: 0 });
    node(doc, "hp:imgDim", pic, { dimwidth: w, dimheight: h });
    node(doc, "hp:effects", pic);
    node(doc, "hp:sz", pic, {
      width: w, widthRelTo: "ABSOLUTE", height: h, heightRelTo: "ABSOLUTE", protect: 0
    });
    node(doc, "hp:pos", pic, {
      treatAsChar: 1, affectLSpacing: 0, flowWithText: 1, allowOverlap: 0,
      holdAnchorAndSO: 0, vertRelTo: "PARA", horzRelTo: "COLUMN",
      vertAlign: "TOP", horzAlign: "CENTER", vertOffset: 0, horzOffset: 0
    });
    node(doc, "hp:outMargin", pic, { left: 0, right: 0, top: 0, bottom: 0 });
    node(doc, "hp:t", parent); // Critical: an empty text element AFTER picture
  }
  // Add styles without changing any original format definitions.
  // The provided template has no shaded cells; the heading and grey title row
  // need new style IDs appended to header.xml, not edits to old styles.
  async function annexStyles(zip) {
    const raw = zip.file("Contents/header.xml");
    if (!raw) throw Error("원본 HWPX의 header.xml을 찾을 수 없습니다.");
    const doc = xml(await raw.async("string"));
    const fills = doc.getElementsByTagNameNS(HH, "borderFills")[0];
    const chars = doc.getElementsByTagNameNS(HH, "charProperties")[0];
    if (!fills || !chars) throw Error("원본 HWPX 글꼴·테두리 서식 구조를 확인할 수 없습니다.");
    const fillItems = Array.from(fills.getElementsByTagNameNS(HH, "borderFill"));
    const charItems = Array.from(chars.getElementsByTagNameNS(HH, "charPr"));
    const borderSource = fillItems.find(e => e.getAttribute("id") === "3");
    const charSource = charItems.find(e => e.getAttribute("id") === "8");
    if (!borderSource || !charSource) throw Error("원본 파주시 서식의 기본 사진 스타일이 변경되었습니다.");

    const greyBorderId = Math.max(...fillItems.map(x => Number(x.getAttribute("id")))) + 1;
    const greyBorder = borderSource.cloneNode(true);
    greyBorder.setAttribute("id", String(greyBorderId));
    const fill = node(doc, "hc:fillBrush", greyBorder);
    node(doc, "hc:winBrush", fill, {
      faceColor: "#E6E6E6", hatchColor: "#000000", alpha: 0
    });
    fills.appendChild(greyBorder);
    fills.setAttribute("itemCnt", String(fillItems.length + 1));

    const headingCharId = Math.max(...charItems.map(x => Number(x.getAttribute("id")))) + 1;
    const bold = charSource.cloneNode(true);
    bold.setAttribute("id", String(headingCharId));
    bold.setAttribute("height", "1400");
    const underline = Array.from(bold.children).find(x => x.localName === "underline");
    const boldNode = doc.createElementNS(HH, "hh:bold");
    if (underline) bold.insertBefore(boldNode, underline);
    else bold.appendChild(boldNode);
    chars.appendChild(bold);
    chars.setAttribute("itemCnt", String(charItems.length + 1));

    zip.file("Contents/header.xml", new XMLSerializer().serializeToString(doc), {
      compression: "DEFLATE"
    });
    return { greyBorderId, headingCharId };
  }

  /* One large 3-row table per photo:
   * shaded caption header / centered large photo / centered explanation.
   * A4 content width is ~51024 HWP units; 50000 leaves a safe margin.
   * Two cards each 32800 HWP units tall fit in the usable page height.
   */
  function photoCard(doc, section, photo, id, image, seq, count, styles) {
    const base = 910000 + seq * 10;
    const hostRun = para(doc, section, "", {
      id: base, paraPr: 14, charPr: 8
    });
    const tableWidth = 50000; // 176.4 mm, nearly fills the original A4 body width
    const rowSizes = [3100, 26600, 3100]; // heading + photo + caption
    const cardHeight = rowSizes.reduce((a, b) => a + b, 0);
    const table = node(doc, "hp:tbl", hostRun, {
      id: 850000 + seq, zOrder: 0, numberingType: "TABLE",
      textWrap: "TOP_AND_BOTTOM", textFlow: "BOTH_SIDES",
      lock: 0, dropcapstyle: "None", pageBreak: "NONE",
      repeatHeader: 0, rowCnt: 3, colCnt: 1,
      cellSpacing: 0, borderFillIDRef: 3, noAdjust: 1
    });
    node(doc, "hp:sz", table, {
      width: tableWidth, widthRelTo: "ABSOLUTE",
      height: cardHeight, heightRelTo: "ABSOLUTE", protect: 0
    });
    node(doc, "hp:pos", table, {
      treatAsChar: 1, affectLSpacing: 0,
      flowWithText: 1, allowOverlap: 0, holdAnchorAndSO: 1,
      vertRelTo: "PARA", horzRelTo: "COLUMN",
      vertAlign: "TOP", horzAlign: "CENTER",
      vertOffset: 0, horzOffset: 0
    });
    node(doc, "hp:outMargin", table, { left: 0, right: 0, top: 0, bottom: 0 });
    node(doc, "hp:inMargin", table, { left: 0, right: 0, top: 0, bottom: 0 });

    function addRow(index, borderID, align, content) {
      const row = node(doc, "hp:tr", table);
      const cell = node(doc, "hp:tc", row, {
        name: "", header: 0, hasMargin: 1, protect: 0,
        editable: 1, dirty: 0, borderFillIDRef: borderID
      });
      const sub = node(doc, "hp:subList", cell, {
        id: "", textDirection: "HORIZONTAL", lineWrap: "BREAK",
        vertAlign: "CENTER", linkListIDRef: 0, linkListNextIDRef: 0,
        textWidth: 0, textHeight: 0, hasTextRef: 0, hasNumRef: 0
      });
      content(sub);
      node(doc, "hp:cellAddr", cell, { colAddr: 0, rowAddr: index });
      node(doc, "hp:cellSpan", cell, { colSpan: 1, rowSpan: 1 });
      node(doc, "hp:cellSz", cell, { width: tableWidth, height: rowSizes[index] });
      node(doc, "hp:cellMargin", cell, {
        left: 180, right: 180,
        top: index === 1 ? 100 : 160,
        bottom: index === 1 ? 100 : 160
      });
    }
    const visit = String(photo.visitName || "").trim()
      .replace(/^경기도\s*파주시\s*/, "").slice(0, 75);
    addRow(0, styles.greyBorderId, "CENTER", sub => {
      para(doc, sub, (visit ? visit + "  ·  " : "") +
        "현장사진 " + seq + "/" + count,
        { id: base + 1, paraPr: 14, charPr: 8 });
    });
    addRow(1, 3, "CENTER", sub => {
      const imageRun = para(doc, sub, "", {
        id: base + 2, paraPr: 14, charPr: 8
      });
      picture(doc, imageRun, id, image.w, image.h, seq);
    });
    addRow(2, 3, "CENTER", sub => {
      para(doc, sub, safeCaption(photo.caption), {
        id: base + 3, paraPr: 14, charPr: 8
      });
    });
    node(doc, "hp:t", hostRun);
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob =>
      blob ? resolve(blob) : reject(Error("JPEG 변환에 실패했습니다.")), "image/jpeg", 0.8));
  }
  async function jpg(item) {
    // A photo arriving through an email app can retain a correct .jpg/.png
    // filename yet have an empty/generic MIME type. Check real file bytes.
    const file = item?.blob;
    if (!file || typeof file.arrayBuffer !== "function" ||
        !Number.isFinite(file.size) || file.size === 0 || file.size > 25 * 1024 * 1024) {
      throw Error("사진 파일을 읽을 수 없거나 크기 제한(25MB)을 초과했습니다.");
    }
    const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const jpeg = header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
    const png = [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => header[i] === b);
    const webp = String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...header.slice(8, 12)) === "WEBP";
    if (!jpeg && !png && !webp) {
      throw Error("실제 파일 형식이 JPEG/PNG/WEBP가 아닙니다. JPG로 변환 후 다시 선택하세요.");
    }
    let bitmap = null, picture = null, objectUrl = null;
    try {
      if (typeof createImageBitmap === "function") {
        try { bitmap = await createImageBitmap(file); }
        catch (_) { /* Fallback to Image element */ }
      }
      if (!bitmap) {
        objectUrl = URL.createObjectURL(new Blob([file], {
          type: jpeg ? "image/jpeg" : png ? "image/png" : "image/webp"
        }));
        picture = new Image();
        picture.src = objectUrl;
        await picture.decode();
      }
      const width = bitmap ? bitmap.width : picture.naturalWidth;
      const height = bitmap ? bitmap.height : picture.naturalHeight;
      if (!width || !height) throw Error("사진 크기 판독 실패");
      const ratio = Math.min(1, 1600 / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("브라우저에서 이미지 캔버스를 사용할 수 없습니다.");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap || picture, 0, 0, canvas.width, canvas.height);
      return { blob: await canvasToBlob(canvas), ...dimensions(width, height) };
    } catch (error) {
      throw Error("사진 JPEG 변환 실패: " + (error.message || "지원되지 않는 이미지"));
    } finally {
      if (bitmap?.close) bitmap.close();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }

  async function embed(zip, filledSectionXml, selectedPhotos, onProgress = () => {}) {
    if (!Array.isArray(selectedPhotos) || selectedPhotos.length < 1 || selectedPhotos.length > LIMIT) {
      throw Error("사진 자동첨부는 한 출장지당 1~" + LIMIT + "장까지 지원합니다.");
    }
    const raw = zip.file("Contents/content.hpf");
    if (!raw) throw Error("원본 HWPX의 content.hpf가 없습니다.");
    const sectionDoc = xml(filledSectionXml);
    const section = sectionDoc.documentElement;
    if (section.localName !== "sec") throw Error("원본 section0.xml 형식이 올바르지 않습니다.");
    const packageDoc = xml(await raw.async("string"));
    const styles = await annexStyles(zip);
    const manifest = packageDoc.getElementsByTagNameNS(OPF, "manifest")[0];
    if (!manifest) throw Error("원본 HWPX 이미지 등록목록이 없습니다.");
    const used = new Set(Array.from(packageDoc.getElementsByTagNameNS(OPF, "item")).map(item => item.getAttribute("id")));
    for (let index = 0; index < selectedPhotos.length; index++) {
      const photo = selectedPhotos[index];
      const seq = index + 1;
      const id = "triponphoto" + seq;
      const path = "BinData/" + id + ".jpg";
      if (used.has(id) || zip.file(path)) throw Error("사진 ID가 원본 문서와 중복됩니다.");
      onProgress("사진 " + seq + "/" + selectedPhotos.length + " JPEG 변환 중: " + (photo.name || "현장사진"));
      let img;
      try { img = await jpg(photo); }
      catch (error) { throw Error((photo.name || "사진 " + seq) + ": " + error.message); }
      // Start a new annex page only before photos 1, 3, 5, ...
      // The second photo on each page flows into the available space.
      if (index % 2 === 0) {
        const pageFrom = seq;
        const pageTo = Math.min(seq + 1, selectedPhotos.length);
        para(sectionDoc, section,
          "[붙임] 현장사진",
          { id: 900000 + seq, pageBreak: true, paraPr: 15, charPr: styles.headingCharId }
        );
      }
      photoCard(sectionDoc, section, photo, id, img, seq, selectedPhotos.length, styles);
      node(packageDoc, "opf:item", manifest, {
        id, href: path, "media-type": "image/jpeg", isEmbeded: "1"
      });
      zip.file(path, new Uint8Array(await img.blob.arrayBuffer()), { compression: "DEFLATE" });
      used.add(id);
      onProgress("사진 " + seq + "/" + selectedPhotos.length + " HWPX 첨부 완료");
    }
    const sectionXml = new XMLSerializer().serializeToString(sectionDoc);
    const packageXml = new XMLSerializer().serializeToString(packageDoc);
    xml(sectionXml);
    xml(packageXml);
    zip.file("Contents/section0.xml", sectionXml, { compression: "DEFLATE" });
    zip.file("Contents/content.hpf", packageXml, { compression: "DEFLATE" });
    return selectedPhotos.length;
  }

  root.TripPhotos = { embed, LIMIT };
})(window);