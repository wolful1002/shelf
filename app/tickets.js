// 映画館の予約（2026-11-14・要件定義 7章「予約メールからの登録」）
// records/tickets.json … shelf-data の tools/tickets.py が予約メールから作る {items:{番号:{venue, t, fmt, start, end, screen, seat, fk?, tm?, y?, cancel?}}}
// records/tickets-ans.json … 本人が決めたこと {items:{番号:{v:"seen"|"no", at}}}
// 予約しただけでは観たことにしない。上映の時刻を過ぎたら「この回を観ましたか」と聞き、「観た」を選んだときだけ鑑賞の記録にする。
"use strict";
window.Tickets = (() => {
  const P = "records/tickets.json", A = "records/tickets-ans.json", W = "records/films-checker/watched.json", O = "records/films-checker/offlist.json";
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const normT = x => String(x || "").normalize("NFKC").toLowerCase().replace(/[\s・･、。,.!?:;'"“”‘’「」『』【】\[\]()〈〉《》\/\-‐–—~〜&+*★☆♪…]/g, "");   // 映画チェッカーと同じ
  const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  const nowLocal = () => { const d = new Date(Date.now() + 9 * 3600e3); return d.toISOString().slice(0, 16); };   // 日本時間の「YYYY-MM-DDTHH:MM」
  const WD = "日月火水木金土";
  const T = {};
  T.paths = [P, A, W, O];
  T.all = () => { const it = Shelf.read(P)?.items || {}; return Object.entries(it).map(([id, t]) => ({ id, ...t })).sort((a, b) => a.start.localeCompare(b.start)); };
  T.ans = id => Shelf.read(A)?.items?.[id] || null;
  // 状態：cancel（取り消し）／seen・no（本人が決めた）／soon（これから）／ask（上映を過ぎて、まだ決めていない）
  T.state = t => t.cancel ? "cancel" : T.ans(t.id)?.v || ((t.end || t.start) > nowLocal() ? "soon" : "ask");
  T.soon = () => T.all().filter(t => T.state(t) === "soon");
  T.asks = () => T.all().filter(t => T.state(t) === "ask").reverse();
  T.forFilm = k => T.all().filter(t => t.fk === k && T.state(t) !== "cancel" && T.state(t) !== "no");
  T.forTitle = title => T.all().filter(t => !t.fk && normT(t.t) === normT(title) && T.state(t) !== "cancel" && T.state(t) !== "no");
  const day = t => t.start.slice(0, 10);
  // 記録にもうあるか（同じ日の鑑賞）。あれば「観た」で館の名前だけ足す
  T.recorded = t => {
    if (t.fk) { const w = Shelf.read(W) || {}; const s = w.seen?.[t.fk]; return [s, ...(w.rw?.[t.fk] || [])].includes(day(t)); }
    return (Shelf.read(O)?.items || []).some(o => normT(o.t) === normT(t.t) && o.d === day(t));
  };
  T.when = t => { const d = new Date(t.start + ":00+09:00"); return `${d.getUTCFullYear() !== new Date().getFullYear() ? d.getUTCFullYear() + "年" : ""}${+t.start.slice(5, 7)}月${+t.start.slice(8, 10)}日（${WD[new Date(day(t) + "T00:00:00Z").getUTCDay()]}）${t.start.slice(11)}${t.end ? "〜" + t.end.slice(11) : ""}`; };
  T.detail = t => [t.venue, (t.fmt || []).join("・"), t.screen, t.seat ? "座席 " + t.seat : ""].filter(Boolean).join("　");
  T.title = t => {
    if (t.fk) { const f = (Shelf.read("works/films.json")?.films || []).find(f => f.k === t.fk); if (f) return f.t; }
    return t.t;
  };
  T.workURL = t => t.fk ? `work.html?f=${t.fk}` : `work.html?o=${encodeURIComponent(t.t)}`;

  // 「観た」を記録に付ける。映画チェッカーと同じ形（時刻の印付き）で書くので、チェッカーの画面にもそのまま出る
  function stamp(doc) { let c = 0; for (const m of Object.values(doc.ts || {})) for (const x of Object.values(m || {})) c = Math.max(c, x); return () => (c = Math.max(Date.now(), c + 1)); }
  function applySeen(t) {
    const d = day(t);
    if (t.fk) {
      const w = JSON.parse(JSON.stringify(Shelf.read(W) || { seen: {}, want: {}, rw: {}, wh: {}, ts: {} }));
      for (const k of ["seen", "want", "rw", "wh", "ts"]) w[k] = w[k] || {};
      const clk = stamp(w), mark = n => (w.ts[n] = w.ts[n] || {})[t.fk] = clk();
      const k = t.fk, s = w.seen[k];
      if (!s || !isDate(s)) { w.seen[k] = d; mark("seen"); }
      else if (![s, ...(w.rw[k] || [])].includes(d)) {
        if (d < s) { w.rw[k] = [...(w.rw[k] || []), s].sort(); w.seen[k] = d; mark("seen"); }
        else w.rw[k] = [...(w.rw[k] || []), d].sort();
        mark("rw");
      }
      if (w.want[k]) { delete w.want[k]; mark("want"); }
      if (t.venue && !w.wh[k]?.[d]) { w.wh[k] = { ...(w.wh[k] || {}), [d]: t.venue }; mark("wh"); }
      w.v = 2; w.updated = new Date().toISOString();
      Shelf.writeDoc(W, w);
      return;
    }
    // リスト外の映画：同じ題名の記録があれば、日付と館の空いているところだけ埋める（リスト外の映画は1作につき1回分を持つ）
    const o = JSON.parse(JSON.stringify(Shelf.read(O) || { items: [], ts: {} }));
    o.items = o.items || []; o.ts = o.ts || {}; o.ts.off = o.ts.off || {};
    const clk = stamp(o), key = x => normT(x.t) + "_" + (x.y || "");
    let e = o.items.find(x => normT(x.t) === normT(t.t));
    if (e) {
      let ch = false;
      if (!isDate(e.d) || d < e.d) { e.d = d; ch = true; }
      if (!e.w && e.d === d && t.venue) { e.w = t.venue; ch = true; }
      if (!e.tm && t.tm) { e.tm = t.tm; ch = true; }
      if (!ch) return;
      o.ts.off[key(e)] = clk();
    } else {
      e = { t: t.t, y: t.y || 0, d, ...(t.venue ? { w: t.venue } : {}), ...(t.tm ? { tm: t.tm } : {}) };
      o.items.push(e); o.ts.off[key(e)] = clk();
    }
    o.v = 2; o.updated = new Date().toISOString();
    Shelf.writeDoc(O, o);
  }
  T.answer = (t, v) => {
    if (v === "seen") applySeen(t);
    Shelf.writeItem(A, t.id, { v, at: new Date().toISOString() });
  };
  T.undo = t => Shelf.writeItem(A, t.id, null);   // 決めたことを取り消す（鑑賞の記録はそのまま。直すときはチェッカーで）

  // 判断の手がかり：同じ作品について、上映の日の前後に書いた自分の投稿
  T.hints = t => {
    const L = Shelf.read("records/sns/links.json"); if (!L) return [];
    const ids = [...(L.links?.[t.fk ? "film:" + t.fk : "off:" + snsNorm(t.t)] || [])];
    const d0 = new Date(day(t)), out = [];
    for (const i of ids) { const p = L.posts?.[i]; if (!p) continue; const dd = (new Date(p.d.slice(0, 10)) - d0) / 864e5; if (dd >= -1 && dd <= 3) out.push({ id: i, ...p }); }
    return out.sort((a, b) => a.d.localeCompare(b.d));
  };
  function snsNorm(s) {   // tools/sns_match.py の norm と同じ
    s = String(s || "").normalize("NFKC").toLowerCase().replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
    return s.replace(/[\s・:：\-－―〜~!！?？「」『』（）()\[\]【】.,、。'"’&/＆♪☆★]/g, "");
  }

  // ホームなどに出す「映画館の予約」の欄
  T.html = () => {
    const asks = T.asks(), soon = T.soon();
    if (!asks.length && !soon.length) return "";
    const row = (t, ask) => {
      const rec = ask && T.recorded(t), hs = ask ? T.hints(t) : [];
      return `<li class="tk" data-tk="${esc(t.id)}"><div><a href="${T.workURL(t)}"><b>${esc(T.title(t))}</b></a> <span class="small">${esc(T.when(t))}</span></div>
        <div class="small muted">${esc(T.detail(t))}</div>
        ${ask ? `<div class="small">${rec ? "この日の鑑賞はもう記録にあります。「観た」で館の名前を足します。" : "この回を観ましたか。"}</div>
        ${hs.slice(0, 2).map(p => `<div class="small muted tkh">${esc(p.d)}　${esc(p.text.slice(0, 120))}</div>`).join("")}
        <div class="row"><button type="button" class="small pri" data-tkv="seen">観た</button><button type="button" class="small quiet" data-tkv="no">観なかった</button></div>` : ""}</li>`;
    };
    const N = 5;   // 多いときは新しい5件だけ出し、残りは開いて見る
    return `${asks.length ? `<h3 class="tkhd">観たか確かめる（${asks.length}件）</h3><ul class="list">${asks.slice(0, N).map(t => row(t, true)).join("")}</ul>
      ${asks.length > N ? `<details><summary class="small">残りの ${asks.length - N}件を開く</summary><ul class="list">${asks.slice(N).map(t => row(t, true)).join("")}</ul></details>` : ""}` : ""}
      ${soon.length ? `<h3 class="tkhd">これからの予約（${soon.length}件）</h3><ul class="list">${soon.map(t => row(t, false)).join("")}</ul>` : ""}`;
  };
  // 欄の中のボタン
  T.bind = (el, after) => el.addEventListener("click", e => {
    const b = e.target.closest("[data-tkv]"); if (!b) return;
    const t = T.all().find(x => x.id === b.closest("[data-tk]").dataset.tk); if (!t) return;
    T.answer(t, b.dataset.tkv);
    UI.toast(b.dataset.tkv === "seen" ? `『${T.title(t)}』を${day(t)}の鑑賞として記録しました` : "観なかった回として残しました");
    after && after();
  });
  return T;
})();
