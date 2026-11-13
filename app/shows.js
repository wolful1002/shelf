// ドラマ・アニメの画面（2026-11-10）
// 記録は records/shows.json の {items:{番号: 作品}}。
// 作品：{id:"tv-TMDBの番号", tm, t（邦題）, ot（原題）, y（放送開始の年）, cat（ドラマ／アニメ）, img（ポスター）,
//        ss:[{n:シーズン, eps:話数, name, air:"YYYY-MM-DD"}]（TMDB。特別編のシーズン0は持たない）, status（放送中／終了など）,
//        next:{s, e, air}（次に放送される話。TMDB）, p:{sub, rent, buy, ads, ch, at}（国内の配信先。TMDB・JustWatch 由来）, info（TMDB の情報を取った日）,
//        w:{"シーズン":[観た話の番号]}, st（watching 観ている／want 観たい／done 観終わった／stop 中断）,
//        newS（新しく増えたシーズン。週1回の更新が付け、本人が確かめたら消す）, added, u,
//        wd:{"シーズン-話":"YYYY-MM-DD"}（観た日。押した話にだけ付く。まとめて付けた前の話には付けない）,
//        wh:{"シーズン":"観た場所"}（配信サービス・テレビ放送・手持ちのソフトなど。2026-11-14）}
"use strict";
const { $, esc } = UI;
UI.topbar("shows.html");
const P = "records/shows.json";
const today = () => UI.today();
let FILT = { st: "watching", cat: "", mine: false }, openId = null, mode = "upto", epDate = "";   // epDate：押した話に付ける観た日（空なら今日）

// ---------- TMDB ----------
const tmKey = () => Shelf.read("records/keys.json")?.tmdb || "";
async function tm(path, q = {}) {
  const k = tmKey(); if (!k) throw new Error("TMDB の鍵がありません（ホームの「外部サービスの鍵」で入れてください）");
  const u = new URL("https://api.themoviedb.org/3" + path);
  for (const [a, b] of Object.entries({ ...q, api_key: k })) u.searchParams.set(a, b);
  const r = await fetch(u); if (!r.ok) throw new Error("TMDB に問い合わせられませんでした（" + r.status + "）");
  return r.json();
}
// 配信サービスの名前（映画の画面・tools/tmdb_weekly.py と同じ読み替え）
const NAME = { "Amazon Prime Video": "Prime Video", "Amazon Prime Video with Ads": "Prime Video", "Amazon Video": "Prime Video", "U-NEXT": "U-NEXT", "HBO Max on U-Next": "U-NEXT", "Netflix": "Netflix", "Netflix Standard with Ads": "Netflix", "Netflix basic with Ads": "Netflix", "Disney Plus": "ディズニープラス", "Apple TV Store": "Apple TV", "Apple TV": "Apple TV", "Apple TV Plus": "Apple TV+", "WOWOW": "WOWOWオンデマンド", "WOWOW On Demand": "WOWOWオンデマンド", "dTV": "Lemino", "Lemino": "Lemino", "Rakuten TV": "楽天TV", "Google Play Movies": "Google Play", "Hulu": "Hulu", "FOD": "FOD", "ABEMA": "ABEMA", "Abema TV": "ABEMA", "TELASA": "TELASA", "DMM TV": "DMM TV", "dAnime Store": "dアニメストア", "Crunchyroll": "Crunchyroll" };
const nm = x => NAME[x] || x;
function provOf(wp) {
  const jp = wp?.results?.JP || {}; const u = xs => [...new Set(xs)];
  const p = { sub: u((jp.flatrate || []).filter(x => !/Channel/.test(x.provider_name)).map(x => nm(x.provider_name))), rent: u((jp.rent || []).map(x => nm(x.provider_name))), buy: u((jp.buy || []).map(x => nm(x.provider_name))), at: today() };
  const ads = u([...(jp.ads || []), ...(jp.free || [])].map(x => nm(x.provider_name))); if (ads.length) p.ads = ads;
  const ch = u((jp.flatrate || []).filter(x => /Channel/.test(x.provider_name)).map(x => x.provider_name.replace(" Amazon Channel", ""))); if (ch.length) p.ch = ch;
  return p;
}
async function fetchShow(id) {
  const d = await tm(`/tv/${id}`, { language: "ja-JP", append_to_response: "watch/providers" });
  const ST = { "Returning Series": "放送中", "Ended": "終了", "Canceled": "打ち切り", "In Production": "製作中", "Planned": "予定", "Pilot": "パイロット" };
  return {
    tm: d.id, t: d.name, ot: d.original_name, y: +(d.first_air_date || "").slice(0, 4) || null,
    cat: (d.genres || []).some(g => g.id === 16) ? "アニメ" : "ドラマ", img: d.poster_path || undefined,
    ss: (d.seasons || []).filter(s => s.season_number > 0).map(s => ({ n: s.season_number, eps: s.episode_count, name: s.name, air: s.air_date || undefined })),
    status: ST[d.status] || d.status || "", next: d.next_episode_to_air ? { s: d.next_episode_to_air.season_number, e: d.next_episode_to_air.episode_number, air: d.next_episode_to_air.air_date } : null,
    rt: (d.episode_run_time || [])[0] || d.last_episode_to_air?.runtime || d.next_episode_to_air?.runtime || undefined,
    p: provOf(d["watch/providers"]), info: today(),
  };
}

// ---------- 記録 ----------
const items = () => Shelf.read(P)?.items || {};
const put = it => { it.u = UI.nowIso(); Shelf.writeItem(P, it.id, it); return it; };
const mySvc = () => { const it = Shelf.read("records/services.json")?.items; return it ? Object.keys(it).filter(k => it[k]?.on) : ["Prime Video", "U-NEXT"]; };
// 放送済みの話数（次に放送される話より前まで。放送開始前のシーズンは0）
function aired(it, s) {
  if (s.air && s.air > today()) return 0;
  if (it.next && it.next.s === s.n) return Math.max(0, Math.min(s.eps, it.next.e - 1));
  if (it.next && it.next.s < s.n) return 0;
  return s.eps || 0;
}
const seen = (it, s, e) => (it.w?.[s] || []).includes(e);
function stats(it) {
  let all = 0, done = 0, next = null;
  for (const s of it.ss || []) {
    const a = aired(it, s); all += a;
    for (let e = 1; e <= a; e++) { if (seen(it, s.n, e)) done++; else if (!next) next = { s: s.n, e }; }
  }
  return { all, done, next };
}
function setEps(it, s, list) {
  it.w = it.w || {}; const v = [...new Set(list)].sort((a, b) => a - b); if (v.length) it.w[s] = v; else delete it.w[s];
  // 外した話の観た日は消す
  if (it.wd) { for (const k of Object.keys(it.wd)) { const [a, b] = k.split("-").map(Number); if (a === +s && !v.includes(b)) delete it.wd[k]; } if (!Object.keys(it.wd).length) delete it.wd; }
}
// 押した話に観た日を付ける（観た話になったときだけ）
function stampEp(it, s, e) { if (!it.w?.[s]?.includes(e)) return; it.wd = it.wd || {}; it.wd[`${s}-${e}`] = epDate || today(); }
// シーズンの観た日のはじめと終わり
function daysOf(it, s) { const ds = Object.entries(it.wd || {}).filter(([k]) => +k.split("-")[0] === +s).map(([, d]) => d).sort(); return ds.length ? [ds[0], ds[ds.length - 1]] : null; }
// 観た場所の候補：これまでに入れた場所・契約中のサービス・配信先・よく使うもの
function placeList(it) {
  const xs = new Set();
  for (const x of Object.values(items())) for (const v of Object.values(x.wh || {})) xs.add(v);
  for (const v of [...mySvc(), ...(it.p?.sub || []), "テレビ放送", "手持ちのソフト", "映画館"]) xs.add(v);
  return [...xs];
}
function upto(it, sn, en) {
  // そのシーズンのその話まで、それより前のシーズンはすべて観たことにする
  for (const s of it.ss || []) {
    if (s.n < sn) setEps(it, s.n, Array.from({ length: aired(it, s) || s.eps }, (_, i) => i + 1));
    else if (s.n === sn) setEps(it, s.n, Array.from({ length: en }, (_, i) => i + 1));
  }
}
function afterMark(it) {
  const st = stats(it);
  if (it.st === "want" && st.done) it.st = "watching";
  if (st.all && st.done >= st.all && it.status !== "放送中" && it.status !== "製作中" && it.st === "watching") it.st = "done";
}

// ---------- 画面 ----------
const vodTag = it => {
  const p = it.p; if (!p) return "";
  const mine = p.sub.filter(s => mySvc().includes(s));
  if (mine.length) return `<span class="vod mine">契約中で見放題 ${esc(mine.join("・"))}</span>`;
  if (p.sub.length) return `<span class="vod">見放題 ${esc(p.sub.slice(0, 2).join("・"))}${p.sub.length > 2 ? " ほか" : ""}</span>`;
  if (p.rent.length || p.buy.length) return `<span class="vod x">レンタル・購入のみ</span>`;
  return `<span class="vod x">国内の配信なし</span>`;
};
const ST_NM = { watching: "観ている", want: "観たい", done: "観終わった", stop: "中断" };
function rowHtml(it) {
  const s = stats(it), pct = s.all ? Math.round(s.done / s.all * 100) : 0;
  const nx = s.next ? `次に観る：<b>シーズン${s.next.s} 第${s.next.e}話</b>` : s.all ? (it.status === "放送中" ? "放送済みの話はすべて観ました" : "すべて観ました") : "放送前";
  const air = it.next ? `<span>次の放送 シーズン${it.next.s} 第${it.next.e}話（${esc(it.next.air || "日付未定")}）</span>` : "";
  const open = openId === it.id;
  return `<li data-id="${esc(it.id)}"><div class="li-wrap">
      ${it.img ? `<img class="poster" loading="lazy" alt="" src="https://image.tmdb.org/t/p/w154${esc(it.img)}">` : `<div class="poster"></div>`}
      <button type="button" class="open" data-open aria-expanded="${open}"><span class="t">${esc(it.t)}</span>
        <span class="m"><span>${esc(it.cat || "")}</span>${it.y ? `<span>${it.y}〜</span>` : ""}<span>${esc(it.status || "")}</span><span>全${(it.ss || []).length}シーズン</span>${it.newS ? `<span class="pill acc">新シーズン（シーズン${it.newS}）</span>` : ""}${vodTag(it)}</span>
        <span class="next">${nx}</span><span class="m">${air}</span>
        <span class="prog" title="${s.done}/${s.all}話"><i style="width:${pct}%"></i></span></button>
      <span class="small muted">${s.done}/${s.all}話<br>${ST_NM[it.st] || ""}</span>
    </div>${open ? detHtml(it) : ""}</li>`;
}
function detHtml(it) {
  const p = it.p || {}; const mine = new Set(mySvc());
  const S = a => a?.length ? a.map(x => mine.has(x) ? `<b>${esc(x)}</b>（契約中）` : esc(x)).join("、") : "なし";
  return `<div class="det">
    <div class="row">
      <div class="seg" role="group" aria-label="状況">${Object.entries(ST_NM).map(([k, n]) => `<button type="button" data-st="${k}" aria-pressed="${it.st === k}">${n}</button>`).join("")}</div>
      <div class="seg" role="group" aria-label="話の押し方"><button type="button" data-mode="upto" aria-pressed="${mode === "upto"}">ここまで観た</button><button type="button" data-mode="one" aria-pressed="${mode === "one"}">1話ずつ</button></div>
      ${it.newS ? `<button type="button" class="small" data-seen-new>新シーズンを確かめた</button>` : ""}
    </div>
    <p class="small muted">「ここまで観た」で話を押すと、その話までと前のシーズンをまとめて観たことにします。「1話ずつ」は押した話だけを付け外しします。押した話には観た日が付きます（まとめて付いた前の話には付けません）。</p>
    <div class="row"><label class="small">押した話の観た日 <input type="date" class="epDate" value="${esc(epDate)}" max="${today()}" aria-label="押した話の観た日（空なら今日）"></label><span class="small muted">空なら今日</span></div>
    <datalist id="whl-${esc(it.id)}">${placeList(it).map(v => `<option value="${esc(v)}">`).join("")}</datalist>
    ${(it.ss || []).map(s => {
      const a = aired(it, s), w = it.w?.[s.n] || [], ds = daysOf(it, s.n);
      return `<div class="season" data-s="${s.n}"><h3>シーズン${s.n}${s.name && !/^シーズン\s*\d+$|^Season \d+$/.test(s.name) ? `　${esc(s.name)}` : ""}<span class="small muted">${w.length}/${s.eps}話${s.air ? `・${esc(s.air.slice(0, 4))}年` : ""}${a < s.eps ? `・放送済み ${a}話` : ""}</span>
        <span class="row" style="gap:6px;margin-left:auto"><button type="button" class="small quiet" data-all="${s.n}">すべて観た</button><button type="button" class="small quiet" data-none="${s.n}">外す</button></span></h3>
        <div class="eps">${Array.from({ length: s.eps }, (_, i) => i + 1).map(e => { const d = it.wd?.[`${s.n}-${e}`]; return `<button type="button" data-e="${e}" class="${w.includes(e) ? "on" : ""}${e > a ? " fut" : ""}${d ? " dated" : ""}" aria-pressed="${w.includes(e)}" title="第${e}話${e > a ? "（放送前）" : ""}${d ? "・" + d + "に観た" : ""}">${e}</button>`; }).join("")}</div>
        <div class="row small"><label>観た場所 <input class="whIn" data-s="${s.n}" list="whl-${esc(it.id)}" value="${esc(it.wh?.[s.n] || "")}" placeholder="配信サービスなど" style="width:12em"></label>${ds ? `<span class="muted">観た日 ${ds[0]}${ds[1] !== ds[0] ? "〜" + ds[1] : ""}</span>` : ""}</div></div>`;
    }).join("")}
    ${window.Mine ? Mine.html(["show:" + it.id]) : ""}
    <dl class="small" style="display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:0">
      <dt class="muted">見放題</dt><dd style="margin:0">${S(p.sub)}</dd>${p.ads ? `<dt class="muted">広告つき無料</dt><dd style="margin:0">${esc(p.ads.join("、"))}</dd>` : ""}${p.ch ? `<dt class="muted">追加チャンネル</dt><dd style="margin:0">${esc(p.ch.join("、"))}</dd>` : ""}
      <dt class="muted">レンタル・購入</dt><dd style="margin:0">${esc([...new Set([...(p.rent || []), ...(p.buy || [])])].join("、") || "なし")}</dd>
      <dt class="muted">原題</dt><dd style="margin:0">${esc(it.ot || "")}</dd>
      <dt class="muted">情報</dt><dd style="margin:0">TMDB（${esc(it.info || "")}時点）　<a href="https://www.themoviedb.org/tv/${it.tm}/watch?locale=JP" target="_blank" rel="noopener">配信ページ</a>　<a href="https://www.justwatch.com/jp/%E6%A4%9C%E7%B4%A2?q=${encodeURIComponent(it.t)}" target="_blank" rel="noopener">JustWatch</a></dd>
    </dl>
    <div class="row"><a class="btn small quiet" href="work.html?s=${encodeURIComponent(it.id)}">作品のページ</a><button type="button" class="small" data-refresh>TMDBの情報を取り直す</button><span class="grow"></span><button type="button" class="small danger" data-del>この作品の記録を消す</button></div>
  </div>`;
}
function render() {
  const all = Object.values(items());
  const mine = new Set(mySvc());
  const xs = all.filter(it => (FILT.st === "all" || it.st === FILT.st) && (!FILT.cat || it.cat === FILT.cat) && (!FILT.mine || (it.p?.sub || []).some(s => mine.has(s))))
    .sort((a, b) => (b.newS ? 1 : 0) - (a.newS ? 1 : 0) || (b.u || "").localeCompare(a.u || ""));
  $("list").innerHTML = xs.map(rowHtml).join("") || `<li class="empty">${all.length ? "この条件の作品はありません" : "まだ作品がありません。上で探して足してください"}</li>`;
  $("cnt").textContent = `${xs.length}作品`;
  $("bigN").innerHTML = `${all.length}<small> 作品</small>`;
  $("bigSub").textContent = `観ている ${all.filter(x => x.st === "watching").length}・観たい ${all.filter(x => x.st === "want").length}`;
}

// ---------- 時間で選ぶ ----------
// 観ている・観たい作品のうち、放送済みの次の話がある作品を、空いている時間で観られる話数と一緒に出す（契約中のサービスで観られるものを先に）
function renderTime() {
  const mins = +$("tMin").value; if (!mins) { $("tList").innerHTML = ""; return; }
  const mine = new Set(mySvc());
  const xs = Object.values(items()).filter(it => it.st === "watching" || it.st === "want").map(it => ({ it, s: stats(it) })).filter(x => x.s.next)
    .map(x => ({ ...x, n: x.it.rt ? Math.floor(mins / x.it.rt) : null, ok: (x.it.p?.sub || []).filter(s => mine.has(s)) }))
    .filter(x => x.n === null || x.n >= 1)
    .sort((a, b) => (b.ok.length > 0) - (a.ok.length > 0) || (b.it.st === "watching") - (a.it.st === "watching") || (a.it.rt || 999) - (b.it.rt || 999));
  $("tList").innerHTML = xs.map(({ it, s, n, ok }) => `<li><div><div class="t">${esc(it.t)}</div><div class="m">
      <span>シーズン${s.next.s} 第${s.next.e}話から${n ? ` ${Math.min(n, s.all - s.done)}話` : ""}</span><span>${it.rt ? `1話 約${it.rt}分` : "1話の長さは不明"}</span>
      ${ok.length ? `<span class="vod mine">契約中で見放題 ${esc(ok.join("・"))}</span>` : (it.p?.sub || []).length ? `<span class="vod">見放題 ${esc(it.p.sub.slice(0, 2).join("・"))}</span>` : `<span class="vod x">契約中のサービスでは観られません</span>`}
      <span>${ST_NM[it.st]}</span></div></div><button type="button" class="small quiet" data-go="${esc(it.id)}">開く</button></li>`).join("") || `<li class="empty">この時間で観られる作品はありません</li>`;
}
$("tMin").onchange = renderTime;
function goShow(id) {
  const it = items()[id]; if (!it) return; openId = it.id; FILT.st = it.st;
  document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x.dataset.f === it.st)); render();
  document.querySelector(`#list li[data-id="${it.id}"]`)?.scrollIntoView({ block: "start" });
}
$("tList").addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) goShow(b.dataset.go); });
// #id=番号 で、その作品を開く（作品のページなどから）
const fromHash = () => { const m = location.hash.match(/^#id=(.+)$/); if (m) goShow(decodeURIComponent(m[1])); };
addEventListener("hashchange", fromHash);

// ---------- 操作 ----------
document.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { FILT.st = b.dataset.f; document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); });
document.querySelectorAll("[data-c]").forEach(b => b.onclick = () => { FILT.cat = b.dataset.c; document.querySelectorAll("[data-c]").forEach(x => x.setAttribute("aria-pressed", x === b)); render(); });
$("onlyMine").onchange = () => { FILT.mine = $("onlyMine").checked; render(); };
async function search() {
  const q = $("sq").value.trim(); if (!q) return;
  $("hits").innerHTML = `<li class="empty">探しています…</li>`;
  try {
    const r = await tm("/search/tv", { query: q, language: "ja-JP" });
    const have = items();
    $("hits").innerHTML = (r.results || []).slice(0, 10).map(x => `<li><div>${x.poster_path ? `<img class="poster" style="width:40px;height:60px" loading="lazy" alt="" src="https://image.tmdb.org/t/p/w92${esc(x.poster_path)}">` : ""}</div>
      <div><div class="t">${esc(x.name)}</div><div class="m"><span>${esc(x.original_name || "")}</span><span>${esc((x.first_air_date || "").slice(0, 4))}</span>${(x.genre_ids || []).includes(16) ? "<span>アニメ</span>" : ""}</div></div>
      ${have["tv-" + x.id] ? `<span class="pill ok">記録済み</span>` : `<div class="row"><button type="button" class="small" data-add="${x.id}" data-st="watching">観ている</button><button type="button" class="small quiet" data-add="${x.id}" data-st="want">観たい</button></div>`}</li>`).join("") || `<li class="empty">見つかりません。原題でも探せます</li>`;
  } catch (e) { $("hits").innerHTML = `<li class="empty">${esc(e.message)}</li>`; }
}
$("sqBtn").onclick = search;
$("sq").addEventListener("keydown", e => { if (e.key === "Enter") search(); });
$("hits").addEventListener("click", async e => {
  const b = e.target.closest("[data-add]"); if (!b) return;
  b.disabled = true; b.textContent = "足しています…";
  try {
    const info = await fetchShow(b.dataset.add);
    const it = put({ id: "tv-" + info.tm, ...info, w: {}, st: b.dataset.st, added: UI.nowIso() });
    UI.toast(`『${it.t}』を足しました`);
    openId = it.id; FILT.st = it.st; document.querySelectorAll("[data-f]").forEach(x => x.setAttribute("aria-pressed", x.dataset.f === it.st));
    $("hits").innerHTML = ""; $("sq").value = ""; render();
    document.querySelector(`#list li[data-id="${it.id}"]`)?.scrollIntoView({ block: "start" });
  } catch (err) { UI.toast(err.message); b.disabled = false; b.textContent = "もう一度"; }
});
// 押した話の観た日・シーズンの観た場所
$("list").addEventListener("change", e => {
  if (e.target.classList.contains("epDate")) { epDate = e.target.value || ""; return; }
  if (!e.target.classList.contains("whIn")) return;
  const li = e.target.closest("li[data-id]"); const it = JSON.parse(JSON.stringify(items()[li.dataset.id] || null)); if (!it) return;
  const s = e.target.dataset.s, v = e.target.value.trim();
  it.wh = it.wh || {}; if (v) it.wh[s] = v; else delete it.wh[s]; if (!Object.keys(it.wh).length) delete it.wh;
  put(it); UI.toast(v ? `シーズン${s}の観た場所を「${v}」にしました` : "観た場所を消しました");
});
$("list").addEventListener("click", async e => {
  const li = e.target.closest("li[data-id]"); if (!li) return;
  const it = JSON.parse(JSON.stringify(items()[li.dataset.id] || null)); if (!it) return;
  const redraw = () => { li.outerHTML = rowHtml(items()[it.id] || it); };
  if (e.target.closest("[data-open]")) { openId = openId === it.id ? null : it.id; redraw(); return; }
  const md = e.target.closest("[data-mode]"); if (md) { mode = md.dataset.mode; redraw(); return; }
  const st = e.target.closest("[data-st]"); if (st) { it.st = st.dataset.st; put(it); redraw(); return; }
  if (e.target.closest("[data-seen-new]")) { delete it.newS; put(it); redraw(); return; }
  const ep = e.target.closest("[data-e]");
  if (ep) {
    const sn = +ep.closest("[data-s]").dataset.s, en = +ep.dataset.e;
    if (mode === "upto") upto(it, sn, en);
    else { const w = it.w?.[sn] || []; setEps(it, sn, w.includes(en) ? w.filter(x => x !== en) : [...w, en]); }
    stampEp(it, sn, en); afterMark(it); put(it); redraw(); return;
  }
  const al = e.target.closest("[data-all]"); if (al) { const s = it.ss.find(x => x.n === +al.dataset.all); setEps(it, s.n, Array.from({ length: s.eps }, (_, i) => i + 1)); afterMark(it); put(it); redraw(); return; }
  const no = e.target.closest("[data-none]"); if (no) { setEps(it, +no.dataset.none, []); put(it); redraw(); return; }
  if (e.target.closest("[data-refresh]")) {
    try { const info = await fetchShow(it.tm); if ((info.ss || []).length > (it.ss || []).length) info.newS = info.ss[info.ss.length - 1].n; put({ ...it, ...info }); UI.toast("取り直しました"); redraw(); }
    catch (err) { UI.toast(err.message); }
    return;
  }
  if (e.target.closest("[data-del]")) { if (!confirm(`『${it.t}』の記録を消しますか？`)) return; Shelf.writeItem(P, it.id, null); openId = null; render(); }
});

(async () => {
  if (!Shelf.token()) { $("main").prepend(UI.keyCard()); return; }
  await Shelf.init({ need: ["records/shows.json", "records/keys.json", "records/services.json", "records/sns/links.json"] });
  render(); renderTime(); fromHash();
  Shelf.on(P, () => { render(); renderTime(); });
})();
