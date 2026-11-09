// 映画のソフト（DVD・Blu-ray・ボックス）の所有（2026-11-09）
// 記録は records/discs.json の {items:{番号: ソフト}}。
// ソフト：{id, jan（バーコードの番号。無ければなし）, fks:[映画チェッカーの作品の番号]（ボックスは複数）, t（ソフトの名前。リストにない作品やボックスの名前）,
//          fmt（DVD／Blu-ray／4K UHD）, box（ボックスなら1）, loc（保管場所）, note, st（own：所有／gone：手放した）, src, added, u}
// 店の商品番号（JAN）から作品名を引く無料の仕組みは無いので、初めて読んだソフトは本人が作品を選んで結び付ける。
"use strict";
window.Discs = (() => {
  const P = "records/discs.json";
  const now = () => new Date().toISOString();
  const D = { P, FMT: ["DVD", "Blu-ray", "4K UHD"] };
  D.items = () => (Shelf.read(P) || {}).items || {};
  D.list = () => Object.values(D.items());
  D.get = id => D.items()[id] || null;
  D.byJan = jan => (jan ? D.list().find(d => d.jan === jan) : null) || null;
  D.forFilm = fk => D.list().filter(d => (d.fks || []).includes(fk));
  D.ownedFilm = fk => D.forFilm(fk).filter(d => d.st !== "gone");
  D.put = d => { d.u = now(); Shelf.writeItem(P, d.id, d); return d; };
  D.add = inp => D.put({
    id: `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    jan: inp.jan || undefined, fks: inp.fks || [], t: inp.t || undefined, fmt: inp.fmt || "DVD",
    box: (inp.fks || []).length > 1 || inp.box ? 1 : undefined, loc: inp.loc || undefined, note: inp.note || undefined,
    st: "own", src: inp.src || "manual", added: now(),
  });
  D.remove = id => Shelf.writeItem(P, id, null);
  // 作品の名前（映画チェッカーの作品）
  const films = () => (Shelf.read("works/films.json") || {}).films || [];
  D.film = fk => films().find(f => f.k === fk) || null;
  D.name = d => d.t || (d.fks || []).map(k => D.film(k)?.t).filter(Boolean).join("／") || "（作品未設定）";
  // 作品を名前で探す（ひらがな・カタカナ、全角・半角、記号の違いは無視）
  const norm = s => String(s || "").normalize("NFKC").toLowerCase()
    .replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60))
    .replace(/[\s・:：\-－―〜~!！?？「」『』（）()\[\]\.,、。'"’&\/]/g, "");
  D.search = (q, n = 8) => {
    const w = norm(q); if (!w) return [];
    const hits = [];
    for (const f of films()) {
      const t = norm(f.t), e = norm(f.en);
      const s = t === w || e === w ? 3 : t.startsWith(w) || e.startsWith(w) ? 2 : t.includes(w) || e.includes(w) ? 1 : 0;
      if (s) hits.push([s, f]);
    }
    return hits.sort((a, b) => b[0] - a[0] || (b[1].sc || 0) - (a[1].sc || 0)).slice(0, n).map(x => x[1]);
  };
  D.text = d => [d.fmt + (d.box ? "ボックス" : ""), d.loc].filter(Boolean).join("・");
  return D;
})();
