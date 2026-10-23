// 蔵書の画面の動き
"use strict";
const { $, esc } = UI;
UI.topbar("library.html");
const CATS = Biblio.CATS;

// ---------- 画面の切り替え ----------
const TABS = ["register", "list", "queue", "stats", "places", "booklog", "photos", "off"];
function showTab() {
  const t = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "register";
  for (const x of TABS) { $("p-" + x).hidden = x !== t; document.querySelector(`[data-tab="${x}"]`).setAttribute("aria-current", x === t ? "true" : "false"); }
  render(t);
}
addEventListener("hashchange", showTab);
function render(t = location.hash.slice(1) || "register") {
  $("qCount").textContent = Object.keys(Lib.queue()).length || "";
  const sum = Lib.ownSummary(); $("libBig").innerHTML = `${sum.books}<small> 冊</small>`; $("libSub").textContent = `を所有・うち積読 ${sum.tsun}件`; $("eyebrow").textContent = `LIBRARY · ${sum.records} RECORDS`;
  if (t === "list") renderList();
  else if (t === "queue") renderQueue();
  else if (t === "stats") renderStats();
  else if (t === "places") renderPlaces();
  else if (t === "booklog") renderBooklog();
  else if (t === "off") renderOff();
  else if (t === "photos") { if (typeof renderPhotos === "function") renderPhotos(); }
  else renderLocSelect();
}

(async () => {
  if (!Shelf.token()) { $("main").prepend(UI.keyCard()); return; }
  await Shelf.init();
  const ready = () => { const n = Shelf.read(Lib.P.novels), f = Shelf.read(Lib.P.films); if (n) Biblio.setNovels(n); if (f) Biblio.setFilms(f); };
  ready(); Shelf.on(Lib.P.novels, ready); Shelf.on(Lib.P.films, ready);
  Lib.reconcile();
  fixBooklogRead();
  if (typeof runFixes === "function") { try { await runFixes(); } catch (e) { console.error(e); } }
  Shelf.on(Lib.P.novelDoc, (d, remote) => { if (remote) { Lib.reconcile(); render(); } });
  let t = null;
  Shelf.onAny((p, remote) => { if (remote && /records\//.test(p)) { clearTimeout(t); t = setTimeout(() => render(), 300); } });
  fillSelects();
  showTab();
})();

function fillSelects() {
  $("mc").innerHTML = CATS.map(c => `<option>${esc(c)}</option>`).join("");
  $("fCat").innerHTML = `<option value="">種類：すべて</option>` + CATS.map(c => `<option>${esc(c)}</option>`).join("");
}

// ---------- 登録 ----------
let mode = "now", media = "paper";
const seg = (a, b, on) => { $(a).setAttribute("aria-pressed", on ? "true" : "false"); $(b).setAttribute("aria-pressed", on ? "false" : "true"); };
$("mNow").onclick = () => { mode = "now"; seg("mNow", "mBatch", true); $("batchBox").hidden = true; };
$("mBatch").onclick = () => { mode = "batch"; seg("mNow", "mBatch", false); $("batchBox").hidden = false; renderBatch(); };
$("mdPaper").onclick = () => { media = "paper"; seg("mdPaper", "mdEbook", true); };
$("mdEbook").onclick = () => { media = "ebook"; seg("mdPaper", "mdEbook", false); };

let curLoc = sessionStorage.getItem("shelf.curLoc") || "";
function renderLocSelect() {
  const pl = Lib.places();
  $("curLoc").innerHTML = `<option value="">（指定しない）</option>` + Object.entries(pl).map(([c, n]) => `<option value="${esc(n)}"${n === curLoc ? " selected" : ""}>${esc(n)}</option>`).join("");
}
$("curLoc").onchange = () => { curLoc = $("curLoc").value; sessionStorage.setItem("shelf.curLoc", curLoc); };

let stopCam = null;
$("camBtn").onclick = async () => {
  $("videoBox").hidden = false; $("camBtn").hidden = true; $("camStop").hidden = false;
  try { stopCam = await Scan.startCamera($("video"), onCode, e => { $("engine").hidden = false; $("engine").textContent = "読み取り：" + e; }); }
  catch (e) { UI.toast("カメラを使えません：" + (e.name || e.message)); $("camStop").onclick(); }
};
$("camStop").onclick = () => { if (stopCam) stopCam(); stopCam = null; $("videoBox").hidden = true; $("camBtn").hidden = false; $("camStop").hidden = true; $("engine").hidden = true; };
Scan.bindInput($("scanIn"), (c, s) => onCode(c, "scanner"));

const logRows = [];
function log(cls, html, undo) {
  const id = "lg" + Date.now() + Math.random().toString(36).slice(2, 5);
  logRows.unshift({ id, cls, html, undo });
  if (logRows.length > 60) logRows.length = 60;
  $("regLog").innerHTML = logRows.map(r => `<div class="${r.cls}" id="${r.id}">${r.html}${r.undo ? ` <button type="button" class="quiet small" data-undo="${r.id}">取り消す</button>` : ""}</div>`).join("");
}
$("regLog").addEventListener("click", e => {
  const b = e.target.closest("[data-undo]"); if (!b) return;
  const r = logRows.find(x => x.id === b.dataset.undo); if (!r || !r.undo) return;
  r.undo(); r.undo = null; r.cls = "ng"; r.html = "取り消しました：" + r.html; log("", "取り消しました"); logRows.shift();
  $("regLog").innerHTML = logRows.map(x => `<div class="${x.cls}" id="${x.id}">${x.html}${x.undo ? ` <button type="button" class="quiet small" data-undo="${x.id}">取り消す</button>` : ""}</div>`).join("");
});

let lastReg = null, pendingC = null; // 上段と下段を組み合わせるため
async function onCode(code, src = "camera") {
  const c = Biblio.classify(code);
  if (c.kind === "label") {
    const name = Lib.places()[c.code];
    if (name) { curLoc = name; sessionStorage.setItem("shelf.curLoc", name); renderLocSelect(); Scan.beep("ok"); log("ok", `場所を「${esc(name)}」に切り替えました`); }
    else { Scan.beep("ng"); log("ng", `登録されていない場所ラベルです（${esc(c.code)}）`); }
    return;
  }
  if (c.kind === "lower") {
    if (lastReg && Date.now() - lastReg.at < 15000) { applyC(lastReg, c.ccode); Scan.beep("ok"); }
    else { pendingC = { c: c.ccode, at: Date.now() }; Scan.beep("warn"); log("warn", `下段（${esc(c.ccode)} ${esc(Biblio.cText(c.ccode))}）を覚えました。続けて上段を読んでください`); }
    return;
  }
  if (c.kind === "bad" || c.kind === "other") { Scan.beep("ng"); log("ng", `本のバーコードではありません（${esc(code)}）`); return; }
  if (mode === "batch") { addBatch(c.code); return; }
  await registerCode(c, src);
}
function applyC(reg, ccode) {
  const it = Lib.get(reg.id); if (!it) return;
  const x = JSON.parse(JSON.stringify(it));
  if (!x.ccode) x.ccode = ccode;
  const cat = Biblio.catFromC(ccode), fmt = Biblio.formatFromC(ccode);
  if (cat && (!x.catAuto || x.cat === "その他" || !it.ccode)) { x.cat = cat; x.catAuto = true; }
  if (fmt && x.media !== "ebook") x.fmt = fmt;
  Lib.put(x);
  for (const [id, q] of Object.entries(Lib.queue())) if (q.target === x.id && q.type === "cat") Lib.qDel(id);
  log("ok", `　└ 下段から：${esc(Biblio.cText(ccode))} → 種類「${esc(x.cat)}」`);
}
async function registerCode(c, src) {
  let ccode = pendingC && Date.now() - pendingC.at < 15000 ? pendingC.c : null; pendingC = null;
  const inp = { src, loc: curLoc || undefined, media, ccode: ccode || undefined };
  if (c.kind === "magazine") { Object.assign(inp, { mag: c.mag, magMonth: c.month, t: `雑誌 ${c.mag}（${c.month}月号）` }); }
  else {
    inp.isbn = c.code;
    const dupe = Lib.byIsbn(c.code);
    if (!dupe) { log("", `<span class="mono">${esc(c.code)}</span> 調べています…`); inp.bib = await Biblio.lookup(c.code); logRows.shift(); }
  }
  const r = await Lib.register(inp);
  const it = r.item;
  if (r.status === "alt") { Scan.beep("ok"); lastReg = { id: it.id, at: Date.now() }; log("ok", `別の版として追加：<b>${esc(it.t)}</b>（同じ作品の記録にまとめました）`); return; }
  if (r.status === "dup" || r.status === "voldup") {
    Scan.beep("dup");
    log("dup", `所持済み：<b>${esc(it.t)}</b>${r.vol != null ? ` ${r.ed ? esc(r.ed) + " " : ""}${r.vol}巻` : ""}・${esc(it.loc || "場所未設定")}${r.filled ? `<span class="pill">空いていた項目を埋めました</span>` : ""}`);
    return;
  }
  Scan.beep(r.match?.status === "wait" || !inp.bib && c.kind !== "magazine" ? "warn" : "ok");
  lastReg = { id: it.id, at: Date.now() };
  const tags = [];
  if (r.status === "vol") tags.push(`<span class="pill acc">${r.newSeries ? "シリーズを新しく作成" : "シリーズに追加"}</span>`);
  if (it.nk) tags.push(`<span class="pill acc">必読書と結び付け</span>`);
  if (r.upgraded) tags.push(`<span class="pill">チェッカーの仮登録を本の情報で更新</span>`);
  if (r.match?.status === "wait") tags.push(`<span class="pill warn">結び付けは確認待ち</span>`);
  if (!inp.bib && c.kind !== "magazine") tags.push(`<span class="pill warn">書誌なし・確認待ち</span>`);
  const undo = r.status === "vol" && !r.newSeries
    ? () => { const s = JSON.parse(JSON.stringify(Lib.get(it.id))); if (r.ed) delete s.eds?.[r.ed]?.vols?.[r.vol]; else delete s.vols[r.vol]; Lib.put(s); }
    : () => { if (it.nk) Lib.setOwn(it.nk, false); Lib.qDelFor(it.id); Lib.remove(it.id); };
  log("ok", `登録：<b>${esc(it.t)}</b>${r.vol != null ? ` ${r.ed ? esc(r.ed) + " " : ""}${r.vol}巻` : ""}・${esc(it.cat)}${it.loc ? "・" + esc(it.loc) : ""} ${tags.join(" ")}`, undo);
  if (ccode) applyC(lastReg, ccode);
  render("register");
}

// ためて後で確認
const BKEY = "shelf.batch";
const batch = () => { try { return JSON.parse(localStorage.getItem(BKEY) || "[]"); } catch { return []; } };
const setBatch = b => { try { localStorage.setItem(BKEY, JSON.stringify(b)); } catch {} };
function addBatch(code) {
  const b = batch();
  if (b.some(x => x.code === code)) { Scan.beep("dup"); return; }
  const owned = Lib.byIsbn(code);
  b.unshift({ code, loc: curLoc, media, at: Date.now(), owned: !!owned });
  setBatch(b); Scan.beep(owned ? "dup" : "ok"); renderBatch();
  if (!owned) Biblio.lookup(code).then(bib => { const x = batch(); const e = x.find(y => y.code === code); if (e) { e.t = bib?.t || "（書誌なし）"; e.a = bib?.a || ""; setBatch(x); renderBatch(); } });
}
function renderBatch() {
  const b = batch();
  $("batchN").textContent = `${b.length}件`;
  $("batchList").innerHTML = b.map((x, i) => `<li><div><div class="t">${esc(x.t || "調べています…")}</div><div class="m"><span class="mono">${esc(x.code)}</span>${x.a ? `<span>${esc(x.a)}</span>` : ""}${x.loc ? `<span>${esc(x.loc)}</span>` : ""}${x.owned ? `<span class="pill">所持済み</span>` : ""}</div></div><button type="button" class="quiet small" data-bdel="${i}">外す</button></li>`).join("") || `<li class="empty">まだありません</li>`;
}
$("batchList").addEventListener("click", e => { const b = e.target.closest("[data-bdel]"); if (!b) return; const x = batch(); x.splice(+b.dataset.bdel, 1); setBatch(x); renderBatch(); });
$("batchClear").onclick = () => { setBatch([]); renderBatch(); };
$("batchReg").onclick = async () => {
  const b = batch(); if (!b.length) return;
  $("batchReg").disabled = true;
  let n = 0;
  for (const x of b.slice().reverse()) {
    if (x.owned || Lib.byIsbn(x.code)) continue;
    const bib = await Biblio.lookup(x.code);
    const r = await Lib.register({ isbn: x.code, bib, src: "scanner", loc: x.loc || undefined, media: x.media });
    if (r.status === "new" || r.status === "vol") n++;
    log("ok", `登録：<b>${esc(r.item.t)}</b>${r.vol != null ? ` ${r.vol}巻` : ""}`);
  }
  setBatch([]); renderBatch(); $("batchReg").disabled = false; UI.toast(`${n}件を登録しました`);
};

// 書名で探す（国立国会図書館の検索）
$("tqBtn").onclick = async () => {
  const q = $("tq").value.trim(); if (!q) return;
  $("tqList").innerHTML = `<li class="empty">探しています…</li>`;
  try {
    const r = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(q)}&cnt=20&mediatype=1`);
    const x = new DOMParser().parseFromString(await r.text(), "application/xml");
    const items = [...x.getElementsByTagName("item")].map(it => {
      const g = n => it.getElementsByTagName(n)[0]?.textContent?.trim() || "";
      const isbn = [...it.getElementsByTagName("dc:identifier")].map(e => e.textContent).map(Biblio.normIsbn).find(Boolean);
      return { t: g("dc:title") || g("title"), a: g("dc:creator"), pub: g("dc:publisher"), y: g("dcterms:issued"), isbn };
    });
    $("tqList").innerHTML = items.map((it, i) => `<li><div><div class="t">${esc(it.t)}</div><div class="m"><span>${esc(it.a)}</span><span>${esc(it.pub)}</span><span>${esc(it.y)}</span>${it.isbn ? `<span class="mono">${it.isbn}</span>` : `<span>ISBNなし</span>`}</div></div><button type="button" class="small" data-tq="${i}">登録</button></li>`).join("") || `<li class="empty">見つかりませんでした</li>`;
    $("tqList").onclick = async e => {
      const b = e.target.closest("[data-tq]"); if (!b) return;
      const it = items[+b.dataset.tq]; b.disabled = true;
      if (it.isbn) await registerCode({ kind: "isbn", code: it.isbn }, "search");
      else { const r = await Lib.register({ t: it.t, a: it.a, src: "search", loc: curLoc || undefined, media, bib: { t: it.t, a: it.a, pub: it.pub, y: parseInt(it.y) || null } }); log("ok", `登録：<b>${esc(r.item.t)}</b>`); }
      b.textContent = "登録済み";
    };
  } catch { $("tqList").innerHTML = `<li class="empty">検索できませんでした。電波を確かめてください</li>`; }
};
$("tq").addEventListener("keydown", e => { if (e.key === "Enter") $("tqBtn").click(); });

// 手入力
$("mSave").onclick = async () => {
  const t = $("mt").value.trim(); if (!t) { UI.toast("書名を入れてください"); return; }
  const r = await Lib.register({ t, a: $("ma").value.trim(), src: "manual", loc: curLoc || undefined, media, bib: { t, a: $("ma").value.trim(), pub: $("mp").value.trim() } });
  const it = JSON.parse(JSON.stringify(r.item)); it.cat = $("mc").value; it.catAuto = false; Lib.put(it); Lib.qDelFor(it.id);
  log("ok", `登録：<b>${esc(it.t)}</b>・${esc(it.cat)}`);
  $("mt").value = $("ma").value = $("mp").value = "";
};

// ---------- 一覧 ----------
let LST = { q: "", sort: "added", cat: "", media: "", loc: "", read: "", link: "" }, shown = 100;
const stack = [];
function syncListControls() { $("q").value = LST.q; $("sort").value = LST.sort; $("fCat").value = LST.cat; $("fMedia").value = LST.media; $("fLoc").value = LST.loc; $("fRead").value = LST.read; $("fLink").value = LST.link; $("backBtn").hidden = !stack.length || location.hash !== "#list"; }
for (const [id, key] of [["q", "q"], ["sort", "sort"], ["fCat", "cat"], ["fMedia", "media"], ["fLoc", "loc"], ["fRead", "read"], ["fLink", "link"]])
  $(id).addEventListener(id === "q" ? "input" : "change", () => { LST[key] = $(id).value; shown = 100; renderList(); });
$("backBtn").onclick = () => { const s = stack.pop(); if (s) { LST = s; shown = 100; renderList(); } };
function pushState(patch) { stack.push({ ...LST }); Object.assign(LST, patch); shown = 100; renderList(); window.scrollTo(0, 0); }
const searchKey = it => Biblio.norm([it.t, it.a, it.pub, it.label, it.isbn, it.asin, it.loc, it.eloc, it.note, ...Lib.volMaps(it).flatMap(([, m]) => Object.values(m).map(v => v.isbn))].filter(Boolean).join(" "));
function listRows() {
  const q = Biblio.norm(LST.q);
  // 「読みたい（未所持）」は、所有していない読みたい本だけの一覧にする（並べ替えはほかと同じ）
  let rows = Object.values(Lib.items()).filter(it => LST.read === "want" ? it.st === "want" : it.st === "own");
  if (q) rows = rows.filter(it => searchKey(it).includes(q));
  if (LST.cat) rows = rows.filter(it => it.cat === LST.cat);
  if (LST.media) rows = rows.filter(it => { const m = it.media || "paper"; return m === LST.media || m === "both"; });
  if (LST.loc) rows = rows.filter(it => (it.loc || "") === (LST.loc === "-" ? "" : LST.loc));
  if (LST.read && LST.read !== "want") rows = rows.filter(it => LST.read === "read" ? Lib.isRead(it) : !Lib.isRead(it));
  if (LST.link) rows = rows.filter(it => LST.link === "yes" ? !!it.nk : LST.link === "wait" ? it.link === "wait" : !it.nk && it.link !== "wait");
  const k = { title: it => Biblio.norm(it.t), author: it => Biblio.norm(it.a), pub: it => Biblio.norm(it.pub), loc: it => it.loc || "￿", year: it => it.y || 9999, added: it => -(Date.parse(it.added) || 0) }[LST.sort];
  rows.sort((a, b) => { const x = k(a), y = k(b); return x < y ? -1 : x > y ? 1 : 0; });
  return rows;
}
function renderList() {
  const locs = [...new Set(Object.values(Lib.items()).map(it => it.loc).filter(Boolean))].sort();
  $("fLoc").innerHTML = `<option value="">保管場所：すべて</option><option value="-">（未設定）</option>` + locs.map(l => `<option>${esc(l)}</option>`).join("");
  syncListControls();
  const rows = listRows();
  $("listCount").textContent = `${rows.length}件`;
  $("list").innerHTML = rows.slice(0, shown).map(rowHtml).join("") || `<li class="empty">該当する本はありません</li>`;
  $("more").hidden = rows.length <= shown;
}
$("more").onclick = () => { shown += 200; renderList(); };
function volSummary(it) {
  if (it.issues) {
    const own = Object.entries(it.vols || {}).filter(([, v]) => v.own).map(([n]) => n).sort();
    const last = own[own.length - 1];
    return `所持 ${own.length}号${last ? `（最新 ${last.replace(/^(\d{4})-0?(\d+)$/, "$1年$2月号")}）` : ""}`;
  }
  const eds = Object.entries(it.eds || {}).map(([e, x]) => `${e} ${Object.values(x.vols || {}).filter(v => v.own).length}巻`);
  return baseVolSummary(it) + (eds.length ? `・${eds.join("・")}` : "");
}
function baseVolSummary(it) {
  const own = Object.entries(it.vols || {}).filter(([, v]) => v.own).map(([n]) => +n).sort((a, b) => a - b);
  if (!own.length && it.eds) return "元の版 0巻";
  const read = Object.entries(it.vols || {}).filter(([, v]) => v.read).map(([n]) => +n);
  const max = Math.max(it.total || 0, ...own, 0);
  const miss = []; for (let i = 1; i <= max; i++) if (!own.includes(i)) miss.push(i);
  return `所持 ${own.length}${it.total ? "/" + it.total : ""}巻${miss.length ? `（${miss.slice(0, 6).join("・")}${miss.length > 6 ? "…" : ""}巻欠）` : ""}・読了 ${read.length}巻`;
}
function rowHtml(it) {
  const read = Lib.isRead(it);
  const meta = [
    it.a ? `<button type="button" class="chip" data-by="author" data-v="${esc(it.a)}">${esc(it.a)}</button>` : "",
    it.pub ? `<button type="button" class="chip" data-by="pub" data-v="${esc(it.pub)}">${esc(it.pub)}</button>` : "",
    it.loc ? `<button type="button" class="chip" data-by="loc" data-v="${esc(it.loc)}">${esc(it.loc)}</button>` : `<span>場所未設定</span>`,
    `<span>${esc(it.cat)}${it.fmt ? "・" + esc(it.fmt) : ""}</span>`,
  ].filter(Boolean).join("");
  const pills = [
    it.kind === "series" ? `<span class="pill acc">${esc(volSummary(it))}</span>` : "",
    it.media === "ebook" ? `<span class="pill">電子</span>` : it.media === "both" ? `<span class="pill">紙＋電子</span>` : "",
    it.st === "want" ? `<span class="pill acc">読みたい（未所持）</span>` : "",
    it.nk ? `<span class="pill acc">必読書</span>` : it.link === "wait" ? `<span class="pill warn">結び付け確認待ち</span>` : "",
    it.kind !== "series" && it.st !== "want" ? (read ? `<span class="pill ok">読了</span>` : `<span class="pill">未読</span>`) : "",
  ].join(" ");
  return `<li><div class="li-wrap">${it.cover ? `<img class="cover" src="${esc(it.cover)}" alt="" loading="lazy">` : ""}<div><button type="button" class="open" data-open="${esc(it.id)}"><span class="t">${esc(it.t)}</span></button><div class="m">${meta}</div><div>${pills}</div></div></div></li>`;
}
$("list").addEventListener("click", e => {
  const o = e.target.closest("[data-open]"); if (o) { openDetail(o.dataset.open); return; }
  const c = e.target.closest("[data-by]");
  if (c) { const by = c.dataset.by, v = c.dataset.v; pushState(by === "loc" ? { loc: v, q: "", sort: "title" } : { q: v, sort: by === "author" ? "year" : "title" }); }
});

// ---------- 詳細 ----------
function openDetail(id) {
  const it0 = Lib.get(id); if (!it0) return;
  curEd = "";
  const it = JSON.parse(JSON.stringify(it0));
  const works = Shelf.read(Lib.P.novels);
  const work = it.nk && works ? works.books.find(b => b.k === it.nk) : null;
  const read = Lib.isRead(it), rd = Lib.readDate(it);
  const places = Object.values(Lib.places());
  const f = (key, label, type = "text") => `<label class="f">${label}<input type="${type}" data-k="${key}" value="${esc(it[key] ?? "")}"></label>`;
  const html = `
    <div class="grid2">
      ${f("t", "書名")}${f("a", "著者")}
      <label class="f">種類<select data-k="cat">${CATS.map(c => `<option${c === it.cat ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="f">判型<select data-k="fmt"><option value="">（未設定）</option>${Biblio.FORMATS.map(c => `<option${c === it.fmt ? " selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label class="f">紙か電子か<select data-k="media"><option value="paper"${!it.media || it.media === "paper" ? " selected" : ""}>紙</option><option value="ebook"${it.media === "ebook" ? " selected" : ""}>電子</option><option value="both"${it.media === "both" ? " selected" : ""}>紙と電子の両方</option></select></label>
      <label class="f">保管場所<input type="text" data-k="loc" list="plDl" value="${esc(it.loc || "")}"><datalist id="plDl">${places.map(p => `<option value="${esc(p)}">`).join("")}</datalist></label>
      ${f("pub", "出版社")}${f("label", "レーベル")}${f("tr", "訳者")}${f("y", "刊行年", "number")}
      ${it.kind !== "series" ? f("isbn", "ISBN") : ""}${f("note", "版のメモ")}
    </div>
    ${it.buy?.length ? `<p class="small muted">購入：${it.buy.map(b => esc([b.d, b.shop, b.v ? b.v + (it.issues ? "" : "巻") : "", b.ed || ""].filter(Boolean).join(" "))).join("／")}</p>` : ""}
    ${it.alt?.length ? `<p class="small muted">ほかの版：${it.alt.map(x => esc([x.fmt, x.pub, x.isbn, x.media === "ebook" ? "電子" : ""].filter(Boolean).join(" "))).join("／")}</p>` : ""}
    ${it.kind === "series" ? seriesHtml(it) : `
    <div class="row"><label class="row" style="gap:6px"><input type="checkbox" id="dRead"${read ? " checked" : ""}> 読了</label>
      <input type="date" id="dReadDate" value="${esc(rd)}" aria-label="読了日"><span class="small muted">${it.nk ? "必読書チェッカーと共有しています" : ""}</span></div>`}
    <div class="card" style="background:var(--bg)">
      <h3>必読書チェッカーとの結び付き</h3>
      ${work ? `<p><b>${esc(work.t)}</b>（${esc(work.a)}・${work.y}）<span class="pill acc">${esc(Biblio.tierNm(work.sc))}</span></p><div class="row"><a class="btn quiet small" href="novels.html">チェッカーを開く</a><button type="button" class="quiet small" id="dUnlink">結び付けを外す</button></div>`
        : `<p class="small muted">結び付いていません</p>`}
      <div class="row"><input type="search" id="dWq" class="grow" placeholder="作品名で探して結び付ける" aria-label="作品名で探す"><button type="button" class="small quiet" id="dWbtn">探す</button></div>
      <div class="cands" id="dWres"></div>
    </div>
    <div class="row">
      <span class="small muted grow">状態：${{ own: "所有", off: "所有を外した", gone: "手放した", want: "読みたい（未所持）" }[it.st]}・登録の入口：${esc(it.src)}</span>
      ${it.st === "want" ? `<button type="button" class="small" data-st="own">買った（所有にする）</button>` : it.st !== "own" ? `<button type="button" class="small" data-st="own">所有に戻す</button>` : `<button type="button" class="quiet small" data-st="off">所有を外す</button><button type="button" class="quiet small" data-st="gone">手放した</button>`}
    </div>
    <div class="row"><button type="button" id="dSave">保存する</button><span class="grow"></span><button type="button" class="danger small" id="dDel">記録を消す</button></div>
    <p class="small" id="dDelConfirm" hidden>本当に消しますか？ 消した記録は戻せません。<button type="button" class="danger small" id="dDelYes">消す</button></p>`;
  const d = UI.dialog(it.t || "詳細", html, () => render());
  const q = s => d.querySelector(s);
  q("#dSave").onclick = () => {
    d.querySelectorAll("[data-k]").forEach(el => { let v = el.value.trim(); if (el.dataset.k === "y") v = v ? +v : null; if (v === "" || v == null) delete it[el.dataset.k]; else it[el.dataset.k] = v; });
    if (it.cat !== it0.cat) { it.catAuto = false; for (const [qid, x] of Object.entries(Lib.queue())) if (x.target === it.id && x.type === "cat") Lib.qDel(qid); }
    if (it.isbn) it.isbn = Biblio.normIsbn(it.isbn) || it.isbn;
    Lib.put(it);
    if (it.kind !== "series") {
      const on = q("#dRead").checked, date = q("#dReadDate").value;
      if (on !== read || (on && date !== rd)) Lib.setRead(it, on, date || null);
    }
    UI.toast("保存しました"); d.close();
  };
  d.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { Lib.setStatus(it0, b.dataset.st); UI.toast(it0.st === "want" ? "所有にしました" : { own: "所有に戻しました", off: "所有を外しました", gone: "手放したことにしました" }[b.dataset.st]); d.close(); });
  q("#dDel").onclick = () => { q("#dDelConfirm").hidden = false; };
  q("#dDelYes").onclick = () => { if (it0.nk) Lib.setOwn(it0.nk, false); Lib.qDelFor(it0.id); Lib.remove(it0.id); UI.toast("消しました"); d.close(); };
  if (q("#dUnlink")) q("#dUnlink").onclick = () => { Lib.link(it0, null); UI.toast("結び付けを外しました"); d.close(); };
  q("#dWbtn").onclick = () => {
    const k = Biblio.norm(q("#dWq").value); if (!k || !works) return;
    const hits = works.books.filter(b => Biblio.norm(b.t + " " + (b.o || "")).includes(k)).slice(0, 8);
    q("#dWres").innerHTML = hits.map(b => `<button type="button" data-wk="${b.k}">${esc(b.t)}（${esc(b.a)}・${b.y}）</button>`).join("") || `<p class="small muted">見つかりませんでした</p>`;
  };
  q("#dWres").onclick = e => { const b = e.target.closest("[data-wk]"); if (!b) return; Lib.link(it0, b.dataset.wk); UI.toast("結び付けました"); d.close(); };
  if (it.kind === "series") bindSeries(d, it);
}
// 巻ごとの所持と読了。版違い（モノクロ版など）は版を切り替えて扱う。雑誌は号の一覧を出す
let curEd = "";
const volMap = (it, ed) => { if (!ed) return (it.vols = it.vols || {}); it.eds = it.eds || {}; it.eds[ed] = it.eds[ed] || { vols: {} }; return it.eds[ed].vols; };
function volBtns(it) {
  const m = volMap(it, curEd);
  if (it.issues) {
    const keys = Object.keys(m).sort();
    return keys.map(k => { const v = m[k]; return `<button type="button" data-vol="${esc(k)}" class="${v.own ? "own" : ""} ${v.read ? "read" : ""}"><b>${esc(k.replace(/^(\d{4})-0?(\d+)$/, "$1.$2"))}</b><span class="small">${v.own ? "所持" : "未所持"}${v.read ? "・読" : ""}</span></button>`; }).join("") || `<p class="small muted">号はまだありません</p>`;
  }
  const nums = Object.keys(m).map(Number).filter(n => !isNaN(n));
  const max = Math.max(curEd ? 0 : (it.total || 0), ...nums, 1);
  let btns = ""; for (let i = 1; i <= max; i++) { const v = m[i] || {}; btns += `<button type="button" data-vol="${i}" class="${v.own ? "own" : ""} ${v.read ? "read" : ""}"><b>${i}</b><span class="small">${v.own ? "所持" : "未所持"}${v.read ? "・読" : ""}${v.media === "ebook" ? "・電" : v.media === "both" ? "・紙電" : ""}</span></button>`; }
  return btns;
}
function seriesHtml(it) {
  const eds = Object.keys(it.eds || {});
  if (curEd && !eds.includes(curEd)) curEd = "";
  if (!curEd && eds.length && !Object.values(it.vols || {}).some(v => v.own || v.read)) curEd = eds[0];
  const edSeg = eds.length ? `<div class="seg" role="group" aria-label="版"><button type="button" data-ed="" aria-pressed="${!curEd}">元の版</button>${eds.map(e => `<button type="button" data-ed="${esc(e)}" aria-pressed="${curEd === e}">${esc(e)}</button>`).join("")}</div>` : "";
  return `<div class="card" style="background:var(--bg)">
    <div class="row"><h3 class="grow">${it.issues ? "号ごとの所持と読了" : "巻ごとの所持と読了"}</h3><div class="seg" role="group" aria-label="切り替える内容"><button type="button" id="vmOwn" aria-pressed="true">所持</button><button type="button" id="vmRead" aria-pressed="false">読了</button></div></div>
    ${edSeg}
    <p class="small muted">${it.issues ? "号" : "巻"}を押すと、上で選んだ内容が切り替わります。下線は読了です。</p>
    <div class="vols" id="vols">${volBtns(it)}</div>
    ${it.issues ? `<div class="row"><label class="f">号を足す<input type="month" id="vAddIssue"></label><button type="button" class="small quiet" id="vAddIssueBtn">足す</button></div>` : `
    <div class="row"><label class="f">ここまで読んだ（巻）<input type="number" id="vUpTo" min="1" style="width:6em"></label><button type="button" class="small" id="vUpBtn">まとめて読了にする</button></div>
    <div class="row"><label class="f">既刊数<input type="number" id="vTotal" min="1" value="${esc(it.total || "")}" style="width:6em"></label><label class="row" style="gap:6px"><input type="checkbox" id="vDone"${it.done ? " checked" : ""}> 完結</label><label class="f">巻を足す<input type="number" id="vAdd" min="1" style="width:6em"></label><button type="button" class="small quiet" id="vAddBtn">足す</button></div>`}
    ${!it.issues ? `<div class="row"><label class="f">別の版を足す<input type="text" id="vEdName" placeholder="例：モノクロ版" style="width:9em"></label><button type="button" class="small quiet" id="vEdBtn">足す</button></div>` : ""}
  </div>`;
}
function bindSeries(d, it) {
  let vm = "own";
  const q = s => d.querySelector(s);
  const redraw = () => { const tmp = document.createElement("div"); tmp.innerHTML = seriesHtml(it); const card = q("#vols").closest(".card"); card.replaceWith(tmp.firstElementChild); bindSeries(d, it); };
  q("#vmOwn").onclick = () => { vm = "own"; q("#vmOwn").setAttribute("aria-pressed", "true"); q("#vmRead").setAttribute("aria-pressed", "false"); };
  q("#vmRead").onclick = () => { vm = "read"; q("#vmOwn").setAttribute("aria-pressed", "false"); q("#vmRead").setAttribute("aria-pressed", "true"); };
  d.querySelectorAll("[data-ed]").forEach(b => b.onclick = () => { curEd = b.dataset.ed; redraw(); });
  q("#vols").onclick = e => {
    const b = e.target.closest("[data-vol]"); if (!b) return;
    const n = b.dataset.vol; const m = volMap(it, curEd); const v = m[n] = m[n] || {};
    if (vm === "own") { if (v.own) delete v.own; else v.own = 1; } else { if (v.read) delete v.read; else v.read = UI.today(); }
    if (!v.own && !v.read && !v.isbn && !v.asin) delete m[n];
    Lib.put(it); redraw();
  };
  if (it.issues) {
    q("#vAddIssueBtn").onclick = () => { const k = q("#vAddIssue").value; if (!k) return; const m = volMap(it, ""); m[k] = { ...(m[k] || {}), own: 1 }; Lib.put(it); redraw(); };
    return;
  }
  q("#vUpBtn").onclick = () => { const n = +q("#vUpTo").value; if (!n) return; const m = volMap(it, curEd); for (let i = 1; i <= n; i++) { const v = m[i] = m[i] || {}; if (!v.read) v.read = 1; } Lib.put(it); redraw(); UI.toast(`${n}巻まで読了にしました`); };
  q("#vAddBtn").onclick = () => { const n = +q("#vAdd").value; if (!n) return; const m = volMap(it, curEd); m[n] = { ...(m[n] || {}), own: 1 }; Lib.put(it); redraw(); };
  q("#vTotal").onchange = () => { const n = +q("#vTotal").value; if (n) it.total = n; else delete it.total; Lib.put(it); redraw(); };
  q("#vDone").onchange = () => { it.done = q("#vDone").checked || undefined; Lib.put(it); };
  q("#vEdBtn").onclick = () => { const e = q("#vEdName").value.trim(); if (!e) return; volMap(it, e); curEd = e; Lib.put(it); redraw(); };
}

// ---------- 確認待ち ----------
const QNAME = { link: "チェッカーとの結び付け", cat: "本の種類", bib: "書誌が見つからない本", check: "書誌の確認", unowned: "所有を外した本", same: "同じ本かどうか", dupbuy: "2回以上買った本", read: "読了の候補" };
// まとめて決めるときの操作。種類ごとに使えるものだけを出す（書誌の入力は1件ずつ）
const QACTS = [
  { v: "link1", type: "link", label: "第1候補に結び付ける" },
  { v: "linkNone", type: "link", label: "結び付けない" },
  { v: "cat", type: "cat", label: "種類を決める…" },
  { v: "ok", type: "check", label: "このままでよい" },
  { v: "own", type: "unowned", label: "所有に戻す" },
  { v: "gone", type: "unowned", label: "手放した" },
  { v: "off", type: "unowned", label: "外したままにする" },
  { v: "readYes", type: "read", label: "読了にする" },
  { v: "readNo", type: "read", label: "読了にしない" },
  { v: "dupOne", type: "dupbuy", label: "1冊だけ持っている" },
  { v: "sameNo", type: "same", label: "別の本としてそのままにする" },
  { v: "drop", type: "*", label: "対象が見つからないものを片付ける" },
];
// qSel：チェックした確認待ち。描き直し・種類の切り替え・ほかの本の決定をしても残す（片付いたものだけ外す）
// qDraft：まだ決定していない入力（本の種類の選択、書名・著者の入力）。これも描き直しで消さない
let qType = "", qSel = new Set();
const qDraft = {};
const qShownIds = () => [...document.querySelectorAll("[data-qsel]")].map(x => x.dataset.qsel);
function renderQueue() {
  const all = Object.entries(Lib.queue()).sort((a, b) => (a[1].at < b[1].at ? -1 : 1));
  const by = {}; for (const [, x] of all) by[x.type] = (by[x.type] || 0) + 1;
  if (qType && !by[qType]) qType = "";
  $("qType").innerHTML = `<option value="">すべての種類（${all.length}件）</option>` + Object.entries(by).map(([k, n]) => `<option value="${k}"${k === qType ? " selected" : ""}>${esc(QNAME[k] || k)}（${n}件）</option>`).join("");
  $("qBar").hidden = all.length < 2;
  const q = qType ? all.filter(([, x]) => x.type === qType) : all;
  const live = Lib.queue();
  for (const id of [...qSel]) if (!live[id]) qSel.delete(id);
  for (const id of Object.keys(qDraft)) if (!live[id]) delete qDraft[id];
  const works = Shelf.read(Lib.P.novels); const wk = works ? new Map(works.books.map(b => [b.k, b])) : new Map();
  $("qList").innerHTML = q.map(([id, x]) => {
    const it = Lib.get(x.target);
    const box = `<input type="checkbox" class="qsel" data-qsel="${id}" aria-label="まとめて決める対象にする"${qSel.has(id) ? " checked" : ""}>`;
    if (!it) return `<div class="qitem${qSel.has(id) ? " sel" : ""}"><div class="row">${box}<p>対象の記録が見つかりません</p></div><div class="row"><button type="button" class="small quiet" data-qdone="${id}">片付ける</button></div></div>`;
    let act = "";
    if (x.type === "link") act = `<div class="cands">${(x.cands || []).map(k => wk.get(k)).filter(Boolean).map(w => `<button type="button" data-qlink="${id}" data-wk="${w.k}">これに結び付ける：${esc(w.t)}（${esc(w.a)}・${w.y}）</button>`).join("")}<button type="button" class="quiet" data-qlink="${id}" data-wk="">結び付けない</button></div>`;
    else if (x.type === "cat") act = `<div class="row"><select data-qcatsel="${id}">${CATS.map(c => `<option${c === (qDraft[id]?.cat ?? it.cat) ? " selected" : ""}>${esc(c)}</option>`).join("")}</select><button type="button" class="small" data-qcat="${id}">この種類にする</button></div>`;
    else if (x.type === "bib") act = `<div class="grid2"><label class="f">書名<input type="text" data-qbt="${id}" value="${esc(qDraft[id]?.t ?? (it.t.startsWith("（") ? "" : it.t))}"></label><label class="f">著者<input type="text" data-qba="${id}" value="${esc(qDraft[id]?.a ?? (it.a || ""))}"></label></div><div class="row"><button type="button" class="small" data-qbib="${id}">保存する</button></div>`;
    else if (x.type === "check") act = `<div class="row"><button type="button" class="small" data-qdone="${id}">このままでよい</button><button type="button" class="small quiet" data-qopen="${it.id}">書誌を直す</button></div>`;
    else if (x.type === "unowned") act = `<div class="row"><button type="button" class="small" data-qst="${id}" data-st="own">所有に戻す</button><button type="button" class="small quiet" data-qst="${id}" data-st="gone">手放した</button><button type="button" class="small quiet" data-qst="${id}" data-st="off">外したままにする</button></div>`;
    else if (x.type === "same") act = `<div class="cands">${(x.cands || []).map(cid => Lib.get(cid)).filter(Boolean).map(c => `<button type="button" data-qsame="${id}" data-into="${esc(c.id)}">この本と同じ（まとめる）：${esc(c.t)}${c.a ? "（" + esc(c.a) + "）" : ""}${c.isbn ? " " + esc(c.isbn) : ""}・${esc(c.src || "")}</button>`).join("")}<button type="button" class="quiet" data-qdone="${id}">別の本としてそのままにする</button></div>`;
    else if (x.type === "dupbuy") act = `<div class="row"><button type="button" class="small" data-qdone="${id}">1冊だけ持っている</button><button type="button" class="small quiet" data-qnote="${id}" data-note="同じ本を2冊持っている">2冊持っている</button><button type="button" class="small quiet" data-qnote="${id}" data-note="1冊は贈り物にした">1冊は贈り物にした</button></div>`;
    else if (x.type === "read") act = `<div class="row"><button type="button" class="small" data-qread="${id}" data-on="1">読了にする</button><button type="button" class="small quiet" data-qread="${id}" data-on="">読了にしない</button></div>`;
    return `<div class="qitem${qSel.has(id) ? " sel" : ""}"><div class="row">${box}<span class="pill warn">${esc(QNAME[x.type] || x.type)}</span><span class="small muted">${esc(x.why || "")}</span></div>
      <p><b>${esc(it.t)}</b> <span class="small muted">${esc(it.a || "")}${it.pub ? "・" + esc(it.pub) : ""}${it.isbn ? "・" + esc(it.isbn) : ""}</span></p>${act}</div>`;
  }).join("") || `<p class="empty">確認待ちはありません</p>`;
  qBarSync();
}
// 選んだものの種類に合う操作だけを出す
function qBarSync() {
  const qs = Lib.queue();
  const shownIds = new Set(qShownIds()), vis = [...qSel].filter(id => shownIds.has(id)), hidden = qSel.size - vis.length;
  const types = new Set(vis.map(id => Lib.get(qs[id]?.target) ? qs[id]?.type : "*").filter(Boolean));
  const shown = [...document.querySelectorAll("[data-qsel]")];
  $("qAll").checked = shown.length > 0 && shown.every(x => x.checked);
  $("qAll").indeterminate = !$("qAll").checked && shown.some(x => x.checked);
  $("qSelN").textContent = `${vis.length}件を選択` + (hidden ? `（ほかの種類でチェックした${hidden}件は、その種類を表示すると対象になります）` : "");
  const acts = QACTS.filter(a => types.has(a.type));
  const cur = $("qAct").value;
  $("qAct").innerHTML = acts.length ? acts.map(a => `<option value="${a.v}"${a.v === cur ? " selected" : ""}>${esc(a.label)}</option>`).join("") : `<option value="">選ぶと、使える操作が出ます</option>`;
  $("qAct").disabled = !acts.length;
  $("qActCat").hidden = $("qAct").value !== "cat";
  if (!$("qActCat").options.length) $("qActCat").innerHTML = CATS.map(c => `<option>${esc(c)}</option>`).join("");
  const n = vis.filter(id => { const x = qs[id]; const a = QACTS.find(y => y.v === $("qAct").value); return x && a && (a.type === (Lib.get(x.target) ? x.type : "*")); }).length;
  $("qRun").disabled = !n;
  $("qRun").textContent = n ? `選んだもののうち${n}件に適用` : "選んだものに適用";
}
$("qType").onchange = () => { qType = $("qType").value; renderQueue(); };
$("qAct").onchange = qBarSync;
$("qAll").onchange = () => {
  for (const el of document.querySelectorAll("[data-qsel]")) { el.checked = $("qAll").checked; el.closest(".qitem").classList.toggle("sel", el.checked); if (el.checked) qSel.add(el.dataset.qsel); else qSel.delete(el.dataset.qsel); }
  qBarSync();
};
// 決定前の入力を覚える
$("qList").addEventListener("input", e => {
  const t = e.target, id = t.dataset.qcatsel || t.dataset.qbt || t.dataset.qba; if (!id) return;
  const d = qDraft[id] = qDraft[id] || {};
  if (t.dataset.qcatsel) d.cat = t.value; else if (t.dataset.qbt) d.t = t.value; else d.a = t.value;
});
$("qList").addEventListener("change", e => {
  if (e.target.dataset.qcatsel) { (qDraft[e.target.dataset.qcatsel] = qDraft[e.target.dataset.qcatsel] || {}).cat = e.target.value; return; }
  const c = e.target.closest("[data-qsel]"); if (!c) return;
  if (c.checked) qSel.add(c.dataset.qsel); else qSel.delete(c.dataset.qsel);
  c.closest(".qitem").classList.toggle("sel", c.checked); qBarSync();
});
$("qRun").onclick = () => {
  const act = QACTS.find(a => a.v === $("qAct").value); if (!act) return;
  const qs = Lib.queue(); let n = 0;
  const shownIds = new Set(qShownIds());
  for (const id of [...qSel].filter(x => shownIds.has(x))) {
    const x = qs[id]; if (!x) continue;
    const it = Lib.get(x.target);
    if (act.type === "*") { if (!it) { Lib.qDel(id); qSel.delete(id); n++; } continue; }
    if (!it || x.type !== act.type) continue;
    if (act.v === "link1") { const k = (x.cands || [])[0]; if (!k) continue; Lib.link(it, k); }
    else if (act.v === "linkNone") Lib.link(it, null);
    else if (act.v === "cat") { const c = JSON.parse(JSON.stringify(it)); c.cat = $("qActCat").value; c.catAuto = false; Lib.put(c); }
    else if (act.v === "own" || act.v === "gone") Lib.setStatus(it, act.v);
    else if (act.v === "readYes") applyReadCand(x, it);
    // ok・off：記録はそのままで確認待ちだけを片付ける
    Lib.qDel(id); qSel.delete(id); delete qDraft[id]; n++;
  }
  UI.toast(`${n}件を「${act.label.replace("…", "：" + $("qActCat").value)}」にしました`);
  setTimeout(() => render("queue"), 50);
};
$("qList").addEventListener("click", e => {
  const t = e.target.closest("button"); if (!t) return;
  const d = t.dataset;
  if (d.qdone) { Lib.qDel(d.qdone); }
  else if (d.qopen) { openDetail(d.qopen); return; }
  else if (d.qlink) { const x = Lib.queue()[d.qlink]; const it = Lib.get(x.target); Lib.link(it, d.wk || null); Lib.qDel(d.qlink); UI.toast(d.wk ? "結び付けました" : "結び付けないことにしました"); }
  else if (d.qcat) { const x = Lib.queue()[d.qcat]; const it = JSON.parse(JSON.stringify(Lib.get(x.target))); it.cat = document.querySelector(`[data-qcatsel="${d.qcat}"]`).value; it.catAuto = false; Lib.put(it); Lib.qDel(d.qcat); }
  else if (d.qbib) {
    const x = Lib.queue()[d.qbib]; const it = JSON.parse(JSON.stringify(Lib.get(x.target)));
    const t2 = document.querySelector(`[data-qbt="${d.qbib}"]`).value.trim(); if (!t2) { UI.toast("書名を入れてください"); return; }
    it.t = t2; it.a = document.querySelector(`[data-qba="${d.qbib}"]`).value.trim(); Lib.put(it); Lib.qDel(d.qbib);
    const m = Biblio.matchNovel(it.t, it.a);
    if (m.status === "auto") Lib.link(it, m.work.k); else if (m.status === "wait") Lib.qAdd("link", it.id, { why: "必読書チェッカーの作品と結び付けるか、候補から選んでください", cands: m.cands.map(w => w.k) });
  }
  else if (d.qst) { const x = Lib.queue()[d.qst]; const it = Lib.get(x.target); Lib.qDel(d.qst); if (d.st !== "off") Lib.setStatus(it, d.st); }
  else if (d.qsame) { const x = Lib.queue()[d.qsame]; const from = Lib.get(x.target), into = Lib.get(d.into); Lib.qDel(d.qsame); if (from && into) { Lib.mergeInto(into, from); UI.toast("1件にまとめました"); } }
  else if (d.qnote) { const x = Lib.queue()[d.qnote]; const it = JSON.parse(JSON.stringify(Lib.get(x.target))); it.note = [it.note, d.note].filter(Boolean).join("／"); Lib.put(it); Lib.qDel(d.qnote); }
  else if (d.qread) { const x = Lib.queue()[d.qread]; const it = Lib.get(x.target); Lib.qDel(d.qread); if (d.on && it) { applyReadCand(x, it); UI.toast("読了にしました"); } }
  else return;
  setTimeout(() => render("queue"), 50);
});

// 読了の候補を読了にする（シリーズは候補の巻だけ。読了日は分からないので付けない）
function applyReadCand(x, it) {
  const vols = x.vols || (x.vol != null ? [x.vol] : null);
  if (it.kind === "series" && vols) {
    const c = JSON.parse(JSON.stringify(it)); const m = x.ed ? (c.eds?.[x.ed]?.vols || {}) : (c.vols = c.vols || {});
    for (const n of vols) { const v = m[n] = m[n] || {}; if (!v.read) v.read = 1; }
    Lib.put(c);
  } else if (!Lib.isRead(it)) Lib.setRead(it, true, null);
}

// ---------- 集計 ----------
function bars(rows, total) {
  return `<div class="bars">${rows.map(([k, n]) => `<span>${esc(k)}</span><span class="tr"><i style="width:${total ? Math.max(2, n / total * 100) : 0}%"></i></span><span class="mono">${n}</span>`).join("")}</div>`;
}
function renderStats() {
  const own = Object.values(Lib.items()).filter(it => it.st === "own");
  const count = it => it.kind === "series" ? Lib.ownVolCount(it) : 1;
  const total = own.reduce((s, it) => s + count(it), 0);
  const tally = f => { const m = new Map(); for (const it of own) { const k = f(it) || "（未設定）"; m.set(k, (m.get(k) || 0) + count(it)); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const tsun = own.filter(it => it.kind !== "series" && !Lib.isRead(it)).length + own.filter(it => it.kind === "series").reduce((s, it) => s + Lib.volMaps(it).reduce((t, [, m]) => t + Object.values(m).filter(v => v.own && !v.read).length, 0), 0);
  const works = Shelf.read(Lib.P.novels); const nd = Lib.ndoc();
  const nOwn = Object.keys(nd.own || {}).length, nAll = works ? works.books.length : 0;
  $("stats").innerHTML = `
    <div class="row"><span class="pill acc">総冊数 ${total}冊</span><span class="pill">記録 ${own.length}件（シリーズ ${own.filter(x => x.kind === "series").length}）</span><span class="pill warn">積読 ${tsun}冊</span><span class="pill">必読書の所有 ${nOwn}/${nAll}冊（${nAll ? (nOwn / nAll * 100).toFixed(1) : 0}%）</span></div>
    <h3>種類別</h3>${bars(tally(it => it.cat), total)}
    <h3>紙・電子</h3>${bars(tally(it => it.media === "ebook" ? "電子" : it.media === "both" ? "紙と電子" : "紙"), total)}
    <h3>保管場所別</h3>${bars(tally(it => it.loc), total)}
    <div class="row"><button type="button" class="quiet" id="exportBtn">蔵書の記録を書き出す（バックアップ）</button><span class="small muted">変更の履歴はGitHubにも残っています</span></div>`;
  $("exportBtn").onclick = () => {
    const body = JSON.stringify({ exported: new Date().toISOString(), library: Lib.items(), reading: Lib.reading(), settings: Lib.settings(), queue: Lib.queue() }, null, 1);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([body], { type: "application/json" })); a.download = `shelf-蔵書-${UI.today()}.json`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  };
}

// ---------- 保管場所 ----------
function renderPlaces() {
  const pl = Lib.places();
  const used = new Map(); for (const it of Object.values(Lib.items())) if (it.loc) used.set(it.loc, (used.get(it.loc) || 0) + 1);
  $("placeList").innerHTML = Object.entries(pl).map(([code, n]) => `<li><div><div class="t">${esc(n)}</div><div class="m"><span class="mono">${code}</span><span>${used.get(n) || 0}件</span></div></div><div class="row"><button type="button" class="small quiet" data-pren="${code}">名前を変える</button><button type="button" class="small quiet" data-pdel="${code}">消す</button></div></li>`).join("") || `<li class="empty">まだありません</li>`;
}
$("addPlace").onclick = () => { const n = $("newPlace").value.trim(); if (!n) return; Lib.addPlace(n); $("newPlace").value = ""; setTimeout(renderPlaces, 50); };
$("placeList").addEventListener("click", e => {
  const r = e.target.closest("[data-pren]"), d = e.target.closest("[data-pdel]");
  if (r) {
    const code = r.dataset.pren, li = r.closest("li");
    li.innerHTML = `<div class="row grow"><input type="text" class="grow" value="${esc(Lib.places()[code])}" aria-label="新しい名前"><button type="button" class="small">決定</button></div>`;
    li.querySelector("button").onclick = () => {
      const old = Lib.places()[code], nn = li.querySelector("input").value.trim(); if (!nn) return;
      Lib.renamePlace(code, nn);
      for (const it of Object.values(Lib.items())) if (it.loc === old) Lib.put({ ...JSON.parse(JSON.stringify(it)), loc: nn });
      setTimeout(renderPlaces, 50);
    };
  }
  if (d) { Lib.removePlace(d.dataset.pdel); setTimeout(renderPlaces, 50); }
});
$("printLabels").onclick = () => {
  const pl = Object.entries(Lib.places()); if (!pl.length) { UI.toast("保管場所がまだありません"); return; }
  $("labels").innerHTML = pl.map(([c, n], i) => `<figure><svg id="lb${i}"></svg><figcaption>${esc(n)}</figcaption></figure>`).join("");
  pl.forEach(([c], i) => JsBarcode("#lb" + i, c, { format: "EAN13", height: 48, width: 1.8, fontSize: 13, margin: 4 }));
  document.body.classList.add("printing");
  setTimeout(() => { window.print(); document.body.classList.remove("printing"); }, 100);
};

// ---------- ブクログから ----------
// 一覧はブクログの記録の順。チェックは画面を描き直しても残す。
// 登録したとき、いちばん下でチェックした本までのチェックしなかった本を「確認済み（持っていない）」にし、次から出さない。
// 確認済みは設定（records/settings.json の blSeen）に、書名・著者で覚える（ブクログを取り込み直して並びが変わっても効く）
let blShown = 100, blRows = [];
const blSel = new Set();
const blKey = x => Biblio.norm(x.t) + "|" + Biblio.norm(x.a);
const blSeen = () => Lib.settings().blSeen || {};
function setBlSeen(fn) { const s = JSON.parse(JSON.stringify(Lib.settings())); s.blSeen = s.blSeen || {}; fn(s.blSeen); Shelf.writeDoc(Lib.P.settings, s); }
function booklogItems() {
  const meta = Shelf.read("records/novels-checker/log.json") || {};
  const out = [];
  for (let i = 0; i < (meta.chunks || 0); i++) (Shelf.read(`records/novels-checker/log-${i}.json`)?.items || []).forEach((x, j) => out.push({ id: `${i}-${j}`, t: x[0], a: x[1], d: x[2], g: x[4], type: x[5] }));
  return out;
}
const blRow = x => {
  const seen = !!blSeen()[blKey(x)], on = blSel.has(x.id);
  return `<li class="${seen ? "seen" : ""}${on ? " sel" : ""}" data-blrow="${x.id}"><label class="row" style="gap:10px;align-items:flex-start;flex:1;min-width:0"><input type="checkbox" data-bl="${x.id}"${on ? " checked" : ""}><span style="min-width:0"><span class="t">${esc(x.t)}</span><br><span class="m">${esc(x.a)}・${esc(x.d)}${x.type ? "・" + esc(x.type) : ""}${x.g ? "・" + esc(x.g) : ""}${seen ? "・確認済み" : ""}</span></span></label>${seen ? `<button type="button" class="small quiet" data-blunseen="${x.id}">未確認に戻す</button>` : "<span></span>"}</li>`;
};
function renderBooklog() {
  const done = new Set(Object.values(Lib.items()).flatMap(it => [it.blk, ...(it.blks || [])]).filter(Boolean));
  const doneKey = new Set(Object.values(Lib.items()).flatMap(it => [it.blkKey, ...(it.blkKeys || [])]).filter(Boolean));
  const seen = blSeen(), showSeen = $("blShowSeen").checked;
  const q = Biblio.norm($("blq").value);
  const all = booklogItems().filter(x => !done.has(x.id) && !doneKey.has(blKey(x)));
  const nSeen = all.filter(x => seen[blKey(x)]).length;
  blRows = all.filter(x => showSeen || !seen[blKey(x)]);
  if (q) blRows = blRows.filter(x => Biblio.norm(x.t + " " + x.a).includes(q));
  // 並び順：ブクログに登録した日で。同じ日のものは記録の順のまま
  const so = $("blSort").value;
  if (so) { const ix = new Map(all.map((x, i) => [x.id, i])); const dir = so === "new" ? -1 : 1; blRows.sort((a, b) => ((a.d || "") < (b.d || "") ? -dir : (a.d || "") > (b.d || "") ? dir : ix.get(a.id) - ix.get(b.id))); }
  for (const id of [...blSel]) if (!all.some(x => x.id === id)) blSel.delete(id);
  $("blCount").textContent = `未確認 ${all.length - nSeen}件・確認済み（持っていない） ${nSeen}件${q ? `・絞り込み ${blRows.length}件` : ""}`;
  $("blList").innerHTML = blRows.slice(0, blShown).map(blRow).join("") || `<li class="empty">${all.length ? "未確認の記録はありません。「確認済みも表示」で見直せます" : "登録できる記録はありません"}</li>`;
  $("blMore").hidden = blRows.length <= blShown;
  $("blResetSeen").hidden = !(showSeen && nSeen);
  blBarSync();
}
function blBarSync() {
  const n = blSel.size;
  $("blSelN").textContent = n ? `${n}冊にチェック` : "チェックした本はありません";
  // 押せない状態にはしない（チェックを数えそこねても登録できるように）。押したときに画面のチェックを数え直す
  $("blReg").style.opacity = n ? "" : ".55"; $("blReg").textContent = n ? `選んだ${n}冊を登録` : "選んだ本を登録";
  $("blClear").hidden = !n;
}
$("blq").addEventListener("input", () => { blShown = 100; renderBooklog(); });
$("blShowSeen").addEventListener("change", () => { blShown = 100; renderBooklog(); });
$("blSort").addEventListener("change", () => { blShown = 100; try { localStorage.setItem("shelf.blSort", $("blSort").value); } catch (_) {} renderBooklog(); window.scrollTo(0, $("p-booklog").getBoundingClientRect().top + window.scrollY - 60); });
try { $("blSort").value = localStorage.getItem("shelf.blSort") || ""; } catch (_) {}
// 「さらに表示」は描き直さずに続きを足す（チェックとスクロール位置はそのまま）
$("blMore").onclick = () => {
  const from = blShown; blShown += 200;
  $("blList").insertAdjacentHTML("beforeend", blRows.slice(from, blShown).map(blRow).join(""));
  $("blMore").hidden = blRows.length <= blShown;
};
$("blList").addEventListener("change", e => {
  const c = e.target.closest("[data-bl]"); if (!c) return;
  if (c.checked) blSel.add(c.dataset.bl); else blSel.delete(c.dataset.bl);
  c.closest("li").classList.toggle("sel", c.checked); blBarSync();
});
$("blList").addEventListener("click", e => {
  const b = e.target.closest("[data-blunseen]"); if (!b) return;
  const x = blRows.find(y => y.id === b.dataset.blunseen); if (!x) return;
  setBlSeen(m => { delete m[blKey(x)]; }); setTimeout(renderBooklog, 50);
});
$("blResetSeen").onclick = () => {
  const b = $("blResetSeen");
  if (b.dataset.arm !== "1") { b.dataset.arm = "1"; b.textContent = "もう一度押すと戻します"; setTimeout(() => { b.dataset.arm = ""; b.textContent = "確認済みをすべて未確認に戻す"; }, 3000); return; }
  b.dataset.arm = ""; b.textContent = "確認済みをすべて未確認に戻す";
  setBlSeen(m => { for (const k of Object.keys(m)) delete m[k]; }); UI.toast("確認済みをすべて未確認に戻しました"); setTimeout(renderBooklog, 50);
};
$("blClear").onclick = () => { blSel.clear(); for (const c of document.querySelectorAll("[data-bl]:checked")) { c.checked = false; c.closest("li").classList.remove("sel"); } blBarSync(); };
let blBusy = false;
$("blReg").onclick = async () => {
  if (blBusy) return;
  for (const c of document.querySelectorAll("[data-bl]")) { if (c.checked) blSel.add(c.dataset.bl); else blSel.delete(c.dataset.bl); }
  if (!blSel.size) { UI.toast("登録する本にチェックを付けてください"); return; }
  blBusy = true;
  const all = new Map(booklogItems().map(x => [x.id, x]));
  // いちばん下でチェックした本までの、チェックしなかった本を確認済みにする（今の表示の並びで）
  let last = -1; blRows.forEach((x, i) => { if (blSel.has(x.id)) last = i; });
  const skip = blRows.slice(0, last + 1).filter(x => !blSel.has(x.id));
  $("blReg").textContent = "登録しています…";
  let n = 0;
  for (const id of [...blSel]) {
    const x = all.get(id); if (!x) continue;
    const ebook = /kindle|電子|ebook/i.test(x.type || "");
    const r = await Lib.register({ t: x.t, a: x.a, src: "booklog", media: ebook ? "ebook" : "paper", bib: { t: x.t, a: x.a }, catHint: blCat(x) });
    const it = JSON.parse(JSON.stringify(r.item)); it.blk = id; it.blkKey = blKey(x);
    markBooklogRead(it, r.vol, x.d); n++;
  }
  if (skip.length) setBlSeen(m => { for (const x of skip) m[blKey(x)] = 1; });
  blSel.clear();
  UI.toast(`${n}冊を登録しました${skip.length ? `。チェックしなかった${skip.length}冊は確認済みにしました` : ""}`, 4000);
  blBusy = false;
  setTimeout(renderBooklog, 50);
};

// ブクログの記録は読んだ本の記録なので、そこから登録した本は読了にする。
// 読了日はブクログの日付（2011年の日付は一括取り込みの日なので使わない。チェッカーと同じ扱い）。
// すでに付いている読了の日付は書き換えない
const blDate = d => /^\d{4}-\d{2}-\d{2}/.test(d || "") && !String(d).startsWith("2011") ? String(d).slice(0, 10) : "";
function markBooklogRead(it, vol, d) {
  const date = blDate(d);
  if (it.kind === "series") {
    if (vol != null) { it.vols = it.vols || {}; const v = it.vols[vol] || {}; if (!v.read) it.vols[vol] = { ...v, read: date || 1 }; }
  } else if (it.nk) {
    if (!Lib.ndoc().read[it.nk]) Lib.setNovelRead(it.nk, date || 1);
  } else if (!Lib.reading()["b:" + it.id]) {
    Lib.setReading("b:" + it.id, { s: "read", d: date || undefined, via: "booklog", n: 1 });
  }
  it.blkRead = 1;
  Lib.put(it);
}
// ブクログの「カテゴリ」と「種別」から本の種類を決める（書誌にCコードがないため）。
// 決めきれないカテゴリ（空欄・死/不死/ゾンビ）は、これまでどおり確認待ちに回す
const BL_CAT = { "ファンタジー": "小説", "ＳＦ": "小説", "SF": "小説", "ミステリ/ホラー/サスペンス": "小説", "未分類（フィクション）": "小説",
  "詩": "詩歌", "創作読本": "実用・趣味", "未分類（ノンフィクション）": "ノンフィクション・教養", "動物/生物": "ノンフィクション・教養", "歴史/人類学": "ノンフィクション・教養",
  "認知科学": "ノンフィクション・教養", "感染症": "ノンフィクション・教養" };
function blCat(x) {
  if (x.type === "マンガ") return "漫画";
  if (x.type === "雑誌") return "雑誌";
  return BL_CAT[(x.g || "").trim()] || null;
}
// 前の版でブクログから登録した本の手直しを一度だけ行う：未読のままなら読了に、種類が決まっていなければカテゴリから決める
function fixBooklogRead() {
  const log = new Map(booklogItems().map(x => [x.id, x]));
  for (const it0 of Object.values(Lib.items())) {
    if (!it0.blk) continue;
    const x = log.get(it0.blk);
    if ((it0.blkCat || 0) < 2) {   // 2：創作読本を実用・趣味に入れた版
      const it = JSON.parse(JSON.stringify(it0)); it.blkCat = 2;
      if (x && !it.blkKey) it.blkKey = blKey(x);
      const c = x && blCat(x);
      if (c && it.cat === "その他" && !it.catAuto) {
        it.cat = c; it.catAuto = true;
        for (const [qid, q] of Object.entries(Lib.queue())) if (q.target === it.id && q.type === "cat") Lib.qDel(qid);
      }
      Lib.put(it);
    }
    if (it0.blkRead) continue;
    const it = JSON.parse(JSON.stringify(Lib.get(it0.id)));
    const vol = it.kind === "series" && x ? Biblio.splitVolume(x.t).vol : null;
    markBooklogRead(it, vol, x?.d);
  }
}

// ---------- 外した本 ----------
function renderOff() {
  const rows = Object.values(Lib.items()).filter(it => it.st === "off" || it.st === "gone").sort((a, b) => (a.u < b.u ? 1 : -1));
  $("offList").innerHTML = rows.map(it => `<li><div><div class="t">${esc(it.t)}</div><div class="m"><span>${esc(it.a || "")}</span><span class="pill ${it.st === "gone" ? "" : "warn"}">${it.st === "gone" ? "手放した" : "所有を外した"}</span></div></div><button type="button" class="small" data-back="${esc(it.id)}">所有に戻す</button></li>`).join("") || `<li class="empty">ありません</li>`;
}
$("offList").addEventListener("click", e => { const b = e.target.closest("[data-back]"); if (!b) return; Lib.setStatus(Lib.get(b.dataset.back), "own"); UI.toast("所有に戻しました"); setTimeout(renderOff, 50); });
