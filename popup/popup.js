const err = document.getElementById("err");
const redactEl = document.getElementById("redact");
const hideFixedEl = document.getElementById("hide-fixed");
const stampEl = document.getElementById("stamp");
const delayEl = document.getElementById("delay");

function prefs() {
  return {
    mode: "report",
    delay: Number(delayEl.value) || 0,
    hideFixed: hideFixedEl.checked,
    redact: redactEl.checked,
    stamp: stampEl.checked,
  };
}

function savePrefs() {
  chrome.runtime.sendMessage({
    type: "fullsnap:prefs-set",
    prefs: prefs(),
  });
}

function capture(mode, btn) {
  err.textContent = "";
  const buttons = document.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  const d = Number(delayEl.value) || 0;
  if (btn) btn.textContent = d > 0 ? `In ${d}…` : "Capturing…";

  const p = prefs();
  p.mode = mode;
  savePrefs();

  chrome.runtime.sendMessage(
    {
      type: "fullsnap:capture",
      mode,
      delay: p.delay,
      hideFixed: p.hideFixed,
      redact: mode === "report" ? true : p.redact,
    },
    (r) => {
      buttons.forEach((b) => (b.disabled = false));
      if (btn && btn.id === "go-report") {
        btn.innerHTML =
          'Ship a report<span>Visible + auto-redact → annotate → copy pack</span>';
      }
      document.querySelectorAll("[data-mode]").forEach((b) => {
        const labels = {
          element: "Element",
          region: "Region",
          full: "Full page",
          visible: "Visible only",
        };
        b.textContent = labels[b.dataset.mode] || b.dataset.mode;
      });

      if (chrome.runtime.lastError) {
        err.textContent = chrome.runtime.lastError.message;
        return;
      }
      if (!r?.ok) {
        err.textContent = r?.error || "Capture failed";
        return;
      }
      window.close();
    }
  );
}

document.getElementById("go-report").addEventListener("click", (e) => {
  capture("report", e.currentTarget);
});

document.querySelectorAll("[data-mode]").forEach((btn) => {
  btn.addEventListener("click", () => capture(btn.dataset.mode, btn));
});

[redactEl, hideFixedEl, stampEl, delayEl].forEach((el) => {
  el.addEventListener("change", savePrefs);
});

chrome.runtime.sendMessage({ type: "fullsnap:prefs-get" }, (r) => {
  if (!r) return;
  if (r.prefs) {
    delayEl.value = String(r.prefs.delay ?? 0);
    hideFixedEl.checked = r.prefs.hideFixed !== false;
    redactEl.checked = r.prefs.redact !== false;
    stampEl.checked = r.prefs.stamp !== false;
  }
  if (r.history?.length) {
    const box = document.getElementById("history");
    const list = document.getElementById("hist-list");
    box.hidden = false;
    list.innerHTML = r.history
      .slice(0, 5)
      .map((h) => {
        const t = new Date(h.at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        const title = (h.title || h.url || "capture").slice(0, 40);
        const red =
          h.redacted > 0 ? ` · ${h.redacted} redacted` : "";
        return `<li><strong>${h.mode || "snap"}</strong> ${t} — ${escapeHtml(
          title
        )}${red}</li>`;
      })
      .join("");
  }
});

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
