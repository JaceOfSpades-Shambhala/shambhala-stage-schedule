import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const INSTALL_SOURCE = readFileSync(new URL("../install.js", import.meta.url), "utf8");

class FakeElement extends EventTarget {
  constructor() {
    super();
    this.hidden = true;
    this.textContent = "";
    this.disabled = false;
  }
  click() { this.dispatchEvent(new Event("click")); }
}

function deferred() {
  let resolve;
  const promise = new Promise(res => { resolve = res; });
  return { promise, resolve };
}

async function loadInstall({ prepareHandoff }) {
  const button = new FakeElement();
  const hint = new FakeElement();
  hint.textContent = "default hint";
  const elementsById = { "install-button": button, "install-hint": hint };

  const windowTarget = new EventTarget();
  windowTarget.navigator = {
    standalone: false,
    platform: "iPhone",
    maxTouchPoints: 0,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)"
  };
  windowTarget.matchMedia = () => ({ matches: false });
  windowTarget.prepareHexlaceHandoff = prepareHandoff;

  globalThis.window = windowTarget;
  globalThis.document = { querySelector: selector => elementsById[selector.replace("#", "")] || null };

  const unique = `\n// test-instance:${Math.random()}\n`;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(INSTALL_SOURCE + unique).toString("base64")}`;
  await import(dataUrl);

  return { button, hint };
}

test("double-tapping install while the handoff refresh is in flight does not start a second overlapping attempt", async () => {
  let callCount = 0;
  const handoffStarted = deferred();
  const handoffResult = deferred();
  const { button, hint } = await loadInstall({
    prepareHandoff: async () => {
      callCount += 1;
      handoffStarted.resolve();
      return handoffResult.promise;
    }
  });

  button.click();
  await handoffStarted.promise;
  assert.equal(button.disabled, true, "the button must be disabled while the first tap's handoff refresh is in flight");

  // A second tap while the first is still in flight must be a no-op, not a
  // second call racing the first one's hint/button updates.
  button.click();
  assert.equal(callCount, 1, "a double-tap must not start a second overlapping prepareHexlaceHandoff() call");

  handoffResult.resolve(true);
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.equal(callCount, 1);
  assert.equal(button.disabled, false, "the button must be re-enabled once the (only) attempt finishes");
  // One clean toggle from the single real attempt reveals the manual install
  // hint (expected on iOS, which has no native install prompt) - a second,
  // spurious call would instead toggle it back off.
  assert.equal(hint.hidden, false);
  assert.doesNotMatch(hint.textContent, /Connect to the internet/, "no scary offline message should appear when the single real attempt succeeded");
});
