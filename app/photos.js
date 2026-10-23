// 本棚の写真からの一括登録
// 1. 棚（保管場所）を選んで写真を送る → 記録の保管場所の inbox/shelf/<束の番号>/ に写真と batch.json を置く
// 2. Claude が会話で写真を読み、背表紙の書名・著者を candidates.json に書く（「本棚の写真を読んで」と頼む）
// 3. この画面で候補を確かめ、まとめて登録する。持っている本は保管場所をその棚にし、持っていない本は新しく登録する
"use strict";
const PH = { dir: "inbox/shelf", files: [], batches: [], open: null, urls: new Map() };
const b64ofBlob = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
const b64ofText = s => { const b = new TextEncoder().encode(s); let x = ""; for (let i = 0; i < b.length; i += 0x8000) x += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(x); };

// 写真を縮める（長い辺 2800px・JPEG）。背表紙の小さな文字が読める大きさを残す
async function shrink(file) {
  const img = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, 2800 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return await new Promise(r => c.toBlob(r, "image/jpeg", 0.86));
}

function phPlaces() {
  const pl = Object.values(Lib.places());
  $("phPlace").innerHTML = `<option value="">（選んでください）</option>` + pl.map(n => `<option>${esc(n)}</option>`).join("") + `<option value="__new">新しい保管場所…</option>`;
}
$("phPlace").onchange = () => { $("phNewWrap").hidden = $("phPlace").value !== "__new"; phSync(); };
$("phNewPlace").oninput = phSync;
function phPlaceName() { return $("phPlace").value === "__new" ? $("phNewPlace").value.trim() : $("phPlace").value; }
function phSync() { $("phSend").disabled = !PH.files.length || !phPlaceName(); $("phSend").textContent = PH.files.length ? `${PH.files.length}枚を送る` : "送る"; }
function addFiles(list) {
  for (const f of list) PH.files.push({ f, url: URL.createObjectURL(f) });
  $("phThumbs").innerHTML = PH.files.map((x, i) => `<figure><img src="${x.url}" alt="${i + 1}枚目"><button type="button" class="small quiet" data-phdel="${i}">外す</button></figure>`).join("");
  phSync();
}
$("phCam").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
$("phPick").onchange = e => { addFiles(e.target.files); e.target.value = ""; };
$("phThumbs").onclick = e => { const b = e.target.closest("[data-phdel]"); if (!b) return; const x = PH.files.splice(+b.dataset.phdel, 1)[0]; URL.revokeObjectURL(x.url); addFiles([]); };

$("phSend").onclick = async () => {
  const place = phPlaceName(); if (!place || !PH.files.length) return;
  if ($("phPlace").value === "__new") Lib.addPlace(place);
  const id = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-") + "-" + Math.random().toString(36).slice(2, 5);
  const base = `${PH.dir}/${id}`;
  $("phSend").disabled = true;
  const names = [];
  try {
    for (let i = 0; i < PH.files.length; i++) {
      $("phMsg").textContent = `送っています（${i + 1}/${PH.files.length}）…`;
      const blob = await shrink(PH.files[i].f);
      const name = `${i + 1}.jpg`;
      await Shelf.putRaw(`${base}/${name}`, await b64ofBlob(blob), `本棚の写真：${place}（${i + 1}枚目）`);
      names.push(name);
    }
    const batch = { id, place, at: new Date().toISOString(), device: Shelf.deviceName(), photos: names, status: "new" };
    await Shelf.putRaw(`${base}/batch.json`, b64ofText(JSON.stringify(batch)), `本棚の写真：${place}（${names.length}枚）`);
    PH.files.forEach(x => URL.revokeObjectURL(x.url)); PH.files = []; addFiles([]);
    $("phMsg").textContent = `送りました。Claude に「本棚の写真を読んで」と伝えてください。`;
    phLoad();
  } catch (e) { $("phMsg").textContent = "送れませんでした：" + e.message + (names.length ? `（${names.length}枚は届いています）` : ""); phSync(); }
};

// ---------- 束の一覧 ----------
const ST = { new: ["warn", "読み取り待ち"], read: ["acc", "候補あり・確かめてください"], part: ["acc", "一部を登録済み"], done: ["ok", "登録済み"] };
async function phLoad() {
  $("phBatches").innerHTML = `<li class="empty">読み込んでいます…</li>`;
  try {
    const dirs = (await Shelf.listRemote(PH.dir)).filter(x => x.type === "dir").map(x => x.name).sort().reverse();
    PH.batches = (await Promise.all(dirs.map(async d => {
      const b = await Shelf.readRemote(`${PH.dir}/${d}/batch.json`).catch(() => null);
      return b ? { ...b, dir: d } : null;
    }))).filter(Boolean);
  } catch (e) { $("phBatches").innerHTML = `<li class="empty">読み込めませんでした：${esc(e.message)}</li>`; return; }
  $("phBatches").innerHTML = PH.batches.map(b => `<li><div><div class="t">${esc(b.place)}</div><div class="m"><span>${esc(b.at.slice(0, 16).replace("T", " "))}</span><span>${b.photos.length}枚</span><span class="pill ${ST[b.status]?.[0] || ""}">${esc(ST[b.status]?.[1] || b.status)}</span>${b.result ? `<span>${esc(b.result)}</span>` : ""}</div></div>${b.status === "read" || b.status === "part" ? `<button type="button" class="small pri" data-phopen="${esc(b.dir)}">確かめる</button>` : b.status === "done" ? `<button type="button" class="small quiet" data-phopen="${esc(b.dir)}">見る・直す</button>` : ""}</li>`).join("") || `<li class="empty">まだ送った写真はありません</li>`;
  const waiting = PH.batches.filter(b => b.status === "new").length;
  $("phHint").hidden = !waiting;
  $("phHint").textContent = `読み取り待ちが ${waiting} 束あります。Claude との会話で「本棚の写真を読んで」と頼むと、書名の候補が作られます。`;
}
$("phReload").onclick = phLoad;
$("phBatches").onclick = e => { const b = e.target.closest("[data-phopen]"); if (b) phOpen(b.dataset.phopen); };

// ---------- 候補を確かめる ----------
async function photoUrl(path) {
  if (!PH.urls.has(path)) PH.urls.set(path, URL.createObjectURL(await Shelf.readRemoteBlob(path)));
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
let PHC = null;   // 開いている束：{ batch, items:[{...候補, on, move}] }
const isOn = c => !c.done && (c.m.owned ? c.move : c.on);
async function phOpen(dir) {
  const b = PH.batches.find(x => x.dir === dir); if (!b) return;
  const cand = await Shelf.readRemote(`${PH.dir}/${dir}/candidates.json`).catch(() => null);
  if (!cand) { UI.toast("候補がまだありません"); return; }
  PHC = { batch: b, cand, items: cand.items.map((c, i) => {
    const m = phMatch(c);
    // 以前の版で登録した束は、登録済みの印が無い。蔵書で持っている本は登録済みとみなす
    const done = c.done || (b.status !== "read" && m.owned ? { how: "had" } : null);
    return { ...c, i, m, done, on: !done && c.conf !== "low" && !m.cands, move: !m.item?.loc || m.item.loc !== b.place };
  }) };
  const photos = await Promise.all(b.photos.map(async p => [p, await photoUrl(`${PH.dir}/${dir}/${p}`)]));
  const byPhoto = new Map(b.photos.map(p => [p, []])); for (const c of PHC.items) (byPhoto.get(c.photo) || byPhoto.set(c.photo, []).get(c.photo)).push(c);
  $("phReview").innerHTML = `<div class="row"><h3 class="grow">${esc(b.place)}・候補 ${PHC.items.length}冊</h3><button type="button" class="pri" id="phReg">チェックした本を登録する</button><button type="button" class="quiet small" id="phClose">閉じる</button></div>
    <p class="small muted">持っている本は、チェックすると保管場所を「${esc(b.place)}」にします。持っていない本は、チェックすると新しく登録します。書名や巻数を直すと、その本にチェックが付きます。登録した本は「登録済み」になり、残りはあとからでも登録できます。</p>
    ${photos.map(([p, url]) => `<div class="phblock"><a href="${url}" target="_blank" rel="noopener"><img class="phimg" src="${url}" alt="${esc(p)}"></a>
      <ul class="list">${(byPhoto.get(p) || []).map(phRow).join("") || `<li class="empty">この写真からは読み取れませんでした</li>`}</ul></div>`).join("")}
    <details><summary>候補にない本を足す</summary><div class="grid2" style="margin-top:8px"><label class="f">書名<input type="text" id="phAddT"></label><label class="f">著者<input type="text" id="phAddA"></label></div><div class="row" style="margin-top:6px"><label class="f" style="display:inline-flex;align-items:center;gap:4px">巻<input type="text" id="phAddV" style="width:4.5em"></label><button type="button" class="small" id="phAddBtn">足す</button></div></details>
    <p class="small" id="phRegMsg"></p>`;
  $("phClose").onclick = () => { $("phReview").innerHTML = ""; PHC = null; };
  $("phReg").onclick = phRegister;
  $("phAddBtn").onclick = () => {
    const t = $("phAddT").value.trim(); if (!t) return;
    const v = $("phAddV").value.trim();
    const c = { photo: b.photos[b.photos.length - 1], t, a: $("phAddA").value.trim(), vol: v || null, cat: null, conf: "high", note: "手で足した", added: true, i: PHC.items.length };
    c.m = phMatch(c); c.on = true; c.move = true; PHC.items.push(c);
    $("phReview").querySelectorAll(".phblock .list")[b.photos.length - 1].insertAdjacentHTML("beforeend", phRow(c));
    $("phAddT").value = ""; $("phAddA").value = ""; $("phAddV").value = ""; phRegBtn();
  };
  phRegBtn();
  $("phReview").scrollIntoView({ behavior: "smooth" });
}
function phRegBtn() { const n = PHC.items.filter(isOn).length; $("phReg").disabled = !n; $("phReg").textContent = n ? `チェックした${n}冊を登録する` : "チェックした本を登録する"; }
const HOW = { vol: "シリーズの巻として登録済み", new: "新しく登録済み", loc: "保管場所を入れました", had: "登録済み" };
function phStatus(c) {
  const m = c.m;
  if (c.done) return `<span class="pill ok">${HOW[c.done.how] || "登録済み"}</span>`;
  const st = m.owned ? `<span class="pill ok">持っています${m.item.loc ? "・" + esc(m.item.loc) : ""}</span>` : m.want ? `<span class="pill acc">読みたい本に入っています</span>` : m.cands ? `<span class="pill warn">同じ書名の本が複数あります</span>` : m.series ? `<span class="pill">シリーズ『${esc(m.item.t)}』のこの巻は未所持</span>` : `<span class="pill">新しく登録</span>`;
  return st + (c.fixed ? `<span class="pill acc">直しました</span>` : c.conf === "low" ? `<span class="pill warn">読み取りに自信なし</span>` : "");
}
function phRow(c) {
  const d = c.done ? " disabled" : "";
  return `<li data-phc="${c.i}"><div class="grow"><div class="grid2"><label class="f">書名<input type="text" data-k="t" value="${esc(c.t)}"${d}></label><label class="f">著者<input type="text" data-k="a" value="${esc(c.a || "")}"${d}></label></div>
    <div class="m"><label class="f" style="display:inline-flex;align-items:center;gap:4px">巻<input type="text" data-k="vol" value="${esc(c.vol ?? "")}" style="width:4.5em"${d}></label><span class="phst">${phStatus(c)}</span>${c.note && !c.done ? `<span class="small muted">${esc(c.note)}</span>` : ""}</div></div>
    ${c.done ? "" : `<label class="row" style="gap:6px;white-space:nowrap"><input type="checkbox" data-k="on"${isOn(c) ? " checked" : ""}> <span class="phlbl">${c.m.owned ? "保管場所をこの棚にする" : "登録する"}</span></label>`}</li>`;
}
$("phReview").addEventListener("input", e => {
  const li = e.target.closest("[data-phc]"); if (!li || !PHC) return;
  const c = PHC.items[+li.dataset.phc], k = e.target.dataset.k; if (!k || c.done) return;
  if (k === "on") { if (c.m.owned) c.move = e.target.checked; else c.on = e.target.checked; phRegBtn(); return; }
  c[k] = k === "vol" ? (e.target.value.trim() === "" ? null : e.target.value.trim()) : e.target.value;
  c.fixed = true;
});
$("phReview").addEventListener("change", e => {
  const li = e.target.closest("[data-phc]"); if (!li || !PHC || e.target.dataset.k === "on") return;
  // 書名・著者・巻を直したら、蔵書との照合をやり直し、その本にチェックを付ける（行は作り直さない。チェックの操作が消えないように）
  const c = PHC.items[+li.dataset.phc]; if (c.done) return;
  c.m = phMatch(c);
  if (c.m.owned) c.move = true; else c.on = true;
  li.querySelector(".phst").innerHTML = phStatus(c);
  li.querySelector(".phlbl").textContent = c.m.owned ? "保管場所をこの棚にする" : "登録する";
  li.querySelector('[data-k="on"]').checked = true;
  phRegBtn();
});

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
  const todo = PHC.items.filter(isOn);
  if (!todo.length) { UI.toast("チェックした本がありません"); return; }
  $("phReg").disabled = true;
  // 持っていない本は、先に書誌を探す（電波を使うので、書き込みの前に）
  const fresh = todo.filter(c => !c.m.owned);
  for (let i = 0; i < fresh.length; i++) { $("phRegMsg").textContent = `書誌を探しています（${i + 1}/${fresh.length}）…`; fresh[i].bib = await ndlFind(fresh[i].vol != null ? `${fresh[i].t} ${fresh[i].vol}` : fresh[i].t, fresh[i].a) || await ndlFind(fresh[i].t, fresh[i].a); }
  $("phRegMsg").textContent = "登録しています…";
  let moved = 0, added = 0, vols = 0;
  const at = new Date().toISOString();
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
  const result = `新しく${added}冊・シリーズの巻${vols}冊・場所を入れた${moved}冊`;
  // 直した書名・巻数と、登録済みの印を候補のファイルに残す（次に開いたときも直した内容で出る）
  const keep = ["photo", "pos", "t", "a", "vol", "label", "cat", "conf", "note", "fixed", "added", "done"];
  const cand = { ...PHC.cand, items: PHC.items.map(c => Object.fromEntries(keep.filter(k => c[k] !== undefined && c[k] !== null && c[k] !== false).map(k => [k, c[k]]))) };
  const left = PHC.items.filter(c => !c.done).length;
  const nb = { ...b, status: left ? "part" : "done", doneAt: at, result: [b.result, result].filter(Boolean).join("／") };
  delete nb.dir;
  try {
    await Shelf.putRaw(`${PH.dir}/${b.dir}/candidates.json`, b64ofText(JSON.stringify(cand, null, 1)), `本棚の写真：${place} の候補を更新`);
    await Shelf.putRaw(`${PH.dir}/${b.dir}/batch.json`, b64ofText(JSON.stringify(nb)), `本棚の写真：${place} を登録`);
  } catch (e) { UI.toast("登録は済みましたが、写真の束に登録済みの印を付けられませんでした：" + e.message, 6000); }
  $("phRegMsg").textContent = `登録しました：${result}。${left ? `残り${left}冊は、あとからでも登録できます。` : ""}上の帯が「保存済み」になるまで開いたままにしてください。`;
  for (const c of todo) { const li = $("phReview").querySelector(`[data-phc="${c.i}"]`); if (li) li.outerHTML = phRow(c); }
  phRegBtn();
  await phLoad(); render("photos");
}

function renderPhotos() { phPlaces(); if (!PH.loaded) { PH.loaded = true; phLoad(); } }
