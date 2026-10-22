// バーコードの判定・書誌の取得・本の種類の判定・照合
"use strict";
(function () {
  const B = {};

  // ---------- バーコード ----------
  B.ean13ok = s => {
    if (!/^\d{13}$/.test(s)) return false;
    let t = 0; for (let i = 0; i < 12; i++) t += +s[i] * (i % 2 ? 3 : 1);
    return (10 - t % 10) % 10 === +s[12];
  };
  B.withCheck = s12 => { let t = 0; for (let i = 0; i < 12; i++) t += +s12[i] * (i % 2 ? 3 : 1); return s12 + ((10 - t % 10) % 10); };
  B.isbn10to13 = s => { s = s.replace(/[^0-9Xx]/g, ""); return s.length === 10 ? B.withCheck("978" + s.slice(0, 9)) : null; };
  B.normIsbn = s => {
    const d = String(s || "").replace(/[^0-9Xx]/g, "");
    if (d.length === 13 && B.ean13ok(d)) return d;
    if (d.length === 10) return B.isbn10to13(d);
    return null;
  };
  B.LABEL_PREFIX = "29";
  B.classify = code => {
    code = String(code).replace(/\D/g, "");
    if (code.length === 10) { const c = B.isbn10to13(code); if (c) code = c; }
    if (!B.ean13ok(code)) return { kind: "bad", code };
    if (/^97[89]/.test(code)) return { kind: "isbn", code };
    if (/^19[12]/.test(code)) return { kind: "lower", code, ccode: "C" + code.slice(3, 7), price: parseInt(code.slice(7, 12), 10) };
    if (/^491/.test(code)) return { kind: "magazine", code, mag: code.slice(4, 9), month: +code.slice(9, 11), yearDigit: code[11] };
    if (code.startsWith(B.LABEL_PREFIX)) return { kind: "label", code };
    return { kind: "other", code };
  };

  // ---------- Cコード ----------
  const C_TARGET = ["一般", "教養", "実用", "専門", "検定教科書など", "婦人", "学参Ⅰ", "学参Ⅱ", "児童", "雑誌扱い"];
  const C_FORM = ["単行本", "文庫", "新書", "全集・双書", "ムック・その他", "事典・辞典", "図鑑", "絵本", "磁性媒体など", "コミック"];
  const C_CONTENT = { "79": "コミックス・劇画", "90": "文学総記", "91": "日本文学総記", "92": "日本文学詩歌", "93": "日本文学小説", "95": "日本文学評論・随筆・その他", "97": "外国文学小説", "98": "外国文学その他" };
  B.cText = c => { const d = c.slice(1); return `${C_TARGET[+d[0]] || "?"}・${C_FORM[+d[1]] || "?"}・${C_CONTENT[d.slice(2)] || "内容" + d.slice(2)}`; };
  B.CATS = ["小説", "詩歌", "戯曲", "評論・随筆", "ノンフィクション・教養", "実用・趣味", "漫画", "絵本・児童書", "雑誌", "ムック", "辞典・図鑑", "その他"];
  B.FORMATS = ["文庫", "新書", "単行本", "コミックス", "ムック", "全集・双書", "辞典", "図鑑", "絵本", "雑誌", "電子"];
  B.catFromC = c => {
    if (!c || !/^C\d{4}$/.test(c)) return null;
    const t = c[1], f = c[2], ct = c.slice(3);
    if (f === "9" || ct === "79") return "漫画";
    if (f === "7" || t === "8") return "絵本・児童書";
    if (f === "5" || f === "6") return "辞典・図鑑";
    if (f === "4") return "ムック";
    if (ct === "92") return "詩歌";
    if (ct === "93" || ct === "97") return "小説";
    if (ct === "95" || ct === "98" || ct === "90" || ct === "91") return "評論・随筆";
    if (t === "2" || /^7[0-8]$/.test(ct) || /^8\d$/.test(ct)) return "実用・趣味";
    return "ノンフィクション・教養";
  };
  B.formatFromC = c => (c && /^C\d{4}$/.test(c)) ? ({ 0: "単行本", 1: "文庫", 2: "新書", 3: "全集・双書", 4: "ムック", 5: "辞典", 6: "図鑑", 7: "絵本", 9: "コミックス" }[c[2]] || null) : null;
  B.catFromNdc = ndc => {
    if (!ndc) return null;
    const n = String(ndc).replace(/[^\d.]/g, "");
    if (/^726\.1/.test(n) || /^726$/.test(n)) return "漫画";
    if (/^726\.6/.test(n)) return "絵本・児童書";
    if (/^9\d1/.test(n)) return "詩歌";
    if (/^9\d2/.test(n)) return "戯曲";
    if (/^9\d3/.test(n)) return "小説";
    if (/^9\d[4-6]/.test(n)) return "評論・随筆";
    if (/^(031|032|813|833)/.test(n)) return "辞典・図鑑";
    if (/^(59|7)/.test(n)) return "実用・趣味";
    if (/^\d/.test(n)) return "ノンフィクション・教養";
    return null;
  };

  // ---------- 書誌の取得 ----------
  async function timed(url, ms = 9000) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
    try { const r = await fetch(url, { signal: ctl.signal }); return r.ok ? r : null; } catch { return null; } finally { clearTimeout(tm); }
  }
  async function openbd(isbn) {
    const r = await timed(`https://api.openbd.jp/v1/get?isbn=${isbn}`, 6000); if (!r) return null;
    const j = await r.json().catch(() => null); const o = j && j[0]; if (!o) return null;
    const s = o.summary || {};
    const subj = (o.onix?.DescriptiveDetail?.Subject || []).find(x => x.SubjectSchemeIdentifier === "78");
    const coll = o.onix?.DescriptiveDetail?.Collection?.TitleDetail?.TitleElement;
    const label = Array.isArray(coll) ? coll.find(e => e.CollectionSequence == null)?.TitleText?.content : coll?.TitleText?.content;
    return {
      src: "openBD", t: s.title || "", a: cleanAuthor(s.author || ""), pub: s.publisher || "", y: yearOf(s.pubdate),
      vol: s.volume || "", series: s.series || "", label: label || "", cover: s.cover || "", ccode: subj ? "C" + subj.SubjectCode : "",
    };
  }
  async function ndl(isbn) {
    const r = await timed(`https://ndlsearch.ndl.go.jp/api/opensearch?isbn=${isbn}`, 12000); if (!r) return null;
    const x = new DOMParser().parseFromString(await r.text(), "application/xml");
    const item = x.getElementsByTagName("item")[0]; if (!item) return null;
    const g = n => item.getElementsByTagName(n)[0]?.textContent?.trim() || "";
    const all = n => [...item.getElementsByTagName(n)].map(e => e.textContent.trim());
    const subjects = [...item.getElementsByTagName("dc:subject")];
    const ndcEl = subjects.find(e => /NDC/.test(e.getAttribute("xsi:type") || ""));
    return {
      src: "国立国会図書館", t: g("dc:title") || g("title"), a: cleanAuthor(all("dc:creator").join("、") || g("author")), pub: all("dc:publisher")[0] || "",
      y: yearOf(g("dcterms:issued") || g("dc:date")), vol: g("dcndl:volume"), series: g("dcndl:seriesTitle"), ndc: ndcEl ? ndcEl.textContent.trim() : "",
    };
  }
  function yearOf(s) { const m = String(s || "").match(/(1[5-9]|20)\d{2}/); return m ? +m[0] : null; }
  function cleanAuthor(a) {
    return String(a).replace(/／著|\/著|著$|作$|／作|\/作/g, "").replace(/\s*\[?(著|作|文|絵|画|訳|編|原作|イラスト)\]?\s*/g, " ").replace(/\s+/g, " ").replace(/^[\s,、]+|[\s,、]+$/g, "").trim();
  }
  // ISBNで書誌を取る。openBDを先に、なければ国立国会図書館
  B.lookup = async isbn => {
    let a = await openbd(isbn);
    let b = null;
    if (!a || !a.t) b = await ndl(isbn);
    else if (!a.ccode) b = await ndl(isbn).catch(() => null); // 種類の判定のため分類も取る（遅くても待たない用途では呼び出し側で扱う）
    const base = a && a.t ? a : b;
    if (!base) return null;
    const r = { ...base };
    if (b) { r.ndc = b.ndc || ""; if (!r.vol) r.vol = b.vol; if (!r.series) r.series = b.series; if (!r.y) r.y = b.y; }
    r.trial = /試し読み|無料版|お試し/.test(r.t);
    return r;
  };

  // ---------- 文字の正規化 ----------
  const kata = s => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
  B.norm = s => kata(String(s || "").normalize("NFKC").toLowerCase())
    .replace(/[\s　・･:：;；!！?？、。,，.．「」『』【】\[\]()（）〈〉《》<>"'’“”〜~\-‐―ー=＝/／&＆]/g, "");
  B.normTitle = s => B.norm(String(s || "").normalize("NFKC")
    .replace(/[（(][^）)]*(新装版|新訳|完全版|決定版|改訂版|文庫|上|中|下|前編|後編|[0-9０-９]+)[^）)]*[）)]/g, "")
    .replace(/(上|中|下)巻?$|新装版|新訳版?|完全版|決定版|改訂版/g, ""));
  // 巻数：書名の末尾の (3) ／ 3 ／ 第3巻 ／ 3巻 など
  B.splitVolume = (title, volField) => {
    const t = String(title || "").normalize("NFKC").trim();
    let m = t.match(/^(.*?)[\s　]*(?:\(|（)?\s*(?:第)?(\d{1,3})(?:巻)?\s*(?:\)|）)?$/);
    let vol = volField && /^\d+$/.test(String(volField).normalize("NFKC")) ? +String(volField).normalize("NFKC") : null;
    if (m && m[1] && m[1].length >= 1 && /\d/.test(m[2])) return { base: m[1].trim(), vol: vol ?? +m[2] };
    if (vol != null) return { base: t, vol };
    return { base: t, vol: null };
  };

  // ---------- 必読書チェッカーとの照合 ----------
  let NIDX = null, NOVELS = null;
  B.setNovels = works => {
    NOVELS = works; NIDX = new Map();
    const add = (k, w) => { if (!k || k.length < 2) return; const a = NIDX.get(k) || []; if (!a.includes(w)) a.push(w); NIDX.set(k, a); };
    for (const w of works.books) {
      add(B.normTitle(w.t), w); add(B.normTitle(w.t.replace(/（.*?）/g, "")), w); add(B.normTitle(w.o), w);
      if (w.jp) { const m = w.jp.match(/『(.+?)』/); if (m) add(B.normTitle(m[1]), w); }
    }
  };
  const authorKeys = a => String(a || "").normalize("NFKC").split(/[・=＝\s,、]+/).map(B.norm).filter(x => x.length >= 2);
  B.authorMatch = (work, author) => {
    const na = B.norm(author); if (!na) return null;
    const keys = authorKeys(work.a); if (!keys.length) return null;
    return keys.some(k => na.includes(k)) || na.includes(B.norm(work.a));
  };
  // 返り値：{status:'auto'|'wait'|'none', work?, cands?}
  B.matchNovel = (title, author) => {
    if (!NIDX) return { status: "none" };
    const cands = NIDX.get(B.normTitle(title)) || [];
    if (!cands.length) return { status: "none" };
    const byAuthor = cands.filter(w => B.authorMatch(w, author) === true);
    if (byAuthor.length === 1) return { status: "auto", work: byAuthor[0] };
    if (cands.length === 1 && B.authorMatch(cands[0], author) !== false) return { status: "auto", work: cands[0] };
    return { status: "wait", cands: (byAuthor.length ? byAuthor : cands).slice(0, 5) };
  };
  let FIDX = null;
  B.setFilms = works => { FIDX = new Map(); for (const f of works.films) { const k = B.normTitle(f.t); const a = FIDX.get(k) || []; a.push(f); FIDX.set(k, a); } };
  B.filmsByTitle = title => (FIDX && FIDX.get(B.normTitle(title))) || [];

  // ---------- 優先度（必読書チェッカーと同じ区切り） ----------
  B.TIERS = [{ id: "s", nm: "最優先", min: 50 }, { id: "a", nm: "必見", min: 40 }, { id: "b", nm: "推奨", min: 30 }, { id: "c", nm: "候補", min: 20 }, { id: "d", nm: "その他", min: -1 }];
  B.tierNm = sc => B.TIERS.find(t => sc >= t.min).nm;

  window.Biblio = B;
})();
