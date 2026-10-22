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
  // 送信待ちは画面を移ってもなくならないよう、すぐに端末へ書く（大きすぎて書けなければIndexedDBへ）
  function persistQueue() {
    try { localStorage.setItem("shelf.queue", JSON.stringify(queue)); localStorage.removeItem("shelf.queueInIdb"); }
    catch { idbSet("queue", queue); try { localStorage.setItem("shelf.queueInIdb", "1"); } catch {} }
  }
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
  // 送信待ちの変更を、取り直した中身に当て直す（端末の変更を上書きで失わないため）
  function applyPending(path, data) {
    for (const op of queue) {
      if (op.path !== path) continue;
      if (op.t === "doc") data = clone(op.body);
      else { data = data || { items: {} }; data.items = data.items || {}; if (op.value === null) delete data.items[op.id]; else data.items[op.id] = clone(op.value); }
    }
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
  async function currentSha(path) { const t = await fetchTree(); return t[path] || null; }
  async function flush() {
    if (flushing || !queue.length) return;
    // 取り直しの最中なら、終わってから送る（最新の中身に当てるため）
    if (refreshing) { try { await refreshing; } catch {} if (flushing || !queue.length) return; }
    if (!navigator.onLine || !token()) { setStatus({ state: navigator.onLine ? "notoken" : "offline" }); return; }
    flushing = true;
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
          if (ops.some(o => o.t === "item")) {
            // 項目単位の変更：最新の中身に当てる
            if (attempt > 1 || (sha && base?.sha !== sha)) {
              sha = attempt > 1 ? await currentSha(path) : sha;
              data = sha ? await fetchBlob(sha) : { items: {} };
            } else data = clone(base?.data) || { items: {} };
            data.items = data.items || {};
            for (const o of ops) {
              if (o.t === "doc") data = clone(o.body);
              else if (o.value === null) delete data.items[o.id];
              else data.items[o.id] = clone(o.value);
            }
          } else {
            data = clone(ops[ops.length - 1].body);
            if (attempt > 1) sha = await currentSha(path);
          }
          const res = await putFile(path, data, sha, `アプリから更新：${path}`);
          if (res.ok) {
            const j = await res.json();
            tree[path] = j.content.sha; idbSet("tree", tree); bump(path);
            const sent = new Set(ops);
            queue = queue.filter(o => !sent.has(o));
            files.set(path, { sha: j.content.sha, data: applyPending(path, data) });
            persistQueue(); await persistFile(path);
            emit(path, false);
            setStatus({});
            break;
          }
          if ((res.status === 409 || res.status === 422) && attempt < 6) { await sleep(300 + Math.random() * 900); continue; }
          throw new Error("送信できませんでした（" + res.status + "）");
        }
      }
      setStatus({ state: "ok", msg: "保存しました" });
    } catch (e) {
      setStatus({ state: "error", msg: e.message + "。端末に残しています。しばらくして自動で再送します" });
      setTimeout(flush, 20000);
    } finally { flushing = false; }
  }

  // ---------- 公開する窓口 ----------
  const Shelf = {
    REPO,
    token,
    setToken(t) { LS.set("shelf.token", t); refresh(); },
    clearToken() { LS.del("shelf.token"); },
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
        let q = null;
        try { q = localStorage.getItem("shelf.queueInIdb") ? await idbGet("queue") : JSON.parse(localStorage.getItem("shelf.queue") || "null"); } catch {}
        if (!q) q = await idbGet("queue");
        if (Array.isArray(q)) queue = q;
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
    has: path => files.has(path),
    read: path => files.get(path)?.data ?? null,
    list: prefix => [...files.keys()].filter(p => p.startsWith(prefix)),
    // 文書を丸ごと書く
    writeDoc(path, body) {
      queue.push({ t: "doc", path, body: clone(body) }); bump(path);
      files.set(path, { sha: files.get(path)?.sha, data: clone(body) });
      persistFile(path); persistQueue(); setStatus({ state: "pending" }); emit(path, false); flush();
    },
    // {items:{}} 形式のファイルの1項目を書く（null で消す）
    writeItem(path, id, value) {
      queue.push({ t: "item", path, id, value: value === null ? null : clone(value) }); bump(path);
      const cur = files.get(path) || { sha: undefined, data: { items: {} } };
      const data = clone(cur.data) || { items: {} }; data.items = data.items || {};
      if (value === null) delete data.items[id]; else data.items[id] = clone(value);
      files.set(path, { sha: cur.sha, data });
      persistFile(path); persistQueue(); setStatus({ state: "pending" }); emit(path, false); flush();
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
    function snap(data, pending) { return { exists: data != null, data: () => clone(data), metadata: { hasPendingWrites: !!pending, fromCache: false } }; }
    function ref(full) {
      const v = virtual[full];
      const path = v ? null : docPath(full);
      return {
        id: full.split("/").pop(), path: full,
        async get() { return snap(v ? v() : Shelf.read(path), false); },
        async set(body) { if (v) throw Object.assign(new Error("読み取り専用"), { code: "invalid_argument" }); Shelf.writeDoc(path, body); },
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
