(() => {
  const button = document.querySelector("#install-button");
  const hint = document.querySelector("#install-hint");
  if (!button) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) return;

  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) && !window.MSStream;
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  });

  button.addEventListener("click", async () => {
    // Refresh the 24-hour iOS handoff ticket immediately before installation.
    // Other platforms simply resolve false and continue with their prompt.
    const handoffReady = typeof window.prepareHexlaceHandoff !== "function" || await window.prepareHexlaceHandoff();
    if (isIOS && !handoffReady) return;
    if (deferredPrompt) {
      const promptEvent = deferredPrompt;
      deferredPrompt = null;
      promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") button.hidden = true;
      return;
    }
    if (isIOS && hint) hint.hidden = !hint.hidden;
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    if (hint) hint.hidden = true;
    deferredPrompt = null;
  });

  if (isIOS) button.hidden = false;
})();
