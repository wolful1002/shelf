// SNSの感想の画面（2026-11-13）
// shelf-data の tools/sns_match.py が自分の投稿と記録を照合して records/sns/review.json に書いたものを、本人が確かめて記録に付ける。
//   review.json：{at, cands:[{target:"種類:番号", t, kind, posts, d, vol?, ep?}], ask:[{post, w, cands, verb}], nowhere:[{w, posts}], posts:{番号:{d, text, url}}}
//   decided.json：本人が決めたこと。{items:{"c|種類:番号|候補の種類":{v:"ok"|"no", at}, "a|投稿|作品名":{to:"種類:番号"|"", at}}}
// 記録を書き換えるのは「記録に付ける」を押したときだけ。照合の迷いも本人が選ぶ。
"use strict";
const { $, esc } = UI;
UI.topbar("");
const R = "records/sns/review.json", D = "records/sns/decided.json", W = "records/films-checker/watched.json", S = "records/shows.json";
const KN = { novel: "必読書", film: "映画", lib: "蔵書", show: "ドラマ・アニメ", off: "リスト外の映画" };
const KIND = { done: "読んだ・観た", again: "読み返した・観直した", now: "読む・観る", want: "読みたい・観たい" };
// 夜中の投稿は前の日に観た・読んだことが多いので、記録の日と1日違いまでは同じ回とみなす
const near = (a, b) => isDate(a) && isDate(b) && Math.abs(new Date(a) - new Date(b)) <= 864e5;
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
let tab = "cand", ck = "done", noneN = 100;
const sel = new Set();

const review = () => Shelf.read(R) || { cands: [], ask: [], nowhere: [], posts: {} };
const decided = () => Shelf.read(D)?.items || {};
const cKey = c => `c|${c.target}|${c.kind}`;
const aKey = a => `a|${a.post}|${a.w}`;
function decide(entries) {   // entries：[[鍵, 値]]。まとめて一度に書く
  const d = JSON.parse(JSON.stringify(Shelf.read(D) || { items: {} })); d.items = d.items || {};
  const at = UI.nowIso();
  for (const [k, v] of entries) d.items[k] = { ...v, at };
  d.updated = at;
  Shelf.writeDoc(D, d);
}

// ---------- 記録の今の状態 ----------
let NOV = null, FILM = null;
const novel = k => (NOV = NOV || new Map((Shelf.read("works/novels.json")?.books || []).map(b => [b.k, b]))).get(k);
const film = k => (FILM = FILM || new Map((Shelf.read("works/films.json")?.films || []).map(f => [f.k, f]))).get(k);
const wdoc = () => Shelf.read(W) || { seen: {}, want: {}, rw: {} };
const show = id => Shelf.read(S)?.items?.[id];

// 候補ひとつについて、記録に付けると何が変わるか。st：new（付ける）／date（日付を足す）／rec（記録済み）／info（記録は変えない）
function plan(c) {
  const [kind, key] = [c.target.slice(0, c.target.indexOf(":")), c.target.slice(c.target.indexOf(":") + 1)];
  const d = c.d, k = c.kind;
  if (kind === "novel") return novelPlan(key, k, d);
  if (kind === "film") {
    const w = wdoc(), s = w.seen?.[key];
    if (k === "want") return s || w.want?.[key] ? { st: "rec" } : { st: "new", txt: "観たいに入れる", film: { want: d }, key };
    if (k === "again") {
      if (!s) return { st: "new", txt: `鑑賞 ${d}`, film: { seen: d }, key };
      const views = [s, ...(w.rw?.[key] || [])];
      if (views.some(v => v === d || near(v, d))) return { st: "rec" };
      return { st: "new", txt: `観直した日 ${d} を足す`, film: { again: d }, key };
    }
    if (!s) return { st: "new", txt: `鑑賞 ${d}`, film: { seen: d }, key };
    if (!isDate(s)) return { st: "date", txt: `鑑賞日 ${d} を足す`, film: { seen: d }, key };
    return { st: "rec" };
  }
  if (kind === "lib") {
    const it = Lib.get(key);
    if (!it) return { st: "info", txt: "蔵書の記録が見つかりません" };
    if (it.nk) return novelPlan(it.nk, k, d);
    if (k === "want") return { st: "rec" };
    if (it.kind === "series") {
      if (!c.vol) return { st: "info", txt: "どの巻か分からないので、記録は変えません（蔵書の画面で巻に印を付けてください）" };
      const v = it.vols?.[String(c.vol)];
      if (!v?.own) return { st: "info", txt: `${c.vol}巻は蔵書にありません` };
      if (v.read) return { st: "rec" };
      return { st: "new", txt: `${c.vol}巻を読了 ${d}`, lib: { id: key, vol: String(c.vol) } };
    }
    if (Lib.isRead(it)) return Lib.readDate(it) ? { st: "rec" } : { st: "date", txt: `読了日 ${d} を足す`, lib: { id: key } };
    return { st: "new", txt: `読了 ${d}`, lib: { id: key } };
  }
  if (kind === "show") {
    const it = show(key);
    if (!it) return { st: "info", txt: "ドラマ・アニメの記録が見つかりません" };
    if (k === "want") return { st: "rec" };
    if (c.ep) {
      const [s, e] = c.ep, got = it.w?.[s] || [];
      if (Array.from({ length: e }, (_, i) => i + 1).every(n => got.includes(n))) return { st: "rec" };
      return { st: "new", txt: `シーズン${s}の${e}話まで観たにする`, show: { id: key, s, e } };
    }
    if (k === "done") return it.st === "done" ? { st: "rec" } : { st: "new", txt: "観終わったにする", show: { id: key, st: "done" } };
    return it.st === "want" ? { st: "new", txt: "観ているにする", show: { id: key, st: "watching" } } : { st: "rec" };
  }
  return { st: "rec" };   // リスト外の映画は観た記録そのもの
}
function novelPlan(key, k, d) {
  const n = Lib.ndoc(), r = n.read?.[key];
  if (k === "want") return r || n.want?.[key] ? { st: "rec" } : { st: "new", txt: "読みたいに入れる", novel: { key, want: 1 } };
  if (k === "again") {
    if (!r) return { st: "new", txt: `読了 ${d}`, novel: { key, read: d } };
    if ([r, ...(n.rr?.[key] || [])].some(v => v === d || near(v, d))) return { st: "rec" };
    return { st: "new", txt: `読み返した日 ${d} を足す`, novel: { key, again: d } };
  }
  if (!r) return { st: "new", txt: `読了 ${d}`, novel: { key, read: d } };
  if (!isDate(r)) return { st: "date", txt: `読了日 ${d} を足す`, novel: { key, read: d } };
  return { st: "rec" };
}
const titleOf = c => {
  const [kind, key] = [c.target.slice(0, c.target.indexOf(":")), c.target.slice(c.target.indexOf(":") + 1)];
  if (kind === "novel") { const b = novel(key); return b ? `${b.t}${b.a ? "（" + b.a + "）" : ""}` : c.t; }
  if (kind === "film") { const f = film(key); return f ? `${f.t}${f.y ? "（" + f.y + "）" : ""}` : c.t; }
  return c.t;
};

const workURL = c => {
  const i = c.target.indexOf(":"), kind = c.target.slice(0, i), key = c.target.slice(i + 1);
  return "work.html?" + ({ novel: "n", film: "f", lib: "b", show: "s" }[kind] ? `${{ novel: "n", film: "f", lib: "b", show: "s" }[kind]}=${encodeURIComponent(key)}` : `o=${encodeURIComponent(c.t)}`);
};

// ---------- 記録に付ける ----------
function apply(list) {
  const w = JSON.parse(JSON.stringify(wdoc())); let wTouched = false;
  w.seen = w.seen || {}; w.want = w.want || {}; w.rw = w.rw || {}; w.ts = w.ts || {};
  let clk = 0; for (const m of Object.values(w.ts)) for (const x of Object.values(m || {})) clk = Math.max(clk, x);
  const stampW = (n, k) => { clk = Math.max(Date.now(), clk + 1); (w.ts[n] = w.ts[n] || {})[k] = clk; wTouched = true; };
  const novelOps = [];
  Lib.batchBegin();
  try {
    for (const p of list) {
      if (p.novel) novelOps.push(p.novel);
      if (p.film) {
        const k = p.key, f = p.film;
        if (f.want) { if (!w.seen[k]) { w.want[k] = f.want; stampW("want", k); } }
        else if (f.seen) { w.seen[k] = f.seen; stampW("seen", k); if (w.want[k]) { delete w.want[k]; stampW("want", k); } }
        else if (f.again) {
          const s = w.seen[k];
          if (isDate(s) && f.again < s) { w.rw[k] = [...new Set([...(w.rw[k] || []), s])].sort(); w.seen[k] = f.again; stampW("seen", k); }
          else w.rw[k] = [...new Set([...(w.rw[k] || []), f.again])].sort();
          stampW("rw", k);
        }
      }
      if (p.lib) {
        const it = JSON.parse(JSON.stringify(Lib.get(p.lib.id)));
        if (p.lib.vol) { it.vols[p.lib.vol].read = p.c.d; Lib.put(it); }
        else Lib.setRead(it, true, p.c.d);
      }
      if (p.show) {
        const it = JSON.parse(JSON.stringify(show(p.show.id)));
        if (p.show.e) { const s = String(p.show.s); it.w = it.w || {}; it.w[s] = [...new Set([...(it.w[s] || []), ...Array.from({ length: p.show.e }, (_, i) => i + 1)])].sort((a, b) => a - b); if (it.st === "want") it.st = "watching"; }
        else it.st = p.show.st;
        it.u = UI.nowIso(); Shelf.writeItem(S, it.id, it);
      }
    }
    if (novelOps.length) Lib.editNdoc(n => {
      n.rr = n.rr || {};
      for (const o of novelOps) {
        if (o.want) { if (!n.read[o.key]) n.want[o.key] = 1; }
        else if (o.read) { n.read[o.key] = o.read; delete n.want[o.key]; }
        else if (o.again) {
          const r = n.read[o.key];
          if (isDate(r) && o.again < r) { n.rr[o.key] = [...new Set([...(n.rr[o.key] || []), r])].sort(); n.read[o.key] = o.again; }
          else n.rr[o.key] = [...new Set([...(n.rr[o.key] || []), o.again])].sort();
        }
      }
    });
    Lib.batchCommit();
  } catch (e) { Lib.batchDiscard(); throw e; }
  if (wTouched) { w.v = 2; w.updated = UI.nowIso(); Shelf.writeDoc(W, w); }
}

// ---------- 画面 ----------
function postHTML(id) {
  const p = review().posts?.[id]; if (!p) return "";
  return `<div class="post"><span class="pm">${esc(p.d)}${p.url ? ` · <a href="${esc(p.url)}" target="_blank" rel="noopener">投稿を開く</a>` : ""}</span>${esc(p.text)}</div>`;
}
function cands() {
  const dec = decided();
  return review().cands.filter(c => KIND[c.kind] && !dec[cKey(c)]).map(c => ({ c, p: plan(c) }));
}
function render() {
  const rv = review(), dec = decided(), all = cands();
  const live = all.filter(x => x.p.st !== "rec");
  const asks = rv.ask.filter(a => !dec[aKey(a)]);
  $("bigN").textContent = live.length; $("bigSub").textContent = "確かめる候補";
  $("nCand").textContent = live.length; $("nAsk").textContent = groupAsks(asks).length; $("nNone").textContent = rv.nowhere.length;
  $("at").textContent = rv.at ? `照合 ${rv.at.slice(0, 16).replace("T", " ")}` : "まだ照合していません";
  for (const b of document.querySelectorAll("[data-tab]")) b.setAttribute("aria-pressed", b.dataset.tab === tab);
  $("p-cand").hidden = tab !== "cand"; $("p-ask").hidden = tab !== "ask"; $("p-none").hidden = tab !== "none";
  if (tab === "cand") renderCand(all);
  if (tab === "ask") renderAsk(asks);
  if (tab === "none") renderNone();
}
function renderCand(all) {
  for (const b of document.querySelectorAll("[data-k]")) {
    b.setAttribute("aria-pressed", b.dataset.k === ck);
    const n = all.filter(x => x.c.kind === b.dataset.k && x.p.st !== "rec").length;
    b.innerHTML = `${KIND[b.dataset.k]}<span class="n"> ${n}</span>`;
  }
  const rows = all.filter(x => x.c.kind === ck);
  const show = rows.filter(x => x.p.st !== "rec").sort((a, b) => (a.p.st === "info") - (b.p.st === "info") || b.c.d.localeCompare(a.c.d));   // 記録を変えないものは後ろ
  const hidden = rows.length - show.length;
  for (const id of [...sel]) if (!show.some(x => cKey(x.c) === id)) sel.delete(id);
  $("candNote").textContent = (hidden ? `記録済みの ${hidden}件は出していません。` : "") + (ck === "now" ? "「今から観る」などの書き方です。読み終えた・観終えたとは限りません。" : "") + "日付は、その書き方の最初の投稿の日です。";
  $("candList").innerHTML = show.length ? show.map(({ c, p }) => {
    const id = cKey(c), more = c.posts.length - 2;
    return `<li class="cand" data-id="${esc(id)}"><input type="checkbox" id="ck-${esc(id)}" ${sel.has(id) ? "checked" : ""}>
      <div><div><label for="ck-${esc(id)}"><span class="t">${esc(titleOf(c))}</span> <span class="pill">${KN[c.target.split(":")[0]]}</span> <span class="small muted">投稿 ${c.posts.length}件</span></label>　<a class="small" href="${workURL(c)}">作品のページ</a></div>
      <div class="small ${p.st === "info" ? "muted" : ""}">${p.st === "info" ? "" : "→ "}${esc(p.txt || "")}</div>
      ${c.posts.slice(0, 2).map(postHTML).join("")}
      ${more > 0 ? `<details><summary class="small">ほかの投稿 ${more}件</summary>${c.posts.slice(2, 30).map(postHTML).join("")}</details>` : ""}</div></li>`;
  }).join("") : `<li class="empty">確かめる候補はありません</li>`;
  $("candOk").textContent = `選んだ ${sel.size}件を記録に付ける`;
  $("candNo").textContent = `選んだ ${sel.size}件は違う`;
  $("candOk").disabled = $("candNo").disabled = !sel.size;
}
// 同じ作品名・同じ候補の投稿はひとまとめにして、一度に選べるようにする
function groupAsks(asks) {
  const g = new Map();
  for (const a of asks) {
    const k = a.w + "\n" + a.cands.map(c => c.kind + ":" + c.key).join(",");
    if (!g.has(k)) g.set(k, { w: a.w, cands: a.cands, items: [] });
    g.get(k).items.push(a);
  }
  return [...g.values()].sort((a, b) => b.items.length - a.items.length);
}
function candName(c) {
  const t = c.kind === "film" || c.kind === "novel" ? titleOf({ target: c.kind + ":" + c.key, t: c.t }) : c.t;
  return `${KN[c.kind]}：${t}`;
}
function renderAsk(asks) {
  const gs = groupAsks(asks);
  $("askList").innerHTML = gs.length ? gs.map((g, i) => `<li data-i="${i}">
    <div><span class="t">「${esc(g.w)}」</span><span class="small muted">投稿 ${g.items.length}件。どれの感想ですか</span></div>
    ${g.items.slice(0, 2).map(a => postHTML(a.post)).join("")}
    ${g.items.length > 2 ? `<details><summary class="small">ほかの投稿 ${g.items.length - 2}件</summary>${g.items.slice(2, 30).map(a => postHTML(a.post)).join("")}</details>` : ""}
    <div class="choice">${g.cands.map(c => `<button type="button" class="small" data-to="${esc(c.kind + ":" + c.key)}">${esc(candName(c))}</button>`).join("")}
    <button type="button" class="small quiet" data-to="">どれでもない</button></div></li>`).join("") : `<li class="empty">迷うものはありません</li>`;
  $("askList")._groups = gs;
}
function renderNone() {
  const q = $("noneQ").value.trim().toLowerCase();
  const list = review().nowhere.filter(x => !q || x.w.toLowerCase().includes(q));
  $("noneList").innerHTML = list.slice(0, noneN).map(x => `<li class="row"><span class="grow">${esc(x.w)}</span><span class="small muted">${x.posts.length}件</span></li>`).join("") || `<li class="empty">ありません</li>`;
  $("noneMore").hidden = list.length <= noneN;
}

document.addEventListener("click", e => {
  const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; render(); return; }
  const k = e.target.closest("[data-k]"); if (k) { ck = k.dataset.k; sel.clear(); render(); return; }
  const to = e.target.closest("[data-to]");
  if (to) {
    const li = to.closest("li[data-i]"), g = $("askList")._groups[+li.dataset.i];
    decide(g.items.map(a => [aKey(a), { to: to.dataset.to }]));
    UI.toast(to.dataset.to ? "結び付けました。次の照合から使います" : "どれでもないにしました");
    render(); return;
  }
});
$("candList").addEventListener("change", e => {
  const li = e.target.closest("li[data-id]"); if (!li) return;
  if (e.target.checked) sel.add(li.dataset.id); else sel.delete(li.dataset.id);
  $("candOk").textContent = `選んだ ${sel.size}件を記録に付ける`; $("candNo").textContent = `選んだ ${sel.size}件は違う`;
  $("candOk").disabled = $("candNo").disabled = !sel.size;
});
$("selAll").onclick = () => { for (const li of document.querySelectorAll("#candList li[data-id]")) sel.add(li.dataset.id); render(); };
$("selNone").onclick = () => { sel.clear(); render(); };
$("candNo").onclick = () => {
  if (!sel.size) return;
  decide([...sel].map(id => [id, { v: "no" }])); UI.toast(`${sel.size}件を候補から外しました`); sel.clear(); render();
};
$("candOk").onclick = () => {
  if (!sel.size) return;
  const ps = cands().filter(x => sel.has(cKey(x.c))).map(x => ({ ...x.p, c: x.c }));
  const n = ps.filter(p => p.st === "new" || p.st === "date").length;
  if (!confirm(`${ps.length}件を確かめ済みにし、そのうち ${n}件を記録に付けます。よろしいですか？`)) return;
  try { apply(ps.filter(p => p.st === "new" || p.st === "date")); }
  catch (err) { alert("記録に付けられませんでした：" + err.message); return; }
  decide(ps.map(p => [cKey(p.c), { v: "ok" }]));
  UI.toast(`${n}件を記録に付けました`); sel.clear(); render();
};
$("noneQ").addEventListener("input", () => { noneN = 100; renderNone(); });
$("noneMore").onclick = () => { noneN += 200; renderNone(); };

(async () => {
  if (!Shelf.token()) { $("main").prepend(UI.keyCard()); return; }
  await Shelf.init({ need: ["records/sns/", "works/novels.json", "works/films.json", "records/library/", "records/reading.json", "records/novels-checker/books.json", "records/films-checker/watched.json", "records/shows.json", "records/queue.json"] });
  render();
  Shelf.onAny(p => { if (/^(records|works)\//.test(p)) { NOV = FILM = null; render(); } });
})();
