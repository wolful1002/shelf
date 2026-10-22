// 蔵書の記録の扱い：登録、必読書チェッカーとの所有・読了の連携、確認待ち、保管場所
"use strict";
(function () {
  const P = {
    novelDoc: "records/novels-checker/books.json",
    queue: "records/queue.json",
    settings: "records/settings.json",
    reading: "records/reading.json",
    novels: "works/novels.json",
    films: "works/films.json",
  };
  const HEX = "0123456789abcdef";
  function fnv(s) { let h = 0x811c9dc5; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
  const shardPath = id => `records/library/${HEX[fnv(id) % 16]}.json`;
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const now = () => new Date().toISOString();

  const L = { P };
  L.newId = (prefix = "b") => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  // ---------- 読み込み ----------
  let cache = null;
  Shelf.onAny(p => { if (p.startsWith("records/library/")) cache = null; });
  L.items = () => {
    if (cache) return cache;
    const m = {};
    for (let i = 0; i < 16; i++) Object.assign(m, Shelf.read(`records/library/${HEX[i]}.json`)?.items || {});
    cache = m; return m;
  };
  L.get = id => L.items()[id] || null;
  L.put = item => { item.u = now(); Shelf.writeItem(shardPath(item.id), item.id, item); cache = null; return item; };
  L.remove = id => { Shelf.writeItem(shardPath(id), id, null); cache = null; };
  L.byIsbn = isbn => {
    for (const it of Object.values(L.items())) {
      if (it.isbn === isbn) return { item: it };
      if (it.alt && it.alt.some(a => a.isbn === isbn)) return { item: it, alt: true };
      if (it.vols) for (const [n, v] of Object.entries(it.vols)) if (v.isbn === isbn) return { item: it, vol: +n };
    }
    return null;
  };
  L.byMag = (mag, month) => Object.values(L.items()).find(it => it.mag === mag && (!month || it.magMonth === month)) || null;
  L.byTitle = title => {
    const k = Biblio.normTitle(title);
    return Object.values(L.items()).filter(it => Biblio.normTitle(it.t) === k);
  };
  L.seriesFor = (base, pub) => {
    const k = Biblio.normTitle(base);
    return Object.values(L.items()).find(it => it.kind === "series" && Biblio.normTitle(it.t) === k && (!pub || !it.pub || it.pub === pub)) || null;
  };

  // ---------- 必読書チェッカーの記録（読了・読みたい・所有） ----------
  L.ndoc = () => Shelf.read(P.novelDoc) || { read: {}, want: {}, own: {} };
  function writeNdoc(fn) {
    const d = clone(L.ndoc()); d.read = d.read || {}; d.want = d.want || {}; d.own = d.own || {};
    fn(d); d.updated = now(); Shelf.writeDoc(P.novelDoc, d);
  }
  L.setOwn = (k, on) => writeNdoc(d => { if (on) d.own[k] = 1; else delete d.own[k]; });
  L.setNovelRead = (k, val) => writeNdoc(d => { if (val) { d.read[k] = val; delete d.want[k]; } else delete d.read[k]; });

  // ---------- 読書の状況（チェッカーに結び付かない本） ----------
  L.reading = () => Shelf.read(P.reading)?.items || {};
  L.setReading = (key, val) => Shelf.writeItem(P.reading, key, val ? { ...val, u: now() } : null);
  L.isRead = it => {
    if (it.kind === "series") { const v = Object.values(it.vols || {}); return v.length > 0 && v.filter(x => x.own).every(x => x.read); }
    if (it.nk) return !!L.ndoc().read[it.nk];
    return L.reading()["b:" + it.id]?.s === "read";
  };
  L.readDate = it => {
    if (it.nk) { const v = L.ndoc().read[it.nk]; return typeof v === "string" ? v : ""; }
    return L.reading()["b:" + it.id]?.d || "";
  };
  L.setRead = (it, on, date) => {
    if (it.nk) L.setNovelRead(it.nk, on ? (date || 1) : null);
    else L.setReading("b:" + it.id, on ? { s: "read", d: date || undefined, via: "manual", n: 1 } : null);
  };
  L.isUnreadOwned = it => it.st === "own" && !L.isRead(it);

  // ---------- 確認待ち ----------
  L.queue = () => Shelf.read(P.queue)?.items || {};
  L.qAdd = (type, target, extra = {}) => {
    const exists = Object.entries(L.queue()).find(([, q]) => q.type === type && q.target === target);
    if (exists) return exists[0];
    const id = L.newId("q");
    Shelf.writeItem(P.queue, id, { type, target, at: now(), ...extra });
    return id;
  };
  L.qDel = id => Shelf.writeItem(P.queue, id, null);
  L.qDelFor = target => { for (const [id, q] of Object.entries(L.queue())) if (q.target === target) L.qDel(id); };

  // ---------- 保管場所 ----------
  L.settings = () => Shelf.read(P.settings) || { places: {}, nextLabel: 1 };
  L.places = () => L.settings().places || {};
  L.addPlace = name => {
    const s = clone(L.settings()); s.places = s.places || {}; s.nextLabel = s.nextLabel || 1;
    const existing = Object.entries(s.places).find(([, n]) => n === name); if (existing) return existing[0];
    const code = Biblio.withCheck(Biblio.LABEL_PREFIX + String(s.nextLabel).padStart(10, "0"));
    s.places[code] = name; s.nextLabel++; Shelf.writeDoc(P.settings, s); return code;
  };
  L.renamePlace = (code, name) => { const s = clone(L.settings()); s.places[code] = name; Shelf.writeDoc(P.settings, s); };
  L.removePlace = code => { const s = clone(L.settings()); delete s.places[code]; Shelf.writeDoc(P.settings, s); };

  // ---------- 状態の変更（チェッカーの所有と揃える） ----------
  L.setStatus = (it, st) => {
    it = clone(it); it.st = st; L.put(it);
    if (it.nk) L.setOwn(it.nk, st === "own");
    if (st !== "off") L.qDelFor(it.id);
    return it;
  };
  L.link = (it, k) => {
    it = clone(it);
    const old = it.nk;
    if (k) { it.nk = k; it.link = "manual"; } else { delete it.nk; it.link = "none"; }
    L.put(it);
    if (old && old !== k) L.setOwn(old, false);
    if (k && it.st === "own") L.setOwn(k, true);
    L.qDelFor(it.id);
    return it;
  };
  const touched = it => !!(it.loc || it.isbn || it.note || it.media || it.src !== "checker");

  // チェッカーの「所有」と蔵書を突き合わせる。何度実行しても同じ結果になる
  L.reconcile = () => {
    const own = L.ndoc().own || {};
    const items = Object.values(L.items());
    // 同じ作品に結び付いた記録が複数あれば、所有中で、実物の情報がある（スキャンなどで登録した）記録を代表にする
    const rank = it => (it.st === "own" ? 2 : 0) + (touched(it) ? 1 : 0);
    const byNk = new Map(); for (const it of items) if (it.nk && it.kind !== "series") { const cur = byNk.get(it.nk); if (!cur || rank(it) > rank(cur)) byNk.set(it.nk, it); }
    // 代表でない仮登録が所有のまま残っていれば、静かに外して重複をなくす
    for (const it of items) if (it.nk && it.kind !== "series" && it.st === "own" && !touched(it) && byNk.get(it.nk) !== it) { const c = clone(it); c.st = "off"; c.merged = byNk.get(it.nk).id; L.put(c); }
    const works = Shelf.read(P.novels); const wk = works ? new Map(works.books.map(b => [b.k, b])) : null;
    let added = 0, offed = 0;
    for (const k of Object.keys(own)) {
      const it = byNk.get(k);
      if (!it) {
        const w = wk?.get(k); if (!w) continue;
        L.put({ id: "b-ck-" + k + (L.get("b-ck-" + k) ? "-" + Date.now().toString(36) : ""), kind: "book", cat: "小説", t: w.t, a: w.a, st: "own", src: "checker", nk: k, link: "auto", added: now() });
        added++;
      } else if (it.st !== "own") { const c = clone(it); c.st = "own"; L.put(c); L.qDelFor(it.id); }
    }
    for (const it of items) {
      if (!it.nk || it.kind === "series" || it.st !== "own" || own[it.nk]) continue;
      if (byNk.get(it.nk) !== it) continue;
      const c = clone(it); c.st = "off"; L.put(c); offed++;
      if (touched(it)) L.qAdd("unowned", it.id, { why: "必読書チェッカーで「所有」が外されました。手放しましたか？" });
    }
    return { added, offed };
  };

  // ---------- 登録 ----------
  // in: {isbn?, mag?, magMonth?, bib?, ccode?, src, loc?, media?, t?, a?}
  // out: {status:'new'|'dup'|'vol'|'voldup', item, vol?, match?}
  L.register = async (inp) => {
    if (inp.isbn) { const hit = L.byIsbn(inp.isbn); if (hit) return { status: hit.vol != null ? "voldup" : "dup", item: hit.item, vol: hit.vol }; }
    if (inp.mag) { const hit = L.byMag(inp.mag, inp.magMonth); if (hit) return { status: "dup", item: hit }; }
    const bib = inp.bib || null;
    const ccode = inp.ccode || bib?.ccode || "";
    let cat = Biblio.catFromC(ccode) || Biblio.catFromNdc(bib?.ndc) || (/コミック/.test(bib?.label || "") ? "漫画" : null);
    if (inp.mag) cat = inp.isbn ? "ムック" : "雑誌";
    const fmt = inp.media === "ebook" ? "電子" : (Biblio.formatFromC(ccode) || (inp.mag ? "雑誌" : ""));
    const t = bib?.t || inp.t || "";
    const a = bib?.a || inp.a || "";
    const base = { cat: cat || "その他", catAuto: !!cat, a, pub: bib?.pub || "", y: bib?.y || null, ccode: ccode || undefined, fmt: fmt || undefined,
      media: inp.media || "paper", loc: inp.loc || undefined, st: "own", src: inp.src, added: now(), cover: bib?.cover || undefined, label: bib?.label || undefined };
    // 巻数があればシリーズにまとめる（漫画のほか、巻数で出る本も）
    const sv = Biblio.splitVolume(t, bib?.vol);
    if (t && sv.vol != null && sv.base && (cat === "漫画" || /^\d+$/.test(String(bib?.vol || "").normalize("NFKC")))) {
      let s = L.seriesFor(sv.base, base.pub);
      if (s) {
        s = clone(s); s.vols = s.vols || {};
        const had = s.vols[sv.vol];
        s.vols[sv.vol] = { ...(had || {}), own: 1, isbn: inp.isbn || had?.isbn };
        if (inp.loc && !s.loc) s.loc = inp.loc;
        if (s.st !== "own") s.st = "own";
        L.put(s);
        return { status: had?.own ? "voldup" : "vol", item: s, vol: sv.vol };
      }
      s = { id: L.newId("s"), kind: "series", t: sv.base, ...base, vols: { [sv.vol]: { own: 1, isbn: inp.isbn } } };
      L.put(s);
      if (!cat) L.qAdd("cat", s.id, { why: "本の種類を判定できませんでした" });
      return { status: "vol", item: s, vol: sv.vol, newSeries: true };
    }
    let match = null;
    if (t && (!cat || cat === "小説" || cat === "その他")) match = Biblio.matchNovel(t, a);
    // 同じ作品の記録がすでにあれば、それにまとめる（作品ごとに1件）
    if (match?.status === "auto") {
      const same = Object.values(L.items()).filter(x => x.nk === match.work.k && x.kind !== "series")
        .sort((x, y) => (y.st === "own") - (x.st === "own") || touched(y) - touched(x))[0];
      if (same) {
        const x = clone(same);
        if (!touched(same)) {
          // チェッカーからの仮登録：読んだ本の情報で埋める
          Object.assign(x, base, { t: same.t || t, a: same.a || a, isbn: inp.isbn || undefined, src: inp.src, added: same.added || base.added, st: "own", link: same.link || "auto" });
          if (bib?.t && bib.t !== same.t) x.note = [same.note, `書誌の書名：${bib.t}`].filter(Boolean).join("／");
          L.put(x); if (x.nk) L.setOwn(x.nk, true); L.qDelFor(x.id);
          return { status: "new", item: x, match, upgraded: true };
        }
        // 実物の記録がある：別の版として同じ記録に足す
        x.alt = x.alt || [];
        if (inp.isbn && !x.alt.some(y => y.isbn === inp.isbn)) x.alt.push({ isbn: inp.isbn, pub: base.pub || undefined, fmt: base.fmt || undefined, loc: base.loc || undefined, media: base.media });
        if (x.st !== "own") x.st = "own";
        L.put(x); if (x.nk) L.setOwn(x.nk, true); L.qDelFor(x.id);
        return { status: "alt", item: x, match };
      }
    }
    const it = { id: L.newId("b"), kind: "book", t: t || "（書誌が見つかりません）", isbn: inp.isbn || undefined, mag: inp.mag || undefined, magMonth: inp.magMonth || undefined, ...base };
    if (bib?.vol && !/^\d+$/.test(bib.vol)) it.note = bib.vol;
    if (match?.status === "auto") { it.nk = match.work.k; it.link = "auto"; }
    else if (match?.status === "wait") { it.link = "wait"; }
    L.put(it);
    if (it.nk) L.setOwn(it.nk, true);
    if (match?.status === "wait") L.qAdd("link", it.id, { why: "必読書チェッカーの作品と結び付けるか、候補から選んでください", cands: match.cands.map(w => w.k) });
    if (!bib) L.qAdd("bib", it.id, { why: "書誌が見つかりませんでした。書名と著者を入れてください" });
    else if (bib.trial) L.qAdd("check", it.id, { why: "書誌が「試し読み版」などになっています。内容を確かめてください" });
    else if (!cat) L.qAdd("cat", it.id, { why: "本の種類を判定できませんでした" });
    return { status: "new", item: it, match };
  };

  // 所持確認：登録はせず、持っているかどうかと関連する情報を返す
  L.check = async (code) => {
    const c = Biblio.classify(code);
    if (c.kind === "isbn") {
      const hit = L.byIsbn(c.code);
      if (hit) return { owned: true, c, ...hit };
      const bib = await Biblio.lookup(c.code);
      const sameTitle = bib ? L.byTitle(bib.t).filter(x => x.st === "own") : [];
      const sv = bib ? Biblio.splitVolume(bib.t, bib.vol) : null;
      const series = sv && sv.vol != null ? L.seriesFor(sv.base) : null;
      const m = bib ? Biblio.matchNovel(bib.t, bib.a) : null;
      const work = m?.status === "auto" ? m.work : null;
      const films = bib ? Biblio.filmsByTitle(bib.t) : [];
      return { owned: false, c, bib, sameTitle, series, vol: sv?.vol, work, workRead: work ? !!L.ndoc().read[work.k] : false, films };
    }
    if (c.kind === "magazine") { const hit = L.byMag(c.mag, c.month); return { owned: !!hit, c, item: hit }; }
    return { owned: false, c };
  };

  window.Lib = L;
})();
