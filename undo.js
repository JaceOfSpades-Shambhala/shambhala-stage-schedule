(() => {
  const toast = document.querySelector("#undo-toast");
  const message = document.querySelector("#undo-message");
  const button = document.querySelector("#undo-button");
  if (!toast || !message || !button) return;

  let timer = 0;
  let undoAction = null;

  function announceState(active) {
    window.dispatchEvent(new CustomEvent("undo-state-changed", { detail: { active } }));
  }

  function dismiss() {
    if (!undoAction && toast.hidden) return;
    window.clearTimeout(timer);
    timer = 0;
    undoAction = null;
    toast.hidden = true;
    announceState(false);
  }

  button.addEventListener("click", () => {
    const action = undoAction;
    dismiss();
    action?.();
  });

  window.showUndo = (text, action, duration = 7000) => {
    window.clearTimeout(timer);
    message.textContent = text;
    undoAction = typeof action === "function" ? action : null;
    toast.hidden = false;
    announceState(true);
    timer = window.setTimeout(dismiss, duration);
  };
  window.hasActiveUndo = () => Boolean(undoAction);
})();
