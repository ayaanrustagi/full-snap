/**
 * Full Snap — stitch viewport captures into a full-page PNG,
 * then open annotator.
 */

async function captureFullPage(tabId) {
  // inject scroller + measure
  const [{ result: metrics }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      const body = document.body;
      const html = document.documentElement;
      const width = Math.max(
        body.scrollWidth,
        html.scrollWidth,
        body.offsetWidth,
        html.offsetWidth,
        html.clientWidth
      );
      const height = Math.max(
        body.scrollHeight,
        html.scrollHeight,
        body.offsetHeight,
        html.offsetHeight,
        html.clientHeight
      );
      return {
        width,
        height,
        vw: window.innerWidth,
        vh: window.innerHeight,
        dpr: window.devicePixelRatio || 1,
        sx: window.scrollX,
        sy: window.scrollY,
      };
    },
  });

  const { width, height, vw, vh, sx, sy } = metrics;
  const maxHeight = Math.min(height, 16000); // safety cap
  const slices = [];
  const step = Math.max(1, vh - 2);

  for (let y = 0; y < maxHeight; y += step) {
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (yy) => window.scrollTo(0, yy),
      args: [y],
    });
    // wait for paint
    await new Promise((r) => setTimeout(r, 120));
    const dataUrl = await chrome.tabs.captureVisibleTab(undefined, {
      format: "png",
    });
    slices.push({ y, dataUrl });
    if (y + vh >= maxHeight) break;
  }

  // restore scroll
  await chrome.scripting.executeScript({
    target: { tabId },
    func: (x, y) => window.scrollTo(x, y),
    args: [sx, sy],
  });

  // stitch in offscreen-ish way via a temporary page in extension
  // Use a data page approach: open editor with slices
  const stitchId = "snap_" + Date.now();
  await chrome.storage.session.set({
    [stitchId]: { slices, width: vw, height: maxHeight, pageWidth: width },
  });

  const url = chrome.runtime.getURL(
    `content/editor.html?id=${encodeURIComponent(stitchId)}`
  );
  await chrome.tabs.create({ url });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, sender, send) => {
  if (msg?.type === "fullsnap:capture") {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab?.id) throw new Error("No active tab");
        if (
          tab.url?.startsWith("chrome://") ||
          tab.url?.startsWith("chrome-extension://") ||
          tab.url?.startsWith("edge://")
        ) {
          throw new Error("Can't capture browser pages");
        }
        await captureFullPage(tab.id);
        send({ ok: true });
      } catch (e) {
        send({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }

  if (msg?.type === "fullsnap:get") {
    chrome.storage.session.get(msg.id).then((r) => send(r[msg.id] || null));
    return true;
  }

  if (msg?.type === "fullsnap:clear") {
    chrome.storage.session.remove(msg.id).then(() => send({ ok: true }));
    return true;
  }
});
