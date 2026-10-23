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
  // まとめて登録するときの下書き。B が有るあいだは、書き込みを端末の中だけに貯め、commit でファイルごとに一度に送る（discard で捨てる）
  let B = null;
  Shelf.onAny(p => { if (p.startsWith("records/library/") && !B) cache = null; });
  L.items = () => {
    if (cache) return cache;
    const m = {};
    for (let i = 0; i < 16; i++) Object.assign(m, Shelf.read(`records/library/${HEX[i]}.json`)?.items || {});
    if (B) { for (const [id, v] of Object.entries(B.items)) { if (v === null) delete m[id]; else m[id] = v; } }
    cache = m; return m;
  };
  L.get = id => L.items()[id] || null;
  L.put = item => {
    item.u = now();
    if (B) { B.items[item.id] = item; L.items()[item.id] = item; L._indexPut(item); return item; }
    Shelf.writeItem(shardPath(item.id), item.id, item); cache = null; return item;
  };
  L.remove = id => {
    if (B) { B.items[id] = null; delete L.items()[id]; return; }
    Shelf.writeItem(shardPath(id), id, null); cache = null;
  };
  L.batchBegin = () => { B = { items: {}, queue: clone(Shelf.read(P.queue)?.items || {}), ndoc: null, reading: null }; cache = null; };
  L.batchActive = () => !!B;
  L.batchDiscard = () => { B = null; cache = null; };
  L.batchChanges = () => B ? { items: { ...B.items }, queue: B.queue, ndoc: B.ndoc, reading: B.reading } : null;
  L.batchCommit = () => {
    if (!B) return 0;
    const byShard = {};
    for (const [id, v] of Object.entries(B.items)) (byShard[shardPath(id)] = byShard[shardPath(id)] || {})[id] = v;
    let files = 0;
    for (const [path, ch] of Object.entries(byShard)) {
      const d = clone(Shelf.read(path)) || { items: {} }; d.items = d.items || {};
      for (const [id, v] of Object.entries(ch)) { if (v === null) delete d.items[id]; else d.items[id] = v; }
      Shelf.writeDoc(path, d); files++;
    }
    Shelf.writeDoc(P.queue, { items: B.queue }); files++;
    if (B.ndoc) { Shelf.writeDoc(P.novelDoc, B.ndoc); files++; }
    if (B.reading) { Shelf.writeDoc(P.reading, { items: B.reading }); files++; }
    B = null; cache = null;
    return files;
  };
  // ---------- 巻の扱い（版違い・雑誌の号を含む） ----------
  // シリーズの巻は it.vols（元の版）と it.eds[版名].vols（モノクロ版・完全版など）に持つ。雑誌は it.issues が真で、巻の番号の代わりに "2026-08" のような号を持つ
  L.EDRE = /\s*[【\[(（]?\s*(モノクロ版|カラー版|完全版|新装版|愛蔵版|新装改訂版|復刻版|ワイド版|文庫版|極！単行本シリーズ|デラックス版|豪華版|特装版|限定版|電子特装版)\s*[】\])）]?\s*/;
  L.splitEd = title => { const t = String(title || "").normalize("NFKC"); const m = t.match(L.EDRE); return m ? { base: t.replace(L.EDRE, " ").replace(/\s+/g, " ").trim(), ed: m[1] } : { base: t.trim(), ed: "" }; };
  L.volMaps = it => [["", it.vols || {}], ...Object.entries(it.eds || {}).map(([e, x]) => [e, x.vols || {}])];
  L.ownVolCount = it => L.volMaps(it).reduce((s, [, m]) => s + Object.values(m).filter(v => v.own).length, 0);
  L.byIsbn = isbn => {
    for (const it of Object.values(L.items())) {
      if (it.isbn === isbn) return { item: it };
      if (it.alt && it.alt.some(a => a.isbn === isbn)) return { item: it, alt: true };
      for (const [ed, m] of L.volMaps(it)) for (const [n, v] of Object.entries(m)) if (v.isbn === isbn) return { item: it, vol: it.issues ? n : +n, ed };
    }
    return null;
  };
  L.byAsin = asin => {
    if (!asin) return null;
    for (const it of Object.values(L.items())) {
      if (it.asin === asin) return { item: it };
      if (it.alt && it.alt.some(a => a.asin === asin)) return { item: it, alt: true };
      for (const [ed, m] of L.volMaps(it)) for (const [n, v] of Object.entries(m)) if (v.asin === asin) return { item: it, vol: it.issues ? n : +n, ed };
    }
    return null;
  };
  // 同じ本かどうかを見るための書名の鍵。チェッカーとの照合（normTitle）と違い、上・中・下や巻数は残す（別の本なので）。
  // 末尾のレーベル（(ハヤカワ文庫SF) など）と、新装版などの版の言葉は外す
  L.sameKey = t => {
    let s = String(t || "").normalize("NFKC").replace(/〈([^〉]*)〉|<([^>]*)>|＜([^＞]*)＞/g, " $1$2$3 ").replace(/\[[^\]]*\]|【[^】]*】/g, " ");
    for (let i = 0; i < 4; i++) { const b = s; s = s.replace(/\s*\(([^()]*)\)\s*$/, (m, x) => /^\s*(第?\d{1,3}巻?|上|中|下|前編|後編|上巻|下巻)\s*$/.test(x) ? m : "").trim(); if (s === b) break; }
    return Biblio.norm(s.replace(/新装改訂版|新装版|新訳版?|完全版|決定版|改訂版|増補版|増補改訂版/g, ""));
  };
  // 書名の索引（まとめて登録するときに速くするため）。記録の一覧が作り直されたら作り直す
  const TIDX = new WeakMap();
  function titleIndex() {
    const items = L.items(); let ix = TIDX.get(items);
    if (!ix) { ix = new Map(); for (const it of Object.values(items)) { const k = L.sameKey(it.t); if (!ix.has(k)) ix.set(k, new Set()); ix.get(k).add(it.id); } TIDX.set(items, ix); }
    return ix;
  }
  L._indexPut = it => { const ix = TIDX.get(L.items()); if (!ix) return; const k = L.sameKey(it.t); if (!ix.has(k)) ix.set(k, new Set()); ix.get(k).add(it.id); };
  // 書名と著者で同じ本を探す（ISBN・ASINで見つからなかったとき）。返り値：{item}（1件に絞れた）・{cands}（迷う）・null
  L.findSameByTitle = (t, a, excludeId) => {
    const k = L.sameKey(t); if (!k || k.length < 2) return null;
    const hits = [...(titleIndex().get(k) || [])].map(id => L.get(id)).filter(it => it && it.kind !== "series" && it.id !== excludeId && L.sameKey(it.t) === k);
    if (!hits.length) return null;
    const na = Biblio.norm(a);
    // 著者がローマ字とかなのように書き方が違うと比べられないので、比べられないときは同じとみなす
    const latin = x => /[a-z]/.test(x) && !/[぀-ヿ一-鿿]/.test(x);
    const sameA = hits.filter(it => { const ia = Biblio.norm(it.a); return !na || !ia || ia.includes(na) || na.includes(ia) || latin(na) !== latin(ia) || authorOverlap(a, it.a); });
    if (sameA.length === 1 && (Biblio.norm(sameA[0].a) && na ? true : hits.length === 1)) return { item: sameA[0] };
    return { cands: (sameA.length ? sameA : hits).slice(0, 5) };
  };
  // 著者名のどれか1人が重なるか（「劉慈欣、大森望」と「劉慈欣」など）。区切りは読点・カンマ・空白
  function authorOverlap(x, y) {
    const toks = v => String(v || "").normalize("NFKC").split(/[、,，;；\/／]+|\s{2,}/).map(t => Biblio.norm(t.replace(/\d{4}-(\d{4})?/g, ""))).filter(t => t.length >= 2);
    const ny = Biblio.norm(y), nx = Biblio.norm(x);
    return toks(x).some(t => ny.includes(t)) || toks(y).some(t => nx.includes(t));
  }
  // 空いている項目だけを埋める。手で入れた値は上書きしない。購入の記録は経路ごとに足す
  const FILL = ["a", "pub", "label", "tr", "y", "ccode", "fmt", "cover", "isbn", "asin", "mag", "loc", "sr", "sv"];
  L.absorb = (it, inp, base = {}) => {
    const x = clone(it); let changed = false;
    for (const k of FILL) { const v = base[k] ?? inp[k]; if (v != null && v !== "" && (x[k] == null || x[k] === "")) { x[k] = v; changed = true; } }
    if (x.t && x.t.startsWith("（") && (base.t || inp.t)) { x.t = base.t || inp.t; changed = true; }
    if (x.cat === "その他" && x.catAuto === false && base.cat && base.cat !== "その他") { x.cat = base.cat; x.catAuto = true; changed = true; }
    const m = inp.media || base.media;
    // 電子だけで持っていた本に紙が加わったら、保管場所は紙の置き場所にし、ストア名は eloc に移す
    if (m === "paper" && x.media === "ebook" && inp.loc) { x.eloc = x.eloc || x.loc; x.loc = inp.loc; changed = true; }
    if (m && x.media && m !== x.media && x.media !== "both") { x.media = "both"; changed = true; }
    if (m === "ebook" && inp.store && !x.eloc) { x.eloc = inp.store; changed = true; }
    if (inp.buy) { x.buy = x.buy || []; if (!x.buy.some(b => b.shop === inp.buy.shop && b.d === inp.buy.d)) { x.buy.push(inp.buy); changed = true; } }
    if (inp.cond && !(x.note || "").includes(inp.cond)) { x.note = [x.note, inp.cond].filter(Boolean).join("／"); changed = true; }
    if (x.st !== "own" && inp.st !== "want") { x.st = "own"; changed = true; }
    return changed ? x : null;
  };
  L.byMag = (mag, month) => Object.values(L.items()).find(it => it.mag === mag && (!month || it.magMonth === month)) || null;
  L.byTitle = title => {
    const k = Biblio.normTitle(title);
    return Object.values(L.items()).filter(it => Biblio.normTitle(it.t) === k);
  };
  // 書誌の書名には「葬送のフリーレン = FRIEREN. VOL.」のように別の書き方が付くことがあるので、「=」から後ろと末尾の VOL. を除いても比べる
  const seriesCore = t => Biblio.normTitle(String(t || "").normalize("NFKC").replace(/\s+=\s.*$/, "").replace(/[\s.]*vol\.?\s*$/i, ""));
  L.seriesFor = (base, pub) => {
    const k = Biblio.normTitle(base), all = Object.values(L.items()).filter(it => it.kind === "series" && (!pub || !it.pub || it.pub === pub));
    const hit = all.find(it => Biblio.normTitle(it.t) === k);
    if (hit) return hit;
    const c = seriesCore(base); if (!c) return null;
    const hits = all.filter(it => seriesCore(it.t) === c);
    return hits.length === 1 ? hits[0] : null;
  };

  // ---------- 作品のシリーズ（副題が付いた巻：「ハリー・ポッターと賢者の石」「デルトラ・クエスト 5 恐怖の山」など） ----------
  // 1冊ずつの記録に sr（シリーズ名）・sv（シリーズの中の順番。"1"・"2-3"・無ければ null）を持たせ、一覧ではまとめて見せる。
  // 漫画のように巻だけで区別する本（kind:"series" の記録）とは別。1冊ずつの記録のままなので、チェッカーとの結び付き・読了・保管場所はそのまま
  const SR_LABEL = /文庫|新書|選書|叢書|ノベルス|ノベルズ|コミックス|ブックス|books|ライブラリ|コレクション|セレクション|全集|講座|学術|スタディーズ|ドラゴンブック|KAGUYA|STAMP|フロンティア|BOOKS?$|ハヤカワ|創元|新潮|講談社|岩波|ちくま|中公|角川|光文社|幻冬舎|集英社|徳間|河出|平凡社|白水|みすず|青土|PHP|NHK|日経|ポプラ|偕成社|福音館|理論社|静山社|あすなろ|小学館|KADOKAWA|電撃|ガガガ|富士見|星海社|ブルーバックス|文学館|翻訳|単行本|Kindle|上下巻|クラシックス|名作|モダン|メチエ|ライト|Jコレ|^日本$|^PART$|^(上|中|下|前編|後編|完全版|新装版|新版|改訂版|新訳版?)$/i;
  const ROMAN_RE = /^(X{0,3})(IX|IV|V?I{0,3})$/i;
  const roman = r => { r = r.toUpperCase(); if (!r || !ROMAN_RE.test(r)) return null; const v = { I: 1, V: 5, X: 10 }; let n = 0; for (let i = 0; i < r.length; i++) { const c = v[r[i]], d = v[r[i + 1]] || 0; n += c < d ? -c : c; } return n || null; };
  const KAN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
  const volOf = v => {
    if (v == null) return null; v = String(v).normalize("NFKC").trim().replace(/^第/, "").replace(/[巻幕部]$/, "");
    if (/^\d{1,2}(-\d{1,3})?$/.test(v)) return v.replace(/^0+(?=\d)/, "");
    const r = roman(v); if (r) return String(r);
    if (/^[一二三四五六七八九十]+$/.test(v)) return String(v.length === 1 ? KAN[v] : v[0] === "十" ? 10 + (KAN[v[1]] || 0) : KAN[v[0]] * 10 + (KAN[v[2]] || 0));
    return null;
  };
  const srClean = n => String(n || "").normalize("NFKC").replace(/\s*(Lesson|Vol\.?|No\.?|Part|PART|Book)\s*$/i, "").replace(/[\s・:：]*(シリーズ|外伝)$/, "").replace(/^[\s・:：\-―~〜]+|[\s・:：\-―~〜〈《「（(]+$/g, "").trim();
  L.srKey = n => Biblio.norm(srClean(n));
  const plainTitle = t => String(t || "").normalize("NFKC").replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ").replace(/\s+/g, " ").trim();
  const okName = n => n.length >= 2 && !SR_LABEL.test(n) && !/^\d/.test(n) && !/全\d+巻/.test(n);
  // 数だけの括弧「(6)」を順番とみなす
  const parenVol = t => { const m = String(t || "").normalize("NFKC").match(/\(\s*(\d{1,2})\s*\)/); return m ? String(+m[1]) : null; };
  // 書名や書誌から、シリーズ名と順番の候補を、確からしい順に挙げる（[{name, vol, how}]）。
  // how：paren（書名の括弧の中のシリーズ名）・bib（国立国会図書館のシリーズ名）・num（書名の中の巻数）。
  // 候補を挙げるだけで、本当にシリーズとみなすのは、同じ候補を持つ同じ著者の別の本があるときだけ（autoSeries）
  const SC = new Map();
  L.seriesCands = (t, bib) => {
    if (!bib && SC.has(t)) return SC.get(t);
    const r = seriesCands0(t, bib); if (!bib) { if (SC.size > 5000) SC.clear(); SC.set(t, r); } return r;
  };
  const seriesCands0 = (t, bib) => {
    const s = String(t || "").normalize("NFKC"), out = [];
    const add = (name, vol, how) => { name = srClean(name); if (okName(name) && !out.some(c => L.srKey(c.name) === L.srKey(name))) out.push({ name, vol, how }); else { const c = out.find(c => L.srKey(c.name) === L.srKey(name)); if (c && c.vol == null && vol != null) c.vol = vol; } };
    // 書名の中の巻数：「テメレア戦記 4 象牙の帝国」「灼眼のシャナVI」「額の宝石 ルーンの杖秘録1」「デモナータ1幕 ロード・ロス」
    const base = plainTitle(s);
    const num = base.match(/^(.{2,}?[^\d\s])\s*(?:第)?(?:(\d{1,2})(?:巻|幕|部)?(?=$|[\s:：・\-―~〜〈《])|(?<=\s)(\d{1,2})(?=[^\x00-\x7F])(?![年世紀講月日時歳人回分冊章話号度代％%])|([IVX]{1,6})(?=$|[\s:：・\-―~〜]|[^\x00-\x7F]))/);
    const numVol = num ? volOf(num[2] || num[3] || num[4]) : null;
    // 括弧の中のシリーズ名：「(ハリー・ポッターシリーズ 1)」「(デルトラ・クエスト 2-3)」「(ゲド戦記 III)」。読み仮名の括弧（前に空白が無い）は除く
    const parens = [...s.matchAll(/(\s|^)\(([^()]*(?:\([^()]*\)[^()]*)*)\)/g)].map(m => m[2]).reverse();
    for (const inner of parens) {
      const m = inner.trim().match(/^(.*?)[\s・]*(第?\d{1,3}(?:-\d{1,3})?[巻幕部]?|[IVX]{1,6}|[一二三四五六七八九十]{1,3}|\?)?$/);
      const name = m ? m[1] : inner;
      let vol = volOf(m?.[2]);
      if (vol == null && num && L.srKey(num[1]) === L.srKey(name)) vol = numVol;
      add(name, vol, "paren");
      const first = srClean(name).split(/\s+/)[0]; if (first !== srClean(name)) add(first, vol, "paren");
    }
    if (bib?.series) { const m = String(bib.series).normalize("NFKC").match(/^(.*?)[\s;；・]*(\d{1,3}|[IVX]{1,6})?$/); add(m ? m[1] : bib.series, volOf(m?.[2]) || volOf(bib.vol), "bib"); }
    if (num) { add(num[1], numVol, "num"); const parts = srClean(num[1]).split(/\s+/); const last = parts[parts.length - 1]; if (parts.length > 1 && last.length >= 3 && /[^\x00-\x7F]/.test(last)) add(last, numVol, "num"); }
    // 書名そのもの：「蛇行する川のほとり (1)」と「蛇行する川のほとり 2」のように、番号の付いた別の本と組になるときのため。順番は数だけの括弧から
    else add(base.replace(/\s*[-―~〜].*[-―~〜]\s*$/, ""), parenVol(s), "title");
    return out;
  };
  // 何度も使う書名の加工は覚えておく（まとめて登録するときに遅くならないように）
  const memo = f => { const m = new Map(); return t => { if (m.has(t)) return m.get(t); if (m.size > 20000) m.clear(); const v = f(t); m.set(t, v); return v; }; };
  const ptKey = memo(t => L.sameKey(plainTitle(t))), ptNorm = memo(t => Biblio.norm(plainTitle(t))), srKeyC = memo(n => L.srKey(n));
  // シリーズの仲間（同じシリーズ名・著者が重なる本）
  const sameAuthor = (a, b) => !a || !b || authorOverlap(a, b) || Biblio.norm(a) === Biblio.norm(b);
  const latinOnly = x => /[a-z]/i.test(x) && !/[぀-ヿ一-鿿]/.test(x);
  // 著者が同じとみなせるか（片方がローマ字・片方がかなのように書き方が違うときは比べられないので、同じとみなす）
  L.authorMatch = (a, b) => sameAuthor(a, b) || latinOnly(a) !== latinOnly(b);
  L.seriesMembers = (key, a, excludeId) => Object.values(L.items()).filter(it => it.sr && L.srKey(it.sr) === key && it.id !== excludeId && sameAuthor(a, it.a));
  const commonHead = ts => { if (!ts.length) return ""; let p = ts[0]; for (const t of ts) { let i = 0; while (i < p.length && p[i] === t[i]) i++; p = p.slice(0, i); } return p; };
  // シリーズを探すための索引（記録の一覧ごとに1度だけ作る）。cand：候補のシリーズ名→本・sr：付いているシリーズ名→本・to：「〇〇と」の始まり→本
  const SRIX = new WeakMap();
  const toHead = t => { const m = plainTitle(t).match(/^([^、,。\s]{4,}?)と./); return m ? m[1] : null; };
  function srIndex() {
    const items = L.items(); let ix = SRIX.get(items);
    if (!ix) {
      ix = { cand: new Map(), sr: new Map(), to: new Map() };
      const add = (m, k, id) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(id); };
      for (const x of Object.values(items)) {
        if (x.kind === "series" || x.st === "want") continue;
        for (const c of L.seriesCands(x.t)) add(ix.cand, srKeyC(c.name), x.id);
        if (x.sr) add(ix.sr, srKeyC(x.sr), x.id);
        const h = toHead(x.t); if (h) add(ix.to, Biblio.norm(h), x.id);
      }
      SRIX.set(items, ix);
    }
    return ix;
  }
  // 1冊の記録にシリーズを付ける。同じシリーズ名と分かる同じ著者の別の本があるときだけ自動で付ける（1冊だけではシリーズにしない）。
  // 「〇〇と××」のように書名の始まりだけが手がかりのときは、確認待ちで本人に聞く。付けたら true
  L.autoSeries = (id, bib) => {
    const it0 = L.get(id); if (!it0 || it0.kind === "series" || it0.sr || it0.st === "want") return false;
    const ix = srIndex();
    const no = new Set([].concat(it0.srNo || []));
    const put = (x, name, vol) => {
      const y = clone(L.get(x.id)); const old = y.sr; y.sr = name; if (vol != null) y.sv = vol; else delete y.sv; L.put(y);
      const ix2 = srIndex(); if (old) ix2.sr.get(srKeyC(old))?.delete(y.id); const k = srKeyC(name); if (!ix2.sr.has(k)) ix2.sr.set(k, new Set()); ix2.sr.get(k).add(y.id);
    };
    const ok = x => x && x.id !== id && x.kind !== "series" && x.st !== "want" && sameAuthor(x.a, it0.a);
    const pick = set => [...(set || [])].map(i => L.get(i)).filter(ok);
    const myKey = ptKey(it0.t);
    for (const c of L.seriesCands(it0.t, bib)) {
      const key = srKeyC(c.name); if (no.has(key)) continue;
      const mem = pick(ix.sr.get(key)).filter(x => x.sr && srKeyC(x.sr) === key);
      if (mem.length) { put(it0, mem[0].sr, c.vol); return true; }
      const peers = pick(ix.cand.get(key)).filter(x => !x.sr && ![].concat(x.srNo || []).includes(key))
        .map(x => [x, L.seriesCands(x.t).find(d => srKeyC(d.name) === key)]).filter(([x, d]) => d && ptKey(x.t) !== myKey);
      // 順番がみな同じ（「23講」のような数を巻と取り違えた、同じ本の別の記録など）ときはまとめない
      if (peers.length && new Set([c.vol, ...peers.map(([, d]) => d.vol)].map(v => v ?? "-")).size >= 2) { for (const [x, d] of peers) put(x, c.name, d.vol); put(it0, c.name, c.vol); return true; }
    }
    // 手がかりが無いとき：すでにあるシリーズの仲間と書名の始まりが同じなら、そのシリーズに入れる（順番は同じ書名の仲間から）
    const ptn = ptNorm(it0.t);
    for (const [k, set] of ix.sr) {
      if (no.has(k) || !set.size) continue;
      const mem = pick(set).filter(x => x.sr && srKeyC(x.sr) === k); if (!mem.length) continue;
      const head = Biblio.norm(commonHead(mem.map(x => plainTitle(x.t)))), nm = Biblio.norm(mem[0].sr);
      if ((mem.length >= 2 && head.length >= 3 && ptn.startsWith(head)) || (nm.length >= 3 && ptn.startsWith(nm))) {
        const bare = t => L.sameKey(plainTitle(t).replace(/\s*[(（]?(上下巻セット|上下巻|上|下)[)）]?\s*$/, ""));
        const twin = mem.find(x => bare(x.t) === bare(it0.t) && x.sv);
        put(it0, mem[0].sr, twin?.sv ?? parenVol(it0.t)); return true;
      }
    }
    // 「〇〇と××」のように始まりが同じで、著者も同じ本がほかにもあるとき：シリーズかどうかは本人に聞く
    const name = toHead(it0.t);
    if (name && it0.a && !no.has(L.srKey(name))) {
      const peers = pick(ix.to.get(Biblio.norm(name))).filter(x => x.a && !x.sr && ptKey(x.t) !== myKey);
      if (peers.length && !Object.values(L.queue()).some(q => q.type === "series" && (q.target === id || (q.cands || []).includes(id)))) {
        L.qAdd("series", id, { why: `「${name}と」で始まる同じ著者の本がほかにもあります。「${name}」のシリーズとしてまとめますか？`, name, cands: peers.map(x => x.id) });
      }
    }
    return false;
  };
  // 確認待ち「シリーズかどうか」への答え。yes：対象と候補の本を同じシリーズにまとめる・no：もう聞かない
  L.seriesAnswer = (q, yes) => {
    const ids = [q.target, ...(q.cands || [])].filter(id => L.get(id));
    const key = L.srKey(q.name);
    for (const id of ids) {
      const it = clone(L.get(id));
      if (yes) { if (!it.sr) { it.sr = q.name; const d = L.seriesCands(it.t).find(c => c.vol != null); if (d && L.srKey(d.name) === key) it.sv = d.vol; } }
      else it.srNo = [...new Set([].concat(it.srNo || [], key))];
      L.put(it);
    }
    for (const [qid, x] of Object.entries(L.queue())) if (x.type === "series" && L.srKey(x.name) === key && ids.includes(x.target)) L.qDel(qid);
  };
  // シリーズを付ける・外す（本人の操作）。外したときは同じシリーズ名をもう聞かない
  L.setSeries = (id, name, vol) => {
    const it = clone(L.get(id)); if (!it) return;
    const prev = it.sr;
    if (name) { it.sr = srClean(name); if (vol != null && vol !== "") it.sv = String(vol); else delete it.sv; it.srNo = [].concat(it.srNo || []).filter(k => k !== L.srKey(name)); if (!it.srNo.length) delete it.srNo; }
    else { delete it.sr; delete it.sv; if (prev) it.srNo = [...new Set([].concat(it.srNo || [], L.srKey(prev)))]; }
    L.put(it);
  };

  // ---------- 必読書チェッカーの記録（読了・読みたい・所有） ----------
  L.ndoc = () => (B && B.ndoc) || Shelf.read(P.novelDoc) || { read: {}, want: {}, own: {} };
  function writeNdoc(fn) {
    const d = clone(L.ndoc()); d.read = d.read || {}; d.want = d.want || {}; d.own = d.own || {};
    fn(d); d.updated = now();
    if (B) { B.ndoc = d; return; }
    Shelf.writeDoc(P.novelDoc, d);
  }
  L.setOwn = (k, on) => writeNdoc(d => { if (on) d.own[k] = 1; else delete d.own[k]; });
  L.setNovelRead = (k, val) => writeNdoc(d => { if (val) { d.read[k] = val; delete d.want[k]; } else delete d.read[k]; });

  // ---------- 読書の状況（チェッカーに結び付かない本） ----------
  L.reading = () => (B && B.reading) || Shelf.read(P.reading)?.items || {};
  L.setReading = (key, val) => {
    if (B) { B.reading = B.reading || clone(Shelf.read(P.reading)?.items || {}); if (val) B.reading[key] = { ...val, u: now() }; else delete B.reading[key]; return; }
    Shelf.writeItem(P.reading, key, val ? { ...val, u: now() } : null);
  };
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
  // 所有している冊数（シリーズは持っている巻の数）と、うち積読の冊数。画面の見出しの数字に使う
  L.ownSummary = () => {
    const own = Object.values(L.items()).filter(x => x.st === "own");
    const n = it => it.kind === "series" ? L.ownVolCount(it) : 1;
    return { books: own.reduce((s, it) => s + n(it), 0), records: own.length, tsun: own.filter(L.isUnreadOwned).length };
  };

  // ---------- 確認待ち ----------
  L.queue = () => (B ? B.queue : Shelf.read(P.queue)?.items) || {};
  L.qAdd = (type, target, extra = {}) => {
    const exists = Object.entries(L.queue()).find(([, q]) => q.type === type && q.target === target);
    if (exists) return exists[0];
    const id = L.newId("q");
    if (B) { B.queue[id] = { type, target, at: now(), ...extra }; return id; }
    Shelf.writeItem(P.queue, id, { type, target, at: now(), ...extra });
    return id;
  };
  L.qDel = id => { if (B) { delete B.queue[id]; return; } Shelf.writeItem(P.queue, id, null); };
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
    // チェッカーに結び付く前に付けた読了（ブクログからの登録など）は、チェッカーの読了に移す
    if (k) { const r = L.reading()["b:" + it.id]; if (r?.s === "read" && !L.ndoc().read[k]) L.setNovelRead(k, r.d || 1); }
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
    // 代表でない仮登録（書名と著者だけの記録）は、実物の記録にまとまっているので消す（「外した本」に重複して出さない）
    for (const it of items) if (it.nk && it.kind !== "series" && !touched(it) && byNk.get(it.nk) && byNk.get(it.nk) !== it && (it.st === "own" || it.merged)) { L.qDelFor(it.id); L.remove(it.id); }
    const works = Shelf.read(P.novels); const wk = works ? new Map(works.books.map(b => [b.k, b])) : null;
    let added = 0, offed = 0;
    for (const k of Object.keys(own)) {
      const it = byNk.get(k);
      if (!it) {
        const w = wk?.get(k); if (!w) continue;
        // 同じ作品の仮登録を何件も作らない（番号は作品ごとに1つ）
        const old = L.get("b-ck-" + k);
        if (old) { const c = clone(old); c.st = "own"; delete c.merged; c.nk = k; L.put(c); }
        else L.put({ id: "b-ck-" + k, kind: "book", cat: "小説", t: w.t, a: w.a, st: "own", src: "checker", nk: k, link: "auto", added: now() });
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
  // in: {isbn?, asin?, mag?, magMonth?, issue?, bib?, ccode?, src, loc?, media?, store?, t?, a?, buy?, cond?, st?, catHint?, vols?}
  //   asin：AmazonのASIN／store：電子書籍のストア名／buy：{shop, d}／cond：中古の状態／st："want" で未所持の読みたい本
  //   issue：雑誌の号（"2026-08"）／vols：全巻セットなどで一度に持つ巻の番号の配列
  // out: {status:'new'|'dup'|'vol'|'voldup'|'alt'|'want', item, vol?, ed?, match?}
  // 同じ本は ISBN → ASIN → 書名と著者 の順で探し、見つかれば空いた項目だけ埋める（手で入れた値は上書きしない）
  const registerCore = async (inp) => {
    const want = inp.st === "want";
    const bib = inp.bib || null;
    const hit = (inp.isbn && L.byIsbn(inp.isbn)) || (inp.asin && L.byAsin(inp.asin)) || null;
    if (hit) {
      let x = L.absorb(hit.item, inp, bib ? { pub: bib.pub, y: bib.y, cover: bib.cover, label: bib.label } : {});
      if (hit.vol != null && !want) {
        x = x || clone(hit.item);
        const m = hit.ed ? x.eds[hit.ed].vols : x.vols; const v = m[hit.vol] = m[hit.vol] || {};
        v.own = 1; if (inp.isbn && !v.isbn) v.isbn = inp.isbn; if (inp.asin && !v.asin) v.asin = inp.asin;
        if (inp.media && v.media && v.media !== inp.media) v.media = "both"; else if (inp.media && !v.media) v.media = inp.media;
      }
      if (x) { L.put(x); if (x.nk && x.st === "own" && hit.item.st !== "own") { L.setOwn(x.nk, true); L.qDelFor(x.id); } }
      return { status: hit.vol != null ? "voldup" : "dup", item: x || hit.item, vol: hit.vol, ed: hit.ed, filled: !!x };
    }
    if (inp.mag && !inp.issue) { const h = L.byMag(inp.mag, inp.magMonth); if (h) { const x = L.absorb(h, inp); if (x) L.put(x); return { status: "dup", item: x || h }; } }
    const ccode = inp.ccode || bib?.ccode || "";
    let cat = Biblio.catFromC(ccode) || Biblio.catFromNdc(bib?.ndc) || (/コミック/.test(bib?.label || "") ? "漫画" : null) || inp.catHint || null;
    if (inp.mag || inp.issue) cat = inp.isbn ? "ムック" : "雑誌";
    const media = inp.media || "paper";
    const fmt = media === "ebook" ? "電子" : (Biblio.formatFromC(ccode) || (inp.mag || inp.issue ? "雑誌" : ""));
    const t = bib?.t || inp.t || "";
    const a = bib?.a || inp.a || "";
    const base = { cat: cat || "その他", catAuto: !!cat, a, pub: bib?.pub || "", y: bib?.y || null, ccode: ccode || undefined, fmt: fmt || undefined,
      media, loc: inp.loc || (media === "ebook" ? inp.store : undefined) || undefined, st: want ? "want" : "own", src: inp.src, added: now(), cover: bib?.cover || undefined, label: bib?.label || undefined };
    if (inp.buy) base.buy = [inp.buy];
    if (inp.cond) base.note = inp.cond;

    // 雑誌の号：雑誌ごとに1件のシリーズにまとめ、号を巻のように並べる
    if (inp.issue && t && !want) {
      const k = Biblio.normTitle(t);
      let s = Object.values(L.items()).find(x => x.kind === "series" && x.issues && Biblio.normTitle(x.t) === k);
      s = s ? clone(s) : { id: L.newId("s"), kind: "series", issues: true, t, ...base, vols: {} };
      const had = s.vols[inp.issue];
      s.vols[inp.issue] = { ...(had || {}), own: 1, asin: inp.asin || had?.asin, isbn: inp.isbn || had?.isbn, media };
      if (s.media && s.media !== media && s.media !== "both") s.media = "both";
      if (inp.buy) { s.buy = s.buy || []; if (!s.buy.some(b => b.shop === inp.buy.shop && b.d === inp.buy.d && b.v === inp.issue)) s.buy.push({ ...inp.buy, v: inp.issue }); }
      if (s.st !== "own") s.st = "own";
      L.put(s);
      return { status: had?.own ? "voldup" : "vol", item: s, vol: inp.issue };
    }

    // 巻数があればシリーズにまとめる（漫画のほか、巻数で出る本も）。版違い（モノクロ版など）は同じシリーズの中で版ごとに分ける
    const se = L.splitEd(t);
    // 書誌の「巻」は、新書・文庫のレーベルの通し番号（中公新書 1996 など）のことが多い。漫画で小さな数のときだけ巻として使う
    const bvol = /^\d+$/.test(String(bib?.vol || "").normalize("NFKC")) ? +String(bib.vol).normalize("NFKC") : null;
    const sv = Biblio.splitVolume(se.base, cat === "漫画" && bvol != null && bvol <= 150 ? bvol : null);
    sv.base = String(sv.base || "").replace(/[\s:：\-－―~〜・,、]+$/, "");
    const vlist = inp.vols?.length ? inp.vols : (sv.vol != null ? [sv.vol] : null);
    if (!want && t && vlist && sv.base && (cat === "漫画" || inp.vols?.length || inp.seriesHint)) {
      const found = L.seriesFor(sv.base, base.pub);
      const s = found ? clone(found) : { id: L.newId("s"), kind: "series", t: sv.base, ...base, vols: {} };
      if (!found) { delete s.buy; delete s.note; }
      let m = s.vols = s.vols || {};
      if (se.ed) { s.eds = s.eds || {}; s.eds[se.ed] = s.eds[se.ed] || { vols: {} }; m = s.eds[se.ed].vols; }
      let had = false;
      for (const n of vlist) {
        const v = m[n] || {}; if (v.own) had = true;
        m[n] = { ...v, own: 1 };
        if (vlist.length === 1) { if (inp.isbn && !v.isbn) m[n].isbn = inp.isbn; if (inp.asin && !v.asin) m[n].asin = inp.asin; }
        m[n].media = v.media && v.media !== media ? "both" : media;
      }
      if (found) {
        if (s.media && s.media !== media && s.media !== "both") s.media = "both";
        if (inp.loc && !s.loc) s.loc = inp.loc;
        if (s.st !== "own") s.st = "own";
      }
      if (inp.buy) { s.buy = s.buy || []; const tag = vlist.length > 1 ? `${vlist[0]}-${vlist[vlist.length - 1]}` : String(vlist[0]); if (!s.buy.some(b => b.shop === inp.buy.shop && b.d === inp.buy.d && b.v === tag)) s.buy.push({ ...inp.buy, v: tag, ...(se.ed ? { ed: se.ed } : {}) }); }
      L.put(s);
      if (!found && !cat) { if (inp.bulk) { s.catTodo = 1; L.put(s); } else L.qAdd("cat", s.id, { why: "本の種類を判定できませんでした" }); }
      return { status: had && vlist.length === 1 ? "voldup" : "vol", item: s, vol: vlist.length === 1 ? vlist[0] : vlist, ed: se.ed, newSeries: !found };
    }

    let match = null;
    if (t && (!cat || cat === "小説" || cat === "その他")) match = Biblio.matchNovel(t, a);
    // 同じ作品の記録がすでにあれば、それにまとめる（作品ごとに1件）
    if (match?.status === "auto") {
      const same = Object.values(L.items()).filter(x => x.nk === match.work.k && x.kind !== "series")
        .sort((x, y) => (y.st === "own") - (x.st === "own") || touched(y) - touched(x))[0];
      if (want) {
        if (same) return { status: "dup", item: same, match };
        if (!L.ndoc().read[match.work.k] && !L.ndoc().want[match.work.k]) writeNdoc(d => { d.want[match.work.k] = 1; });
      } else if (same) {
        let x = clone(same);
        if (!touched(same) || same.st === "want") {
          // チェッカーからの仮登録・読みたい本：実物の情報で埋める
          Object.assign(x, base, { t: same.t || t, a: same.a || a, isbn: inp.isbn || undefined, asin: inp.asin || undefined, src: inp.src, added: same.added || base.added, st: "own", link: same.link || "auto" });
          if (bib?.t && bib.t !== same.t) x.note = [same.note, `書誌の書名：${bib.t}`].filter(Boolean).join("／");
          L.put(x); if (x.nk) L.setOwn(x.nk, true); L.qDelFor(x.id);
          return { status: "new", item: x, match, upgraded: true };
        }
        // 実物の記録がある：別の版なら同じ記録に足す。同じ版（ISBNが同じか、どちらかに無い）なら空いた項目を埋める
        const sameEd = !inp.isbn || !x.isbn || x.isbn === inp.isbn;
        if (!sameEd) {
          x.alt = x.alt || [];
          if (!x.alt.some(y => y.isbn === inp.isbn)) x.alt.push({ isbn: inp.isbn, asin: inp.asin || undefined, pub: base.pub || undefined, fmt: base.fmt || undefined, loc: base.loc || undefined, media });
          if (inp.buy) { x.buy = x.buy || []; if (!x.buy.some(b => b.shop === inp.buy.shop && b.d === inp.buy.d)) x.buy.push(inp.buy); }
          if (x.st !== "own") x.st = "own";
        } else x = L.absorb(x, inp, base) || x;
        L.put(x); if (x.nk) L.setOwn(x.nk, true); L.qDelFor(x.id);
        return { status: sameEd ? "dup" : "alt", item: x, match };
      }
    }
    // チェッカーに無い本：書名と著者で同じ本を探す（ブクログ・Kindle・購入履歴など、ISBNの無い記録との重複を防ぐ）
    let sameCands = null;
    if (t && !(match?.status === "auto")) {
      const f = L.findSameByTitle(t, a);
      if (f?.item) {
        if (want) return { status: "dup", item: f.item };
        let x = clone(f.item);
        if (inp.isbn && x.isbn && x.isbn !== inp.isbn) {
          x.alt = x.alt || [];
          if (!x.alt.some(y => y.isbn === inp.isbn)) x.alt.push({ isbn: inp.isbn, asin: inp.asin || undefined, pub: base.pub || undefined, fmt: base.fmt || undefined, loc: base.loc || undefined, media });
          if (inp.buy) { x.buy = x.buy || []; if (!x.buy.some(b => b.shop === inp.buy.shop && b.d === inp.buy.d)) x.buy.push(inp.buy); }
          if (x.st !== "own") x.st = "own";
          L.put(x); if (x.nk) L.setOwn(x.nk, true);
          return { status: "alt", item: x };
        }
        x = L.absorb(x, inp, base);
        if (x) { L.put(x); if (x.nk && x.st === "own") L.setOwn(x.nk, true); }
        return { status: "dup", item: x || f.item, filled: !!x };
      }
      if (f?.cands) {
        // 読みたい本は、同じ書名の本をすでに持っていれば付けない（著者の書き方の違いで迷うだけのことが多い）
        if (want) { const owned = f.cands.find(c => c.st === "own"); if (owned) return { status: "dup", item: owned }; }
        sameCands = f.cands.map(c => c.id);
      }
    }
    const it = { id: L.newId(want ? "w" : "b"), kind: "book", t: t || "（書誌が見つかりません）", isbn: inp.isbn || undefined, asin: inp.asin || undefined, mag: inp.mag || undefined, magMonth: inp.magMonth || undefined, ...base };
    if (bib?.vol && !/^\d+$/.test(bib.vol)) it.note = [it.note, bib.vol].filter(Boolean).join("／");
    if (match?.status === "auto") { it.nk = match.work.k; it.link = "auto"; }
    else if (match?.status === "wait") { it.link = "wait"; }
    L.put(it);
    if (it.nk && !want) L.setOwn(it.nk, true);
    if (match?.status === "wait") L.qAdd("link", it.id, { why: "必読書チェッカーの作品と結び付けるか、候補から選んでください", cands: match.cands.map(w => w.k) });
    if (!cat && inp.bulk && !want) { it.catTodo = 1; L.put(it); }
    if (sameCands && !want) L.qAdd("same", it.id, { why: "同じ書名の本がすでにあります。同じ本ならまとめてください", cands: sameCands });
    if (!want && !inp.bulk) {
      if (!bib && !inp.t) L.qAdd("bib", it.id, { why: "書誌が見つかりませんでした。書名と著者を入れてください" });
      else if (bib?.trial) L.qAdd("check", it.id, { why: "書誌が「試し読み版」などになっています。内容を確かめてください" });
      else if (!cat) L.qAdd("cat", it.id, { why: "本の種類を判定できませんでした" });
    }
    return { status: want ? "want" : "new", item: it, match };
  };

  // 登録のあとで、作品のシリーズ（副題つきの巻）を付ける。読みたい本・漫画のような巻だけのシリーズには付けない
  L.register = async (inp) => {
    const r = await registerCore(inp);
    try { if (r?.item && r.item.kind !== "series" && r.item.st !== "want") L.autoSeries(r.item.id, inp.bib); } catch (e) { console.warn(e); }
    return r;
  };

  // 2つの記録を1つにまとめる（from の情報で into の空いた項目を埋め、from は消す）
  L.mergeInto = (into, from) => {
    const x = L.absorb(into, { ...from, buy: null, st: from.st }, from) || clone(into);
    if (from.buy) { x.buy = x.buy || []; for (const b of from.buy) if (!x.buy.some(y => y.shop === b.shop && y.d === b.d && y.v === b.v)) x.buy.push(b); }
    if (from.isbn && x.isbn && from.isbn !== x.isbn) { x.alt = x.alt || []; if (!x.alt.some(y => y.isbn === from.isbn)) x.alt.push({ isbn: from.isbn, pub: from.pub || undefined, fmt: from.fmt || undefined, loc: from.loc || undefined, media: from.media }); }
    if (from.st === "own") x.st = "own";
    if (!x.nk && from.nk) { x.nk = from.nk; x.link = from.link; }
    // ブクログの記録との結び付きも引き継ぐ（引き継がないと、ブクログの画面で同じ本がまた「未登録」に出て、もう一度登録・確認することになる）
    const blks = [...new Set([x.blk, ...(x.blks || []), from.blk, ...(from.blks || [])].filter(Boolean))];
    const keys = [...new Set([x.blkKey, ...(x.blkKeys || []), from.blkKey, ...(from.blkKeys || [])].filter(Boolean))];
    if (blks.length) { if (!x.blk) x.blk = blks[0]; x.blks = blks.filter(b => b !== x.blk); if (!x.blks.length) delete x.blks; }
    if (keys.length) { if (!x.blkKey) x.blkKey = keys[0]; x.blkKeys = keys.filter(b => b !== x.blkKey); if (!x.blkKeys.length) delete x.blkKeys; }
    if (from.blkRead) x.blkRead = 1;
    if (from.srNo) x.srNo = [...new Set([].concat(x.srNo || [], from.srNo))];
    if (from.blkCat && !x.blkCat) x.blkCat = from.blkCat;
    const r = L.reading()["b:" + from.id]; if (r && !L.reading()["b:" + x.id]) { L.setReading("b:" + x.id, r); }
    if (r) L.setReading("b:" + from.id, null);
    L.put(x); L.qDelFor(from.id); L.remove(from.id);
    if (x.nk && x.st === "own") L.setOwn(x.nk, true);
    return x;
  };

  // 所持確認：登録はせず、持っているかどうかと関連する情報を返す
  L.check = async (code) => {
    const c = Biblio.classify(code);
    if (c.kind === "isbn") {
      const hit = L.byIsbn(c.code);
      // 読みたい（未所持）の本は「持っていない」として、読みたいに入っていることを添える
      if (hit && hit.item.st === "want") { const bib = await Biblio.lookup(c.code); return { owned: false, c, bib, wantItem: hit.item, ...extras(bib) }; }
      if (hit) return { owned: true, c, ...hit };
      const bib = await Biblio.lookup(c.code);
      if (bib) {
        // ISBNの無い記録（Kindle・ブクログ・購入履歴など）も、書名と著者で同じ本なら「持っている」とする
        const f = L.findSameByTitle(bib.t, bib.a);
        if (f?.item && f.item.st === "own") return { owned: true, c, item: f.item, byTitle: true };
        // シリーズの巻（電子で持っている巻など）
        const ex = extras(bib);
        if (ex.series && ex.vol != null) {
          const m = ex.ed ? ex.series.eds?.[ex.ed]?.vols : ex.series.vols;
          if (m?.[ex.vol]?.own) return { owned: true, c, item: ex.series, vol: ex.vol, ed: ex.ed, byTitle: true };
        }
        if (f?.item && f.item.st === "want") return { owned: false, c, bib, wantItem: f.item, ...ex };
        return { owned: false, c, bib, ...ex };
      }
      return { owned: false, c, bib: null };
    }
    if (c.kind === "magazine") { const hit = L.byMag(c.mag, c.month); return { owned: !!hit, c, item: hit }; }
    return { owned: false, c };
  };
  // 持っていない本について、所持確認の画面に添える情報
  function extras(bib) {
    if (!bib) return {};
    const sameTitle = L.byTitle(bib.t).filter(x => x.st === "own");
    const cat = Biblio.catFromC(bib.ccode);
    const bvol = /^\d+$/.test(String(bib.vol || "").normalize("NFKC")) ? +String(bib.vol).normalize("NFKC") : null;
    const se = L.splitEd(bib.t);
    const sv = Biblio.splitVolume(se.base, cat === "漫画" && bvol != null && bvol <= 150 ? bvol : null);
    const series = sv.vol != null ? L.seriesFor(sv.base) : null;
    const m = Biblio.matchNovel(bib.t, bib.a);
    const work = m?.status === "auto" ? m.work : null;
    const films = Biblio.filmsByTitle(bib.t);
    return { sameTitle, series, vol: sv.vol, ed: se.ed, work, workRead: work ? !!L.ndoc().read[work.k] : false, films };
  }


  window.Lib = L;
})();
