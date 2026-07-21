import { readFile } from "node:fs/promises";

const PLANNER_SOURCE = await readFile(new URL("../../planner.js", import.meta.url), "utf8");

class StubElement {
  constructor(document, tagName = "div") {
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.listeners = new Map();
    this.dataset = {};
    this.style = {};
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this.textContent = "";
    this.value = "";
    this._classNames = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this._classNames.add(name)),
      remove: (...names) => names.forEach(name => this._classNames.delete(name)),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this._classNames.has(name) : Boolean(force);
        if (enabled) this._classNames.add(name);
        else this._classNames.delete(name);
        return enabled;
      },
      contains: name => this._classNames.has(name)
    };
  }

  set className(value) { this._classNames = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this._classNames].join(" "); }
  set innerHTML(value) { if (value === "") this.children = []; }
  get innerHTML() { return ""; }
  setAttribute(name, value) { this[name] = String(value); }
  removeAttribute(name) { delete this[name]; }
  append(...nodes) { this.children.push(...nodes.filter(node => node && typeof node === "object")); }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {}
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  focus() { this.ownerDocument.activeElement = this; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const matches = [];
    const visit = node => {
      if (!(node instanceof StubElement)) return;
      const className = selector.startsWith(".") ? selector.slice(1) : "";
      const dataName = selector === "[data-planner-focus]" ? "plannerFocus"
        : selector === "[data-schedule-focus]" ? "scheduleFocus" : "";
      if ((className && node.classList.contains(className)) || (dataName && node.dataset[dataName])) matches.push(node);
      node.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
  click() {
    for (const listener of this.listeners.get("click") || []) listener({ target: this, stopPropagation() {}, preventDefault() {} });
  }
  closest() { return null; }
}

export async function loadPlannerHarness({ schedule, savedSets = [], ping = null }) {
  const store = new Map();
  let failWrites = false;
  const localStorage = {
    getItem: key => store.get(String(key)) ?? null,
    setItem: (key, value) => {
      if (failWrites) throw new Error("storage full");
      store.set(String(key), String(value));
    },
    removeItem: key => {
      if (failWrites) throw new Error("storage full");
      store.delete(String(key));
    }
  };
  localStorage.setItem("shambhala-2026-my-set-list", JSON.stringify(savedSets));
  if (ping) localStorage.setItem("shambhala-2026-ping", JSON.stringify(ping));

  const selectors = new Map();
  const document = {
    activeElement: null,
    hidden: false,
    body: null,
    createElement: tagName => new StubElement(document, tagName),
    createTextNode: text => ({ textContent: text }),
    querySelector: selector => {
      if (!selectors.has(selector)) selectors.set(selector, new StubElement(document));
      return selectors.get(selector);
    },
    addEventListener() {},
    execCommand: () => true
  };
  document.body = new StubElement(document, "body");

  const window = new EventTarget();
  window.document = document;
  window.localStorage = localStorage;
  window.location = { search: "?preview=2026-07-24T20:00", hash: "#amp" };
  window.SCHEDULE_DATA = schedule;
  window.SCHEDULE_FINAL_END_TIMES = {};
  window.ScheduleStatus = { isCancelled: () => false };
  window.parseSchedulePreview = () => ({ date: "2026-07-24", minutes: 20 * 60 });
  window.setTimeout = () => 0;
  window.clearTimeout = () => {};
  window.setInterval = () => 0;
  window.requestAnimationFrame = callback => { callback(); return 0; };
  let undo = null;
  window.showUndo = (_message, callback) => { undo = callback; };

  class MutationObserverStub { observe() {} }
  Object.assign(globalThis, { window, document, localStorage, MutationObserver: MutationObserverStub });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: { onLine: true, clipboard: { writeText: async () => {} } }
  });
  Object.defineProperty(globalThis, "location", { configurable: true, writable: true, value: window.location });

  const source = `${PLANNER_SOURCE}\n// planner-test:${Math.random()}`;
  await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

  return {
    localStorage,
    plannerList: selectors.get("#planner-list"),
    setWriteFailure(value) { failWrites = value; },
    takeUndo() { const callback = undo; undo = null; return callback; }
  };
}
