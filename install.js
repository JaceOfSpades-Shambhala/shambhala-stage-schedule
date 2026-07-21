(() => {
  const button = document.querySelector("#install-button");
  const hint = document.querySelector("#install-hint");
  if (!button) return;

  const isStandalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  if (isStandalone) return;

  const isIPadDesktopMode = window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1;
  const isIOS = (/iphone|ipad|ipod/i.test(window.navigator.userAgent) || isIPadDesktopMode) && !window.MSStream;
  const isFirefoxAndroid = /android/i.test(window.navigator.userAgent) && /firefox/i.test(window.navigator.userAgent);
  const defaultHint = hint?.textContent || "";
  const manualInstallHint = isFirefoxAndroid
    ? "In Firefox: open the browser menu, tap Install, then add the app to your Home Screen."
    : defaultHint;
  let deferredPrompt = null;

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    button.hidden = false;
  });

  button.addEventListener("click", async () => {
    // A double-tap while the handoff refresh is still in flight must not
    // start a second, overlapping attempt - two concurrent calls each
    // reading and writing the same hint/button state produced the wrong
    // final visibility depending on which one resolved last.
    if (button.disabled) return;
    button.disabled = true;
    try {
      // Refresh the 24-hour iOS handoff ticket immediately before installation.
      // Other platforms simply resolve false and continue with their prompt.
      const handoffReady = !isIOS || typeof window.prepareHexlaceHandoff !== "function" || await window.prepareHexlaceHandoff();
      if (isIOS && !handoffReady) {
        if (hint) {
          hint.textContent = "Connect to the internet once before installing so your Hexlace and saved sets can transfer.";
          hint.hidden = false;
        }
        return;
      }
      if (hint) hint.textContent = manualInstallHint;
      if (deferredPrompt) {
        const promptEvent = deferredPrompt;
        deferredPrompt = null;
        promptEvent.prompt();
        const choice = await promptEvent.userChoice;
        if (choice.outcome === "accepted") button.hidden = true;
        return;
      }
      if ((isIOS || isFirefoxAndroid) && hint) hint.hidden = !hint.hidden;
    } finally {
      button.disabled = false;
    }
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    if (hint) hint.hidden = true;
    deferredPrompt = null;
  });

  if (isIOS || isFirefoxAndroid) button.hidden = false;
})();
