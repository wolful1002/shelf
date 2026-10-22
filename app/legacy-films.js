// 今のチェッカー（Movie List Checker）の画面のプログラム。tools/build-legacy.py で取り出したもの。手直しは build-legacy.py の PATCHES にあるものだけ。

const DATA = window.__DATA__;;
const ORDER = ["b1001","ss_c","ss_d","tspdt","afi","bbc_us","bbc_fl","bbc_21","nyt_21","cahiers","imdb","kj_fo09","kj_pro","kj_jp09","kj_jp100","bfi_jp","to_jp","cholic"];
const UNRANKED = new Set(["bfi_jp","kj_jp100","kj_pro"]);
const rankText0 = (k,r) => k.startsWith("c_") ? (customs[k.slice(2)] && customs[k.slice(2)].ranked ? ` ${r}位` : " 選出") : k==="b1001" ? "" : k==="bfi_jp" ? ` ${r}年の1本` : (UNRANKED.has(k) || ((k==="kj_jp09"||k==="kj_fo09") && r>=100)) ? " 選出" : ` ${r}位`;
const rankText = rankText0;
const SHORT = {b1001:"1001",ss_c:"S&S批",ss_d:"S&S監",tspdt:"TSPDT",afi:"AFI",bbc_us:"BBC米",bbc_fl:"BBC外",bbc_21:"BBC21",nyt_21:"NYT21",cahiers:"カイエ",imdb:"IMDb",kj_fo09:"キネ旬外200",kj_pro:"キネ旬外100",kj_jp09:"キネ旬邦200",kj_jp100:"キネ旬邦100",bfi_jp:"BFI日本",to_jp:"TO日本",cholic:"Cinemaholic"};
const TIERS = [
  {id:"s",nm:"最優先",rng:"スコア75以上",min:75,max:1e9},
  {id:"a",nm:"必見",rng:"60–75",min:60,max:75},
  {id:"b",nm:"推奨",rng:"45–60",min:45,max:60},
  {id:"c",nm:"候補",rng:"30–45",min:30,max:45},
  {id:"d",nm:"その他",rng:"30未満",min:-1,max:30},
];
const MU = 0.15;   // 発表時期の都合で対象外になったリスト枠に入れる平均的な値
let SPW = 4;       // 専門リスト（対象が限られたリスト）全体の重み＝全映画リスト何本分か
try{ const v = parseInt(localStorage.getItem("lifetime-films-spw"),10); if(v>=1 && v<=12) SPW = v }catch(e){}
const ENG = new Set(["US","UK","AU","NZ","IE","CA"]);
const SCOPE_NM = {all:"全映画", jp:"日本映画のみ", fo:"外国映画のみ", us:"アメリカ映画のみ", nonen:"英語以外の映画のみ", c21:"2000年以降の映画のみ"};
function eligible(f, k){
  if(k in f.s) return true;
  const L = DATA.lists[k]; if(!L) return false;
  const y = f.y || 0;
  if(L.end && y && y > L.end) return false;
  const cs = new Set((f.c||"").split("/").filter(Boolean));
  if(!cs.size) return L.scope === "all";
  const jp = cs.has("JP");
  switch(L.scope){
    case "jp": return jp;
    case "fo": return !jp;
    case "us": return cs.has("US");
    case "nonen": return ![...cs].some(c=>ENG.has(c));
    case "c21": return y >= 2000;
    default: return true;
  }
}
const BASE = DATA.films.map(f=>({...f, s0:{...f.s}, n0:f.n, w0:f.w}));
let films = BASE.slice();
let customs = {};       // id -> {name, src, ranked, created, include, items:[{r,raw,t,y,k}]}
const PENDING = [
  {st:"book", nm:"キネマ旬報 映画遺産200 日本映画篇の完全な順位（2009）", scope:"jp", end:2009, now:"現在は上位32位＋順位なしの選出作", how:"キネ旬ムック『オールタイム・ベスト 映画遺産200 日本映画篇』（キネマ旬報社、2009）。古書・図書館で。", url:"https://kineyoko.jp/", src:"キネ旬ムック（2009）", ranked:true},
  {st:"book", nm:"文藝春秋『日本映画ベスト150 大アンケートによる』（1989）", scope:"jp", end:1989, now:"未集計", how:"文春文庫ビジュアル版、映画好き370人のアンケート。ISBN 978-4-16-811609-4。古書・図書館で。iCheckMoviesにも全162件の一覧あり（ブラウザで全件表示）。", url:"https://books.bunshun.jp/ud/book/num/9784168116094", src:"文春文庫ビジュアル版 ISBN 978-4-16-811609-4", ranked:true},
  {st:"book", nm:"文藝春秋『洋画ベスト150 大アンケートによる』（1988）", scope:"fo", end:1988, now:"未集計", how:"文春文庫ビジュアル版、映画好き400人のアンケート。ISBN 978-4-16-810808-2。古書・図書館で。", url:"https://books.bunshun.jp/ud/book/num/9784168108082", src:"文春文庫ビジュアル版 ISBN 978-4-16-810808-2", ranked:true},
  {st:"book", nm:"小林信彦『2001年映画の旅 ぼくが選んだ20世紀洋画・邦画ベスト200』（2000）", scope:"all", end:2000, now:"未集計", how:"文藝春秋、ISBN 978-4-16-356840-9。洋画100本・邦画100本。邦画分はiCheckMoviesに一覧あり（ブラウザで全件表示）。", url:"https://books.bunshun.jp/ud/book/num/9784163568409", src:"文藝春秋 ISBN 978-4-16-356840-9", ranked:false},
  {st:"browser", nm:"キネマ旬報 20世紀の日本映画・評論家投票（1995）", scope:"jp", end:1995, now:"未集計", how:"iCheckMoviesに全127件の一覧（ブラウザで全件表示）。原典はキネマ旬報1995年の特集号（図書館のバックナンバー）。", url:"https://icheckmovies.com/lists/kinema+junpos+top+japanese+films+of+the+20th+century+critics+poll+1995/adamh/", src:"キネマ旬報（1995）", ranked:true},
  {st:"browser", nm:"キネマ旬報 読者が選んだ心に残る日本映画200", scope:"jp", end:2009, now:"未集計", how:"iCheckMoviesのリスト説明欄に日本語の全順位が掲載されています（ブラウザで表示）。", url:"https://icheckmovies.com/lists/kinema+junpos+top+200+japanese+films+-+readers/fergenaprido/", src:"キネマ旬報 読者投票（2009年頃）", ranked:true},
  {st:"browser", nm:"Sight & Sound 2022 監督投票 51〜100位", scope:"all", end:2021, now:"上位50位＋判明分のみ集計", how:"BFI公式サイトの一覧ページ（ブラウザで全件表示）、またはSight and Sound誌の該当号。取り込むと既存の監督投票とは別リストとして加わります。", url:"https://www.bfi.org.uk/sight-and-sound/greatest-films-all-time", src:"BFI Sight and Sound 2022", ranked:true},
  {st:"browser", nm:"BFI 日本映画の名作（2006・2008・2012・2013・2019年分）", scope:"jp", end:2019, now:"この5年分のみ未集計", how:"BFI公式ページをブラウザで最後まで表示すると確認できます。", url:"https://www.bfi.org.uk/lists/great-japanese-film-every-year-from-1925-now", src:"BFI", ranked:false},
  {st:"browser", nm:"TIME All-TIME 100 Movies（2005/2011）", scope:"all", end:2011, now:"未集計", how:"TIME公式サイトの一覧、またはfilmsite.orgの分割ページ（Part 1〜5）。", url:"https://Filmsite.org/timemagazinegreats.html", src:"TIME誌 批評家2人の選出", ranked:false},
  {st:"book", nm:"キネマ旬報 映画人が選ぶオールタイム・ベスト（日本・外国）の正式な順位", scope:"all", end:1999, now:"掲載順で集計中", how:"原典はキネマ旬報の特集号（1999年頃）。図書館のバックナンバーで順位を確認できます。", url:"https://nijibabu.exblog.jp/7302152", src:"キネマ旬報", ranked:true},
];
const STL = {web:"Webで入手可", book:"書籍・雑誌", browser:"Web（ブラウザで表示）"};
const CN = {US:"アメリカ",UK:"イギリス",FR:"フランス",IT:"イタリア",DE:"ドイツ",JP:"日本",SU:"ソ連",RU:"ロシア",ES:"スペイン",SE:"スウェーデン",DK:"デンマーク",IN:"インド",CN:"中国",HK:"香港",TW:"台湾",KR:"韓国",IR:"イラン",BR:"ブラジル",MX:"メキシコ",AR:"アルゼンチン",AU:"オーストラリア",NZ:"ニュージーランド",CA:"カナダ",PL:"ポーランド",CS:"チェコスロバキア",HU:"ハンガリー",YU:"ユーゴスラビア",GR:"ギリシャ",SN:"セネガル",CU:"キューバ",EG:"エジプト",IL:"イスラエル",BE:"ベルギー",NL:"オランダ",AT:"オーストリア",CH:"スイス",PT:"ポルトガル",FI:"フィンランド",GE:"ジョージア",NO:"ノルウェー",TR:"トルコ",IE:"アイルランド",ZA:"南アフリカ",MA:"モロッコ",PH:"フィリピン",TH:"タイ",ML:"マリ",DZ:"アルジェリア",LB:"レバノン",CL:"チリ",CO:"コロンビア",RO:"ルーマニア",MR:"モーリタニア",JM:"ジャマイカ",VN:"ベトナム",BA:"ボスニア・ヘルツェゴビナ",AF:"アフガニスタン",PS:"パレスチナ",AO:"アンゴラ",SA:"サウジアラビア",SY:"シリア"};
const cname = c => c ? c.split("/").map(x=>CN[x]||x).join("・") : "要確認";
const JP = {J:"◎ 公開・ソフト化あり",F:"△ 特集上映・限定",N:"× 日本未公開"};
const JPS = {J:"◎",F:"△",N:"×"};
const SVC = [["nf","Netflix"],["pv","Prime Video"],["un","U-NEXT"],["dp","ディズニープラス"],["hu","Hulu"],["dm","DMM TV"],["le","Lemino"],["fo","FOD"],["ab","ABEMA"],["wo","WOWOWオンデマンド"],["at","Apple TV"],["ot","その他"]];
const SVCN = Object.fromEntries(SVC);
const DISC = [["y","あり"],["n","なし"],["","未確認"]];
let byKey = new Map(films.map(f=>[f.k,f]));
const ckeys = () => Object.keys(customs).filter(id=>customs[id].include).map(id=>"c_"+id);
const allKeys = () => ORDER.concat(ckeys());
const shortOf = k => SHORT[k] || (customs[k.slice(2)] ? customs[k.slice(2)].name.slice(0,8) : k);
function normT(x){ return String(x||"").normalize("NFKC").toLowerCase().replace(/[\s・･、。,.!?:;'"“”‘’「」『』【】\[\]()〈〉《》\/\-‐–—~〜&+*★☆♪…]/g,"") }
function recompute(){
  const extras = new Map();
  for(const f of BASE){ f.s = {...f.s0}; f.n = f.n0; f.w = f.w0 }
  for(const id of Object.keys(customs)){
    const L = customs[id], key = "c_"+id;
    DATA.lists[key] = {name:L.name, note:(L.src || "あなたが追加したリスト"), url:"", scope:L.scope||"all", end:L.end||0};
    if(!L.include) continue;
    const size = L.items.length || 1, done = new Set();
    for(const it of L.items){
      let f = it.k ? BASE.find(b=>b.k===it.k) : null;
      if(!f){
        if(!L.addNew) continue;
        const xk = "x_" + normT(it.t) + "_" + (it.y||"");
        f = extras.get(xk);
        if(!f){ f = {k:xk, t:it.t, en:"", y:it.y||0, d:"", c:"", j:"", u:false, s:{}, n:0, w:0, x:true}; extras.set(xk,f) }
      }
      if(done.has(f.k)) continue; done.add(f.k);
      f.s[key] = it.r; f.w += L.ranked ? 1-(it.r-1)/size : 0.5;
    }
  }
  films = BASE.concat([...extras.values()]);
  const keys = allKeys();
  const gk = keys.filter(k=>(DATA.lists[k].scope||"all")==="all"), sk = keys.filter(k=>(DATA.lists[k].scope||"all")!=="all");
  const Emax = gk.length + SPW;
  for(const f of films){
    const ge = gk.filter(k=>eligible(f,k)), se = sk.filter(k=>eligible(f,k));
    f.gh = ge.filter(k=>k in f.s).length; f.ge = ge.length;
    f.sh = se.filter(k=>k in f.s).length; f.se = se.length;
    f.n = f.gh + f.sh; f.e = f.ge + f.se;
    const hits = f.gh + (f.se ? SPW * f.sh / f.se : 0);
    const E = f.ge + (f.se ? SPW : 0);
    f.sc = (hits + (Emax - E) * MU) / Emax * 100;
    f.avgw = f.n ? f.w / f.n : 0;
  }
  films.sort((a,b)=>b.sc-a.sc || b.avgw-a.avgw || a.y-b.y);
  films.forEach((f,i)=>f.id=i+1);
  byKey = new Map(films.map(f=>[f.k,f]));
  DIRIDX = null;
}
const tierOf = sc => (TIERS.find(t=>sc>=t.min && sc<t.max)||TIERS[TIERS.length-1]).id;

const NODATE = "-";      // 鑑賞済みだが鑑賞日は不明
const dateOf = v => v && v !== NODATE ? v : "";
const rwOf = k => (rw[k] || []).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d));
// every date this film was watched, oldest first (the first viewing may have no date)
const viewsOf = k => [...new Set([dateOf(seen[k]), ...rwOf(k)].filter(Boolean))].sort();
const whenTxt = k => { const v = viewsOf(k), n = (seen[k] ? 1 : 0) + rwOf(k).filter(d=>d !== dateOf(seen[k])).length;
  return (v.length ? `✓ ${v[v.length-1]}` : "✓ 鑑賞済") + (n > 1 ? `（${n}回）` : "") };
// is date a (real) earlier than b? an unknown date never replaces a known one
const earlier = (a, b) => !!dateOf(a) && (!dateOf(b) || a < b);
let want = {};          // key -> "YYYY-MM-DD"（観たい印を付けた日）
let seen = {};          // key -> "YYYY-MM-DD"
let info = {};          // key -> {st:[svc], disc:"y"|"n", at:"YYYY-MM-DD"}
let openKey = null;
let state = {tier:null, list:"", decade:"", country:"", jp:"", rec:"", q:"", watch:"all", sort:"score", shown:1e9};
const PAGE = 1e9;   // 全件を一度に表示
const $ = id => document.getElementById(id);

// ---------- storage: private per-person docs in the artifact db, local copy as fallback ----------
// Every change is stamped per item (seen / want / info / rewatch / off-list / imported list), deletions included,
// so a device holding old data can never bring back something removed elsewhere: the newer stamp always wins.
const LS = "lifetime-films-seen-v1", LSI = "lifetime-films-info-v1", LSW = "lifetime-films-want-v1";
const LSR = "lifetime-films-rewatch-v1", LST = "lifetime-films-stamps-v2";
const LSO = "lifetime-films-offlist-v1", LSC = "lifetime-films-custom-v1";
let rw = {};            // key -> ["YYYY-MM-DD", ...]  2回目以降の鑑賞日
let offlist = [];       // [{t, y, d}]  watched films not in any list
const lsGet = (k, d) => { try{ return JSON.parse(localStorage.getItem(k)||"null") ?? d }catch(e){ return d } };
const lsSet = (k, v) => { try{ localStorage.setItem(k, JSON.stringify(v)) }catch(e){} };
const offKey = o => normT(o.t)+"_"+(o.y||"");
// a clock that never runs backwards and always moves past every stamp it has seen, so a device whose clock is behind still wins with its newer change
const CLK = {t:0, now(){ this.t = Math.max(Date.now(), this.t + 1); return this.t }, see(x){ if(x > this.t) this.t = x }};
const COLS = {
  seen: {get:()=>seen, set:v=>{ seen = v }},
  want: {get:()=>want, set:v=>{ want = v }},
  info: {get:()=>info, set:v=>{ info = v }},
  rw:   {get:()=>rw,   set:v=>{ rw = v }},
  off:  {get:()=>{ const m = {}; for(const o of offlist){ const k = offKey(o); if(!m[k] || earlier(o.d, m[k].d)) m[k] = o } return m }, set:v=>{ offlist = Object.values(v) }},
  cust: {get:()=>customs, set:v=>{ customs = v }},
};
// what to keep when both sides changed an item at the same moment (only happens with records saved before stamps existed)
const TIE = {
  seen: (a,b)=> earlier(b,a) ? b : a,
  rw:   (a,b)=> [...new Set([...(a||[]), ...(b||[])])].sort(),
  info: (a,b)=> (b.at||"") > (a.at||"") ? b : a,
  off:  (a,b)=> earlier(b.d,a.d) ? b : a,
};
let TS = {seen:{}, want:{}, info:{}, rw:{}, off:{}, cust:{}};
let SNAP = {};          // collection -> {key: JSON} as last stamped
let legacyLocal = false;
const jsonMap = m => { const o = {}; for(const k of Object.keys(m)) if(m[k] !== undefined) o[k] = JSON.stringify(m[k]); return o };
function takeSnap(n){ SNAP[n] = jsonMap(COLS[n].get()) }
// stamp every item that changed since the last stamp (added, edited or removed)
function stamp(names){
  for(const n of names){
    const cur = jsonMap(COLS[n].get()), old = SNAP[n] || {};
    for(const k of new Set([...Object.keys(cur), ...Object.keys(old)])) if(cur[k] !== old[k]) TS[n][k] = CLK.now();
    SNAP[n] = cur;
  }
}
function mergeCol(n, L, Lt, R, Rt){
  const v = {}, t = {};
  for(const k of new Set([...Object.keys(L), ...Object.keys(R), ...Object.keys(Lt), ...Object.keys(Rt)])){
    const lt = Lt[k] ?? 0, rt = Rt[k] ?? 0;
    let val;
    if(lt > rt) val = L[k]; else if(rt > lt) val = R[k];
    else if(L[k] === undefined) val = R[k]; else if(R[k] === undefined) val = L[k];
    else if(JSON.stringify(L[k]) === JSON.stringify(R[k])) val = L[k];
    else val = TIE[n] ? TIE[n](L[k], R[k]) : (JSON.stringify(L[k]) < JSON.stringify(R[k]) ? L[k] : R[k]);
    if(val !== undefined) v[k] = val;
    const tt = Math.max(lt, rt); if(tt > 0) t[k] = tt;
  }
  return {v, t};
}
function saveLocal(){
  lsSet(LS, seen); lsSet(LSI, info); lsSet(LSW, want); lsSet(LSR, rw); lsSet(LSO, offlist); lsSet(LSC, customs); lsSet(LST, TS);
}
function loadLocal(){
  seen = lsGet(LS, {}); info = lsGet(LSI, {}); want = lsGet(LSW, {}); rw = lsGet(LSR, {}); offlist = lsGet(LSO, []); customs = lsGet(LSC, {});
  const t = lsGet(LST, null);
  legacyLocal = !t;
  if(t) for(const n of Object.keys(TS)) TS[n] = t[n] || {};
  for(const n of Object.keys(TS)) for(const x of Object.values(TS[n])) CLK.see(x);
  for(const n of Object.keys(COLS)) takeSnap(n);
}
// one document per group of collections in data/users/<id>/
const DOCS = {
  watched: {names:["seen","want","info","rw"], body:()=>({seen, want, info, rw})},
  offlist: {names:["off"], body:()=>({items: offlist})},
  customLists: {names:["cust"], body:()=>({lists: customs})},
};
const fromDoc = (d, n) => d ? (n === "off" ? Object.fromEntries((d.items||[]).map(o=>[offKey(o), o])) : n === "cust" ? (d.lists||{}) : (d[n]||{})) : {};
let db = null, uid = null, syncing = false;
for(const D of Object.values(DOCS)) Object.assign(D, {ref:null, writing:false, dirty:false, timer:null, remote:null});
function setSync(html){ $("sync").innerHTML = html }
function sameRemote(D){
  const r = D.remote; if(!r) return false;
  return D.names.every(n=>JSON.stringify(jsonMap(fromDoc(r, n))) === JSON.stringify(SNAP[n]) && JSON.stringify((r.ts||{})[n]||{}) === JSON.stringify(TS[n]));
}
// merge what the account holds into this device; returns true when this device's records changed
function absorb(D, r){
  D.remote = r;
  let changed = false;
  const remoteNew = !!(r && r.ts);
  for(const n of D.names){
    const R = fromDoc(r, n), Rt = (r && r.ts && r.ts[n]) || {};
    for(const x of Object.values(Rt)) CLK.see(x);
    let Lt = TS[n];
    // this device still has records from before stamps existed, but the account already has stamped ones: the account is newer
    if(legacyLocal && remoteNew){ Lt = {}; for(const k of Object.keys(COLS[n].get())) Lt[k] = -1 }
    const m = mergeCol(n, COLS[n].get(), Lt, R, Rt);
    if(JSON.stringify(jsonMap(m.v)) !== JSON.stringify(SNAP[n])) changed = true;
    COLS[n].set(m.v); TS[n] = m.t; takeSnap(n);
  }
  return changed;
}
function push(D){ if(!D.ref) return; D.dirty = true; clearTimeout(D.timer); D.timer = setTimeout(()=>flushDoc(D), 600) }
async function flushDoc(D){
  if(!D.ref){ D.dirty = false; return }
  if(D.writing){ push(D); return }
  if(!D.dirty) return;
  D.writing = true; D.dirty = false;
  const ts = {}; for(const n of D.names) ts[n] = TS[n];
  const body = {...D.body(), ts, v:2, updated:new Date().toISOString()};
  try{ await D.ref.set(body); D.remote = body }
  catch(e){
    if(e && (e.code === "invalid_argument" || e.code === "not_granted" || e.code === "revoked")){ for(const X of Object.values(DOCS)) X.ref = null; setSync("アカウントには保存できない共有設定のため、記録はこのブラウザに保存されます") }
    else { setSync("保存に失敗しました。この端末には残っています。しばらくして自動で再送します"); D.dirty = true; clearTimeout(D.timer); D.timer = setTimeout(()=>flushDoc(D), 15000) }
  }
  D.writing = false;
  if(D.dirty) push(D);
}
// call after any change to records: stamps what changed, keeps a local copy and sends it to the account
function commit(){
  stamp(Object.keys(COLS)); saveLocal();
  for(const D of Object.values(DOCS)) if(!sameRemote(D)) push(D);
}
// kept for the existing call sites
function lsWrite(){ commit() }
function schedule(){}
async function saveOff(){ commit() }
async function saveCustoms(){ commit() }
function afterRemote(changedDocs){
  if(changedDocs.has("customLists")){ recompute(); fillListSelect(); renderLegend(); renderMine() }
  if(changedDocs.has("offlist")) renderOff();
  renderAll();
}
async function initStore(){
  loadLocal(); migrateNoDate(false); recompute(); promoteOff(); fillListSelect(); renderLegend(); renderAll(); renderMine(); renderOff();
  setSync("この端末に保存");
  let user = null;
  try{ [db, user] = await Promise.all([claude.use("db"), claude.use("user")]) }catch(e){}
  if(!db || !user){ migrateNoDate(true); setSync(location.protocol === "file:" ? "オフライン版：このブラウザに保存" : "この端末に保存（サインインすると端末間で同期）"); return }
  try{
    uid = await user.id();
    let canW = null; try{ canW = await user.can("data.write") }catch(_){}
    if(!uid || canW === false){ migrateNoDate(true); setSync("閲覧のみの共有で開いているため、記録はこのブラウザに保存されます（バックアップで持ち出せます）"); return }
    const col = db.collection("data/users/"+uid);
    const changedDocs = new Set();
    for(const [name, D] of Object.entries(DOCS)){
      D.ref = col.doc(name);
      const s = await D.ref.get();
      if(absorb(D, s.exists ? s.data() : null)) changedDocs.add(name);
    }
    migrateNoDate(true);
    promoteOff();
    stamp(Object.keys(COLS)); saveLocal(); legacyLocal = false;
    for(const D of Object.values(DOCS)) if(!sameRemote(D)) push(D);
    afterRemote(changedDocs);
    setSync("<b>●</b> アカウントに保存・端末間で同期");
    for(const [name, D] of Object.entries(DOCS)){
      D.ref.onSnapshot(s=>{
        if(s.metadata && s.metadata.hasPendingWrites) return;
        const r = s.exists ? s.data() : null;
        if(!r) return;
        stamp(Object.keys(COLS));          // never lose an unstamped local edit
        const ch = absorb(D, r);
        saveLocal();
        if(!sameRemote(D)) push(D);        // this device knows something newer: send it back
        if(ch) afterRemote(new Set([name]));
      }, ()=>{});
    }
  }catch(e){ setSync("この端末に保存（同期は一時的に利用できません）") }
}
const today = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}` };
function setInfo(k, fn){
  const cur = info[k] ? {...info[k], st:[...(info[k].st||[])]} : {st:[], disc:""};
  fn(cur); cur.at = today();
  if(!cur.st.length && !cur.disc) delete info[k]; else info[k] = cur;
  commit();
}
// ---------- undo for removed check marks ----------
let undoBox = null, undoTimer = null;
function offerUndo(msg, restore){
  if(!undoBox){
    undoBox = document.createElement("div"); undoBox.className = "toast"; undoBox.setAttribute("role","status");
    document.body.appendChild(undoBox);
  }
  undoBox.innerHTML = `<span>${esc(msg)}</span><button type="button">元に戻す</button>`;
  undoBox.hidden = false;
  undoBox.querySelector("button").onclick = ()=>{ restore(); hideUndo() };
  clearTimeout(undoTimer); undoTimer = setTimeout(hideUndo, 8000);
}
function refreshRow(k){ const li = document.querySelector(`.row[data-k="${k}"]`); const f = byKey.get(k); if(li && f) li.outerHTML = rowHTML(f) }
function hideUndo(){ if(undoBox) undoBox.hidden = true; clearTimeout(undoTimer) }
function toggle(k){
  if(seen[k]){
    const prev = seen[k], prevRw = rw[k], f = byKey.get(k);
    delete seen[k]; delete rw[k];
    offerUndo(`『${f ? f.t : "作品"}』の鑑賞済みを外しました${dateOf(prev) ? `（鑑賞日 ${prev}）` : ""}`, ()=>{
      seen[k] = prev; if(prevRw) rw[k] = prevRw; commit(); refreshRow(k); renderSummary(); renderPick();
    });
  } else seen[k] = NODATE;   // チェックだけでは鑑賞日を付けない（詳細で日付を入れられる）
  commit();
}
// 2026-10-19 までチェックすると当日の日付が入っていた。その日のチェック分は日付なしに直す（端末ごとに1回）
const MIG = "lifetime-films-mig-nodate-20261019";
function migrateNoDate(flag){
  let done = false; try{ done = localStorage.getItem(MIG) === "1" }catch(_){}
  if(done) return false;
  let n = 0;
  for(const k of Object.keys(seen)) if(seen[k] === "2026-10-19"){ seen[k] = NODATE; n++ }
  if(flag){ try{ localStorage.setItem(MIG, "1") }catch(_){} }
  if(n) commit();
  return n > 0;
}
// another viewing on a given day (the first viewing stays in seen[k])
function addView(k, d){
  if(!seen[k]){ seen[k] = d; return }
  if(!dateOf(seen[k])){ seen[k] = d; return }
  if(viewsOf(k).includes(d)) return;
  // keep the earliest date as the first viewing
  if(d < seen[k]){ rw[k] = [...rwOf(k), seen[k]].sort(); seen[k] = d }
  else rw[k] = [...rwOf(k), d].sort();
}
// one tap: "watched today" (first viewing, or one more viewing when already watched)
function watchedToday(k){
  const d = today(), f = byKey.get(k), prevS = seen[k], prevR = rw[k] ? [...rw[k]] : undefined;
  if(seen[k] && viewsOf(k).includes(d)) return;
  const again = !!dateOf(seen[k]);
  addView(k, d); commit();
  refreshRow(k); renderSummary(); renderPick(); renderStats();
  offerUndo(`『${f ? f.t : "作品"}』を${again ? "今日もう一度観た" : "今日観た"}と記録しました`, ()=>{
    if(prevS === undefined) delete seen[k]; else seen[k] = prevS;
    if(prevR === undefined) delete rw[k]; else rw[k] = prevR;
    commit(); refreshRow(k); renderSummary(); renderPick(); renderStats();
  });
}
function toggleWant(k){
  if(want[k]) delete want[k]; else want[k] = today();
  commit();
}

// ---------- filters ----------
function fillListSelect(){
  const ls = $("list"), cur = ls.value;
  ls.innerHTML = `<option value="">全リスト</option>` + allKeys().map(k=>`<option value="${k}">${esc(DATA.lists[k].name)}</option>`).join("");
  ls.value = allKeys().includes(cur) ? cur : "";
  if(ls.value !== cur){ state.list = ls.value }
}
function buildControls(){
  const ls = $("list");
  fillListSelect();
  const decs = [...new Set(films.map(f=>Math.floor(f.y/10)*10))].sort();
  $("decade").innerHTML = `<option value="">全年代</option>` + decs.map(d=>`<option value="${d}">${d}年代</option>`).join("");
  const cc = {}; films.forEach(f=>(f.c||"").split("/").filter(Boolean).forEach(c=>cc[c]=(cc[c]||0)+1));
  $("country").innerHTML = `<option value="">全製作国</option>` + Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([c,n])=>`<option value="${c}">${CN[c]||c}（${n}）</option>`).join("");
  const sc = {}; for(const f of films) for(const x of ((f.v && f.v.sub) || [])) sc[x] = (sc[x]||0)+1;
  for(const [,nm] of SVC) if(nm !== "その他" && !(nm in sc)) sc[nm] = 0;
  $("svcOpts").innerHTML = Object.entries(sc).sort((a,b)=>b[1]-a[1]).map(([nm])=>`<option value="s:${esc(nm)}">${esc(nm)}で見放題</option>`).join("");
  $("stats").addEventListener("click", e=>{ const j = e.target.closest(".jmp"); if(j) navigate(j.dataset.k, "__stats") });
  for(const [id,key] of [["country","country"],["jpf","jp"],["rec","rec"]])
    $(id).addEventListener("change", e=>{ state[key]=e.target.value; state.shown=PAGE; renderList() });
  renderLegend();
  let qTimer = null;
  $("q").addEventListener("input", e=>{ clearTimeout(qTimer); qTimer = setTimeout(()=>{ state.q=e.target.value.trim(); state.shown=PAGE; renderList() }, 250) });
  ls.addEventListener("change", e=>{ state.list=e.target.value; state.shown=PAGE; renderList() });
  $("decade").addEventListener("change", e=>{ state.decade=e.target.value; state.shown=PAGE; renderList() });
  $("sort").addEventListener("change", e=>{ state.sort=e.target.value; state.shown=PAGE; viewStack.length = 0; updateBack(); renderList() });
  $("backBtn").addEventListener("click", popView);
  document.addEventListener("keydown", e=>{ if(e.key === "Escape" && viewStack.length && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) popView() });
  for(const [id,v] of WATCH_BTNS){
    $(id).addEventListener("click", ()=>{ state.watch=v; state.shown=PAGE; syncWatchBtns(); renderList() });
  }
  $("reel").addEventListener("change", e=>{
    const inp = e.target.closest(".seenDate, .addView"); if(!inp) return;
    const li = inp.closest(".row"), k = li.dataset.k; if(!seen[k]) return;
    const ok = /^\d{4}-\d{2}-\d{2}$/.test(inp.value);
    if(inp.classList.contains("seenDate")) seen[k] = ok ? inp.value : NODATE;
    else if(ok) addView(k, inp.value);
    else return;
    commit(); refreshRow(k); renderStats();
  });
  $("more").addEventListener("click", ()=>{ state.shown+=PAGE*2; renderList() });
  $("reel").addEventListener("click", e=>{
    const lk = e.target.closest(".lk");
    if(lk){
      const by = lk.dataset.sort, k = lk.closest(".row").dataset.k;
      pushView(k);
      state.sort = by === "year" ? (state.sort === "year" ? "decade" : "year") : by;
      $("sort").value = state.sort;
      jumpTo(k);
      return;
    }
    const tb = e.target.closest(".todayb");
    if(tb){ watchedToday(tb.closest(".row").dataset.k); return }
    const rv = e.target.closest(".rmview");
    if(rv){ const k = rv.closest(".row").dataset.k; rw[k] = rwOf(k).filter(d=>d !== rv.dataset.d); if(!rw[k].length) delete rw[k]; commit(); refreshRow(k); renderStats(); return }
    const wb = e.target.closest(".wantb");
    if(wb){
      const k = wb.closest(".row").dataset.k; toggleWant(k);
      wb.setAttribute("aria-pressed", !!want[k]); wb.textContent = want[k] ? "★ 観たい" : "☆ 観たい";
      renderSummary(); renderPick(); return;
    }
    const jm = e.target.closest(".jmp");
    if(jm){ navigate(jm.dataset.k, jm.closest(".row").dataset.k); return }
    const op = e.target.closest(".open");
    if(op){ const k = op.closest(".row").dataset.k, old = openKey; openKey = openKey===k ? null : k; if(old && old !== k) refreshRow(old); refreshRow(k); return }
    const pl = e.target.closest(".pill");
    if(pl){
      const li = pl.closest(".row"), k = li.dataset.k;
      if(pl.dataset.svc) setInfo(k, c=>{ const i=c.st.indexOf(pl.dataset.svc); i<0 ? c.st.push(pl.dataset.svc) : c.st.splice(i,1) });
      else setInfo(k, c=>{ c.disc = pl.dataset.disc });
      li.outerHTML = rowHTML(byKey.get(k));
      return;
    }
    const b = e.target.closest(".chk"); if(!b) return;
    const li = b.closest(".row"); const k = li.dataset.k;
    toggle(k);
    const on = !!seen[k];
    li.classList.toggle("done", on); b.setAttribute("aria-checked", on);
    li.querySelector(".when").textContent = on ? whenTxt(k) : "";
    if(openKey === k){ li.outerHTML = rowHTML(byKey.get(k)) }
    renderSummary(); renderPick();
  });
}
const WATCH_BTNS = [["fAll","all"],["fTodo","todo"],["fDone","done"],["fWant","want"]];
function syncWatchBtns(){ for(const [b,v] of WATCH_BTNS) $(b).setAttribute("aria-pressed", state.watch===v) }
// put every control back in line with state (used when a view is restored)
function syncControls(){
  $("q").value = state.q; $("list").value = state.list; $("decade").value = state.decade; $("country").value = state.country;
  $("jpf").value = state.jp; $("rec").value = state.rec; $("sort").value = state.sort; syncWatchBtns();
}
// open a film from elsewhere on the page (same-director list, today's pick); one click on the back button returns
function navigate(k, fromK){
  pushView(fromK || openKey || k);
  if(!filtered().some(f=>f.k===k)){
    Object.assign(state, {tier:null, list:"", decade:"", country:"", jp:"", rec:"", q:"", watch:"all"});
    syncControls(); renderSummary();
  }
  openKey = k;
  jumpTo(k);
}

function renderLegend(){
  $("legend").innerHTML = `<span>帯の並び：</span>` + allKeys().map(k=>`<span><code>${esc(shortOf(k))}</code></span>`).join("");
}
const COL = new Intl.Collator("ja");
const dirKey = f => (f.d || "").split(/[、,]/)[0].trim();
const ctryKey = f => cname((f.c || "").split("/")[0]);
const decOf = f => f.y ? Math.floor(f.y/10)*10 : 0;
function groupOf(f){
  if(state.sort === "director") return dirKey(f) || "監督不明";
  if(state.sort === "country") return f.c ? ctryKey(f) : "製作国不明";
  if(state.sort === "decade") return f.y ? `${decOf(f)}年代` : "年不明";
  return null;
}
// search key: full/half width, hiragana/katakana, ヴ/バ, roman numerals and punctuation all fold to one spelling
function normS(x){
  let s = String(x||"").normalize("NFKC").toLowerCase();
  s = s.replace(/[\u3041-\u3096]/g, c=>String.fromCharCode(c.charCodeAt(0)+0x60));
  s = s.replace(/ヴァ/g,"バ").replace(/ヴィ/g,"ビ").replace(/ヴェ/g,"ベ").replace(/ヴォ/g,"ボ").replace(/ヴ/g,"ブ").replace(/ヂ/g,"ジ").replace(/ヅ/g,"ズ");
  s = s.replace(/パート|ぱーと/g,"part").replace(/\bpart\s*(iii|ii|iv|i|v)\b/g,(m,r)=>"part"+({i:1,ii:2,iii:3,iv:4,v:5}[r]));
  s = s.replace(/&/g,"and");
  return s.replace(/[\s・･、。,.!?！？:;'"“”‘’「」『』【】\[\]()（）〈〉《》\/\-‐–—~〜～＝=+*★☆♪…]/g,"");
}
function skOf(f){
  if(!f._sk){ const names = [f.t, f.en, ...(f.al||[])]; f._sk = normS([...names, f.d, cname(f.c), f.y].join(" ")) + "|" + names.map(normS).join("|") + "|" + names.map(x=>normS(String(x||"").replace(/\b(part|パート)\s*/gi,"part"))).join("|") }
  return f._sk;
}
function filtered(){
  const qWhole = normS(state.q), q = state.q ? state.q.split(/[\s　]+/).map(normS).filter(Boolean) : [];
  let out = films.filter(f=>{
    if(state.tier && tierOf(f.sc)!==state.tier) return false;
    if(state.list && !(state.list in f.s)) return false;
    if(state.decade && Math.floor(f.y/10)*10 !== +state.decade) return false;
    if(state.country && !(f.c||"").split("/").includes(state.country)) return false;
    if(state.jp && f.j!==state.jp) return false;
    if(state.rec==="sub" && !subOf(f).length) return false;
    if(state.rec==="any" && !vodAny(f)) return false;
    if(state.rec==="nostream" && !(f.v && !vodAny(f))) return false;
    if(state.rec==="unk" && vodKnown(f)) return false;
    if(state.rec.startsWith("s:") && !subOf(f).includes(state.rec.slice(2))) return false;
    if(state.rec==="disc" && !(info[f.k] && info[f.k].disc==="y")) return false;
    if(state.watch==="todo" && seen[f.k]) return false;
    if(state.watch==="done" && !seen[f.k]) return false;
    if(state.watch==="want" && (!want[f.k] || seen[f.k])) return false;
    if(q.length && !q.every(w=>skOf(f).includes(w)) && !skOf(f).includes(qWhole)) return false;
    return true;
  });
  if(state.sort==="year") out = out.slice().sort((a,b)=>(a.y||9999)-(b.y||9999) || a.id-b.id);
  else if(state.sort==="decade") out = out.slice().sort((a,b)=>(decOf(a)||9999)-(decOf(b)||9999) || a.id-b.id);
  else if(state.sort==="director") out = out.slice().sort((a,b)=>(!dirKey(a))-(!dirKey(b)) || COL.compare(dirKey(a),dirKey(b)) || a.y-b.y);
  else if(state.sort==="country") out = out.slice().sort((a,b)=>(!a.c)-(!b.c) || COL.compare(ctryKey(a),ctryKey(b)) || a.id-b.id);
  else if(state.sort==="yeard") out = out.slice().sort((a,b)=>b.y-a.y || a.id-b.id);
  else if(state.list && state.list!=="b1001" && state.list!=="bfi_jp") out = out.slice().sort((a,b)=>a.s[state.list]-b.s[state.list] || a.id-b.id);
  return out;
}

const esc = s => String(s).replace(/[&<>"]/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const CHECK = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M3 8.5l3.2 3L13 4.5"/></svg>`;
// ---------- streaming: Claude's survey (Filmarks) and your own records, shown as one ----------
const atJa = at => at ? `${at.slice(0,4)}年${+at.slice(5,7)}月` : "";
// months since the survey; past 3 months the result is shown as "needs a fresh look"
const ageM = at => { if(!at) return 0; const d = new Date(); return (d.getFullYear()*12 + d.getMonth()) - (+at.slice(0,4)*12 + (+at.slice(5,7)-1)) };
const stale = f => !!(f.v && ageM(f.v.at) > 3);
const ownSvc = f => ((info[f.k] && info[f.k].st) || []).map(id=>SVCN[id]).filter(Boolean);
const subOf = f => [...new Set([...((f.v && f.v.sub) || []), ...ownSvc(f)])];
const paidOf = f => f.v ? [...new Set([...f.v.rent, ...f.v.buy])] : [];
const vodAny = f => subOf(f).length > 0 || paidOf(f).length > 0;
const vodKnown = f => !!f.v || ownSvc(f).length > 0;
function vodTag(f){
  const subs = subOf(f), v = f.v, own = ownSvc(f);
  if(!vodKnown(f)) return "";
  const old = stale(f) ? " old" : "";
  const src = [v ? `Claude調べ（Filmarks、${atJa(v.at)}時点${stale(f) ? "・要再確認" : ""}）` : "", own.length ? `自分の記録：${own.join("、")}` : ""].filter(Boolean).join("／");
  if(subs.length) return `<span class="vod${old}" title="見放題：${esc(subs.join("、"))}／${esc(src)}">見放題 ${esc(subs.slice(0,2).join("・"))}${subs.length>2?" ほか":""}${old ? " ？" : ""}</span>`;
  if(paidOf(f).length) return `<span class="vod r${old}" title="レンタル：${esc(v.rent.join("、")||"なし")}／購入：${esc(v.buy.join("、")||"なし")}／${esc(src)}">レンタル・購入のみ${old ? " ？" : ""}</span>`;
  return `<span class="vod x${old}" title="${esc(src)}">配信なし${v && v.dc?"・宅配レンタルあり":""}${old ? " ？" : ""}</span>`;
}
function vodBlock(f){
  const v = f.v; if(!v) return "";
  const L = a => a.length ? esc(a.join("、")) : "なし";
  const link = v.fid ? (String(v.fid).includes("/") ? `https://filmarks.com/${v.fid}/vod` : `https://filmarks.com/movies/${v.fid}/vod`) : "";
  const lnk = txt => link ? `<a href="${link}" target="_blank" rel="noopener" style="color:var(--accent)">${txt}</a>` : txt;
  return `<h4>配信状況（Claude調べ・${atJa(v.at)}時点）${stale(f) ? ` <span class="unsure">要再確認</span>` : ""}</h4><dl>
      <dt>見放題</dt><dd>${L(v.sub)}</dd><dt>レンタル</dt><dd>${L(v.rent)}</dd><dt>購入</dt><dd>${L(v.buy)}</dd>
      <dt>宅配レンタル</dt><dd>${v.dc ? "TSUTAYA DISCAS（DVD/BD）" : "掲載なし"}</dd></dl>
    <p class="note">${v.nf ? `Filmarksに作品ページが見つからなかったため、配信なしとして記録しました（${atJa(v.at)}時点）。` : stale(f) ? `調べてから${ageM(v.at)}か月たっています。配信は入れ替わるので、${lnk("Filmarksの配信ページ")}で今の状況を確かめてください。` : `Filmarksの配信ページを元に記録しました。配信は入れ替わるので、観る前に${lnk("最新の状況")}を確認してください。`}</p>`;
}
// ---------- other films by the same director ----------
const dirsOf = f => (f.d || "").split(/[、,／\/]| と /).map(s=>s.trim()).filter(Boolean);
let DIRIDX = null;
function sameDir(f){
  if(!DIRIDX){ DIRIDX = new Map(); for(const g of films) for(const d of dirsOf(g)){ const a = DIRIDX.get(d) || []; a.push(g); DIRIDX.set(d, a) } }
  const out = new Map();
  for(const d of dirsOf(f)) for(const g of (DIRIDX.get(d) || [])) if(g.k !== f.k) out.set(g.k, g);
  return [...out.values()].sort((a,b)=>(a.y||9999)-(b.y||9999));
}
function sameBlock(f){
  if(!dirsOf(f).length) return "";
  const xs = sameDir(f);
  if(!xs.length) return `<div class="full"><h4>同じ監督の作品</h4><p class="note" style="margin:0">このリストに入っている作品は、これ1本です。</p></div>`;
  const todo = xs.filter(g=>!seen[g.k]).length;
  return `<div class="full"><h4>同じ監督のリスト内作品 ${xs.length}本（未見 ${todo}本）</h4><ul class="same">${xs.map(g=>
    `<li><button class="jmp" data-k="${g.k}">${esc(g.t)}</button><span class="m">${g.y||"—"}・スコア${Math.round(g.sc)}</span>${seen[g.k] ? `<span class="ok">✓ 鑑賞済</span>` : ""}${!seen[g.k] && want[g.k] ? `<span class="m" style="color:var(--accent)">★ 観たい</span>` : ""}${subOf(g).length ? `<span class="m">見放題あり</span>` : ""}</li>`).join("")}</ul></div>`;
}
function rowHTML(f){
  const on = !!seen[f.k];
  const strip = allKeys().map(k=>`<i class="${k==="b1001"?"base ":""}${k.startsWith("c_")?"cu ":""}${k in f.s?"on":""}" title="${esc(DATA.lists[k].name)}${k in f.s ? rankText(k,f.s[k]) : ""}"></i>`).join("");
  const lists = allKeys().filter(k=>k in f.s).map(shortOf).join(" · ");
  const url = "https://www.google.com/search?q=" + encodeURIComponent(`${f.t} ${f.y} 映画`);
  const inf = info[f.k] || {}, st = inf.st || [];
  const isOpen = openKey === f.k;
  const tags = vodTag(f) + (inf.disc==="y" ? `<span class="disc-tag">DVD/BD</span>` : "");
  const dir = f.d ? esc(f.d) : `<span class="unsure">監督 要確認</span>`;
  const qt = encodeURIComponent(f.t.replace(/（.*?）/g,""));
  const detail = !isOpen ? "" : `<div class="detail">
      <div><h4>基本情報</h4><dl>
        <dt>監督</dt><dd>${dir}${f.u && f.d ? ` <span class="unsure">（要確認）</span>` : ""}</dd>
        <dt>製作国</dt><dd>${esc(cname(f.c))}</dd>
        ${on ? `<dt>鑑賞日</dt><dd><input type="date" class="seenDate dt" value="${dateOf(seen[f.k])}" aria-label="最初に観た日"> <span class="mm">${dateOf(seen[f.k]) ? "最初に観た日" : "空欄なら日付なし"}</span></dd>
        ${rwOf(f.k).length ? `<dt>再鑑賞</dt><dd class="views">${rwOf(f.k).map(d=>`<span>${d}<button type="button" class="rmview" data-d="${d}" aria-label="${d}の再鑑賞を消す">×</button></span>`).join("")}</dd>` : ""}
        <dt>もう一度観た</dt><dd><input type="date" class="addView dt" aria-label="もう一度観た日を足す"> <span class="mm">日付を選ぶと再鑑賞として足します</span></dd>` : ""}
        <dt>公開年</dt><dd>${f.y || "要確認"}${f.note ? `<span class="mm">（${esc(f.note)}）</span>` : ""}</dd>
        <dt>上映時間</dt><dd>${f.rt ? `${f.rt}分${f.rt >= 60 ? `（${Math.floor(f.rt/60)}時間${f.rt%60 ? `${f.rt%60}分` : ""}）` : ""}<span class="mm">　${f.rts === "t" ? "TMDBの登録値" : "Claudeの知識による目安"}</span>` : `<span class="mm">未確認</span>`}</dd>
        <dt>原題・英題</dt><dd>${esc(f.en || "—")}</dd>
        <dt>日本での入手性</dt><dd>${f.j ? JP[f.j]+"（目安）" : "未確認（追加リストの新規作品）"}</dd>
        <dt>スコア</dt><dd>${Math.round(f.sc)}（全映画対象のリスト ${f.gh}/${f.ge}、専門リスト ${f.sh}/${f.se}）</dd>
        <dt>掲載リスト</dt><dd>${allKeys().filter(k=>k in f.s).map(k=>esc(DATA.lists[k].name)+rankText(k,f.s[k])).join("<br>")}</dd>
      </dl></div>
      <div>${vodBlock(f)}<h4${f.v ? ` style="margin-top:14px"` : ""}>見放題で観られるサービス（自分で確かめたもの）</h4>
        <div class="pills">${SVC.map(([id,nm])=>`<button class="pill" data-svc="${id}" aria-pressed="${st.includes(id)}">${nm}</button>`).join("")}</div>
        <h4 style="margin-top:14px">国内DVD／Blu-ray</h4>
        <div class="pills">${DISC.map(([v,nm])=>`<button class="pill" data-disc="${v}" aria-pressed="${(inf.disc||"")===v}">${nm}</button>`).join("")}</div>
        <p class="note">${inf.at ? `最終更新 ${inf.at}。` : ""}ここで選んだサービスは「見放題あり」の絞り込みや一覧の表示に、Claude調べの結果と合わせて使います。</p>
        <h4 style="margin-top:14px">調べる</h4>
        <div class="links">
          <a href="https://www.justwatch.com/jp/%E6%A4%9C%E7%B4%A2?q=${qt}" target="_blank" rel="noopener">JustWatch（配信）</a>
          <a href="https://filmarks.com/search/movies?q=${qt}" target="_blank" rel="noopener">Filmarks</a>
          <a href="https://www.amazon.co.jp/s?k=${qt}+${encodeURIComponent("DVD Blu-ray")}" target="_blank" rel="noopener">Amazon（DVD/BD）</a>
          <a href="${url}" target="_blank" rel="noopener">Google</a>
        </div></div>
      ${sameBlock(f)}
    </div>`;
  return `<li class="row${on?" done":""}" data-k="${f.k}">
    <button class="chk" role="checkbox" aria-checked="${on}" aria-label="${esc(f.t)} を鑑賞済みにする">${CHECK}</button>
    <span class="no">${f.id}</span>
    <div class="ttl"><a href="${url}" target="_blank" rel="noopener">${esc(f.t)}</a>
      <div class="sub"><button class="lk yr${state.sort==="year"||state.sort==="decade"?" on":""}" data-sort="year" data-v="${f.y||0}" title="公開年順に並べる（もう一度押すと年代順）">${f.y || "年不明"}</button>${f.rt ? `<span class="yr">${f.rt}分</span>` : ""}${f.d ? `<button class="lk${state.sort==="director"?" on":""}" data-sort="director" data-v="${esc(dirKey(f))}" title="監督順に並べる">${esc(f.d)}</button>` : dir}${f.c ? `<button class="lk${state.sort==="country"?" on":""}" data-sort="country" data-v="${esc(ctryKey(f))}" title="製作国順に並べる">${esc(cname(f.c))}</button>` : `<span>${esc(cname(f.c))}</span>`}${f.j ? `<span class="jp ${f.j}" title="${JP[f.j]}">${JPS[f.j]}</span>` : ""}${tags}<span class="when">${on ? whenTxt(f.k) : ""}</span></div>
      <div class="sub">${f.en?`<span>${esc(f.en)}</span>`:""}<button class="todayb" title="${on && dateOf(seen[f.k]) ? "今日の日付で再鑑賞を記録" : "今日の日付で鑑賞済みにする"}">${on && dateOf(seen[f.k]) ? "今日また観た" : "今日観た"}</button><button class="wantb" aria-pressed="${!!want[f.k]}" title="観たい印（「観たい」で絞り込めます）">${want[f.k] ? "★ 観たい" : "☆ 観たい"}</button><button class="open" aria-expanded="${isOpen}">${isOpen ? "閉じる" : "詳細・配信・同じ監督"}</button></div></div>
    <div class="score${tierOf(f.sc)==="s"?" hi":""}" title="全映画リスト${f.gh}/${f.ge}・専門リスト${f.sh}/${f.se}：${esc(lists)}"><b>${Math.round(f.sc)}</b>${f.n}/${f.e}リスト</div>
    <div class="strip" aria-label="${esc(lists)}">${strip}</div>${detail}
  </li>`;
}
// one-click return: remember the view before a click-sort
const viewStack = [];
const SORT_NM = {score:"優先度順", year:"公開年順", yeard:"新しい順", decade:"年代順", director:"監督順", country:"製作国順"};
function pushView(k){
  // remember where the clicked film sat on screen, so the return trip can put it back in the same spot
  const row = k && document.querySelector(`.row[data-k="${k}"]`);
  viewStack.push({st: {...state}, open: openKey, y: window.scrollY, k, top: row ? row.getBoundingClientRect().top : null});
  updateBack();
}
function updateBack(){
  const b = $("backBtn");
  if(!viewStack.length){ b.hidden = true; return }
  b.hidden = false;
  const top = viewStack[viewStack.length-1];
  b.textContent = top.st.sort !== state.sort ? `← ${SORT_NM[top.st.sort] || "元の並び"}に戻る` : "← 前の画面に戻る";
}
// height of the sticky filter bar (0 on phones, where it scrolls away)
function stickyH(){
  const c = document.querySelector(".controls");
  return c && getComputedStyle(c).position === "sticky" ? c.getBoundingClientRect().height : 0;
}
// Rows far from the screen are laid out with an estimated height until they are drawn,
// so one scroll can land in the wrong place. Keep nudging until the element stays put.
let settleId = 0;
function settleTo(getEl, wantTop){
  const id = ++settleId; let n = 0, still = 0;
  const step = ()=>{
    if(id !== settleId) return;
    const el = getEl(); if(!el) return;
    const d = el.getBoundingClientRect().top - wantTop();
    if(Math.abs(d) > 1){ window.scrollBy(0, d); still = 0 } else still++;
    if(++n < 40 && still < 3) requestAnimationFrame(step);
  };
  step();
}
// the user taking over the scroll ends any pending correction
for(const ev of ["wheel","touchmove"]) window.addEventListener(ev, ()=>{ settleId++ }, {passive:true});
function flash(k){
  const row = document.querySelector(`.row[data-k="${k}"]`);
  if(row){ row.classList.add("flash"); setTimeout(()=>row.classList.remove("flash"), 1800) }
}
function popView(){
  const v = viewStack.pop(); if(!v) return;
  const tierChanged = v.st.tier !== state.tier;
  state = {...v.st}; openKey = v.open; syncControls();
  if(tierChanged) renderSummary();
  renderList(v.k && filtered().some(f=>f.k===v.k) ? v.k : true); updateBack();
  const sel = `.row[data-k="${v.k}"]`;
  if(v.k && document.querySelector(sel)){
    const want = v.top !== null && v.top > stickyH() && v.top < window.innerHeight - 40 ? v.top : stickyH() + 8;
    settleTo(()=>document.querySelector(sel), ()=>want);
  } else window.scrollTo(0, v.y);
  flash(v.k);
}
// re-render in the new order and bring the clicked film's group into view
function jumpTo(k){
  const rows = filtered(), i = rows.findIndex(f=>f.k===k);
  const f = rows[i];
  // first film of the same group (director / country / decade) or the same year
  let start = i;
  if(f){
    const g = groupOf(f);
    if(state.sort === "year") while(start > 0 && rows[start-1].y === f.y) start--;
    else if(g !== null) while(start > 0 && groupOf(rows[start-1]) === g) start--;
  }
  renderList(k);
  if(i < 0) return;
  const rowSel = `.row[data-k="${k}"]`;
  const g = groupOf(f);
  const headEl = () => g !== null ? [...document.querySelectorAll("li.grp")].find(li=>li.dataset.g===g)
                     : start !== i ? document.querySelector(`.row[data-k="${rows[start].k}"]`) : null;
  const top = () => stickyH() + 8;
  // show the group from its heading, unless that would push the clicked film off the screen
  const before = i - start;
  const est = (document.querySelector(rowSel) || {}).offsetHeight || 90;
  const useHead = headEl() && before * est < window.innerHeight - top() - est * 2;
  settleTo(useHead ? headEl : ()=>document.querySelector(rowSel), top);
  flash(k);
}
// draw the first rows at once and the rest in small batches, so typing and tapping stay quick on phones
let listGen = 0;
const FIRST = 60, BATCH = 120;
function renderList(until){
  const rows = filtered();
  const gen = ++listGen;
  const counts = {};
  const grouped = state.sort==="director"||state.sort==="country"||state.sort==="decade";
  if(grouped) for(const f of rows){ const g = groupOf(f); counts[g] = (counts[g]||0)+1 }
  let pos = 0, prev = null;
  const chunk = n => {
    let html = "";
    const end = Math.min(rows.length, pos + n);
    for(; pos < end; pos++){
      const f = rows[pos], g = grouped ? groupOf(f) : null;
      if(g !== null && g !== prev){ html += `<li class="grp" data-g="${esc(g)}">${esc(g)}<small>${counts[g]}本</small></li>`; prev = g }
      html += rowHTML(f);
    }
    return html;
  };
  let need = FIRST, anchor = null;
  // a plain refresh keeps the film at the top of the screen where it was
  if(until === undefined && window.scrollY > 200){
    const top = stickyH();
    for(const li of $("reel").querySelectorAll(".row")){ const r = li.getBoundingClientRect(); if(r.bottom > top){ anchor = {k: li.dataset.k, top: r.top}; break } }
    if(anchor) until = anchor.k;
  }
  if(until === true) need = rows.length;
  else if(until){ const i = rows.findIndex(f=>f.k===until); if(i >= 0) need = Math.max(FIRST, i + 40) }
  $("reel").innerHTML = rows.length ? chunk(need) : `<li class="empty">条件に合う作品はありません。</li>`;
  const more = () => {
    if(gen !== listGen || pos >= rows.length) return;
    $("reel").insertAdjacentHTML("beforeend", chunk(BATCH));
    if(pos < rows.length) setTimeout(more, 16);
  };
  if(pos < rows.length) setTimeout(more, 30);
  if(anchor){ const sel = `.row[data-k="${anchor.k}"]`; settleTo(()=>document.querySelector(sel), ()=>anchor.top) }
  $("more").hidden = true;
  const seenIn = rows.filter(f=>seen[f.k]).length;
  $("count").textContent = `${rows.length}本中 ${seenIn}本 鑑賞済`;
  updateBack();
}
function renderSummary(){
  const total = films.length, s = films.filter(f=>seen[f.k]).length;
  $("seenBig").innerHTML = `${s}<small> / ${total}</small>`;
  document.querySelector(".eyebrow").textContent = `${allKeys().length} lists · ${total.toLocaleString()} films`;
  $("seenBar").style.width = (s/total*100)+"%";
  const nw = films.filter(f=>want[f.k] && !seen[f.k]).length;
  $("fWant").textContent = nw ? `観たい（${nw}）` : "観たい";
  renderStats();
  $("tiers").innerHTML = TIERS.map(t=>{
    const fs = films.filter(f=>tierOf(f.sc)===t.id), d = fs.filter(f=>seen[f.k]).length;
    return `<button class="tier" data-t="${t.id}" aria-pressed="${state.tier===t.id}">
      <span class="lbl"><span class="nm">${t.nm}</span><span class="rng">${t.rng}</span></span>
      <span class="ct">${d}<small> / ${fs.length}</small></span>
      <span class="bar"><i style="width:${fs.length? d/fs.length*100:0}%"></i></span></button>`;
  }).join("");
  $("srcs").innerHTML = allKeys().map(k=>{
    const L = DATA.lists[k], fs = films.filter(f=>k in f.s), d = fs.filter(f=>seen[f.k]).length;
    return `<div class="src"><span class="k">${esc(shortOf(k).slice(0,4))}</span>
      <div>${L.url ? `<a href="${L.url}" target="_blank" rel="noopener">${esc(L.name)}</a>` : esc(L.name)}<div class="nt">${esc(L.note)}・${fs.length}作品</div></div>
      <span class="pg">${d}/${fs.length}</span></div>`;
  }).join("");
}
$("tiers").addEventListener("click", e=>{
  const b = e.target.closest(".tier"); if(!b) return;
  state.tier = state.tier===b.dataset.t ? null : b.dataset.t; state.shown=PAGE;
  renderSummary(); renderList();
});
function renderAll(){ renderSummary(); renderList(); renderPick() }

// ---------- today's pick ----------
let pickKey = null, pickDay = null, pickN = 0;
function pickPool(){
  const t = $("pTier").value, dec = $("pDec").value, cty = $("pCty").value, vod = $("pVod").value, onlyWant = $("pWant").checked, len = +$("pLen").value;
  return films.filter(f=>{
    if(seen[f.k]) return false;
    const tr = tierOf(f.sc);
    if(t === "sa" && !(tr === "s" || tr === "a")) return false;
    if(t === "sab" && !(tr === "s" || tr === "a" || tr === "b")) return false;
    if(dec && decOf(f) !== +dec) return false;
    if(cty && !(f.c||"").split("/").includes(cty)) return false;
    if(vod === "sub" && !subOf(f).length) return false;
    if(vod === "any" && !vodAny(f)) return false;
    if(onlyWant && !want[f.k]) return false;
    if(len && (!f.rt || (len > 150 ? f.rt <= 150 : f.rt > len))) return false;
    return true;
  });
}
const hashStr = s => { let h = 2166136261; for(const ch of s){ h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) } return h >>> 0 };
function choosePick(fresh){
  const pool = pickPool();
  if(!pool.length){ pickKey = null; return pool }
  if(fresh){
    // a different film each press; avoid repeating the current one when possible
    let f; do { f = pool[Math.floor(Math.random()*pool.length)] } while(pool.length > 1 && f.k === pickKey);
    pickKey = f.k; pickN++;
  } else if(!pickKey || !pool.some(f=>f.k===pickKey)){
    // the first pick of the day stays the same until the day changes or conditions change
    const sig = today() + "|" + $("pTier").value + $("pDec").value + $("pCty").value + $("pVod").value + $("pLen").value + $("pWant").checked;
    pickKey = pool[hashStr(sig) % pool.length].k;
  }
  return pool;
}
function renderPick(){
  if(!$("pTier")) return;
  const pool = choosePick(false);
  const f = pickKey && byKey.get(pickKey);
  if(!f){
    $("pickCard").innerHTML = `<p class="note" style="margin:0">条件に合う未見の作品がありません。条件をゆるめてください。</p>`;
    return;
  }
  const v = f.v;
  const subs = subOf(f), own = ownSvc(f);
  const when = v ? `<span>（${own.length ? "Claude調べと自分の記録・" : "Claude調べ・"}${atJa(v.at)}時点${stale(f) ? "・要再確認" : ""}）</span>` : own.length ? `<span>（自分の記録）</span>` : "";
  const vodLine = !vodKnown(f) ? "配信：未調査（詳細からJustWatch・Filmarksで確認できます）"
    : (subs.length ? `見放題：${esc(subs.join("・"))}` : paidOf(f).length ? `レンタル・購入：${esc(paidOf(f).join("・"))}` : `配信なし${v && v.dc ? "（TSUTAYA DISCASの宅配レンタルあり）" : ""}`) + when;
  $("pickCard").innerHTML = `<div style="min-width:0;display:flex;flex-direction:column;gap:4px">
      <div class="pt">${esc(f.t)}</div>
      <div class="pm"><span>${f.y || "年不明"}</span>${f.rt ? `<span>${f.rt}分</span>` : ""}<span>${esc(f.d || "監督 要確認")}</span><span>${esc(cname(f.c))}</span>${f.en ? `<span>${esc(f.en)}</span>` : ""}</div>
      <div class="pm">${vodLine}</div>
      <div class="pm"><span>候補 ${pool.length}本から</span>${want[f.k] ? `<span style="color:var(--accent)">★ 観たい印あり</span>` : ""}</div>
    </div>
    <div class="ps"><b>${Math.round(f.sc)}</b>${TIERS.find(t=>t.id===tierOf(f.sc)).nm}・${f.n}/${f.e}リスト</div>
    <div class="pb">
      <button class="btn pri" id="pAgain">別の1本</button>
      <button class="btn" id="pWantB">${want[f.k] ? "観たい印を外す" : "☆ 観たいに追加"}</button>
      <button class="btn" id="pSeen">鑑賞済みにする</button>
      <button class="btn" id="pOpen">リストで詳細を見る</button>
    </div>`;
}
function initPick(){
  const decs = [...new Set(films.map(decOf).filter(Boolean))].sort();
  $("pDec").innerHTML = `<option value="">年代：すべて</option>` + decs.map(d=>`<option value="${d}">${d}年代</option>`).join("");
  const cc = {}; films.forEach(f=>(f.c||"").split("/").filter(Boolean).forEach(c=>cc[c]=(cc[c]||0)+1));
  $("pCty").innerHTML = `<option value="">製作国：すべて</option>` + Object.entries(cc).sort((a,b)=>b[1]-a[1]).map(([c])=>`<option value="${c}">${CN[c]||c}</option>`).join("");
  for(const id of ["pTier","pDec","pCty","pVod","pLen","pWant"]) $(id).addEventListener("change", ()=>{ pickKey = null; renderPick() });
  $("pickCard").addEventListener("click", e=>{
    const b = e.target.closest("button"); if(!b || !pickKey) return;
    const k = pickKey;
    if(b.id === "pAgain"){ choosePick(true); renderPick() }
    else if(b.id === "pWantB"){ toggleWant(k); renderSummary(); renderList(); renderPick() }
    else if(b.id === "pSeen"){ toggle(k); renderAll(); renderStats() }
    else if(b.id === "pOpen"){ navigate(k, k) }
  });
}

// ---------- progress charts ----------
function hbars(rows){
  return `<div class="hb">${rows.map(([lb, d, n])=>`<span class="lb" title="${esc(lb)}">${esc(lb)}</span><span class="tr"><i style="width:${n ? d/n*100 : 0}%"></i></span><span class="vl">${d}/${n}　${n ? Math.round(d/n*100) : 0}%</span>`).join("")}</div>`;
}
// directors with 3 or more films in the list: how many of each you have seen
function dirStats(){
  const m = new Map();
  for(const f of films) for(const d of dirsOf(f)){ const a = m.get(d) || {n:0, s:0, todo:[]}; a.n++; if(seen[f.k]) a.s++; else a.todo.push(f); m.set(d, a) }
  const rows = [...m.entries()].filter(([,a])=>a.n >= 3);
  const near = rows.filter(([,a])=>a.s > 0 && a.n - a.s <= 2 && a.s < a.n).sort((x,y)=>(x[1].n-x[1].s)-(y[1].n-y[1].s) || y[1].n-x[1].n);
  const full = rows.filter(([,a])=>a.s === a.n).sort((x,y)=>y[1].n-x[1].n);
  const top = rows.sort((x,y)=>y[1].n-x[1].n || y[1].s-x[1].s);
  const nearHTML = near.length ? `<ul class="same" style="margin-bottom:12px">${near.slice(0,20).map(([d,a])=>`<li><b style="font-weight:700">${esc(d)}</b><span class="m">${a.s}/${a.n}本・あと${a.n-a.s}本：</span>${a.todo.sort((x,y)=>y.sc-x.sc).map(f=>`<button class="jmp" data-k="${f.k}">${esc(f.t)}</button>`).join("、")}</li>`).join("")}</ul>` : `<p class="note" style="margin:0 0 10px">あと1〜2本で全作を観終える監督はまだいません。</p>`;
  return `<h4 class="h3" style="margin-bottom:8px">監督別（リストに3本以上ある${top.length}人）</h4>
    <p class="mm" style="margin:0 0 6px">あと少しで全作を観終える監督${full.length ? `（観終えた監督：${full.map(([d,a])=>`${esc(d)} ${a.n}本`).join("、")}）` : ""}</p>${nearHTML}
    <div class="dirbars">${hbars(top.map(([d,a])=>[d, a.s, a.n]))}</div>`;
}
function renderStats(){
  const box = $("stats"); if(!box || !$("statSec").open) return;
  const byDec = new Map();
  for(const f of films){ const d = decOf(f); if(!d) continue; const a = byDec.get(d) || [0,0]; a[1]++; if(seen[f.k]) a[0]++; byDec.set(d, a) }
  const decRows = [...byDec.entries()].sort((a,b)=>a[0]-b[0]).map(([d,[s,n]])=>[`${d}年代`, s, n]);
  const byC = new Map();
  for(const f of films) for(const c of new Set((f.c||"").split("/").filter(Boolean))){ const a = byC.get(c) || [0,0]; a[1]++; if(seen[f.k]) a[0]++; byC.set(c, a) }
  const cRows = [...byC.entries()].sort((a,b)=>b[1][1]-a[1][1]).slice(0,14).map(([c,[s,n]])=>[CN[c]||c, s, n]);
  const tRows = TIERS.map(t=>{ const fs = films.filter(f=>tierOf(f.sc)===t.id); return [t.nm, fs.filter(f=>seen[f.k]).length, fs.length] });
  const lRows = allKeys().map(k=>{ const fs = films.filter(f=>k in f.s); return [DATA.lists[k].name, fs.filter(f=>seen[f.k]).length, fs.length] });
  // viewing counts per calendar year: list films (seen) + films outside the lists (offlist)
  const yr = s => { const m = /^(\d{4})/.exec(String(s||"")); return m ? +m[1] : 0 };
  const ys = new Map();
  let reN = 0;
  for(const k of Object.keys(seen)) for(const d of viewsOf(k)){ const y = yr(d); if(y){ const a = ys.get(y) || [0,0,0]; a[0]++; if(d !== dateOf(seen[k])){ a[2] = (a[2]||0)+1; reN++ } ys.set(y, a) } }
  for(const o of offlist){ const y = yr(o.d); if(y){ const a = ys.get(y) || [0,0,0]; a[1]++; ys.set(y, a) } }
  const undated = Object.values(seen).filter(d=>!yr(d)).length + offlist.filter(o=>!yr(o.d)).length;
  let chart = `<p class="note" style="margin:0">日付つきの鑑賞記録がまだありません。</p>`;
  if(ys.size){
    const y0 = Math.min(...ys.keys()), y1 = Math.max(...ys.keys());
    const all = []; for(let y=y0; y<=y1; y++) all.push([y, ...(ys.get(y) || [0,0,0])]);
    const mx = Math.max(...all.map(([,a,b])=>a+b), 1);
    const step = all.length > 30 ? 5 : all.length > 14 ? 2 : 1;
    chart = `<div class="ycw"><div class="yc" role="img" aria-label="年ごとの鑑賞本数">${all.map(([y,a,b,c])=>`<span class="c" title="${y}年：リスト内 ${a}回${c ? `（うち再鑑賞 ${c}回）` : ""}・リスト外 ${b}本"><b>${a+b || ""}</b><i class="o" style="height:${b/mx*100}%"></i><i style="height:${a/mx*100}%"></i></span>`).join("")}</div>
      <div class="yl">${all.map(([y])=>`<span>${(y - y0) % step === 0 ? String(y).slice(2) : ""}</span>`).join("")}</div></div>
      <div class="key"><span><i></i>リスト内の作品</span><span><i class="o"></i>リスト外の作品</span>${reN ? `<span>再鑑賞 ${reN}回を含む</span>` : ""}${undated ? `<span>日付なし ${undated}本は除く</span>` : ""}</div>`;
  }
  box.innerHTML = `<div class="wide"><h4 class="h3" style="margin-bottom:8px">年ごとの鑑賞回数（鑑賞日の年で集計、再鑑賞も1回と数える、年は西暦の下2桁）</h4>${chart}</div>
    <div><h4 class="h3" style="margin-bottom:8px">優先度別</h4>${hbars(tRows)}</div>
    <div><h4 class="h3" style="margin-bottom:8px">年代別</h4>${hbars(decRows)}</div>
    <div><h4 class="h3" style="margin-bottom:8px">製作国別（作品数の多い14か国、合作は各国に数える）</h4>${hbars(cRows)}</div>
    <div><h4 class="h3" style="margin-bottom:8px">リスト別</h4>${hbars(lRows)}</div>
    <div class="wide">${dirStats()}</div>`;
}

// ---------- importing lists ----------
let IDX = new Map();
function addIdx(key, f){ if(!key) return; const a = IDX.get(key) || []; if(!a.includes(f)) a.push(f); IDX.set(key, a) }
function buildIdx(arr){
  IDX = new Map(); if(typeof buildMain === "function") buildMain(arr);
  for(const f of arr){
    addIdx(normT(f.t), f); addIdx(normT(f.t.replace(/（.*?）/g,"")), f);
    for(const part of f.t.split(/[\/／]/)) if(normT(part).length >= 2) addIdx(normT(part), f);
    if(f.en) addIdx(normT(f.en), f);
    for(const a of (f.al||[])) addIdx(normT(a), f);
  }
}
buildIdx(BASE);
function parseLine(line, idx, useRank){
  let s = line.normalize("NFKC").trim(); if(!s) return null;
  let r = idx + 1;
  const m = s.match(/^(\d{1,4})\s*(?:[.、)\]:位]|\s)\s*/);
  if(m){ if(useRank) r = +m[1]; s = s.slice(m[0].length) }
  let y = 0;
  const yp = s.match(/[(\[]([^()]*?)[)\]]\s*$/);
  if(yp){ const yy = yp[1].match(/(18|19|20)\d{2}/); if(yy) y = +yy[0]; s = s.slice(0, yp.index).trim() }
  if(!y){ const yt = s.match(/\s((?:18|19|20)\d{2})年?$/); if(yt){ y = +yt[1]; s = s.slice(0, yt.index).trim() } }
  s = s.replace(/\s+[-–—\/]\s+.*$/, "").trim();
  return s ? {r, raw: line.trim(), t: s, y} : null;
}
const EDITION_RE = /^(?:ディレクターズ・?カット版?|完全版|特別編|特別版|4kリマスター版?|デジタル・?リマスター版?|リマスター版?|ファイナル・?カット|最終版|オリジナル版|日本語吹替版|吹替版|字幕版|3d|imax|4k|ドルビーシネマ|エクステンデッド版?)+$/;
const PREFIX_RE = /^(?:映画|劇場版|劇場アニメーション|アニメ映画)/;
var MAIN = new Map();
function buildMain(arr){
  MAIN = new Map();
  for(const f of arr){
    const head = f.t.split(/[\s　\/／:：～〜]/)[0];
    const k = normT(head);
    if(k.length >= 4 && k !== normT(f.t)){ const a = MAIN.get(k) || []; a.push(f); MAIN.set(k, a) }
  }
}
buildMain(BASE);
function matchOne(it){
  const yr = c => it.y ? c.filter(f=>!f.y || Math.abs(f.y - it.y) <= 1) : c;
  let n = normT(it.t);
  let c = yr(IDX.get(n) || []);
  if(c.length > 1){ const full = c.filter(f=>normT(f.t)===n || normT(f.en)===n || (f.al||[]).some(x=>normT(x)===n)); if(full.length === 1) c = full }
  if(c.length === 1) return {f:c[0], how:"ok"};
  if(c.length > 1) return {f:null, how:"new", note:"候補が複数（年を付けると照合できます）"};
  // "映画 ○○" / "劇場版 ○○"
  const n2 = normT(it.t.normalize("NFKC").trim().replace(PREFIX_RE, ""));
  if(n2 !== n){ c = yr(IDX.get(n2) || []); if(c.length === 1) return {f:c[0], how:"ok"} }
  // edition suffixes: "○○ ディレクターズカット版"
  const cands = new Set();
  for(const [key, arr] of IDX) if(key.length >= 2 && n2.startsWith(key) && EDITION_RE.test(n2.slice(key.length))) arr.forEach(f=>cands.add(f));
  // short form of a title with a subtitle: "ブックスマート" for "ブックスマート 卒業前夜の…"
  (MAIN.get(n2) || []).forEach(f=>cands.add(f));
  c = yr([...cands]);
  if(c.length === 1) return {f:c[0], how:"guess"};
  return {f:null, how:"new"};
}
let pendingImport = null;
function runCheck(){
  const name = $("fName").value.trim(), lines = $("fText").value.split(/\r?\n/);
  const useRank = $("fRank").checked;
  const items = []; lines.forEach(l=>{ const p = parseLine(l, items.length, useRank); if(p) items.push(p) });
  if(!items.length){ $("fPrev").innerHTML = `<p class="method">作品が1行も読み取れませんでした。1行に1作品ずつ貼り付けてください。</p>`; $("fSave").disabled = true; return }
  const res = items.map(it=>({it, ...matchOne(it)}));
  const ok = res.filter(x=>x.how==="ok" && x.f).length, guess = res.filter(x=>x.how==="guess" && x.f).length, nw = res.filter(x=>!x.f).length;
  pendingImport = {name: name || "追加リスト", res};
  $("fPrev").innerHTML = `<p class="sum">${items.length}作品を読み取りました：一致 ${ok}・推定一致 ${guess}・新規 ${nw}</p>
    ${guess ? `<div><p class="method" style="margin:0">推定一致（違っていたら元の行に公開年を付けるか表記を直して再照合してください）</p><ul>${res.filter(x=>x.how==="guess"&&x.f).map(x=>`<li><span class="tag guess">推定</span>${esc(x.it.raw)} → ${esc(x.f.t)}（${x.f.y}）</li>`).join("")}</ul></div>` : ""}
    ${nw ? `<div><p class="method" style="margin:0">既存の作品と照合できなかった行${$("fNew").checked ? "（新しい作品として追加されます）" : "（集計には入りません）"}</p><ul>${res.filter(x=>!x.f).map(x=>`<li><span class="tag new">新規</span>${esc(x.it.raw)}${x.note ? `（${x.note}）` : ""}</li>`).join("")}</ul></div>` : ""}`;
  $("fSave").disabled = false;
}
async function saveImport(){
  if(!pendingImport) return;
  const id = Date.now().toString(36);
  customs[id] = {name: pendingImport.name, src: $("fSrc").value.trim(), ranked: $("fRank").checked, addNew: $("fNew").checked,
    scope: $("fScope").value, end: parseInt($("fEnd").value,10) || 0,
    created: today(), include: true,
    items: pendingImport.res.map(x=>({r:x.it.r, raw:x.it.raw, t:x.it.t, y:x.it.y || (x.f ? x.f.y : 0), k: x.f ? x.f.k : null}))};
  pendingImport = null;
  $("fText").value = ""; $("fName").value = ""; $("fSrc").value = ""; $("fPrev").innerHTML = `<p class="sum">保存しました。集計に反映されています。</p>`; $("fSave").disabled = true;
  await afterCustomChange();
}
async function afterCustomChange(){
  recompute(); fillListSelect(); renderLegend();
  promoteOff();
  renderAll(); renderMine();
  await saveCustoms();
}
// off-list watched films that now match a film in the list move into "seen"
function promoteOff(){
  if(!offlist.length) return;
  buildIdx(films);
  const keep = []; let moved = 0;
  for(const o of offlist){
    const m = matchOne({t:o.t, y:o.y});
    if(m.f && m.how === "ok"){ if(!seen[m.f.k]) seen[m.f.k] = o.d || NODATE; moved++ } else keep.push(o);
  }
  buildIdx(BASE);
  if(moved){ offlist = keep; lsWrite(); schedule(); saveOff(); renderOff() }
}

// ---------- watched-history import ----------
const DATE_RE = /((?:19|20)\d{2})\s*[\/\-.年]\s*(\d{1,2})\s*[\/\-.月]\s*(\d{1,2})\s*日?/;
const JUNK_RE = /^(?:[★☆\d\s.:\/点分%]+|鑑賞日.*|鑑賞した映画.*|観た映画.*|評価.*|レビュー.*|もっと見る|次へ|前へ|\d+件.*|ページ.*|マイページ.*|お気に入り.*|観た|見た|鑑賞済み?|監督.*|出演.*|製作国.*|上映時間.*|ジャンル.*)$/;
function parseWatched(text){
  const out = [];
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const head = (lines[0]||"").normalize("NFKC");
  // KINENOTE export (TSV): 状態 / 映画タイトル / 映画評点 / 鑑賞年 ...
  if(/映画タイトル/.test(head) && /鑑賞年/.test(head)){
    const cols = head.split("\t"), it = cols.indexOf("映画タイトル"), id = cols.indexOf("鑑賞年");
    for(const ln of lines.slice(1)){
      const c = ln.split("\t"); if(!c[it]) continue;
      let t = c[it].normalize("NFKC").trim(), y = 0;
      const ym = t.match(/[(（]((?:18|19|20)\d{2})[)）]\s*$/); if(ym){ y = +ym[1]; t = t.slice(0, ym.index).trim() }
      const dm = (c[id]||"").match(DATE_RE);
      out.push({t, y, d: dm ? `${dm[1]}-${dm[2].padStart(2,"0")}-${dm[3].padStart(2,"0")}` : "", raw: c[it]});
    }
    return out;
  }
  // MediaMarker export (CSV): タイトル,読了日
  if(/^タイトル,/.test(head)){
    for(const ln of lines.slice(1)){
      const m = ln.match(/^"?(.*?)"?,(\d{4}\/\d{1,2}\/\d{1,2})\s*$/); if(!m) continue;
      if(/映画前売券/.test(m[1])) continue;
      let t = m[1].normalize("NFKC").replace(/【[^】]*】|\[[^\]]*\]|<[^>]*>/g, "").replace(/\([^)]*(限定|生産|枚組|仕様|特典|版|付|Blu-ray|DVD)[^)]*\)/g, "")
        .replace(/(MovieNEX|ブルーレイ|Blu-ray|DVD|4K ULTRA HD|4K UHD|コレクターズ・エディション|スペシャル・?エディション|スタンダード・?エディション|プレミアム・エディション|ディレクターズ・エディション|スペシャル・プライス|デラックス版|通常版|豪華版|特別版|初回|2枚組|3枚組|SPE BEST|WB COLLECTION).*$/, "").replace(/[『』「」]/g, " ").replace(/\s+/g, " ").trim();
      const dm = m[2].match(DATE_RE);
      out.push({t, y: 0, d: `${dm[1]}-${dm[2].padStart(2,"0")}-${dm[3].padStart(2,"0")}`, raw: m[1]});
    }
    return out;
  }
  for(let raw of lines){
    let line = raw.normalize("NFKC").trim();
    if(!line || line.startsWith("#")) continue;
    // lines prepared by Claude: "@seen<TAB>key<TAB>date" / "@off<TAB>title<TAB>year<TAB>date"
    if(line.startsWith("@seen\t")){ const c = raw.split("\t"); out.push({k:c[1].trim(), t:(c[3]||"").trim(), y:0, d:(c[2]||"").trim(), raw}); continue }
    if(line.startsWith("@off\t")){ const c = raw.split("\t"); out.push({off:true, t:(c[1]||"").trim(), y:+(c[2]||0)||0, d:(c[3]||"").trim(), raw}); continue }
    let d = "";
    const dm = line.match(DATE_RE);
    if(dm){ d = `${dm[1]}-${dm[2].padStart(2,"0")}-${dm[3].padStart(2,"0")}`; line = line.replace(DATE_RE, " ").trim() }
    const yl = line.match(/^((?:18|19|20)\d{2})\s*年?\s*(?:[\/／|｜・,、].*)?$/);
    if(yl){ if(out.length && !out[out.length-1].y) out[out.length-1].y = +yl[1]; if(d && out.length && !out[out.length-1].d) out[out.length-1].d = d; continue }
    if(/\d+\s*(?:件|本|作品)/.test(line) && line.length < 24){ continue }
    const cells = line.split(/\t|\s{2,}|,(?=\s*(?:18|19|20)\d{2}\b)/).map(c=>c.trim()).filter(Boolean);
    let t = cells[0] || "", y = 0;
    for(const c of cells.slice(1)){ const ym = c.match(/^((?:18|19|20)\d{2})年?$/); if(ym){ y = +ym[1] } }
    if(!t || JUNK_RE.test(t)){
      if(d && out.length && !out[out.length-1].d) out[out.length-1].d = d;
      continue;
    }
    const p = parseLine(t, 0, false);
    if(!p) continue;
    if(!y) y = p.y;
    out.push({t: p.t, y, d, raw: raw.trim()});
  }
  return out;
}
let pendingWatch = null;
function runWatchCheck(){
  const items = parseWatched($("wText").value);
  if(!items.length){ $("wPrev").innerHTML = `<p class="method">作品名が読み取れませんでした。</p>`; $("wSave").disabled = true; return }
  buildIdx(films);
  const res = items.map(it=> it.k ? {it, f: byKey.get(it.k) || null, how: byKey.get(it.k) ? "ok" : "new"} : it.off ? {it, f:null, how:"new"} : {it, ...matchOne(it)});
  buildIdx(BASE);
  // the same film can appear several times (re-watches): keep the earliest date
  const firstDate = new Map();
  for(const x of res){ if(x.f && x.it.d){ const p = firstDate.get(x.f.k); if(!p || x.it.d < p) firstDate.set(x.f.k, x.it.d) } }
  for(const x of res){ if(x.f && firstDate.has(x.f.k)) x.it.d = firstDate.get(x.f.k) }
  const useGuess = $("wGuess").checked;
  const ok = res.filter(x=>x.f && x.how==="ok"), gs = res.filter(x=>x.f && x.how==="guess"), nw = res.filter(x=>!x.f);
  const already = ok.concat(useGuess ? gs : []).filter(x=>seen[x.f.k]).length;
  pendingWatch = res;
  const uniq = new Set(ok.concat(useGuess ? gs : []).map(x=>x.f.k)).size;
  $("wPrev").innerHTML = `<p class="sum">${items.length}件を読み取りました：一致 ${ok.length}件・推定一致 ${gs.length}件（リスト内の作品 ${uniq}本）・リスト外 ${nw.length + (useGuess ? 0 : gs.length)}件（うち既に鑑賞済み ${already}件）</p>
    ${gs.length ? `<div><p class="method" style="margin:0">推定一致${useGuess ? "（鑑賞済みにします。違うものは元の行に公開年を付けるか表記を直して再照合してください）" : "（リスト外として保存します）"}</p><ul>${gs.map(x=>`<li><span class="tag guess">推定</span>${esc(x.it.t)}${x.it.y ? `（${x.it.y}）` : ""} → ${esc(x.f.t)}（${x.f.y}）</li>`).join("")}</ul></div>` : ""}
    ${nw.length ? `<div><p class="method" style="margin:0">リスト外として保存する作品</p><ul>${nw.slice(0,300).map(x=>`<li><span class="tag new">リスト外</span>${esc(x.it.t)}${x.it.y ? `（${x.it.y}）` : ""}${x.note ? `（${x.note}）` : ""}</li>`).join("")}${nw.length > 300 ? `<li>ほか ${nw.length-300} 件</li>` : ""}</ul></div>` : ""}`;
  $("wSave").disabled = false;
}
async function saveWatch(){
  if(!pendingWatch) return;
  const useGuess = $("wGuess").checked;
  const have = new Set(offlist.map(o=>normT(o.t)+"_"+(o.y||"")));
  let marked = 0, off = 0;
  for(const x of pendingWatch){
    if(x.f && (x.how==="ok" || useGuess)){
      const cur = seen[x.f.k];
      if(!cur){ seen[x.f.k] = x.it.d || NODATE; marked++ }
      else if(earlier(x.it.d, cur)){ seen[x.f.k] = x.it.d; marked++ }
    } else {
      const key = normT(x.it.t)+"_"+(x.it.y||"");
      if(!have.has(key)){ offlist.push({t:x.it.t, y:x.it.y||0, d:x.it.d||""}); have.add(key); off++ }
      else { const o = offlist.find(o=>normT(o.t)+"_"+(o.y||"")===key); if(o && x.it.d && (!o.d || x.it.d < o.d)) o.d = x.it.d }
    }
  }
  pendingWatch = null;
  lsWrite(); schedule(); await saveOff();
  $("wText").value = ""; $("wSave").disabled = true;
  $("wPrev").innerHTML = `<p class="sum">鑑賞済みに ${marked} 件を反映し、リスト外に ${off} 件を保存しました。</p>`;
  renderAll(); renderOff();
}
function seenFromLog(k){ return false }
let offShown = 100;
function renderOff(){
  const q = normT($("offQ").value);
  const arr = offlist.map((o,i)=>({o,i})).filter(x=>!q || normT(x.o.t).includes(q)).sort((a,b)=>(b.o.d||"").localeCompare(a.o.d||""));
  $("offCount").textContent = `${offlist.length}本`;
  $("offList").innerHTML = arr.slice(0, offShown).map(({o,i})=>`<li data-i="${i}"><span class="ot">${esc(o.t)}${o.y ? ` <span class="od">${o.y}</span>` : ""}</span><span class="od">${o.d ? "鑑賞 "+o.d : ""}</span><button class="offdel">削除</button></li>`).join("") || `<li class="method">まだありません。</li>`;
  $("offMore").hidden = arr.length <= offShown;
}
$("wCheck").addEventListener("click", runWatchCheck);

// ---------- offline copy & backup ----------
const IS_FILE = location.protocol === "file:";
if(IS_FILE) $("offlineBox").hidden = true;
async function offerFile(filename, data, msgEl){
  let dl = null;
  if(!IS_FILE){ try{ dl = await claude.use("downloads") }catch(_){} }
  if(dl){
    try{ await dl.save({filename, data}); msgEl.textContent = "保存しました。" }
    catch(e){ msgEl.textContent = e && e.code === "declined" ? "保存を取りやめました。" : "このページからは保存できませんでした。" }
    return;
  }
  try{
    const blob = data instanceof Blob ? data : new Blob([data], {type: filename.endsWith(".json") ? "application/json" : filename.endsWith(".txt") ? "text/plain;charset=utf-8" : "text/html"});
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
    msgEl.textContent = "保存しました。";
  }catch(e){ msgEl.textContent = "保存できませんでした。" }
}
$("dlOffline").addEventListener("click", async ()=>{
  $("dlOfflineMsg").textContent = "準備中…";
  try{
    const r = await fetch("offline.html"); if(!r.ok) throw 0;
    await offerFile("Movie_List_Checker.html", await r.blob(), $("dlOfflineMsg"));
  }catch(e){ $("dlOfflineMsg").textContent = "オフライン版を取得できませんでした。少し待ってからもう一度お試しください。" }
});
$("bkExport").addEventListener("click", ()=>{
  const data = JSON.stringify({app:"lifetime-films", version:1, exported:new Date().toISOString(), seen, rw, info, want, customs, offlist, spw:SPW}, null, 1);
  offerFile(`Movie_List_Checker_バックアップ_${today()}.json`, data, $("bkMsg"));
});
$("bkFile").addEventListener("change", async e=>{
  const file = e.target.files[0]; e.target.value = ""; if(!file) return;
  const readText = f => f.text ? f.text() : new Promise((res, rej)=>{ const r = new FileReader(); r.onload = ()=>res(r.result); r.onerror = rej; r.readAsText(f) });
  let b; try{ b = JSON.parse(await readText(file)) }catch(_){ $("bkMsg").textContent = "読み込めませんでした。書き出したバックアップファイル（.json）を選んでください。"; return }
  if(!b || b.app !== "lifetime-films"){ $("bkMsg").textContent = "このページのバックアップファイルではありません。"; return }
  let ns = 0;
  for(const [k,d] of Object.entries(b.seen||{})){ if(!seen[k]){ seen[k] = d || NODATE; ns++ } else if(earlier(d, seen[k])) seen[k] = d }
  for(const [k,ds] of Object.entries(b.rw||{})) if(seen[k]) for(const d of ds) addView(k, d);
  for(const [k,d] of Object.entries(b.want||{})) if(!want[k]) want[k] = d;
  for(const [k,v] of Object.entries(b.info||{})){ if(!info[k] || (v.at||"") > (info[k].at||"")) info[k] = v }
  for(const [id,L] of Object.entries(b.customs||{})) if(!customs[id]) customs[id] = L;
  const have = new Set(offlist.map(o=>normT(o.t)+"_"+(o.y||"")));
  let no = 0;
  for(const o of (b.offlist||[])){ const key = normT(o.t)+"_"+(o.y||""); if(!have.has(key)){ offlist.push(o); have.add(key); no++ } }
  lsWrite(); schedule(); await saveOff();
  recompute(); fillListSelect(); renderLegend(); promoteOff(); renderAll(); renderMine(); renderOff();
  await saveCustoms();
  $("bkMsg").textContent = `読み込みました（新たに鑑賞済み ${ns}本、リスト外 ${no}本を追加）。`;
});
$("wFile").addEventListener("change", async e=>{
  const file = e.target.files[0]; if(!file) return;
  const buf = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(buf);
  if(text.includes("\uFFFD")){ try{ text = new TextDecoder("shift_jis").decode(buf) }catch(_){} }
  $("wText").value = text; $("wFileName").textContent = `${file.name}（${text.split(/\r?\n/).filter(Boolean).length}行）`;
  e.target.value = ""; runWatchCheck();
});
$("wSave").addEventListener("click", saveWatch);
$("wText").addEventListener("input", ()=>{ $("wSave").disabled = true });
$("offQ").addEventListener("input", ()=>{ offShown = 100; renderOff() });
$("offMore").addEventListener("click", ()=>{ offShown += 300; renderOff() });
$("offList").addEventListener("click", e=>{
  const b = e.target.closest(".offdel"); if(!b) return;
  const i = +b.closest("li").dataset.i; offlist.splice(i,1); saveOff(); renderOff();
});
let delArm = null;
function renderMine(){
  const ids = Object.keys(customs);
  $("mine").innerHTML = !ids.length ? `<p class="method">まだありません。</p>` : ids.map(id=>{
    const L = customs[id], m = L.items.filter(i=>i.k).length;
    return `<div class="mrow" data-id="${id}"><span class="mn">${esc(L.name)}<br><span class="mm">${esc(L.src||"")} ${L.items.length}作品（既存と一致 ${m}）・${L.ranked ? "順位あり" : "順位なし"}・対象：${SCOPE_NM[L.scope||"all"]}${L.end ? `（〜${L.end}年）` : ""}・${L.created}</span></span>
      <label class="chkline" style="font-size:13px;display:flex;gap:6px;align-items:center"><input type="checkbox" class="minc" ${L.include ? "checked" : ""}> 集計に含める</label>
      <button class="btn warn mdel">${delArm===id ? "本当に削除する" : "削除"}</button></div>`;
  }).join("");
}
function renderPending(){
  $("pend").innerHTML = PENDING.map((p,i)=>`<div class="pcard"><span class="pn">${esc(p.nm)}</span>
    <span class="pm">${esc(p.now)}</span><span class="ph">${esc(p.how)}</span>
    <div class="pf"><span class="st ${p.st}">${STL[p.st]}</span><a href="${p.url}" target="_blank" rel="noopener" style="font-size:13px;color:var(--accent)">入手先を開く</a><button class="btn" data-pi="${i}">取り込む</button></div></div>`).join("");
}
$("pend").addEventListener("click", e=>{
  const b = e.target.closest("[data-pi]"); if(!b) return;
  const p = PENDING[+b.dataset.pi];
  $("fName").value = p.nm; $("fSrc").value = p.src; $("fRank").checked = p.ranked; $("fScope").value = p.scope || "all"; $("fEnd").value = p.end || "";
  $("fText").focus(); $("form").scrollIntoView({behavior:"smooth", block:"start"});
});
$("fCheck").addEventListener("click", runCheck);
$("fSave").addEventListener("click", saveImport);
$("fText").addEventListener("input", ()=>{ $("fSave").disabled = true });
$("mine").addEventListener("change", e=>{
  if(!e.target.classList.contains("minc")) return;
  const id = e.target.closest(".mrow").dataset.id; customs[id].include = e.target.checked; afterCustomChange();
});
$("mine").addEventListener("click", e=>{
  const b = e.target.closest(".mdel"); if(!b) return;
  const id = b.closest(".mrow").dataset.id;
  if(delArm === id){ delete customs[id]; delete DATA.lists["c_"+id]; delArm = null; afterCustomChange() }
  else { delArm = id; renderMine(); setTimeout(()=>{ if(delArm===id){ delArm=null; renderMine() } }, 5000) }
});

// ---------- plain-text export ----------
function exportText(){
  const what = $("txWhat").value, tsv = $("txFmt").value === "tsv";
  const useView = $("txView").checked, withNo = $("txNo").checked;
  const base = useView ? filtered() : films;
  const dir = f => f.d || "";
  const line = (no, t, d, y, extra) => tsv
    ? [...(no !== null ? [no] : []), t, d, y || "", ...(extra !== null ? [extra] : [])].join("\t")
    : `${no !== null ? no + ". " : ""}${t}（${y || "年不明"}）${d ? "／" + d : ""}${extra ? "　" + extra : ""}`;
  const head = cols => tsv ? cols.join("\t") : null;
  const stamp = today();
  const out = [];
  if(what === "all"){
    const mark = $("txMark").checked;
    out.push(`Movie List Checker　全リスト ${base.length}本${useView ? "（絞り込み・並び順は画面のとおり）" : "（優先度順）"}　${stamp} 書き出し`, "");
    const h = head([...(withNo ? ["順位"] : []), "タイトル", "監督", "公開年", ...(mark ? ["鑑賞"] : [])]); if(h) out.push(h);
    for(const f of base) out.push(line(withNo ? f.id : null, f.t, dir(f), f.y, mark ? (seen[f.k] ? ("✓ " + dateOf(seen[f.k])).trim() : "") : null));
  } else {
    const withDate = $("txDate").checked;
    const sf = base.filter(f=>seen[f.k]);
    const off = $("txOff").checked && !useView ? offlist.slice().sort((a,b)=>COL.compare(a.t,b.t)) : [];
    out.push(`Movie List Checker　鑑賞済み作品 ${sf.length + off.length}本　${stamp} 書き出し`, "");
    const h = head([...(withNo ? ["順位"] : []), "タイトル", "監督", "公開年", ...(withDate ? ["鑑賞日"] : [])]);
    out.push(tsv ? `# リスト内の作品（${sf.length}本）` : `■ リスト内の作品（${sf.length}本）`); if(h) out.push(h);
    for(const f of sf) out.push(line(withNo ? f.id : null, f.t, dir(f), f.y, withDate ? viewsOf(f.k).join("、") : null));
    if(off.length){
      out.push("", tsv ? `# リスト外の作品（${off.length}本・監督は記録なし）` : `■ リスト外の作品（${off.length}本）`); if(h) out.push(head(["タイトル", "監督", "公開年", ...(withDate ? ["鑑賞日"] : [])]));
      for(const o of off) out.push(line(null, o.t, "", o.y, withDate ? (o.d || "") : null));
    }
  }
  return out.join("\n") + "\n";
}
function renderExport(){ if($("txSec").open){ $("txOut").value = exportText(); $("txMsg").textContent = "" } }
for(const id of ["txWhat","txFmt","txView","txNo","txMark","txOff","txDate"]) $(id).addEventListener("change", renderExport);
$("txSec").addEventListener("toggle", renderExport);
$("txCopy").addEventListener("click", async ()=>{
  const text = exportText(); $("txOut").value = text;
  try{ await navigator.clipboard.writeText(text); $("txMsg").textContent = "コピーしました。"; return }catch(_){}
  try{ const t = $("txOut"); t.focus(); t.select(); if(document.execCommand("copy")){ $("txMsg").textContent = "コピーしました。"; return } }catch(_){}
  $("txMsg").textContent = "自動でコピーできませんでした。上の欄を全選択してコピーしてください。";
});
$("txSave").addEventListener("click", ()=>{
  const nm = $("txWhat").value === "all" ? "全リスト" : "鑑賞済み作品";
  offerFile(`Movie_List_Checker_${nm}_${today()}.txt`, exportText(), $("txMsg"));
});

renderPending();
$("spw").value = String(SPW); $("spwTxt").textContent = SPW;
$("spw").addEventListener("change", e=>{ SPW = +e.target.value; try{ localStorage.setItem("lifetime-films-spw", String(SPW)) }catch(_){}; $("spwTxt").textContent = SPW; recompute(); renderAll() });
recompute();
buildControls();
initPick();
$("statSec").addEventListener("toggle", renderStats);
renderAll();
initStore();
