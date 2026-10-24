// ブクログの読了記録を蔵書に反映する（蔵書の画面とホームで動く）
// ブクログの記録はチェッカー（records/novels-checker/log-*.json）にある。読書状況が「読み終わった」の記録だけを読了として扱う
"use strict";
const blKey = x => Biblio.norm(x.t) + "|" + Biblio.norm(x.a);
function booklogItems() {
  const meta = Shelf.read("records/novels-checker/log.json") || {};
  const out = [];
  for (let i = 0; i < (meta.chunks || 0); i++) (Shelf.read(`records/novels-checker/log-${i}.json`)?.items || []).forEach((x, j) => out.push({ id: `${i}-${j}`, t: x[0], a: x[1], d: x[2], s: x[3] || "", g: x[4], type: x[5] }));
  return out;
}
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
// ---------- ブクログの読了記録と蔵書の突き合わせ ----------
// 購入履歴・写真・スキャンなど、ブクログ以外から登録した本に、ブクログの読了記録を結び付ける。まだ結び付いていない記録だけを見る。
// 画面を開いたときに加え、ブクログの記録が増えたとき（チェッカーでファイルを読み込んだとき）と、蔵書に本が増えたときにも自動で行う（blAutoSync）
// はっきり同じ本と分かるもの（ISBN・チェッカーの作品・書名と著者が1冊に絞れる）は読了にする。
// 迷うもの（同じ書名の本が複数・著者の書き方が違う・上下巻の片方など）は確認待ち「ブクログの読了記録」で本人に聞く。「違う本」と答えた組は二度と聞かない
const blBase = t => String(t || "").normalize("NFKC").replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, " ").replace(/[〈《【\[][^〉》】\]]*[〉》】\]]/g, " ").replace(/\s+/g, " ").trim();
function blVolPart(t) {
  const m = blBase(t).match(/^(.{2,}?)\s*(上|中|下|上巻|中巻|下巻|前編|後編|[IVX]{1,4}|\d{1,2})$/);
  return m ? m[1] : null;
}
function syncBooklog(quiet) {
  const items = Object.values(Lib.items());
  const done = new Set(items.flatMap(it => [it.blk, ...(it.blks || [])]).filter(Boolean));
  const doneKey = new Set(items.flatMap(it => [it.blkKey, ...(it.blkKeys || [])]).filter(Boolean));
  const asked = new Set(Object.values(Lib.queue()).filter(q => q.type === "blread").map(q => q.blk));
  const said = it => new Set([].concat(it.blkNo || []));
  let auto = 0, ask = 0;
  const link = (it0, x, vol, ed) => {
    const it = JSON.parse(JSON.stringify(Lib.get(it0.id)));
    it.blks = [...new Set([...(it.blks || []), x.id])].filter(b => b !== it.blk); if (!it.blks.length) delete it.blks;
    it.blkKeys = [...new Set([...(it.blkKeys || []), blKey(x)])].filter(b => b !== it.blkKey); if (!it.blkKeys.length) delete it.blkKeys;
    if (it.kind === "series" && vol != null) { const vm = ed ? it.eds[ed].vols : it.vols; const v = vm[vol]; if (v && !v.read) v.read = blDate(x.d) || 1; Lib.put(it); }
    else markBooklogRead(it, null, x.d);
    done.add(x.id); doneKey.add(blKey(x));
  };
  const own = it => it && it.st === "own";
  Lib.batchBegin();
  try {
    for (const x of booklogItems()) {
      const key = blKey(x);
      if (!blIsRead(x) || done.has(x.id) || doneKey.has(key) || asked.has(key)) continue;
      // 1. チェッカーの作品で結び付いた本
      const m = Biblio.matchNovel(x.t, x.a);
      if (m.status === "auto") { const it = Object.values(Lib.items()).find(it => it.nk === m.work.k && it.kind !== "series"); if (own(it) && !said(it).has(key)) { link(it, x); auto++; continue; } }
      // 2. 漫画などの巻
      const se = Lib.splitEd(x.t), sv = Biblio.splitVolume(se.base);
      if (sv.vol != null) { const s = Lib.seriesFor(sv.base); const vm = s ? (se.ed ? s.eds?.[se.ed]?.vols : s.vols) : null; if (own(s) && vm?.[sv.vol]?.own && !said(s).has(key)) { link(s, x, sv.vol, se.ed); auto++; continue; } }
      // 3. 書名と著者
      const f = Lib.findSameByTitle(x.t, x.a);
      if (f?.item) { if (own(f.item) && !said(f.item).has(key)) { link(f.item, x); auto++; } continue; }
      let cands = (f?.cands || []).filter(c => own(c) && !said(c).has(key));
      let why = "ブクログに同じ書名の読了記録があります。同じ本なら読了にします";
      // 4. 上下巻・I/II の片方を読んだ記録と、まとめて1件にしている本
      if (!cands.length) {
        const base = blVolPart(x.t);
        if (base && base.length >= 3) {
          const k = Lib.sameKey(base);
          cands = Object.values(Lib.items()).filter(it => own(it) && it.kind !== "series" && !/全\d+巻|セット/.test(it.t) && Lib.sameKey(blBase(it.t)) === k && !said(it).has(key)
            && Lib.authorMatch(x.a, it.a));
          why = "ブクログに、この本の一部の巻（上下巻の片方など）の読了記録があります。読了にしますか";
        }
      }
      if (!cands.length) continue;
      Lib.qAdd("blread", cands[0].id, { why, blk: key, bl: x.id, bt: x.t, ba: x.a, bd: x.d, cands: cands.map(c => c.id) });
      asked.add(key); ask++;
    }
  } catch (e) { Lib.batchDiscard(); console.error(e); return; }
  if (auto || ask) { Lib.batchCommit(); UI.toast(`ブクログの読了記録を蔵書に反映しました：読了にした本 ${auto}冊${ask ? `・確認待ち ${ask}件` : ""}`, 6000); }
  else Lib.batchDiscard();
}
// 確認待ち「ブクログの読了記録」への答え。into：同じ本だった記録（無ければ、どれも違う）
function answerBlread(qid, into) {
  const q = Lib.queue()[qid]; if (!q) return;
  const x = booklogItems().find(y => y.id === q.bl) || { id: q.bl, t: q.bt, a: q.ba, d: q.bd };
  if (into) {
    const it = JSON.parse(JSON.stringify(Lib.get(into)));
    it.blks = [...new Set([...(it.blks || []), x.id])].filter(b => b !== it.blk); if (!it.blks.length) delete it.blks;
    it.blkKeys = [...new Set([...(it.blkKeys || []), q.blk])].filter(b => b !== it.blkKey); if (!it.blkKeys.length) delete it.blkKeys;
    markBooklogRead(it, null, x.d);
  } else {
    for (const id of q.cands || [q.target]) { const it0 = Lib.get(id); if (!it0) continue; const it = JSON.parse(JSON.stringify(it0)); it.blkNo = [...new Set([].concat(it.blkNo || [], q.blk))]; Lib.put(it); }
  }
  Lib.qDel(qid);
}

const blIsRead = x => !x.s || /読み終/.test(x.s);
// 自動で反映する：開いたときに1回、その後はブクログの記録か蔵書が変わるたびに（少し待ってまとめて）行う。
// 反映で蔵書を書き換えると、もう一度だけ見直すが、新しく結び付くものが無ければ何も書かないので繰り返さない
function blAutoSync() {
  let timer = null, running = false, last = "";
  // 結び付きが変わりうるのは、ブクログの記録か、蔵書の本（書名・著者・所有・持っている巻）が変わったときだけ。
  // 読了の印を付けただけなら見直さない（一覧で読了を付けるたびに画面が止まらないように）
  const sig = () => {
    let h = 0; const add = str => { for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; };
    const meta = Shelf.read("records/novels-checker/log.json") || {};
    for (let i = 0; i < (meta.chunks || 0); i++) add(String(Shelf.read(`records/novels-checker/log-${i}.json`)?.items?.length || 0));
    for (const it of Object.values(Lib.items())) {
      add(it.id + it.st + it.t + (it.a || "") + (it.nk || ""));
      if (it.kind === "series") { for (const [k, v] of Object.entries(it.vols || {})) if (v.own) add(k); for (const [e, ed] of Object.entries(it.eds || {})) for (const [k, v] of Object.entries(ed.vols || {})) if (v.own) add(e + k); }
    }
    return String(h);
  };
  const run = () => {
    if (running) { timer = setTimeout(run, 1500); return; }
    const s = sig(); if (s === last) return;
    running = true;
    try { syncBooklog(); } catch (e) { console.error(e); } finally { running = false; last = sig(); }
  };
  run();
  Shelf.onAny(p => { if (/^records\/(novels-checker\/log|library\/)/.test(p)) { clearTimeout(timer); timer = setTimeout(run, 2500); } });
}
