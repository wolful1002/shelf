// 記録の一度きりの手直し。蔵書の画面を開いたときに、まだ済んでいないものだけを順に行う。
// 済んだ印は records/settings.json の fixes に残す（どの端末でも二度は行わない）
"use strict";
const FIXES = [
  // 2026-10-23：購入履歴の取り込みで、書誌の「巻」に入っていたレーベルの通し番号（中公新書 1996 など）を巻と取り違えて、
  // 1冊の本をシリーズにしてしまったものを直す。Amazonの注文での書名に巻数が無ければ1冊の本に戻し、あれば正しい巻に付け替える
  {
    id: "2026-10-23-label-series",
    async run(log) {
      const orders = await Shelf.readRemote("import/2026-10-23/amazon-orders.json");
      const raw = new Map();
      for (const x of orders?.items || []) { const i = /^\d{9}[\dX]$/i.test(x.asin) ? Biblio.isbn10to13(x.asin) : null; if (i && !raw.has(i)) raw.set(i, x.t); }
      const clean = t => String(t || "").normalize("NFKC").replace(/\s*\(([^()]*)\)\s*$/, (m, x) => /^\s*\d{1,3}\s*$/.test(x) ? m : "").replace(/\s*\(([^()]*)\)\s*$/, (m, x) => /^\s*\d{1,3}\s*$/.test(x) ? m : "").trim();
      let books = 0, rekeyed = 0;
      for (const s0 of Object.values(Lib.items())) {
        if (s0.kind !== "series" || s0.issues) continue;
        const s = JSON.parse(JSON.stringify(s0));
        const detach = []; let moved = 0;
        for (const [k, v] of Object.entries(s.vols || {})) {
          if (!v.isbn) continue;
          if (!raw.has(v.isbn)) {
            // 購入履歴に書名が無い本（スキャンで登録したものなど）：通し番号らしい大きな数か、漫画以外の1冊だけのシリーズなら1冊の本に戻す
            const one = Object.keys(s.vols).length === 1 && !s.eds;
            if (/^\d+$/.test(k) && (+k > 150 || (s0.cat !== "漫画" && one && s0.label))) detach.push([k, v]);
            continue;
          }
          const sv = Biblio.splitVolume(Lib.splitEd(clean(raw.get(v.isbn))).base);
          if (sv.vol == null) detach.push([k, v]);
          else if (String(sv.vol) !== k && !s.vols[sv.vol]) { s.vols[sv.vol] = v; delete s.vols[k]; for (const b of s.buy || []) if (b.v === k) b.v = String(sv.vol); rekeyed++; moved++; }
        }
        if (!detach.length) { if (moved) Lib.put(s); continue; }
        for (const [k] of detach) delete s.vols[k];
        const left = Object.keys(s.vols).length + Object.values(s.eds || {}).reduce((n, e) => n + Object.keys(e.vols || {}).length, 0);
        const buysFor = k => (s0.buy || []).filter(b => b.v === k || (!b.v && detach.length === 1)).map(({ v, ...b }) => b);
        const src0 = s0.src || "purchase";
        if (!left) Lib.remove(s.id); else Lib.put(s);
        Lib.qDelFor(s.id);
        for (const [k, v] of detach) {
          const t = s0.t, buys = buysFor(k);
          const r = await Lib.register({ isbn: v.isbn, src: src0, loc: s0.loc || undefined, media: v.media || "paper", bulk: true, buy: buys[0],
            bib: { t, a: s0.a, pub: s0.pub, y: s0.y, cover: s0.cover, label: s0.label, ccode: s0.ccode } });
          const it = JSON.parse(JSON.stringify(Lib.get(r.item.id)));
          it.buy = it.buy || []; for (const b of buys) if (!it.buy.some(y => y.shop === b.shop && y.d === b.d)) it.buy.push(b);
          if (s0.cat && s0.cat !== "その他" && (it.cat === "その他" || !it.cat)) { it.cat = s0.cat; it.catAuto = s0.catAuto; }
          if (s0.catTodo && it.cat === "その他") it.catTodo = 1;
          Lib.put(it);
          if (v.read && !Lib.isRead(it)) Lib.setRead(it, true, typeof v.read === "string" ? v.read : null);
          if (buys.length > 1) Lib.qAdd("dupbuy", it.id, { why: `Amazonで${buys.length}回注文しています。贈り物か買い直しか教えてください` });
          books++;
        }
      }
      log.push(`レーベルの番号をシリーズの巻と取り違えた本：${books}冊を1冊の本に戻し、${rekeyed}巻の番号を直しました`);
    },
  },
  // 2026-10-23：本人の確認で、持っていない・読んでいない本（Amazonで2回注文。贈り物など）を所有から外す
  {
    id: "2026-10-23-not-owned",
    async run(log) {
      for (const isbn of ["9784140910955"]) {
        const h = Lib.byIsbn(isbn); if (!h) continue;
        const it = JSON.parse(JSON.stringify(h.item));
        if (it.kind === "series") continue;
        it.st = "gone"; it.note = [it.note, "Amazonで購入したが手元にない（本人の確認・2026-10-23）"].filter(Boolean).join("／");
        Lib.put(it); Lib.qDelFor(it.id);
        if (Lib.isRead(it)) Lib.setRead(it, false);
        log.push(`所有から外した本：${it.t}`);
      }
    },
  },
  // 2026-10-23：ブクログの記録のうち、蔵書で所有していると分かっている本（購入履歴・スキャン・チェッカーの所有など）を、
  // 読了かつ所有として結び付ける。蔵書に無い本は、今までどおりブクログの画面で確かめる
  {
    id: "2026-10-23-booklog-owned",
    async run(log) {
      const items = Object.values(Lib.items());
      const done = new Set(items.flatMap(it => [it.blk, ...(it.blks || [])]).filter(Boolean));
      const doneKey = new Set(items.flatMap(it => [it.blkKey, ...(it.blkKeys || [])]).filter(Boolean));
      let n = 0, vols = 0;
      for (const x of booklogItems()) {
        if (done.has(x.id) || doneKey.has(blKey(x))) continue;
        let hit = null, vol = null, ed = "";
        const m = Biblio.matchNovel(x.t, x.a);
        if (m.status === "auto") hit = Object.values(Lib.items()).find(it => it.nk === m.work.k && it.st === "own" && it.kind !== "series") || null;
        if (!hit) {
          const se = Lib.splitEd(x.t), sv = Biblio.splitVolume(se.base);
          if (sv.vol != null) {
            const s = Lib.seriesFor(sv.base);
            const vm = s ? (se.ed ? s.eds?.[se.ed]?.vols : s.vols) : null;
            if (s && s.st === "own" && vm?.[sv.vol]?.own) { hit = s; vol = sv.vol; ed = se.ed; }
          }
        }
        if (!hit) { const f = Lib.findSameByTitle(x.t, x.a); if (f?.item && f.item.st === "own") hit = f.item; }
        if (!hit) continue;
        const it = JSON.parse(JSON.stringify(Lib.get(hit.id)));
        it.blks = [...new Set([...(it.blks || []), x.id])]; it.blkKeys = [...new Set([...(it.blkKeys || []), blKey(x)])];
        if (it.kind === "series" && vol != null) {
          const vm = ed ? it.eds[ed].vols : it.vols; const v = vm[vol];
          if (!v.read) { v.read = blDate(x.d) || 1; vols++; }
          Lib.put(it);
        } else { markBooklogRead(it, null, x.d); n++; }
      }
      log.push(`ブクログの記録を所有している本に結び付け、読了にしました：${n}冊・シリーズの${vols}巻`);
    },
  },
  // 2026-10-24：確認待ちで「同じ本（まとめる）」を選んでも、ブクログとの結び付きが消えていたため、
  // ブクログの画面で同じ本が未登録に戻り、もう一度登録されて同じ確認をやり直させていた。
  // 本人がすでに「同じ本」と答えた組み合わせをまとめ直し、消えていた結び付きを戻す
  {
    id: "2026-10-24-same-again",
    async run(log) {
      const PAIRS = [["b-mvl5cjup-bk38", "b-mvkyu7wy-5pv0", "q-mvl5cjur-3ymv"], ["b-mvl5cjv6-i1cb", "b-mvkyu7p8-mbmt", "q-mvl5cjv7-4kax"], ["b-mvl5cq5j-i1p9", "b-mvl02kiv-0q7l", "q-mvl5cq5k-4l89"], ["b-mvl5cq62-riqi", "b-mvl02klx-f2ak", "q-mvl5cq62-f0br"], ["b-mvl5cq6d-uhvg", "b-mvl4ytl2-jfj5", "q-mvl5cq6e-1xsm"], ["b-mvl5cq6s-4o1u", "b-mvkyu7pb-c22n", "q-mvl5cq6t-tuk9"], ["b-mvl5cq74-72sp", "b-mvkyu7pb-kq3o", "q-mvl5cq75-muiz"], ["b-mvl5d190-tew2", "b-mvkyu7jh-92ls", "q-mvl5d190-udu0"], ["b-mvl5d19c-ts61", "b-mvkyu7k8-d7o7", "q-mvl5d19d-60yi"], ["b-mvl5d19q-mf12", "b-mvkyu7ob-v81o", "q-mvl5d19r-fvbg"], ["b-mvl5d1a2-ubra", "b-mvkyu7m2-qdzh", "q-mvl5d1a4-l04h"], ["b-mvl5d1af-8new", "b-mvkyu7lo-9diq", "q-mvl5d1ag-mkq5"], ["b-mvl5d1as-35af", "b-mvl02kk4-er52", "q-mvl5d1as-vu7m"], ["b-mvl5d1b4-unva", "b-mvkyu7kq-unwa", "q-mvl5d1b5-taml"], ["b-mvl5d1bh-6jgg", "b-mvkyu7kp-uacg", "q-mvl5d1bi-noa6"], ["b-mvl5d1bt-jlgc", "b-mvkyu7k9-8ftl", "q-mvl5d1bu-na18"], ["b-mvl5d1c7-rv91", "b-mvkyu7jm-9pv8", "q-mvl5d1c7-gy5l"], ["b-mvl5d1cn-dcyy", "b-mvkyu7ip-9bpk", "q-mvl5d1cn-an2x"], ["b-mvl5d1d1-mkrp", "b-mvkyu7in-v33l", "q-mvl5d1d2-jgqc"], ["b-mvl5d1dg-5maq", "w-mvkyu8ni-u3m5", "q-mvl5d1dh-tslp"], ["b-mvl5d1dt-n5sr", "b-mvkyu7pj-ceid", "q-mvl5d1du-3kah"], ["b-mvl5d1e6-aham", "b-mvkyu7hv-tait", "q-mvl5d1e7-qaeq"]];
      let n = 0;
      for (const [from, into, qid] of PAIRS) {
        const f = Lib.get(from), t = Lib.get(into); if (!f || !t) continue;
        Lib.mergeInto(t, f); if (Lib.queue()[qid]) Lib.qDel(qid); n++;
      }
      // 「創世の島」：ブクログの記録 2-37 との結び付きを戻す
      const it0 = Lib.get("b-mvkyu7ot-bz5l"), x = booklogItems().find(y => y.id === "2-37");
      if (it0 && x && it0.blk !== "2-37" && !(it0.blks || []).includes("2-37")) {
        const it = JSON.parse(JSON.stringify(it0));
        if (!it.blk) { it.blk = "2-37"; it.blkKey = blKey(x); } else { it.blks = [...(it.blks || []), "2-37"]; it.blkKeys = [...(it.blkKeys || []), blKey(x)]; }
        it.blkRead = it.blkRead || 1; Lib.put(it);
      }
      log.push(`前に「同じ本」と答えた本がもう一度確認待ちに出ていたので、まとめ直しました：${n}冊`);
    },
  },
];

async function runFixes() {
  const s = Lib.settings(); const doneFix = s.fixes || {};
  const todo = FIXES.filter(f => !doneFix[f.id]);
  if (!todo.length) return;
  const log = [];
  Lib.batchBegin();
  try { for (const f of todo) await f.run(log); }
  catch (e) { Lib.batchDiscard(); UI.toast("記録の手直しができませんでした：" + e.message, 6000); return; }
  Lib.batchCommit();
  const s2 = JSON.parse(JSON.stringify(Lib.settings())); s2.fixes = s2.fixes || {};
  for (const f of todo) s2.fixes[f.id] = new Date().toISOString();
  s2.fixLog = [...(s2.fixLog || []), ...log.map(m => ({ at: new Date().toISOString(), m }))].slice(-30);
  Shelf.writeDoc(Lib.P.settings, s2);
  UI.toast(log.join("。"), 8000);
}
