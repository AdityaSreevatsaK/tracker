"""Offline tests for verified gap-wheel availability on package pages (#126)."""

import json
import tempfile
import unittest
from pathlib import Path

from scripts import build_pages


TARGETS = [
    {"label": "3.14 win-arm64", "platform": "win-arm64", "python": "3.14"},
    {"label": "3.14 linux-x86_64", "platform": "linux-x86_64", "python": "3.14"},
]
ENTRY = {"name": "Demo_Pkg", "version": "1.2", "target": "3.14 win-arm64",
         "wheel": "demo_pkg-1.2-cp314-cp314-win_arm64.whl", "sha256": "a" * 64}


def scan(statuses=("source", "wheel"), *, version="1.2"):
    return {
        "schema": 1,
        "generated": "2026-11-17T01:00:00+00:00",
        "wheelgap": "0.13.0",
        "targets": TARGETS,
        "packages": [{
            "rank": 1, "name": "demo-pkg", "version": version,
            "results": list(statuses), "pure": False, "error": None,
        }],
    }


class GapWheelPageTests(unittest.TestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        self.index = self.root / "gap-wheels.json"

    def write(self, content):
        self.index.write_text(json.dumps(content), encoding="utf-8")
        return build_pages.read_gap_wheels(self.index)

    def render(self, statuses=("source", "wheel"), *, version="1.2", matches=None):
        data = scan(statuses, version=version)
        return build_pages.page(data["packages"][0], data, "3.14", gap_wheels=matches)

    def test_matching_source_cell_has_command_and_index_link(self):
        wheels = self.write({"schema": 1, "wheels": [ENTRY]})
        page = self.render(matches=wheels)
        self.assertIn("pip install --extra-index-url "
                      "https://wheelgap.github.io/wheels/simple/ demo-pkg==1.2", page)
        self.assertIn("unofficial wheel of demo-pkg 1.2 for 3.14 win-arm64", page)
        self.assertIn('href="https://wheelgap.github.io/wheels/"', page)
        self.assertEqual(page.count("Gap wheel available (see below)"), 1)

    def test_matching_missing_cell_also_shows_hint(self):
        wheels = self.write({"schema": 1, "wheels": [ENTRY]})
        self.assertIn("Gap wheel available", self.render(("missing", "wheel"), matches=wheels))

    def test_a_wheel_cell_never_shows_a_gap_hint(self):
        wheels = self.write({"schema": 1, "wheels": [ENTRY]})
        page = self.render(("wheel", "wheel"), matches=wheels)
        self.assertNotIn("Gap wheel available", page)
        self.assertNotIn("<h2>Gap wheels</h2>", page)

    def test_version_and_python_target_must_match_exactly(self):
        for mismatched in ({**ENTRY, "version": "1.3"},
                           {**ENTRY, "target": "3.15 win-arm64"},
                           {**ENTRY, "target": "3.14t win-arm64"}):
            with self.subTest(entry=mismatched):
                self.assertNotIn("Gap wheel available", self.render(
                    matches=self.write({"schema": 1, "wheels": [mismatched]})
                ))

    def test_malformed_or_missing_index_is_ignored(self):
        self.assertEqual(build_pages.read_gap_wheels(self.index), set())
        # A malformed wheel record must never be advertised as published.
        self.assertEqual(self.write({"schema": 1, "wheels": [{**ENTRY, "sha256": "../bad"}]}), set())
        for invalid in ({}, {"schema": 5, "wheels": [ENTRY]},
                        {"schema": 1, "wheels": "not a list"},
                        {"schema": 1, "wheels": [None, {"name": "x"}]},
                        {"schema": 1, "wheels": [{**ENTRY, "version": 1.2}]},
                        {"schema": 1, "wheels": [{**ENTRY, "target": None}]}):
            with self.subTest(invalid=invalid):
                self.assertNotIn("Gap wheel available", self.render(matches=self.write(invalid)))
        self.index.write_text("{broken JSON", encoding="utf-8")
        self.assertEqual(build_pages.read_gap_wheels(self.index), set())

    def test_build_uses_optional_index_without_requiring_it(self):
        data = scan()
        coverage = self.root / "coverage.json"
        coverage.write_text(json.dumps(data), encoding="utf-8")
        self.write({"schema": 1, "wheels": [ENTRY]})
        out = self.root / "site"
        build_pages.build(coverage, out, root=self.root, gap_wheels_path=self.index)
        html = (out / "p" / "demo-pkg" / "index.html").read_text(encoding="utf-8")
        self.assertIn("Gap wheel available", html)
        # The deploy step's download can fail: the pages still build, with no hints.
        build_pages.build(coverage, out, root=self.root, gap_wheels_path=self.root / "absent.json")
        html = (out / "p" / "demo-pkg" / "index.html").read_text(encoding="utf-8")
        self.assertNotIn("Gap wheel available", html)


if __name__ == "__main__":
    unittest.main()
