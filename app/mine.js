// 作品の詳細の「自分の感想」（2026-11-13）
// shelf-data の tools/sns_match.py が records/sns/links.json に書く、作品ごとの自分の投稿（X・Mastodon・Bluesky）を出す。
//   links.json：{at, links:{"種類:番号":[投稿の番号]}, posts:{番号:{d, text, url}}}
// 必読書・映画・蔵書・ドラマとアニメの詳細から使う。見た目はどの画面でも同じにする（チェッカーの揃え方）。
"use strict";
window.Mine = (() => {
  const PATH = "records/sns/links.json";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SRC = { x: "X", mstdn: "Mastodon", bsky: "Bluesky" };
  let styled = false;
  function style() {
    if (styled) return; styled = true;
    const s = document.createElement("style");
    s.textContent = `.myp{grid-column:1/-1;margin-top:4px}
.myp h4,.myp .mh{margin:0 0 6px;font-size:13px;font-weight:700;color:var(--ink,var(--fg))}
.myp .mh span{font-weight:400;color:var(--muted)}
.myp .mp{font-size:13.5px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg);border-left:3px solid var(--line);padding:6px 10px;border-radius:0 4px 4px 0;margin:0 0 6px;color:var(--ink,var(--fg))}
.myp .mp .pm{display:block;white-space:normal;font-size:12px;color:var(--muted)}
.myp .pm a{color:inherit}
.myp details>summary{cursor:pointer;font-size:12.5px;color:var(--muted);margin:2px 0 6px}`;
    document.head.appendChild(s);
  }
  // targets：["novel:番号", "lib:番号", …]。同じ投稿は1回だけ、日付の古い順
  function posts(targets) {
    const d = window.Shelf && Shelf.read(PATH); if (!d) return [];
    const ids = new Set();
    for (const t of targets) for (const i of d.links?.[t] || []) ids.add(i);
    return [...ids].map(i => ({ id: i, ...(d.posts?.[i] || {}) })).filter(p => p.text).sort((a, b) => (a.d || "").localeCompare(b.d || ""));
  }
  const one = p => `<div class="mp"><span class="pm">${esc(p.d)}・${SRC[p.id.split(":")[0]] || ""}${p.url ? `　<a href="${esc(p.url)}" target="_blank" rel="noopener">投稿を開く</a>` : ""}</span>${esc(p.text)}</div>`;
  // 詳細に差し込む部分。投稿が無ければ空
  function html(targets, show = 3) {
    const ps = posts(targets); if (!ps.length) return "";
    style();
    const first = ps[0].d.slice(0, 10), last = ps[ps.length - 1].d.slice(0, 10);
    return `<div class="myp"><div class="mh">自分の感想 <span>${ps.length}件${ps.length > 1 ? `（${first}〜${last}）` : ""}・SNSの投稿から</span></div>
      ${ps.slice(0, show).map(one).join("")}
      ${ps.length > show ? `<details><summary>ほかの投稿 ${ps.length - show}件</summary>${ps.slice(show).map(one).join("")}</details>` : ""}</div>`;
  }
  return { PATH, posts, html };
})();
