// 作品を指す共通の道具（2026-11-14）
// 本・映画・ドラマとアニメ・リスト外の映画を「種類:番号」（novel:必読書の番号／film:映画の番号／lib:蔵書の番号／show:ドラマ・アニメの番号／off:リスト外の映画の題名）で指し、
// 探す・名前を出す・参考文献の形に書く。作品のページ（work.js）と執筆の画面（writing.js）で使う。
"use strict";
window.Works = (() => {
  const W = {};
  const OFF = "records/films-checker/offlist.json";
  // tools/sns_match.py の norm と同じ（ひらがなとカタカナ、全角と半角、記号の違いを無視する）
  W.norm = s => {
    s = String(s || "").normalize("NFKC").toLowerCase().replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
    return s.replace(/[\s・:：\-－―〜~!！?？「」『』（）()\[\]【】.,、。'"’&/＆♪☆★]/g, "");
  };
  const novels = () => Shelf.read("works/novels.json")?.books || [];
  const films = () => Shelf.read("works/films.json")?.films || [];
  const shows = () => Shelf.read("records/shows.json")?.items || {};
  const offs = () => Shelf.read(OFF)?.items || [];
  let NOV = null, FIL = null;
  const nov = k => (NOV = NOV || new Map(novels().map(b => [b.k, b]))).get(k);
  const fil = k => (FIL = FIL || new Map(films().map(f => [f.k, f]))).get(k);
  W.reset = () => { NOV = FIL = IDX = null; };
  const split = tg => { const i = tg.indexOf(":"); return [tg.slice(0, i), tg.slice(i + 1)]; };
  // 国立国会図書館の形の著者名（「伊藤,計劃,1974-2009」）を読みやすくする
  W.person = a => String(a || "").split(/\s*[;；]\s*/).map(x => x.replace(/,\s*\d{3,4}-(\d{3,4})?/g, "").replace(/,/g, "")).join("、");
  let region = null; try { region = new Intl.DisplayNames(["ja"], { type: "region" }); } catch (e) {}
  const country = c => String(c || "").split(/[\/,]/).map(x => { try { return region ? region.of(x.trim()) : x; } catch (e) { return x; } }).join("・");
  // 必読書の作品に結び付いた蔵書（持っている版を先に）
  W.libsOf = k => Object.values(Lib.items()).filter(it => it.nk === k).sort((a, b) => (b.st === "own") - (a.st === "own"));

  // 作品の名前・種類・開くページ・保管場所・参考文献の形
  W.info = tg => {
    const [kind, key] = split(tg);
    if (kind === "novel") {
      const b = nov(key); if (!b) return null;
      const lib = W.libsOf(key).find(it => it.st === "own");
      const cite = lib ? libCite(lib, b.t) : `${W.person(b.a)}『${b.t}』${b.jp ? b.jp.replace(/（(.+?)訳）/, "（$1訳）") : ""}${b.jy ? `、${b.jy}年` : ""}。`;
      return { tg, kind: "必読書", t: b.t, sub: [W.person(b.a), b.y > 0 ? b.y : ""].filter(Boolean).join("・"), url: `work.html?n=${key}`, loc: lib?.loc || "", own: !!lib, cite };
    }
    if (kind === "lib") {
      const it = Lib.get(key); if (!it) return null;
      return { tg, kind: "蔵書", t: it.t, sub: [W.person(it.a), it.label || it.pub].filter(Boolean).join("・"), url: `work.html?b=${encodeURIComponent(key)}`, loc: it.loc || "", own: it.st === "own", cite: libCite(it) };
    }
    if (kind === "film") {
      const f = fil(key); if (!f) return null;
      return { tg, kind: "映画", t: f.t, sub: [f.d, f.y].filter(Boolean).join("・"), url: `work.html?f=${key}`, loc: "", cite: `${f.d ? f.d + "監督" : ""}『${f.t}』（${[country(f.c), f.y ? f.y + "年" : ""].filter(Boolean).join("、")}）。` };
    }
    if (kind === "show") {
      const s = shows()[key]; if (!s) return null;
      return { tg, kind: s.cat || "ドラマ・アニメ", t: s.t, sub: [s.cat, s.y].filter(Boolean).join("・"), url: `work.html?s=${encodeURIComponent(key)}`, loc: "", cite: `『${s.t}』（${s.y ? s.y + "年〜" : ""}）。` };
    }
    if (kind === "off") {
      const o = offs().find(o => W.norm(o.t) === key) || null;
      const t = o?.t || key;
      return { tg, kind: "映画", t, sub: o?.y ? String(o.y) : "", url: `work.html?o=${encodeURIComponent(t)}`, loc: "", cite: `『${t}』${o?.y ? `（${o.y}年）` : ""}。` };
    }
    return null;
  };
  function libCite(it, title) {
    const t = (title || it.t).replace(/\s*[:：]\s*$/, "");
    return `${W.person(it.a)}『${t}』${it.tr ? `（${W.person(it.tr)}訳）` : ""}${it.pub || ""}${it.label && it.pub && !it.label.includes(it.pub) ? `（${it.label}）` : ""}${it.y ? `、${it.y}年` : ""}。`;
  }

  // 探す：本・映画・ドラマ・アニメ・リスト外の映画をまとめて
  let IDX = null;
  W.index = () => {
    if (IDX) return IDX;
    const xs = [], n = W.norm;
    for (const b of novels()) xs.push({ tg: "novel:" + b.k, t: b.t, s: [W.person(b.a), b.y > 0 ? b.y : ""].filter(Boolean).join("・"), k: "必読書", n: n([b.t, b.o, b.a].join(" ")), nt: n(b.t) });
    for (const f of films()) xs.push({ tg: "film:" + f.k, t: f.t, s: [f.d, f.y].filter(Boolean).join("・"), k: "映画", n: n([f.t, f.en, f.d].join(" ")), nt: n(f.t) });
    for (const it of Object.values(Lib.items())) if (!it.nk && !it.issues) xs.push({ tg: "lib:" + it.id, t: it.t, s: [W.person(it.a), it.label || it.pub].filter(Boolean).join("・"), k: "蔵書", n: n([it.t, it.a].join(" ")), nt: n(it.t) });
    for (const it of Object.values(shows())) xs.push({ tg: "show:" + it.id, t: it.t, s: [it.cat, it.y].filter(Boolean).join("・"), k: it.cat || "ドラマ・アニメ", n: n([it.t, it.ot].join(" ")), nt: n(it.t) });
    const seen = new Set();
    for (const o of offs()) { const k = n(o.t); if (seen.has(k)) continue; seen.add(k); xs.push({ tg: "off:" + k, t: o.t, s: o.y ? String(o.y) : "", k: "リスト外の映画", n: k, nt: k }); }
    for (const x of xs) x.h = W.urlOf(x.tg, x.t);
    return IDX = xs;
  };
  W.urlOf = (tg, t) => { const [kind, key] = split(tg); return { novel: `work.html?n=${key}`, film: `work.html?f=${key}`, lib: `work.html?b=${encodeURIComponent(key)}`, show: `work.html?s=${encodeURIComponent(key)}`, off: `work.html?o=${encodeURIComponent(t || key)}` }[kind]; };
  W.search = (q, max = 30) => {
    q = W.norm(q); if (!q) return [];
    return W.index().filter(x => x.n.includes(q)).sort((a, b) => (b.nt.startsWith(q) - a.nt.startsWith(q)) || a.nt.length - b.nt.length).slice(0, max);
  };
  // 作品のページの番号（?n= など）から「種類:番号」を作る
  W.fromParams = p => p.get("n") ? "novel:" + p.get("n") : p.get("f") ? "film:" + p.get("f") : p.get("b") ? "lib:" + p.get("b") : p.get("s") ? "show:" + p.get("s") : p.get("o") ? "off:" + W.norm(p.get("o")) : "";
  W.paths = ["works/novels.json", "works/films.json", "records/library/", "records/shows.json", OFF];
  return W;
})();
