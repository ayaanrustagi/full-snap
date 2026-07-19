(async function () {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  const status = document.getElementById("status");
  const base = document.getElementById("base");
  const draw = document.getElementById("draw");
  const bctx = base.getContext("2d");
  const dctx = draw.getContext("2d");

  let tool = "pen";
  let drawing = false;
  let start = null;
  let history = [];

  function setTool(t) {
    tool = t;
    document.querySelectorAll(".tool").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.tool === t);
    });
  }

  document.querySelectorAll(".tool").forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  function color() {
    return document.getElementById("color").value;
  }
  function size() {
    return Number(document.getElementById("size").value) || 4;
  }

  function pushHistory() {
    history.push(dctx.getImageData(0, 0, draw.width, draw.height));
    if (history.length > 30) history.shift();
  }

  document.getElementById("undo").addEventListener("click", () => {
    const prev = history.pop();
    if (!prev) {
      dctx.clearRect(0, 0, draw.width, draw.height);
      return;
    }
    dctx.putImageData(prev, 0, 0);
  });

  document.getElementById("download").addEventListener("click", () => {
    const out = document.createElement("canvas");
    out.width = base.width;
    out.height = base.height;
    const o = out.getContext("2d");
    o.drawImage(base, 0, 0);
    o.drawImage(draw, 0, 0);
    out.toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `full-snap-${Date.now()}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  });

  function pos(e) {
    const r = draw.getBoundingClientRect();
    const scaleX = draw.width / r.width;
    const scaleY = draw.height / r.height;
    return {
      x: (e.clientX - r.left) * scaleX,
      y: (e.clientY - r.top) * scaleY,
    };
  }

  draw.addEventListener("pointerdown", (e) => {
    drawing = true;
    draw.setPointerCapture(e.pointerId);
    pushHistory();
    start = pos(e);
    dctx.lineCap = "round";
    dctx.lineJoin = "round";
    dctx.lineWidth = size();
    if (tool === "hi") {
      dctx.strokeStyle = color() + "66";
      dctx.lineWidth = size() * 3;
    } else if (tool === "erase") {
      dctx.globalCompositeOperation = "destination-out";
      dctx.strokeStyle = "rgba(0,0,0,1)";
    } else {
      dctx.globalCompositeOperation = "source-over";
      dctx.strokeStyle = color();
    }
    if (tool === "pen" || tool === "hi" || tool === "erase") {
      dctx.beginPath();
      dctx.moveTo(start.x, start.y);
    }
  });

  draw.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    const p = pos(e);
    if (tool === "rect") {
      // preview not needed — draw on up
      return;
    }
    dctx.lineTo(p.x, p.y);
    dctx.stroke();
  });

  draw.addEventListener("pointerup", (e) => {
    if (!drawing) return;
    drawing = false;
    const p = pos(e);
    if (tool === "rect" && start) {
      dctx.globalCompositeOperation = "source-over";
      dctx.strokeStyle = color();
      dctx.lineWidth = size();
      dctx.strokeRect(start.x, start.y, p.x - start.x, p.y - start.y);
    }
    dctx.globalCompositeOperation = "source-over";
    start = null;
  });

  // load stitch data
  if (!id) {
    status.textContent = "Missing capture id.";
    return;
  }

  chrome.runtime.sendMessage({ type: "fullsnap:get", id }, async (data) => {
    if (!data?.slices?.length) {
      status.textContent = "No capture data. Try again from the popup.";
      return;
    }

    status.textContent = `Stitching ${data.slices.length} slices…`;

    const imgs = await Promise.all(
      data.slices.map(
        (s) =>
          new Promise((resolve, reject) => {
            const im = new Image();
            im.onload = () => resolve({ y: s.y, im });
            im.onerror = reject;
            im.src = s.dataUrl;
          })
      )
    );

    const sliceH = imgs[0].im.height;
    const sliceW = imgs[0].im.width;
    // approximate full height in device pixels
    const scale = sliceH / (data.height > 0 ? Math.min(data.height, sliceH) || sliceH : sliceH);
    // better: use ratio from first viewport
    const pageH = Math.round(
      (data.height / (data.slices[0] ? data.height : 1)) * sliceH
    );
    // Use: total = last.y scaled + last height
    const last = data.slices[data.slices.length - 1];
    const pxPerCss = sliceH / (window.devicePixelRatio ? sliceH / (sliceH / (window.devicePixelRatio || 1)) : 1);
    // simpler approach: height = (last.y / vh) * sliceH + sliceH but we don't have vh in px
    // Store used css y; map using first image height / typical vh
    // Assume each step advanced by nearly one viewport; height ≈ first.y_ratio
    const cssH = data.height;
    const cssVh = data.slices.length > 1
      ? data.slices[1].y - data.slices[0].y + 2
      : cssH;
    const pxPerCssY = sliceH / Math.max(1, cssVh);
    const fullH = Math.min(Math.ceil(cssH * pxPerCssY), 32000);
    const fullW = sliceW;

    base.width = fullW;
    base.height = fullH;
    draw.width = fullW;
    draw.height = fullH;
    base.style.width = "min(100%, " + fullW + "px)";
    draw.style.width = base.style.width;

    bctx.fillStyle = "#ffffff";
    bctx.fillRect(0, 0, fullW, fullH);

    for (const { y, im } of imgs) {
      const dy = Math.round(y * pxPerCssY);
      bctx.drawImage(im, 0, dy);
    }

    status.textContent = `${fullW}×${fullH}px · annotate then download`;
    chrome.runtime.sendMessage({ type: "fullsnap:clear", id });
  });
})();
