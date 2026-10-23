// 電波がないときも画面を開けるよう、アプリのファイルを端末に置いておく
// 記録そのものは store.js が端末の保存領域に持つ
const V = "shelf-202610231432";
const APP = ["./", "index.html", "library.html", "novels.html", "films.html", "manifest.webmanifest",
  "app/ui.css", "app/bar.css", "app/ui.js", "app/store.js", "app/biblio.js", "app/scan.js", "app/lib.js", "app/fixes.js", "app/library.js", "app/photos.js",
  "app/legacy-novels.js", "app/legacy-films.js", "app/icon.svg"];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // 写しを置くのは、このアプリのファイルと外部の部品（フォント・読み取りの部品）だけ。
  // それ以外（記録・書誌・TMDB など）には手を出さない（前は失敗したときにホーム画面を返してしまい、成功に見えていた）
  const mine = u.origin === location.origin, cdn = /(^|\.)(unpkg\.com|jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if (!mine && !cdn) return;
  // 自分のファイルと外部の部品：通信を先に試し、だめなら置いておいた写しを使う
  // 自分のファイルは毎回サーバーに新しいか確かめる（ブラウザの一時保存の古い版を使わない）
  const go = u.origin === location.origin ? fetch(e.request.url, { cache: "no-cache" }) : fetch(e.request);
  e.respondWith(go.then(r => {
    if (r.ok && (u.origin === location.origin || /unpkg\.com|jsdelivr\.net|fonts\.(googleapis|gstatic)\.com/.test(u.hostname))) { const c = r.clone(); caches.open(V).then(x => x.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : Response.error()))));
});
