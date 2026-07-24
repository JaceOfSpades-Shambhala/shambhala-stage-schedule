import assert from "node:assert/strict";
import test from "node:test";
import { installHexlacesGlobals, loadHexlaces, makeIdentity } from "./helpers/hexlaces-harness.mjs";

const SETS_KEY = "shambhala-2026-my-set-list";
const IDENTITY_KEY = "shambhala-2026-hexlace-identity";
const SET = { day: "Friday", stageId: "amp", time: "10:00 PM", artist: "Peekaboo" };

// The shared harness hands out a throwaway stub per querySelector call, which
// is fine for tests that only need hexlaces.js to load. This one has to watch
// one specific element across renders and press another, so elements are
// memoised by selector and carry real listeners and a real classList.
function makeElement() {
  const listeners = new Map();
  const classNames = new Set();
  const element = {
    hidden: false,
    open: false,
    textContent: "",
    value: "",
    disabled: false,
    title: "",
    className: "",
    dataset: {},
    style: {},
    scrolledIntoView: false,
    classList: {
      add: (...names) => names.forEach(name => classNames.add(name)),
      remove: (...names) => names.forEach(name => classNames.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !classNames.has(name) : Boolean(force);
        if (enabled) classNames.add(name);
        else classNames.delete(name);
        return enabled;
      },
      contains: name => classNames.has(name)
    },
    addEventListener: (type, listener) => listeners.set(type, [...(listeners.get(type) || []), listener]),
    removeEventListener() {},
    click: () => (listeners.get("click") || []).forEach(listener => listener({ preventDefault() {}, stopPropagation() {} })),
    append() {},
    appendChild() {},
    remove() {},
    replaceChildren() {},
    setAttribute() {},
    setAttributeNS() {},
    getAttribute() { return null; },
    removeAttribute() {},
    querySelector: () => makeElement(),
    querySelectorAll: () => [],
    showModal() {},
    close() {},
    focus() { element.focused = true; },
    scrollIntoView() { element.scrolledIntoView = true; },
    cloneNode: () => makeElement()
  };
  return element;
}

async function loadWithReminder({ savedSets = [], identity = null } = {}) {
  const globals = installHexlacesGlobals();
  const elements = new Map();
  const byId = selector => {
    if (!elements.has(selector)) elements.set(selector, makeElement());
    return elements.get(selector);
  };
  globals.document.querySelector = byId;
  globals.document.body = makeElement();

  globals.localStorage.setItem(SETS_KEY, JSON.stringify(savedSets));
  if (identity) globals.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));

  await loadHexlaces();
  return { ...globals, byId };
}

test("saving a first set with no username raises the floating reminder", async () => {
  const { window, localStorage, byId, document } = await loadWithReminder();
  const reminder = byId("#username-reminder");

  assert.equal(reminder.hidden, true, "an empty set list has nothing to share yet");

  localStorage.setItem(SETS_KEY, JSON.stringify([SET]));
  window.dispatchEvent(new CustomEvent("setlist-changed"));

  assert.equal(reminder.hidden, false, "the first saved set should raise the reminder");
  assert.equal(document.body.classList.contains("has-username-reminder"), true);
});

test("the reminder stays down once a username exists, and lifts again if every set is removed", async () => {
  const withName = await loadWithReminder({ savedSets: [SET], identity: makeIdentity() });
  assert.equal(withName.byId("#username-reminder").hidden, true, "a named sharer needs no reminder");

  const { window, localStorage, byId, document } = await loadWithReminder({ savedSets: [SET] });
  assert.equal(byId("#username-reminder").hidden, false);

  localStorage.setItem(SETS_KEY, "[]");
  window.dispatchEvent(new CustomEvent("setlist-changed"));

  assert.equal(byId("#username-reminder").hidden, true, "removing the last set should drop the reminder");
  assert.equal(document.body.classList.contains("has-username-reminder"), false);
});

// A silently claimed Hexlace has a readId and writeKey but no name yet, so a
// plain "do we have an identity" check would wrongly suppress the reminder
// while the Set a username button is still on screen.
test("an unnamed silent claim still gets the reminder", async () => {
  const { byId } = await loadWithReminder({
    savedSets: [SET],
    identity: makeIdentity({ name: "", silentClaim: true })
  });

  assert.equal(byId("#username-reminder").hidden, false);
});

test("clicking the reminder opens My Set List, presses Set a username, and scrolls to the editor", async () => {
  const { byId, document } = await loadWithReminder({ savedSets: [SET] });
  const reminder = byId("#username-reminder");
  const plannerPanel = byId("#planner");
  const editor = byId("#hexlace-editor");
  const nameInput = byId("#hexlace-name-input");
  const prompt = byId("#hexlace-editor-prompt");

  reminder.click();

  assert.equal(plannerPanel.open, true, "the collapsed My Set List section must be opened");
  assert.equal(editor.hidden, false, "the name editor must be showing");
  assert.equal(prompt.textContent, "What username should friends see?", "the reminder must reuse the real button's prompt");
  assert.equal(nameInput.focused, true, "the user should be able to type a name straight away");
  assert.equal(editor.scrolledIntoView, true, "the page must jump to the editor");
  assert.equal(reminder.hidden, true, "the reminder gets out of the way once the editor is open");
  assert.equal(document.body.classList.contains("has-username-reminder"), false);
});

test("cancelling the editor brings the reminder back", async () => {
  const { byId } = await loadWithReminder({ savedSets: [SET] });
  const reminder = byId("#username-reminder");

  reminder.click();
  assert.equal(reminder.hidden, true);

  byId("#hexlace-name-cancel").click();
  assert.equal(reminder.hidden, false, "an abandoned editor should leave the reminder in place");
});
