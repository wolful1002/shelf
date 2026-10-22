// shelf 試作：GitHubへの保存・読み取り・書誌サービスの比較を確かめる
"use strict";
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const REPO = "wolful1002/shelf-data";
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const now = () => new Date().toLocaleString("ja-JP");

// ---------- 0. 鍵 ----------
function token() { return LS.get("shelf.token", ""); }
function showTokenState() {
  const t = token();
  $("tokenState").textContent = t ? "設定済み" : "未設定";
  $("tokenState").className = "pill " + (t ? "ok" : "");
}
$("saveToken").onclick = () => {
  const v = $("token").value.trim();
  if (!v) return;
  LS.set("shelf.token", v); $("token").value = ""; showTokenState();
};
$("clearToken").onclick = () => { LS.del("shelf.token"); showTokenState(); };
showTokenState();

// 端末の名前（どの端末の書き込みか見分けるため）
let deviceId = LS.get("shelf.device", "");
if (!deviceId) {
  const ua = navigator.userAgent;
  const kind = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "パソコン";
  deviceId = kind + "-" + Math.random().toString(36).slice(2, 6);
  LS.set("shelf.device", deviceId);
}

// ---------- GitHub の読み書き ----------
function b64decode(s) {
  const bin = atob(s.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
function b64encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = ""; bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin);
}
async function gh(method, path, body) {
  if (!token()) throw new Error("鍵が設定されていません（0の欄）");
  const res = await fetch(`https://api.github.com/repos/${REPO}/contents/${path}`, {
    method,
    headers: { Authorization: "Bearer " + token(), Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  return res;
}
async function readJson(path) {
  const res = await gh("GET", path);
  if (res.status === 404) return { sha: null, data: [] };
  if (!res.ok) throw new Error(`読み込み失敗（${res.status}）`);
  const j = await res.json();
  return { sha: j.sha, data: JSON.parse(b64decode(j.content)) };
}
// 読んで、変えて、書く。ほかの端末が先に書いていたら（409）読み直してやり直す
async function updateJson(path, mutate, message) {
  let tries = 0;
  for (;;) {
    tries++;
    const { sha, data } = await readJson(path);
    const next = mutate(data);
    const res = await gh("PUT", path, { message, content: b64encode(JSON.stringify(next, null, 1)), sha: sha || undefined });
    if (res.ok) return { tries, count: next.length };
    if ((res.status === 409 || res.status === 422) && tries < 6) { await new Promise(r => setTimeout(r, 300 + Math.random() * 700)); continue; }
    throw new Error(`書き込み失敗（${res.status}）`);
  }
}

// ---------- 1. GitHubへの保存 ----------
const STORE = "proto/storage-test.json";
const log1 = [];
function out1(line) { log1.unshift(`[${new Date().toLocaleTimeString("ja-JP")}] ${line}`); $("o1").textContent = log1.slice(0, 30).join("\n"); }
function queue() { return LS.get("shelf.queue", []); }
function showQueue() { const n = queue().length; $("queue").textContent = `送信待ち ${n}件`; $("queue").className = "pill " + (n ? "ng" : "ok"); }
let flushing = false;
async function flush() {
  if (flushing) return;
  const q = queue(); if (!q.length) return;
  if (!navigator.onLine) { out1(`電波がないため ${q.length}件を待たせています`); return; }
  flushing = true;
  const t0 = performance.now();
  try {
    const ids = new Set(q.map(e => e.id));
    const r = await updateJson(STORE, arr => arr.filter(e => !ids.has(e.id)).concat(q), `試作：${deviceId} から ${q.length}件`);
    LS.set("shelf.queue", queue().filter(e => !ids.has(e.id)));
    out1(`送信 ${q.length}件 成功（${Math.round(performance.now() - t0)}ミリ秒、試行${r.tries}回、保管場所の合計${r.count}件）`);
  } catch (e) {
    out1(`送信できず：${e.message}。電波が戻ったら自動で再送します`);
  } finally { flushing = false; showQueue(); }
}
$("w").onclick = () => {
  const e = { id: deviceId + "-" + Date.now(), device: deviceId, at: now(), online: navigator.onLine };
  LS.set("shelf.queue", queue().concat(e));
  showQueue(); out1(`書き込みを受け付けました（${navigator.onLine ? "すぐ送ります" : "電波なし。後で送ります"}）`);
  flush();
};
$("r").onclick = async () => {
  const t0 = performance.now();
  try {
    const { data } = await readJson(STORE);
    const by = {}; data.forEach(e => by[e.device] = (by[e.device] || 0) + 1);
    out1(`読み込み ${data.length}件（${Math.round(performance.now() - t0)}ミリ秒）　端末別：` + Object.entries(by).map(([k, v]) => `${k} ${v}件`).join("、"));
  } catch (e) { out1("読み込みできず：" + e.message); }
};
addEventListener("online", () => { out1("電波が戻りました"); flush(); });
addEventListener("offline", () => out1("電波がなくなりました"));
showQueue(); flush();

// ---------- 2. 読み取り ----------
function ean13ok(s) {
  if (!/^\d{13}$/.test(s)) return false;
  let t = 0; for (let i = 0; i < 12; i++) t += +s[i] * (i % 2 ? 3 : 1);
  return (10 - t % 10) % 10 === +s[12];
}
function withCheck(s12) { let t = 0; for (let i = 0; i < 12; i++) t += +s12[i] * (i % 2 ? 3 : 1); return s12 + ((10 - t % 10) % 10); }
const C_TARGET = ["一般", "教養", "実用", "専門", "検定教科書など", "婦人", "学参Ⅰ", "学参Ⅱ", "児童", "雑誌扱い"];
const C_FORM = ["単行本", "文庫", "新書", "全集・双書", "ムック・その他", "事典・辞典", "図鑑", "絵本", "磁性媒体など", "コミック"];
const C_CONTENT = { "79": "コミックス・劇画", "90": "文学総記", "91": "日本文学総記", "92": "日本文学詩歌", "93": "日本文学小説", "95": "日本文学評論・随筆・その他", "97": "外国文学小説", "98": "外国文学その他" };
function cCode(c) { // "C0193" → 説明
  const d = c.slice(1);
  return `${c}（${C_TARGET[+d[0]] || "?"}・${C_FORM[+d[1]] || "?"}・${C_CONTENT[d.slice(2)] || "内容" + d.slice(2)}）`;
}
const LABELS = [["書斎・本棚A・1段目", withCheck("290000000001")], ["書斎・本棚A・2段目", withCheck("290000000002")], ["寝室・文庫棚", withCheck("290000000003")]];
function classify(code) {
  if (!ean13ok(code)) return { kind: "読み取り誤りか、対象外の番号", ok: false };
  if (/^97[89]/.test(code)) return { kind: "ISBN（上段）", ok: true, isbn: code };
  if (/^19[12]/.test(code)) {
    const c = "C" + code.slice(3, 7), price = parseInt(code.slice(7, 12), 10);
    return { kind: "下段（書籍JANコード）", ok: true, c, note: `${cCode(c)}、本体価格 ${price}円` };
  }
  if (/^491/.test(code)) return { kind: "雑誌", ok: true, note: `雑誌コード ${code.slice(4, 9)}、${+code.slice(9, 11)}月号、年の末尾 ${code[11]}` };
  const lab = LABELS.find(([, c]) => c === code);
  if (lab) return { kind: "場所ラベル", ok: true, note: lab[0] };
  if (/^2/.test(code)) return { kind: "店内用の番号（場所ラベルの候補）", ok: true };
  return { kind: "その他の商品バーコード", ok: true };
}
let lastCode = "", lastAt = 0, lastIsbn = null, lastIsbnAt = 0;
const log2 = [];
let audio;
function beep(ok) {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = ok ? 1320 : 330; g.gain.value = 0.08;
    o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + (ok ? 0.08 : 0.25));
  } catch {}
}
function handleCode(raw, source) {
  const code = String(raw).replace(/\D/g, "");
  const t = Date.now();
  if (code === lastCode && t - lastAt < 2500) return; // 同じ番号の連続読みを無視
  lastCode = code; lastAt = t;
  const r = classify(code);
  beep(r.ok);
  let line = `[${new Date().toLocaleTimeString("ja-JP")}] ${source}：${code}　${r.kind}` + (r.note ? `\n　${r.note}` : "");
  if (r.isbn) { lastIsbn = r.isbn; lastIsbnAt = t; lookup(r.isbn); }
  if (r.c && lastIsbn && t - lastIsbnAt < 15000) { attachC(lastIsbn, r.c); line += `\n　→ 直前のISBN ${lastIsbn} に結び付けました`; }
  log2.unshift(line);
  $("o2").textContent = log2.slice(0, 20).join("\n");
  $("s2").classList.remove("flash"); void $("s2").offsetWidth; $("s2").classList.add("flash");
}
// 専用スキャナー（キーボードとして入力される）
let scanTimer = null;
$("scan").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); const v = $("scan").value; $("scan").value = ""; if (v.trim()) handleCode(v, "スキャナー"); }
});
$("scan").addEventListener("input", () => { // Enterを送らない機種のため、13桁そろったら処理
  clearTimeout(scanTimer);
  const v = $("scan").value.replace(/\D/g, "");
  if (v.length === 13) scanTimer = setTimeout(() => { $("scan").value = ""; handleCode(v, "スキャナー"); }, 200);
});

// カメラ
let stopCam = null;
$("cam").onclick = async () => {
  beep(true);
  $("videoBox").hidden = false; $("cam").disabled = true; $("camStop").disabled = false;
  const video = $("video");
  try {
    let native = false;
    if ("BarcodeDetector" in window) {
      try { native = (await BarcodeDetector.getSupportedFormats()).includes("ean_13"); } catch {}
    }
    if (native) {
      $("engine").textContent = "読み取り方式：端末の機能";
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
      video.srcObject = stream; await video.play();
      const det = new BarcodeDetector({ formats: ["ean_13"] });
      let live = true;
      (async function loop() {
        while (live) {
          try { const r = await det.detect(video); if (r[0]) handleCode(r[0].rawValue, "カメラ"); } catch {}
          await new Promise(r => setTimeout(r, 150));
        }
      })();
      stopCam = () => { live = false; stream.getTracks().forEach(t => t.stop()); };
    } else {
      $("engine").textContent = "読み取り方式：ライブラリ";
      const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.EAN_13]], [ZXing.DecodeHintType.TRY_HARDER, true]]);
      const reader = new ZXing.BrowserMultiFormatReader(hints, 150);
      await reader.decodeFromConstraints({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } } }, video, res => { if (res) handleCode(res.getText(), "カメラ"); });
      stopCam = () => reader.reset();
    }
    $("engine").className = "pill ok";
  } catch (e) {
    $("engine").textContent = "カメラを使えません：" + (e.name || e.message);
    $("engine").className = "pill ng";
    $("cam").disabled = false; $("camStop").disabled = true;
  }
};
$("camStop").onclick = () => { if (stopCam) stopCam(); stopCam = null; $("videoBox").hidden = true; $("cam").disabled = false; $("camStop").disabled = true; };

// 場所ラベルの見本
if (window.JsBarcode) {
  $("labels").innerHTML = LABELS.map(([name], i) => `<figure><svg id="lab${i}"></svg><figcaption>${esc(name)}</figcaption></figure>`).join("");
  LABELS.forEach(([, code], i) => JsBarcode("#lab" + i, code, { format: "EAN13", height: 50, width: 2, fontSize: 14, margin: 6 }));
}

// ---------- 3. 書誌サービスの比較 ----------
const results = []; // {isbn, at, openbd, ndl, google, c, cFrom}
async function timed(url, parse) {
  const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 9000);
  const t0 = performance.now();
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) return { state: "error", msg: `応答${res.status}`, ms: Math.round(performance.now() - t0) };
    const v = await parse(res);
    return v ? { state: "hit", ms: Math.round(performance.now() - t0), ...v } : { state: "miss", ms: Math.round(performance.now() - t0) };
  } catch (e) {
    return { state: "error", msg: e.name === "AbortError" ? "時間切れ" : "通信できず", ms: Math.round(performance.now() - t0) };
  } finally { clearTimeout(tm); }
}
const qOpenbd = isbn => timed(`https://api.openbd.jp/v1/get?isbn=${isbn}`, async res => {
  const j = await res.json(); const o = j && j[0]; if (!o) return null;
  const s = o.summary || {};
  const subj = (o.onix?.DescriptiveDetail?.Subject || []).find(x => x.SubjectSchemeIdentifier === "78");
  return { title: s.title, author: s.author, publisher: s.publisher, date: s.pubdate, c: subj ? "C" + subj.SubjectCode : "" };
});
const qNdl = isbn => timed(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}`, async res => {
  const x = new DOMParser().parseFromString(await res.text(), "application/xml");
  const item = x.getElementsByTagName("item")[0]; if (!item) return null;
  const t = n => item.getElementsByTagName(n)[0]?.textContent || "";
  return { title: t("title"), author: t("dc:creator") || t("author"), publisher: t("dc:publisher"), date: t("dcterms:issued") || t("dc:date") };
});
const qGoogle = isbn => timed(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`, async res => {
  const j = await res.json(); const v = j.items?.[0]?.volumeInfo; if (!v) return null;
  return { title: v.title + (v.subtitle ? " " + v.subtitle : ""), author: (v.authors || []).join("、"), publisher: v.publisher, date: v.publishedDate };
});
function cell(r) {
  if (!r) return `<span class="pill">調査中</span>`;
  if (r.state === "hit") return `<span class="pill ok">あり</span> ${esc(r.title)}<br><span class="hint">${esc(r.author)}／${esc(r.publisher)}／${esc(r.date)}</span>`;
  if (r.state === "miss") return `<span class="pill">なし</span>`;
  return `<span class="pill ng">${esc(r.msg)}</span>`;
}
function render3() {
  $("bib").innerHTML = results.map(r => `<tr><td>${esc(r.isbn)}</td><td>${cell(r.openbd)}</td><td>${cell(r.ndl)}</td><td>${cell(r.google)}</td><td>${r.c ? esc(cCode(r.c)) + `<br><span class="hint">${esc(r.cFrom)}</span>` : "—"}</td></tr>`).join("");
  const done = results.filter(r => r.openbd && r.ndl && r.google);
  if (!done.length) return;
  const hit = k => done.filter(r => r[k].state === "hit").length;
  const err = k => done.filter(r => r[k].state === "error").length;
  $("rate").textContent = `${done.length}冊中　openBD ${hit("openbd")}冊（通信できず${err("openbd")}）・国立国会図書館 ${hit("ndl")}冊（通信できず${err("ndl")}）・Google Books ${hit("google")}冊（通信できず${err("google")}）・Cコード ${done.filter(r => r.c).length}冊`;
}
function attachC(isbn, c) {
  const r = results.find(x => x.isbn === isbn); if (!r) return;
  if (!r.c) { r.c = c; r.cFrom = "下段のバーコードから"; render3(); }
}
async function lookup(isbn) {
  if (results.some(r => r.isbn === isbn)) return;
  const r = { isbn, at: now() }; results.unshift(r); render3();
  const [a, b, c] = await Promise.all([qOpenbd(isbn), qNdl(isbn), qGoogle(isbn)]);
  r.openbd = a; r.ndl = b; r.google = c;
  if (!r.c && a.c) { r.c = a.c; r.cFrom = "openBDから"; }
  render3();
}
$("look").onclick = () => {
  const v = $("isbn").value.replace(/\D/g, "");
  if (!ean13ok(v) || !/^97[89]/.test(v)) { $("rate").textContent = "13桁のISBN（978か979で始まる番号）を入れてください"; return; }
  $("isbn").value = ""; lookup(v);
};
$("isbn").addEventListener("keydown", e => { if (e.key === "Enter") $("look").click(); });
$("saveBib").onclick = async () => {
  const done = results.filter(r => r.openbd && r.ndl && r.google);
  if (!done.length) { $("saveBibState").textContent = "保存する結果がまだありません"; return; }
  $("saveBibState").textContent = "保存中…";
  try {
    const rows = done.map(r => ({ ...r, device: deviceId }));
    const keys = new Set(rows.map(r => r.isbn + r.device));
    const res = await updateJson("proto/biblio-test.json", arr => arr.filter(x => !keys.has(x.isbn + x.device)).concat(rows), `試作：書誌の比較 ${rows.length}件`);
    $("saveBibState").textContent = `${rows.length}件を保存しました（保管場所の合計 ${res.count}件）`;
  } catch (e) { $("saveBibState").textContent = "保存できませんでした：" + e.message; }
};
