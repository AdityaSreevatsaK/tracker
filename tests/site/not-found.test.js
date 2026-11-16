// Offline tests for the GitHub Pages 404 page. Run with node --test tests/site/not-found.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { isPackageName } = require("../../site/logic.js");
const { packageFrom404Path, commandFor404Path, render404 } = require("../../site/not-found.js");
const site = path.join(__dirname, "../../site");

function mockDocument() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, { textContent: "" });
      return elements.get(id);
    },
  };
}

test("valid package names produce the command with no shell metacharacters", () => {
  for (const name of ["numpy", "some-package", "PyYAML", "importlib_metadata", "a.b"]) {
    assert.equal(isPackageName(name), true);
    assert.equal(packageFrom404Path("/tracker/p/" + name + "/"), name);
    assert.equal(commandFor404Path("/tracker/p/" + name + "/"), "uvx wheelgap " + name + " -t all --explain");
  }
  assert.equal(commandFor404Path("/tracker/p/some-package"), "uvx wheelgap some-package -t all --explain");
  assert.equal(commandFor404Path("/tracker/p/some%2Dpackage/"), "uvx wheelgap some-package -t all --explain");
});

test("invalid or odd paths use the NAME placeholder", () => {
  for (const pathname of [
    "/tracker/p/../", "/tracker/p/%2e%2e/", "/tracker/p/foo%2Fbar/",
    "/tracker/p/has%20spaces/", "/tracker/p/<script>/", "/tracker/p/%3Cscript%3E/",
    "/tracker/p/a%3Bb/", "/tracker/p/evil%0Apackage/", "/tracker/p/%ZZ/",
    "/tracker/p/--flag/", "/tracker/p/a/extra/", "/tracker/other/",
    "/tracker/p/" + "A".repeat(201) + "/", "not-a-path", null,
  ]) {
    assert.equal(packageFrom404Path(pathname), null, String(pathname));
    assert.equal(commandFor404Path(pathname), "uvx wheelgap NAME -t all --explain", String(pathname));
  }
});

test("rendering inserts URL-derived values as text only", () => {
  const doc = mockDocument();
  render404(doc, "/tracker/p/valid-name/");
  assert.equal(doc.getElementById("not-found-command").textContent, "uvx wheelgap valid-name -t all --explain");
  assert.match(doc.getElementById("not-found-description").textContent, /top 5,000/);
  render404(doc, "/tracker/p/%3Cscript%3E/");
  assert.equal(doc.getElementById("not-found-command").textContent, "uvx wheelgap NAME -t all --explain");
  assert.doesNotMatch(doc.getElementById("not-found-description").textContent, /<script>/);
});

test("404 page has strict CSP, absolute asset paths and working navigation links", () => {
  const html = fs.readFileSync(path.join(site, "404.html"), "utf8");
  assert.match(html, /<meta http-equiv="Content-Security-Policy"/);
  assert.match(html, /script-src 'self'/);
  assert.doesNotMatch(html, /<script(?:\s|>)(?![^>]*\bsrc=)[^>]*>/);
  for (const url of [
    "/tracker/style.css", "/tracker/not-found.css", "/tracker/logic.js", "/tracker/not-found.js",
    "/tracker/#omni-checker", "/tracker/check/",
  ]) assert.ok(html.includes('"' + url + '"'), url);
  assert.ok(html.indexOf("/tracker/logic.js") < html.indexOf("/tracker/not-found.js"));
});

test("404 classic scripts compile together without global lexical collisions", () => {
  const logic = fs.readFileSync(path.join(site, "logic.js"), "utf8");
  const notFound = fs.readFileSync(path.join(site, "not-found.js"), "utf8");
  assert.doesNotThrow(() => new vm.Script(logic + "\n;\n" + notFound));
});
