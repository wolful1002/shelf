# 公開する前に実行する：画面（*.html）から読み込むアプリのファイルに版の印（?v=…）を付け、
# 端末に置くファイルの版（sw.js の V）も同じ印にそろえる。
# これで、新しい画面と古いプログラムが混ざって動く（ブラウザの一時保存のせい）ことがなくなる。
#   python3 tools/stamp-version.py
import os, re, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
V = time.strftime("%Y%m%d%H%M", time.gmtime())

# <script src="app/x.js">・<link href="app/x.css">・チェッカーの CFG.code（"app/legacy-x.js"）
REF = re.compile(r'((?:src|href)="|"code": ")(app/[\w.-]+\.(?:js|css))(?:\?v=\d+)?(")')

for name in sorted(os.listdir(ROOT)):
    if not name.endswith(".html"):
        continue
    p = os.path.join(ROOT, name)
    s = open(p, encoding="utf-8").read()
    t = REF.sub(lambda m: f"{m.group(1)}{m.group(2)}?v={V}{m.group(3)}", s)
    if t != s:
        open(p, "w", encoding="utf-8").write(t)
        print(name, len(REF.findall(s)), "件")

sw = os.path.join(ROOT, "sw.js")
s = open(sw, encoding="utf-8").read()
s = re.sub(r'const V = "shelf-[\w-]+";', f'const V = "shelf-{V}";', s)
open(sw, "w", encoding="utf-8").write(s)
print("版", V)
