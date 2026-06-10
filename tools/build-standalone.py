#!/usr/bin/env python3
"""Bundle the modular src/ app into a single self-contained HTML file.

Why: ES-module `import` is blocked over the file:// protocol (browsers treat file URLs
as opaque origins), so double-clicking src/index.html fails to load any JS. This produces
`video-compare.html` at the repo root with the CSS inlined, all JS modules bundled into one
plain <script>, and favicons embedded as data URIs — so it works offline by double-clicking,
with no server. The live GitHub Pages site keeps using the modular src/ over http.

Run:  python3 tools/build-standalone.py
"""
import base64
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "src"
JS = SRC / "js"

# dependency order: leaves first, app last (each module's __m_<name> must exist before use)
MODULE_ORDER = ["helpers", "state", "dom", "loaders", "playback", "viewer", "grid", "export", "app"]

IMPORT_RE = re.compile(r"""import\s*\{([^}]*)\}\s*from\s*['"]\./([\w.]+)\.js['"];?""", re.DOTALL)
EXPORT_DECL_RE = re.compile(r"""^export\s+(async\s+function|function|const|let|class)\s+(\w+)""", re.MULTILINE)


def bundle_module(name: str) -> str:
    text = (JS / f"{name}.js").read_text()

    # 1. collect exported identifiers
    exported = [m.group(2) for m in EXPORT_DECL_RE.finditer(text)]

    # 2. turn imports into local destructures from the source module's registry object
    destructures = []

    def _imp(m):
        names = m.group(1)
        src_mod = m.group(2)
        # `a as b` -> `a: b` for object destructuring
        parts = []
        for raw in names.split(","):
            raw = raw.strip()
            if not raw:
                continue
            am = re.match(r"(\w+)\s+as\s+(\w+)", raw)
            parts.append(f"{am.group(1)}: {am.group(2)}" if am else raw)
        destructures.append(f"  const {{ {', '.join(parts)} }} = __m_{src_mod};")
        return ""  # strip the import line

    body = IMPORT_RE.sub(_imp, text)

    # 3. drop the `export ` keyword from declarations
    body = re.sub(r"^export\s+(async\s+function|function|const|let|class)\b",
                  r"\1", body, flags=re.MULTILINE)

    ret = "  return { " + ", ".join(exported) + " };" if exported else "  return {};"
    inner = "\n".join(destructures) + "\n" + body + "\n" + ret
    return f"const __m_{name} = (function () {{\n{inner}\n}})();"


def data_uri(path: Path, mime: str) -> str:
    b64 = base64.b64encode(path.read_bytes()).decode()
    return f"data:{mime};base64,{b64}"


def main():
    bundle = "\n\n".join(bundle_module(n) for n in MODULE_ORDER)

    html = (SRC / "index.html").read_text()
    css = (SRC / "css" / "styles.css").read_text()

    # strip the file:// guard (it would wrongly fire on the standalone, which IS opened via file://)
    html = re.sub(r"<!-- file-guard:start.*?file-guard:end -->\s*", "", html, flags=re.DOTALL)

    # inline CSS
    html = re.sub(r'<link rel="stylesheet" href="\./css/styles\.css">',
                  f"<style>\n{css}\n</style>", html)

    # inline the module script as one plain script (no imports => no module/fetch needed)
    html = re.sub(r'<script type="module" src="\./js/app\.js"></script>',
                  f"<script>\n{bundle}\n</script>", html)

    # embed favicons / logo as data URIs so the file is fully portable
    for size in (32, 180, 512):
        uri = data_uri(ROOT / "assets" / f"favicon-{size}.png", "image/png")
        html = html.replace(f"../assets/favicon-{size}.png", uri)

    banner = ("<!-- AUTO-GENERATED from src/ by tools/build-standalone.py. "
              "Self-contained: open by double-clicking (works over file://). "
              "Edit src/, then re-run the build. -->\n")
    out = ROOT / "video-compare.html"
    out.write_text(banner + html)

    leftover = len(re.findall(r"^\s*(import|export)\s", out.read_text(), re.MULTILINE))
    print(f"wrote {out} ({out.stat().st_size // 1024} KB) — leftover import/export lines: {leftover}")
    if leftover:
        raise SystemExit("ERROR: unbundled import/export statements remain")


if __name__ == "__main__":
    main()
