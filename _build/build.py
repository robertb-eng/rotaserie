#!/usr/bin/env python3
"""Build the site's pages from _src/ into the repo root. Python standard library only; the output is committed,
so GitHub Pages keeps serving plain files and nothing runs on GitHub.

    python3 _build/build.py                 write the pages
    python3 _build/build.py --check         exit 1 if any committed page differs from a fresh build
    python3 _build/build.py --import-legal  after the app's tools/export_legal.py has rewritten terms.html and
                                            privacy.html here, copy their text into _src/pages/ and rebuild

Sources
    _src/site.json        defaults for every page
    _src/layout.html      the page around <main>: head, top bar, footer
    _src/partials/*.html  pieces the layout or a page pulls in with {{> name}}
    _src/pages/*.html     one file per page: a JSON block in <!--meta ... --> then the inside of <main>

Template rules (small on purpose)
    {{key}}                     a value from the page's meta or site.json, inserted as written (values are HTML)
    {{> name}}                  _src/partials/name.html; a page's "partials" map can swap one name for another
    {{#if key}}...{{/if}}       kept when the value is truthy (not nested)
    {{#unless key}}...{{/unless}}
A missing key or partial stops the build.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "_src")
ORIGIN = "https://rotaserie.com/"
LEGAL = ("terms", "privacy")

META = re.compile(r"\A<!--meta\n(.*?)\n-->\n", re.S)
INCLUDE = re.compile(r"\{\{>\s*([\w-]+)\s*\}\}")
BLOCK = re.compile(r"\{\{#(if|unless) (\w+)\}\}(.*?)\{\{/\1\}\}", re.S)
VAR = re.compile(r"\{\{(\w+)\}\}")


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


def render(template, ctx, where, depth=0):
    if depth > 8:
        fail(f"partials nest too deep in {where}")

    def include(m):
        name = ctx.get("partials", {}).get(m.group(1), m.group(1))
        path = os.path.join(SRC, "partials", name + ".html")
        if not os.path.exists(path):
            fail(f"{where}: no partial _src/partials/{name}.html")
        return render(read(path), ctx, name, depth + 1)

    out = INCLUDE.sub(include, template)

    def block(m):
        kind, key, body = m.groups()
        if key not in ctx:
            fail(f"{where}: unknown key {key!r} in {{{{#{kind}}}}}")
        return body if bool(ctx[key]) == (kind == "if") else ""

    out = BLOCK.sub(block, out)

    def var(m):
        key = m.group(1)
        if key not in ctx:
            fail(f"{where}: unknown key {key!r}")
        return str(ctx[key])

    return VAR.sub(var, out)


def build():
    """Return {output path relative to ROOT: text}."""
    site = json.loads(read(os.path.join(SRC, "site.json")))
    layout = read(os.path.join(SRC, "layout.html"))
    files, urls = {}, []
    for fn in sorted(os.listdir(os.path.join(SRC, "pages"))):
        if not fn.endswith(".html"):
            continue
        name = fn[:-5]
        meta, main = load_page(name)
        ctx = dict(site)
        ctx.update(meta)
        ctx["partials"] = {**site.get("partials", {}), **meta.get("partials", {})}
        ctx["main"] = render(main, ctx, f"pages/{fn}")
        out = meta.get("out", fn)
        files[out] = render(layout, ctx, f"layout for {fn}")
        if ctx.get("sitemap", True):
            urls.append((ctx.get("sitemap_order", 50), out))
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for _, out in sorted(urls):
        loc = ORIGIN + ("" if out == "index.html" else out)
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
