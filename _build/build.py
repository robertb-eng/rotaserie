#!/usr/bin/env python3
"""Build the site's pages from _src/ into the repo root. Python standard library only; the output is committed,
so GitHub Pages keeps serving plain files and nothing runs on GitHub.

    python3 _build/build.py                 write the pages
    python3 _build/build.py --check         exit 1 if any committed page differs from a fresh build
    python3 _build/build.py --import-legal  after the app's tools/export_legal.py has rewritten terms.html and
                                            privacy.html here, copy their text into _src/pages/ and rebuild

Sources
    _src/site.json            settings for every page (switches such as "pricing" live here)
    _src/strings.<lang>.json  the words, by language; a page reads them as {{home.hero.title}}
    _src/generated/*.json     pieces made by _build/prerender.js (the Type to Build examples, read by the real parser)
    _src/layout.html          the page around <main>: head, top bar, footer
    _src/partials/*.html      pieces the layout or a page pulls in with {{> name}}
    _src/pages/*.html         one file per page: a JSON block in <!--meta ... --> then the inside of <main>

Template rules (small on purpose)
    {{key}}  {{a.b.c}}          a value, inserted as written (values are HTML). Looked up in the nearest {{#each}} item
                                first, then the page's meta, the language's strings, then site.json
    {{> name}}                  _src/partials/name.html; a page's "partials" map can swap one name for another
    {{#if key}}..{{else}}..{{/if}}      kept when the value is truthy; {{#unless key}} is the opposite. They nest
    {{#each key}}..{{/each}}    once per item of a list; inside, {{this}} is the item, {{@n}} its number from 1,
                                {{@nn}} the same with two digits, and an item's own keys are read first
    {{json key}}                the value as JSON text, for structured data
    {{shot name alt=key sizes="..." class="..." eager nozoom}}
                                the <picture> pair (light and dark) for the app screenshot img/app/<name>-<lang>-...,
                                with every width found on disk and the real dimensions ({{shot =key ...}} reads the
                                name from a value)
A missing key or partial stops the build.
"""
import html
import json
import os
import re
import struct
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_src")
ORIGIN = "https://rotaserie.com/"
LEGAL = ("terms", "privacy")
PER_PAGE = ("title", "description", "og_title", "og_description")

META = re.compile(r"\A<!--meta\n(.*?)\n-->\n", re.S)
TAG = re.compile(r"\{\{(.*?)\}\}", re.S)
ARG = re.compile(r'(\w+)=(?:"([^"]*)"|(\S+))|(\S+)')


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write(path, text):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def fail(msg):
    sys.exit("build: " + msg)


def load_page(name):
    text = read(os.path.join(SRC, "pages", name + ".html"))
    m = META.match(text)
    if not m:
        fail(f"_src/pages/{name}.html must start with a <!--meta ... --> block")
    return json.loads(m.group(1)), text[m.end():]


# ------------------------------------------------------------------------------------------------ pictures
def webp_size(path):
    """(width, height) of a WebP file, from its header."""
    with open(path, "rb") as f:
        b = f.read(40)
    if b[:4] != b"RIFF" or b[8:12] != b"WEBP":
        fail(f"{path} is not a WebP file")
    kind = b[12:16]
    if kind == b"VP8 ":
        w, h = struct.unpack("<HH", b[26:30])
        return w & 0x3FFF, h & 0x3FFF
    if kind == b"VP8L":
        n = struct.unpack("<I", b[21:25])[0]
        return (n & 0x3FFF) + 1, ((n >> 14) & 0x3FFF) + 1
    if kind == b"VP8X":
        return int.from_bytes(b[24:27], "little") + 1, int.from_bytes(b[27:30], "little") + 1
    fail(f"{path}: unknown WebP kind")


def shot_html(name, lang, base, alt, sizes, cls, eager, zoom):
    """Two <picture>s, light and dark (CSS shows one), each AVIF then WebP at every width on disk."""
    folder = os.path.join(ROOT, "img", "app")
    out = []
    for scheme, mark in (("light", "lt"), ("dark", "dk")):
        stem = f"{name}-{lang}-{scheme}-"
        widths = sorted(int(fn[len(stem):-5]) for fn in os.listdir(folder)
                        if fn.startswith(stem) and fn.endswith(".webp") and fn[len(stem):-5].isdigit())
        if not widths:
            fail(f"no screenshot img/app/{stem}*.webp")
        w, h = webp_size(os.path.join(folder, f"{stem}{widths[0]}.webp"))

        def url(wd, ext, stem=stem):
            return f"{base}img/app/{stem}{wd}.{ext}"

        def srcset(ext, widths=widths, url=url):
            return ", ".join(f"{url(wd, ext)} {wd}w" for wd in widths)

        have_avif = all(os.path.exists(os.path.join(folder, f"{stem}{wd}.avif")) for wd in widths)
        z = f' data-zoom="{url(widths[-1], "webp")}"' if zoom else ""
        out.append(
            f'<picture class="{mark}">'
            + (f'<source type="image/avif" srcset="{srcset("avif")}" sizes="{sizes}">' if have_avif else "")
            + f'<img src="{url(widths[0], "webp")}" srcset="{srcset("webp")}" sizes="{sizes}" width="{w}" height="{h}" '
            + ('fetchpriority="high" ' if eager else 'loading="lazy" ') + f'decoding="async" alt="{alt}"{z}></picture>')
    return f'<span class="shot{" " + cls if cls else ""}">' + "".join(out) + "</span>"


# ------------------------------------------------------------------------------------------------ templates
class Scope:
    def __init__(self, ctx):
        self.stack = [ctx]

    def get(self, key, where):
        for frame in reversed(self.stack):
            cur, ok = frame, True
            for part in key.split("."):
                if isinstance(cur, dict) and part in cur:
                    cur = cur[part]
                elif isinstance(cur, list) and part.isdigit() and int(part) < len(cur):
                    cur = cur[int(part)]
                else:
                    ok = False
                    break
            if ok:
                return cur
        fail(f"{where}: unknown key {key!r}")


def parse(template, where):
    """Template text -> tree of ["text", s], ["var", key], ["inc", name], ["shot", args],
    ["if" | "unless" | "each", key, body, else-body]."""
    root, stack, pos = [], [], 0
    cur = root
    for m in TAG.finditer(template):
        if m.start() > pos:
            cur.append(["text", template[pos:m.start()]])
        pos = m.end()
        tag = m.group(1).strip()
        if tag.startswith(">"):
            cur.append(["inc", tag[1:].strip()])
        elif tag.startswith("#"):
            kind, _, key = tag[1:].partition(" ")
            if kind not in ("if", "unless", "each") or not key.strip():
                fail(f"{where}: bad block {{{{{tag}}}}}")
            node = [kind, key.strip(), [], []]
            cur.append(node)
            stack.append((node, cur))
            cur = node[2]
        elif tag == "else":
            if not stack:
                fail(f"{where}: {{{{else}}}} outside a block")
            cur = stack[-1][0][3]
        elif tag.startswith("/"):
            if not stack or stack[-1][0][0] != tag[1:].strip():
                fail(f"{where}: unexpected {{{{{tag}}}}}")
            cur = stack.pop()[1]
        elif tag.startswith("shot "):
            cur.append(["shot", tag[5:]])
        elif tag.startswith("json "):
            cur.append(["json", tag[5:].strip()])
        else:
            cur.append(["var", tag])
    if stack:
        fail(f"{where}: {{{{#{stack[-1][0][0]} {stack[-1][0][1]}}}}} is never closed")
    cur.append(["text", template[pos:]])
    return root


def emit(tree, scope, ctx, where, depth=0):
    out = []
    for node in tree:
        kind = node[0]
        if kind == "text":
            out.append(node[1])
        elif kind == "var":
            out.append(str(scope.get(node[1], where)))
        elif kind == "json":  # a value as JSON text (for structured data): tags stripped, entities turned back
            def plain(v):
                if isinstance(v, str):
                    return html.unescape(re.sub(r"<[^>]+>", "", v))
                if isinstance(v, list):
                    return [plain(x) for x in v]
                if isinstance(v, dict):
                    return {k: plain(x) for k, x in v.items()}
                return v
            out.append(json.dumps(plain(scope.get(node[1], where)), ensure_ascii=False).replace("</", "<\\/"))
        elif kind == "inc":
            if depth > 8:
                fail(f"partials nest too deep in {where}")
            name = ctx.get("partials", {}).get(node[1], node[1])
            path = os.path.join(SRC, "partials", name + ".html")
            if not os.path.exists(path):
                fail(f"{where}: no partial _src/partials/{name}.html")
            out.append(emit(parse(read(path), name), scope, ctx, name, depth + 1))
        elif kind == "shot":
            words, opts = [], {}
            for m in ARG.finditer(node[1]):
                if m.group(1):
                    opts[m.group(1)] = m.group(2) if m.group(2) is not None else m.group(3)
                else:
                    words.append(m.group(4))
            name = words[0]
            if name.startswith("="):
                name = str(scope.get(name[1:], where))
            alt = str(scope.get(opts["alt"], where)) if "alt" in opts else ""
            lang = opts.get("lang", "")
            if lang.startswith("="):  # lang==key: the language comes from a value ("" = the page's)
                lang = str(scope.get(lang[1:], where))
            out.append(shot_html(name, lang or ctx["lang"], ctx["base"], alt.replace('"', "&quot;"),
                                 opts.get("sizes", "100vw"), opts.get("class", ""), "eager" in words, "nozoom" not in words))
        elif kind in ("if", "unless"):
            val = scope.get(node[1], where)
            out.append(emit(node[2] if bool(val) == (kind == "if") else node[3], scope, ctx, where, depth))
        elif kind == "each":
            items = scope.get(node[1], where)
            if not isinstance(items, list):
                fail(f"{where}: {node[1]!r} is not a list")
            for i, item in enumerate(items):
                frame = dict(item) if isinstance(item, dict) else {}
                frame.update({"this": item, "@n": i + 1, "@nn": f"{i + 1:02d}", "@first": i == 0})
                scope.stack.append(frame)
                out.append(emit(node[2], scope, ctx, where, depth))
                scope.stack.pop()
    return "".join(out)


def render(template, ctx, where):
    return emit(parse(template, where), Scope(ctx), ctx, where)


# ------------------------------------------------------------------------------------------------ the build
def load_json(path):
    if not os.path.exists(path):
        fail(f"missing {os.path.relpath(path, ROOT)}")
    try:
        return json.loads(read(path))
    except ValueError as ex:
        fail(f"{os.path.relpath(path, ROOT)}: {ex}")


def same_shape(a, b, path=""):
    """Every language's strings must have the same keys (and list lengths) as the first language's."""
    if isinstance(a, dict):
        if not isinstance(b, dict):
            return [path or "(top)"]
        bad = [f"{path}.{k}".lstrip(".") for k in a if k not in b]
        bad += [f"{path}.{k} (extra)".lstrip(".") for k in b if k not in a]
        for k in a:
            if k in b:
                bad += same_shape(a[k], b[k], f"{path}.{k}".lstrip("."))
        return bad
    if isinstance(a, list):
        if not isinstance(b, list) or len(a) != len(b):
            return [path + " (list length)"]
        return [x for i, (p, q) in enumerate(zip(a, b)) for x in same_shape(p, q, f"{path}.{i}")]
    return []


def public_url(out):
    return ORIGIN + ("" if out == "index.html" else out[:-10] if out.endswith("/index.html") else out)


def build():
    """Return {output path relative to ROOT: text}."""
    site = load_json(os.path.join(SRC, "site.json"))
    layout = read(os.path.join(SRC, "layout.html"))
    langs = site.get("langs", ["en"])
    first = langs[0]
    strings = {lg: load_json(os.path.join(SRC, f"strings.{lg}.json")) for lg in langs}
    for lg in langs[1:]:
        # (a page with no words in this language isn't built in it: its links go to the first language's page)
        want = dict(strings[first], pages={k: v for k, v in strings[first].get("pages", {}).items()
                                           if strings[lg].get("pages", {}).get(k)})
        have = dict(strings[lg], pages={k: v for k, v in strings[lg].get("pages", {}).items() if v})
        bad = same_shape(want, have)
        if bad:
            fail(f"strings.{lg}.json doesn't match strings.{first}.json at: " + ", ".join(bad[:12]))
    gen_dir = os.path.join(SRC, "generated")
    files, urls = {}, []
    for lg in langs:
        prefix = "" if lg == first else lg + "/"
        gen = {}
        if os.path.isdir(gen_dir):
            for fn in sorted(os.listdir(gen_dir)):
                if fn.endswith(f".{lg}.json"):
                    gen[fn[:-len(f".{lg}.json")]] = load_json(os.path.join(gen_dir, fn))
        for fn in sorted(os.listdir(os.path.join(SRC, "pages"))):
            if not fn.endswith(".html"):
                continue
            name = fn[:-5]
            meta, main = load_page(name)
            words = strings[lg].get("pages", {}).get(name, {})
            if lg != first and not words:
                continue  # (a page with no words in this language isn't built in it)
            ctx = dict(site)
            ctx.update(strings[lg])
            ctx.update({k: v for k, v in meta.items() if lg == first or k not in PER_PAGE})
            ctx.update(words)
            file = meta.get("out", fn)
            out = prefix + file
            ctx.update({"lang": lg, "base": "../" if prefix else "", "gen": gen, "page": name, "file": file,
                        "url": public_url(out), "is_home": name == "index", "multi_lang": len(langs) > 1,
                        "home_href": "" if name == "index" else "index.html"})
            ctx.update({"has_es": False, "is_es": False, "href_es": "", "url_es": ""})  # (until Spanish is built)
            for other in langs:
                there = ("" if other == first else other + "/") + file
                has = other == first or bool(strings[other].get("pages", {}).get(name))
                ctx["has_" + other] = has
                ctx["url_" + other] = public_url(there if has else ("" if other == first else other + "/") + "index.html")
                ctx["href_" + other] = file if other == lg else ctx["base"] + (there if has else ("" if other == first else other + "/") + "index.html")
                ctx["is_" + other] = other == lg
            # {{to.about}}: the page in this language if it is built in it, else the first language's
            ctx["to"] = {}
            for other_fn in sorted(os.listdir(os.path.join(SRC, "pages"))):
                if other_fn.endswith(".html"):
                    nm = other_fn[:-5]
                    here = lg == first or bool(strings[lg].get("pages", {}).get(nm))
                    ctx["to"][nm] = other_fn if here else ctx["base"] + other_fn
            ctx["mail_body_attr"] = html.escape(strings[lg]["home"]["start"].get("mail_body", ""), quote=True).replace("\n", "&#10;")
            ctx["locale"] = site.get("og_locale", {}).get(lg, lg)
            ctx["other_locales"] = [site.get("og_locale", {}).get(o, o) for o in langs if o != lg and ctx["has_" + o]]
            ctx["partials"] = {**site.get("partials", {}), **meta.get("partials", {})}
            ctx["main"] = render(main, ctx, f"pages/{fn}")
            files[out] = render(layout, ctx, f"layout for {fn}")
            if ctx.get("sitemap", True):
                urls.append((lg != first, ctx.get("sitemap_order", 50), ctx["url"]))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for _, _, loc in sorted(urls):
        lines.append(f"  <url><loc>{loc}</loc></url>")
    lines.append("</urlset>")
    files["sitemap.xml"] = "\n".join(lines) + "\n"
    return files


def import_legal():
    """Take the <main> text that export_legal.py wrote into terms.html / privacy.html and store it as the page
    source, keeping the page's meta block."""
    for name in LEGAL:
        page = read(os.path.join(ROOT, name + ".html"))
        start, end = page.find('<main id="main">\n'), page.rfind("</main>")
        if start < 0 or end < 0:
            fail(f"{name}.html has no <main id=\"main\"> ... </main>")
        body = page[start + len('<main id="main">\n'):end]
        src = os.path.join(SRC, "pages", name + ".html")
        meta_text = META.match(read(src)).group(0)
        write(src, meta_text + body)
        print("imported", name)


def main(argv):
    if "--import-legal" in argv:
        import_legal()
    files = build()
    if "--check" in argv:
        stale = [p for p, text in files.items()
                 if not os.path.exists(os.path.join(ROOT, p)) or read(os.path.join(ROOT, p)) != text]
        if stale:
            print("build: out of date (run python3 _build/build.py):", ", ".join(sorted(stale)))
            return 1
        print(f"build: {len(files)} files up to date")
        return 0
    for path, text in files.items():
        write(os.path.join(ROOT, path), text)
    print("built", ", ".join(sorted(files)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
