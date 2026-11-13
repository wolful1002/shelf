// 執筆の記録（2026-11-14・要件定義 10章）：原稿・資料・抜き書き
//   records/writing/drafts.json … 原稿 {items:{番号:{t（題名）, memo（テーマ・舞台・モチーフ）, added, u}}}
//   records/writing/refs.json   … 原稿の資料 {items:{"原稿の番号~種類:番号":{d, tg, note, at}}}
//   records/writing/notes.json  … 抜き書き {items:{番号:{tg（作品）, text（一節）, page, memo, tags:[…], ds:[原稿の番号], src:"手入力", at, u}}}
// 原稿のファイルは取り込まず、題名で資料と結び付ける。抜き書きは個人の資料としてだけ使い、アプリの外には出さない。
"use strict";
window.Drafts = (() => {
  const D = {}, PD = "records/writing/drafts.json", PR = "records/writing/refs.json", PN = "records/writing/notes.json";
  D.paths = [PD, PR, PN];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const now = () => new Date().toISOString();
  const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  D.drafts = () => Shelf.read(PD)?.items || {};
  D.refs = () => Shelf.read(PR)?.items || {};
  D.notes = () => Shelf.read(PN)?.items || {};
  D.draft = id => D.drafts()[id] || null;
  D.list = () => Object.entries(D.drafts()).map(([id, x]) => ({ id, ...x })).sort((a, b) => (b.u || "").localeCompare(a.u || ""));
  D.refsOf = d => Object.values(D.refs()).filter(r => r.d === d);
  D.draftsOf = tg => Object.values(D.refs()).filter(r => r.tg === tg).map(r => r.d);
  D.notesOf = tg => Object.entries(D.notes()).filter(([, n]) => n.tg === tg).map(([id, n]) => ({ id, ...n })).sort((a, b) => (a.at || "").localeCompare(b.at || ""));
  // 原稿の抜き書き：その原稿に付けた抜き書きと、原稿の資料の抜き書き
  D.notesOfDraft = d => { const tgs = new Set(D.refsOf(d).map(r => r.tg)); return Object.entries(D.notes()).filter(([, n]) => (n.ds || []).includes(d) || tgs.has(n.tg)).map(([id, n]) => ({ id, ...n })); };
  D.putDraft = (id, x) => { id = id || rid("d-"); Shelf.writeItem(PD, id, { ...x, added: x.added || now(), u: now() }); return id; };
  D.delDraft = id => { for (const [k, r] of Object.entries(D.refs())) if (r.d === id) Shelf.writeItem(PR, k, null); Shelf.writeItem(PD, id, null); };
  D.addRef = (d, tg, note = "") => { Shelf.writeItem(PR, `${d}~${tg}`, { d, tg, ...(note ? { note } : {}), at: now() }); touch(d); };
  D.delRef = (d, tg) => { Shelf.writeItem(PR, `${d}~${tg}`, null); touch(d); };
  D.noteRef = (d, tg, note) => { const r = D.refs()[`${d}~${tg}`]; if (r) Shelf.writeItem(PR, `${d}~${tg}`, { ...r, note }); };
  const touch = d => { const x = D.draft(d); if (x) Shelf.writeItem(PD, d, { ...x, u: now() }); };
  D.putNote = (id, n) => { id = id || rid("n-"); Shelf.writeItem(PN, id, { src: "手入力", ...n, at: n.at || now(), u: now() }); return id; };
  D.delNote = id => Shelf.writeItem(PN, id, null);
  D.tags = s => [...new Set(String(s || "").split(/[,、，\s]+/).map(x => x.replace(/^#/, "").trim()).filter(Boolean))];

  // 参考文献リスト：本（著者の五十音順）→ 映画・映像の順。資料に付けた「参考文献に入れない」は除く
  D.bibliography = d => {
    const xs = D.refsOf(d).filter(r => !r.skip).map(r => ({ r, i: Works.info(r.tg) })).filter(x => x.i);
    const book = x => /必読書|蔵書/.test(x.i.kind);
    const key = x => x.i.cite.normalize("NFKC");
    return [...xs.filter(book).sort((a, b) => key(a).localeCompare(key(b), "ja")), ...xs.filter(x => !book(x)).sort((a, b) => key(a).localeCompare(key(b), "ja"))].map(x => x.i.cite);
  };

  // 抜き書き1件の表示
  D.noteHTML = (n, opt = {}) => {
    const i = opt.work ? Works.info(n.tg) : null;
    const ds = (n.ds || []).map(id => D.draft(id)?.t).filter(Boolean);
    return `<li class="nt" data-note="${esc(n.id)}"><blockquote>${esc(n.text)}</blockquote>
      <div class="small muted">${i ? `<a href="${i.url}">${esc(i.t)}</a>` : ""}${n.page ? `　p.${esc(n.page)}` : ""}${ds.length ? `　原稿：${esc(ds.join("・"))}` : ""}${(n.tags || []).length ? `　${n.tags.map(t => "#" + esc(t)).join(" ")}` : ""}${n.src && n.src !== "手入力" ? `　${esc(n.src)}` : ""}</div>
      ${n.memo ? `<div class="small">${esc(n.memo)}</div>` : ""}
      <div class="row"><button type="button" class="small quiet" data-note-edit>直す</button><button type="button" class="small quiet" data-note-del>消す</button></div></li>`;
  };
  // 抜き書きを足す・直す小さな枠（作品が決まっているとき tg、原稿が決まっているとき d）
  D.noteForm = (opt = {}) => {
    const n = opt.note || {};
    const ds = D.list();
    return `<form class="ntform card-in" data-tg="${esc(opt.tg || n.tg || "")}" data-id="${esc(opt.id || "")}">
      ${opt.pick ? `<label class="f">どの作品の一節か<select name="tg" required>${opt.pick.map(([tg, t]) => `<option value="${esc(tg)}" ${tg === n.tg ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>` : ""}
      <label class="f">一節<textarea name="text" rows="3" required placeholder="本文から写した一節">${esc(n.text || "")}</textarea></label>
      <div class="row"><label class="f" style="width:7em">ページ<input name="page" value="${esc(n.page || "")}" inputmode="numeric"></label>
        <label class="f grow">タグ（、で区切る）<input name="tags" value="${esc((n.tags || []).join("、"))}" placeholder="竜、医療"></label></div>
      <label class="f">メモ<input name="memo" value="${esc(n.memo || "")}" placeholder="なぜ気になったか"></label>
      ${ds.length ? `<div class="small">原稿：${ds.map(x => `<label class="chk"><input type="checkbox" name="ds" value="${esc(x.id)}" ${(n.ds || (opt.d ? [opt.d] : [])).includes(x.id) ? "checked" : ""}> ${esc(x.t)}</label>`).join(" ")}</div>` : ""}
      <div class="row"><button type="submit" class="pri small">${opt.id ? "直す" : "抜き書きを足す"}</button>${opt.id ? `<button type="button" class="small quiet" data-note-cancel>やめる</button>` : ""}</div></form>`;
  };
  D.readForm = f => {
    const v = new FormData(f);
    return { tg: v.get("tg") || f.dataset.tg, text: String(v.get("text") || "").trim(), page: String(v.get("page") || "").trim(), memo: String(v.get("memo") || "").trim(), tags: D.tags(v.get("tags")), ds: v.getAll("ds") };
  };

  // 作品のページの「執筆」の欄：資料にした原稿・抜き書き
  D.workHTML = tg => {
    const ds = D.draftsOf(tg), all = D.list(), notes = D.notesOf(tg);
    return `<section class="card" id="wrCard"><div class="cardh"><h2>執筆</h2><a href="writing.html">執筆の画面</a></div>
      <div class="small">資料にした原稿：${ds.length ? ds.map(id => `<a href="writing.html?d=${encodeURIComponent(id)}">${esc(D.draft(id)?.t || "")}</a>`).join("、") : "なし"}</div>
      ${all.length ? `<div class="row"><select id="wrPick" aria-label="資料にする原稿">${all.map(x => `<option value="${esc(x.id)}">${esc(x.t)}</option>`).join("")}</select><button type="button" class="small" data-wr-add>この原稿の資料にする</button>${ds.length ? `<button type="button" class="small quiet" data-wr-del>選んだ原稿の資料から外す</button>` : ""}</div>` : `<p class="small muted">原稿がまだありません。<a href="writing.html">執筆の画面</a>で足すと、ここから資料にできます。</p>`}
      <h3 class="tkhd">抜き書き（${notes.length}件）</h3><ul class="list nts">${notes.map(n => D.noteHTML(n)).join("")}</ul>
      <details><summary class="small">抜き書きを足す</summary>${D.noteForm({ tg })}</details></section>`;
  };
  // 抜き書きの一覧と枠の操作（どの画面でも同じ）
  D.bind = (el, after) => {
    el.addEventListener("submit", e => {
      const f = e.target.closest(".ntform"); if (!f) return; e.preventDefault();
      const n = D.readForm(f); if (!n.text || !n.tg) { UI.toast("一節と作品を入れてください"); return; }
      const old = f.dataset.id ? D.notes()[f.dataset.id] : null;
      D.putNote(f.dataset.id || null, { ...(old || {}), ...n });
      UI.toast(f.dataset.id ? "直しました" : "抜き書きを足しました"); after && after();
    });
    el.addEventListener("click", e => {
      const li = e.target.closest("[data-note]");
      if (li && e.target.closest("[data-note-del]")) { if (confirm("この抜き書きを消しますか？")) { D.delNote(li.dataset.note); after && after(); } return; }
      if (li && e.target.closest("[data-note-edit]")) { li.outerHTML = `<li>${D.noteForm({ id: li.dataset.note, note: D.notes()[li.dataset.note] })}</li>`; return; }
      if (e.target.closest("[data-note-cancel]")) { after && after(); return; }
    });
  };
  return D;
})();
