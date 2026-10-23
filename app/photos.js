// 本棚の写真からの一括登録
// 1. 棚（保管場所）を選んで写真を撮り、端末に取っておく → 後ろで順に inbox/shelf/<束の番号>/ に写真と batch.json を送る
// 2. Claude が会話で写真を読み、背表紙の書名・著者を candidates.json に書く（「本棚の写真を読んで」と頼む）
// 3. この画面で候補を確かめ、まとめて登録する。持っている本は保管場所をその棚にし、持っていない本は新しく登録する
"use strict";
// 写真は記録とは別の枝「photos」に置く（確認が終わった写真を、記録の歴史を書き換えずに本当に消せるように）
const PB = "photos";
// 写真の置き場がこの大きさを超えたら、確認が終わった棚の写真を消す（GitHub が勧める保管場所の大きさ 1GB を超えないように）
const PHOTO_LIMIT = 600e6;
const PH = { dir: "inbox/shelf", files: [], batches: [], open: null, urls: new Map() };
const bufOfBlob = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsArrayBuffer(blob); });
const b64ofBuf = buf => { const b = new Uint8Array(buf); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };
const b64ofText = s => { const b = new TextEncoder().encode(s); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };

// 写真を縮める（長い辺 2800px・JPEG）。背表紙の小さな文字が読める大きさを残す。
// 縮められなかったとき（古い端末・メモリ不足など）は元の写真のまま使う。使い終えた画像はすぐ手放す（何十枚でも続けて扱えるように）
async function shrink(file) {
  if (typeof createImageBitmap !== "function") return file;
  let img = null, c = null;
  try {
    img = await createImageBitmap(file, { imageOrientation: "from-image" });
    const k = Math.min(1, 2800 / Math.max(img.width, img.height));
    c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const g = c.getContext("2d"); if (!g) return file;
    g.drawImage(img, 0, 0, c.width, c.height);
    const out = await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
    return out && out.size ? out : file;
  } catch { return file; }
  finally { try { img?.close?.(); } catch {} if (c) { c.width = 0; c.height = 0; } }
}

function phPlaces() {
  const cur = $("phPlace").value;
  const pl = Object.values(Lib.places());
  $("phPlace").innerHTML = `<option value="">（選んでください）</option>` + pl.map(n => `<option>${esc(n)}</option>`).join("") + `<option value="__new">新しい保管場所…</option>`;
  if (cur && [...$("phPlace").options].some(o => o.value === cur)) $("phPlace").value = cur;
}
$("phPlace").onchange = () => { $("phNewWrap").hidden = $("phPlace").value !== "__new"; phSync(); };
$("phNewPlace").oninput = phSync;
function phPlaceName() { return $("phPlace").value === "__new" ? $("phNewPlace").value.trim() : $("phPlace").value; }
function phSync() { $("phSend").disabled = !PH.files.length || !phPlaceName(); $("phSend").textContent = PH.files.length ? `この棚の写真（${PH.files.length}枚）を取っておく` : "この棚の写真を取っておく"; }
// 端末にあと何枚取っておけるか（1枚およそ1.5MBとして、端末の空きから見積もる。余裕として30MBは残す）。分からないときは null
const PER_PHOTO = 1.5e6;
async function phRoom() {
  try { const e = await navigator.storage?.estimate?.(); if (!e || !e.quota) return null; return Math.max(0, Math.floor((e.quota - (e.usage || 0) - 30e6) / PER_PHOTO)); } catch { return null; }
}
async function phCapShow() {
  const room = await phRoom(), n = PH.files.length, held = PH.heldN || 0;
  const el = $("phCap");
  if (room == null || (!n && !held)) { el.hidden = true; return; }
  el.hidden = false;
  el.className = "small " + (n > room ? "notice" : "muted");
  el.textContent = n > room
    ? `端末の空きが足りません。あと約${room}枚しか取っておけません（選んだのは${n}枚）。送り終わるのを待つと空きが増えます。`
    : `端末にあと約${room}枚取っておけます。送り終えた写真は端末から消えるので、そのぶん空きが戻ります。`;
}
function addFiles(list) {
  for (const f of list) PH.files.push({ f, url: URL.createObjectURL(f) });
  $("phThumbs").innerHTML = PH.files.map((x, i) => `<figure><img src="${x.url}" alt="${i + 1}枚目"><button type="button" class="small quiet" data-phdel="${i}">外す</button></figure>`).join("");
  phSync(); phCapShow();
}
$("phCam").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
$("phPick").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
$("phThumbs").onclick = e => { const b = e.target.closest("[data-phdel]"); if (!b) return; const x = PH.files.splice(+b.dataset.phdel, 1)[0]; URL.revokeObjectURL(x.url); addFiles([]); };

// ---------- 撮った棚を端末に取っておき、後ろで順に送る ----------
// 端末の中の置き場（IndexedDB「shelf-photos」）。棚の情報 held：{ id, place, at, n:枚数, sent:送り終えた枚数, err }。
// 写真は1枚ずつ pics に分けてしまう（キー "<id>/<番号>"・中身はバイト列）。まとめて1つにすると、枚数が多いとしまえないことがあるため
const HELD = {
  db: null,
  open() {
    if (this.db) return this.db;
    return this.db = new Promise((res, rej) => {
      const r = indexedDB.open("shelf-photos", 2);
      r.onupgradeneeded = () => { const db = r.result; for (const n of [...db.objectStoreNames]) db.deleteObjectStore(n); db.createObjectStore("held", { keyPath: "id" }); db.createObjectStore("pics"); };
      r.onsuccess = () => res(r.result); r.onerror = () => { this.db = null; rej(r.error); };
    });
  },
  async run(store, mode, fn) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction(store, mode); let out; const q = fn(t.objectStore(store)); if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error("端末にしまえませんでした（空き容量が足りない可能性があります）")); });
  },
  all() { return this.run("held", "readonly", st => st.getAll()).then(x => x || []); },
  put(x) { return this.run("held", "readwrite", st => st.put(x)); },
  pic(id, i) { return this.run("pics", "readonly", st => st.get(`${id}/${i}`)); },
  putPic(id, i, buf) { return this.run("pics", "readwrite", st => st.put(buf, `${id}/${i}`)); },
  async del(id, n) { await this.run("held", "readwrite", st => st.delete(id)); await this.run("pics", "readwrite", st => st.delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`))); },
};
$("phSend").onclick = async () => {
  const place = phPlaceName(); if (!place || !PH.files.length) return;
  if ($("phPlace").value === "__new") Lib.addPlace(place);
  $("phSend").disabled = true;
  const id = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-") + "-" + Math.random().toString(36).slice(2, 5);
  const files = PH.files.map(x => x.f);
  const room = await phRoom();
  if (room != null && files.length > room) { await phCapShow(); $("phMsg").textContent = `端末の空きが足りないので取っておけませんでした（あと約${room}枚分）。送り終わるのを待つか、枚数を減らしてください。`; phSync(); return; }
  // 端末が空きを作るために写真を勝手に消さないよう頼む（断られても動きは同じ）
  try { navigator.storage?.persist?.(); } catch {}
  try {
    // 1枚ずつ縮めて、すぐ端末にしまう（全部を同時にメモリに持たない）
    for (let i = 0; i < files.length; i++) {
      $("phMsg").textContent = `写真を整えています（${i + 1}/${files.length}）…`;
      await HELD.putPic(id, i, await bufOfBlob(await shrink(files[i])));
    }
    await HELD.put({ id, place, at: new Date().toISOString(), n: files.length, sent: 0 });
    PH.files.forEach(x => URL.revokeObjectURL(x.url)); PH.files = []; addFiles([]);
    $("phPlace").value = ""; $("phNewPlace").value = ""; $("phNewWrap").hidden = true; phSync();
    $("phMsg").textContent = `「${place}」の写真（${files.length}枚）を取っておきました。次の棚を選んで撮ってください。`;
    phHeldShow(); phUpload();
  } catch (e) {
    await HELD.del(id).catch(() => {});
    $("phMsg").textContent = `取っておけませんでした（${e?.message || e}）。写真は消えていないので、もう一度押してみてください。続けて出るときは、この文をそのまま Claude に伝えてください。`;
    phSync();
  }
};
async function phHeldShow() {
  const list = await HELD.all().catch(() => []);
  PH.heldN = list.reduce((k, x) => k + x.n - (x.sent || 0), 0); phCapShow();
  $("phHeldBox").hidden = !list.length;
  $("phHeld").innerHTML = list.sort((a, b) => a.id < b.id ? -1 : 1).map(x => `<li><div class="grow"><div class="t">${esc(x.place)}</div><div class="m"><span>${x.n}枚</span><span class="pill ${x.err ? "warn" : ""}">${x.err ? "送れていません（あとで送り直します）" : PH.sending === x.id ? `送っています（${x.sent}/${x.n}）` : "送る順番を待っています"}</span></div></div>${PH.sending === x.id ? "" : `<button type="button" class="small quiet" data-phheld="${esc(x.id)}">取りやめる</button>`}</li>`).join("");
}
$("phHeld").onclick = async e => {
  const b = e.target.closest("[data-phheld]"); if (!b || PH.sending === b.dataset.phheld) return;
  if (!confirm("この棚の写真を送らずに消します。よろしいですか？")) return;
  await HELD.del(b.dataset.phheld); phHeldShow();
};
// 取っておいた棚を1つずつ送る。途中で画面を閉じても、次に開いたとき続きから送る
async function phUpload() {
  if (PH.uploading) return; PH.uploading = true;
  try {
    for (;;) {
      const list = (await HELD.all().catch(() => [])).sort((a, b) => a.id < b.id ? -1 : 1);
      const x = list.find(y => !y.err) || null;
      if (!x) break;
      PH.sending = x.id; phHeldShow();
      const base = `${PH.dir}/${x.id}`;
      try {
        for (let i = x.sent; i < x.n; i++) {
          const buf = await HELD.pic(x.id, i); if (!buf) throw new Error(`${i + 1}枚目の写真が端末に見つかりません`);
          await Shelf.putRaw(`${base}/${i + 1}.jpg`, b64ofBuf(buf), `本棚の写真：${x.place}（${i + 1}枚目）`, PB);
          x.sent = i + 1; await HELD.put(x); phHeldShow();
        }
        const batch = { id: x.id, place: x.place, at: x.at, device: Shelf.deviceName(), photos: Array.from({ length: x.n }, (_, i) => `${i + 1}.jpg`), status: "new" };
        await Shelf.putRaw(`${base}/batch.json`, b64ofText(JSON.stringify(batch)), `本棚の写真：${x.place}（${x.n}枚）`, PB);
        await HELD.del(x.id);
        phLoad();
      } catch (e) { x.err = e.message; await HELD.put(x); }
    }
  } finally { PH.uploading = false; PH.sending = null; phHeldShow(); }
}
// 送れなかった棚は、電波が戻ったときと画面を開いたときに送り直す
async function phRetry() { const list = await HELD.all().catch(() => []); for (const x of list) if (x.err) { delete x.err; await HELD.put(x); } phUpload(); }
addEventListener("online", phRetry);

// ---------- 束の一覧 ----------
const ST = { new: ["warn", "読み取り待ち"], read: ["acc", "候補あり・確かめてください"], part: ["acc", "一部を登録済み"], done: ["ok", "登録済み"] };
async function phLoad() {
  $("phBatches").innerHTML = `<li class="empty">読み込んでいます…</li>`;
  try {
    const dirs = (await Shelf.listRemote(PH.dir, PB)).filter(x => x.type === "dir").map(x => x.name).sort().reverse();
    PH.batches = (await Promise.all(dirs.map(async d => {
      const b = await Shelf.readRemote(`${PH.dir}/${d}/batch.json`, PB).catch(() => null);
      return b ? { ...b, dir: d } : null;
    }))).filter(Boolean);
  } catch (e) { $("phBatches").innerHTML = `<li class="empty">読み込めませんでした：${esc(e.message)}</li>`; return; }
  $("phBatches").innerHTML = PH.batches.map(b => `<li><div><div class="t">${esc(b.place)}</div><div class="m"><span>${esc(b.at.slice(0, 16).replace("T", " "))}</span><span>${b.photos.length}枚</span><span class="pill ${ST[b.status]?.[0] || ""}">${esc(ST[b.status]?.[1] || b.status)}</span>${b.result ? `<span>${esc(b.result)}</span>` : ""}</div></div>${b.status === "read" || b.status === "part" ? `<button type="button" class="small pri" data-phopen="${esc(b.dir)}">確かめる</button>` : b.status === "done" ? `<button type="button" class="small quiet" data-phopen="${esc(b.dir)}">見る・直す</button>` : ""}</li>`).join("") || `<li class="empty">まだ送った写真はありません</li>`;
  phTidy();
  const waiting = PH.batches.filter(b => b.status === "new").length;
  $("phHint").hidden = !waiting;
  $("phHint").textContent = `読み取り待ちの棚が ${waiting} つあります。撮り終えたら、Claude との会話で「本棚の写真を読んで」と頼んでください。まとめて読み取ります。`;
}
$("phReload").onclick = phLoad;
$("phBatches").onclick = e => { const b = e.target.closest("[data-phopen]"); if (b) phOpen(b.dataset.phopen); };

// ---------- 候補を確かめる ----------
async function photoUrl(path) {
  if (!PH.urls.has(path)) PH.urls.set(path, URL.createObjectURL(await Shelf.readRemoteBlob(path, PB)));
  return PH.urls.get(path);
}
// 候補が蔵書のどれに当たるか
function phMatch(c) {
  const hasVol = c.vol != null && c.vol !== "";
  // 種類が分かっている候補（漫画など）は、種類の違う本（同じ書名の小説など）とは結び付けない
  const okCat = it => !c.cat || !it.cat || it.cat === "その他" || it.cat === c.cat;
  if (hasVol) {
    const s = Lib.seriesFor(c.t);
    if (s && okCat(s)) { const v = (s.vols || {})[c.vol]; return { item: s, owned: s.st === "own" && !!v?.own, series: true }; }
    // 巻数のある漫画で、シリーズがまだ無い：新しいシリーズになる（1冊の本と書名だけで結び付けない）
    if (c.cat === "漫画") return {};
  }
  // 巻数があるときは「書名＋巻数」でだけ探す（書名だけで探すと、別の巻や別の版の本に結び付いてしまう）
  const f = Lib.findSameByTitle(hasVol ? c.t + " " + c.vol : c.t, c.a);
  if (f?.item && okCat(f.item)) return { item: f.item, owned: f.item.st === "own", want: f.item.st === "want" };
  if (f?.cands) { const cs = f.cands.filter(okCat); if (cs.length) return { cands: cs }; }
  return {};
}
let PHC = null;   // 開いている束：{ batch, cand, photos, items:[{...候補, act, done}] }
// 1冊ごとの決め方：reg＝登録する（持っている本は保管場所をこの棚にする）・skip＝登録しない（読み取り誤りなど）・later＝あとで決める
const isOn = c => !c.done && c.act === "reg";
const isSkip = c => !c.done && c.act === "skip";
const unsure = c => c.conf === "low" || /^（/.test(c.t0 || c.t);
const nameOf = c => (c.t0 || c.t) + (c.vol0 != null ? ` ${c.vol0}巻` : "");
async function phOpen(dir) {
  const b = PH.batches.find(x => x.dir === dir); if (!b) return;
  const cand = await Shelf.readRemote(`${PH.dir}/${dir}/candidates.json`, PB).catch(() => null);
  if (!cand) { UI.toast("候補がまだありません"); return; }
  PHC = { batch: b, cand, items: cand.items.map((c, i) => {
    const m = phMatch(c);
    // 以前の版で登録した束は、登録済みの印が無い。蔵書で持っている本は登録済みとみなす
    const done = c.done || (b.status !== "read" && m.owned ? { how: "had" } : null);
    return { ...c, i, m, done, t0: c.t0 || c.t, vol0: c.vol0 !== undefined ? c.vol0 : c.vol, act: done ? null : (c.conf !== "low" && !m.cands ? "reg" : "later") };
  }) };
  // どこにある本か：同じ写真の中で、前後のはっきり読めた本の名前で示す
  for (const c of PHC.items) {
    if (!unsure(c)) continue;
    const same = PHC.items.filter(x => x.photo === c.photo);
    const k = same.indexOf(c);
    const prev = same.slice(0, k).reverse().find(x => !unsure(x)), next = same.slice(k + 1).find(x => !unsure(x));
    const no = parseInt(c.photo) || 1;
    // 同じすき間に読めない本が何冊も並ぶときは、左から何冊目かも示す
    const gap = same.slice(prev ? same.indexOf(prev) + 1 : 0, next ? same.indexOf(next) : same.length);
    const nth = gap.length > 1 ? `（この間の${gap.length}冊のうち、左から${gap.indexOf(c) + 1}冊目）` : "";
    c.where = `${no}枚目の写真・` + (prev && next ? `「${nameOf(prev)}」と「${nameOf(next)}」の間` : prev ? `「${nameOf(prev)}」の右（後ろ）` : next ? `「${nameOf(next)}」の左（前）` : "この写真の中") + nth;
  }
  // 確認が終わって片付けた写真は、もう無い（候補と登録済みの印だけが残る）
  PHC.photos = await Promise.all(b.photos.map(async p => [p, await photoUrl(`${PH.dir}/${dir}/${p}`).catch(() => null)]));
  phRender();
  $("phReview").scrollIntoView({ behavior: "smooth" });
}
// 未確認の本を上に、確認済みの本を下（たたんだ欄）にまとめて描く
function phRender() {
  const b = PHC.batch;
  const open = PHC.items.filter(c => !c.done), closed = PHC.items.filter(c => c.done);
  const group = (list, withPhoto) => PHC.photos.map(([p, url]) => {
    const rows = list.filter(c => c.photo === p); if (!rows.length) return "";
    const img = !withPhoto ? "" : url ? `<a href="${url}" target="_blank" rel="noopener"><img class="phimg" src="${url}" alt="${esc(p)}"></a>` : `<p class="small muted">${esc(p)}：確認が終わったので写真は片付けました</p>`;
    return `<div class="phblock"><p class="small muted">${parseInt(p) || 1}枚目の写真</p>${img}<ul class="list">${rows.map(phRow).join("")}</ul></div>`;
  }).join("");
  $("phReview").innerHTML = `<div class="row"><h3 class="grow">${esc(b.place)}・未確認 ${open.length}冊／全 ${PHC.items.length}冊</h3><button type="button" class="quiet small" id="phClose">閉じる</button></div>
    <p class="small muted">1冊ずつ「登録する」「登録しない（読み取り誤りなど）」「あとで決める」を選んで、下の「決めた内容を確定する」を押してください。持っている本は「登録する」で保管場所が「${esc(b.place)}」になります。書名や巻数を直すと「登録する」になります。確定した本は下の「確認済み」に移ります。</p>
    <div class="row phbulk"><span class="small">未確認の本をまとめて：</span><button type="button" class="small quiet" data-phall="reg">すべて登録する</button><button type="button" class="small quiet" data-phall="later">すべてあとで決める</button></div>
    ${open.length ? group(open, true) : `<p class="small">この棚の本はすべて確認が終わりました。</p>`}
    <details><summary>候補にない本を足す</summary><div class="grid2" style="margin-top:8px"><label class="f">書名<input type="text" id="phAddT"></label><label class="f">著者<input type="text" id="phAddA"></label></div><div class="row" style="margin-top:6px"><label class="f" style="display:inline-flex;align-items:center;gap:4px">巻<input type="text" id="phAddV" style="width:4.5em"></label><button type="button" class="small" id="phAddBtn">足す</button></div></details>
    <div class="phbar"><span class="small" id="phSel"></span><button type="button" class="pri" id="phReg">決めた内容を確定する</button></div>
    <p class="small" id="phRegMsg"></p>
    ${closed.length ? `<details class="phdone"><summary>確認済み（${closed.length}冊）</summary>${group(closed, !open.length)}</details>` : ""}`;
  $("phClose").onclick = () => { $("phReview").innerHTML = ""; PHC = null; };
  $("phReg").onclick = phRegister;
  $("phAddBtn").onclick = () => {
    const t = $("phAddT").value.trim(); if (!t) return;
    const v = $("phAddV").value.trim();
    const last = (open[open.length - 1] || PHC.items[PHC.items.length - 1])?.photo || b.photos[b.photos.length - 1];
    const c = { photo: last, t, a: $("phAddA").value.trim(), vol: v || null, cat: null, conf: "high", note: "手で足した", added: true, i: PHC.items.length, act: "reg" };
    c.t0 = t; c.vol0 = c.vol; c.m = phMatch(c); PHC.items.push(c);
    phRender();
  };
  phRegBtn();
}
function phRegBtn() {
  const n = PHC.items.filter(isOn).length, k = PHC.items.filter(isSkip).length, l = PHC.items.filter(c => !c.done && c.act === "later").length;
  $("phReg").disabled = !n && !k;
  $("phSel").textContent = `登録する ${n}冊・登録しない ${k}冊・あとで決める ${l}冊`;
}
const HOW = { vol: "シリーズの巻として登録済み", new: "新しく登録済み", loc: "保管場所を入れました", had: "登録済み", skip: "登録しない（読み取り誤りなど）" };
function phStatus(c) {
  const m = c.m;
  if (c.done) return `<span class="pill ${c.done.how === "skip" ? "" : "ok"}">${HOW[c.done.how] || "登録済み"}</span>`;
  const st = m.owned ? `<span class="pill ok">持っています${m.item.loc ? "・" + esc(m.item.loc) : ""}</span>` : m.want ? `<span class="pill acc">読みたい本に入っています</span>` : m.cands ? `<span class="pill warn">同じ書名の本が複数あります</span>` : m.series ? `<span class="pill">シリーズ『${esc(m.item.t)}』のこの巻は未所持</span>` : `<span class="pill">新しく登録</span>`;
  return st + (c.fixed ? `<span class="pill acc">直しました</span>` : c.conf === "low" ? `<span class="pill warn">読み取りに自信なし</span>` : "");
}
function phRow(c) {
  const d = c.done ? " disabled" : "";
  const regLabel = c.m.owned ? "登録する（保管場所をこの棚に）" : "登録する";
  const act = c.done ? (c.done.how === "skip" ? `<button type="button" class="small quiet" data-phundo="${c.i}">登録しないを取り消す</button>` : "")
    : `<select data-k="act" aria-label="この本をどうするか"><option value="reg"${c.act === "reg" ? " selected" : ""}>${regLabel}</option><option value="skip"${c.act === "skip" ? " selected" : ""}>登録しない（読み取り誤りなど）</option><option value="later"${c.act === "later" ? " selected" : ""}>あとで決める</option></select>`;
  return `<li data-phc="${c.i}" class="${c.act === "skip" && !c.done ? "phskip" : ""}"><div class="grow">${c.where && !c.done ? `<div class="small phwhere">場所：${esc(c.where)}</div>` : ""}<div class="grid2"><label class="f">書名<input type="text" data-k="t" value="${esc(c.t)}"${d}></label><label class="f">著者<input type="text" data-k="a" value="${esc(c.a || "")}"${d}></label></div>
    <div class="m"><label class="f" style="display:inline-flex;align-items:center;gap:4px">巻<input type="text" data-k="vol" value="${esc(c.vol ?? "")}" style="width:4.5em"${d}></label><span class="phst">${phStatus(c)}</span>${c.note && !c.done ? `<span class="small muted">${esc(c.note)}</span>` : ""}</div></div>
    <div class="phact">${act}</div></li>`;
}
$("phReview").addEventListener("input", e => {
  const li = e.target.closest("[data-phc]"); if (!li || !PHC) return;
  const c = PHC.items[+li.dataset.phc], k = e.target.dataset.k; if (!k || c.done) return;
  if (k === "act") { c.act = e.target.value; li.classList.toggle("phskip", c.act === "skip"); phRegBtn(); return; }
  c[k] = k === "vol" ? (e.target.value.trim() === "" ? null : e.target.value.trim()) : e.target.value;
  // 直し始めたら、その場で「登録する」にする
  if (!c.fixed || c.act !== "reg") { c.fixed = true; c.act = "reg"; li.querySelector('[data-k="act"]').value = "reg"; li.classList.remove("phskip"); phRegBtn(); }
});
$("phReview").addEventListener("change", e => {
  const li = e.target.closest("[data-phc]"); if (!li || !PHC || e.target.dataset.k === "act") return;
  // 書名・著者・巻を直し終えたら、蔵書との照合をやり直す（行は作り直さない。選んだ決め方が消えないように）
  const c = PHC.items[+li.dataset.phc]; if (c.done) return;
  c.m = phMatch(c);
  li.querySelector(".phst").innerHTML = phStatus(c);
  li.querySelector('[data-k="act"] option[value="reg"]').textContent = c.m.owned ? "登録する（保管場所をこの棚に）" : "登録する";
  phRegBtn();
});
$("phReview").addEventListener("click", async e => {
  if (!PHC) return;
  const all = e.target.closest("[data-phall]");
  if (all) { for (const c of PHC.items) if (!c.done) c.act = all.dataset.phall; phRender(); return; }
  const u = e.target.closest("[data-phundo]");
  if (u) { const c = PHC.items[+u.dataset.phundo]; c.done = null; c.act = "later"; await phSave(""); phRender(); }
});
// 候補のファイル（直した書名・決めた内容）と束の状態を保管場所に残す
async function phSave(result) {
  const b = PHC.batch;
  const keep = ["photo", "pos", "t", "a", "vol", "t0", "vol0", "label", "cat", "conf", "note", "fixed", "added", "done"];
  const cand = { ...PHC.cand, items: PHC.items.map(c => Object.fromEntries(keep.filter(k => c[k] !== undefined && c[k] !== null && c[k] !== false).map(k => [k, c[k]]))) };
  const left = PHC.items.filter(c => !c.done).length;
  const nb = { ...b, status: left ? "part" : "done", doneAt: new Date().toISOString(), result: [b.result, result].filter(Boolean).join("／") };
  delete nb.dir;
  b.status = nb.status; b.result = nb.result;
  try {
    await Shelf.putRaw(`${PH.dir}/${b.dir}/candidates.json`, b64ofText(JSON.stringify(cand, null, 1)), `本棚の写真：${b.place} の候補を更新`, PB);
    await Shelf.putRaw(`${PH.dir}/${b.dir}/batch.json`, b64ofText(JSON.stringify(nb)), `本棚の写真：${b.place} を確認`, PB);
  } catch (e) { UI.toast("決めた内容を写真の束に残せませんでした：" + e.message, 6000); }
  return left;
}

// 国立国会図書館で書名と著者から本を探し、ISBNが分かれば書誌を取る
async function ndlFind(t, a) {
  try {
    const r = await fetch(`https://ndlsearch.ndl.go.jp/api/opensearch?title=${encodeURIComponent(t)}${a ? "&creator=" + encodeURIComponent(a.split(/[、,\s]/)[0]) : ""}&cnt=10&mediatype=1`);
    const x = new DOMParser().parseFromString(await r.text(), "application/xml");
    const k = Lib.sameKey(t);
    for (const it of x.getElementsByTagName("item")) {
      const title = it.getElementsByTagName("dc:title")[0]?.textContent || it.getElementsByTagName("title")[0]?.textContent || "";
      const isbn = [...it.getElementsByTagName("dc:identifier")].map(e => Biblio.normIsbn(e.textContent)).find(Boolean);
      if (isbn && Lib.sameKey(title) === k) return await Biblio.lookup(isbn).then(b => b ? { ...b, isbn } : null);
    }
  } catch {}
  return null;
}

async function phRegister() {
  const b = PHC.batch, place = b.place;
  const todo = PHC.items.filter(isOn), skip = PHC.items.filter(isSkip);
  if (!todo.length && !skip.length) { UI.toast("決めた本がありません"); return; }
  $("phReg").disabled = true;
  // 持っていない本は、先に書誌を探す（電波を使うので、書き込みの前に）
  const fresh = todo.filter(c => !c.m.owned);
  for (let i = 0; i < fresh.length; i++) { $("phRegMsg").textContent = `書誌を探しています（${i + 1}/${fresh.length}）…`; fresh[i].bib = await ndlFind(fresh[i].vol != null ? `${fresh[i].t} ${fresh[i].vol}` : fresh[i].t, fresh[i].a) || await ndlFind(fresh[i].t, fresh[i].a); }
  $("phRegMsg").textContent = "登録しています…";
  let moved = 0, added = 0, vols = 0;
  const at = new Date().toISOString();
  if (todo.length) {
    Lib.batchBegin();
    try {
      for (const c of todo) {
        if (c.m.owned) {
          const x = JSON.parse(JSON.stringify(Lib.get(c.m.item.id)));
          if (x.media === "ebook") { x.eloc = x.eloc || x.loc; x.media = "both"; }
          x.loc = place; Lib.put(x); moved++;
          c.done = { at, how: "loc", id: x.id };
          continue;
        }
        const t = c.vol != null ? `${c.t} ${c.vol}` : c.t;
        // 見つかった書誌が別の種類（同じ書名の小説など）なら使わない
        const bcat = c.bib ? Biblio.catFromC(c.bib.ccode || "") : null;
        const bib = c.bib && (c.vol == null || /\d/.test(c.bib.t)) && (!c.cat || !bcat || bcat === c.cat) ? c.bib : null;
        const opt = { src: "photo", loc: place, media: "paper", seriesHint: c.vol != null, catHint: c.cat || undefined, bulk: true };
        const r = await Lib.register(bib ? { ...opt, isbn: bib.isbn, bib } : { ...opt, t, a: c.a, bib: { t, a: c.a } });
        let how = "new";
        if (r.status === "vol") { vols++; how = "vol"; } else if (r.status === "dup" || r.status === "voldup") { moved++; how = "loc"; } else added++;
        if ((r.status === "dup" || r.status === "voldup") && r.item.loc !== place && r.item.kind !== "series") { const x = JSON.parse(JSON.stringify(Lib.get(r.item.id))); x.loc = place; Lib.put(x); }
        c.done = { at, how, id: r.item.id };
      }
    } catch (e) { Lib.batchDiscard(); for (const c of todo) if (c.done?.at === at) c.done = null; $("phRegMsg").textContent = "登録できませんでした：" + e.message; phRegBtn(); return; }
    Lib.batchCommit();
  }
  // 登録しない本：記録には何も書かず、候補に「登録しない」の印だけを残す（あとで取り消せる）
  for (const c of skip) c.done = { at, how: "skip" };
  const result = [todo.length ? `新しく${added}冊・シリーズの巻${vols}冊・場所を入れた${moved}冊` : "", skip.length ? `登録しない${skip.length}冊` : ""].filter(Boolean).join("・");
  const left = await phSave(result);
  phRender();
  $("phRegMsg").textContent = `確定しました：${result}。${left ? `未確認は残り${left}冊です。` : "この棚の確認はすべて終わりました。"}${todo.length ? "上の帯が「保存済み」になるまで開いたままにしてください。" : ""}`;
  $("phRegMsg").scrollIntoView({ behavior: "smooth", block: "center" });
  await phLoad(); render("photos");
}

// 写真の置き場が大きくなったら、確認が終わった（登録済みの）棚の写真だけを消す。候補と登録済みの印は残す。
// 読み取り待ち・確認の途中の棚の写真は消さない。この端末に送り途中の写真があるときは行わない
async function phTidy() {
  if (PH.tidying || PH.uploading) return; PH.tidying = true;
  try {
    if ((await HELD.all().catch(() => [])).length) return;
    const files = await Shelf.branchFiles(PB); if (!files) return;
    const total = files.reduce((n, f) => n + f.size, 0);
    PH.photoBytes = total;
    if (total < PHOTO_LIMIT) return;
    const done = new Set(PH.batches.filter(b => b.status === "done").map(b => `${PH.dir}/${b.dir}/`));
    if (!done.size) return;
    const isDonePhoto = f => /\.jpe?g$/i.test(f.path) && [...done].some(d => f.path.startsWith(d));
    const n = await Shelf.branchReplace(PB, f => !isDonePhoto(f), `本棚の写真：確認が終わった棚の写真を片付け（${new Date().toISOString().slice(0, 10)}）`);
    if (n) UI.toast(`写真の置き場がいっぱいに近づいたので、確認が終わった棚の写真 ${n} 枚を片付けました`, 6000);
  } catch (e) { console.warn(e); }
  finally { PH.tidying = false; }
}

function renderPhotos() { phPlaces(); if (!PH.loaded) { PH.loaded = true; phLoad(); phHeldShow(); phRetry(); } }
