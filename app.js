const { PDFDocument } = PDFLib;

const PRESET = Object.freeze({
  totalWidth: 12.761,
  totalHeight: 9.25,
  trimWidth: 6,
  trimHeight: 9,
  spineWidth: 0.511,
  bleed: 0.125,
  spineMarginX: 0.062,
  spineMarginY: 0.062,
  barcodeMargin: 0.25,
  dpi: 300
});

const els = {
  imageInput: document.getElementById("imageInput"),
  totalWidth: document.getElementById("totalWidth"),
  totalHeight: document.getElementById("totalHeight"),
  trimWidth: document.getElementById("trimWidth"),
  trimHeight: document.getElementById("trimHeight"),
  spineWidth: document.getElementById("spineWidth"),
  bleed: document.getElementById("bleed"),
  spineMarginX: document.getElementById("spineMarginX"),
  spineMarginY: document.getElementById("spineMarginY"),
  barcodeMargin: document.getElementById("barcodeMargin"),
  dpi: document.getElementById("dpi"),
  lockPreset: document.getElementById("lockPreset"),
  showGuides: document.getElementById("showGuides"),
  showBarcodeBox: document.getElementById("showBarcodeBox"),
  includeGuidesInExport: document.getElementById("includeGuidesInExport"),
  fillBackground: document.getElementById("fillBackground"),
  softProofCmyk: document.getElementById("softProofCmyk"),
  fitButton: document.getElementById("fitButton"),
  centerSpineButton: document.getElementById("centerSpineButton"),
  zoomOutButton: document.getElementById("zoomOutButton"),
  zoomInButton: document.getElementById("zoomInButton"),
  nudgeLeftButton: document.getElementById("nudgeLeftButton"),
  nudgeRightButton: document.getElementById("nudgeRightButton"),
  nudgeUpButton: document.getElementById("nudgeUpButton"),
  nudgeDownButton: document.getElementById("nudgeDownButton"),
  copySelectionButton: document.getElementById("copySelectionButton"),
  pasteSelectionButton: document.getElementById("pasteSelectionButton"),
  deleteActiveButton: document.getElementById("deleteActiveButton"),
  exportPngButton: document.getElementById("exportPngButton"),
  exportPdfButton: document.getElementById("exportPdfButton"),
  exportPrintPdfButton: document.getElementById("exportPrintPdfButton"),
  pxWidth: document.getElementById("pxWidth"),
  pxHeight: document.getElementById("pxHeight"),
  ptWidth: document.getElementById("ptWidth"),
  ptHeight: document.getElementById("ptHeight"),
  status: document.getElementById("status"),
  canvas: document.getElementById("previewCanvas")
};

const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

let loadedImage = null;
let imageState = { x: 0, y: 0, width: 0, height: 0 };

let dragging = false;
let dragMode = null;
let activeHandle = null;

let dragStart = {
  x: 0,
  y: 0,
  imgX: 0,
  imgY: 0,
  overlayX: 0,
  overlayY: 0,
  overlayW: 0,
  overlayH: 0
};

let selectionRect = null;
let clipboardSelection = null;
let overlays = [];
let activeOverlayId = null;
let nextOverlayId = 1;

function inchesToPx(inches, dpi) {
  return Math.round(inches * dpi);
}

function inchesToPt(inches) {
  return inches * 72;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function getConfig() {
  return {
    totalWidth: parseFloat(els.totalWidth.value),
    totalHeight: parseFloat(els.totalHeight.value),
    trimWidth: parseFloat(els.trimWidth.value),
    trimHeight: parseFloat(els.trimHeight.value),
    spineWidth: parseFloat(els.spineWidth.value),
    bleed: parseFloat(els.bleed.value),
    spineMarginX: parseFloat(els.spineMarginX.value),
    spineMarginY: parseFloat(els.spineMarginY.value),
    barcodeMargin: parseFloat(els.barcodeMargin.value),
    dpi: parseInt(els.dpi.value, 10),
    lockPreset: els.lockPreset.checked,
    showGuides: els.showGuides.checked,
    showBarcodeBox: els.showBarcodeBox.checked,
    includeGuidesInExport: els.includeGuidesInExport.checked,
    fillBackground: els.fillBackground.checked,
    softProofCmyk: els.softProofCmyk.checked
  };
}

function applyPresetLock() {
  const locked = els.lockPreset.checked;
  const keys = [
    "totalWidth",
    "totalHeight",
    "trimWidth",
    "trimHeight",
    "spineWidth",
    "bleed",
    "spineMarginX",
    "spineMarginY",
    "barcodeMargin",
    "dpi"
  ];

  for (const key of keys) {
    els[key].disabled = locked;
    if (locked) els[key].value = PRESET[key];
  }

  drawPreview();
}

function validateConfig(cfg) {
  const issues = [];
  const expectedWidth = cfg.bleed + cfg.trimWidth + cfg.spineWidth + cfg.trimWidth + cfg.bleed;
  const expectedHeight = cfg.bleed + cfg.trimHeight + cfg.bleed;

  if (Math.abs(expectedWidth - cfg.totalWidth) > 0.005) {
    issues.push(`Full width mismatch. Expected ${expectedWidth.toFixed(3)} in.`);
  }

  if (Math.abs(expectedHeight - cfg.totalHeight) > 0.005) {
    issues.push(`Full height mismatch. Expected ${expectedHeight.toFixed(3)} in.`);
  }

  if (cfg.dpi < 300) {
    issues.push("300 DPI is recommended.");
  }

  const checks = [
    cfg.totalWidth,
    cfg.totalHeight,
    cfg.trimWidth,
    cfg.trimHeight,
    cfg.spineWidth,
    cfg.bleed
  ];

  if (checks.some((v) => !isFinite(v) || v <= 0)) {
    issues.push("All measurements must be positive numbers.");
  }

  if (cfg.spineMarginX * 2 >= cfg.spineWidth) {
    issues.push("Spine side margins are too large for the current spine width.");
  }

  return issues;
}

function getLayout(cfg) {
  const px = (v) => v * cfg.dpi;
  const trimTop = px(cfg.bleed);
  const trimBottom = trimTop + px(cfg.trimHeight);

  const backX = px(cfg.bleed);
  const backW = px(cfg.trimWidth);

  const spineX = backX + backW;
  const spineW = px(cfg.spineWidth);

  const frontX = spineX + spineW;
  const frontW = px(cfg.trimWidth);

  const coverW = inchesToPx(cfg.totalWidth, cfg.dpi);
  const coverH = inchesToPx(cfg.totalHeight, cfg.dpi);

  return {
    coverW,
    coverH,
    trimTop,
    trimBottom,
    backX,
    backW,
    spineX,
    spineW,
    frontX,
    frontW,
    spineSafeX: spineX + px(cfg.spineMarginX),
    spineSafeY: trimTop + px(cfg.spineMarginY),
    spineSafeW: Math.max(0, spineW - px(cfg.spineMarginX * 2)),
    spineSafeH: Math.max(0, px(cfg.trimHeight - cfg.spineMarginY * 2))
  };
}

function updateCanvasSize() {
  const cfg = getConfig();
  const w = inchesToPx(cfg.totalWidth, cfg.dpi);
  const h = inchesToPx(cfg.totalHeight, cfg.dpi);

  const oldW = els.canvas.width || w;
  const oldH = els.canvas.height || h;

  const sx = oldW ? w / oldW : 1;
  const sy = oldH ? h / oldH : 1;

  if (loadedImage && oldW && oldH) {
    imageState.x *= sx;
    imageState.y *= sy;
    imageState.width *= sx;
    imageState.height *= sy;
  }

  overlays = overlays.map((ov) => ({
    ...ov,
    x: ov.x * sx,
    y: ov.y * sy,
    width: ov.width * sx,
    height: ov.height * sy
  }));

  if (selectionRect) {
    selectionRect = {
      x: selectionRect.x * sx,
      y: selectionRect.y * sy,
      width: selectionRect.width * sx,
      height: selectionRect.height * sy
    };
  }

  els.canvas.width = w;
  els.canvas.height = h;
  els.pxWidth.textContent = `${w} px`;
  els.pxHeight.textContent = `${h} px`;
  els.ptWidth.textContent = `${inchesToPt(cfg.totalWidth).toFixed(3)} pt`;
  els.ptHeight.textContent = `${inchesToPt(cfg.totalHeight).toFixed(3)} pt`;
}

function fitImageToCanvas() {
  if (!loadedImage) return;

  const scale = Math.min(
    els.canvas.width / loadedImage.width,
    els.canvas.height / loadedImage.height
  );

  imageState.width = loadedImage.width * scale;
  imageState.height = loadedImage.height * scale;
  imageState.x = (els.canvas.width - imageState.width) / 2;
  imageState.y = (els.canvas.height - imageState.height) / 2;

  drawPreview();
}

function centerImageOnSpine() {
  if (!loadedImage) return;

  const cfg = getConfig();
  const layout = getLayout(cfg);
  const spineCenter = layout.spineX + layout.spineW / 2;

  imageState.x = spineCenter - imageState.width / 2;
  imageState.y = (els.canvas.height - imageState.height) / 2;

  drawPreview();
}

function zoomImage(multiplier) {
  const active = getActiveOverlay();

  if (active) {
    const centerX = active.x + active.width / 2;
    const centerY = active.y + active.height / 2;

    active.width = Math.max(10, active.width * multiplier);
    active.height = Math.max(10, active.height * multiplier);
    active.x = centerX - active.width / 2;
    active.y = centerY - active.height / 2;

    drawPreview();
    return;
  }

  if (!loadedImage) return;

  const centerX = imageState.x + imageState.width / 2;
  const centerY = imageState.y + imageState.height / 2;

  imageState.width *= multiplier;
  imageState.height *= multiplier;
  imageState.x = centerX - imageState.width / 2;
  imageState.y = centerY - imageState.height / 2;

  drawPreview();
}

function nudge(dx, dy) {
  const active = getActiveOverlay();

  if (active) {
    active.x += dx;
    active.y += dy;
  } else if (loadedImage) {
    imageState.x += dx;
    imageState.y += dy;
  }

  drawPreview();
}

function getCanvasPoint(event) {
  const rect = els.canvas.getBoundingClientRect();
  const scaleX = els.canvas.width / rect.width;
  const scaleY = els.canvas.height / rect.height;

  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY
  };
}

function normalizeRect(rect) {
  const x = rect.width < 0 ? rect.x + rect.width : rect.x;
  const y = rect.height < 0 ? rect.y + rect.height : rect.y;

  return {
    x,
    y,
    width: Math.abs(rect.width),
    height: Math.abs(rect.height)
  };
}

function pointInRect(pt, rect) {
  return (
    pt.x >= rect.x &&
    pt.x <= rect.x + rect.width &&
    pt.y >= rect.y &&
    pt.y <= rect.y + rect.height
  );
}

function getActiveOverlay() {
  return overlays.find((ov) => ov.id === activeOverlayId) || null;
}

function getOverlayAtPoint(pt) {
  for (let i = overlays.length - 1; i >= 0; i--) {
    if (pointInRect(pt, overlays[i])) return overlays[i];
  }
  return null;
}

function getOverlayHandleAtPoint(pt, overlay) {
  const size = 16;

  const handles = [
    { name: "nw", x: overlay.x, y: overlay.y },
    { name: "ne", x: overlay.x + overlay.width, y: overlay.y },
    { name: "sw", x: overlay.x, y: overlay.y + overlay.height },
    { name: "se", x: overlay.x + overlay.width, y: overlay.y + overlay.height }
  ];

  for (const h of handles) {
    if (
      pt.x >= h.x - size &&
      pt.x <= h.x + size &&
      pt.y >= h.y - size &&
      pt.y <= h.y + size
    ) {
      return h.name;
    }
  }

  return null;
}

function createSelectionFromRect(rect) {
  if (!loadedImage) return false;

  const sel = normalizeRect(rect);

  if (sel.width < 5 || sel.height < 5) {
    return false;
  }

  const relX = (sel.x - imageState.x) / imageState.width;
  const relY = (sel.y - imageState.y) / imageState.height;
  const relW = sel.width / imageState.width;
  const relH = sel.height / imageState.height;

  const srcX = Math.round(relX * loadedImage.width);
  const srcY = Math.round(relY * loadedImage.height);
  const srcW = Math.round(relW * loadedImage.width);
  const srcH = Math.round(relH * loadedImage.height);

  const clippedX = clamp(srcX, 0, loadedImage.width);
  const clippedY = clamp(srcY, 0, loadedImage.height);
  const clippedW = clamp(srcW, 1, loadedImage.width - clippedX);
  const clippedH = clamp(srcH, 1, loadedImage.height - clippedY);

  const off = document.createElement("canvas");
  off.width = clippedW;
  off.height = clippedH;

  const offCtx = off.getContext("2d");
  offCtx.drawImage(
    loadedImage,
    clippedX,
    clippedY,
    clippedW,
    clippedH,
    0,
    0,
    clippedW,
    clippedH
  );

  clipboardSelection = {
    canvas: off,
    width: clippedW,
    height: clippedH
  };

  return true;
}

function pasteClipboardSelection() {
  if (!clipboardSelection) return false;

  const overlay = {
    id: nextOverlayId++,
    canvas: clipboardSelection.canvas,
    x: (els.canvas.width - clipboardSelection.width) / 2,
    y: (els.canvas.height - clipboardSelection.height) / 2,
    width: clipboardSelection.width,
    height: clipboardSelection.height
  };

  overlays.push(overlay);
  activeOverlayId = overlay.id;

  return true;
}

function deleteActiveOverlay() {
  if (activeOverlayId === null) return;

  overlays = overlays.filter((ov) => ov.id !== activeOverlayId);
  activeOverlayId = null;
  drawPreview();
}

function drawBarcodeArea(cfg, layout) {
  if (!cfg.showBarcodeBox) return;

  const px = (v) => v * cfg.dpi;
  const barcodeW = px(2);
  const barcodeH = px(1.2);
  const m = px(cfg.barcodeMargin);

  const x = layout.backX + layout.backW - m - barcodeW;
  const y = layout.trimBottom - m - barcodeH;

  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.fillRect(x, y, barcodeW, barcodeH);

  ctx.strokeStyle = "rgba(255,128,0,0.98)";
  ctx.lineWidth = Math.max(2, Math.round(cfg.dpi / 180));
  ctx.strokeRect(x, y, barcodeW, barcodeH);

  ctx.fillStyle = "rgba(255,128,0,0.98)";
  ctx.font = `${Math.max(18, Math.round(cfg.dpi / 15))}px Arial`;
  ctx.fillText("BARCODE KEEP CLEAR", x + 16, y + 28);
  ctx.restore();
}

function drawGuides(cfg, layout) {
  ctx.save();
  ctx.lineWidth = Math.max(2, Math.round(cfg.dpi / 180));

  ctx.strokeStyle = "rgba(255,0,0,0.92)";
  ctx.strokeRect(
    layout.backX,
    layout.trimTop,
    layout.backW,
    layout.trimBottom - layout.trimTop
  );
  ctx.strokeRect(
    layout.frontX,
    layout.trimTop,
    layout.frontW,
    layout.trimBottom - layout.trimTop
  );

  ctx.strokeStyle = "rgba(0,180,255,0.95)";
  ctx.strokeRect(
    layout.spineX,
    layout.trimTop,
    layout.spineW,
    layout.trimBottom - layout.trimTop
  );

  ctx.strokeStyle = "rgba(50,220,120,0.98)";
  ctx.strokeRect(
    layout.spineSafeX,
    layout.spineSafeY,
    layout.spineSafeW,
    layout.spineSafeH
  );

  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.beginPath();
  ctx.moveTo(layout.backX, 0);
  ctx.lineTo(layout.backX, layout.coverH);
  ctx.moveTo(layout.spineX, 0);
  ctx.lineTo(layout.spineX, layout.coverH);
  ctx.moveTo(layout.frontX, 0);
  ctx.lineTo(layout.frontX, layout.coverH);
  ctx.moveTo(layout.frontX + layout.frontW, 0);
  ctx.lineTo(layout.frontX + layout.frontW, layout.coverH);
  ctx.moveTo(0, layout.trimTop);
  ctx.lineTo(layout.coverW, layout.trimTop);
  ctx.moveTo(0, layout.trimBottom);
  ctx.lineTo(layout.coverW, layout.trimBottom);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(255,255,255,.96)";
  ctx.font = `${Math.max(18, Math.round(cfg.dpi / 12))}px Arial`;
  ctx.fillText("BACK", layout.backX + 18, layout.trimTop + 36);
  ctx.fillText("SPINE", layout.spineX + 18, layout.trimTop + 36);
  ctx.fillText("FRONT", layout.frontX + 18, layout.trimTop + 36);

  drawBarcodeArea(cfg, layout);
  ctx.restore();
}

function drawOverlays() {
  for (const ov of overlays) {
    ctx.drawImage(ov.canvas, ov.x, ov.y, ov.width, ov.height);
  }

  const active = getActiveOverlay();
  if (!active) return;

  ctx.save();
  ctx.strokeStyle = "rgba(96,165,250,0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 6]);
  ctx.strokeRect(active.x, active.y, active.width, active.height);
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(96,165,250,1)";
  const size = 12;

  const points = [
    [active.x, active.y],
    [active.x + active.width, active.y],
    [active.x, active.y + active.height],
    [active.x + active.width, active.y + active.height]
  ];

  for (const [x, y] of points) {
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  }

  ctx.restore();
}

function drawSelectionRect() {
  if (!selectionRect) return;

  const rect = normalizeRect(selectionRect);

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,0,0.95)";
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
  ctx.restore();
}

function applySoftProof() {
  const img = ctx.getImageData(0, 0, els.canvas.width, els.canvas.height);
  const d = img.data;

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;

    let c = 1 - r;
    let m = 1 - g;
    let y = 1 - b;
    let k = Math.min(c, m, y);

    if (k < 1) {
      c = (c - k) / (1 - k);
      m = (m - k) / (1 - k);
      y = (y - k) / (1 - k);
    } else {
      c = 0;
      m = 0;
      y = 0;
    }

    c = clamp(c * 0.92, 0, 1);
    m = clamp(m * 0.94, 0, 1);
    y = clamp(y * 0.90, 0, 1);
    k = clamp(k * 1.06, 0, 1);

    r = (1 - c) * (1 - k);
    g = (1 - m) * (1 - k);
    b = (1 - y) * (1 - k);

    d[i] = Math.round(r * 255);
    d[i + 1] = Math.round(g * 255);
    d[i + 2] = Math.round(b * 255);
  }

  ctx.putImageData(img, 0, 0);
}

function render(includeGuides = true) {
  const cfg = getConfig();
  const issues = validateConfig(cfg);

  updateCanvasSize();
  const layout = getLayout(cfg);

  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);

  if (cfg.fillBackground) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, els.canvas.width, els.canvas.height);
  }

  if (loadedImage) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      loadedImage,
      imageState.x,
      imageState.y,
      imageState.width,
      imageState.height
    );
  }

  drawOverlays();

  if (cfg.softProofCmyk) {
    applySoftProof();
  }

  if (cfg.showGuides && includeGuides) {
    drawGuides(cfg, layout);
  }

  drawSelectionRect();

  if (issues.length) {
    els.status.innerHTML = `<span class="warn">Warning:</span> ${issues.join(" ")}`;
  } else if (loadedImage) {
    const targetRatio = cfg.totalWidth / cfg.totalHeight;
    const imgRatio = loadedImage.width / loadedImage.height;
    const ratioDiff = Math.abs(targetRatio - imgRatio);

    const ratioMsg =
      ratioDiff > 0.01
        ? " The uploaded image ratio does not match the final wrap exactly, so some empty area may remain."
        : " Image ratio is close to the target.";

    const cmykMsg = cfg.softProofCmyk ? " CMYK soft-proof preview is ON." : "";
    const clipMsg = clipboardSelection
      ? " Selection copied. Use Paste or Ctrl+V."
      : " Drag on empty space to select. Use Copy or Ctrl+C, then Paste or Ctrl+V.";

    els.status.innerHTML = `<span class="good">Ready.</span> Exact export size is set.${ratioMsg}${cmykMsg} ${clipMsg}`;
  } else {
    els.status.textContent = "Waiting for an image.";
  }
}

function drawPreview() {
  render(true);
}

async function exportPdfBase(filename) {
  const cfg = getConfig();
  const issues = validateConfig(cfg);

  if (issues.length) {
    alert(issues.join("\n"));
    return;
  }

  if (!loadedImage) {
    alert("Please upload your full wrap image first.");
    return;
  }

  render(cfg.includeGuidesInExport);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([
    inchesToPt(cfg.totalWidth),
    inchesToPt(cfg.totalHeight)
  ]);

  const dataUrl = els.canvas.toDataURL("image/png");
  const imgBytes = await fetch(dataUrl).then((r) => r.arrayBuffer());
  const png = await pdfDoc.embedPng(imgBytes);

  page.drawImage(png, {
    x: 0,
    y: 0,
    width: inchesToPt(cfg.totalWidth),
    height: inchesToPt(cfg.totalHeight)
  });

  const pdfBytes = await pdfDoc.save();
  downloadBlob(new Blob([pdfBytes], { type: "application/pdf" }), filename);
  drawPreview();
}

async function exportPdf() {
  await exportPdfBase("kdp-paperback-cover.pdf");
}

async function exportPrintPdf() {
  await exportPdfBase("kdp-paperback-cover-flattened-print.pdf");
}

function exportPng() {
  const cfg = getConfig();
  const issues = validateConfig(cfg);

  if (issues.length) {
    alert(issues.join("\n"));
    return;
  }

  if (!loadedImage) {
    alert("Please upload your full wrap image first.");
    return;
  }

  render(cfg.includeGuidesInExport);

  els.canvas.toBlob((blob) => {
    if (blob) {
      downloadBlob(blob, "kdp-paperback-cover.png");
    }
    drawPreview();
  }, "image/png");
}

function enableButtons() {
  const ready = !!loadedImage;

  els.exportPngButton.disabled = !ready;
  els.exportPdfButton.disabled = !ready;
  els.exportPrintPdfButton.disabled = !ready;

  if (els.copySelectionButton) {
    els.copySelectionButton.disabled = !ready || !selectionRect;
  }

  if (els.pasteSelectionButton) {
    els.pasteSelectionButton.disabled = !clipboardSelection;
  }

  if (els.deleteActiveButton) {
    els.deleteActiveButton.disabled = activeOverlayId === null;
  }
}

function startSelection(pt) {
  selectionRect = { x: pt.x, y: pt.y, width: 0, height: 0 };
  activeOverlayId = null;
  dragMode = "select";
}

function startOverlayMove(pt, overlay) {
  activeOverlayId = overlay.id;
  dragMode = "overlay-move";
  dragStart = {
    x: pt.x,
    y: pt.y,
    overlayX: overlay.x,
    overlayY: overlay.y
  };
}

function startOverlayResize(pt, overlay, handle) {
  activeOverlayId = overlay.id;
  activeHandle = handle;
  dragMode = "overlay-resize";
  dragStart = {
    x: pt.x,
    y: pt.y,
    overlayX: overlay.x,
    overlayY: overlay.y,
    overlayW: overlay.width,
    overlayH: overlay.height
  };
}

els.canvas.addEventListener("pointerdown", (event) => {
  if (!loadedImage) return;

  const pt = getCanvasPoint(event);
  const overlay = getOverlayAtPoint(pt);

  if (overlay) {
    const handle = getOverlayHandleAtPoint(pt, overlay);
    if (handle) {
      startOverlayResize(pt, overlay, handle);
    } else {
      startOverlayMove(pt, overlay);
    }
  } else if (event.shiftKey) {
    dragMode = "image-move";
    dragStart = {
      x: pt.x,
      y: pt.y,
      imgX: imageState.x,
      imgY: imageState.y
    };
  } else {
    startSelection(pt);
  }

  dragging = true;
  els.canvas.classList.add("dragging");
  els.canvas.setPointerCapture(event.pointerId);
  drawPreview();
});

els.canvas.addEventListener("pointermove", (event) => {
  if (!dragging) return;

  const pt = getCanvasPoint(event);
  const active = getActiveOverlay();

  if (dragMode === "select" && selectionRect) {
    selectionRect.width = pt.x - selectionRect.x;
    selectionRect.height = pt.y - selectionRect.y;
  } else if (dragMode === "image-move") {
    imageState.x = dragStart.imgX + (pt.x - dragStart.x);
    imageState.y = dragStart.imgY + (pt.y - dragStart.y);
  } else if (dragMode === "overlay-move" && active) {
    active.x = dragStart.overlayX + (pt.x - dragStart.x);
    active.y = dragStart.overlayY + (pt.y - dragStart.y);
  } else if (dragMode === "overlay-resize" && active) {
    let newX = dragStart.overlayX;
    let newY = dragStart.overlayY;
    let newW = dragStart.overlayW;
    let newH = dragStart.overlayH;

    const dx = pt.x - dragStart.x;
    const dy = pt.y - dragStart.y;

    if (activeHandle.includes("e")) newW = dragStart.overlayW + dx;
    if (activeHandle.includes("s")) newH = dragStart.overlayH + dy;

    if (activeHandle.includes("w")) {
      newX = dragStart.overlayX + dx;
      newW = dragStart.overlayW - dx;
    }

    if (activeHandle.includes("n")) {
      newY = dragStart.overlayY + dy;
      newH = dragStart.overlayH - dy;
    }

    const minSize = 10;

    if (newW < minSize) {
      if (activeHandle.includes("w")) {
        newX -= minSize - newW;
      }
      newW = minSize;
    }

    if (newH < minSize) {
      if (activeHandle.includes("n")) {
        newY -= minSize - newH;
      }
      newH = minSize;
    }

    active.x = newX;
    active.y = newY;
    active.width = newW;
    active.height = newH;
  }

  drawPreview();
});

function stopDrag(event) {
  dragging = false;
  dragMode = null;
  activeHandle = null;
  els.canvas.classList.remove("dragging");

  if (event && els.canvas.hasPointerCapture(event.pointerId)) {
    els.canvas.releasePointerCapture(event.pointerId);
  }

  enableButtons();
  drawPreview();
}

els.canvas.addEventListener("pointerup", stopDrag);
els.canvas.addEventListener("pointercancel", stopDrag);

els.canvas.addEventListener(
  "wheel",
  (event) => {
    if (!loadedImage) return;

    event.preventDefault();

    const active = getActiveOverlay();

    if (active) {
      const zoom = event.deltaY < 0 ? 1.03 : 0.97;
      const centerX = active.x + active.width / 2;
      const centerY = active.y + active.height / 2;

      active.width = Math.max(10, active.width * zoom);
      active.height = Math.max(10, active.height * zoom);
      active.x = centerX - active.width / 2;
      active.y = centerY - active.height / 2;
    } else {
      const zoom = event.deltaY < 0 ? 1.03 : 0.97;
      const p = getCanvasPoint(event);
      const relX = (p.x - imageState.x) / imageState.width;
      const relY = (p.y - imageState.y) / imageState.height;

      imageState.width *= zoom;
      imageState.height *= zoom;
      imageState.x = p.x - imageState.width * relX;
      imageState.y = p.y - imageState.height * relY;
    }

    drawPreview();
  },
  { passive: false }
);

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();

  if ((event.ctrlKey || event.metaKey) && key === "c") {
    if (selectionRect && createSelectionFromRect(selectionRect)) {
      event.preventDefault();
      enableButtons();
      drawPreview();
    }
    return;
  }

  if ((event.ctrlKey || event.metaKey) && key === "v") {
    if (pasteClipboardSelection()) {
      event.preventDefault();
      enableButtons();
      drawPreview();
    }
    return;
  }

  if (key === "delete" || key === "backspace") {
    if (activeOverlayId !== null) {
      event.preventDefault();
      deleteActiveOverlay();
      enableButtons();
    }
    return;
  }

  if (key === "escape") {
    selectionRect = null;
    activeOverlayId = null;
    enableButtons();
    drawPreview();
    return;
  }

  if (key === "arrowleft") {
    event.preventDefault();
    nudge(-5, 0);
  } else if (key === "arrowright") {
    event.preventDefault();
    nudge(5, 0);
  } else if (key === "arrowup") {
    event.preventDefault();
    nudge(0, -5);
  } else if (key === "arrowdown") {
    event.preventDefault();
    nudge(0, 5);
  }
});

els.imageInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    loadedImage = img;
    overlays = [];
    selectionRect = null;
    clipboardSelection = null;
    activeOverlayId = null;
    nextOverlayId = 1;

    fitImageToCanvas();
    enableButtons();
    URL.revokeObjectURL(url);
  };

  img.onerror = () => {
    loadedImage = null;
    enableButtons();
    els.status.innerHTML = '<span class="bad">Could not load that image.</span>';
    URL.revokeObjectURL(url);
  };

  img.src = url;
});

[
  els.totalWidth,
  els.totalHeight,
  els.trimWidth,
  els.trimHeight,
  els.spineWidth,
  els.bleed,
  els.spineMarginX,
  els.spineMarginY,
  els.barcodeMargin,
  els.dpi,
  els.showGuides,
  els.showBarcodeBox,
  els.includeGuidesInExport,
  els.fillBackground,
  els.softProofCmyk
].forEach((el) => {
  el.addEventListener("input", drawPreview);
});

els.lockPreset.addEventListener("change", applyPresetLock);
els.fitButton.addEventListener("click", fitImageToCanvas);
els.centerSpineButton.addEventListener("click", centerImageOnSpine);
els.zoomInButton.addEventListener("click", () => zoomImage(1.03));
els.zoomOutButton.addEventListener("click", () => zoomImage(0.97));
els.nudgeLeftButton.addEventListener("click", () => nudge(-5, 0));
els.nudgeRightButton.addEventListener("click", () => nudge(5, 0));
els.nudgeUpButton.addEventListener("click", () => nudge(0, -5));
els.nudgeDownButton.addEventListener("click", () => nudge(0, 5));

if (els.copySelectionButton) {
  els.copySelectionButton.addEventListener("click", () => {
    if (selectionRect && createSelectionFromRect(selectionRect)) {
      enableButtons();
      drawPreview();
    }
  });
}

if (els.pasteSelectionButton) {
  els.pasteSelectionButton.addEventListener("click", () => {
    if (pasteClipboardSelection()) {
      enableButtons();
      drawPreview();
    }
  });
}

if (els.deleteActiveButton) {
  els.deleteActiveButton.addEventListener("click", () => {
    deleteActiveOverlay();
    enableButtons();
  });
}

els.exportPngButton.addEventListener("click", exportPng);
els.exportPdfButton.addEventListener("click", exportPdf);
els.exportPrintPdfButton.addEventListener("click", exportPrintPdf);

applyPresetLock();
updateCanvasSize();
enableButtons();
drawPreview();