/* 출장ON AI v0.8 · original HWPX photo annex
 * Only appends HWPX image paragraphs and a matching BinData/manifest entry.
 * Does not change the user's existing approval table, text styles or report body.
 * 1 photo/page; no upload/network/LLM call. First release requires Hancom validation.
 */
(function (root) {
  "use strict";
  const HP = "http://www.hancom.co.kr/hwpml/2011/paragraph";
  const HC = "http://www.hancom.co.kr/hwpml/2011/core";
  const OPF = "http://www.idpf.org/2007/opf/";
  const LIMIT = 12;

  function xml(input) {
    const doc = new DOMParser().parseFromString(input, "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw Error("HWPX XML 파싱 실패");
    return doc;
  }
  function node(doc, tag, parent, attrs = {}) {
    const ns = tag.startsWith("hc:") ? HC : tag.startsWith("opf:") ? OPF : HP;
    const el = doc.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    parent?.appendChild(el);
    return el;
  }
  function dimensions(w, h) {
    if (!(w > 0 && h > 0)) throw Error("사진 크기를 읽을 수 없습니다.");
    // HWP unit 7200/in: 150 mm wide, 150 mm high maximum; keep aspect ratio.
    const scale = Math.min(42520 / w, 42520 / h);
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
  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => canvas.toBlob(blob =>
      blob ? resolve(blob) : reject(Error("JPEG 변환에 실패했습니다.")), "image/jpeg", 0.8));
  }
  async function jpg(item) {
    const file = item.blob;
    if (!(file instanceof Blob) || file.size > 25 * 1024 * 1024 ||
        !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      throw Error("HWPX 사진은 JPG·PNG·WEBP 형식, 장당 25MB 이하만 지원합니다.");
    }
    let bitmap = null, image = null, url = null;
    try {
      if (typeof createImageBitmap === "function") {
        try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
        catch (_) { /* Browser may not support ImageBitmap options */ }
      }
      if (!bitmap) {
        url = URL.createObjectURL(file);
        image = new Image();
        image.src = url;
        await image.decode();
      }
      const w = bitmap ? bitmap.width : image.naturalWidth;
      const h = bitmap ? bitmap.height : image.naturalHeight;
      if (!w || !h) throw Error("사진 크기를 읽을 수 없습니다.");
      const ratio = Math.min(1, 1600 / Math.max(w, h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(w * ratio));
      canvas.height = Math.max(1, Math.round(h * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error("사진 압축을 지원하지 않는 브라우저입니다.");
      ctx.fillStyle = "#fff"; // white matte for transparent PNG/WebP
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap || image, 0, 0, canvas.width, canvas.height);
      return { blob: await canvasToBlob(canvas), ...dimensions(w, h) };
    } finally {
      if (bitmap) bitmap.close();
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function embed(zip, filledSectionXml, selectedPhotos) {
    if (!Array.isArray(selectedPhotos) || selectedPhotos.length < 1 || selectedPhotos.length > LIMIT) {
      throw Error("사진 자동첨부는 한 출장지당 1~" + LIMIT + "장까지 지원합니다.");
    }
    const raw = zip.file("Contents/content.hpf");
    if (!raw) throw Error("원본 HWPX의 content.hpf가 없습니다.");
    const sectionDoc = xml(filledSectionXml);
    const section = sectionDoc.documentElement;
    if (section.localName !== "sec") throw Error("원본 section0.xml 형식이 올바르지 않습니다.");
    const packageDoc = xml(await raw.async("string"));
    const manifest = packageDoc.getElementsByTagNameNS(OPF, "manifest")[0];
    if (!manifest) throw Error("원본 HWPX 이미지 등록목록이 없습니다.");
    const used = new Set(Array.from(packageDoc.getElementsByTagNameNS(OPF, "item")).map(item => item.getAttribute("id")));
    for (let index = 0; index < selectedPhotos.length; index++) {
      const photo = selectedPhotos[index];
      const seq = index + 1;
      const id = "triponphoto" + seq;
      const path = "BinData/" + id + ".jpg";
      if (used.has(id) || zip.file(path)) throw Error("사진 ID가 원본 문서와 중복됩니다.");
      const img = await jpg(photo);
      const caption = safeCaption(photo.caption);
      para(sectionDoc, section, "붙임 · 현장사진 " + seq + "/" + selectedPhotos.length, { id: 880000 + seq * 3, pageBreak: true, paraPr: 15, charPr: 8 });
      para(sectionDoc, section, caption, { id: 880001 + seq * 3, paraPr: 15, charPr: 8 });
      const run = para(sectionDoc, section, "", { id: 880002 + seq * 3, paraPr: 15, charPr: 8 });
      picture(sectionDoc, run, id, img.w, img.h, seq);
      node(packageDoc, "opf:item", manifest, {
        id, href: path, "media-type": "image/jpeg", isEmbeded: "1"
      });
      zip.file(path, new Uint8Array(await img.blob.arrayBuffer()), { compression: "DEFLATE" });
      used.add(id);
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