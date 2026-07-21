import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const UNDO_SOURCE = readFileSync(new URL("../undo.js", import.meta.url), "utf8");

// undo.js needs a real, working click dispatch (not a no-op stub) and real
// timers (the whole point is testing that two independently-timed pending
// undos don't cancel each other), so this gets its own minimal setup rather
// than the generic no-op-timer harness used for the hexlaces.js/hexadex.js
// race tests.
class FakeElement extends EventTarget {
  constructor() {
    super();
    this.hidden = true;
    this.textContent = "";
  }
  click() { this.dispatchEvent(new Event("click")); }
}

async function loadUndo() {
  const toast = new FakeElement();
  const message = new FakeElement();
  const button = new FakeElement();
  const elementsById = { "undo-toast": toast, "undo-message": message, "undo-button": button };

  const windowTarget = new EventTarget();
  windowTarget.setTimeout = (...args) => globalThis.setTimeout(...args);
  windowTarget.clearTimeout = (...args) => globalThis.clearTimeout(...args);
  windowTarget.CustomEvent = globalThis.CustomEvent;

  const documentStub = { querySelector: selector => elementsById[selector.replace("#", "")] || null };

  globalThis.window = windowTarget;
  globalThis.document = documentStub;

  const unique = `\n// test-instance:${Math.random()}\n`;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(UNDO_SOURCE + unique).toString("base64")}`;
  await import(dataUrl);

  return { toast, message, button, window: windowTarget };
}

test("a second undo does not cancel an earlier one's window; each expires or undoes independently", async () => {
  const { toast, message, button } = await loadUndo();

  let actionACalled = false;
  let actionBCalled = false;
  window.showUndo("Friend A removed", () => { actionACalled = true; }, 10000);
  assert.equal(toast.hidden, false);
  assert.equal(message.textContent, "Friend A removed");

  window.showUndo("Friend B removed", () => { actionBCalled = true; }, 30);
  assert.equal(message.textContent, "Friend B removed", "the most recently queued undo is the one shown");

  await new Promise(resolve => setTimeout(resolve, 60));

  assert.equal(actionBCalled, false, "letting an undo expire must not run its action");
  assert.equal(actionACalled, false, "Friend A's undo must still be pending, not run or cancelled");
  assert.equal(toast.hidden, false, "Friend A's still-pending undo must reappear once B's expires");
  assert.equal(message.textContent, "Friend A removed");
  assert.equal(window.hasActiveUndo(), true);

  button.click();
  assert.equal(actionACalled, true, "clicking Undo while A is shown must run A's action");
  assert.equal(window.hasActiveUndo(), false);
  assert.equal(toast.hidden, true);
});
