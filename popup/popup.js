const go = document.getElementById("go");
const err = document.getElementById("err");

go.addEventListener("click", () => {
  err.textContent = "";
  go.disabled = true;
  go.textContent = "Capturing…";
  chrome.runtime.sendMessage({ type: "fullsnap:capture" }, (r) => {
    go.disabled = false;
    go.textContent = "Capture page";
    if (chrome.runtime.lastError) {
      err.textContent = chrome.runtime.lastError.message;
      return;
    }
    if (!r?.ok) {
      err.textContent = r?.error || "Capture failed";
      return;
    }
    window.close();
  });
});
