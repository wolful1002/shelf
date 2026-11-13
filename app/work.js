// 作品のページ（2026-11-13・要件定義 14章「作品ごとの総合ページ」）
// 1つの作品について、読了・鑑賞の記録、蔵書の版と場所、原作・映画化、手持ちのソフト、配信、リストの掲載、SNSの感想を1ページにまとめる。
// 開き方：work.html?n=必読書の番号／?f=映画の番号／?b=蔵書の番号／?s=ドラマ・アニメの番号／?o=リスト外の映画の題名
// このページでは記録を書き換えない。直すときは、それぞれの画面へのリンクから開く。
"use strict";
const { $, esc } = UI;
UI.topbar("work.html");
const RD = "records/novels-checker/books.json", WT = "records/films-checker/watched.json", OFF = "records/films-checker/offlist.json", SH = "records/shows.json";
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const norm = s => {   // tools/sns_match.py の norm と同じ
  s = String(s || "").normalize("NFKC").toLowerCase();
  s = s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  return s.replace(/[\s・:：\-－―〜~!！?？「」『』（）()\[\]【】.,、。'"’&/＆♪☆★]/g, "");
};
let region = null; try { region = new Intl.DisplayNames(["ja"], { type: "region" }); } catch (e) {}
const country = c => String(c || "").split(/[\/,]/).map(x => { try { return region ? region.of(x.trim()) : x; } catch (e) { return x; } }).join("・");
const novels = () => Shelf.read("works/novels.json") || { books: [], lists: {} };
const films = () => Shelf.read("works/films.json") || { films: [], lists: {} };
const nov = k => novels().books.find(b => b.k === k);
const film = k => films().films.find(f => f.k === k);
const shows = () => Shelf.read(SH)?.items || {};
const ndoc = () => Shelf.read(RD) || { read: {}, want: {}, own: {}, rr: {} };
const wdoc = () => Shelf.read(WT) || { seen: {}, want: {}, rw: {}, wh: {} };
const mySvc = () => { const it = Shelf.read("records/services.json")?.items; return new Set(it ? Object.keys(it).filter(k => it[k]?.on) : ["Prime Video", "U-NEXT"]); };
const card = (title, body, link) => body ? `<section class="card"><div class="cardh"><h2>${title}</h2>${link || ""}</div>${body}</section>` : "";
const kv = rows => `<dl class="kv">${rows.filter(r => r && r[1]).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
const dateTxt = v => isDate(v) ? v : "日付なし";

// ---------- 部品 ----------
function listsHTML(s, lists) {
  const ks = Object.keys(s || {}); if (!ks.length) return "";
  return `<ul class="list items">${ks.map(k => `<li>${esc(lists[k]?.name || k)}<span class="small muted">　${s[k] ? (typeof s[k] === "number" ? s[k] + "位" : esc(String(s[k]))) : "掲載"}</span></li>`).join("")}</ul>`;
}
function libHTML(its) {
  if (!its.length) return "";
  const st = { own: "所有", want: "読みたい（未所持）", gone: "手放した", off: "所有を外した", unown: "未所持" };
  return `<ul class="list items">${its.map(it => {
    const bits = [it.fmt, it.label, it.pub, it.y ? it.y + "年" : "", it.media === "ebook" ? "電子" : it.media === "both" ? "紙と電子" : ""].filter(Boolean);
    let vol = "";
    if (it.kind === "series") {
      const v = Object.entries(it.vols || {}), own = v.filter(([, x]) => x.own).length, rd = v.filter(([, x]) => x.read).length;
      vol = `所持 ${own}${it.vTotal ? "/" + it.vTotal : ""}巻・読了 ${rd}巻${it.done ? "・完結" : ""}`;
    }
    const eds = (it.fm || []).map(e => `${e.fmt || e.label || "版"}${e.loc ? "（" + e.loc + "）" : ""}${e.parts?.some(p => p.own) ? "" : "・未所持"}`);
    const rd = it.kind !== "series" && Lib.isRead(it) ? `<span class="done">読了 ${esc(Lib.readDate(it) || "")}</span>` : "";
    return `<li><div><b>${esc(it.t)}</b> <span class="pill">${st[it.st] || esc(it.st || "")}</span> ${rd}</div>
      <div class="small muted">${esc(bits.join("・"))}${it.loc ? `　保管場所：${esc(it.loc)}` : ""}</div>
      ${vol ? `<div class="small">${esc(vol)}</div>` : ""}${eds.length ? `<div class="small muted">版：${esc(eds.join("／"))}</div>` : ""}
      <div class="small"><a href="library.html#id=${encodeURIComponent(it.id)}">蔵書で開く</a></div></li>`;
  }).join("")}</ul>`;
}
function vodHTML(p, v) {
  const mine = mySvc();
  const S = a => [...new Set(a)].map(x => mine.has(x) ? `<b>${esc(x)}</b>（契約中）` : esc(x)).join("、");
  const sub = [...(p?.sub || []), ...(v?.sub || [])], paid = [...(p?.rent || []), ...(p?.buy || []), ...(v?.rent || []), ...(v?.buy || [])];
  if (!p && !v) return "";
  return kv([["見放題", S(sub) || "なし"], ["レンタル・購入", S(paid) || "なし"], ["調べた日", esc([p?.at && "TMDB " + p.at, v?.at && "Filmarks " + v.at].filter(Boolean).join("・"))]]);
}
function adaptNovelHTML(k) {   // 必読書の作品 → 映画化
  const ps = Adapt.filmsOf(k); if (!ps.length) return "";
  const w = wdoc();
  return `<ul class="list items">${ps.map(p => `<li><a href="work.html?f=${p.f}"><b>${esc(p.ft)}</b></a> <span class="small muted">${p.fy || "年不明"}${p.fd ? "・" + esc(p.fd) : ""}</span> ${w.seen?.[p.f] ? `<span class="done small">✓ 鑑賞済 ${isDate(w.seen[p.f]) ? w.seen[p.f] : ""}</span>` : `<span class="small muted">未見</span>`}</li>`).join("")}</ul>`;
}
function adaptFilmHTML(k) {    // 映画 → 原作
  const ps = Adapt.novelsOf(k); if (!ps.length) return "";
  const r = ndoc().read || {};
  return `<ul class="list items">${ps.map(p => `<li><a href="work.html?n=${p.n}"><b>${esc(p.nt)}</b></a> <span class="small muted">${esc(p.na)}${p.ny ? "・" + (p.ny < 0 ? "前" + (-p.ny) : p.ny) : ""}</span> ${r[p.n] ? `<span class="done small">✓ 読了 ${isDate(r[p.n]) ? r[p.n] : ""}</span>` : `<span class="small muted">未読</span>`}</li>`).join("")}</ul>`;
}
function discHTML(k) {
  const ds = Discs.forFilm(k); if (!ds.length) return "";
  return `<ul class="list items">${ds.map(d => `<li><b>${esc(d.fmt || "")}</b> ${esc(Discs.name(d))}${d.st === "gone" ? ` <span class="pill">手放した</span>` : ""}<div class="small muted">${d.loc ? "保管場所：" + esc(d.loc) : ""}${d.jan ? `　${esc(d.jan)}` : ""}</div></li>`).join("")}</ul>`;
}
function head(eyebrow, title, sub, tags) {
  document.title = `${title} — shelf`;
  return `<header class="phead"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p class="lede">${sub}</p>${tags ? `<div class="row">${tags}</div>` : ""}</div></header>`;
}
function ticketsHTML(ts) {
  if (!ts.length) return "";
  const ST = { soon: "予約あり", ask: "観たか未確認（ホームで選べます）", seen: "観た", no: "観なかった" };
  return `<ul class="list items">${ts.map(t => `<li>${esc(Tickets.when(t))} <span class="pill">${ST[Tickets.state(t)] || ""}</span><div class="small muted">${esc(Tickets.detail(t))}</div></li>`).join("")}</ul>`;
}
const mineCard = targets => { const h = Mine.html(targets, 5); return h ? `<section class="card">${h}</section>` : ""; };

// ---------- 作品の種類ごと ----------
function novelPage(k) {
  const b = nov(k); if (!b) return notFound();
  const d = ndoc(), r = d.read?.[k], rr = d.rr?.[k] || [];
  const libs = Object.values(Lib.items()).filter(it => it.nk === k);
  const rec = r ? kv([["読了", `<span class="done">✓ ${esc(dateTxt(r))}</span>`], ["読み返した日", esc(rr.join("、"))]])
    : `<p>${d.want?.[k] ? "読みたい印が付いています（未読）" : "未読"}</p>`;
  const info = kv([["著者", esc(b.a)], ["原題", b.o && b.o !== b.t ? esc(b.o) : ""], ["発表", b.y ? (b.y < 0 ? "前" + (-b.y) : b.y) + "年" : ""], ["国", esc(country(b.c))],
    ["ジャンル", esc((b.g || []).join("・"))], [b.tr === 1 ? "主な邦訳" : "主な刊行", esc([b.jp, b.jb, b.jy ? b.jy + "年" : ""].filter(Boolean).join("・"))],
    ["スコア", `${Math.round(b.sc)}（${esc(Biblio.tierNm(b.sc))}）`]]);
  return head("必読書" + (libs.some(x => x.st === "own") ? " · 蔵書" : ""), b.t, esc([b.a, b.y > 0 ? b.y : ""].filter(Boolean).join("・")),
      `<span class="pill ${r ? "ok" : ""}">${r ? "読了" : "未読"}</span>${libs.some(x => x.st === "own") ? `<span class="pill">所有</span>` : ""}${Adapt.filmsOf(k).length ? `<span class="pill">映画化あり</span>` : ""}`)
    + card("読了の記録", rec, `<a href="novels.html#k=${k}">必読書チェッカーで開く</a>`)
    + card("蔵書", libHTML(libs) || `<p class="small muted">蔵書にはありません</p>`)
    + card("映画化", adaptNovelHTML(k))
    + mineCard(["novel:" + k, ...libs.map(it => "lib:" + it.id)])
    + card("作品の情報", info)
    + card("掲載されているリスト", listsHTML(b.s, novels().lists));
}
function filmPage(k) {
  const f = film(k); if (!f) return notFound();
  const w = wdoc(), s = w.seen?.[k], views = [...new Set([s, ...(w.rw?.[k] || [])].filter(isDate))].sort();
  const place = dd => w.wh?.[k]?.[dd] ? `（${esc(w.wh[k][dd])}）` : "";
  const rec = s ? kv([["鑑賞", `<span class="done">✓</span> ${views.length ? views.map(dd => esc(dd) + place(dd)).join("<br>") : "日付なし" + place("-")}`], ["回数", views.length > 1 ? views.length + "回" : ""]])
    : `<p>${w.want?.[k] ? "観たい印が付いています（未見）" : "未見"}</p>`;
  const info = kv([["監督", esc(f.d || "")], ["公開", f.y ? f.y + "年" : ""], ["国", esc(country(f.c))], ["上映時間", f.rt ? `${f.rt}分` : ""], ["原題・英題", esc(f.en || "")],
    ["スコア", f.sc != null ? String(Math.round(f.sc)) : ""], ["TMDB", f.tm ? `<a href="https://www.themoviedb.org/movie/${f.tm}?language=ja-JP" target="_blank" rel="noopener">作品のページ</a>` : ""]]);
  const owned = Discs.ownedFilm(k);
  return head("映画", f.t, esc([f.d, f.y].filter(Boolean).join("・")),
      `<span class="pill ${s ? "ok" : ""}">${s ? "鑑賞済" : "未見"}</span>${owned.length ? `<span class="pill">所有 ${esc([...new Set(owned.map(d => d.fmt))].join("・"))}</span>` : ""}${Adapt.novelsOf(k).length ? `<span class="pill">原作あり</span>` : ""}`)
    + card("鑑賞の記録", rec, `<a href="films.html#k=${k}">映画チェッカーで開く</a>`)
    + card("映画館の予約", ticketsHTML(Tickets.forFilm(k)))
    + card("原作", adaptFilmHTML(k))
    + card("手持ちのソフト", discHTML(k))
    + card("配信", vodHTML(f.p, f.v))
    + mineCard(["film:" + k])
    + card("作品の情報", info)
    + card("掲載されているリスト", listsHTML(f.s, films().lists));
}
function libPage(id) {
  const it = Lib.get(id); if (!it) return notFound();
  if (it.nk && nov(it.nk)) { location.replace("work.html?n=" + it.nk); return ""; }
  return head("蔵書", it.t, esc([it.a, it.pub].filter(Boolean).join("・")), "")
    + card("蔵書", libHTML([it]))
    + mineCard(["lib:" + id]);
}
function showPage(id) {
  const it = shows()[id]; if (!it) return notFound();
  const all = (it.ss || []).reduce((n, s) => n + (s.eps || 0), 0), done = Object.values(it.w || {}).reduce((n, a) => n + a.length, 0);
  const ST = { watching: "観ている", want: "観たい", done: "観終わった", stop: "中断" };
  const seasons = (it.ss || []).map(s => {
    const ds = Object.entries(it.wd || {}).filter(([k]) => +k.split("-")[0] === s.n).map(([, d]) => d).sort();
    return `シーズン${s.n}：${(it.w?.[s.n] || []).length}/${s.eps}話${ds.length ? `（${ds[0]}${ds.length > 1 && ds[ds.length - 1] !== ds[0] ? "〜" + ds[ds.length - 1] : ""}）` : ""}${it.wh?.[s.n] ? `　${esc(it.wh[s.n])}` : ""}`;
  }).join("<br>");
  return head(it.cat || "ドラマ・アニメ", it.t, esc([it.ot !== it.t ? it.ot : "", it.y].filter(Boolean).join("・")), `<span class="pill">${ST[it.st] || ""}</span>`)
    + card("観た記録", kv([["状況", ST[it.st] || ""], ["観た話数", `${done}/${all}話`], ["シーズンごと", seasons], ["次の放送", it.next ? `シーズン${it.next.s} 第${it.next.e}話 ${esc(it.next.air || "")}` : ""], ["放送", esc(it.status || "")]]), `<a href="shows.html#id=${encodeURIComponent(id)}">ドラマ・アニメで開く</a>`)
    + card("配信", vodHTML(it.p))
    + mineCard(["show:" + id]);
}
function offPage(t) {
  const xs = (Shelf.read(OFF)?.items || []).filter(o => norm(o.t) === norm(t));
  if (!xs.length) {   // まだ鑑賞の記録が無い、予約だけの映画
    const ts = Tickets.forTitle(t); if (!ts.length) return notFound();
    return head("映画（リスト外）", ts[0].t, ts[0].y ? ts[0].y + "年" : "", `<span class="pill">未見</span>`)
      + card("映画館の予約", ticketsHTML(ts))
      + (ts[0].tm ? card("作品の情報", kv([["TMDB", `<a href="https://www.themoviedb.org/movie/${ts[0].tm}?language=ja-JP" target="_blank" rel="noopener">作品のページ</a>`]])) : "")
      + mineCard(["off:" + norm(t)]);
  }
  const ds = xs.map(o => o.d).filter(isDate).sort();
  const tm = xs.find(o => o.tm)?.tm;
  return head("映画（リスト外）", xs[0].t, xs[0].y ? xs[0].y + "年" : "", `<span class="pill ok">鑑賞済</span>`)
    + card("鑑賞の記録", kv([["鑑賞", ds.map(d => esc(d) + (xs.find(o => o.d === d)?.w ? `（${esc(xs.find(o => o.d === d).w)}）` : "")).join("<br>") || "日付なし"], ["回数", ds.length > 1 ? ds.length + "回" : ""]]), `<a href="films.html">映画チェッカーで開く</a>`)
    + card("映画館の予約", ticketsHTML(Tickets.forTitle(xs[0].t)))
    + (tm ? card("作品の情報", kv([["TMDB", `<a href="https://www.themoviedb.org/movie/${tm}?language=ja-JP" target="_blank" rel="noopener">作品のページ</a>`]])) : "")
    + mineCard(["off:" + norm(t)]);
}
const notFound = () => `<section class="card"><p>この作品は記録に見つかりませんでした。上で探してください。</p></section>`;

// ---------- 探す（app/works.js） ----------
function search() {
  const hs = Works.search($("q").value);
  $("hits").innerHTML = !$("q").value.trim() ? "" : hs.map(x => `<li><a href="${x.h}"><span class="t">${esc(x.t)}</span><span class="tagk">${esc(x.k)}</span><span class="small muted">${esc(x.s)}</span></a></li>`).join("") || `<li class="small muted" style="padding:6px 2px">見つかりません</li>`;
}

function render() {
  const p = new URLSearchParams(location.search);
  let html;
  if (p.get("n")) html = novelPage(p.get("n"));
  else if (p.get("f")) html = filmPage(p.get("f"));
  else if (p.get("b")) html = libPage(p.get("b"));
  else if (p.get("s")) html = showPage(p.get("s"));
  else if (p.get("o")) html = offPage(p.get("o"));
  else html = `<section class="card"><h1 style="margin-top:0">作品のページ</h1><p class="small muted">本・映画・ドラマ・アニメを上で探すと、その作品の読了・鑑賞の記録、蔵書の版と場所、原作・映画化、手持ちのソフト、配信、SNSの感想を1ページで見られます。各画面の作品の詳細にある「作品のページ」からも開けます。</p></section>`;
  $("work").innerHTML = html;
  // 執筆の欄（資料にした原稿・抜き書き）
  const tg = Works.fromParams(p);
  if (tg && html.includes('class="phead"')) { const real = p.get("b") && Lib.get(p.get("b"))?.nk ? "" : tg; if (real) $("work").insertAdjacentHTML("beforeend", Drafts.workHTML(real)); }
}
$("q").addEventListener("input", search);

(async () => {
  if (!Shelf.token()) { $("main").prepend(UI.keyCard()); return; }
  await Shelf.init({ need: ["works/novels.json", "works/films.json", "works/adaptations.json", "records/library/", "records/reading.json", "records/novels-checker/books.json", "records/films-checker/watched.json", "records/films-checker/offlist.json", "records/shows.json", "records/discs.json", "records/services.json", "records/sns/links.json", "records/settings.json", ...Tickets.paths, ...Drafts.paths] });
  render();
  let t = null;
  Shelf.onAny(() => { if (document.activeElement?.closest?.("#wrCard form")) return; clearTimeout(t); t = setTimeout(() => { Works.reset(); render(); search(); }, 300); });
  Drafts.bind($("work"), render);
  $("work").addEventListener("click", e => {
    const tg = Works.fromParams(new URLSearchParams(location.search)), pick = $("wrPick")?.value;
    if (e.target.closest("[data-wr-add]") && pick) { Drafts.addRef(pick, tg); UI.toast("原稿の資料にしました"); render(); }
    if (e.target.closest("[data-wr-del]") && pick) { Drafts.delRef(pick, tg); UI.toast("原稿の資料から外しました"); render(); }
  });
})();
