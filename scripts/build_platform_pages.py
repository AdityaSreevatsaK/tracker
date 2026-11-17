"""Publish crawlable, JavaScript-free pages of the most-wanted missing wheels by platform.

    python3 scripts/build_platform_pages.py data/coverage.json _site/data/most-wanted.json _site campaigns.toml data/builds.json

Runs after the package and campaign pages so all platform URLs can be added to the same sitemap.
"""
from __future__ import annotations

import html
import json
import sys
from pathlib import Path

if __package__:
    from . import build_campaigns, build_pages
else:
    import build_campaigns
    import build_pages

BASE = build_pages.BASE_URL
CSP = build_pages.CSP


def _page(title: str, description: str, content: str, canonical: str, root: str) -> str:
    e = html.escape
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="{e(CSP, quote=True)}">
  <title>{e(title)}</title>
  <meta name="description" content="{e(description, quote=True)}">
  <link rel="canonical" href="{e(canonical, quote=True)}">
  <link rel="stylesheet" href="{root}style.css">
  <link rel="icon" href="{root}favicon.svg" type="image/svg+xml">
</head>
<body>
  <header class="wrap"><p class="eyebrow"><a href="{root}">wheelgap tracker</a></p>
    <h1>{e(title)}</h1><p class="lede">{e(description)}</p></header>
  <main class="wrap">{content}</main>
</body></html>
"""


def build(
    coverage_path: Path,
    wanted_path: Path,
    site: Path,
    config_path: Path | None = None,
    builds_path: Path | None = None,
) -> int:
    scan = json.loads(coverage_path.read_text(encoding="utf-8"))
    wanted = json.loads(wanted_path.read_text(encoding="utf-8"))
    if scan.get("schema") != 1 or wanted.get("generated") != scan.get("generated") or not isinstance(wanted.get("targets"), dict):
        raise ValueError("platform pages require a matching coverage scan and most-wanted index")
    targets = scan["targets"]
    python = build_pages.newest_non_free_threaded(targets)
    total = min(5000, len(scan["packages"]))
    packages = sorted(scan["packages"], key=lambda p: p["rank"])[:total]
    campaigns = build_campaigns.load_campaigns(config_path) if config_path is not None and config_path.exists() else []
    lab_targets = set()
    if builds_path is not None and builds_path.exists():
        builds = json.loads(builds_path.read_text(encoding="utf-8"))
        if isinstance(builds, dict) and builds.get("schema") == 1:
            lab_targets = {r["target"] for r in builds.get("results", [])
                           if isinstance(r, dict) and isinstance(r.get("target"), str)}
    out = site / "platforms"
    out.mkdir(parents=True, exist_ok=True)
    e = html.escape
    urls = [f"{BASE}platforms/"]
    index_links = []

    for platform, friendly in build_pages.PLATFORM_NAMES.items():
        platform_targets = [t for t in targets if t["platform"] == platform]
        if not platform_targets:
            continue
        url = f"{BASE}platforms/{platform}/"
        index_links.append(f'<li><a href="{e(platform)}/">{e(friendly)}</a></li>')
        label = f"{python} {platform}"
        index = next((i for i, t in enumerate(targets) if t["label"] == label), None)
        if index is None:
            summary = f"Wheel coverage for Python {python} is not available on this platform."
            rows = []
        else:
            wheel_count = sum(p["results"][index] == "wheel" for p in packages)
            percent = f"{(wheel_count * 100 / total):.1f}" if total else "0.0"
            summary = (f"{wheel_count:,} of the {total:,} top PyPI packages ({percent}%) have a "
                       f"prebuilt wheel on {friendly} for Python {python}.")
            source = wanted["targets"].get(label, [])
            rows = source[:50] if isinstance(source, list) else []

        items = []
        for item in rows:
            if not isinstance(item, dict) or item.get("status") not in ("source", "missing"):
                continue
            name = item.get("name")
            if not isinstance(name, str):
                continue
            slug = build_pages.canonical(name)
            if not build_pages.SAFE_NAME.fullmatch(slug):
                continue
            status = "builds from source" if item["status"] == "source" else "can't install"
            rank = str(item.get("rank", ""))
            if not rank.isdecimal():
                rank = "?"
            items.append(f'<li>#{e(rank)} <a href="../../p/{e(slug)}/">{e(name)}</a> '
                         f'({e(str(item.get("version", "")))}) · {e(status)}</li>')
        list_html = "<ol>" + "".join(items) + "</ol>" if items else "<p>No missing-wheel entries for this target.</p>"
        campaign_links = [
            f'<a href="../../campaigns/{e(c["id"])}/">{e(c["title"])}</a>'
            for c in campaigns if c["platform"] == platform and (c.get("python") or python) == python
        ]
        extras = ("<p>Campaign: " + " · ".join(campaign_links) + "</p>") if campaign_links else ""
        if label in lab_targets:
            extras += '<p><a href="../../#lab-section">See build lab results</a> for this target.</p>'
        title = f"Python packages without {friendly} wheels"
        content = (f'<section><h2>Most-wanted wheels on Python {e(python)}</h2>'
                   f'<p>{e(summary)}</p>{list_html}{extras}'
                   '<p><a href="../../">Search every package</a></p></section>')
        page = _page(title, summary, content, url, "../../")
        folder = out / platform
        folder.mkdir(exist_ok=True)
        (folder / "index.html").write_text(page, encoding="utf-8")
        urls.append(url)

    main = _page("Wheel coverage by platform", "Browse the top missing PyPI wheels on each platform.",
                 "<section><h2>Platforms</h2><ul>" + "".join(index_links) + "</ul></section>",
                 f"{BASE}platforms/", "../")
    (out / "index.html").write_text(main, encoding="utf-8")
    build_campaigns.add_to_sitemap(site, urls)
    return len(urls) - 1


if __name__ == "__main__":
    coverage, wanted, site = (Path(p) for p in sys.argv[1:4])
    config = Path(sys.argv[4]) if len(sys.argv) > 4 else None
    builds = Path(sys.argv[5]) if len(sys.argv) > 5 else None
    print(f"platforms: {build(coverage, wanted, site, config, builds)} pages in {site / 'platforms'}")
