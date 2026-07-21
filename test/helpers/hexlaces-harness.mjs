// Minimal browser-global shim so this repo's plain `(() => {...})()` client
// scripts (no exports, read document/window/localStorage at load time) can
// actually execute in Node and be driven through real public surface -
// localStorage, window events, and a mocked fetch - rather than only
// pattern-matched as source text. Shared by hexlaces.js and hexadex.js tests.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const HEXLACES_PATH = fileURLToPath(new URL("../../hexlaces.js", import.meta.url));
const HEXLACES_SOURCE = readFileSync(HEXLACES_PATH, "utf8");
const HEXADEX_PATH = fileURLToPath(new URL("../../hexadex.js", import.meta.url));
const HEXADEX_SOURCE = readFileSync(HEXADEX_PATH, "utf8");
const CAMP_ACCESS_PATH = fileURLToPath(new URL("../../camp-access.js", import.meta.url));
const CAMP_ACCESS_SOURCE = readFileSync(CAMP_ACCESS_PATH, "utf8");
// Both call window.fetchHexlaceApi (defined here), which itself defaults to
// the bare global `fetch` unless a caller overrides it - the mock in a test
// therefore has to sit on globalThis.fetch, not window.fetch.
const HEXLACE_API_PATH = fileURLToPath(new URL("../../hexlace-api.js", import.meta.url));
const HEXLACE_API_SOURCE = readFileSync(HEXLACE_API_PATH, "utf8");

function makeStubElement() {
  const el = {
    hidden: false,
    textContent: "",
    value: "",
    disabled: false,
    title: "",
    className: "",
    dataset: {},
    style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    removeEventListener() {},
    append() {},
    appendChild() {},
    remove() {},
    replaceChildren() {},
    setAttribute() {},
    setAttributeNS() {},
    getAttribute() { return null; },
    removeAttribute() {},
    querySelector() { return makeStubElement(); },
    querySelectorAll() { return []; },
    showModal() {},
    close() {},
    focus() {},
    scrollIntoView() {},
    cloneNode() { return makeStubElement(); }
  };
  return el;
}

// One process-wide install: hexlaces.js expects `window`, `document`, and
// `localStorage` as ambient globals (it is written to run directly in a
// browser), so these are set on globalThis once per test file rather than
// re-created per call.
export function installHexlacesGlobals() {
  const store = new Map();
  const localStorageStub = {
    getItem: key => (store.has(String(key)) ? store.get(String(key)) : null),
    setItem: (key, value) => { store.set(String(key), String(value)); },
    removeItem: key => { store.delete(String(key)); },
    clear: () => store.clear()
  };

  const windowTarget = new EventTarget();
  let cookieValue = "";
  const documentStub = Object.assign(new EventTarget(), {
    querySelector: () => makeStubElement(),
    querySelectorAll: () => [],
    createElement: () => makeStubElement(),
    createElementNS: () => makeStubElement(),
    get cookie() { return cookieValue; },
    set cookie(value) { cookieValue = `${cookieValue ? cookieValue + "; " : ""}${String(value).split(";")[0]}`; }
  });

  windowTarget.document = documentStub;
  windowTarget.localStorage = localStorageStub;
  windowTarget.navigator = { onLine: true };
  windowTarget.location = { search: "", href: "https://example.test/", origin: "https://example.test", pathname: "/" };
  windowTarget.matchMedia = () => ({ matches: false });
  windowTarget.parseSchedulePreview = () => null;
  windowTarget.fetch = async () => { throw new Error("no fetch mock installed for this test"); };
  // Debounce/interval timers are no-ops here: tests drive races by dispatching
  // the real events and controlling fetch resolution order directly, not by
  // waiting out real multi-second debounce/refresh delays.
  windowTarget.setTimeout = () => 0;
  windowTarget.clearTimeout = () => {};
  windowTarget.setInterval = () => 0;
  windowTarget.clearInterval = () => {};
  windowTarget.CustomEvent = globalThis.CustomEvent;
  windowTarget.Event = globalThis.Event;
  windowTarget.requestAnimationFrame = () => 0;

  globalThis.window = windowTarget;
  globalThis.document = documentStub;
  globalThis.localStorage = localStorageStub;
  // Node's own global `navigator` is a getter-only built-in; hexlaces.js
  // reads the bare identifier (not window.navigator), so it must be
  // overridden here rather than assigned directly.
  Object.defineProperty(globalThis, "navigator", { value: windowTarget.navigator, configurable: true, writable: true });
  Object.defineProperty(globalThis, "location", { value: windowTarget.location, configurable: true, writable: true });

  return { store, localStorage: localStorageStub, window: windowTarget, document: documentStub };
}

async function importFresh(source) {
  const unique = `\n// test-instance:${Math.random()}\n`;
  const dataUrl = `data:text/javascript;base64,${Buffer.from(source + unique).toString("base64")}`;
  await import(dataUrl);
}

// Each call re-evaluates both IIFEs fresh (module-scoped state like
// `pullingOwner`/`friendSyncPending` must not leak between tests) by
// importing data: URLs whose content is unique per call. Loads hexlace-api.js
// first, matching index.html's real script order, so window.fetchHexlaceApi
// exists before hexlaces.js's top-level code runs.
export async function loadHexlaces() {
  await importFresh(HEXLACE_API_SOURCE);
  await importFresh(HEXLACES_SOURCE);
}

export async function loadHexadex() {
  await importFresh(HEXLACE_API_SOURCE);
  await importFresh(HEXADEX_SOURCE);
}

export async function loadCampAccess() {
  await importFresh(HEXLACE_API_SOURCE);
  await importFresh(CAMP_ACCESS_SOURCE);
}

export function makeIdentity(overrides = {}) {
  return {
    readId: "abcd1234",
    writeKey: "write-key-1234567890",
    name: "Tester",
    revision: 1,
    lastPublished: Date.now(),
    isPhysical: true,
    ...overrides
  };
}
