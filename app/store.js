// 記録の読み書き：GitHub（wolful1002/shelf-data）を保存先にし、端末に写しを持つ
// - 端末の写し：IndexedDB。電波がなくても読める
// - 変更：送信待ちに積んでから順に送る。ほかの端末が先に書いていたら読み直してかけ直す
// - 取り直し：保管場所の全ファイルの指紋を1回で取り、変わったファイルだけを取り直す
"use strict";
(function () {
  const REPO = "wolful1002/shelf-data";
  const BRANCH = "main";
  const API = "https://api.github.com/repos/" + REPO;
  const WATCH = /^(records|works)\//; // 端末に写しを持つ範囲

  // ---------- 小さな道具 ----------
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
    del(k) { try { localStorage.removeItem(k); } catch {} },
  };
  function b64encode(str) {
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ---------- IndexedDB ----------
  let idbP = null;
  function idb() {
    if (!idbP) idbP = new Promise((res, rej) => {
      const r = indexedDB.open("shelf", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return idbP;
  }
  async function idbGet(key) {
    try { const db = await idb(); return await new Promise(res => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); }
    catch { return undefined; }
  }
  async function idbSet(key, val) {
    try { const db = await idb(); await new Promise(res => { const t = db.transaction("kv", "readwrite"); t.objectStore("kv").put(val, key); t.oncomplete = res; t.onerror = res; }); } catch {}
  }

  // ---------- 状態 ----------
  const files = new Map();   // path -> {sha, data}
  let tree = {};             // path -> sha（この端末に写しを持っているファイルの指紋）
  let known = {};            // path -> sha（保管場所にあると最後に確かめたファイルの一覧。写しを持っていないものも含む）
  let queue = [];            // 送信待ち [{t:'doc', path, body} | {t:'item', path, id, value}]
  const subs = new Map();    // path -> Set(cb)
  const anySubs = new Set();
  const statusSubs = new Set();
  let status = { state: "idle", pending: 0, msg: "" };
  let ready = null, refreshing = null, flushing = false;

  function setStatus(p) { status = { ...status, ...p, pending: queue.length }; statusSubs.forEach(f => { try { f(status); } catch {} }); }
  function emit(path, remote) {
    (subs.get(path) || []).forEach(f => { try { f(files.get(path)?.data, remote); } catch (e) { console.error(e); } });
    anySubs.forEach(f => { try { f(path, remote); } catch (e) { console.error(e); } });
  }
  async function persistFile(path) { await idbSet("f:" + path, files.get(path)); }
  // ---------- 送信待ち（タブどうしで共有する） ----------
  // 送信待ちは端末のIndexedDBの1か所（"queue"）にだけ置き、どのタブも「鍵」（Web Locks）を取ってから足し引きする。
  // 送るのは鍵 "shelf-flush" を取れた1つのタブだけ。こうすると、複数のタブで開いても送信待ちを上書きで失わない
  const newKey = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const unsaved = new Set();                  // このタブで足したが、まだ共有の送信待ちに書き終えていない操作
  const bc = (() => { try { return new BroadcastChannel("shelf"); } catch { return null; } })();
  const withLock = (name, opt, fn) => navigator.locks ? navigator.locks.request(name, opt, fn) : fn({});
  // 共有の送信待ちと、まだ共有に書けていないこのタブの操作を合わせたもの
  function mergeMem(shared) {
    const have = new Set(shared.map(o => o.k));
    return shared.concat(queue.filter(o => unsaved.has(o.k) && !have.has(o.k)));
  }
  async function qUpdate(fn) {
    let out = null;
    await withLock("shelf-queue", {}, async () => {
      const shared = (await idbGet("queue")) || [];
      out = fn(shared);
      await idbSet("queue", out);
    });
    queue = mergeMem(out);
    if (bc) try { bc.postMessage({ type: "queue" }); } catch {}
    return out;
  }
  async function reloadQueue() {
    queue = mergeMem((await idbGet("queue")) || []);
    // ほかのタブが送り終えたら、このタブの表示も「保存済み」にする
    if (!queue.length && status.state === "pending") setStatus({ state: "ok", msg: "保存しました" }); else setStatus({});
  }
  function enqueue(op) { enqueueMany([op]); }
  // いくつもの操作を一度に積む（まとめて登録するときに、送信待ちの書き直しを1回で済ませる）
  function enqueueMany(ops) {
    if (!ops.length) return;
    for (const op of ops) { op.k = newKey(); queue.push(op); unsaved.add(op.k); }
    const ks = new Set(ops.map(o => o.k));
    qUpdate(q => { const have = new Set(q.map(o => o.k)); return q.concat(ops.filter(o => !have.has(o.k))); })
      .then(() => { for (const k of ks) unsaved.delete(k); flush(); });
  }
  if (bc) bc.onmessage = e => {
    const m = e.data || {};
    if (m.type === "queue") reloadQueue();
    else if (m.type === "sent") { reloadQueue(); setTimeout(() => refresh(), 500); }
    else if (m.type === "idle") reloadQueue().then(() => { if (queue.length) flush(); });
  };
  // 端末で書き換えた回数。取り直しの途中で書き換えたファイルは、古い中身で上書きしない
  const ver = new Map();
  const bump = p => ver.set(p, (ver.get(p) || 0) + 1);

  function token() { return LS.get("shelf.token", ""); }
  async function gh(url, opt = {}) {
    const t = token();
    if (!t) { const e = new Error("鍵が設定されていません"); e.code = "no_token"; throw e; }
    const res = await fetch(url.startsWith("http") ? url : API + url, {
      ...opt,
      headers: { Authorization: "Bearer " + t, "X-GitHub-Api-Version": "2022-11-28", Accept: "application/vnd.github+json", ...(opt.headers || {}) },
      cache: "no-store",
    });
    if (res.status === 401) { const e = new Error("鍵が無効か期限切れです"); e.code = "bad_token"; throw e; }
    return res;
  }

  // ---------- 取り直し ----------
  async function fetchTree() {
    const res = await gh(`/git/trees/${BRANCH}?recursive=1`);
    if (!res.ok) throw new Error("保管場所の一覧を取れませんでした（" + res.status + "）");
    const j = await res.json();
    const t = {};
    for (const e of j.tree) if (e.type === "blob" && WATCH.test(e.path) && e.path.endsWith(".json")) t[e.path] = e.sha;
    return t;
  }
  async function fetchBlob(sha) {
    const res = await gh(`/git/blobs/${sha}`, { headers: { Accept: "application/vnd.github.raw+json" } });
    if (!res.ok) throw new Error("ファイルを取れませんでした（" + res.status + "）");
    return JSON.parse(await res.text());
  }
  // ---------- 一部だけ書く（patch） ----------
  // 変更は「どこを（keys）どうしたか」の小さな操作で積む。ぶつかったら最新の中身を読み、同じ操作を当て直す。
  // 操作：{t:"patch", path, keys:[...], value} 書く・{del:1} 消す・{add:[...], rm:[...]} 並びに足す・外す・{mode:"max"} 大きい方を残す
  const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
  const J = v => JSON.stringify(v);
  const modes = {};   // 名前つきの当て方（例：保管場所のラベルの番号がぶつかったら次の番号にする）
  // a から b への差を、一部だけ書く操作の並びにする。中の入れ物（{}）は奥まで比べ、物の並び（[{...}]）は足し引きにする
  function diff(a, b, keys = [], out = []) {
    a = isObj(a) ? a : {}; b = isObj(b) ? b : {};
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      const x = a[k], y = b[k], ks = [...keys, k];
      if (y === undefined) { if (x !== undefined) out.push({ keys: ks, del: 1 }); continue; }
      if (J(x) === J(y)) continue;
      if (isObj(x) && isObj(y)) diff(x, y, ks, out);
      else if (Array.isArray(x) && Array.isArray(y) && [...x, ...y].some(isObj)) {
        const xs = new Set(x.map(J)), ys = new Set(y.map(J));
        out.push({ keys: ks, add: y.filter(e => !xs.has(J(e))).map(clone), rm: x.filter(e => !ys.has(J(e))).map(clone) });
      } else out.push({ keys: ks, value: clone(y) });
    }
    return out;
  }
  function applyPatch(data, op) {
    data = isObj(data) ? data : {};
    let o = data;
    for (const k of op.keys.slice(0, -1)) { if (!isObj(o[k])) o[k] = {}; o = o[k]; }
    const last = op.keys[op.keys.length - 1];
    if (op.del) delete o[last];
    else if (op.add || op.rm) {
      const rm = new Set((op.rm || []).map(J));
      const arr = (Array.isArray(o[last]) ? o[last] : []).filter(e => !rm.has(J(e)));
      const have = new Set(arr.map(J));
      for (const e of op.add || []) if (!have.has(J(e))) { arr.push(clone(e)); have.add(J(e)); }
      o[last] = arr;
    } else if (op.mode === "max") o[last] = Math.max(+o[last] || 0, +op.value || 0);
    else if (op.mode && modes[op.mode]) modes[op.mode](o, last, clone(op.value), data);
    else o[last] = clone(op.value);
    return data;
  }
  // 1つの操作を中身に当てる。conflict：中身が保管場所の最新（端末の写しではない）とき
  function applyOp(data, op, conflict) {
    if (op.t === "patch") return applyPatch(data, op);
    if (op.t === "doc") {
      // 丸ごとの書き込み（新しいファイル・以前の版から残った送信待ち）。ぶつかったときは黙って置き換えず、最新に重ねる（消した項目は戻らないが、ほかの端末の変更も消えない）
      if (!conflict) return clone(op.body);
      let d = isObj(data) ? data : {};
      for (const p of diff({}, op.body)) d = applyPatch(d, p);
      return d;
    }
    data = isObj(data) ? data : { items: {} }; data.items = isObj(data.items) ? data.items : {};
    if (op.value === null) delete data.items[op.id]; else data.items[op.id] = clone(op.value);
    return data;
  }
  // 送信待ちの変更を、取り直した中身に当て直す（端末の変更を上書きで失わないため）
  function applyPending(path, data) {
    for (const op of queue) if (op.path === path) data = applyOp(data, op, true);
    return data;
  }
  // 取り直し。画面に要るファイル（need）を先に、同時に6つずつ取る。要るファイルがそろった時点で needDone が解ける
  let needRe = null, needDone = null;
  async function refresh() {
    if (refreshing) return refreshing;
    let markNeed; needDone = new Promise(r => markNeed = r);
    refreshing = (async () => {
      if (!token()) { setStatus({ state: "notoken", msg: "鍵が未設定です" }); return; }
      if (!navigator.onLine) { setStatus({ state: "offline", msg: "電波がありません。端末の写しで動いています" }); return; }
      setStatus({ state: "syncing", msg: "取り直し中" });
      try {
        const v0 = new Map(ver);
        const t = await fetchTree();
        known = t; idbSet("known", known);
        // 取り直すのは、この画面に要るファイルのうち、端末の写しと指紋が違うものだけ。
        // ほかの画面のファイルは、その画面を開いたときに取る
        const isNeed = p => !needRe || needRe.test(p);
        const changed = Object.keys(t).filter(p => isNeed(p) && (files.has(p) ? files.get(p).sha : tree[p]) !== t[p]);
        let needLeft = changed.filter(isNeed).length, done = 0;
        if (!needLeft) markNeed();
        const one = async p => {
          if ((ver.get(p) || 0) === (v0.get(p) || 0)) {   // 取り直しの間に端末で書き換えたファイルは飛ばす
            const data = await fetchBlob(t[p]);
            if ((ver.get(p) || 0) === (v0.get(p) || 0)) {
              const pend = queue.some(o => o.path === p);
              files.set(p, { sha: t[p], data: pend ? applyPending(p, data) : data });
              tree[p] = t[p];
              persistFile(p);
              emit(p, true);
            }
          }
          done++;
          if (changed.length > 3) setStatus({ msg: `取り直し中 ${done}/${changed.length}` });
          if (isNeed(p) && --needLeft === 0) markNeed();
        };
        const list = changed.slice();
        await Promise.all(Array.from({ length: Math.min(6, list.length) }, async () => { while (list.length) await one(list.shift()); }));
        await idbSet("tree", tree);
        setStatus({ state: queue.length ? "pending" : "ok", msg: queue.length ? "" : "最新です" });
        if (queue.length) flush();
      } catch (e) {
        setStatus({ state: "error", msg: e.message });
      } finally { refreshing = null; markNeed(); }
    })();
    return refreshing;
  }

  // ---------- 送信 ----------
  async function putFile(path, data, sha, message) {
    const res = await gh(`/contents/${encodeURI(path)}`, {
      method: "PUT",
      body: JSON.stringify({ message, branch: BRANCH, content: b64encode(JSON.stringify(data, null, 0)), sha: sha || undefined }),
      headers: { "Content-Type": "application/json" },
    });
    return res;
  }
  // 今の保管場所での指紋。端末に写しを持たないファイル（backup/ など）は一覧に出ないので、そのファイルを直接たずねる
  async function currentSha(path) {
    if (WATCH.test(path)) { const t = await fetchTree(); return t[path] || null; }
    const res = await gh(`/contents/${encodeURI(path)}?ref=${BRANCH}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("ファイルの状態を確かめられませんでした（" + res.status + "）");
    return (await res.json()).sha || null;
  }
  async function flush() {
    if (flushing || !queue.length) return;
    // 取り直しの最中なら、終わってから送る（最新の中身に当てるため）
    if (refreshing) { try { await refreshing; } catch {} if (flushing || !queue.length) return; }
    if (!navigator.onLine || !token()) { setStatus({ state: navigator.onLine ? "notoken" : "offline" }); return; }
    flushing = true;
    let ok = false;
    try {
      // ほかのタブが送っている間は送らない（そのタブが、このタブの分もまとめて送る）
      await withLock("shelf-flush", { ifAvailable: true }, async lock => {
        if (!lock) { setStatus({ state: "pending", msg: "ほかのタブが送信中" }); return; }
        ok = await flushLocked();
      });
    } finally {
      flushing = false;
      // 送り終えたら、ほかのタブに知らせる（送る直前に足された分があれば、そのタブが送る）
      if (ok && bc) try { bc.postMessage({ type: "idle" }); } catch {}
    }
  }
  async function flushLocked() {
    await reloadQueue();
    if (!queue.length) return true;
    setStatus({ state: "syncing", msg: "送信中" });
    try {
      while (queue.length) {
        const path = queue[0].path;
        const ops = queue.filter(o => o.path === path);
        let attempt = 0;
        for (;;) {
          attempt++;
          let base = files.get(path);
          let sha = tree[path] || base?.sha || null;
          let data;
          // 新しいファイルを丸ごと書くだけ（控えなど）のときは、そのまま送る
          const plain = attempt === 1 && ops.every(o => o.t === "doc") && !sha;
          if (plain) data = clone(ops[ops.length - 1].body);
          else {
            // ぶつかったとき・ほかの端末が先に書いたと分かっているときは、最新を読んで、この端末の操作だけを当て直す
            let conflict = attempt > 1 || !!(sha && base?.sha !== sha) || !base;
            if (attempt > 1) sha = await currentSha(path);
            if (conflict) data = sha ? await fetchBlob(sha) : {};
            else data = clone(base.data) || {};
            for (const o of ops) data = applyOp(data, o, conflict);
          }
          const res = await putFile(path, data, sha, `アプリから更新：${path}`);
          if (res.ok) {
            const j = await res.json();
            tree[path] = j.content.sha; idbSet("tree", tree); bump(path);
            const sent = new Set(ops.map(o => o.k));
            await qUpdate(q => q.filter(o => !sent.has(o.k)));
            files.set(path, { sha: j.content.sha, data: applyPending(path, data) });
            await persistFile(path);
            emit(path, false);
            if (bc) try { bc.postMessage({ type: "sent", path }); } catch {}
            setStatus({});
            break;
          }
          if ((res.status === 409 || res.status === 422) && attempt < 6) { await sleep(300 + Math.random() * 900); continue; }
          let why = ""; try { why = (await res.json()).message || ""; } catch {}
          throw new Error(`送信できませんでした（${res.status}${why ? "：" + why : ""}・${path}）`);
        }
      }
      setStatus({ state: "ok", msg: "保存しました" });
      return true;
    } catch (e) {
      setStatus({ state: "error", msg: e.message + "。端末に残しています。しばらくして自動で再送します" });
      setTimeout(flush, 20000);
      return false;
    }
  }

  // ---------- 公開する窓口 ----------
  const Shelf = {
    REPO,
    token,
    setToken(t) { LS.set("shelf.token", t); refresh(); },
    // 鍵を消す。wipe：端末に置いた記録の写しと送信待ちも消す（人に渡す端末のため）
    async clearToken(wipe) {
      LS.del("shelf.token");
      if (!wipe) return;
      try { if (idbP) (await idbP).close(); } catch {}
      idbP = null; files.clear(); tree = {}; known = {}; queue = [];
      await new Promise(res => { try { const r = indexedDB.deleteDatabase("shelf"); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
      try { for (const k of Object.keys(localStorage)) if (/^shelf\./.test(k)) localStorage.removeItem(k); } catch {}
    },
    deviceName() {
      let d = LS.get("shelf.device", "");
      if (!d) { const ua = navigator.userAgent; d = (/Android/.test(ua) ? "Android" : "パソコン") + "-" + Math.random().toString(36).slice(2, 6); LS.set("shelf.device", d); }
      return d;
    },
    // need：この画面に要るファイルの先頭の並び（例 ["works/novels.json", "records/novels-checker/"]）。省くとすべて
    init(opts = {}) {
      if (ready) return ready;
      if (opts.need) needRe = new RegExp("^(" + opts.need.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")");
      ready = (async () => {
        const t = await idbGet("tree"); if (t) tree = t;
        known = (await idbGet("known")) || tree;
        // 以前の形（localStorage）の送信待ちが残っていれば、共有の送信待ちに移す
        let old = null;
        try { old = localStorage.getItem("shelf.queueInIdb") ? null : JSON.parse(localStorage.getItem("shelf.queue") || "null"); } catch {}
        await qUpdate(q => {
          q = (q || []).map(o => o.k ? o : { ...o, k: newKey() });
          if (Array.isArray(old) && old.length) q = q.concat(old.map(o => ({ ...o, k: newKey() })));
          return q;
        });
        try { localStorage.removeItem("shelf.queue"); localStorage.removeItem("shelf.queueInIdb"); } catch {}
        // 端末の写しから読むのは、この画面に要るファイルだけ（ほかの画面の作品データまで読むと開くのが遅くなる）
        const fs = await Promise.all(Object.keys(tree).filter(p => !needRe || needRe.test(p)).map(async p => [p, await idbGet("f:" + p)]));
        for (const [p, f] of fs) if (f) files.set(p, f);
        setStatus({ state: queue.length ? "pending" : "idle" });
        // この画面に要るファイルの写しが、保管場所にあるものすべてそろっているか（1つでも欠けていれば最新を待つ）
        const needList = Object.keys(known).filter(p => !needRe || needRe.test(p));
        const haveNeed = needList.length > 0 && needList.every(p => files.has(p));
        refresh();
        // 写しがあれば、待たずにすぐ写しで開く。新しい中身は後ろで取り、届いたら画面に反映する。
        // 初めての端末（写しがない）だけ、要るファイルがそろうまで待つ
        if (!haveNeed) await needDone;
        addEventListener("online", () => { refresh(); flush(); });
        document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") refresh(); });
        setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 90000);
      })();
      return ready;
    },
    refresh,
    flush,
    // 写真などのファイルをそのまま保管場所に置く（base64：中身を base64 にした文字列）。送信待ちには入れず、その場で送る。
    // branch を渡すと、その枝（例：写真だけを置く "photos"）に置く
    async putRaw(path, base64, message, branch = BRANCH) {
      let sha = null;
      for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await gh(`/contents/${encodeURI(path)}`, { method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: message || `アプリから追加：${path}`, branch, content: base64, sha: sha || undefined }) });
        if (res.ok) return (await res.json()).content.sha;
        if ((res.status === 409 || res.status === 422) && attempt < 4) {
          if (branch === BRANCH) sha = await currentSha(path);
          else { const r = await gh(`/contents/${encodeURI(path)}?ref=${branch}`); sha = r.ok ? (await r.json()).sha : null; }
          continue;
        }
        let why = ""; try { why = (await res.json()).message || ""; } catch {}
        throw new Error(`送れませんでした（${res.status}${why ? "：" + why : ""}）`);
      }
    },
    // 保管場所のフォルダの中身（名前と種類）。無ければ []
    async listRemote(dir, branch = BRANCH) {
      const res = await gh(`/contents/${encodeURI(dir)}?ref=${branch}`);
      if (res.status === 404) return [];
      if (!res.ok) throw new Error("一覧を取れませんでした（" + res.status + "）");
      return (await res.json()).map(x => ({ name: x.name, type: x.type, path: x.path, size: x.size }));
    },
    // 写真などをそのまま読む（Blob）
    async readRemoteBlob(path, branch = BRANCH) {
      const res = await gh(`/contents/${encodeURI(path)}?ref=${branch}`, { headers: { Accept: "application/vnd.github.raw+json" } });
      if (!res.ok) throw new Error("ファイルを取れませんでした（" + res.status + "）");
      return await res.blob();
    },
    // 枝の中身を一覧する（[{path, sha, size}]）。枝が無ければ null
    async branchFiles(branch) {
      const res = await gh(`/git/trees/${branch}?recursive=1`);
      if (res.status === 404 || res.status === 409) return null;
      if (!res.ok) throw new Error("一覧を取れませんでした（" + res.status + "）");
      const j = await res.json();
      return j.tree.filter(e => e.type === "blob").map(e => ({ path: e.path, sha: e.sha, size: e.size || 0 }));
    },
    // 枝を、keep で選んだファイルだけを持つ新しい1つの版に置き換える（それまでの版は残さない）。
    // 写真の枝の古い写真を本当に消して、保管場所の大きさを減らすために使う。記録の枝（main）には使わない
    async branchReplace(branch, keep, message) {
      if (branch === BRANCH) throw new Error("記録の枝は置き換えられません");
      const files = await this.branchFiles(branch); if (!files) return 0;
      const kept = files.filter(keep);
      if (kept.length === files.length) return 0;
      const tree = kept.length ? kept.map(f => ({ path: f.path, mode: "100644", type: "blob", sha: f.sha }))
        : [{ path: "README.md", mode: "100644", type: "blob", content: "本棚の写真の置き場です。\n" }];
      const json = (url, body, method = "POST") => gh(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async r => { if (!r.ok) throw new Error("写真の片付けに失敗しました（" + r.status + "）"); return r.json(); });
      const t = await json(`/git/trees`, { tree });
      const c = await json(`/git/commits`, { message, tree: t.sha, parents: [] });
      await json(`/git/refs/heads/${branch}`, { sha: c.sha, force: true }, "PATCH");
      return files.length - kept.length;
    },
    // 端末に写しを持たないファイル（import/ など）を、その場で保管場所から読む。無ければ null
    async readRemote(path, branch = BRANCH) {
      const res = await gh(`/contents/${encodeURI(path)}?ref=${branch}`, { headers: { Accept: "application/vnd.github.raw+json" } });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error("ファイルを取れませんでした（" + res.status + "）");
      return JSON.parse(await res.text());
    },
    has: path => files.has(path),
    read: path => files.get(path)?.data ?? null,
    list: prefix => [...files.keys()].filter(p => p.startsWith(prefix)),
    // 文書を書く。保管場所にすでにあるファイルは、丸ごとではなく「変えた所だけ」を送る（ほかの端末・定期タスクの変更を消さないため）。
    // base：呼び出し側が読んだときの中身（省くと端末の今の写し）。この中身と body の差だけを送る
    writeDoc(path, body, base) {
      const cur = files.get(path);
      const from = base !== undefined ? base : cur?.data;
      if (from == null && !(path in known) && !(path in tree)) {
        enqueue({ t: "doc", path, body: clone(body) }); bump(path);
        files.set(path, { sha: cur?.sha, data: clone(body) });
        persistFile(path); setStatus({ state: "pending" }); emit(path, false);
        return;
      }
      Shelf.patch(path, diff(from || {}, body));
    },
    // 一部だけ書く。ops：[{keys:[...], value} | {keys, del:1} | {keys, add, rm} | {keys, value, mode}]
    patch(path, ops) {
      if (!ops || !ops.length) return;
      const list = ops.map(p => ({ ...clone(p), t: "patch", path }));
      enqueueMany(list); bump(path);
      const cur = files.get(path);
      let data = clone(cur?.data) || {};
      for (const o of list) data = applyPatch(data, o);
      files.set(path, { sha: cur?.sha, data });
      persistFile(path); setStatus({ state: "pending" }); emit(path, false);
    },
    // 当て方に名前を付けて足す（fn(入れ物, 鍵, 値, ファイル全体)）
    patchMode(name, fn) { modes[name] = fn; },
    diff: (a, b) => diff(a, b),
    applyPatch: (d, op) => applyPatch(clone(d), op),
    // {items:{}} 形式のファイルの1項目を書く（null で消す）
    writeItem(path, id, value) { Shelf.writeItems(path, { [id]: value }); },
    // {items:{}} 形式のファイルのいくつもの項目を一度に書く（{id: 値 または null}）
    writeItems(path, map) {
      const ids = Object.keys(map); if (!ids.length) return;
      enqueueMany(ids.map(id => ({ t: "item", path, id, value: map[id] === null ? null : clone(map[id]) }))); bump(path);
      const cur = files.get(path) || { sha: undefined, data: { items: {} } };
      const data = clone(cur.data) || { items: {} }; data.items = data.items || {};
      for (const id of ids) { if (map[id] === null) delete data.items[id]; else data.items[id] = clone(map[id]); }
      files.set(path, { sha: cur.sha, data });
      persistFile(path); setStatus({ state: "pending" }); emit(path, false);
    },
    on(path, cb) { if (!subs.has(path)) subs.set(path, new Set()); subs.get(path).add(cb); return () => subs.get(path).delete(cb); },
    onAny(cb) { anySubs.add(cb); return () => anySubs.delete(cb); },
    onStatus(cb) { statusSubs.add(cb); cb(status); return () => statusSubs.delete(cb); },
    status: () => status,
  };

  // ---------- 今のチェッカーのページ向けの橋渡し ----------
  // 今のページは「アカウントの保存先」(claude.use("db")) に文書を丸ごと読み書きしていた。
  // 同じ形の窓口を用意し、中身を shelf-data のファイルにつなぐ。
  Shelf.legacyClaude = function (opts) {
    const { docPath, virtual = {} } = opts;
    // 画面が最後に受け取った・送った中身。set のときはこれとの差だけを送る（画面がまだ取り込んでいない、ほかの端末の変更を消さないため）
    const seen = new Map();
    function snap(data, pending) { return { exists: data != null, data: () => clone(data), metadata: { hasPendingWrites: !!pending, fromCache: false } }; }
    function ref(full) {
      const v = virtual[full];
      const path = v ? null : docPath(full);
      return {
        id: full.split("/").pop(), path: full,
        async get() { const d = v ? v() : Shelf.read(path); if (!v && !seen.has(path)) seen.set(path, clone(d)); return snap(d, false); },
        async set(body) {
          if (v) throw Object.assign(new Error("読み取り専用"), { code: "invalid_argument" });
          const base = seen.has(path) ? seen.get(path) : Shelf.read(path);
          Shelf.writeDoc(path, body, base == null && !Shelf.has(path) ? undefined : (base || {}));
          seen.set(path, clone(body));
        },
        async update(body) { const cur = Shelf.read(path) || {}; Shelf.writeDoc(path, { ...cur, ...body }); },
        onSnapshot(next, err) {
          const watchPath = v ? (opts.virtualSource && opts.virtualSource[full]) : path;
          if (!watchPath) return () => {};
          return Shelf.on(watchPath, (data, remote) => { if (remote) next(snap(v ? v() : data, false)); });
        },
      };
    }
    const db = {
      doc: p => ref(p),
      collection: p => ({ path: p, doc: id => ref(p + "/" + id) }),
    };
    const user = { id: async () => "me", me: async () => ({ id: "me" }), can: async () => true, canEdit: () => true, isOwner: () => true };
    const downloads = {
      async save({ filename, data }) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: "text/plain;charset=utf-8" });
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        return { saved: true };
      },
    };
    return { use: async name => ({ db, user, downloads }[name] || null) };
  };

  window.Shelf = Shelf;
})();
