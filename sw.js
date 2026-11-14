// 電波がないときも画面を開けるよう、アプリのファイルを端末に置いておく
// 記録そのものは store.js が端末の保存領域に持つ
// 2026-11-14（修正指示書 B-1）：電波が弱い場所（書店の奥など）で画面が開かないことがあったので、
//   版の印（?v=…）の付いたプログラムは端末の写しを先に使う（版が変われば名前が変わるので、古いものは混ざらない）。
//   画面（*.html）などは通信を2.5秒だけ待ち、だめなら端末の写しで開く（通信の返事が後から来たら、写しだけ新しくする）。
const V = "shelf-202611140943";
const STAMP = V.replace("shelf-", "");
const PAGES = ["./", "index.html", "library.html", "novels.html", "films.html", "shows.html", "sns.html", "work.html", "writing.html", "import.html", "manifest.webmanifest", "app/icon.svg"];
const CODE = ["app/ui.css", "app/bar.css", "app/ui.js", "app/store.js", "app/biblio.js", "app/scan.js", "app/lib.js", "app/booklog.js", "app/fixes.js", "app/library.js", "app/photos.js",
  "app/legacy-novels.js", "app/legacy-films.js", "app/adapt.js", "app/discs.js", "app/shows.js", "app/sns.js", "app/mine.js", "app/work.js", "app/tickets.js", "app/works.js", "app/drafts.js", "app/writing.js", "app/import.js",
  "app/vendor/zxing-0.21.3.min.js", "app/vendor/jsbarcode-3.11.6.min.js"];
const APP = [...PAGES, ...CODE.map(p => p + "?v=" + STAMP)];
self.addEventListener("install", e => { e.waitUntil(caches.open(V).then(c => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
const WAIT = 2500;
const put = (req, r) => { if (r && r.ok) { const c = r.clone(); caches.open(V).then(x => x.put(req, c)); } return r; };
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET") return;
  // 写しを置くのは、このアプリのファイルと文字の形（フォント）だけ。
  // それ以外（記録・書誌・TMDB など）には手を出さない（前は失敗したときにホーム画面を返してしまい、成功に見えていた）
  const mine = u.origin === location.origin, font = /(^|\.)(fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.hostname);
  if (!mine && !font) return;
  // 版の印の付いたプログラム・文字の形：端末の写しを先に使う
  if ((mine && u.searchParams.has("v")) || font) {
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(mine ? new Request(e.request.url, { cache: "no-cache" }) : e.request).then(r => put(e.request, r))));
    return;
  }
  // 画面など：通信を少しだけ待ち、だめなら写しで開く
  const net = fetch(e.request.url, { cache: "no-cache" }).then(r => put(e.request, r));
  const cached = () => caches.match(e.request).then(r => r || caches.match(e.request, { ignoreSearch: true })).then(r => r || (e.request.mode === "navigate" ? caches.match("index.html") : null));
  e.respondWith(new Promise(resolve => {
    let done = false;
    const fin = r => { if (!done && r) { done = true; resolve(r); } };
    const fallback = () => cached().then(r => { if (r) fin(r); else net.then(fin, () => fin(Response.error())); });
    const timer = setTimeout(fallback, WAIT);
    net.then(r => { clearTimeout(timer); fin(r); }, () => { clearTimeout(timer); fallback(); });
  }));
});
