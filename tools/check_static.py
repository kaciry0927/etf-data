# -*- coding: utf-8 -*-
"""Static sanity checks for a WeChat mini program source tree.

- WXML tag balance + mustache balance
- WXSS brace balance
- JS bind handlers referenced in WXML exist on the page/component object (best effort)
- page/list consistency with app.json
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MP = ROOT / "miniprogram"
errors = []
warnings = []


def check_wxml(path: Path):
    text = path.read_text(encoding="utf-8")
    if text.count("{{") != text.count("}}"):
        errors.append(f"{path}: mustache not balanced ({text.count('{{')} vs {text.count('}}')})")

    # strip comments
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    stack = []
    for m in re.finditer(r"<\s*(/?)\s*([A-Za-z][\w\-:]*)([^>]*?)(/?)\s*>", text):
        closing, name, attrs, selfclose = m.groups()
        if name.lower() in ("img", "input", "br", "hr"):
            continue
        if closing:
            if not stack:
                errors.append(f"{path}: closing </{name}> with empty stack")
            elif stack[-1] != name:
                errors.append(f"{path}: closing </{name}> but expected </{stack[-1]}>")
                stack.pop()
            else:
                stack.pop()
        elif selfclose:
            continue
        else:
            stack.append(name)
    if stack:
        errors.append(f"{path}: unclosed tags {stack}")

    # event handler references
    for m in re.finditer(r'(?:bind|catch)(?:tap|input|change|longpress|touchstart|touchmove|touchend|touchcancel|close)="([A-Za-z_$][\w$]*)"', text):
        handlers.add(m.group(1))


def check_wxss(path: Path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"/\*.*?\*/", "", text, flags=re.S)
    if text.count("{") != text.count("}"):
        errors.append(f"{path}: braces not balanced ({text.count('{')} vs {text.count('}')})")


def js_methods(path: Path):
    text = path.read_text(encoding="utf-8")
    # only top-level-ish method definitions: "name(" or "name: function"
    names = set(re.findall(r"^\s{2,6}([A-Za-z_$][\w$]*)\s*\(", text, re.M))
    names |= set(re.findall(r"^\s{2,6}([A-Za-z_$][\w$]*)\s*:\s*function", text, re.M))
    return names


for page in sorted((MP / "pages").glob("*/index.wxml")):
    handlers = set()
    check_wxml(page)
    js = page.with_suffix(".js")
    if js.exists():
        defined = js_methods(js)
        # lifecycle methods are not relevant; only report unknown handlers
        for h in sorted(handlers):
            if h not in defined:
                warnings.append(f"{page.name}: handler '{h}' not found as a method in {js.name}")

for comp in sorted((MP / "components").glob("*/index.wxml")):
    handlers = set()
    check_wxml(comp)
    js = comp.with_suffix(".js")
    if js.exists():
        defined = js_methods(js)
        for h in sorted(handlers):
            if h not in defined:
                warnings.append(f"{comp}: handler '{h}' not found in {js.name}")

for p in list(MP.rglob("*.wxss")):
    check_wxss(p)

app = json.loads((MP / "app.json").read_text(encoding="utf-8"))
for p in app["pages"]:
    for ext in ("js", "json", "wxml", "wxss"):
        f = MP / (p + "." + ext)
        if not f.exists():
            errors.append(f"app.json page missing {ext}: {p}")
for item in app.get("tabBar", {}).get("list", []):
    if item["pagePath"] not in app["pages"]:
        errors.append(f"tabBar page not in pages: {item['pagePath']}")
    for key in ("iconPath", "selectedIconPath"):
        if key in item and not (MP / item[key]).exists():
            errors.append(f"tabBar icon missing: {item[key]}")

print("PAGES:", len(app["pages"]))
print("ERRORS:", len(errors))
for e in errors:
    print("  E", e)
print("WARNINGS:", len(warnings))
for w in warnings:
    print("  W", w)
sys.exit(1 if errors else 0)
