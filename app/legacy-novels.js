// 今のチェッカー（生涯読書リスト（自分用））の画面のプログラム。tools/build-legacy.py で取り出したもの。手直しは build-legacy.py の PATCHES にあるものだけ。

const DATA = window.__DATA__;;
const L = DATA.lists, ORDER = Object.keys(L), books = DATA.books;
const SHORT = {b1001:"1001",g26:"ガ26",tgb:"TGB",lemonde:"ルモ",bokk:"ノル",ml:"ML",time:"TIME",g15:"ガ15",bbcuk:"BBC英",g21:"ガ21",bigread:"BigR",maugham:"モーム",tgbjp:"TGB日",heisei:"平成",pbs:"PBS",nprsff:"NPR幻",lsf20:"LSF20",lsf21:"LSF21",lf20:"LF20",lf21:"LF21",sfmw:"SFM外",sfmj:"SFM内",cwa:"CWA",mwa:"MWA",nprthr:"NPRス",tozaiw:"東西外",tozaij:"東西内",nyt21:"NYT21",psf:"P-SF",fanbest:"幻100",hor200:"ホラー200",timef:"TIME幻",lf98:"LF98",hq:"HQ礎石",sfm25w:"SFM外25",sfm25j:"SFM内25",sfhon:"SF本雑",kmw20:"このミス外",kmj20:"このミス内",bdf101:"BDF101",lsf98:"LSF98",sfmall:"SFM総合"};
const CN = {GB:"イギリス",IE:"アイルランド",US:"アメリカ",CA:"カナダ",AU:"オーストラリア",NZ:"ニュージーランド",FR:"フランス",DE:"ドイツ",AT:"オーストリア",CH:"スイス",IT:"イタリア",ES:"スペイン",PT:"ポルトガル",RU:"ロシア",UA:"ウクライナ",PL:"ポーランド",CZ:"チェコ",HU:"ハンガリー",RO:"ルーマニア",BG:"ブルガリア",YU:"旧ユーゴスラビア",HR:"クロアチア",SI:"スロベニア",BA:"ボスニア",AL:"アルバニア",GR:"ギリシャ",TR:"トルコ",IL:"イスラエル",EG:"エジプト",SD:"スーダン",IR:"イラン",IN:"インド",PK:"パキスタン",CN:"中国",JP:"日本",KR:"韓国",VN:"ベトナム",NG:"ナイジェリア",KE:"ケニア",ZA:"南アフリカ",ZW:"ジンバブエ",SN:"セネガル",GN:"ギニア",LS:"レソト",ET:"エチオピア",CG:"コンゴ",AR:"アルゼンチン",MX:"メキシコ",CO:"コロンビア",PE:"ペルー",CL:"チリ",CU:"キューバ",UY:"ウルグアイ",BR:"ブラジル",TT:"トリニダード・トバゴ",GY:"ガイアナ",AG:"アンティグア",NL:"オランダ",BE:"ベルギー",SE:"スウェーデン",NO:"ノルウェー",DK:"デンマーク",FI:"フィンランド",IS:"アイスランド",EE:"エストニア",AM:"アルメニア",VE:"ベネズエラ",XA:"アラビア"};
const GN = {M:"ミステリー",SF:"SF",F:"ファンタジー",H:"ホラー"};
const KINDNM = {lit:"文学・名作",pop:"読者投票",genre:"ジャンル・国内専門"};
const TIERS = [
  {id:"s",nm:"最優先",rng:"50以上",min:50},{id:"a",nm:"必見",rng:"40–49",min:40},{id:"b",nm:"推奨",rng:"30–39",min:30},
  {id:"c",nm:"候補",rng:"20–29",min:20},{id:"d",nm:"その他",rng:"20未満",min:-1}];
const tierOf = sc => TIERS.find(t=>sc>=t.min).id;
const tierNm = id => TIERS.find(t=>t.id===id).nm;
const ERAS = [["~1699","1700年以前",-9999,1699],["1700","18世紀",1700,1799],["1800","19世紀",1800,1899],["1900","1900–1945年",1900,1945],["1946","1946–1979年",1946,1979],["1980","1980–1999年",1980,1999],["2000","2000年以降",2000,9999]];
const eraOf = y => ERAS.find(e=>y>=e[2]&&y<=e[3]);
books.forEach(b=>{ b.Es = new Set(b.E.map(i=>ORDER[i])) });
const elig = (b,k) => k in b.s || b.Es.has(k);
const byKey = new Map(books.map(b=>[b.k,b]));
const byAuthor = new Map(); books.forEach(b=>{ if(b.a==="作者不詳") return; if(!byAuthor.has(b.a)) byAuthor.set(b.a,[]); byAuthor.get(b.a).push(b) });
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const yr = y => y < 0 ? `前${-y}年頃` : y < 1500 ? `${y}年頃` : String(y);
const amzURL = b => "https://www.amazon.co.jp/s?i=stripbooks&k=" + encodeURIComponent(`${b.t.replace(/（.*?）/g, "")} ${b.a}`);
const trLabel = b => b.tr===2 ? `<span class="tag jp">日本語原作</span>` : b.tr===1 ? `<span class="tag">邦訳あり</span>` : `<span class="tag no-tr">邦訳なし</span>`;

let read = {}, want = {}, own = {};
let st = {tier:null,list:"",cty:"",era:"",tr:"",kd:"",gn:"",q:"",status:"all",sort:"score"};
let openKey = null;

// ---------- storage: one private doc per person in the artifact db; this device keeps a copy ----------
const LS = "lifetime-books-v1";
// read[k] is "YYYY-MM-DD" (the day it was read) or 1 (read, date unknown)
const isDate = v => typeof v==="string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const MIG = "undate-20261021";
// marks made on 2026-10-21 and dates from 2011 (bulk registration) become "read, no date"
function migrateRead(r, done){ let ch = false; for(const [k,v] of Object.entries(r)) if(isDate(v) && (v.startsWith("2011") || (!done && v==="2026-10-21"))){ r[k] = 1; ch = true } return ch }
function lsRead(){ try{ const o = JSON.parse(localStorage.getItem(LS)||"{}")||{}; const r = o.read||{}; migrateRead(r, o.mig===MIG); return {read:r, want:o.want||{}, own:o.own||{}} }catch(e){ return {read:{},want:{},own:{}} } }
function lsWrite(){ try{ localStorage.setItem(LS, JSON.stringify({read,want,own,mig:MIG})) }catch(e){} }
let docRef = null, writing = false, dirty = false, timer = null;
const setSync = h => { $("sync").innerHTML = h };
// snapshots from the store are frozen: always work on a deep copy
const plain = o => JSON.parse(JSON.stringify(o || {}));
const snapData = s => plain(s && s.exists ? s.data() : {});
async function initStore(){
  ({read, want, own} = lsRead()); lsWrite(); renderAll();
  setSync("この端末に保存");
  let db = null, user = null;
  try{ [db,user] = await Promise.all([window.claude?.use?.("db"), window.claude?.use?.("user")]) }catch(e){}
  if(!db || !user){ setSync("この端末に保存（サインインすると端末間で同期）"); return }
  let id = null;
  try{ id = await user.id() }catch(e){}
  if(!id){ setSync("この端末に保存（サインインすると端末間で同期）"); return }
  const col = db.collection("data/users/"+id);
  try{
    docRef = col.doc("books");
    const d = snapData(await docRef.get());
    const r0 = d.read||{}, w0 = d.want||{}, o0 = d.own||{};
    const migrated = migrateRead(r0, d.mig===MIG);
    const merged = {read:{...r0,...read}, want:{...w0,...want}, own:{...o0,...own}};
    const changed = Object.keys(merged.read).length !== Object.keys(r0).length || Object.keys(merged.want).length !== Object.keys(w0).length || Object.keys(merged.own).length !== Object.keys(o0).length;
    read = merged.read; want = merged.want; own = merged.own; lsWrite(); renderAll();
    setSync("<b>●</b> アカウントに保存・端末間で同期");
    if(changed || migrated || d.mig!==MIG) schedule();
    docRef.onSnapshot(s=>{
      if(writing || dirty || s.metadata?.hasPendingWrites) return;
      const x = snapData(s); migrateRead(x.read||{}, x.mig===MIG);
      if(JSON.stringify([x.read||{}, x.want||{}, x.own||{}]) === JSON.stringify([read, want, own])) return;
      read = x.read||{}; want = x.want||{}; own = x.own||{}; lsWrite(); renderAll(); renderLogSum();
    }, ()=>{});
  }catch(e){ setSync("この端末に保存（同期は一時的に使えません）"); return }
  try{
    cRef = col.doc("custom");
    const rc = cNorm(snapData(await cRef.get()));
    const mc = cMerge(rc, custom);
    const cChanged = JSON.stringify(cSig(mc)) !== JSON.stringify(cSig(rc));
    custom = mc; cWrite(); refreshAll();
    if(cChanged) cSchedule();
    cRef.onSnapshot(s=>{
      if(cWriting || cDirty || s.metadata?.hasPendingWrites) return;
      const x = cNorm(snapData(s));
      if(JSON.stringify(cSig(x)) === JSON.stringify(cSig(custom))) return;
      custom = x; cWrite(); refreshAll();
    }, ()=>{});
  }catch(e){ setSync("追加リストを同期できませんでした。この端末には残っています") }
  try{
    lCol = col;
    lRef = col.doc("log");
    const meta0 = snapData(await lRef.get());
    const rl = await lLoad(meta0);
    if(Array.isArray(meta0.items) && meta0.items.length) lItemsDirty = true;  // older single-document format: move items into chunks
    const ml = lMerge(rl, blog);
    const lChanged = ml.items.length !== rl.items.length || Object.keys(ml.applied).length !== Object.keys(rl.applied).length || Object.keys(ml.reject).length !== Object.keys(rl.reject).length;
    if(ml.items.length !== rl.items.length || JSON.stringify(ml.items.map(packItem)) !== JSON.stringify(rl.items.map(packItem))) lItemsDirty = true;
    blog = ml; lWrite(); if(lChanged || lItemsDirty) lSchedule();
    const nNew = autoApply(); renderAll(); renderLog();
    if(nNew) $("logMsg").textContent = `読書記録から新たに${nNew}作品に読了の印を付けました。`;
    lRef.onSnapshot(async s=>{
      if(lWriting || lDirty || s.metadata?.hasPendingWrites) return;
      const meta = snapData(s);
      if((meta.iv||"") === (blog.iv||"") && JSON.stringify([meta.applied||{}, meta.reject||{}]) === JSON.stringify([blog.applied, blog.reject])) return;
      blog = await lLoad(meta); lWrite(); if(autoApply()) renderAll(); renderLog();
    }, ()=>{});
  }catch(e){ console.error("logsync", e); setSync("読書記録を同期できませんでした。この端末には残っています") }
  // bibliographic corrections written by the daily update task (shared, not per person)
  try{
    const metaRef = db.doc("biblio/meta");
    await loadBiblio(db, snapData(await metaRef.get()));
    metaRef.onSnapshot(s=>{ const m = snapData(s); if((m.ver||"") !== bibMeta.ver) loadBiblio(db, m) }, ()=>{});
  }catch(e){ console.error("biblio", e) }
}
let bibMeta = {ver:"", n:0, last:""};
async function loadBiblio(db, meta){
  const fix = {};
  for(const name of (Array.isArray(meta.fixDocs) ? meta.fixDocs : [])){
    const d = snapData(await db.doc("biblio/" + name).get());
    Object.assign(fix, d.items || {});
  }
  let n = 0;
  for(const b of books){
    if(!b.orig) b.orig = {jp:b.jp, jy:b.jy, jb:b.jb, tr:b.tr, jv:b.jv};
    Object.assign(b, b.orig); delete b.jvd; delete b.jn; delete b.js;
    const o = fix[b.k]; if(!o) continue;
    for(const f of ["jp","jy","jb","tr"]) if(f in o) b[f] = o[f] === "" ? undefined : o[f];
    if(o.v){ b.jv = 1; b.jvd = o.v } if(o.n) b.jn = o.n; if(o.s) b.js = o.s;
    n++;
  }
  bibMeta = {ver:meta.ver||"", n, last:meta.last||"", checked:Object.keys(meta.checked||{}).length};
  renderAll(); renderBibInfo();
}
function renderBibInfo(){
  const el = $("bibInfo"); if(!el) return;
  el.textContent = bibMeta.last ? `書誌情報の自動更新：最終 ${bibMeta.last}・確認済み ${bibMeta.checked}作（修正・確認を反映 ${bibMeta.n}作）。毎日、優先度の高い作品から順にWebで確かめています。` : "";
}
function schedule(){ dirty = true; clearTimeout(timer); timer = setTimeout(flush, 700) }
async function flush(){
  if(!docRef){ dirty = false; return }
  if(writing){ schedule(); return }
  writing = true; dirty = false;
  try{ await docRef.set({read, want, own, mig:MIG, updated:new Date().toISOString()}) }
  catch(e){ setSync("保存できませんでした。この端末には残っています") }
  writing = false; if(dirty) schedule();
}
let cRef = null, cWriting = false, cDirty = false, cTimer = null;
function cSchedule(){ cDirty = true; clearTimeout(cTimer); cTimer = setTimeout(cFlush, 700) }
async function cFlush(){
  if(!cRef){ cDirty = false; return }
  if(cWriting){ cSchedule(); return }
  cWriting = true; cDirty = false;
  try{ await cRef.set({lists:custom.lists, books:custom.books, del:custom.del, updated:new Date().toISOString()}) }
  catch(e){ setSync("追加リストを保存できませんでした。この端末には残っています") }
  cWriting = false; if(cDirty) cSchedule();
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` };
function setRead(k, v){ read[k] = v; delete want[k]; lsWrite(); schedule(); afterRead(k) }
function unread(k){ delete read[k]; lsWrite(); schedule(); afterRead(k) }
function afterRead(k){
  closeRdPop(); refreshRow(k); renderSummary();
  if(st.status!=="all") renderList();
  if(pickKey===k) pickKey = null;
  renderPick(); renderLogSum();
}
const readLabel = v => isDate(v) ? v : "読了（日付なし）";
// the small panel that asks "read today" or "read earlier (date)"
let rdKey = null, rdOpener = null;
function openRdPop(k, el){
  const b = byKey.get(k); if(!b) return;
  rdKey = k; rdOpener = el;
  const v = read[k], pop = $("rdPop");
  pop.innerHTML = `<div class="rp-t">${esc(b.t)}</div>
    ${v ? `<div class="rp-s">いまの記録：${isDate(v) ? v + " に読了" : "読了（日付なし）"}</div>` : ""}
    <button class="btn pri" data-rp="today">今日読んだ（${today()}）</button>
    <div class="rp-d"><span>以前に読んだ</span><input type="date" id="rpDate" max="${today()}" value="${isDate(v) ? v : ""}" aria-label="読んだ日"><button class="btn" data-rp="past">${v ? "この日付で保存" : "記録する"}</button></div>
    <p class="rp-n">日付がわからなければ空欄のまま記録できます（日付なし）。</p>
    <p class="rp-e" id="rpErr" role="alert"></p>
    <div class="rp-f">${v ? `<button class="btn" data-rp="unread">未読に戻す</button>` : ""}<button class="btn" data-rp="close">閉じる</button></div>`;
  pop.hidden = false;
  const r = el.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  const left = Math.max(8, Math.min(window.scrollX + r.left, window.scrollX + document.documentElement.clientWidth - w - 8));
  const below = r.bottom + 6 + h < window.innerHeight || r.top < h + 6;
  pop.style.left = left + "px";
  pop.style.top = (window.scrollY + (below ? r.bottom + 6 : r.top - h - 6)) + "px";
  pop.querySelector('[data-rp="today"]').focus({preventScroll:true});
}
function closeRdPop(){ const pop = $("rdPop"); if(pop.hidden) return; pop.hidden = true; rdKey = null; rdOpener?.focus?.({preventScroll:true}); rdOpener = null }
function onRdPop(e){
  const a = e.target.closest("[data-rp]")?.dataset.rp; if(!a || !rdKey) return;
  const k = rdKey;
  if(a==="today") setRead(k, today());
  else if(a==="past"){
    const d = $("rpDate").value;
    if(d && !isDate(d)){ $("rpErr").textContent = "日付を正しく入れてください。"; return }
    if(d && d > today()){ $("rpErr").textContent = "未来の日付は入れられません。"; return }
    setRead(k, d || 1);
  }
  else if(a==="unread") unread(k);
  else closeRdPop();
}
function toggleOwn(k){ if(own[k]) delete own[k]; else own[k] = 1; lsWrite(); schedule() }
function toggleWant(k){ if(want[k]) delete want[k]; else want[k] = 1; lsWrite(); schedule() }

// ---------- filters ----------
function buildControls(){
  const cc = {}; books.forEach(b=>cc[b.c]=(cc[b.c]||0)+1);
  const ctyOpts = Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<option value="${c}">${CN[c]||c}（${n}）</option>`).join("");
  $("cty").innerHTML = `<option value="">国：すべて</option>` + ctyOpts;
  $("pCty").innerHTML = `<option value="">国：すべて</option>` + ctyOpts;
  $("era").innerHTML = `<option value="">時代：すべて</option>` + ERAS.map(e=>`<option value="${e[0]}">${e[1]}</option>`).join("");
  $("pTier").innerHTML = `<option value="">優先度：すべて</option>` + TIERS.map(t=>`<option value="${t.id}">${t.nm}</option>`).join("");
  $("q").addEventListener("input", e=>{ st.q = e.target.value.trim().toLowerCase(); renderList(true) });
  for(const [id,key] of [["list","list"],["cty","cty"],["era","era"],["tr","tr"],["kd","kd"],["gn","gn"],["sort","sort"]])
    $(id).addEventListener("change", e=>{ st[key] = e.target.value; if(key==="sort"){ viewStack.length = 0; updateBack() } renderList(true) });
  const segs = [["fAll","all"],["fTodo","todo"],["fWant","want"],["fDone","done"],["fOwn","own"],["fTsun","tsundoku"]];
  for(const [id,v] of segs) $(id).addEventListener("click", ()=>{
    st.status = v; segs.forEach(([b])=>$(b).setAttribute("aria-pressed", b===id)); renderList(true) });
  $("tiers").addEventListener("click", e=>{
    const b = e.target.closest(".tier"); if(!b) return;
    st.tier = st.tier===b.dataset.t ? null : b.dataset.t; renderSummary(); renderList(true) });
  $("list-ol").addEventListener("click", e=>{ if(e.target.id==="moreBtn") return showMore(); onListClick(e) });
  $("backBtn").addEventListener("click", popView);
  $("rdPop").addEventListener("click", onRdPop);
  document.addEventListener("mousedown", e=>{ if(!$("rdPop").hidden && !e.target.closest("#rdPop") && !e.target.closest(".chk,[data-rd],[data-a=read]")) closeRdPop() });
  document.addEventListener("keydown", e=>{ if(e.key==="Escape" && !$("rdPop").hidden){ e.stopImmediatePropagation(); closeRdPop() } }, true);
  document.addEventListener("keydown", e=>{ if(e.key==="Escape" && viewStack.length && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName||"")) popView() });
  for(const id of ["pTier","pCty","pGn","pTr","pWant"]) $(id).addEventListener("change", ()=>{ pickKey = null; renderPick() });
  $("pickCard").addEventListener("click", onPickClick);
  $("statsBox").addEventListener("toggle", ()=>{ if($("statsBox").open) renderStats() });
  $("bkOut").addEventListener("click", ()=>{ $("bkText").value = exportText(); $("bkMsg").textContent = `読了${Object.keys(read).length}冊・読みたい${Object.keys(want).length}冊・所有${Object.keys(own).length}冊・追加リスト${custom.lists.length}本を書き出しました。` });
  $("bkCopy").addEventListener("click", ()=>{
    const t = $("bkText"); if(!t.value) t.value = exportText();
    navigator.clipboard?.writeText(t.value).then(()=>{ $("bkMsg").textContent = "コピーしました。" }, ()=>{ t.select(); $("bkMsg").textContent = "選択しました。手動でコピーしてください。" });
  });
  $("bkIn").addEventListener("click", ()=>{
    try{
      const o = JSON.parse($("bkText").value);
      let nl = 0;
      if(o.log && Array.isArray(o.log.items)){ blog = lMerge(blog, lNorm(o.log)); lItemsDirty = true; lWrite(); lSchedule() }
      if(o.custom){ const c0 = custom.lists.length; custom = cMerge(custom, cNorm(o.custom)); nl = custom.lists.length - c0; cWrite(); cSchedule(); refreshAll() }
      const r = Object.fromEntries(Object.entries(o.read||{}).filter(([k])=>byKey.has(k)));
      const w = Object.fromEntries(Object.entries(o.want||{}).filter(([k])=>byKey.has(k)));
      const ow = Object.fromEntries(Object.entries(o.own||{}).filter(([k])=>byKey.has(k)));
      read = {...read, ...r}; want = {...want, ...w}; own = {...own, ...ow}; Object.keys(read).forEach(k=>delete want[k]);
      lsWrite(); schedule(); renderAll();
      $("bkMsg").textContent = `読了${Object.keys(r).length}冊・読みたい${Object.keys(w).length}冊・所有${Object.keys(ow).length}冊${o.custom?`・追加リスト（新規${nl}本）`:""}を読み込みました（今の記録に追加）。`;
    }catch(e){ $("bkMsg").textContent = "読み込めませんでした。書き出した文字列をそのまま貼り付けてください。" }
  });
}

function matches(b){
  if(st.tier && tierOf(b.sc)!==st.tier) return false;
  if(st.list && !(st.list in b.s)) return false;
  if(st.cty && b.c!==st.cty) return false;
  if(st.era && eraOf(b.y)[0]!==st.era) return false;
  if(st.kd && b.kd!==st.kd) return false;
  if(st.gn==="none" && b.g.length) return false;
  if(st.gn && st.gn!=="none" && !b.g.includes(st.gn)) return false;
  if(st.tr==="ja" && b.tr===0) return false;
  if(st.tr==="none" && b.tr!==0) return false;
  if(st.status==="todo" && read[b.k]) return false;
  if(st.status==="done" && !read[b.k]) return false;
  if(st.status==="want" && (!want[b.k] || read[b.k])) return false;
  if(st.status==="own" && !own[b.k]) return false;
  if(st.status==="tsundoku" && (!own[b.k] || read[b.k])) return false;
  if(st.q){ const q = st.q; if(!(b.t.toLowerCase().includes(q) || b.o.toLowerCase().includes(q) || b.a.toLowerCase().includes(q) || String(b.y).includes(q))) return false }
  return true;
}
const decOf = y => y < 1500 ? "1500年以前" : y < 1800 ? `${Math.floor(y/100)+1}世紀` : `${Math.floor(y/10)*10}年代`;
const decKey = y => y < 1500 ? 1400 : y < 1800 ? Math.floor(y/100)*100 : Math.floor(y/10)*10;
const cName = c => CN[c]||c;
const tyOf = b => b.tr===2 ? "日本語原作" : b.jy ? `${Math.floor(b.jy/10)*10}年代に邦訳` : b.tr===1 ? "邦訳あり（刊行年不明）" : "邦訳なし";
const tyKey = b => b.tr===2 ? 9998 : b.jy ? Math.floor(b.jy/10)*10 : b.tr===1 ? 9997 : 9999;
// grouped sorts: how to label each group
// publisher of the main edition, with labels folded into the company that publishes them
const PUB_MAP = [
  [/^(新潮|新潮文庫|新潮クレスト)/, "新潮社"], [/^(ハヤカワ|早川)/, "早川書房"], [/^(創元|東京創元)/, "東京創元社"],
  [/^岩波/, "岩波書店"], [/^光文社|^カッパ・ノベルス/, "光文社"], [/^(角川|KADOKAWA|カドカワ|メディアワークス|電撃)/, "KADOKAWA"],
  [/^河出/, "河出書房新社"], [/^集英社/, "集英社"], [/^講談社|^大日本雄弁会講談社/, "講談社"], [/^(文春|文藝春秋)/, "文藝春秋"],
  [/^(ちくま|筑摩)/, "筑摩書房"], [/^(中公|中央公論)/, "中央公論新社"], [/^白水/, "白水社"], [/^国書刊行会/, "国書刊行会"],
  [/^みすず/, "みすず書房"], [/^評論社/, "評論社"], [/^扶桑社/, "扶桑社"], [/^幻冬舎/, "幻冬舎"], [/^小学館|^ガガガ/, "小学館"],
  [/^双葉/, "双葉社"], [/^徳間/, "徳間書店"], [/^ポプラ/, "ポプラ社"], [/^サンリオ/, "サンリオ"], [/^竹書房/, "竹書房"],
  [/^ハルキ|^角川春樹/, "角川春樹事務所"], [/^ミステリアス・プレス/, "早川書房"], [/^二見/, "二見書房"], [/^SB/, "SBクリエイティブ"], [/^ランダムハウス講談社/, "ランダムハウス講談社"], [/^ヴィレッジ/, "ヴィレッジブックス"], [/^宝島/, "宝島社"], [/^東都書房/, "東都書房"],
];
function pubOf(b){
  let s = (b.tr===2 ? (b.jb || b.jp || "") : b.tr===1 ? (b.jp || "") : "").normalize("NFKC");
  s = s.split("/")[0].trim();
  const m = s.match(/^(.+?文庫)・/); if(m) s = m[1];
  s = s.replace(/[（(『].*$/, "").trim();
  if(!s) return b.tr===0 ? "邦訳なし" : "版元未確認";
  for(const [re, name] of PUB_MAP) if(re.test(s)) return name;
  return s.replace(/(文庫|ノベルス)$/, "").trim() || s;
}
const pubKey = b => { const p = pubOf(b); return p==="版元未確認" ? "\uffff1" : p==="邦訳なし" ? "\uffff2" : p };
const GROUP = {decade: b=>decOf(b.y), author: b=>b.a, country: b=>cName(b.c), tyear: tyOf, publisher: pubOf};
function filtered(){
  let out = books.filter(matches);
  if(st.sort==="year") out.sort((a,b)=>a.y-b.y || a.id-b.id);
  else if(st.sort==="yeard") out.sort((a,b)=>b.y-a.y || a.id-b.id);
  else if(st.sort==="decade") out.sort((a,b)=>decKey(a.y)-decKey(b.y) || a.id-b.id);
  else if(st.sort==="author") out.sort((a,b)=>a.a.localeCompare(b.a,"ja") || a.y-b.y);
  else if(st.sort==="country") out.sort((a,b)=>cName(a.c).localeCompare(cName(b.c),"ja") || a.id-b.id);
  else if(st.sort==="tyear") out.sort((a,b)=>tyKey(a)-tyKey(b) || (a.jy||0)-(b.jy||0) || a.id-b.id);
  else if(st.sort==="publisher") out.sort((a,b)=>pubKey(a).localeCompare(pubKey(b),"ja") || a.id-b.id);
  else if(st.list && L[st.list].ranked) out.sort((a,b)=>a.s[st.list]-b.s[st.list] || a.id-b.id);
  return out;
}

const CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M3 8.5l3.2 3L13 4.5"/></svg>`;
function strip(b){
  return ORDER.map(k=>{
    const on = k in b.s, el = on || b.Es.has(k);
    const tip = `${L[k].name}：${on ? (b.s[k] ? b.s[k]+"位" : "掲載") : el ? "未掲載" : "対象外"}`;
    return `<i class="${k==="b1001"?"base ":""}${on?"on":el?"el":""}${k==="bigread"||k==="nprsff"||k===firstMine()?" sep":""}" title="${esc(tip)}"></i>`;
  }).join("");
}
function rowHTML(b){
  const r = !!read[b.k], w = !!want[b.k];
  return `<li class="row${r?" done":""}" data-k="${b.k}">
    <div class="rh">
      <button class="chk" role="checkbox" aria-checked="${r}" aria-label="${esc(b.t)} を読了にする">${CHECK}</button>
      <span class="no">${b.id}</span>
      <div class="ttl"><a class="tl" href="https://www.google.com/search?q=${encodeURIComponent(`${b.t} ${b.a}`)}" target="_blank" rel="noopener">${esc(b.t)}</a>
        <div class="meta"><button class="lk" data-sort="author" title="著者順に並べる">${esc(b.a)}</button><button class="lk yr" data-sort="year" title="発表年順に並べる（もう一度で年代順）">${yr(b.y)}</button><button class="lk" data-sort="country" title="国順に並べる">${CN[b.c]||b.c}</button>${b.g.map(g=>`<span class="tag gn">${GN[g]}</span>`).join("")}${b.tr===2 ? trLabel(b) + (b.jp ? `<button class="lk pubj" data-sort="publisher" title="出版社順に並べる（初刊の版元 / 現在の主な文庫・版）">${esc(b.jp)}${b.jb?` / ${esc(b.jb)}`:""}</button>` : "") : b.jp ? "" : trLabel(b)}${b.tr===1 && b.jp ? `<span class="tjw">邦訳 <button class="lk tj" data-sort="publisher" title="出版社順に並べる">${esc(b.jp)}</button>${b.jy?`<button class="lk tj" data-sort="tyear" title="邦訳の刊行年順に並べる">・${b.jy}</button>`:""}</span>` : ""}</div>
        <div class="acts"><button class="detb" aria-expanded="${openKey===b.k}">${openKey===b.k?"詳細を閉じる":"詳細"}</button>${r?`<button class="when" data-rd title="読んだ日を変える">✓ ${readLabel(read[b.k])}</button>`:`<button class="wantb" aria-pressed="${w}">${w?"★ 読みたい":"☆ 読みたい"}</button>`}<a class="amz" href="${amzURL(b)}" target="_blank" rel="noopener" title="Amazonで探す">Amazon</a></div></div>
      <div class="rc"><div class="score${b.sc>=50?" hi":""}"><b>${Math.round(b.sc)}</b>${b.n}/${b.e}リスト</div>
        <button class="ownb" aria-pressed="${!!own[b.k]}" aria-label="${esc(b.t)} を所有している" title="手元にある本に印を付ける"><span class="ob" aria-hidden="true">${own[b.k]?"■":"□"}</span>所有</button></div>
      <div class="strip" aria-hidden="true">${strip(b)}</div>
    </div>
    ${openKey===b.k ? detailHTML(b) : ""}
  </li>`;
}
function detailHTML(b){
  const grp = g => ORDER.filter(k=>L[k].kind!=="genre"===(g==="l") && elig(b,k)).map(k=>{
    const on = k in b.s;
    return `<li class="${on?"":"off"}"><span class="r">${on ? (b.s[k] ? b.s[k]+"位" : "掲載") : "—"}</span><span>${esc(L[k].name)}</span></li>`;
  }).join("");
  const lists = `<div><h3>文学・名作・読者投票（${b.nl}/${b.el}）</h3><ul>${grp("l")}</ul></div>` + (b.eg ? `<div><h3>ジャンル・国内専門（${b.ng}/${b.eg}）</h3><ul>${grp("g")}</ul></div>` : "");
  const same = (byAuthor.get(b.a)||[]).filter(x=>x.k!==b.k).sort((x,y)=>x.y-y.y);
  const sameHTML = same.length ? `<div><h3>同じ作家のリスト内作品（未読 ${same.filter(x=>!read[x.k]).length}／${same.length}）</h3><ul class="same">${same.map(x=>`<li><span class="r">${yr(x.y)}</span><span><button data-go="${x.k}">${esc(x.t)}</button>　<span style="color:var(--muted);font-size:12px">${tierNm(tierOf(x.sc))}・${Math.round(x.sc)}${read[x.k]?"・読了":""}</span></span></li>`).join("")}</ul></div>` : "";
  const qj = encodeURIComponent(`${b.t} ${b.a}`);
  const ed = b.ed ? `<p style="margin:0;font-size:12.5px;color:var(--muted)">1001冊の掲載版：${b.ed}${b.ed.includes("–")?"":"年版のみ"}</p>` : "";
  return `<div class="det">
    <div style="font-size:13px;color:var(--muted)">原題 <span style="color:var(--ink)">${esc(b.o)}</span>${b.ty==="S"?"　・短編集":""}</div>
    ${b.tr===2 && b.jp ? `<div style="font-size:13px;color:var(--muted)">主な刊行 <span style="color:var(--ink)">初刊 ${esc(b.jp)}${b.jy?`（${b.jy}年）`:""}${b.jb?`　現在の主な版 ${esc(b.jb)}`:""}</span>${b.jv ? `<span class="tagm">Webで確認済み${b.jvd ? "（" + b.jvd + "）" : ""}</span>` : ""}${b.js ? `　<a href="${esc(b.js)}" target="_blank" rel="noopener">出典</a>` : ""}　<a href="https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=${encodeURIComponent(b.t+" "+b.a)}" target="_blank" rel="noopener">国立国会図書館で版を確かめる</a></div>` : ""}
    ${b.tr===1 ? `<div style="font-size:13px;color:var(--muted)">主な邦訳 <span style="color:var(--ink)">${b.jp ? esc(b.jp) + (b.jy ? `（${b.jy}年）` : "") : "未確認"}</span>${b.jv ? `<span class="tagm">Webで確認済み${b.jvd ? "（" + b.jvd + "）" : ""}</span>` : ""}${b.js ? `　<a href="${esc(b.js)}" target="_blank" rel="noopener">出典</a>` : ""}${b.jn ? `<div style="font-size:12px;margin-top:2px">${esc(b.jn)}</div>` : ""}　<a href="https://ndlsearch.ndl.go.jp/search?cs=bib&keyword=${encodeURIComponent(b.t+" "+b.a)}" target="_blank" rel="noopener">国立国会図書館で版を確かめる</a></div>` : ""}
    ${ed}
    ${lists}
    ${sameHTML}
    <div class="links"><a href="${amzURL(b)}" target="_blank" rel="noopener">Amazonで探す</a><a href="https://calil.jp/search?q=${qj}" target="_blank" rel="noopener">カーリルで図書館を探す</a><a href="https://www.google.com/search?q=${qj}" target="_blank" rel="noopener">Googleで調べる</a></div>
  </div>`;
}
function onListClick(e){
  const li = e.target.closest(".row"); if(!li) return;
  const k = li.dataset.k;
  const ck = e.target.closest(".chk, [data-rd]");
  if(ck){ openRdPop(k, ck); return }
  if(e.target.closest(".wantb")){ toggleWant(k); refreshRow(k); if(st.status==="want") renderList(); return }
  if(e.target.closest(".ownb")){ toggleOwn(k); refreshRow(k); if(st.status==="own"||st.status==="tsundoku") renderList(); renderPick(); return }
  const go = e.target.closest("[data-go]");
  if(go){ pushView(k); jumpTo(go.dataset.go); return }
  if(e.target.closest(".detb")){ openKey = openKey===k ? null : k; refreshRow(k); return }
  const lk = e.target.closest(".lk[data-sort]");
  if(lk){
    let by = lk.dataset.sort;
    if(by==="year" && st.sort==="year") by = "decade";
    pushView(k);
    st.sort = by; $("sort").value = by;
    openKey = null; renderList(true); ensureRow(k); focusRow(k, true);
  }
}
function refreshRow(k){
  const li = document.querySelector(`.row[data-k="${k}"]`); if(!li) return;
  li.outerHTML = rowHTML(byKey.get(k));
}
function focusRow(k, center){
  const li = document.querySelector(`.row[data-k="${k}"]`); if(!li) return;
  if(center){ const g = li.previousElementSibling?.classList.contains("grp") ? li.previousElementSibling : li; g.scrollIntoView({block:"start"}); window.scrollBy(0, -70) }
  li.classList.add("flash"); setTimeout(()=>li.classList.remove("flash"), 1800);
  li.querySelector(".tl")?.focus({preventScroll:true});
}
function jumpTo(k){
  const b = byKey.get(k);
  if(!matches(b)){ st = {...st, tier:null,list:"",cty:"",era:"",tr:"",kd:"",gn:"",q:"",status:"all"}; syncControls() }
  openKey = k; renderSummary(); renderList(true); ensureRow(k);
  const li = document.querySelector(`.row[data-k="${k}"]`);
  if(li){ li.scrollIntoView({block:"center"}); li.classList.add("flash"); setTimeout(()=>li.classList.remove("flash"), 1800) }
}
// one-click return: remember the view before a click-sort or a jump
const viewStack = [];
const SORT_NM = {score:"優先度順", year:"発表年順", yeard:"新しい順", decade:"年代順", author:"著者順", country:"国順", tyear:"邦訳の刊行年順", publisher:"出版社順"};
function pushView(k){
  // remember where the clicked row sat on screen, so going back puts it in the same place
  const li = document.querySelector(`.row[data-k="${k}"]`);
  viewStack.push({st:{...st}, open:openKey, y:window.scrollY, k, shown, off: li ? li.getBoundingClientRect().top : null});
  updateBack();
}
function updateBack(){
  const b = $("backBtn");
  if(!viewStack.length){ b.hidden = true; return }
  const v = viewStack[viewStack.length-1];
  b.hidden = false; b.textContent = `← 前の画面（${SORT_NM[v.st.sort]||"元の並び"}）に戻る`;
}
function popView(){
  const v = viewStack.pop(); if(!v) return;
  st = v.st; openKey = v.open; shown = v.shown || STEP; syncControls(); renderSummary(); renderList(); ensureRow(v.k); updateBack();
  const place = () => {
    const li = document.querySelector(`.row[data-k="${v.k}"]`);
    if(li && v.off != null) window.scrollBy({top: li.getBoundingClientRect().top - v.off, behavior:"instant"});
    else window.scrollTo({top:v.y, behavior:"instant"});
  };
  place();
  requestAnimationFrame(()=>{ place(); focusRow(v.k, false); setTimeout(place, 120) });
}
function syncControls(){
  for(const [id,key] of [["list","list"],["cty","cty"],["era","era"],["tr","tr"],["kd","kd"],["gn","gn"],["sort","sort"]]) $(id).value = st[key];
  $("q").value = st.q;
  [["fAll","all"],["fTodo","todo"],["fWant","want"],["fDone","done"],["fOwn","own"],["fTsun","tsundoku"]].forEach(([b,v])=>$(b).setAttribute("aria-pressed", st.status===v));
}
// rows are rendered in batches as the reader scrolls, so long lists stay light
const STEP = 200;
let shown = STEP, lastRows = [], grpCnt = {}, moreObs = null;
function rowsHTML(from, to){
  const gf = GROUP[st.sort]; let html = "";
  let prev = from > 0 && gf ? gf(lastRows[from-1]) : null;
  for(const b of lastRows.slice(from, to)){
    if(gf){ const g = gf(b); if(g!==prev){ html += `<li class="grp"><span>${esc(g)}</span><small>${grpCnt[g]}冊</small></li>`; prev = g } }
    html += rowHTML(b);
  }
  return html;
}
const moreHTML = () => shown < lastRows.length ? `<li class="more"><button class="btn" id="moreBtn">さらに表示（残り${lastRows.length - shown}冊）</button></li>` : "";
function renderList(reset){
  if(reset) shown = STEP;
  const rows = filtered(); lastRows = rows;
  const gf = GROUP[st.sort]; grpCnt = {};
  if(gf) rows.forEach(b=>{ const g = gf(b); grpCnt[g] = (grpCnt[g]||0)+1 });
  shown = Math.min(Math.max(shown, STEP), Math.max(rows.length, STEP));
  $("list-ol").innerHTML = rows.length ? rowsHTML(0, shown) + moreHTML() : `<li class="empty">条件に合う作品はありません。</li>`;
  $("count").textContent = `${rows.length}冊中 ${rows.filter(b=>read[b.k]).length}冊 読了`;
  watchMore();
}
function showMore(n){
  const from = shown; if(from >= lastRows.length) return;
  shown = Math.min(lastRows.length, shown + (n || STEP));
  document.querySelector("#list-ol > li.more")?.remove();
  $("list-ol").insertAdjacentHTML("beforeend", rowsHTML(from, shown) + moreHTML());
  watchMore();
}
function watchMore(){
  const li = document.querySelector("#list-ol > li.more"); if(!li) return;
  if("IntersectionObserver" in window){
    moreObs?.disconnect();
    moreObs = new IntersectionObserver(es=>{ if(es.some(e=>e.isIntersecting)) showMore() }, {rootMargin:"800px"});
    moreObs.observe(li);
  }
}
function ensureRow(k){
  if(document.querySelector(`.row[data-k="${k}"]`)) return;
  const i = lastRows.findIndex(b=>b.k===k); if(i < 0) return;
  showMore(i - shown + 50);
}
function renderSummary(){
  const total = books.length, n = books.filter(b=>read[b.k]).length;
  $("readBig").innerHTML = `${n}<small> / ${total}</small>`;
  $("readBar").style.width = (n/total*100)+"%";
  $("tiers").innerHTML = TIERS.map(t=>{
    const fs = books.filter(b=>tierOf(b.sc)===t.id), d = fs.filter(b=>read[b.k]).length;
    return `<button class="tier" data-t="${t.id}" aria-pressed="${st.tier===t.id}">
      <span class="lbl"><span class="nm">${t.nm}</span><span class="rng">スコア${t.rng}</span></span>
      <span class="ct">${d}<small> / ${fs.length}</small></span>
      <span class="bar"><i style="width:${fs.length ? d/fs.length*100 : 0}%"></i></span></button>`;
  }).join("");
  $("srcs").innerHTML = ["lit","pop","genre","mine"].filter(g=>g!=="mine"||ORDER.some(k=>L[k].mine)).map(g=>`<h3 style="grid-column:1/-1;margin:8px 0 0;font-size:13px">${g==="mine"?"自分で追加したリスト":KINDNM[g]}</h3>` + ORDER.filter(k=>g==="mine" ? L[k].mine : (L[k].kind===g && !L[k].mine)).map(k=>{
    const fs = books.filter(b=>k in b.s), d = fs.filter(b=>read[b.k]).length;
    return `<div class="src"><span class="k">${SHORT[k]||k}</span>
      <div>${L[k].url ? `<a href="${L[k].url}" target="_blank" rel="noopener">${esc(L[k].name)}</a>` : `<b style="font-weight:600">${esc(L[k].name)}</b>`}<div class="nt">${esc(L[k].note)}${L[k].mine?`・${KINDNM[L[k].kind]}`:""}・${fs.length}作品</div></div>
      <span class="pg">${d}/${fs.length}</span></div>`;
  }).join("")).join("");
  if($("statsBox").open) renderStats();
}

// ---------- 今日の1冊 ----------
let pickKey = null;
function hash(s){ let h = 2166136261; for(const c of s){ h ^= c.charCodeAt(0); h = Math.imul(h,16777619) } return h>>>0 }
function pool(){
  const t = $("pTier").value, c = $("pCty").value, g = $("pGn").value, tr = $("pTr").value, w = $("pWant").value;
  const gOk = b => !g || (g==="L" ? b.kd==="L" : b.g.includes(g));
  return books.filter(b=>!read[b.k] && (!t || tierOf(b.sc)===t) && (!c || b.c===c) && gOk(b) && (tr==="all" || b.tr!==0) && (!w || (w==="want" ? want[b.k] : w==="own" ? own[b.k] : (want[b.k] || own[b.k]))));
}
function renderPick(){
  const p = pool();
  if(!p.length){ $("pickCard").innerHTML = `<p style="margin:0;color:var(--muted)">この条件の未読作品はありません。条件を変えてみてください。</p>`; return }
  if(!pickKey || !p.some(b=>b.k===pickKey)){
    const seed = hash(today() + [$("pTier").value,$("pCty").value,$("pGn").value,$("pTr").value,$("pWant").value].join("|"));
    pickKey = p[seed % p.length].k;
  }
  const b = byKey.get(pickKey), w = !!want[b.k];
  $("pickCard").innerHTML = `<div style="display:grid;gap:8px">
    <div class="pt">${esc(b.t)}</div>
    <div class="pm"><span>${esc(b.a)}</span><span>${yr(b.y)}</span><span>${CN[b.c]||b.c}</span>${b.g.map(g=>`<span class="tag gn">${GN[g]}</span>`).join("")}${trLabel(b)}<span>${tierNm(tierOf(b.sc))}・スコア${Math.round(b.sc)}（${b.n}/${b.e}リスト）</span></div>
    <div class="pm"><span>${esc(b.o)}</span><span>候補 ${p.length}冊から</span></div>
    <div class="pb">
      <button class="btn pri" data-a="again">別の1冊</button>
      <button class="btn" data-a="want">${w?"★ 読みたいを外す":"☆ 読みたいに追加"}</button>
      <button class="btn" data-a="read">読了にする</button>
      <button class="btn" data-a="own">${own[b.k]?"■ 所有を外す":"□ 所有している"}</button>
      <button class="btn" data-a="open">一覧で詳細を見る</button>
    </div></div>`;
}
function onPickClick(e){
  const a = e.target.closest("[data-a]")?.dataset.a; if(!a || !pickKey) return;
  const k = pickKey;
  if(a==="again"){ const p = pool().filter(b=>b.k!==k); if(p.length) pickKey = p[Math.floor(Math.random()*p.length)].k; renderPick() }
  else if(a==="want"){ toggleWant(k); refreshRow(k); renderPick() }
  else if(a==="own"){ toggleOwn(k); refreshRow(k); renderPick() }
  else if(a==="read"){ openRdPop(k, e.target.closest("[data-a]")) }
  else if(a==="open"){ pushView(k); jumpTo(k) }
}

// ---------- 達成状況 ----------
function hbars(rows){ return `<div class="hb">${rows.map(([lb,d,n])=>`<span class="lb" title="${esc(lb)}">${esc(lb)}</span><span class="tr"><i style="width:${n ? d/n*100 : 0}%"></i></span><span class="vl">${d}/${n}　${n ? Math.round(d/n*100) : 0}%</span>`).join("")}</div>` }
function group(keyFn, keys){ return keys.map(([key,label])=>{ const fs = books.filter(b=>keyFn(b)===key); return [label, fs.filter(b=>read[b.k]).length, fs.length] }) }
function renderStats(){
  const cc = {}; books.forEach(b=>cc[b.c]=(cc[b.c]||0)+1);
  const top = Object.entries(cc).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([c])=>[c, CN[c]||c]);
  const years = {}; let undated = 0; Object.values(read).forEach(d=>{ if(isDate(d)){ const y = d.slice(0,4); years[y]=(years[y]||0)+1 } else undated++ });
  const ys = Object.keys(years).sort(), mx = Math.max(1,...Object.values(years));
  $("stats").innerHTML = `
    <div><h3>優先度別</h3>${hbars(group(b=>tierOf(b.sc), TIERS.map(t=>[t.id,t.nm])))}</div>
    <div><h3>ジャンル別</h3>${hbars([["L","文学リストに載る作品"],["M","ミステリー・スリラー"],["SF","SF"],["F","ファンタジー"],["H","ホラー"]].map(([g,lb])=>{ const fs = books.filter(b=>g==="L" ? b.kd==="L" : b.g.includes(g)); return [lb, fs.filter(b=>read[b.k]).length, fs.length] }))}</div>
    <div><h3>時代別</h3>${hbars(group(b=>eraOf(b.y)[0], ERAS.map(e=>[e[0],e[1]])))}</div>
    <div><h3>国別（多い12か国）</h3>${hbars(group(b=>b.c, top))}</div>
    <div><h3>リスト別</h3>${hbars(ORDER.map(k=>{ const fs = books.filter(b=>k in b.s); return [L[k].name, fs.filter(b=>read[b.k]).length, fs.length] }))}</div>
    <div><h3>所有</h3>${(()=>{ const ks = Object.keys(own).filter(k=>byKey.has(k)), rd = ks.filter(k=>read[k]).length; return hbars([["所有している本", ks.length, books.length], ["所有のうち読了", rd, ks.length], ["積読（所有・未読）", ks.length - rd, ks.length]]) })()}</div>
    <div><h3>年ごとの読了冊数</h3>${ys.length ? `<div class="hb">${ys.map(y=>`<span class="lb">${y}年</span><span class="tr"><i style="width:${years[y]/mx*100}%"></i></span><span class="vl">${years[y]}冊</span>`).join("")}</div>` : `<p style="margin:0;color:var(--muted);font-size:13px">読んだ日を入れた作品を年ごとに集計します。まだ記録がありません。</p>`}${undated ? `<p style="margin:6px 0 0;color:var(--muted);font-size:13px">日付なしの読了 ${undated}冊</p>` : ""}</div>`;
}

// ---------- 自分で追加したリスト ----------
const BASE_ORDER = ORDER.slice();
books.forEach(b=>{ b.base = {s:{...b.s}, Es:new Set(b.Es), nl:b.nl, el:b.el, ng:b.ng, eg:b.eg, n:b.n, e:b.e, g:b.g.slice(), kd:b.kd, w:b.w} });
let custom = {lists:[], books:[], del:{}};
const CLS = "lifetime-books-custom-v1";
const cNorm = o => ({lists:Array.isArray(o.lists)?o.lists:[], books:Array.isArray(o.books)?o.books:[], del:(o.del&&typeof o.del==="object")?o.del:{}});
function cRead(){ try{ return cNorm(JSON.parse(localStorage.getItem(CLS)||"{}")||{}) }catch(e){ return cNorm({}) } }
function cWrite(){ try{ localStorage.setItem(CLS, JSON.stringify(custom)) }catch(e){} }
const cSig = c => [c.lists.map(l=>[l.id,l.updated]).sort(), c.books.map(b=>b.k).sort(), Object.keys(c.del).sort()];
function cMerge(a, b){
  const del = {...a.del}; for(const [k,v] of Object.entries(b.del)) if(!del[k] || v > del[k]) del[k] = v;
  const m = new Map();
  for(const l of [...a.lists, ...b.lists]){ const o = m.get(l.id); if(!o || (l.updated||"") >= (o.updated||"")) m.set(l.id, l) }
  const lists = [...m.values()].filter(l=>!(del[l.id] && del[l.id] >= (l.updated||""))).sort((x,y)=>(x.created||"").localeCompare(y.created||""));
  const bk = new Map(); for(const x of [...a.books, ...b.books]) bk.set(x.k, x);
  const used = new Set(lists.flatMap(l=>l.items.map(i=>i.k)));
  return {lists, books:[...bk.values()].filter(x=>used.has(x.k)), del};
}
const EN_C = new Set(["GB","IE","US","CA","AU","NZ","TT","AG","GY","IN","NG","KE","ZA","ZW","PK"]);
function scopeOk(b, sc){
  if(sc.cty==="none") return false;
  if(sc.cty==="jp" && b.c!=="JP") return false;
  if(sc.cty==="foreign" && b.c==="JP") return false;
  if(sc.cty==="en" && !EN_C.has(b.c)) return false;
  if(sc.genre && !b.base.g.includes(sc.genre)) return false;
  if(sc.y0 && b.y < sc.y0) return false;
  if(sc.y1 && b.y > sc.y1) return false;
  return true;
}
function makeBook(x){
  const g = x.g ? [x.g] : [];
  return {k:x.k, t:x.t, o:x.o||x.t, a:x.a||"作者不明", y:x.y, c:x.c, tr:x.tr, ty:"N", g:g.slice(), kd:"P", s:{}, E:[], Es:new Set(), mine:true,
    nl:0, el:0, ng:0, eg:0, n:0, e:0, w:0, sc:0, base:{s:{}, Es:new Set(), nl:0, el:0, ng:0, eg:0, n:0, e:0, g, kd:"P", w:0}};
}
const firstMine = () => ORDER.find(k=>L[k].mine);
function applyCustom(){
  for(const k of Object.keys(L)) if(L[k].mine) delete L[k];
  ORDER.length = 0; ORDER.push(...BASE_ORDER);
  const keep = books.filter(b=>!b.mine); books.length = 0; books.push(...keep);
  byKey.clear(); books.forEach(b=>byKey.set(b.k, b));
  for(const x of custom.books) if(!byKey.has(x.k)){ const b = makeBook(x); books.push(b); byKey.set(b.k, b) }
  for(const b of books){ const B = b.base; b.s = {...B.s}; b.Es = new Set(B.Es); b.nl = B.nl; b.el = B.el; b.ng = B.ng; b.eg = B.eg; b.n = B.n; b.e = B.e; b.g = B.g.slice(); b.kd = B.kd; b.w = B.w }
  custom.lists.forEach((cl, i)=>{
    const id = cl.id;
    L[id] = {name:cl.name, note:cl.note||"自分で追加", url:"", ranked:!!cl.ranked, kind:cl.kind, mine:true};
    SHORT[id] = "自" + (i+1);
    ORDER.push(id);
    const size = Math.max(1, cl.items.length);
    for(const it of cl.items){
      const b = byKey.get(it.k); if(!b) continue;
      const r = cl.ranked ? (+it.r || 0) : 0;
      b.s[id] = (id in b.s) ? (b.s[id] && r ? Math.min(b.s[id], r) : (b.s[id] || r)) : r;
    }
    for(const b of books){
      const on = id in b.s;
      if(!on && !scopeOk(b, cl.scope||{})) continue;
      if(!on) b.Es.add(id);
      b.e++;
      if(cl.kind==="genre"){ b.eg++; if(on) b.ng++ } else { b.el++; if(on) b.nl++ }
      if(on){
        b.n++;
        if(b.s[id]) b.w += 1 - (b.s[id]-1)/size;
        if(cl.kind==="lit") b.kd = "L";
        if(cl.kind==="genre" && cl.scope?.genre && !b.g.includes(cl.scope.genre)) b.g.push(cl.scope.genre);
      }
    }
  });
  for(const b of books){ b.g.sort(); b.sc = Math.round(1000 * Math.max(b.nl/(b.el+3), b.eg ? b.ng/(b.eg+3) : 0)) / 10 }
  books.sort((a,b)=>b.sc-a.sc || b.n-a.n || b.w-a.w || a.y-b.y);
  books.forEach((b,i)=>b.id = i+1);
  byAuthor.clear(); books.forEach(b=>{ if(b.a==="作者不詳"||b.a==="作者不明") return; if(!byAuthor.has(b.a)) byAuthor.set(b.a,[]); byAuthor.get(b.a).push(b) });
  buildIndex();
}
function buildMeta(){
  const nm = ORDER.filter(k=>L[k].mine).length;
  $("eyebrow").textContent = `${ORDER.length} LISTS · ${books.length.toLocaleString()} NOVELS`;
  $("nLists").textContent = ORDER.length + (nm ? `（うち自分で追加${nm}本）` : "");
  if(st.list && !L[st.list]) st.list = "";
  const grp = (lb, ks) => ks.length ? `<optgroup label="${lb}">${ks.map(k=>`<option value="${k}">${esc(L[k].name)}</option>`).join("")}</optgroup>` : "";
  $("list").innerHTML = `<option value="">リスト：すべて</option>` + ["lit","pop","genre"].map(g=>grp(KINDNM[g], ORDER.filter(k=>L[k].kind===g && !L[k].mine))).join("") + grp("自分で追加", ORDER.filter(k=>L[k].mine));
  $("list").value = st.list;
}
function refreshAll(){
  applyCustom(); buildMeta(); autoApply();
  if(openKey && !byKey.has(openKey)) openKey = null;
  if(pickKey && !byKey.has(pickKey)) pickKey = null;
  renderAll(); renderMy(); renderLog();
}
function exportText(){ return JSON.stringify({app:"lifetime-books", v:3, read, want, own, custom, log:blog}) }

// title matching
const NZC = new Map();
const nz = s => { s = String(s||""); let v = NZC.get(s); if(v === undefined){ v = nz0(s); if(NZC.size > 50000) NZC.clear(); NZC.set(s, v) } return v };
const nz0 = s => String(s||"").normalize("NFKC").toLowerCase().replace(/ものがたり/g, "物語").replace(/^(the|a|an|le|la|les|der|die|das|el)\s+/, "").replace(/[\s・･.,，、。:：;；!！?？'’‘"“”「」『』()（）\[\]〔〕【】〈〉《》＜＞<>\-‐‑–—―ー~〜～\/／&＆*＊#＃]/g, "");
const noParen = s => String(s||"").replace(/[（(〔\[【〈《<＜][^）)〕\]】〉》>＞]*[）)〕\]】〉》>＞]/g, "");
let TIDX = new Map(), PIDX = new Map();
function buildIndex(){
  TIDX = new Map(); PIDX = new Map();
  for(const b of books){
    const vs = new Set([nz(b.t), nz(noParen(b.t)), nz(b.o), nz(noParen(b.o))]);
    b.nv = [...vs].filter(Boolean); b.tv = [nz(b.t), nz(noParen(b.t))];
    for(const v of b.nv){
      if(!TIDX.has(v)) TIDX.set(v, []); TIDX.get(v).push(b);
      for(let L = 4; L < v.length; L++){ const p = v.slice(0, L); if(!PIDX.has(p)) PIDX.set(p, new Set()); PIDX.get(p).add(b) }
    }
  }
}
const authorHit = (b, a) => { const x = nz(a), y = nz(b.a); return !!x && !!y && (y.includes(x) || x.includes(y)) };
function candidates(t, a){
  const q = nz(t), q2 = nz(noParen(t));
  let ex = [...new Set([...(TIDX.get(q)||[]), ...(TIDX.get(q2)||[])])];
  let part = [];
  if(q.length >= 2){
    part = books.filter(b=>!ex.includes(b) && b.nv.some(v=>(v.length>=2 && q.includes(v) && v.length >= q.length*0.5) || (q.length>=3 && v.includes(q))));
  }
  const rank = b => (authorHit(b,a) ? 0 : 1);
  ex.sort((x,y)=>rank(x)-rank(y) || y.sc-x.sc);
  part.sort((x,y)=>rank(x)-rank(y) || y.sc-x.sc);
  return {ex, part:part.slice(0, 8)};
}
function parseItems(txt){
  return txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{
    let p = l.split(/\t|\||｜/).map(x=>x.trim());
    let r = 0;
    if(p.length > 1 && /^\d+$/.test(p[0].normalize("NFKC"))){ r = +p[0].normalize("NFKC"); p = p.slice(1) }
    else { const m = p[0].normalize("NFKC").match(/^(\d+)\s*[.)．、:]\s*(.+)$/); if(m){ r = +m[1]; p[0] = m[2] } }
    return {r, t:p[0]||"", a:p[1]||""};
  }).filter(x=>x.t);
}
let draft = null;
function newDefaults(){ const jp = draft.scope.cty==="jp"; return {y:"", c:jp?"JP":"", tr:jp?2:1, g:draft.scope.genre||"", o:""} }
function matchRow(row){
  const {ex, part} = candidates(row.t, row.a);
  row.cands = [...ex, ...part].map(b=>b.k);
  row.exact = ex.length > 0; row.exn = ex.length;
  row.choice = ex.length ? "k:"+ex[0].k : "new";
  row.amb = ex.length > 1 && !authorHit(ex[0], row.a);
  if(!row.nw) row.nw = newDefaults();
}
function readForm(){
  const y0 = parseInt($("mY0").value.normalize("NFKC"),10), y1 = parseInt($("mY1").value.normalize("NFKC"),10);
  return {name:$("mName").value.trim(), note:$("mNote").value.trim(), kind:$("mKind").value, ranked:$("mRanked").value==="1",
    scope:{cty:$("mCty").value, genre:$("mGn").value, y0:isNaN(y0)?null:y0, y1:isNaN(y1)?null:y1}};
}
const CN_OPTS = () => Object.entries(CN).sort((a,b)=>a[1].localeCompare(b[1],"ja"));
function renderPrev(){
  if(!draft){ $("mPrev").innerHTML = ""; return }
  const R = draft.rows;
  const ok = R.filter(r=>r.choice.startsWith("k:")).length, nw = R.filter(r=>r.choice==="new").length, sk = R.length - ok - nw;
  const need = R.filter(r=>r.choice!=="skip" && (r.amb || !r.exact)).length;
  const opt = (k, pre) => { const b = byKey.get(k); return b ? `<option value="k:${k}">${pre}${esc(b.t)}（${esc(b.a)}・${yr(b.y)}）</option>` : "" };
  $("mPrev").innerHTML = `<p class="msg" style="margin:0">照合結果：${R.length}行のうち 既存の作品${ok}・新しい作品${nw}・使わない${sk}。枠が色付きの${need}行は確かめてください。書名を直すと照合し直します。</p>
  <ol class="prev">${R.map((r,i)=>{
    const ks = r.cands.slice(); const cur = r.choice.startsWith("k:") ? r.choice.slice(2) : null;
    if(cur && !ks.includes(cur)) ks.unshift(cur);
    const opts = ks.map(k=>{ const j = r.cands.indexOf(k); return opt(k, j < 0 ? "選択中：" : j < (r.exn||0) ? "一致：" : "候補：") }).join("") + `<option value="new">新しい作品として追加</option><option value="skip">使わない</option>`;
    const nwf = r.choice==="new" ? `<div class="nf">
      <input data-f="y" value="${esc(r.nw.y)}" placeholder="発表年" inputmode="numeric" aria-label="発表年">
      <select data-f="c" aria-label="国"><option value="">国を選ぶ</option>${CN_OPTS().map(([c,n])=>`<option value="${c}"${r.nw.c===c?" selected":""}>${n}</option>`).join("")}</select>
      <select data-f="tr" aria-label="邦訳">${[[2,"日本語原作"],[1,"邦訳あり"],[0,"邦訳なし"]].map(([v,n])=>`<option value="${v}"${+r.nw.tr===v?" selected":""}>${n}</option>`).join("")}</select>
      <select data-f="g" aria-label="ジャンル">${[["","ジャンルなし"],["M","ミステリー"],["SF","SF"],["F","ファンタジー"],["H","ホラー"]].map(([v,n])=>`<option value="${v}"${r.nw.g===v?" selected":""}>${n}</option>`).join("")}</select>
      <input data-f="o" value="${esc(r.nw.o)}" placeholder="原題（任意）" aria-label="原題"></div>` : "";
    const cls = r.choice==="skip" ? "sk" : (r.amb || !r.exact) ? "ng" : "";
    return `<li data-i="${i}" class="${cls}"><span class="pr">${r.r||"—"}</span><div class="pl">
      <div class="r1"><input data-f="t" value="${esc(r.t)}" aria-label="書名"><input data-f="a" value="${esc(r.a)}" placeholder="著者" aria-label="著者" style="flex:0 1 160px"></div>
      <select data-f="choice" aria-label="照合先">${opts}</select>${nwf}</div></li>`;
  }).join("")}</ol>
  <div class="row2"><button class="btn pri" id="mSave">${draft.id ? "変更を保存" : "このリストを追加"}</button>${draft.id ? `<button class="btn" id="mCancel">編集をやめる</button>` : ""}<span class="msg" id="mMsg2"></span></div>`;
  $("mPrev").querySelectorAll("li").forEach(li=>{ const r = R[+li.dataset.i]; li.querySelector('[data-f="choice"]').value = r.choice });
}
function onPrevChange(e){
  const li = e.target.closest("li[data-i]"); if(!li) return;
  const r = draft.rows[+li.dataset.i], f = e.target.dataset.f, v = e.target.value;
  if(f==="choice"){ r.choice = v; if(v.startsWith("k:")) r.amb = false; renderPrev() }
  else if(f==="t" || f==="a"){ r[f] = v.trim(); const keepNw = r.nw; matchRow(r); r.nw = keepNw; renderPrev() }
  else if(f==="c"){ r.nw.c = v; if(v==="JP") r.nw.tr = 2; else if(+r.nw.tr===2) r.nw.tr = 1; renderPrev() }
  else if(f){ r.nw[f] = v }
}
const fnv = s => { let h = 2166136261; for(const c of s){ h ^= c.codePointAt(0); h = Math.imul(h,16777619) } return (h>>>0).toString(36) };
function saveDraft(){
  const f = readForm();
  const msg = t => { $("mMsg2").textContent = t };
  if(!f.name) return msg("リスト名を入れてください。");
  const bad = draft.rows.filter(r=>r.choice==="new" && (!/^-?\d{1,4}$/.test(String(r.nw.y).normalize("NFKC").trim()) || !r.nw.c));
  if(bad.length) return msg(`新しい作品${bad.length}件に発表年と国を入れてください（${bad.slice(0,3).map(r=>r.t).join("、")}${bad.length>3?"…":""}）。`);
  const items = [], addBooks = [];
  for(const r of draft.rows){
    if(r.choice==="skip") continue;
    let k;
    if(r.choice==="new"){
      const ex = custom.books.find(x=>x.t===r.t && (x.a||"")===(r.a||""));
      k = ex ? ex.k : "u" + fnv(r.t + "|" + r.a);
      const nb = {k, t:r.t, a:r.a||"作者不明", o:r.nw.o||r.t, y:parseInt(String(r.nw.y).normalize("NFKC"),10), c:r.nw.c, tr:+r.nw.tr, g:r.nw.g||""};
      addBooks.push(nb);
    } else k = r.choice.slice(2);
    items.push({r:r.r||0, t:r.t, a:r.a, k});
  }
  if(!items.length) return msg("使う作品がありません。");
  const now = new Date().toISOString();
  const old = draft.id ? custom.lists.find(l=>l.id===draft.id) : null;
  const id = draft.id || "u" + fnv(f.name + now);
  const list = {id, ...f, items, created:old?.created || now, updated:now};
  const bk = new Map(custom.books.map(x=>[x.k,x])); addBooks.forEach(x=>bk.set(x.k, x));
  const lists = old ? custom.lists.map(l=>l.id===id ? list : l) : [...custom.lists, list];
  const used = new Set(lists.flatMap(l=>l.items.map(i=>i.k)));
  custom = {lists, books:[...bk.values()].filter(x=>used.has(x.k)), del:custom.del};
  cWrite(); cSchedule();
  draft = null; clearForm();
  refreshAll();
  $("mMsg").textContent = `「${f.name}」を${old ? "更新" : "追加"}しました（${items.length}作品${addBooks.length ? `・うち新しい作品${addBooks.length}` : ""}）。`;
}
function clearForm(){ ["mName","mNote","mY0","mY1","mItems"].forEach(id=>$(id).value = ""); $("mKind").value = "genre"; $("mRanked").value = "1"; $("mCty").value = "all"; $("mGn").value = ""; draft = null; renderPrev() }
function renderMy(){
  const ls = custom.lists;
  $("myLists").innerHTML = ls.length ? ls.map(l=>{
    const nNew = l.items.filter(i=>byKey.get(i.k)?.mine).length;
    const sc = l.scope||{}, cty = {all:"すべての国",jp:"日本の作品",foreign:"海外の作品",en:"英語圏の作品",none:"範囲なし"}[sc.cty]||"";
    const rng = [cty, sc.genre ? GN[sc.genre] : "", (sc.y0||sc.y1) ? `${sc.y0||""}–${sc.y1||""}年` : ""].filter(Boolean).join("・");
    return `<div class="src"><span class="k">${SHORT[l.id]||"自"}</span><div><b style="font-weight:600">${esc(l.name)}</b><div class="nt">${l.note?esc(l.note)+"・":""}${KINDNM[l.kind]}・${l.ranked?"順位あり":"順位なし"}・対象：${esc(rng)}・${l.items.length}作品${nNew?`（新しく追加した作品${nNew}）`:""}</div></div>
      <span class="acts2"><button class="btn" data-ed="${l.id}">編集</button><button class="btn" data-del="${l.id}">削除</button></span></div>`;
  }).join("") : `<p class="msg" style="margin:0">まだ追加したリストはありません。</p>`;
}
function editList(id){
  const l = custom.lists.find(x=>x.id===id); if(!l) return;
  $("mName").value = l.name; $("mNote").value = l.note||""; $("mKind").value = l.kind; $("mRanked").value = l.ranked ? "1" : "0";
  $("mCty").value = l.scope?.cty||"all"; $("mGn").value = l.scope?.genre||""; $("mY0").value = l.scope?.y0||""; $("mY1").value = l.scope?.y1||"";
  $("mItems").value = l.items.map(i=>[i.r||"", i.t, i.a].join("|").replace(/^\|/, "")).join("\n");
  draft = {id, ...readForm(), rows:[]};
  draft.rows = l.items.map(i=>{ const r = {r:i.r, t:i.t, a:i.a}; matchRow(r); if(byKey.has(i.k)){ r.choice = "k:"+i.k; r.amb = false; r.exact = true; if(!r.cands.includes(i.k)) r.cands.unshift(i.k), r.exn = (r.exn||0)+1 } return r });
  renderPrev();
  $("mMsg").textContent = `「${l.name}」を編集中です。作品欄を書き換えたら「照合する」を押し直してください。`;
  $("mName").scrollIntoView({block:"center"});
}
function initMy(){
  $("mMatch").addEventListener("click", ()=>{
    const f = readForm(), items = parseItems($("mItems").value);
    if(!items.length){ $("mMsg").textContent = "作品を1行に1つずつ入れてください。"; return }
    const prev = draft?.id ? draft : null;
    draft = {id:prev?.id||null, ...f, rows:[]};
    const before = prev ? new Map(prev.rows.map(r=>[r.t+"|"+r.a, r])) : new Map();
    draft.rows = items.map(it=>{ const r = {...it}; const o = before.get(it.t+"|"+it.a); if(o){ r.cands = o.cands; r.exact = o.exact; r.exn = o.exn; r.choice = o.choice; r.amb = o.amb; r.nw = o.nw || newDefaults() } else matchRow(r); return r });
    $("mMsg").textContent = ""; renderPrev();
  });
  $("mReset").addEventListener("click", ()=>{ clearForm(); $("mMsg").textContent = "" });
  $("mPrev").addEventListener("change", onPrevChange);
  $("mPrev").addEventListener("click", e=>{ if(e.target.id==="mSave") saveDraft(); if(e.target.id==="mCancel"){ clearForm(); $("mMsg").textContent = "" } });
  $("myLists").addEventListener("click", e=>{
    const ed = e.target.closest("[data-ed]")?.dataset.ed, dl = e.target.closest("[data-del]")?.dataset.del;
    if(ed) editList(ed);
    if(dl){
      const l = custom.lists.find(x=>x.id===dl); if(!l || !confirm(`「${l.name}」を削除しますか？読了記録は残ります。`)) return;
      const lists = custom.lists.filter(x=>x.id!==dl), used = new Set(lists.flatMap(x=>x.items.map(i=>i.k)));
      custom = {lists, books:custom.books.filter(x=>used.has(x.k)), del:{...custom.del, [dl]:new Date().toISOString()}};
      if(draft?.id===dl) clearForm();
      cWrite(); cSchedule(); refreshAll(); $("mMsg").textContent = `「${l.name}」を削除しました。`;
    }
  });
}

// ---------- 読書記録（ブクログなど） ----------
let blog = {items:[], applied:{}, reject:{}, src:"", at:""};
let blogMatches = {}, blogUnmatched = [];
const LLS = "lifetime-books-log-v1";
const objOr = v => (v && typeof v==="object" && !Array.isArray(v)) ? v : {};
const FIC_DEFAULT = {cats:["ＳＦ","ファンタジー","ミステリ/ホラー/サスペンス","未分類（フィクション）"], media:["本","電子書籍"]};
const lNorm = o => ({items:Array.isArray(o.items)?o.items:[], applied:objOr(o.applied), reject:objOr(o.reject), links:objOr(o.links), ignore:objOr(o.ignore),
  fic:(o.fic && Array.isArray(o.fic.cats)) ? o.fic : null, src:o.src||"", at:o.at||"", iv:o.iv||"", chunks:+o.chunks||0});
function lRead(){ try{ return lNorm(JSON.parse(localStorage.getItem(LLS)||"{}")||{}) }catch(e){ return lNorm({}) } }
function lWrite(){ try{ localStorage.setItem(LLS, JSON.stringify(blog)) }catch(e){} }
const lId = it => it.t + "|" + (it.a||"");
function lMerge(a, b){
  const m = new Map();
  for(const it of [...a.items, ...b.items]){ const id = lId(it), o = m.get(id); m.set(id, o ? {t:it.t, a:it.a, d:it.d||o.d||"", s:it.s||o.s||"", c:it.c||o.c||"", m:it.m||o.m||""} : it) }
  return {items:[...m.values()], applied:{...a.applied, ...b.applied}, reject:{...a.reject, ...b.reject}, links:{...(a.links||{}), ...(b.links||{})}, ignore:{...(a.ignore||{}), ...(b.ignore||{})}, fic:b.fic||a.fic||null, src:b.src||a.src, at:(a.at||"") > (b.at||"") ? a.at : (b.at||a.at), iv:a.iv||b.iv||"", chunks:a.chunks||b.chunks||0};
}
let lRef = null, lCol = null, lWriting = false, lDirty = false, lItemsDirty = false, lTimer = null;
const LCH = 600;  // items per chunk document (each document must stay under 256 KiB)
// [title, author, date, status ("" = 読み終わった), category, media]
const packItem = it => { const p = [it.t, it.a||"", it.d||"", it.s && it.s!=="読み終わった" ? it.s : "", it.c||"", it.m||""]; while(p.length > 3 && !p[p.length-1]) p.pop(); return p };
const unpackItem = x => Array.isArray(x) ? {t:x[0], a:x[1]||"", d:x[2]||"", s:x[3]||"", c:x[4]||"", m:x[5]||""} : x;
async function lLoad(meta){
  const n = +meta.chunks || 0;
  let items = Array.isArray(meta.items) ? meta.items : [];
  if(n){ items = []; for(let i = 0; i < n; i++){ const c = snapData(await lCol.doc("log-"+i).get()); items.push(...(c.items||[]).map(unpackItem)) } }
  return {...lNorm({...meta, items}), iv:meta.iv||""};
}
function lSchedule(){ lDirty = true; clearTimeout(lTimer); lTimer = setTimeout(lFlush, 900) }
async function lFlush(){
  if(!lRef){ lDirty = false; return }
  if(lWriting){ lSchedule(); return }
  lWriting = true; lDirty = false;
  try{
    if(lItemsDirty || !blog.iv){
      lItemsDirty = false;
      const packed = blog.items.map(packItem), n = Math.ceil(packed.length / LCH);
      for(let i = 0; i < n; i++) await lCol.doc("log-"+i).set({items:packed.slice(i*LCH, (i+1)*LCH)});
      blog.iv = new Date().toISOString(); blog.chunks = n;
    }
    await lRef.set({chunks:blog.chunks||0, iv:blog.iv, applied:blog.applied, reject:blog.reject, links:blog.links||{}, ignore:blog.ignore||{}, fic:blog.fic||null, src:blog.src, at:blog.at, updated:new Date().toISOString()});
    lWrite();
  }catch(e){ setSync("読書記録を保存できませんでした。この端末には残っています") }
  lWriting = false; if(lDirty) lSchedule();
}
function cleanT(t){
  t = noParen(String(t||"").normalize("NFKC")).trim();
  t = t.replace(/\s*(上|中|下|上巻|中巻|下巻|前編|後編|全\d+巻|\d+|[IVX]+)\s*$/, "").trim();
  return t.replace(/\s*(新装版|完全版|新訳版|決定版|改訂版|新版)\s*$/, "").trim();
}
const ahit = (b, a) => { const x = nz(a), y = nz(b.a); return !!x && !!y && (y.includes(x) || x.includes(y) || (x.length>=3 && y.length>=3 && x.slice(-3)===y.slice(-3))) };
function logMatch(it){
  const lid = lId(it);
  if(blog.links?.[lid]) return byKey.get(blog.links[lid]) || null;
  if(blog.ignore?.[lid]) return null;
  return autoMatch(it);
}
function autoMatch(it){
  const q = nz(cleanT(it.t)), q0 = nz(noParen(it.t));
  if(!q) return null;
  const c = [...new Set([...(TIDX.get(q)||[]), ...(TIDX.get(q0)||[])])];
  if(c.length){
    const h = c.find(b=>ahit(b, it.a)); if(h) return h;
    if(q.length >= 4 && !/アンソロジー/.test(it.a||"")){ const t = c.find(b=>b.tv.includes(q) || b.tv.includes(q0)); if(t) return t }
  }
  for(let L = q.length - 1; L >= 2; L--){
    const v = q.slice(0, L), bs = TIDX.get(v); if(!bs) continue;
    const rest = q.slice(L);
    const h = bs.find(b=>ahit(b, it.a)) || (L >= 5 && /^(\d|[ivx]|と)/.test(rest) ? bs[0] : null);
    if(h) return h;
  }
  for(let i = 1; i + 5 <= q.length; i++) for(let j = q.length; j >= i + 5; j--){
    const bs = TIDX.get(q.slice(i, j)); if(!bs) continue;
    const h = bs.find(b=>ahit(b, it.a)) || ((j===q.length || /\d/.test(q[j])) && !/[a-z0-9]/.test(q[i-1]) ? bs[0] : null);
    if(h) return h;
  }
  if(q.length >= 4){ const bs = PIDX.get(q); if(bs) for(const b of bs) if(ahit(b, it.a)) return b }
  return null;
}
function autoApply(){
  blogMatches = {};
  if(!blog.items.length) return 0;
  blogUnmatched = [];
  for(const it of blog.items){ if(it.s && it.s!=="読み終わった") continue; const b = logMatch(it); if(b) (blogMatches[b.k] ||= []).push(it); else blogUnmatched.push(it) }
  let n = 0, ch = false;
  for(const [k, its] of Object.entries(blogMatches)){
    if(blog.applied[k] || blog.reject[k]) continue;
    blog.applied[k] = 1; ch = true;
    if(!read[k]){ read[k] = its.map(i=>i.d).filter(d=>isDate(d) && !d.startsWith("2011")).sort().pop() || 1; delete want[k]; n++ }
  }
  if(n){ lsWrite(); schedule() }
  if(ch){ lWrite(); lSchedule() }
  return n;
}
function parseCSV(txt){
  const rows = []; let row = [], f = "", q = false;
  for(let i = 0; i < txt.length; i++){
    const c = txt[i];
    if(q){ if(c==='"'){ if(txt[i+1]==='"'){ f += '"'; i++ } else q = false } else f += c }
    else if(c==='"') q = true;
    else if(c===","){ row.push(f); f = "" }
    else if(c==="\n" || c==="\r"){ if(c==="\r" && txt[i+1]==="\n") i++; row.push(f); rows.push(row); row = []; f = "" }
    else f += c;
  }
  if(f || row.length){ row.push(f); rows.push(row) }
  return rows.filter(r=>r.some(x=>x.trim()));
}
const dPart = s => /^\d{4}-\d{2}-\d{2}/.test(s||"") && !/^0000/.test(s) ? s.slice(0,10) : "";
function rowsToItems(rows){
  if(!rows.length) return {items:[], src:""};
  const h = rows[0].map(x=>x.trim().toLowerCase());
  const col = re => h.findIndex(x=>re.test(x));
  const ti = col(/^(タイトル|書名|title|作品名)$/), ai = col(/^(著者|作者|著者名|作者名|author)$/);
  if(ti >= 0){
    const di = col(/(読了日|読んだ日|date|日付)/), si = col(/(読書状況|状態|status)/), ci = col(/^(カテゴリ|カテゴリー|ジャンル|分類|category|genre)$/);
    return {src:"CSV", items:rows.slice(1).map(r=>({t:r[ti]||"", a:ai>=0?r[ai]||"":"", d:di>=0?dPart((r[di]||"").replace(/\//g,"-")):"", s:si>=0?(/読み終|read|済/.test(r[si]||"")?"読み終わった":r[si]||""):"", c:ci>=0?r[ci]||"":""})).filter(x=>x.t)};
  }
  if(rows[0].length >= 13){  // ブクログ：見出しなし17列
    return {src:"ブクログ", items:rows.map(r=>({t:r[11]||"", a:r[12]||"", d:dPart(r[10]) || dPart(r[9]), s:r[5]||"", c:r[3]||"", m:r[15]||""})).filter(x=>x.t)};
  }
  return {src:"", items:[]};
}
async function onLogFile(e){
  const f = e.target.files?.[0]; if(!f) return;
  const buf = await f.arrayBuffer();
  let txt;
  try{ txt = new TextDecoder("utf-8", {fatal:true}).decode(buf) }catch(_){ try{ txt = new TextDecoder("shift_jis").decode(buf) }catch(__){ txt = "" } }
  txt = txt.replace(/^﻿/, "");
  const {items, src} = rowsToItems(parseCSV(txt));
  if(!items.length){ $("logMsg").textContent = "記録を読み取れませんでした。ブクログの書き出しCSVか、「タイトル」「著者」の見出しがあるCSVを選んでください。"; return }
  const before = blog.items.length;
  blog = lMerge(blog, {items, applied:{}, reject:{}, src, at:new Date().toISOString()}); lItemsDirty = true;
  const n = autoApply(); lWrite(); lSchedule();
  renderAll(); renderLog();
  $("logMsg").textContent = `${src||"CSV"}の記録${items.length}件を読み込みました（新規${blog.items.length - before}件）。新たに${n}作品に読了の印を付けました。`;
  e.target.value = "";
}
// ---------- 読書記録の表示：一致・未照合・リスト外 ----------
const lgUI = {unQ:"", unAll:false, unShown:40, outShown:60, open:{}};
const fic = () => blog.fic || FIC_DEFAULT;
const isFiction = it => fic().cats.includes(it.c || "（カテゴリなし）") && (!it.m || fic().media.includes(it.m));
const yOf = d => isDate(d) && !d.startsWith("2011") ? d.slice(0,4) : "";
function renderLog(){
  if(!blog.items.length){ $("logInfo").innerHTML = `<p class="msg" style="margin:0">まだ読書記録はありません。</p>`; return }
  $("logInfo").innerHTML = `<div id="logSum"></div><div id="logUn"></div><div id="logOut"></div>
    <div class="row2"><button class="btn" id="logClear">保存した記録を削除</button><span class="msg">付けた読了の印は消えません。</span></div>`;
  renderLogSum(); renderLogUn(); renderLogOut();
}
const det = (id, sum, body) => `<details data-lg="${id}"${lgUI.open[id] ? " open" : ""}><summary style="cursor:pointer;font-size:13.5px;font-weight:600;margin:6px 0">${sum}</summary>${body}</details>`;
function renderLogSum(){
  const el = $("logSum"); if(!el) return;
  const ks = Object.keys(blogMatches).filter(k=>byKey.has(k)).sort((a,b)=>byKey.get(a).id - byKey.get(b).id);
  const on = ks.filter(k=>read[k]).length, man = Object.keys(blog.links||{}).length;
  el.innerHTML = `<p class="msg" style="margin:0">保存している記録 ${blog.items.length.toLocaleString()}件${blog.src?`（${esc(blog.src)}`:""}${blog.at?`・${blog.at.slice(0,10)}取り込み）`:blog.src?"）":""}。一覧の作品と一致したもの ${ks.length}作品（うち読了 ${on}${man?`・手で結び付けた記録 ${man}件`:""}）。</p>` +
    det("match", `一致した作品（${ks.length}）`, `<ul class="lgl">${ks.map(k=>{
      const b = byKey.get(k), its = blogMatches[k], manual = its.some(i=>blog.links?.[lId(i)]);
      const btn = manual ? `<button class="btn" data-unlink="${k}">結び付けを外す</button>` : blog.reject[k] ? `<button class="btn" data-lr="${k}" data-on="1">照合を戻す</button>` : `<button class="btn" data-lr="${k}">取り消す</button>`;
      return `<li><span>${esc(b.t)}${manual?`<span class="tagm">手動</span>`:""}<span class="lt">　← ${esc(its[0].t)}${its.length>1?` ほか${its.length-1}件`:""}</span></span>${btn}</li>` }).join("")}</ul>`);
}
// loose candidates for an unmatched record (title overlap or same author)
function looseCands(it){
  const q = nz(cleanT(it.t)), out = [];
  for(const b of books){
    let sc = 0;
    const L = Math.max(0, ...b.nv.filter(v=>(v.length>=2 && q.includes(v)) || (q.length>=2 && v.includes(q))).map(v=>Math.min(v.length, q.length)));
    const ah = ahit(b, it.a);
    if(L >= 4 || (L >= 2 && ah)) out.push([L + (ah ? 10 : 0), b]);
  }
  return out.sort((x,y)=>y[0]-x[0] || y[1].sc-x[1].sc).slice(0, 6).map(x=>x[1]);
}
function unRows(){
  const q = nz(lgUI.unQ);
  let rows = blogUnmatched.filter(it=>!blog.ignore?.[lId(it)]);
  if(q) rows = rows.filter(it=>nz(it.t).includes(q) || nz(it.a).includes(q));
  return rows;
}
function renderLogUn(){
  const el = $("logUn"); if(!el) return;
  const all = unRows(), out = [];
  lgUI.unFull = !!lgUI.open.un;
  for(const it of all){
    if(!lgUI.open.un) break;
    if(out.length >= lgUI.unShown) break;
    const cs = looseCands(it);
    if(!lgUI.unAll && !cs.length) continue;
    out.push([it, cs]);
  }
  const ign = Object.keys(blog.ignore||{}).length;
  el.innerHTML = det("un", `照合できなかった記録（${blogUnmatched.length - ign}件）`, `
    <p class="msg" style="margin:0 0 6px">訳者だけが著者欄に入っているなどで照合できなかった記録です。候補から選ぶか、書名で探して「結び付ける」を押すと、その作品に読了の印が付きます。一覧にない本は「リスト外」にすると、ここに出なくなります。</p>
    <div class="row2"><input id="unQ" placeholder="記録の書名・著者で絞り込む" value="${esc(lgUI.unQ)}"><label class="msg"><input type="checkbox" id="unAll"${lgUI.unAll?" checked":""}> 候補のない記録も表示</label></div>
    <ul class="unl">${out.map(([it, cs])=>`<li data-lid="${esc(lId(it))}">
      <div class="ut">${esc(it.t)}<span class="lt">　${esc(it.a||"著者なし")}${it.d && yOf(it.d) ? "・" + it.d : ""}${it.c ? "・" + esc(it.c) : ""}</span></div>
      <div class="ua"><select data-f="pick" aria-label="結び付ける作品"><option value="">${cs.length ? "候補から選ぶ…" : "書名で探してください"}</option>${cs.map(b=>`<option value="${b.k}">${esc(b.t)}（${esc(b.a)}）</option>`).join("")}</select>
      <input data-f="q" placeholder="一覧から書名で探す" aria-label="一覧から書名で探す">
      <button class="btn" data-act="link">結び付ける</button><button class="btn" data-act="ign">リスト外</button></div></li>`).join("") || `<li class="msg">該当する記録はありません。</li>`}</ul>
    ${out.length >= lgUI.unShown ? `<div class="row2"><button class="btn" id="unMore">さらに表示</button></div>` : ""}
    ${ign ? `<p class="msg" style="margin:6px 0 0">「リスト外」にした記録 ${ign}件　<button class="btn" id="unReset">すべて戻す</button></p>` : ""}`);
}
function outItems(){ return blogUnmatched.filter(isFiction).sort((a,b)=>(b.d||"").localeCompare(a.d||"")) }
function renderLogOut(){
  const el = $("logOut"); if(!el) return;
  const xs = outItems(), cats = {}, years = {}, media = {};
  for(const it of blogUnmatched){ const c = it.c || "（カテゴリなし）"; cats[c] = (cats[c]||0) + 1; if(it.m) media[it.m] = (media[it.m]||0) + 1 }
  let undated = 0; for(const it of xs){ const y = yOf(it.d); if(y) years[y] = (years[y]||0) + 1; else undated++ }
  const ys = Object.keys(years).sort(), mx = Math.max(1, ...Object.values(years));
  const inList = Object.keys(blogMatches).filter(k=>read[k]).length;
  el.innerHTML = det("out", `リスト外の読了（小説 ${xs.length}冊）`, `
    <p class="msg" style="margin:0 0 6px">記録のうち一覧の作品と結び付いていない本を、選んだカテゴリの分だけ「リスト外の読了」として数えます。記録から一致したリスト内の読了は ${inList}作品、合わせて ${inList + xs.length}冊です。</p>
    <div class="fic"><span class="msg">小説として数えるカテゴリ：</span>${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<label><input type="checkbox" data-fc="${esc(c)}"${fic().cats.includes(c)?" checked":""}> ${esc(c)}（${n}）</label>`).join("")}</div>
    <div class="fic"><span class="msg">種別：</span>${Object.entries(media).sort((a,b)=>b[1]-a[1]).map(([m,n])=>`<label><input type="checkbox" data-fm="${esc(m)}"${fic().media.includes(m)?" checked":""}> ${esc(m)}（${n}）</label>`).join("")}</div>
    ${ys.length ? `<div class="hb" style="margin-top:8px">${ys.map(y=>`<span class="lb">${y}年</span><span class="tr"><i style="width:${years[y]/mx*100}%"></i></span><span class="vl">${years[y]}冊</span>`).join("")}</div>` : ""}
    ${undated ? `<p class="msg" style="margin:4px 0 0">日付なし ${undated}冊</p>` : ""}
    <ul class="lgl" style="margin-top:8px">${xs.slice(0, lgUI.outShown).map(it=>`<li><span>${esc(it.t)}<span class="lt">　${esc(it.a)}${yOf(it.d)?"・"+it.d:""}</span></span><span class="lt">${esc(it.c||"")}</span></li>`).join("")}</ul>
    ${xs.length > lgUI.outShown ? `<div class="row2"><button class="btn" id="outMore">さらに表示（残り${xs.length - lgUI.outShown}冊）</button></div>` : ""}`);
}
function logChanged(full){ lWrite(); lSchedule(); if(full){ autoApply(); renderAll() } renderLog() }
function searchBooks(q){
  const x = nz(q); if(x.length < 1) return [];
  return books.filter(b=>b.nv.some(v=>v.includes(x)) || nz(b.a).includes(x)).sort((a,b)=>b.sc-a.sc).slice(0, 12);
}
function initLog(){
  $("logFile").addEventListener("change", onLogFile);
  $("logInfo").addEventListener("toggle", e=>{ const d = e.target.closest?.("details[data-lg]"); if(d){ lgUI.open[d.dataset.lg] = d.open; if(d.dataset.lg === "un" && d.open && !lgUI.unFull) renderLogUn() } }, true);
  $("logInfo").addEventListener("input", e=>{
    if(e.target.id==="unQ"){ lgUI.unQ = e.target.value; lgUI.unShown = 40; clearTimeout(lgUI.t); lgUI.t = setTimeout(()=>{ renderLogUn(); const i = $("unQ"); i.focus(); i.setSelectionRange(i.value.length, i.value.length) }, 250); return }
    if(e.target.dataset.f==="q"){
      const li = e.target.closest("li[data-lid]"), sel = li.querySelector('[data-f="pick"]');
      const hits = searchBooks(e.target.value);
      sel.innerHTML = `<option value="">${hits.length ? `見つかった作品（${hits.length}）から選ぶ…` : "見つかりません"}</option>` + hits.map(b=>`<option value="${b.k}">${esc(b.t)}（${esc(b.a)}・${yr(b.y)}）</option>`).join("");
      if(hits.length === 1) sel.value = hits[0].k;
    }
  });
  $("logInfo").addEventListener("change", e=>{
    if(e.target.id==="unAll"){ lgUI.unAll = e.target.checked; lgUI.unShown = 40; renderLogUn(); return }
    const fc = e.target.dataset.fc, fm = e.target.dataset.fm;
    if(fc != null || fm != null){
      const f = {cats:[...fic().cats], media:[...fic().media]}, arr = fc != null ? f.cats : f.media, v = fc != null ? fc : fm;
      if(e.target.checked){ if(!arr.includes(v)) arr.push(v) } else arr.splice(arr.indexOf(v), 1);
      blog.fic = f; lWrite(); lSchedule(); renderLogOut();
    }
  });
  $("logInfo").addEventListener("click", e=>{
    const b = e.target.closest("[data-lr]");
    if(b){
      const k = b.dataset.lr;
      if(b.dataset.on){ delete blog.reject[k]; delete blog.applied[k]; autoApply() }
      else { blog.reject[k] = 1; if(read[k]){ delete read[k]; lsWrite(); schedule() } }
      lWrite(); lSchedule(); renderAll(); renderLog(); return;
    }
    const ul = e.target.closest("[data-unlink]");
    if(ul){
      const k = ul.dataset.unlink;
      for(const [lid, kk] of Object.entries(blog.links||{})) if(kk===k) delete blog.links[lid];
      autoApply();
      if(!blogMatches[k] && blog.applied[k]){ delete blog.applied[k]; if(read[k]){ delete read[k]; lsWrite(); schedule() } }
      return logChanged(true);
    }
    const act = e.target.closest("[data-act]")?.dataset.act;
    if(act){
      const li = e.target.closest("li[data-lid]"), lid = li.dataset.lid;
      if(act==="link"){
        const k = li.querySelector('[data-f="pick"]').value;
        if(!k){ li.querySelector('[data-f="q"]').focus(); return }
        blog.links = {...(blog.links||{}), [lid]:k}; delete blog.reject[k]; if(!read[k]) delete blog.applied[k];
        $("logMsg").textContent = `「${byKey.get(k).t}」に結び付けました。`;
        return logChanged(true);
      }
      if(act==="ign"){ blog.ignore = {...(blog.ignore||{}), [lid]:1}; return logChanged(false) }
    }
    if(e.target.id==="unMore"){ lgUI.unShown += 40; return renderLogUn() }
    if(e.target.id==="outMore"){ lgUI.outShown += 100; return renderLogOut() }
    if(e.target.id==="unReset" && confirm("「リスト外」にした記録をすべて未照合に戻しますか？")){ blog.ignore = {}; return logChanged(false) }
    if(e.target.id==="logClear" && confirm("保存した読書記録を削除しますか？付けた読了の印は残ります。")){
      blog = lNorm({}); lItemsDirty = true; blogMatches = {}; blogUnmatched = []; lWrite(); lSchedule(); renderLog();
    }
  });
}

function renderAll(){ renderSummary(); renderList(); renderPick() }
custom = cRead(); blog = lRead(); applyCustom();
buildControls(); buildMeta(); initMy(); initLog();
({read, want, own} = lsRead()); autoApply();
renderAll(); renderMy(); renderLog();
initStore();
