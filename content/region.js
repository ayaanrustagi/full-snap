/**
 * Full Snap — drag to select a region of the visible viewport.
 * Injected once per region capture.
 */
(function () {
  if (window.__fullsnapRegionActive) return;
  window.__fullsnapRegionActive = true;

  const ROOT_ID = "__fullsnap_region_root__";
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    cursor: "crosshair",
    background: "rgba(15, 23, 42, 0.28)",
    userSelect: "none",
  });

  const tip = document.createElement("div");
  tip.textContent = "Drag to select · Esc cancel";
  Object.assign(tip.style, {
    position: "fixed",
    top: "16px",
    left: "50%",
    transform: "translateX(-50%)",
    background: "#0a0a0a",
    color: "#fff",
    font: "600 12px/1 system-ui, sans-serif",
    letterSpacing: "0.04em",
    padding: "10px 14px",
    borderRadius: "999px",
    border: "2px solid #0a0a0a",
    boxShadow: "3px 3px 0 #c1f04c",
    zIndex: "2147483647",
    pointerEvents: "none",
  });

  const box = document.createElement("div");
  Object.assign(box.style, {
    position: "fixed",
    border: "2px solid #c1f04c",
    background: "rgba(193, 240, 76, 0.12)",
    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
    display: "none",
    pointerEvents: "none",
  });

  root.appendChild(box);
  root.appendChild(tip);
  document.documentElement.appendChild(root);

  let start = null;
  let dragging = false;

  function cleanup() {
    window.__fullsnapRegionActive = false;
    root.remove();
    window.removeEventListener("keydown", onKey, true);
  }

  function finish(rect) {
    cleanup();
    try {
      chrome.runtime.sendMessage({
        type: "fullsnap:region-result",
        rect,
        cancelled: !rect,
      });
    } catch (_) {
      /* */
    }
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    }
  }

  root.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    start = { x: e.clientX, y: e.clientY };
    box.style.display = "block";
    box.style.left = start.x + "px";
    box.style.top = start.y + "px";
    box.style.width = "0px";
    box.style.height = "0px";
    root.setPointerCapture(e.pointerId);
  });

  root.addEventListener("pointermove", (e) => {
    if (!dragging || !start) return;
    const x1 = Math.min(start.x, e.clientX);
    const y1 = Math.min(start.y, e.clientY);
    const x2 = Math.max(start.x, e.clientX);
    const y2 = Math.max(start.y, e.clientY);
    box.style.left = x1 + "px";
    box.style.top = y1 + "px";
    box.style.width = x2 - x1 + "px";
    box.style.height = y2 - y1 + "px";
  });

  root.addEventListener("pointerup", (e) => {
    if (!dragging || !start) return;
    dragging = false;
    const x1 = Math.min(start.x, e.clientX);
    const y1 = Math.min(start.y, e.clientY);
    const x2 = Math.max(start.x, e.clientX);
    const y2 = Math.max(start.y, e.clientY);
    const w = x2 - x1;
    const h = y2 - y1;
    if (w < 6 || h < 6) {
      finish(null);
      return;
    }
    finish({
      x: x1,
      y: y1,
      w,
      h,
      dpr: window.devicePixelRatio || 1,
      vw: window.innerWidth,
      vh: window.innerHeight,
    });
  });

  window.addEventListener("keydown", onKey, true);
})();
