# 今のチェッカー（Claudeのページ）から、新しいアプリのチェッカーの画面を作る。
# 画面のプログラムには手を入れず、作品データの読み込み先と記録の窓口だけを差し替える。
#   python3 tools/build-legacy.py <必読書のページ.html> <映画のページ.html>
import json, re, sys, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAGES = {
    "novels": {
        "title": "必読書チェッカー — shelf",
        "works": "works/novels.json",
        "docs": {"books": "records/novels-checker/books.json", "custom": "records/novels-checker/custom.json", "log": "records/novels-checker/log.json"},
        "logchunks": "records/novels-checker/log-{n}.json",
    },
    "films": {
        "title": "映画チェッカー — shelf",
        "works": "works/films.json",
        "docs": {"watched": "records/films-checker/watched.json", "offlist": "records/films-checker/offlist.json", "customLists": "records/films-checker/customLists.json"},
    },
}

LOADER = r"""
<script src="app/store.js"></script>
<script>
"use strict";
(async () => {
  const CFG = __CFG__;
  const bar = document.getElementById("shelfBar");
  const msg = t => { const el = document.getElementById("shelfMsg"); if (el) { el.textContent = t; el.hidden = !t; } };
  // 保存の状態
  const pill = document.getElementById("shelfSync");
  Shelf.onStatus(s => {
    const m = { ok: "保存済み", idle: "準備中", syncing: s.msg || "通信中", pending: `送信待ち ${s.pending}件`, offline: s.pending ? `電波なし・送信待ち ${s.pending}件` : "電波なし", error: "保存できていません", notoken: "鍵が未設定" };
    pill.textContent = m[s.state] || s.state; pill.dataset.state = s.state; pill.title = s.msg || "";
  });
  if (!Shelf.token()) { msg("鍵が設定されていません。ホームで鍵を入れてください。"); return; }
  msg("記録を読み込んでいます…");
  await Shelf.init();
  if (!Shelf.read(CFG.works)) await Shelf.refresh();
  const data = Shelf.read(CFG.works);
  if (!data) { msg("作品データを読み込めませんでした。電波と鍵を確かめてください。"); return; }
  msg("");
  window.__DATA__ = JSON.parse(JSON.stringify(data));
  const docPath = full => {
    const id = full.split("/").pop();
    if (CFG.docs[id]) return CFG.docs[id];
    const m = id.match(/^log-(\d+)$/); if (m && CFG.logchunks) return CFG.logchunks.replace("{n}", m[1]);
    return "records/misc/" + id + ".json";
  };
  const biblio = () => {
    const b = Shelf.read("works/novels-biblio.json"); if (!b) return null;
    return { ver: (b.last || "") + ":" + Object.keys(b.fix || {}).length + ":" + Object.keys(b.checked || {}).length, fixDocs: ["fix"], last: b.last, checked: b.checked };
  };
  window.claude = Shelf.legacyClaude({
    docPath,
    virtual: {
      "biblio/meta": biblio,
      "biblio/fix": () => { const b = Shelf.read("works/novels-biblio.json"); return b ? { items: b.fix || {} } : null; },
    },
    virtualSource: { "biblio/meta": "works/novels-biblio.json" },
  });
  const s = document.createElement("script"); s.src = CFG.code; document.body.appendChild(s);
})();
</script>
"""

BAR = """<div id="shelfBar" style="position:sticky;top:0;z-index:60;display:flex;gap:4px;align-items:center;flex-wrap:wrap;padding:6px 10px;margin:-8px 0 12px;background:var(--paper,#fff);border-bottom:1px solid var(--line,#ddd);font:14px/1.4 system-ui,sans-serif">
<a href="index.html" style="font-weight:700;color:inherit;text-decoration:none;margin-right:6px">shelf</a>
<a href="index.html" style="color:inherit;opacity:.75;padding:4px 8px;text-decoration:none">ホーム</a>
<a href="library.html" style="color:inherit;opacity:.75;padding:4px 8px;text-decoration:none">蔵書</a>
<a href="novels.html" style="color:inherit;padding:4px 8px;text-decoration:none;__N__">必読書</a>
<a href="films.html" style="color:inherit;padding:4px 8px;text-decoration:none;__F__">映画</a>
<span id="shelfSync" style="margin-left:auto;font-size:12px;opacity:.8">…</span>
</div>
<p id="shelfMsg" hidden style="padding:10px 12px;border-radius:8px;background:#f6ead2;color:#5a3d0a;font:14px system-ui,sans-serif"></p>
"""

def build(kind, src):
    s = open(src, encoding="utf-8").read()
    body = s[s.find("<body>") + 6:]
    pre, rest = body.split("<script>", 1)
    code, _ = rest.split("</script>", 1)
    # 作品データを取り外す
    m = re.search(r"const\s+DATA\s*=\s*", code)
    obj, end = json.JSONDecoder().raw_decode(code[m.end():])
    code = code[:m.start()] + "const DATA = window.__DATA__;" + code[m.end() + end:]
    title_m = re.search(r"<title>(.*?)</title>", pre)
    pre = re.sub(r"<title>.*?</title>", "", pre, count=1)
    cfg = dict(PAGES[kind]); cfg["code"] = f"app/legacy-{kind}.js"
    bar = BAR.replace("__N__", "font-weight:700" if kind == "novels" else "opacity:.75").replace("__F__", "font-weight:700" if kind == "films" else "opacity:.75")
    # 見た目の中身（<style> と本文）の先頭に上の帯を入れる
    parts = re.split(r"(</style>)", pre, maxsplit=1)
    first_markup = parts[0] + parts[1] + bar + parts[2] if len(parts) == 3 else bar + pre
    html = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{cfg['title']}</title>
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="app/icon.svg" type="image/svg+xml">
</head>
<body>
{first_markup}
{LOADER.replace('__CFG__', json.dumps(cfg, ensure_ascii=False))}
</body>
</html>
"""
    header = f"// 今のチェッカー（{title_m.group(1) if title_m else kind}）の画面のプログラム。tools/build-legacy.py で取り出したもので、手を入れていない。\n"
    open(os.path.join(ROOT, f"{kind}.html"), "w", encoding="utf-8").write(html)
    open(os.path.join(ROOT, f"app/legacy-{kind}.js"), "w", encoding="utf-8").write(header + code)
    print(kind, "page", len(html), "code", len(code))

if __name__ == "__main__":
    build("novels", sys.argv[1]); build("films", sys.argv[2])
