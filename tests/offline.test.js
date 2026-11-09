import { describe, it, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import vm from "vm";
import { loadWithReload } from "../src/lib/lazyScreen.js";
import { watchRegistration, onUpdateReady, applyUpdate, registerServiceWorker, _reset } from "../src/lib/swClient.js";

// ── The service worker, run against a fake browser ───────────────────────────
const TEMPLATE = fs.readFileSync(path.join(process.cwd(), "sw/sw-template.js"), "utf8");
const SCOPE = "https://example.test/pocono-open-2026/";

function makeWorld({ online = true, slow = false } = {}) {
  const stores = new Map();
  const handlers = {};
  const fetched = [];
  const key = (r) => (typeof r === "string" ? r : r.url);
  const res = (body, ok = true) => ({ ok, body, clone() { return res(body, ok); } });
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name);
      return {
        async addAll(urls) { for (const u of urls) m.set(new URL(u, SCOPE).href, res(`cached:${u}`)); },
        async put(r, v) { m.set(new URL(key(r), SCOPE).href, v); },
        async match(r) { return m.get(new URL(key(r), SCOPE).href); },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
    async match(r) { for (const m of stores.values()) { const hit = m.get(new URL(key(r), SCOPE).href); if (hit) return hit; } },
  };
  const self = {
    registration: { scope: SCOPE },
    location: { origin: "https://example.test" },
    clients: { claim: async () => {} },
    skipped: false,
    skipWaiting() { this.skipped = true; },
    addEventListener(type, fn) { handlers[type] = fn; },
  };
  const sandbox = {
    self, caches, URL, Promise, setTimeout, clearTimeout,
    Response: { error: () => res("error", false) },
    fetch: (r) => {
      fetched.push(key(r));
      if (!online) return Promise.reject(new TypeError("offline"));
      if (slow) return new Promise(() => {});
      return Promise.resolve(res(`network:${key(r)}`));
    },
  };
  const src = TEMPLATE.replace("__VERSION__", "v1").replace("__ASSETS__", JSON.stringify(["assets/index-abc.js", "manifest.webmanifest"]));
  vm.runInNewContext(src, sandbox);

  const fire = async (type, data = {}) => {
    let waited = null, responded = null;
    const ev = { ...data, waitUntil(p) { waited = p; }, respondWith(p) { responded = p; } };
    handlers[type]?.(ev);
    if (waited) await waited;
    return responded ? await responded : undefined;
  };
  const request = (p, mode = "no-cors", method = "GET") => ({ url: new URL(p, SCOPE).href, mode, method });
  return { stores, fetched, self, fire, request, setOnline: (v) => { online = v; } };
}

describe("service worker", () => {
  it("keeps the app's files on the phone when installed", async () => {
    const w = makeWorld();
    await w.fire("install");
    const cached = [...w.stores.get("pocono-v1").keys()];
    expect(cached).toEqual(expect.arrayContaining([
      SCOPE, `${SCOPE}assets/index-abc.js`, `${SCOPE}manifest.webmanifest`,
    ]));
  });

  it("opens the app with no signal — the whole point", async () => {
    const w = makeWorld();
    await w.fire("install");
    w.setOnline(false);
    const page = await w.fire("fetch", { request: w.request("", "navigate") });
    expect(page.body).toBe("cached:/pocono-open-2026/");
    const js = await w.fire("fetch", { request: w.request("assets/index-abc.js") });
    expect(js.body).toMatch(/^cached:/);
  });

  it("gets the page from the network when there is signal, so updates arrive", async () => {
    const w = makeWorld();
    await w.fire("install");
    const page = await w.fire("fetch", { request: w.request("", "navigate") });
    expect(page.body).toBe(`network:${SCOPE}`);
  });

  it("gives up on a hanging network after a few seconds and uses the saved page", async () => {
    const w = makeWorld({ slow: true });
    await w.fire("install");
    const started = Date.now();
    const page = await w.fire("fetch", { request: w.request("", "navigate") });
    expect(page.body).toBe("cached:/pocono-open-2026/");
    expect(Date.now() - started).toBeLessThan(6000);
  }, 10000);

  it("serves app files from the phone without touching the network", async () => {
    const w = makeWorld();
    await w.fire("install");
    const before = w.fetched.length;
    await w.fire("fetch", { request: w.request("assets/index-abc.js") });
    expect(w.fetched.length).toBe(before);
  });

  it("saves a file it didn't have, the first time it's fetched", async () => {
    const w = makeWorld();
    await w.fire("install");
    await w.fire("fetch", { request: w.request("assets/SetupScreen-xyz.js") });
    expect(w.stores.get("pocono-v1").has(`${SCOPE}assets/SetupScreen-xyz.js`)).toBe(true);
  });

  it("leaves Firestore and other sites alone — they handle their own offline", async () => {
    const w = makeWorld();
    const out = await w.fire("fetch", { request: { url: "https://firestore.googleapis.com/x", mode: "cors", method: "GET" } });
    expect(out).toBeUndefined();
  });

  it("leaves saves (POSTs) alone", async () => {
    const w = makeWorld();
    expect(await w.fire("fetch", { request: w.request("x", "cors", "POST") })).toBeUndefined();
  });

  it("clears out older versions when a new one takes over", async () => {
    const w = makeWorld();
    w.stores.set("pocono-old", new Map());
    w.stores.set("someone-elses-cache", new Map());
    await w.fire("install");
    await w.fire("activate");
    expect([...w.stores.keys()].sort()).toEqual(["pocono-v1", "someone-elses-cache"]);
  });

  it("only switches to a new version when the app asks", async () => {
    const w = makeWorld();
    await w.fire("install");
    expect(w.self.skipped).toBe(false);
    await w.fire("message", { data: "SKIP_WAITING" });
    expect(w.self.skipped).toBe(true);
  });
});

// ── Telling the app an update is ready ───────────────────────────────────────
function fakeWorker() {
  const ls = {};
  return { state: "installing", posted: [], postMessage(m) { this.posted.push(m); }, addEventListener(t, f) { ls[t] = f; }, fire(t) { ls[t]?.(); } };
}
function fakeReg() {
  const ls = {};
  return { waiting: null, installing: null, addEventListener(t, f) { ls[t] = f; }, fire(t) { ls[t]?.(); } };
}

describe("update ready", () => {
  beforeEach(() => _reset());

  it("announces a new version once it's installed over an old one", () => {
    const reg = fakeReg();
    const nav = { serviceWorker: { controller: {} } };
    let got = null;
    onUpdateReady((w) => { got = w; });
    watchRegistration(reg, nav);
    const w = fakeWorker();
    reg.installing = w;
    reg.fire("updatefound");
    w.state = "installed";
    w.fire("statechange");
    expect(got).toBe(w);
  });

  it("says nothing on the very first install — there's nothing to update", () => {
    const reg = fakeReg();
    let got = null;
    onUpdateReady((w) => { got = w; });
    watchRegistration(reg, { serviceWorker: { controller: null } });
    const w = fakeWorker();
    reg.installing = w;
    reg.fire("updatefound");
    w.state = "installed";
    w.fire("statechange");
    expect(got).toBeNull();
  });

  it("tells the waiting version to take over, then reloads once", () => {
    const w = fakeWorker();
    const ls = {};
    let reloads = 0;
    const nav = { serviceWorker: { addEventListener: (t, f) => { ls[t] = f; } } };
    applyUpdate(w, nav, { reload: () => reloads++ });
    expect(w.posted).toEqual(["SKIP_WAITING"]);
    ls.controllerchange(); ls.controllerchange();
    expect(reloads).toBe(1);
  });

  it("does nothing outside a production build", () => {
    expect(registerServiceWorker({ base: "/", prod: false, nav: { serviceWorker: {} } })).toBe(false);
  });
});

// ── Loading a screen after a deploy ──────────────────────────────────────────
describe("loadWithReload", () => {
  const storage = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => { m[k] = v; }, removeItem: (k) => { delete m[k]; } }; };

  it("loads the screen", async () => {
    const mod = { default: "Setup" };
    expect(await loadWithReload(() => Promise.resolve(mod), { storage: storage(), reload: () => {} })).toBe(mod);
  });

  it("reloads once when the file has been replaced by a deploy", async () => {
    let reloads = 0;
    const s = storage();
    const p = loadWithReload(() => Promise.reject(new Error("404")), { storage: s, reload: () => reloads++ });
    await new Promise((r) => setTimeout(r, 0));
    expect(reloads).toBe(1);
    expect(s.getItem("pocono:reloadedForUpdate")).toBe("1");
    expect(p).toBeInstanceOf(Promise);
  });

  it("doesn't reload in a loop if it still fails after reloading", async () => {
    const s = storage();
    s.setItem("pocono:reloadedForUpdate", "1");
    let reloads = 0;
    await expect(loadWithReload(() => Promise.reject(new Error("404")), { storage: s, reload: () => reloads++ })).rejects.toThrow("404");
    expect(reloads).toBe(0);
  });
});

// ── Installing to the home screen ────────────────────────────────────────────
describe("home screen install", () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), "public/manifest.webmanifest"), "utf8"));
  const html = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf8");

  it("opens full screen with its own name and icons", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBe("Pocono Open");
    for (const icon of manifest.icons) expect(fs.existsSync(path.join(process.cwd(), "public", icon.src))).toBe(true);
  });

  it("is set up for iPhone, which ignores half the manifest", () => {
    expect(html).toMatch(/rel="apple-touch-icon"/);
    expect(html).toMatch(/apple-mobile-web-app-capable/);
    expect(fs.existsSync(path.join(process.cwd(), "public/apple-touch-icon.png"))).toBe(true);
  });

  it("has a real title, not the folder name", () => {
    expect(html).toMatch(/<title>Pocono Open<\/title>/);
  });
});
