// 原作と映画の結び付け（2026-11-09）
// works/adaptations.json（Claudeが作る対応表）を読み、必読書チェッカーと映画チェッカーの両方から使う。
// 相手側の読了・鑑賞は、相手のチェッカーの記録（records/…）をそのまま読む。
"use strict";
window.Adapt = (() => {
  let src = null, byN = new Map(), byF = new Map();
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function build() {
    const d = window.Shelf && Shelf.read("works/adaptations.json");
    const ps = (d && d.pairs) || [];
    if (ps === src) return;
    src = ps; byN = new Map(); byF = new Map();
    for (const p of ps) {
      if (!byN.has(p.n)) byN.set(p.n, []); byN.get(p.n).push(p);
      if (!byF.has(p.f)) byF.set(p.f, []); byF.get(p.f).push(p);
    }
    for (const xs of byN.values()) xs.sort((a, b) => (a.fy || 0) - (b.fy || 0));
  }
  const filmsOf = nk => (build(), byN.get(nk) || []);
  const novelsOf = fk => (build(), byF.get(fk) || []);
  // 相手側の記録（自分の側は各チェッカーの手元の記録を使う）
  const novelRead = nk => !!(((window.Shelf && Shelf.read("records/novels-checker/books.json")) || {}).read || {})[nk];
  const filmSeen = fk => !!(((window.Shelf && Shelf.read("records/films-checker/watched.json")) || {}).seen || {})[fk];
  // 絞り込み：has（結び付きあり）・readNotSeen（原作は読んだが映画は未見）・seenNotRead（映画は観たが原作は未読）
  // isRead・isSeen は、画面の側の最新の記録で上書きするための関数
  function match(mode, ps, isRead, isSeen) {
    if (!mode) return true;
    if (!ps.length) return false;
    if (mode === "has") return true;
    if (mode === "readNotSeen") return ps.some(p => isRead(p.n) && !isSeen(p.f));
    if (mode === "seenNotRead") return ps.some(p => isSeen(p.f) && !isRead(p.n));
    return true;
  }
  return {
    filmsOf, novelsOf, novelRead, filmSeen, esc,
    count: () => (build(), { novels: byN.size, films: byF.size }),
    matchNovel: (mode, nk, isRead) => match(mode, filmsOf(nk), isRead, filmSeen),
    matchFilm: (mode, fk, isSeen) => match(mode, novelsOf(fk), novelRead, isSeen),
  };
})();
