(() => {
  const toast = document.querySelector("#undo-toast");
  const message = document.querySelector("#undo-message");
  const button = document.querySelector("#undo-button");
  if (!toast || !message || !button) return;

  // Each pending undo keeps its own timer so an unrelated later action (e.g.
  // removing a second friend while the first one's undo window is still
  // open) can't cut that earlier window short. Only one toast is shown at a
  // time - the most recently queued action - but earlier ones stay pending
  // underneath and reappear once the current one is dismissed or undone.
  const queue = [];

  function announceState(active) {
    window.dispatchEvent(new CustomEvent("undo-state-changed", { detail: { active } }));
  }

  function render() {
    const active = queue.length > 0;
    if (active) {
      message.textContent = queue[queue.length - 1].text;
      toast.hidden = false;
    } else {
      toast.hidden = true;
    }
    announceState(active);
  }

  function removeEntry(entry) {
    const index = queue.indexOf(entry);
    if (index === -1) return;
    window.clearTimeout(entry.timer);
    queue.splice(index, 1);
    render();
  }

  button.addEventListener("click", () => {
    const entry = queue.pop();
    if (!entry) return;
    window.clearTimeout(entry.timer);
    render();
    entry.action?.();
  });

  window.showUndo = (text, action, duration = 7000) => {
    const entry = { text, action: typeof action === "function" ? action : null, timer: 0 };
    entry.timer = window.setTimeout(() => removeEntry(entry), duration);
    queue.push(entry);
    render();
  };
  window.hasActiveUndo = () => queue.length > 0;
})();
