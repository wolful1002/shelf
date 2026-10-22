// 電波がないときも画面を開けるよう、アプリのファイルを端末に置いておく
// 記録そのものは store.js が端末の保存領域に持つ
const V = "shelf-v3";
const APP = ["./", "index.html", "library.html", "novels.html", "films.html", "manifest.webmanifest",
  "app/ui.css", "app/bar.css", "app/ui.js", "app/store.js", "app/biblio.js", "app/scan.js", "app/lib.js", "app/library.js",
  "app/legacy-novels.js", "app/legacy-films.js", "app/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  if (u.hostname === "api.github.com" || u.hostname.endsWith("openbd.jp") || u.hostname.endsWith("ndl.go.jp")) return; // 記録と書誌は常に通信で
  // 自分のファイルと外部の部品：通信を先に試し、だめなら置いておいた写しを使う
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok && (u.origin === location.origin || /unpkg\.com|jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname))) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match("index.html"))));
});
