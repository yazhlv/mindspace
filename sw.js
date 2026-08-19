/* MindSpace Service Worker — 离线优先缓存，支持添加到主屏 (PWA)
   策略：
     · HTML 走 network-first（始终拿到最新页面）
     · JS 脚本走 network-first（关键：避免旧 SW 缓存把旧 app.js 一直喂给用户，
       导致“改了代码刷新后仍不生效”）
     · 其他静态资源（CSS / 图片）走 cache-first + 后台更新（离线友好，且很少变动）
   每次发版修改 CACHE 名称，旧缓存立即失效。 */
const CACHE = "mindspace-v13";
const ASSETS = [
  "./",
  "./index.html",
  "./version.json",
  "./manifest.webmanifest",
  "./assets/css/style.css",
  "./assets/js/supabase.min.js",
  "./assets/js/store.js",
  "./assets/js/charts.js",
  "./assets/js/market.js",
  "./assets/js/sections.js",
  "./assets/js/sync.js",
  "./assets/js/app.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
];

function cachePut(req, res) {
  if (res && res.status === 200 && res.type === "basic") {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
}

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 页面导航：network-first，失败回退缓存
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => cachePut(req, res)).catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  // JS 脚本：network-first（保证每次都拿到最新代码，修复“改了不生效”）
  if (url.pathname.endsWith(".js")) {
    e.respondWith(
      fetch(req).then((res) => cachePut(req, res)).catch(() => caches.match(req))
    );
    return;
  }

  // 其他静态资源：cache-first + 后台更新
  e.respondWith(
    caches.match(req).then((hit) => {
      const net = fetch(req).then((res) => cachePut(req, res)).catch(() => hit);
      return hit || net;
    })
  );
});
