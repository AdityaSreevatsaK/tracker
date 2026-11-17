"""Offline regression tests for crawlable platform pages (#111)."""
import json
import tempfile
import unittest
from pathlib import Path

from scripts import build_platform_pages


class PlatformPageTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.site = self.root / "_site"
        self.site.mkdir()
        (self.site / "sitemap.xml").write_text(
            '<?xml version="1.0"?><urlset><url><loc>https://wheelgap.github.io/tracker/</loc></url></urlset>',
            encoding="utf-8",
        )
        self.scan = {
            "schema": 1, "generated": "2026-11-17T03:00:00+00:00", "wheelgap": "0.13.0",
            "targets": [
                {"label": "3.14 win-arm64", "python": "3.14", "platform": "win-arm64"},
                {"label": "3.14 linux-x86_64", "python": "3.14", "platform": "linux-x86_64"},
                {"label": "3.14 pyodide", "python": "3.14", "platform": "pyodide"},
                {"label": "3.14t win-arm64", "python": "3.14t", "platform": "win-arm64"},
            ],
            "packages": [
                {"name": "Typing_Extensions", "rank": 1, "version": "4.0", "error": None,
                 "results": ["source", "wheel", "bundled", "source"]},
                {"name": "sample", "rank": 2, "version": "1.1", "error": None,
                 "results": ["missing", "wheel", "wheel", "missing"]},
            ],
        }
        self.wanted = {"generated": self.scan["generated"], "targets": {
            "3.14 win-arm64": [
                {"name": "Typing_Extensions", "version": "4.0", "rank": 1, "status": "source"},
                {"name": "sample", "version": "1.1", "rank": 2, "status": "missing"},
                {"name": "bad<script>", "version": "<broken>", "rank": 3, "status": "missing"},
            ],
            "3.14 linux-x86_64": [], "3.14 pyodide": [],
        }}
        self.coverage = self.root / "coverage.json"
        self.index = self.root / "most-wanted.json"

    def run_build(self):
        self.coverage.write_text(json.dumps(self.scan), encoding="utf-8")
        self.index.write_text(json.dumps(self.wanted), encoding="utf-8")
        return build_platform_pages.build(self.coverage, self.index, self.site)

    def test_pages_counts_links_empty_and_sitemap(self):
        self.assertEqual(self.run_build(), 3)
        root = (self.site / "platforms" / "index.html").read_text(encoding="utf-8")
        win = (self.site / "platforms" / "win-arm64" / "index.html").read_text(encoding="utf-8")
        linux = (self.site / "platforms" / "linux-x86_64" / "index.html").read_text(encoding="utf-8")
        sitemap = (self.site / "sitemap.xml").read_text(encoding="utf-8")
        self.assertIn("Windows ARM64", root)
        self.assertIn("0 of the 2 top", win)
        self.assertIn('href="../../p/typing-extensions/"', win)
        self.assertIn("builds from source", win)
        self.assertIn("can't install", win)
        self.assertNotIn("bad<script>", win)
        self.assertNotIn("<script", win)
        self.assertIn("No missing-wheel entries", linux)
        self.assertIn("2 of the 2 top", linux)
        self.assertIn("/tracker/platforms/win-arm64/", sitemap)
        self.assertEqual(sitemap.count("<loc>https://wheelgap.github.io/tracker/platforms/win-arm64/</loc>"), 1)
        self.assertIn("default-src", win)

    def test_rejects_stale_most_wanted_data(self):
        self.wanted["generated"] = "2026-11-16T03:00:00+00:00"
        with self.assertRaises(ValueError):
            self.run_build()


if __name__ == "__main__":
    unittest.main()
