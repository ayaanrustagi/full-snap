/**
 * Full Snap v2 annotator — mark up + Ship pack (image + report text).
 */
(async function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const status = document.getElementById("status");
  const dims = document.getElementById("dims");
  const toast = document.getElementById("toast");
  const base = document.getElementById("base");
  const draw = document.getElementById("draw");
  const overlay = document.getElementById("overlay");
  const bctx = base.getContext("2d");
  const dctx = draw.getContext("2d", { willReadFrequently: true });
  const octx = overlay.getContext("2d");

  let tool = "pen";
  let drawing = false;
  let start = null;
  let history = [];
  let redoStack = [];
  let stepNum = 1;
  let pendingText = null;
  let toastTimer = null;
  let meta = { title: "", url: "", host: "" };
  let redactCount = 0;
  let preferStamp = true;
  let captureMode = "report";

  function showToast(msg) {
    toast.hidden = false;
    toast.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.hidden = true;
    }, 2200);
  }

  function setTool(t) {
    tool = t;
    document.querySelectorAll(".tool").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.tool === t);
    });
    draw.style.cursor =
      t === "text" ? "text" : t === "blur" ? "cell" : "crosshair";
  }

  document.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  function color() {
    return document.getElementById("color").value;
  }
  function size() {
    return Number(document.getElementById("size").value) || 6;
  }

  function pushHistory() {
    try {
      history.push(dctx.getImageData(0, 0, draw.width, draw.height));
      if (history.length > 40) history.shift();
      redoStack = [];
    } catch (e) {
      console.warn("history", e);
    }
  }

  document.getElementById("undo").addEventListener("click", () => {
    if (!history.length) {
      dctx.clearRect(0, 0, draw.width, draw.height);
      return;
    }
    try {
      redoStack.push(dctx.getImageData(0, 0, draw.width, draw.height));
    } catch (_) {
      /* */
    }
    const prev = history.pop();
    if (prev) dctx.putImageData(prev, 0, 0);
    else dctx.clearRect(0, 0, draw.width, draw.height);
  });

  document.getElementById("redo").addEventListener("click", () => {
    const next = redoStack.pop();
    if (!next) return;
    try {
      history.push(dctx.getImageData(0, 0, draw.width, draw.height));
    } catch (_) {
      /* */
    }
    dctx.putImageData(next, 0, 0);
  });

  function drawStamp(ctx, w, h) {
    if (!preferStamp) return;
    const line1 = meta.url || meta.host || "Full Snap";
    const line2 = new Date().toLocaleString();
    const pad = 10;
    ctx.save();
    ctx.font = "600 12px system-ui, sans-serif";
    const tw = Math.max(
      ctx.measureText(line1).width,
      ctx.measureText(line2).width
    );
    const boxW = Math.min(w - 16, tw + pad * 2);
    const boxH = 36;
    const x = 8;
    const y = h - boxH - 8;
    ctx.fillStyle = "rgba(10,10,10,0.72)";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.fillStyle = "#c1f04c";
    ctx.fillText(line1.slice(0, 80), x + pad, y + 14);
    ctx.fillStyle = "#fff";
    ctx.fillText(line2, x + pad, y + 28);
    ctx.restore();
  }

  function flattenCanvas() {
    const out = document.createElement("canvas");
    out.width = base.width;
    out.height = base.height;
    const o = out.getContext("2d");
    o.fillStyle = "#ffffff";
    o.fillRect(0, 0, out.width, out.height);
    o.drawImage(base, 0, 0);
    o.drawImage(draw, 0, 0);
    drawStamp(o, out.width, out.height);
    return out;
  }

  function downloadBlob(blob, ext) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `full-snap-${Date.now()}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function canvasToPngBlob() {
    const canvas = flattenCanvas();
    return new Promise((res) => canvas.toBlob(res, "image/png"));
  }

  function buildReportText() {
    const note =
      document.getElementById("report-note").value.trim() ||
      "(no description)";
    const steps =
      stepNum > 1 ? `Numbered steps on image: 1–${stepNum - 1}` : "No steps marked";
    const red =
      redactCount > 0
        ? `Auto-redacted ~${redactCount} sensitive region(s)`
        : "Redaction: off / none detected";

    return [
      `## Full Snap report`,
      ``,
      `**What:** ${note}`,
      `**URL:** ${meta.url || "—"}`,
      `**Page:** ${meta.title || "—"}`,
      `**When:** ${new Date().toISOString()}`,
      `**Mode:** ${captureMode}`,
      `**${steps}**`,
      `**${red}**`,
      ``,
      `_Image copied separately — paste it above/below this block._`,
    ].join("\n");
  }

  async function copyImage() {
    const blob = await canvasToPngBlob();
    if (!blob) throw new Error("No image");
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": blob }),
    ]);
  }

  async function shipPack() {
    try {
      const blob = await canvasToPngBlob();
      if (!blob) throw new Error("No image");
      const text = buildReportText();

      // Prefer image+text if supported; fall back to sequential copy
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "image/png": blob,
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        showToast("Ship pack copied — paste into Slack / Linear");
      } catch (_) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        // text second so many apps get image first; text still in clipboard on some systems fails
        try {
          await navigator.clipboard.writeText(text);
          showToast("Report text copied — paste it, then Copy image for the shot");
        } catch (e2) {
          showToast("Image copied");
        }
        // put text in a selectable way: also store for user
        console.log("Full Snap report:\n", text);
      }
    } catch (e) {
      console.error(e);
      showToast("Ship failed — try Copy image");
    }
  }

  document.getElementById("download").addEventListener("click", async () => {
    const blob = await canvasToPngBlob();
    if (blob) downloadBlob(blob, "png");
    showToast("PNG downloaded");
  });

  document.getElementById("download-jpg").addEventListener("click", () => {
    flattenCanvas().toBlob(
      (blob) => {
        if (blob) downloadBlob(blob, "jpg");
        showToast("JPG downloaded");
      },
      "image/jpeg",
      0.92
    );
  });

  document.getElementById("copy").addEventListener("click", async () => {
    try {
      await copyImage();
      showToast("Image copied");
    } catch (e) {
      showToast("Copy failed — try Download");
    }
  });

  document.getElementById("ship").addEventListener("click", shipPack);
  document.getElementById("ship-rail").addEventListener("click", shipPack);

  window.addEventListener("keydown", (e) => {
    const metaKey = e.metaKey || e.ctrlKey;
    if (metaKey && e.key.toLowerCase() === "z" && !e.shiftKey) {
      e.preventDefault();
      document.getElementById("undo").click();
    } else if (
      metaKey &&
      (e.key.toLowerCase() === "y" ||
        (e.key.toLowerCase() === "z" && e.shiftKey))
    ) {
      e.preventDefault();
      document.getElementById("redo").click();
    } else if (metaKey && e.key.toLowerCase() === "c" && !e.shiftKey) {
      if (document.getElementById("text-modal").hidden) {
        e.preventDefault();
        document.getElementById("copy").click();
      }
    } else if (metaKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      document.getElementById("download").click();
    } else if (metaKey && e.key.toLowerCase() === "enter") {
      e.preventDefault();
      shipPack();
    } else if (!metaKey && e.key === "1") setTool("pen");
    else if (!metaKey && e.key === "2") setTool("hi");
    else if (!metaKey && e.key === "3") setTool("arrow");
    else if (!metaKey && e.key === "4") setTool("rect");
    else if (!metaKey && e.key === "5") setTool("num");
    else if (!metaKey && e.key === "6") setTool("text");
    else if (!metaKey && e.key === "7") setTool("blur");
    else if (!metaKey && e.key === "8") setTool("erase");
  });

  function pos(e) {
    const r = draw.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (draw.width / r.width),
      y: (e.clientY - r.top) * (draw.height / r.height),
    };
  }

  function clearOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function drawArrow(ctx, x1, y1, x2, y2, stroke, width) {
    const head = Math.max(12, width * 3.2);
    const angle = Math.atan2(y2 - y1, x2 - x1);
    ctx.save();
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(
      x2 - head * Math.cos(angle - Math.PI / 7),
      y2 - head * Math.sin(angle - Math.PI / 7)
    );
    ctx.lineTo(
      x2 - head * Math.cos(angle + Math.PI / 7),
      y2 - head * Math.sin(angle + Math.PI / 7)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawStep(ctx, x, y, n, fill) {
    const r = Math.max(14, size() * 2.2);
    ctx.save();
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#0a0a0a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = `800 ${Math.round(r)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), x, y + 1);
    ctx.restore();
  }

  function pixelateRegion(x, y, w, h) {
    const bx = Math.max(0, Math.floor(Math.min(x, x + w)));
    const by = Math.max(0, Math.floor(Math.min(y, y + h)));
    const bw = Math.min(base.width - bx, Math.ceil(Math.abs(w)));
    const bh = Math.min(base.height - by, Math.ceil(Math.abs(h)));
    if (bw < 4 || bh < 4) return;

    const tmp = document.createElement("canvas");
    tmp.width = base.width;
    tmp.height = base.height;
    const t = tmp.getContext("2d");
    t.drawImage(base, 0, 0);
    t.drawImage(draw, 0, 0);

    const block = Math.max(6, Math.round(size() * 1.8));
    const sw = Math.max(1, Math.floor(bw / block));
    const sh = Math.max(1, Math.floor(bh / block));
    const small = document.createElement("canvas");
    small.width = sw;
    small.height = sh;
    const sctx = small.getContext("2d");
    sctx.imageSmoothingEnabled = false;
    sctx.drawImage(tmp, bx, by, bw, bh, 0, 0, sw, sh);
    dctx.imageSmoothingEnabled = false;
    dctx.drawImage(small, 0, 0, sw, sh, bx, by, bw, bh);
    dctx.imageSmoothingEnabled = true;
  }

  function placeText(x, y, text) {
    if (!text) return;
    pushHistory();
    const lines = text.split("\n");
    const fs = Math.max(14, size() * 3);
    dctx.save();
    dctx.font = `700 ${fs}px system-ui, sans-serif`;
    dctx.textBaseline = "top";
    let maxW = 0;
    lines.forEach((ln) => {
      maxW = Math.max(maxW, dctx.measureText(ln).width);
    });
    const pad = 10;
    const boxH = lines.length * fs * 1.25 + pad * 2;
    const boxW = maxW + pad * 2;
    dctx.fillStyle = "rgba(255, 251, 235, 0.92)";
    dctx.strokeStyle = "#0a0a0a";
    dctx.lineWidth = 2;
    dctx.beginPath();
    if (typeof dctx.roundRect === "function") {
      dctx.roundRect(x, y, boxW, boxH, 8);
    } else {
      dctx.rect(x, y, boxW, boxH);
    }
    dctx.fill();
    dctx.stroke();
    dctx.fillStyle = color();
    lines.forEach((ln, i) => {
      dctx.fillText(ln, x + pad, y + pad + i * fs * 1.25);
    });
    dctx.restore();
  }

  const modal = document.getElementById("text-modal");
  const textInput = document.getElementById("text-input");
  document.getElementById("text-cancel").addEventListener("click", () => {
    modal.hidden = true;
    pendingText = null;
  });
  document.getElementById("text-ok").addEventListener("click", () => {
    const t = textInput.value.trim();
    modal.hidden = true;
    if (pendingText && t) placeText(pendingText.x, pendingText.y, t);
    pendingText = null;
    textInput.value = "";
  });

  draw.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const p = pos(e);

    if (tool === "text") {
      pendingText = p;
      modal.hidden = false;
      textInput.focus();
      return;
    }
    if (tool === "num") {
      pushHistory();
      drawStep(dctx, p.x, p.y, stepNum++, color());
      document.getElementById("step-hint").value =
        stepNum > 1
          ? `Steps 1–${stepNum - 1} on image`
          : "Use the Step tool on the canvas";
      return;
    }

    drawing = true;
    draw.setPointerCapture(e.pointerId);
    pushHistory();
    start = p;
    dctx.lineCap = "round";
    dctx.lineJoin = "round";
    dctx.lineWidth = size();

    if (tool === "hi") {
      dctx.globalCompositeOperation = "source-over";
      dctx.strokeStyle = color() + "66";
      dctx.lineWidth = size() * 3;
      dctx.beginPath();
      dctx.moveTo(p.x, p.y);
    } else if (tool === "erase") {
      dctx.globalCompositeOperation = "destination-out";
      dctx.strokeStyle = "rgba(0,0,0,1)";
      dctx.beginPath();
      dctx.moveTo(p.x, p.y);
    } else if (tool === "pen") {
      dctx.globalCompositeOperation = "source-over";
      dctx.strokeStyle = color();
      dctx.beginPath();
      dctx.moveTo(p.x, p.y);
    }
  });

  draw.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = pos(e);
    if (tool === "pen" || tool === "hi" || tool === "erase") {
      dctx.lineTo(p.x, p.y);
      dctx.stroke();
      return;
    }
    clearOverlay();
    if (tool === "rect" || tool === "blur") {
      octx.strokeStyle = tool === "blur" ? "#c1f04c" : color();
      octx.lineWidth = 2;
      octx.setLineDash(tool === "blur" ? [6, 4] : []);
      octx.strokeRect(start.x, start.y, p.x - start.x, p.y - start.y);
      octx.setLineDash([]);
    } else if (tool === "arrow") {
      drawArrow(octx, start.x, start.y, p.x, p.y, color(), size());
    }
  });

  draw.addEventListener("pointerup", (e) => {
    if (!drawing) return;
    drawing = false;
    const p = pos(e);
    clearOverlay();
    if (tool === "rect" && start) {
      dctx.globalCompositeOperation = "source-over";
      dctx.strokeStyle = color();
      dctx.lineWidth = size();
      dctx.strokeRect(start.x, start.y, p.x - start.x, p.y - start.y);
    } else if (tool === "arrow" && start) {
      dctx.globalCompositeOperation = "source-over";
      drawArrow(dctx, start.x, start.y, p.x, p.y, color(), size());
    } else if (tool === "blur" && start) {
      dctx.globalCompositeOperation = "source-over";
      pixelateRegion(start.x, start.y, p.x - start.x, p.y - start.y);
    }
    dctx.globalCompositeOperation = "source-over";
    start = null;
  });

  draw.addEventListener("pointercancel", () => {
    drawing = false;
    clearOverlay();
    start = null;
  });

  function sizeCanvases(w, h) {
    base.width = w;
    base.height = h;
    draw.width = w;
    draw.height = h;
    overlay.width = w;
    overlay.height = h;
    const cssW = "min(100%, " + w + "px)";
    base.style.width = cssW;
    draw.style.width = cssW;
    overlay.style.width = cssW;
    dims.textContent = `${w}×${h}px`;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = src;
    });
  }

  function fillRail() {
    const host = meta.host || "page";
    const title = (meta.title || "").slice(0, 60);
    document.getElementById("rail-meta").innerHTML = title
      ? `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(meta.url || host)}`
      : escapeHtml(meta.url || host);
    if (redactCount > 0) {
      document.getElementById("rail-redact").textContent =
        `🔒 ${redactCount} sensitive region(s) covered before capture`;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // load prefs for stamp
  chrome.runtime.sendMessage({ type: "fullsnap:prefs-get" }, (r) => {
    if (r?.prefs?.stamp === false) preferStamp = false;
  });

  if (!id) {
    status.textContent = "Missing capture id.";
    return;
  }

  chrome.runtime.sendMessage({ type: "fullsnap:get", id }, async (data) => {
    if (!data?.slices?.length) {
      status.textContent = "No capture data. Try again from the popup.";
      return;
    }

    meta = data.meta || meta;
    redactCount = data.redactCount || 0;
    captureMode = data.mode || "report";
    fillRail();
    status.textContent = `Building ${captureMode}…`;

    try {
      if (
        data.mode === "visible" ||
        data.mode === "report" ||
        (data.mode === "region" && !data.crop) ||
        (data.mode === "element" && !data.crop)
      ) {
        const im = await loadImage(data.slices[0].dataUrl);
        sizeCanvases(im.width, im.height);
        bctx.drawImage(im, 0, 0);
      } else if (
        (data.mode === "region" || data.mode === "element") &&
        data.crop
      ) {
        const im = await loadImage(data.slices[0].dataUrl);
        const dpr = data.dpr || data.crop.dpr || 1;
        const sx = Math.round(data.crop.x * dpr);
        const sy = Math.round(data.crop.y * dpr);
        const sw = Math.round(data.crop.w * dpr);
        const sh = Math.round(data.crop.h * dpr);
        const cw = Math.max(1, Math.min(sw, im.width - sx));
        const ch = Math.max(1, Math.min(sh, im.height - sy));
        sizeCanvases(cw, ch);
        bctx.drawImage(im, sx, sy, cw, ch, 0, 0, cw, ch);
      } else {
        const imgs = await Promise.all(
          data.slices.map(async (s) => ({
            y: s.y,
            im: await loadImage(s.dataUrl),
          }))
        );
        const sliceH = imgs[0].im.height;
        const sliceW = imgs[0].im.width;
        const cssH = data.height || sliceH;
        const cssVh =
          data.slices.length > 1
            ? data.slices[1].y - data.slices[0].y + 2
            : cssH;
        const pxPerCssY = sliceH / Math.max(1, cssVh);
        const fullH = Math.min(Math.ceil(cssH * pxPerCssY), 32000);
        sizeCanvases(sliceW, fullH);
        bctx.fillStyle = "#ffffff";
        bctx.fillRect(0, 0, sliceW, fullH);
        for (const { y, im } of imgs) {
          bctx.drawImage(im, 0, Math.round(y * pxPerCssY));
        }
      }

      status.textContent =
        "Mark steps · blur anything left · Ship pack → paste into Slack / Linear";
      chrome.runtime.sendMessage({ type: "fullsnap:clear", id });
    } catch (e) {
      console.error(e);
      status.textContent = "Failed to build image. Capture again.";
    }
  });
})();
