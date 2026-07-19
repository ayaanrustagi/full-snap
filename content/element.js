/**
 * Full Snap — click any element to capture it (clean crop of the component).
 */
(function () {
  if (window.__fullsnapElementActive) return;
  window.__fullsnapElementActive = true;

  const ROOT_ID = "__fullsnap_element_root__";
  document.getElementById(ROOT_ID)?.remove();

  const root = document.createElement("div");
  root.id = ROOT_ID;
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    zIndex: "2147483646",
    cursor: "crosshair",
    background: "transparent",
  });

  const tip = document.createElement("div");
  tip.textContent = "Click an element · Esc cancel";
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

  const hl = document.createElement("div");
  Object.assign(hl.style, {
    position: "fixed",
    border: "2px solid #c1f04c",
    background: "rgba(193, 240, 76, 0.12)",
    boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.35)",
    pointerEvents: "none",
    display: "none",
    zIndex: "2147483645",
  });

  root.appendChild(hl);
  root.appendChild(tip);
  document.documentElement.appendChild(root);

  let current = null;

  function cleanup() {
    window.__fullsnapElementActive = false;
    root.remove();
    window.removeEventListener("keydown", onKey, true);
  }

  function finish(rect) {
    cleanup();
    try {
      chrome.runtime.sendMessage({
        type: "fullsnap:element-result",
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

  function pickEl(x, y) {
    // temporarily hide overlay to hit-test
    root.style.pointerEvents = "none";
    const el = document.elementFromPoint(x, y);
    root.style.pointerEvents = "auto";
    if (!el || el === document.documentElement || el === document.body) {
      return null;
    }
    // walk up to a sensible box (not tiny text span if parent is a card)
    let node = el;
    for (let i = 0; i < 4; i++) {
      if (!node.parentElement || node.parentElement === document.body) break;
      const r = node.getBoundingClientRect();
      const pr = node.parentElement.getBoundingClientRect();
      // if parent is only slightly larger and more "component-like", prefer it
      if (
        pr.width > 40 &&
        pr.height > 40 &&
        pr.width * pr.height < innerWidth * innerHeight * 0.85 &&
        pr.width * pr.height < r.width * r.height * 6
      ) {
        const parentKids = node.parentElement.childElementCount;
        if (parentKids > 0 && parentKids < 40) {
          node = node.parentElement;
          continue;
        }
      }
      break;
    }
    return node;
  }

  function highlight(el) {
    if (!el) {
      hl.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    hl.style.display = "block";
    hl.style.left = r.left + "px";
    hl.style.top = r.top + "px";
    hl.style.width = r.width + "px";
    hl.style.height = r.height + "px";
  }

  root.addEventListener(
    "mousemove",
    (e) => {
      current = pickEl(e.clientX, e.clientY);
      highlight(current);
    },
    true
  );

  root.addEventListener(
    "click",
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      const el = pickEl(e.clientX, e.clientY) || current;
      if (!el) {
        finish(null);
        return;
      }
      el.scrollIntoView({ block: "nearest", inline: "nearest" });
      // remeasure after scroll
      requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const pad = 4;
        finish({
          x: Math.max(0, r.left - pad),
          y: Math.max(0, r.top - pad),
          w: Math.min(innerWidth, r.width + pad * 2),
          h: Math.min(innerHeight, r.height + pad * 2),
          dpr: window.devicePixelRatio || 1,
          vw: window.innerWidth,
          vh: window.innerHeight,
          tag: el.tagName.toLowerCase(),
        });
      });
    },
    true
  );

  window.addEventListener("keydown", onKey, true);
})();
