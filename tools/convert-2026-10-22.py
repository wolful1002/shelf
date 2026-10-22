# 移行前の写し（import/2026-10-22）を、docs/data-design.md の形に変換する
import json, os, re, hashlib, collections, sys

SRC = "/home/claude/shelf-data/import/2026-10-22"
DST = "/home/claude/shelf-data"
NOW = "2026-10-22T00:00:00Z"

def load(p): return json.load(open(os.path.join(SRC, p), encoding="utf-8"))
def save(p, obj):
    path = os.path.join(DST, p); os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f: json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))
def isdate(v): return isinstance(v, str) and re.match(r"\d{4}-\d{2}-\d{2}", v)
def shard(rid): return "0123456789abcdef"[int(hashlib.md5(rid.encode()).hexdigest(), 16) % 16]

# ---- 作品 ----
novels = load("books/works.json")
films = load("films/works.json")
save("works/novels.json", novels)
save("works/films.json", films)
nbyk = {b["k"]: b for b in novels["books"]}

meta = load("books/biblio-meta.json"); fix = load("books/biblio-fix-0.json")
save("works/novels-biblio.json", {"fix": fix["items"], "checked": meta["checked"], "last": meta.get("last"), "log": meta.get("log", [])})
queue = {"fields": None, "items": []}
for i in range(4):
    q = load(f"books/biblio-queue-{i}.json"); queue["fields"] = q["fields"]; queue["items"] += q["items"]
save("tasks/biblio-queue.json", queue)

# ---- 必読書の記録 ----
rb = load("books/records-books.json")
reading = {}
for k, v in rb["read"].items():
    e = {"s": "read", "via": "checker", "n": 1, "u": NOW}
    if isdate(v): e["d"] = v
    reading["n:" + k] = e
for k in rb["want"]:
    reading.setdefault("n:" + k, {"s": "want", "via": "checker", "u": NOW})
save("records/reading.json", {"items": reading})

library = collections.defaultdict(dict)
for k in rb["own"]:
    b = nbyk[k]
    rid = "b-ck-" + k
    library[shard(rid)][rid] = {
        "id": rid, "kind": "book", "cat": "小説", "t": b["t"], "a": b["a"],
        "st": "own", "src": "checker", "nk": k, "link": "auto", "added": NOW, "u": NOW,
    }
for s in "0123456789abcdef":
    save(f"records/library/{s}.json", {"items": library.get(s, {})})

log = load("books/records-log.json")
items = []
for i in range(log["chunks"]):
    items += load(f"books/records-log-{i}.json")["items"]
save("records/booklog.json", {"state": log, "items": items})

# ---- 映画の記録 ----
w = load("films/records-watched.json")
fset = {f["k"] for f in films["films"]}
frec = {}
for k, v in w["seen"].items():
    frec["f:" + k] = {"views": [{"d": v}] if isdate(v) else [{}], "u": NOW}
for k in w["want"]:
    frec.setdefault("f:" + k, {"views": [], "u": NOW})["want"] = 1
off = load("films/records-offlist.json")["items"]
groups = collections.OrderedDict()
for e in off:
    key = (e["t"], e.get("y") or 0)
    groups.setdefault(key, []).append(e)
for n, ((t, y), es) in enumerate(groups.items()):
    rid = "x:" + hashlib.md5(f"{t}|{y}".encode()).hexdigest()[:8]
    rec = {"t": t, "views": [{"d": e["d"]} if isdate(e.get("d")) else {} for e in es], "u": NOW}
    if y: rec["y"] = y
    frec[rid] = rec
save("records/films.json", {"items": frec})

save("records/queue.json", {"items": {}})
save("records/settings.json", {"places": {}, "nextLabel": 1})

# ---- 件数の突き合わせ ----
R = json.load(open(os.path.join(DST, "records/reading.json")))["items"]
L = {}
for s in "0123456789abcdef": L.update(json.load(open(os.path.join(DST, f"records/library/{s}.json")))["items"])
F = json.load(open(os.path.join(DST, "records/films.json")))["items"]
BL = json.load(open(os.path.join(DST, "records/booklog.json")))["items"]
checks = [
    ("必読書の作品", 2767, len(json.load(open(os.path.join(DST, "works/novels.json")))["books"])),
    ("映画の作品", 2074, len(json.load(open(os.path.join(DST, "works/films.json")))["films"])),
    ("必読書の読了", 98, sum(1 for e in R.values() if e["s"] == "read")),
    ("　うち日付あり", 44, sum(1 for e in R.values() if e["s"] == "read" and "d" in e)),
    ("所有（蔵書の仮登録）", 120, len(L)),
    ("ブクログの記録", 1613, len(BL)),
    ("映画の鑑賞済み", 225, sum(1 for k, e in F.items() if k.startswith("f:") and e["views"])),
    ("　うち日付あり", 114, sum(1 for k, e in F.items() if k.startswith("f:") and any("d" in v for v in e["views"]))),
    ("リスト外の鑑賞（回数）", 1048, sum(len(e["views"]) for k, e in F.items() if k.startswith("x:"))),
    ("書誌の修正", 28, len(json.load(open(os.path.join(DST, "works/novels-biblio.json")))["fix"])),
]
ok = True
for name, want, got in checks:
    print(f"{name:<16} 元 {want:>5}  新 {got:>5}  {'一致' if want == got else '不一致'}"); ok &= want == got
print("リスト外の作品の数（同じ作品の複数回をまとめた後）:", sum(1 for k in F if k.startswith("x:")))
print("蔵書ファイルの大きさ（最大）:", max(os.path.getsize(os.path.join(DST, f"records/library/{s}.json")) for s in "0123456789abcdef"), "バイト")
print("すべて一致" if ok else "不一致あり"); sys.exit(0 if ok else 1)
