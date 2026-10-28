// 購入履歴・欲しいものリストからのまとめての登録（2026-10-23 に読み取った写し import/2026-10-23/ から）
// 1. 写しを読み、登録の入力に直す  2. 下書きで登録してみて、結果を一覧にする（書き込まない）
// 3. 「この内容で登録する」で、今の記録を backup/ に控えてから、ファイルごとに一度に書き込む
"use strict";
const { $, esc } = UI;
UI.topbar("");
// どの日の取り込みか：import.html?d=2026-10-28 のように選ぶ（無ければ最初の 2026-10-23）
const IMPORTS = {
  "2026-10-23": {
    sources: [
      ["kindle", "kindle.json", "Kindle"],
      ["amazon", "amazon-orders.json", "Amazon（紙）"],
      ["rakuten", "rakuten-orders.json", "楽天"],
      ["vb", "valuebooks-orders.json", "バリューブックス"],
      ["kosho", "kosho-orders.json", "日本の古本屋"],
      ["wish", "amazon-wishlist.json", "欲しいものリスト"],
    ],
    lead: "Kindle・Amazon・楽天・バリューブックス・日本の古本屋の購入履歴と、Amazonの欲しいものリストから、蔵書に登録する案です。",
  },
  "2026-10-28": {
    sources: [["honto", "honto.json", "honto（丸善・ジュンク堂など）"]],
    lead: "hontoの購入履歴（hontoカードを出して丸善・ジュンク堂などの店で買った本を含む）とMy本棚から、蔵書に登録する案です。",
  },
};
const DAY = IMPORTS[new URLSearchParams(location.search).get("d")] ? new URLSearchParams(location.search).get("d") : "2026-10-23";
const DIR = `import/${DAY}/`;
const SOURCES = IMPORTS[DAY].sources;
const SRCNAME = Object.fromEntries(SOURCES.map(([k, , n]) => [k, n]));

// ---------- 書名の整え方 ----------
const nfkc = s => String(s || "").normalize("NFKC");
// 末尾のレーベル（(ガガガ文庫) など）・【電子特典つき】・[雑誌] などを外す。巻数だけの括弧 (3) は残す
function cleanTitle(t) {
  let s = nfkc(t).replace(/^(\[[^\]]*\]|【[^】]*】)+/, "").trim();
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/\s*\[[^\]]*\]\s*$/, "").replace(/\s*【(?!極!単行本シリーズ)[^】]*】\s*$/, "").replace(/\s*<[^<>]*>\s*$/, "").replace(/\s*＜[^＜＞]*＞\s*$/, "");
    s = s.replace(/\s*\(([^()]*)\)\s*$/, (m, inner) => /^\s*(第?\d{1,3}巻?|上|中|下|上巻|下巻|前編|後編)\s*$/.test(inner) ? m : "").trim();
    if (s === before) break;
  }
  return s.replace(/\s+/g, " ").trim();
}
// 雑誌の号：「アフタヌーン 2026年8月号」「現代思想(2021 9(vol.49-1)…」
function magIssue(t) {
  const s = nfkc(t);
  let m = s.match(/^(.+?)\s*(\d{4})\s*年\s*(\d{1,2})\s*月\s*号/);
  if (!m) m = s.match(/^(.+?)\s*\(\s*(\d{4})\s+(\d{1,2})\s*\(vol/i);
  if (!m) return null;
  let name = m[1].replace(/\([^()]*\)/g, " ").replace(/\(.*$/, "").replace(/\bVOL\.?\s*\d+/i, "").replace(/[\s(（]+$/, "").replace(/\s+/g, " ").trim();
  if (/NATIONAL GEOGRAPHIC|ナショナル\s*ジオグラフィック/i.test(name)) name = "ナショナル ジオグラフィック日本版";
  return { t: name, issue: `${m[2]}-${String(+m[3]).padStart(2, "0")}` };
}
const isbn13 = asin => /^\d{9}[\dX]$/i.test(asin || "") ? Biblio.isbn10to13(asin) : null;
const firstAuthors = a => String(a || "").split(/\s*,\s*/).slice(0, 3).join("、");
const catHintOf = t => /コミックス|コミック|COMICS|ＫＣ|\bKC\b|MFC|DIGITAL|まんが|マンガ|漫画/i.test(nfkc(t)) ? "漫画" : null;
// 本ではない品（楽天ブックスで買ったゲームなど）
const NOT_BOOK = /Nintendo|Switch|Joy-Con|PS[45]|プレイステーション|バルダーズ・ゲート|DVD|Blu-ray|ブルーレイ|初回限定盤|\bCD\b|フィギュア|グッズ/i;

// ---------- 写しを登録の入力に直す ----------
// 返り値：rows = [{src, raw, inp, extra}]、excluded = [{src, t, why}]
function buildRows(D, bibs) {
  const rows = [], excluded = [];
  const kindleAsins = new Set((D.kindle?.items || []).map(x => x.asin));
  // Kindle
  for (const x of D.kindle?.items || []) {
    if (x.origin !== "Purchase") { excluded.push({ src: "kindle", t: x.t, why: "Prime Readingで借りている本（所有ではない）" }); continue; }
    const mi = magIssue(x.t);
    const inp = mi ? { t: mi.t, issue: mi.issue } : { t: cleanTitle(x.t), a: firstAuthors(x.a), catHint: catHintOf(x.t) };
    Object.assign(inp, { asin: x.asin, media: "ebook", store: "Kindle", src: "purchase", buy: { shop: "Kindle", d: x.d }, bulk: true });
    rows.push({ src: "kindle", raw: x.t, inp, extra: { readCand: x.read === "READ" } });
  }
  // Amazon（紙）：同じASINを何度も注文したものは1冊にまとめ、確認待ちに出す
  const byAsin = new Map();
  for (const x of D.amazon?.items || []) {
    if (kindleAsins.has(x.asin)) continue; // Kindleの注文はKindleの一覧で扱う
    if (!byAsin.has(x.asin)) byAsin.set(x.asin, []);
    byAsin.get(x.asin).push(x);
  }
  for (const [asin, list] of byAsin) {
    list.sort((a, b) => a.d < b.d ? -1 : 1);
    const x = list[0];
    if (NOT_BOOK.test(x.t)) { excluded.push({ src: "amazon", t: x.t, why: "本ではない品" }); continue; }
    const isbn = isbn13(asin), bib = isbn ? bibs.get(isbn) : null;
    const mi = !isbn ? magIssue(x.t) : null;
    const inp = mi ? { t: mi.t, issue: mi.issue } : { t: cleanTitle(x.t), catHint: catHintOf(x.t), isbn: isbn || undefined, bib: bib || undefined };
    Object.assign(inp, { asin: isbn ? undefined : asin, media: "paper", src: "purchase", buy: { shop: "Amazon", d: x.d }, bulk: true });
    const dates = [...new Set(list.map(y => y.d))];
    rows.push({ src: "amazon", raw: x.t, inp, extra: { moreBuys: dates.slice(1).map(d => ({ shop: "Amazon", d })), dupbuy: dates.length > 1 } });
  }
  // 楽天：「書名 （レーベル） [ 著者 ]」「【中古】書名 / 著者」「(1-20巻 最新刊) 全巻セット」
  for (const x of D.rakuten?.items || []) {
    if (NOT_BOOK.test(x.t)) { excluded.push({ src: "rakuten", t: x.t, why: "本ではない品" }); continue; }
    let t = nfkc(x.t).replace(/^(\[[^\]]*\]|【[^】]*】)+/, "").trim(), a = "";
    const am = t.match(/\[\s*([^\]]+?)\s*\]\s*$/); if (am) { a = am[1]; t = t.slice(0, am.index).trim(); }
    const sm = t.match(/^(.*?)\s*\/\s*([^/]+?)\s*(\([^)]*\))?\s*$/); if (sm && !a) { t = sm[1]; a = sm[2]; }
    let vols = null;
    const set = t.match(/\((\d+)\s*-\s*(\d+)\s*巻[^)]*\)\s*全巻セット|<\s*全\s*(\d+)\s*巻セット\s*>|＜\s*全\s*(\d+)\s*巻セット\s*＞/);
    if (set) { const from = set[1] ? +set[1] : 1, to = +(set[2] || set[3] || set[4]); vols = []; for (let i = from; i <= to; i++) vols.push(i); t = t.slice(0, set.index).trim(); }
    t = t.replace(/全巻セット|\[入荷予約\]/g, "").trim();
    const mi = magIssue(t);
    const inp = mi ? { t: mi.t, issue: mi.issue } : { t: cleanTitle(t), a, catHint: vols ? "漫画" : catHintOf(x.t), vols: vols || undefined };
    Object.assign(inp, { media: "paper", src: "purchase", buy: { shop: x.shop === "楽天ブックス" ? "楽天ブックス" : `楽天（${x.shop.replace(/\s*楽天市場店$/, "")}）`, d: x.d }, bulk: true });
    if (/^【中古】/.test(nfkc(x.t))) inp.cond = "中古";
    rows.push({ src: "rakuten", raw: x.t, inp, extra: {} });
  }
  // バリューブックス：書名と状態
  for (const x of D.vb?.items || []) rows.push({ src: "vb", raw: x.t, inp: { t: cleanTitle(x.t), catHint: catHintOf(x.t), media: "paper", src: "purchase", buy: { shop: "バリューブックス", d: x.d }, cond: x.cond ? `中古（状態：${x.cond}）` : "中古", bulk: true }, extra: {} });
  // 日本の古本屋：書名と店
  for (const x of D.kosho?.items || []) {
    let t = nfkc(x.t); let note = "";
    const sm = t.match(/\s*(上下\s*\d+\s*冊揃い|全\s*\d+\s*冊)/); if (sm) { note = sm[1]; t = t.replace(sm[0], " "); }
    rows.push({ src: "kosho", raw: x.t, inp: { t: cleanTitle(t), media: "paper", src: "purchase", buy: { shop: `日本の古本屋（${x.shop}）`, d: x.d }, cond: ["古書", note].filter(Boolean).join("・"), bulk: true }, extra: {} });
  }
  // honto：同じ本を何度か買ったものは1冊にまとめ、確認待ちに出す。「2巻セット」は巻をそろえる
  for (const x of D.honto?.items || []) {
    if (NOT_BOOK.test(x.t)) { excluded.push({ src: "honto", t: x.t, why: "本ではない品" }); continue; }
    let t = nfkc(x.t), vols = null;
    const set = t.match(/[①-⑳\d・、～〜-]*\s*(\d+)\s*巻セット/);
    if (set) { const n = +set[1]; vols = []; for (let i = 1; i <= n; i++) vols.push(i); t = t.slice(0, set.index).replace(/スペシャルプライスパック/, "").trim(); }
    const bib = x.isbn ? bibs.get(x.isbn) : null;
    const mi = !x.isbn ? magIssue(t) : null;
    const inp = mi ? { t: mi.t, issue: mi.issue } : { t: cleanTitle(t), catHint: vols ? "漫画" : catHintOf(t), isbn: x.isbn || undefined, bib: bib || undefined, vols: vols || undefined };
    const buys = x.buys || [];
    Object.assign(inp, { media: x.ebook ? "ebook" : "paper", store: x.ebook ? "honto" : undefined, src: "purchase", buy: buys[0], bulk: true });
    rows.push({ src: "honto", raw: x.raw || x.t, inp, extra: { moreBuys: buys.slice(1), dupbuy: buys.length > 1, dupWhere: "hontoの履歴で" } });
  }
  // 欲しいものリスト：読みたい（未所持）として。リストの名前を残す
  for (const [list, v] of Object.entries(D.wish?.lists || {})) for (const x of v.items || []) {
    const isbn = isbn13(x.asin), bib = isbn ? bibs.get(isbn) : null;
    const a = nfkc(x.by).replace(/\s*\([^)]*\)\s*$/, "");
    rows.push({ src: "wish", raw: x.t, inp: { t: cleanTitle(x.t), a: firstAuthors(a), isbn: isbn || undefined, asin: isbn ? undefined : x.asin, bib: bib || undefined, st: "want", src: "wishlist", media: /Kindle版/.test(x.by) ? "ebook" : "paper", bulk: true }, extra: { wl: list } });
  }
  // 同じ書名で巻数の違う本が2冊以上あれば、シリーズとしてまとめる
  const baseCount = new Map();
  for (const r of rows) { if (r.inp.st === "want" || r.inp.issue) continue; const b = Biblio.splitVolume(Lib.splitEd(r.inp.bib?.t || r.inp.t).base, r.inp.bib?.vol); if (b.vol != null) { const k = Biblio.normTitle(b.base); baseCount.set(k, (baseCount.get(k) || 0) + 1); } }
  for (const r of rows) { if (r.inp.st === "want" || r.inp.issue) continue; const b = Biblio.splitVolume(Lib.splitEd(r.inp.bib?.t || r.inp.t).base, r.inp.bib?.vol); if (b.vol != null && baseCount.get(Biblio.normTitle(b.base)) > 1) r.inp.seriesHint = true; }
  // 古い購入から順に（同じ本が何度か出たとき、先の購入を基にする）。欲しいものリストは最後
  rows.sort((x, y) => (x.src === "wish") - (y.src === "wish") || ((x.inp.buy?.d || "") < (y.inp.buy?.d || "") ? -1 : 1));
  return { rows, excluded };
}

// ---------- 下書きで登録する ----------
async function runAll(rows) {
  const res = [];
  for (const r of rows) {
    const out = await Lib.register(r.inp);
    const it = out.item;
    // 欲しいものリストの名前を残す
    if (out.status === "want" && r.extra.wl) { const x = Lib.get(it.id); x.wl = r.extra.wl; Lib.put(x); }
    // 2回以上注文した本
    if (r.extra.moreBuys?.length) { const x = JSON.parse(JSON.stringify(Lib.get(it.id))); x.buy = x.buy || []; for (const b of r.extra.moreBuys) if (!x.buy.some(y => y.shop === b.shop && y.d === b.d)) x.buy.push(b); Lib.put(x); }
    if (r.extra.dupbuy) Lib.qAdd("dupbuy", it.id, { why: `${r.extra.dupWhere || "Amazonで"}${1 + r.extra.moreBuys.length}回買っています。贈り物か買い直しか教えてください` });
    // Kindleの「読んだ本」の印：読了の候補として確認待ちに出す（自動では読了にしない）
    if (r.extra.readCand) {
      if (it.kind === "series") {
        const ex = Object.values(Lib.queue()).find(q => q.type === "read" && q.target === it.id && (q.ed || "") === (out.ed || ""));
        if (ex) { ex.vols = [...new Set([...(ex.vols || []), out.vol])]; ex.why = `Kindleで「読んだ本」になっています（${ex.vols.join("・")}巻）`; }
        else Lib.qAdd("read", it.id, { why: `Kindleで「読んだ本」になっています（${out.vol}巻）`, vols: [out.vol], ed: out.ed || undefined });
      } else if (!Lib.isRead(it)) Lib.qAdd("read", it.id, { why: "Kindleで「読んだ本」になっています" });
    }
    res.push({ src: r.src, raw: r.raw, status: out.status, filled: out.filled, id: it.id, vol: out.vol, ed: out.ed, title: it.t, kind: it.kind });
  }
  return res;
}

// ---------- 画面 ----------
let DATA = null, BIBS = null, PLAN = null, before = null;
const STATUS = { new: "新しく登録", vol: "シリーズの巻として登録", voldup: "登録済みの巻", dup: "登録済みの本にまとめる", alt: "登録済みの本の別の版", want: "読みたい（未所持）として登録" };

function setMsg(t) { $("msg").textContent = t; }

async function load() {
  setMsg("取り込んだ写しを読んでいます…");
  DATA = {};
  for (const [k, f] of SOURCES) DATA[k] = await Shelf.readRemote(DIR + f);
  const isbns = [];
  for (const x of DATA.amazon?.items || []) { const i = isbn13(x.asin); if (i) isbns.push(i); }
  for (const v of Object.values(DATA.wish?.lists || {})) for (const x of v.items || []) { const i = isbn13(x.asin); if (i) isbns.push(i); }
  for (const x of DATA.honto?.items || []) if (x.isbn) isbns.push(x.isbn);
  setMsg(`書誌を調べています（${isbns.length}冊）…`);
  BIBS = await Biblio.lookupMany(isbns, (n, all) => setMsg(`書誌を調べています（${n}/${all}冊）…`));
  await plan();
}

async function plan() {
  setMsg("登録案を作っています…");
  const { rows, excluded } = buildRows(DATA, BIBS);
  const sumBefore = Lib.ownSummary(); const recBefore = Object.keys(Lib.items()).length; const qBefore = Object.keys(Lib.queue()).length;
  Lib.batchBegin();
  let res;
  try { res = await runAll(rows); }
  catch (e) { Lib.batchDiscard(); throw e; }
  const ch = Lib.batchChanges();
  const after = { sum: Lib.ownSummary(), rec: Object.keys(Lib.items()).length, queue: Object.values(Lib.queue()), items: Lib.items() };
  Lib.batchDiscard();
  PLAN = { rows, res, excluded, ch, after, before: { sum: sumBefore, rec: recBefore, q: qBefore } };
  render();
  setMsg("");
}

function render() {
  const { res, excluded, after, before: b } = PLAN;
  const srcs = SOURCES.map(([k]) => k);
  const st = Object.keys(STATUS);
  const cnt = {}; for (const r of res) { cnt[r.src] = cnt[r.src] || {}; cnt[r.src][r.status] = (cnt[r.src][r.status] || 0) + 1; cnt[r.src].filled = (cnt[r.src].filled || 0) + (r.filled ? 1 : 0); }
  const exc = {}; for (const x of excluded) exc[x.src] = (exc[x.src] || 0) + 1;
  $("summary").innerHTML = `
    <div class="row" style="gap:24px;flex-wrap:wrap">
      <div><div class="small muted">記録の件数</div><div class="mono big">${b.rec} → ${after.rec}</div></div>
      <div><div class="small muted">所有している冊数</div><div class="mono big">${b.sum.books} → ${after.sum.books}</div></div>
      <div><div class="small muted">読みたい（未所持）</div><div class="mono big">${Object.values(after.items).filter(x => x.st === "want").length}</div></div>
      <div><div class="small muted">確認待ち</div><div class="mono big">${b.q} → ${after.queue.length}</div></div>
    </div>
    <div class="tbl"><table><thead><tr><th>取得元</th><th>件数</th>${st.map(s => `<th>${esc(STATUS[s])}</th>`).join("")}<th>うち空欄を埋めた</th><th>登録しない</th></tr></thead>
    <tbody>${srcs.map(s => `<tr><th>${esc(SRCNAME[s])}</th><td>${res.filter(r => r.src === s).length + (exc[s] || 0)}</td>${st.map(x => `<td>${cnt[s]?.[x] || ""}</td>`).join("")}<td>${cnt[s]?.filled || ""}</td><td>${exc[s] || ""}</td></tr>`).join("")}</tbody></table></div>`;
  // 確認待ち（今回増える分）
  const QN = { link: "チェッカーとの結び付け", same: "同じ本かどうか", dupbuy: "2回以上買った本", read: "読了の候補", cat: "本の種類", bib: "書誌が見つからない本", check: "書誌の確認" };
  const byType = {}; for (const q of after.queue) { if (Object.values(Lib.queue()).some(o => o.type === q.type && o.target === q.target)) continue; (byType[q.type] = byType[q.type] || []).push(q); }
  $("queue").innerHTML = Object.entries(byType).map(([t, list]) => `<details${list.length <= 30 ? " open" : ""}><summary><b>${esc(QN[t] || t)}</b> ${list.length}件</summary><ul class="plain">${list.map(q => { const it = after.items[q.target]; return `<li><b>${esc(it?.t || "")}</b> <span class="small muted">${esc(it?.a || "")}・${esc(q.why || "")}</span></li>`; }).join("")}</ul></details>`).join("") || `<p class="muted">新しく増える確認待ちはありません</p>`;
  $("excluded").innerHTML = excluded.length ? `<ul class="plain">${excluded.map(x => `<li>${esc(SRCNAME[x.src])}：${esc(x.t)} <span class="small muted">${esc(x.why)}</span></li>`).join("")}</ul>` : `<p class="muted">ありません</p>`;
  $("fSrc").innerHTML = `<option value="">取得元：すべて</option>` + srcs.map(s => `<option value="${s}">${esc(SRCNAME[s])}</option>`).join("");
  $("fSt").innerHTML = `<option value="">結果：すべて</option>` + st.map(s => `<option value="${s}">${esc(STATUS[s])}</option>`).join("") + `<option value="filled">空欄を埋めたもの</option>`;
  renderRows();
  $("commitBox").hidden = false;
}
let shown = 200;
function renderRows() {
  const q = Biblio.norm($("fQ").value), s = $("fSrc").value, t = $("fSt").value;
  const rows = PLAN.res.filter(r => (!s || r.src === s) && (!t || (t === "filled" ? r.filled : r.status === t)) && (!q || Biblio.norm(r.raw + " " + r.title).includes(q)));
  $("rowsN").textContent = `${rows.length}件`;
  $("rows").innerHTML = rows.slice(0, shown).map(r => `<li><div class="t">${esc(r.title)}${r.vol != null ? ` <span class="pill">${r.ed ? esc(r.ed) + " " : ""}${esc(Array.isArray(r.vol) ? r.vol[0] + "〜" + r.vol[r.vol.length - 1] : r.vol)}${/^\d/.test(String(r.vol)) && !/-/.test(String(r.vol)) ? "巻" : ""}</span>` : ""}</div><div class="m"><span>${esc(SRCNAME[r.src])}</span><span class="pill ${r.status === "dup" || r.status === "alt" ? "acc" : ""}">${esc(STATUS[r.status])}</span>${r.filled ? `<span class="pill">空欄を埋めた</span>` : ""}<span class="small muted">元の表記：${esc(r.raw)}</span></div></li>`).join("") || `<li class="empty">該当なし</li>`;
  $("more").hidden = rows.length <= shown;
}
["fQ", "fSrc", "fSt"].forEach(id => $(id).addEventListener(id === "fQ" ? "input" : "change", () => { shown = 200; renderRows(); }));
$("more").onclick = () => { shown += 400; renderRows(); };

$("commitBtn").onclick = () => { $("confirmBox").hidden = false; $("commitBtn").hidden = true; };
$("cancelBtn").onclick = () => { $("confirmBox").hidden = true; $("commitBtn").hidden = false; };
$("yesBtn").onclick = async () => {
  $("confirmBox").hidden = true;
  setMsg("今の記録を控えています…");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const paths = Shelf.list("records/");
  for (const p of paths) { const d = Shelf.read(p); if (d) Shelf.writeDoc(`backup/${stamp}/${p}`, d); }
  setMsg("登録しています…");
  Lib.batchBegin();
  try { await runAll(PLAN.rows); } catch (e) { Lib.batchDiscard(); setMsg("登録できませんでした：" + e.message); return; }
  const n = Lib.batchCommit();
  const st = JSON.parse(JSON.stringify(Lib.settings())); st.imports = { ...(st.imports || {}), [DIR]: new Date().toISOString() }; Shelf.writeDoc(Lib.P.settings, st);
  setMsg(`登録しました（${n}個のファイルを送っています。上の「保存済み」を確かめてください）。控えは backup/${stamp}/ にあります。`);
  $("doneLinks").hidden = false;
};

(async () => {
  $("day").textContent = `IMPORT · ${DAY}`; $("lead").textContent = IMPORTS[DAY].lead;
  if (!Shelf.token()) { $("main").prepend(UI.keyCard()); return; }
  await Shelf.init();
  const n = Shelf.read(Lib.P.novels); if (n) Biblio.setNovels(n);
  // 一度登録した取り込みは、二重に登録しないよう、もう案を作らない
  const doneAt = Lib.settings().imports?.[DIR];
  if (doneAt) { setMsg(`この取り込みは ${doneAt.slice(0, 10)} に登録済みです。もう一度登録する必要はありません。`); return; }
  Lib.reconcile();
  try { await load(); } catch (e) { setMsg("読み込めませんでした：" + e.message); }
})();
