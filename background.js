/**
 * Full Snap v2 — Capture · Redact · Ship
 * Not a GoFullPage clone: report-ready captures with smart redaction,
 * element pick, region, full page, meta, and a ship pack in the editor.
 */

const HIDE_STYLE_ID = "__fullsnap_hide_fixed__";
const REDACT_CLASS = "__fullsnap_redact_cover__";

function isRestricted(url = "") {
  return (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("devtools://") ||
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab");
  if (isRestricted(tab.url || "")) {
    throw new Error("Can't capture browser / Web Store pages");
  }
  return tab;
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getPageMeta(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => ({
      title: document.title || "",
      url: location.href,
      host: location.hostname,
      vw: window.innerWidth,
      vh: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    }),
  });
  return result || {};
}

/** Hide fixed/sticky chrome during stitch */
async function injectHideFixed(tabId, hide) {
  if (!hide) return;
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (styleId) => {
      if (document.getElementById(styleId)) return;
      const s = document.createElement("style");
      s.id = styleId;
      s.textContent = `[data-fullsnap-was-fixed]{position:absolute!important;visibility:hidden!important}`;
      document.documentElement.appendChild(s);
      document.querySelectorAll("body *").forEach((el) => {
        const st = getComputedStyle(el);
        if (st.position === "fixed" || st.position === "sticky") {
          el.setAttribute("data-fullsnap-was-fixed", st.position);
        }
      });
    },
    args: [HIDE_STYLE_ID],
  });
}

async function restoreFixed(tabId) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: (styleId) => {
        document.querySelectorAll("[data-fullsnap-was-fixed]").forEach((el) => {
          el.removeAttribute("data-fullsnap-was-fixed");
        });
        document.getElementById(styleId)?.remove();
      },
      args: [HIDE_STYLE_ID],
    })
    .catch(() => {});
}

/**
 * Paint black covers over sensitive text + password fields before capture.
 * Returns count of covers applied.
 */
async function applyRedaction(tabId) {
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: (coverClass) => {
      // clean previous
      document.querySelectorAll("." + coverClass).forEach((n) => n.remove());

      const patterns = [
        /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
        /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/g,
        /\b(?:\d[ -]*?){13,19}\b/g,
        /\b\d{3}-\d{2}-\d{4}\b/g,
        /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
        /\b(?:sk|pk|api[_-]?key|token|secret|bearer)[=:\s][A-Za-z0-9_\-]{12,}/gi,
      ];

      const covers = [];
      const addCover = (rect) => {
        if (!rect || rect.width < 4 || rect.height < 4) return;
        if (rect.bottom < 0 || rect.right < 0) return;
        if (rect.top > innerHeight || rect.left > innerWidth) return;
        const el = document.createElement("div");
        el.className = coverClass;
        el.setAttribute("data-fullsnap-redact", "1");
        Object.assign(el.style, {
          position: "fixed",
          left: Math.max(0, rect.left) + "px",
          top: Math.max(0, rect.top) + "px",
          width: Math.min(rect.width, innerWidth) + "px",
          height: Math.min(rect.height, innerHeight) + "px",
          background: "#0a0a0a",
          borderRadius: "3px",
          zIndex: "2147483645",
          pointerEvents: "none",
          boxShadow: "0 0 0 1px rgba(193,240,76,0.35)",
        });
        document.documentElement.appendChild(el);
        covers.push(el);
      };

      // password / sensitive inputs
      document
        .querySelectorAll(
          'input[type="password"], input[type="email"], input[autocomplete="cc-number"], input[autocomplete="tel"], input[name*="ssn" i], input[name*="card" i], input[name*="cvv" i], input[id*="password" i]'
        )
        .forEach((input) => {
          addCover(input.getBoundingClientRect());
        });

      // text nodes — walk visible text
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            if (!node.nodeValue || !node.nodeValue.trim()) {
              return NodeFilter.FILTER_REJECT;
            }
            const p = node.parentElement;
            if (!p) return NodeFilter.FILTER_REJECT;
            const tag = p.tagName;
            if (
              tag === "SCRIPT" ||
              tag === "STYLE" ||
              tag === "NOSCRIPT" ||
              tag === "TEXTAREA"
            ) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      const hitNodes = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.nodeValue;
        let matched = false;
        for (const re of patterns) {
          re.lastIndex = 0;
          if (re.test(text)) {
            matched = true;
            break;
          }
        }
        if (matched) hitNodes.push(walker.currentNode);
      }

      // cover parent elements that contain secrets (simple + reliable)
      const covered = new Set();
      for (const node of hitNodes) {
        let el = node.parentElement;
        // prefer smallest meaningful box
        while (
          el &&
          el !== document.body &&
          el.offsetHeight > 120 &&
          el.childElementCount > 3
        ) {
          el = el.parentElement;
        }
        if (!el || covered.has(el)) continue;
        covered.add(el);
        addCover(el.getBoundingClientRect());
      }

      return { count: covers.length };
    },
    args: [REDACT_CLASS],
  });
  return result?.count || 0;
}

async function clearRedaction(tabId) {
  await chrome.scripting
    .executeScript({
      target: { tabId },
      func: (coverClass) => {
        document.querySelectorAll("." + coverClass).forEach((n) => n.remove());
      },
      args: [REDACT_CLASS],
    })
    .catch(() => {});
}

async function openEditor(payload) {
  const stitchId = "snap_" + Date.now();
  // keep history light — last 8 metas
  try {
    const { fullsnap_history = [] } = await chrome.storage.local.get(
      "fullsnap_history"
    );
    const entry = {
      id: stitchId,
      at: Date.now(),
      mode: payload.mode,
      title: payload.meta?.title || "",
      url: payload.meta?.url || "",
      redacted: payload.redactCount || 0,
    };
    const next = [entry, ...fullsnap_history].slice(0, 12);
    await chrome.storage.local.set({ fullsnap_history: next });
  } catch (_) {
    /* */
  }

  await chrome.storage.session.set({ [stitchId]: payload });
  const url = chrome.runtime.getURL(
    `content/editor.html?id=${encodeURIComponent(stitchId)}`
  );
  await chrome.tabs.create({ url });
  return { ok: true, id: stitchId, redactCount: payload.redactCount || 0 };
}

async function captureVisibleDataUrl() {
  return chrome.tabs.captureVisibleTab(undefined, { format: "png" });
}

async function captureFullPage(tabId, opts) {
  const { hideFixed, redact } = opts;
  let redactCount = 0;
  await injectHideFixed(tabId, hideFixed);
  if (redact) redactCount = await applyRedaction(tabId);

  const [{ result: metrics }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const body = document.body;
      const html = document.documentElement;
      return {
        width: Math.max(
          body.scrollWidth,
          html.scrollWidth,
          body.offsetWidth,
          html.offsetWidth,
          html.clientWidth
        ),
        height: Math.max(
          body.scrollHeight,
          html.scrollHeight,
          body.offsetHeight,
          html.offsetHeight,
          html.clientHeight
        ),
        vw: window.innerWidth,
        vh: window.innerHeight,
        sx: window.scrollX,
        sy: window.scrollY,
      };
    },
  });

  const { width, height, vw, vh, sx, sy } = metrics;
  const maxHeight = Math.min(height, 16000);
  const slices = [];
  const step = Math.max(1, vh - 2);

  try {
    for (let y = 0; y < maxHeight; y += step) {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (yy) => window.scrollTo(0, yy),
        args: [y],
      });
      await sleep(150);
      // re-apply redaction after scroll (positions change)
      if (redact) {
        await clearRedaction(tabId);
        redactCount = await applyRedaction(tabId);
      }
      const dataUrl = await captureVisibleDataUrl();
      slices.push({ y, dataUrl });
      if (y + vh >= maxHeight) break;
    }
  } finally {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (x, y) => window.scrollTo(x, y),
      args: [sx, sy],
    });
    await clearRedaction(tabId);
    await restoreFixed(tabId);
  }

  const meta = await getPageMeta(tabId);
  return openEditor({
    mode: "full",
    slices,
    width: vw,
    height: maxHeight,
    pageWidth: width,
    meta,
    redactCount,
    capturedAt: Date.now(),
  });
}

async function captureVisible(tabId, opts) {
  const { hideFixed, redact } = opts;
  let redactCount = 0;
  await injectHideFixed(tabId, hideFixed);
  try {
    if (redact) redactCount = await applyRedaction(tabId);
    await sleep(80);
    const dataUrl = await captureVisibleDataUrl();
    const meta = await getPageMeta(tabId);
    return openEditor({
      mode: "visible",
      slices: [{ y: 0, dataUrl }],
      meta,
      redactCount,
      capturedAt: Date.now(),
    });
  } finally {
    await clearRedaction(tabId);
    await restoreFixed(tabId);
  }
}

/* ── region / element waiters ── */
const waiters = new Map();

function waitForPick(key, timeoutMs = 120000) {
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      waiters.delete(key);
      resolve(null);
    }, timeoutMs);
    waiters.set(key, {
      resolve: (v) => {
        clearTimeout(t);
        waiters.delete(key);
        resolve(v);
      },
    });
  });
}

async function captureRegion(tabId, opts) {
  const { redact } = opts;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/region.js"],
  });
  const rect = await waitForPick("region:" + tabId);
  if (!rect) throw new Error("Region capture cancelled");

  let redactCount = 0;
  try {
    if (redact) redactCount = await applyRedaction(tabId);
    await sleep(50);
    const dataUrl = await captureVisibleDataUrl();
    const meta = await getPageMeta(tabId);
    return openEditor({
      mode: "region",
      slices: [{ y: 0, dataUrl }],
      crop: rect,
      dpr: rect.dpr || 1,
      meta,
      redactCount,
      capturedAt: Date.now(),
    });
  } finally {
    await clearRedaction(tabId);
  }
}

async function captureElement(tabId, opts) {
  const { redact } = opts;
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/element.js"],
  });
  const rect = await waitForPick("element:" + tabId);
  if (!rect) throw new Error("Element capture cancelled");

  // scroll element into view center-ish already done in element.js
  let redactCount = 0;
  try {
    if (redact) redactCount = await applyRedaction(tabId);
    await sleep(80);
    const dataUrl = await captureVisibleDataUrl();
    const meta = await getPageMeta(tabId);
    return openEditor({
      mode: "element",
      slices: [{ y: 0, dataUrl }],
      crop: rect,
      dpr: rect.dpr || 1,
      meta,
      redactCount,
      capturedAt: Date.now(),
    });
  } finally {
    await clearRedaction(tabId);
  }
}

async function runCapture({
  mode = "report",
  delay = 0,
  hideFixed = true,
  redact = true,
} = {}) {
  const tab = await getActiveTab();
  if (delay > 0) await sleep(delay * 1000);

  const opts = { hideFixed, redact };

  // "report" = visible + redact + ready for ship pack (fast default)
  if (mode === "report" || mode === "visible") {
    return captureVisible(tab.id, {
      ...opts,
      redact: mode === "report" ? true : redact,
    });
  }
  if (mode === "full") return captureFullPage(tab.id, opts);
  if (mode === "region") return captureRegion(tab.id, opts);
  if (mode === "element") return captureElement(tab.id, opts);
  return captureVisible(tab.id, opts);
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type === "fullsnap:capture") {
    (async () => {
      try {
        const r = await runCapture({
          mode: msg.mode || "report",
          delay: Number(msg.delay) || 0,
          hideFixed: msg.hideFixed !== false,
          redact: msg.redact !== false,
        });
        send(r);
      } catch (e) {
        send({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type === "fullsnap:region-result") {
    const tabId = sender.tab?.id;
    const w = tabId != null ? waiters.get("region:" + tabId) : null;
    if (w) w.resolve(msg.cancelled ? null : msg.rect || null);
    send({ ok: true });
    return false;
  }

  if (msg?.type === "fullsnap:element-result") {
    const tabId = sender.tab?.id;
    const w = tabId != null ? waiters.get("element:" + tabId) : null;
    if (w) w.resolve(msg.cancelled ? null : msg.rect || null);
    send({ ok: true });
    return false;
  }

  if (msg?.type === "fullsnap:get") {
    chrome.storage.session.get(msg.id).then((r) => send(r[msg.id] || null));
    return true;
  }

  if (msg?.type === "fullsnap:clear") {
    chrome.storage.session.remove(msg.id).then(() => send({ ok: true }));
    return true;
  }

  if (msg?.type === "fullsnap:prefs-get") {
    chrome.storage.local.get(["fullsnap_prefs", "fullsnap_history"]).then((r) =>
      send({
        prefs: {
          mode: "report",
          delay: 0,
          hideFixed: true,
          redact: true,
          stamp: true,
          ...(r.fullsnap_prefs || {}),
        },
        history: r.fullsnap_history || [],
      })
    );
    return true;
  }

  if (msg?.type === "fullsnap:prefs-set") {
    chrome.storage.local
      .set({ fullsnap_prefs: msg.prefs || {} })
      .then(() => send({ ok: true }));
    return true;
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  try {
    const map = {
      "capture-report": "report",
      "capture-element": "element",
      "capture-region": "region",
    };
    const mode = map[command];
    if (!mode) return;
    const { fullsnap_prefs: prefs } = await chrome.storage.local.get(
      "fullsnap_prefs"
    );
    await runCapture({
      mode,
      delay: 0,
      hideFixed: prefs?.hideFixed !== false,
      redact: prefs?.redact !== false,
    });
  } catch (e) {
    console.warn("Full Snap command failed", e);
  }
});
