// 執筆の画面（2026-11-14・要件定義 10章「原稿と資料」「抜き書き」、14章「参考文献リストの書き出し」）
//   writing.html            … 原稿の一覧・抜き書きの一覧
//   writing.html?d=原稿の番号 … 原稿ごとの資料・抜き書き・参考文献リスト
// 記録の形は app/drafts.js。作品は app/works.js の「種類:番号」で指す。
"use strict";
const { $, esc } = UI;
UI.topbar("writing.html");
let tab = "drafts", noteQ = "", pickTg = "";
const params = () => new URLSearchParams(location.search);

// ---------- 原稿の一覧 ----------
function listView() {
  const ds = Drafts.list();
  const have = new Set(ds.map(x => Works.norm(x.t)));
  const cands = (Shelf.read("records/sns/review.json")?.drafts || []).filter(t => !have.has(Works.norm(t)));
  const notes = Object.entries(Drafts.notes()).map(([id, n]) => ({ id, ...n }));
  return `<header class="phead"><div><div class="eyebrow">WRITING</div><h1>執筆</h1>
      <p class="lede">原稿ごとに、資料にした本・映画と抜き書きをまとめます。原稿のファイルは取り込まず、題名で結び付けます。抜き書きは個人の資料としてだけ使います。</p></div>
      <div class="meter"><div class="big">${ds.length}</div><div class="sub">件の原稿／抜き書き ${notes.length}件</div></div></header>
    <nav class="card noprint"><div class="seg" role="group"><button type="button" data-tab="drafts" aria-pressed="${tab === "drafts"}">原稿</button><button type="button" data-tab="notes" aria-pressed="${tab === "notes"}">抜き書き</button></div></nav>
    ${tab === "drafts" ? draftsTab(ds, cands) : notesTab(notes)}`;
}
function draftsTab(ds, cands) {
  return `<section class="card"><ul class="list">${ds.map(d => {
      const rs = Drafts.refsOf(d.id).length, ns = Drafts.notesOfDraft(d.id).length;
      return `<li class="blk dr"><a class="t" href="writing.html?d=${encodeURIComponent(d.id)}">${esc(d.t)}</a><div class="small muted">資料 ${rs}件・抜き書き ${ns}件${d.memo ? "　" + esc(d.memo.split("\n")[0].slice(0, 60)) : ""}</div></li>`;
    }).join("") || `<li class="empty">原稿はまだありません</li>`}</ul></section>
    <section class="card"><h2 style="margin-top:0;font-size:17px">原稿を足す</h2>
      <form id="dAdd"><label class="f">題名<input name="t" required></label><label class="f">テーマ・舞台・モチーフのメモ<textarea name="memo" rows="3" class="memo" placeholder="例：竜の医療、獣医、近代の地方都市"></textarea></label><button type="submit" class="pri">足す</button></form>
      ${cands.length ? `<p class="small muted" style="margin-bottom:4px">SNSの照合で「自作原稿」と分かっている題名（押すと足します）：</p><div class="row">${cands.map(t => `<button type="button" class="small quiet" data-cand="${esc(t)}">${esc(t)}</button>`).join("")}</div>` : ""}
    </section>`;
}
function notesTab(notes) {
  const q = Works.norm(noteQ);
  const hit = n => { if (!q) return true; const i = Works.info(n.tg); return Works.norm([n.text, n.memo, (n.tags || []).join(" "), i?.t, (n.ds || []).map(d => Drafts.draft(d)?.t).join(" ")].join(" ")).includes(q); };
  const xs = notes.filter(hit).sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const tags = [...new Set(notes.flatMap(n => n.tags || []))].sort((a, b) => a.localeCompare(b, "ja"));
  const pi = pickTg ? Works.info(pickTg) : null;
  return `<section class="card"><div class="row"><input type="search" id="nq" class="grow" value="${esc(noteQ)}" placeholder="一節・作品・タグ・原稿で探す" aria-label="抜き書きを探す"></div>
      ${tags.length ? `<div class="row small">${tags.map(t => `<button type="button" class="small quiet" data-tag="${esc(t)}">#${esc(t)}</button>`).join("")}</div>` : ""}
      <ul class="list nts">${xs.map(n => Drafts.noteHTML(n, { work: true })).join("") || `<li class="empty">${notes.length ? "見つかりません" : "抜き書きはまだありません"}</li>`}</ul></section>
    <section class="card"><h2 style="margin-top:0;font-size:17px">抜き書きを足す</h2>
      <p class="small muted">まず作品を探して選びます。作品のページの「執筆」の欄からも足せます。</p>
      <div class="row"><input type="search" id="nwq" class="grow" placeholder="作品名・著者で探す" aria-label="抜き書きの作品を探す"></div>
      <ul class="hits" id="nwHits"></ul>
      ${pi ? `<p>作品：<b>${esc(pi.t)}</b> <span class="small muted">${esc(pi.sub)}</span> <button type="button" class="small quiet" data-unpick>選び直す</button></p>${Drafts.noteForm({ tg: pickTg })}` : ""}
    </section>`;
}

// ---------- 原稿ごと ----------
function draftView(id) {
  const d = Drafts.draft(id);
  if (!d) return `<section class="card"><p>この原稿は見つかりませんでした。<a href="writing.html">執筆の画面へ</a></p></section>`;
  document.title = `${d.t} — 執筆 — shelf`;
  const refs = Drafts.refsOf(id).map(r => ({ r, i: Works.info(r.tg) })).filter(x => x.i);
  const notes = Drafts.notesOfDraft(id).sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  const bib = Drafts.bibliography(id);
  return `<p class="small"><a href="writing.html">← 原稿の一覧</a></p>
    <header class="phead"><div><div class="eyebrow">原稿</div><h1>${esc(d.t)}</h1></div>
      <div class="meter"><div class="big">${refs.length}</div><div class="sub">件の資料／抜き書き ${notes.length}件</div></div></header>
    <section class="card"><h2 style="margin-top:0;font-size:17px">メモ</h2>
      <form id="dEdit"><label class="f">題名<input name="t" value="${esc(d.t)}" required></label>
      <label class="f">テーマ・舞台・モチーフ<textarea name="memo" rows="4" class="memo">${esc(d.memo || "")}</textarea></label>
      <div class="row"><button type="submit" class="pri small">保存する</button><span class="grow"></span><button type="button" class="small danger" data-ddel>この原稿を消す</button></div></form></section>
    <section class="card"><div class="cardh"><h2>資料（${refs.length}件）</h2></div>
      <ul class="list">${refs.map(({ r, i }) => `<li class="blk" data-ref="${esc(r.tg)}"><div><a href="${i.url}"><b>${esc(i.t)}</b></a> <span class="tagk">${esc(i.kind)}</span> <span class="small muted">${esc(i.sub)}</span></div>
          <div class="small muted">${i.loc ? "保管場所：" + esc(i.loc) : /必読書|蔵書/.test(i.kind) ? (i.own ? "所有（場所未設定）" : "未所持") : ""}</div>
          <div class="row"><input class="grow refnote" value="${esc(r.note || "")}" placeholder="何に使うか（メモ）" aria-label="${esc(i.t)}のメモ">
            <label class="small chk"><input type="checkbox" class="refskip" ${r.skip ? "checked" : ""}> 参考文献に入れない</label>
            <button type="button" class="small quiet" data-refdel>外す</button></div></li>`).join("") || `<li class="empty">資料はまだありません。下で探して足すか、作品のページの「執筆」の欄から足してください</li>`}</ul>
      <div class="row"><input type="search" id="rq" class="grow" placeholder="資料にする本・映画を探す" aria-label="資料を探す"></div><ul class="hits" id="rHits"></ul></section>
    <section class="card"><div class="cardh"><h2>抜き書き（${notes.length}件）</h2></div>
      <p class="small muted">この原稿に付けた抜き書きと、資料にした作品の抜き書きです。</p>
      <ul class="list nts">${notes.map(n => Drafts.noteHTML(n, { work: true })).join("") || `<li class="empty">抜き書きはまだありません</li>`}</ul>
      ${refs.length ? `<details><summary class="small">抜き書きを足す</summary>${Drafts.noteForm({ d: id, pick: refs.map(({ r, i }) => [r.tg, i.t]) })}</details>` : ""}</section>
    <section class="card"><div class="cardh"><h2>参考文献リスト</h2><button type="button" class="small" data-copy ${bib.length ? "" : "disabled"}>写す</button></div>
      <p class="small muted">本（著者の五十音順）、映画・映像の順。巻末の参考文献や編集者への共有にそのまま使えます。書誌が欠けているものは、作品のページから蔵書で直してください。</p>
      <textarea class="bib" id="bib" readonly>${esc(bib.join("\n"))}</textarea></section>`;
}

function hitsHTML(xs, act) {
  return xs.map(x => `<li><span class="grow"><span class="t">${esc(x.t)}</span> <span class="tagk">${esc(x.k)}</span> <span class="small muted">${esc(x.s)}</span></span><button type="button" class="small" data-${act}="${esc(x.tg)}">${act === "radd" ? "資料にする" : "選ぶ"}</button></li>`).join("") || `<li class="small muted">見つかりません</li>`;
}

function render() {
  const id = params().get("d");
  $("view").innerHTML = id ? draftView(id) : listView();
  if (!id) document.title = "執筆 — shelf";
}

// ---------- 操作 ----------
$("view").addEventListener("click", e => {
  const id = params().get("d");
  const t = e.target.closest("[data-tab]"); if (t) { tab = t.dataset.tab; render(); return; }
  const c = e.target.closest("[data-cand]"); if (c) { const nid = Drafts.putDraft(null, { t: c.dataset.cand, memo: "" }); UI.toast(`『${c.dataset.cand}』を足しました`); location.href = "writing.html?d=" + encodeURIComponent(nid); return; }
  const tg = e.target.closest("[data-tag]"); if (tg) { noteQ = tg.dataset.tag; render(); return; }
  const pk = e.target.closest("[data-pick]"); if (pk) { pickTg = pk.dataset.pick; render(); return; }
  if (e.target.closest("[data-unpick]")) { pickTg = ""; render(); return; }
  const ra = e.target.closest("[data-radd]"); if (ra && id) { Drafts.addRef(id, ra.dataset.radd); UI.toast("資料に足しました"); render(); return; }
  const rd = e.target.closest("[data-refdel]"); if (rd && id) { Drafts.delRef(id, rd.closest("[data-ref]").dataset.ref); render(); return; }
  if (e.target.closest("[data-ddel]") && id) { const d = Drafts.draft(id); if (confirm(`『${d.t}』の原稿の記録を消しますか？（資料の結び付きも消えます。抜き書きは残ります）`)) { Drafts.delDraft(id); location.href = "writing.html"; } return; }
  if (e.target.closest("[data-copy]")) { const v = $("bib").value; (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => UI.toast("写しました"), () => { $("bib").select(); document.execCommand("copy"); UI.toast("写しました"); }); return; }
});
$("view").addEventListener("submit", e => {
  const f = e.target;
  if (f.id === "dAdd") { e.preventDefault(); const v = new FormData(f); const nid = Drafts.putDraft(null, { t: String(v.get("t")).trim(), memo: String(v.get("memo") || "").trim() }); location.href = "writing.html?d=" + encodeURIComponent(nid); return; }
  if (f.id === "dEdit") { e.preventDefault(); const id = params().get("d"), v = new FormData(f); Drafts.putDraft(id, { ...Drafts.draft(id), t: String(v.get("t")).trim(), memo: String(v.get("memo") || "").trim() }); UI.toast("保存しました"); render(); return; }
});
$("view").addEventListener("input", e => {
  if (e.target.id === "nq") { noteQ = e.target.value; const pos = e.target.selectionStart; render(); const q = $("nq"); q.focus(); q.setSelectionRange(pos, pos); return; }
  if (e.target.id === "nwq") { $("nwHits").innerHTML = e.target.value.trim() ? hitsHTML(Works.search(e.target.value, 12), "pick") : ""; return; }
  if (e.target.id === "rq") { $("rHits").innerHTML = e.target.value.trim() ? hitsHTML(Works.search(e.target.value, 12), "radd") : ""; return; }
});
$("view").addEventListener("change", e => {
  const id = params().get("d"), li = e.target.closest("[data-ref]"); if (!li || !id) return;
  const key = `${id}~${li.dataset.ref}`, r = Drafts.refs()[key]; if (!r) return;
  if (e.target.classList.contains("refnote")) { Drafts.noteRef(id, li.dataset.ref, e.target.value.trim()); UI.toast("メモを保存しました"); }
  if (e.target.classList.contains("refskip")) { Shelf.writeItem("records/writing/refs.json", key, { ...r, skip: e.target.checked || undefined }); render(); }
});
Drafts.bind($("view"), () => { pickTg = ""; render(); });

(async () => {
  if (!Shelf.token()) { $("main").prepend(UI.keyCard()); return; }
  await Shelf.init({ need: [...Works.paths, ...Drafts.paths, "records/sns/review.json", "records/reading.json", "records/novels-checker/books.json", "records/settings.json"] });
  render();
  let tm = null;
  Shelf.onAny(p => { if (/^records\/writing\//.test(p) && document.activeElement?.closest?.("form,input,textarea")) return; clearTimeout(tm); tm = setTimeout(() => { Works.reset(); render(); }, 300); });
})();
