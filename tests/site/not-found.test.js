// Offline tests for the GitHub Pages 404 page. Run with node --test tests/site/not-found.test.js.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { isPackageName } = require("../../site/logic.js");
const { packageFrom404Path, redirectFor404Path, commandFor404Path, render404 } = require("../../site/not-found.js");
const site = path.join(__dirname, "../../site");

function mockDocument() {
  const elements = new Map();
  return {
    getElementById(id) {
      if (!elements.has(id)) {
        const attrs = {};
        elements.set(id, { textContent: "", attrs, setAttribute: (k, v) => { attrs[k] = v; } });
      }
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

test("a scanned package typed in another spelling goes to its page, not a false 'not scanned'", () => {
  // Pages live only at the PEP 503 name, and Pages paths are case-sensitive.
  assert.equal(redirectFor404Path("/tracker/p/PyYAML/"), "/tracker/p/pyyaml/");
  assert.equal(redirectFor404Path("/tracker/p/importlib_metadata"), "/tracker/p/importlib-metadata/");
  assert.equal(redirectFor404Path("/tracker/p/Zope.Interface/"), "/tracker/p/zope-interface/");
  assert.equal(redirectFor404Path("/tracker/p/some%2Dpackage/"), "/tracker/p/some-package/");
  // Already canonical (a real miss): stay, so the canonical page's own 404 can't loop.
  assert.equal(redirectFor404Path("/tracker/p/pyyaml/"), null);
  assert.equal(redirectFor404Path("/tracker/p/pyyaml"), null);
  assert.equal(redirectFor404Path("/tracker/p/%3Cscript%3E/"), null);
  const replaced = [];
  const doc = mockDocument();
  render404(doc, "/tracker/p/PyYAML/", { replace: (url) => replaced.push(url) });
  assert.deepEqual(replaced, ["/tracker/p/pyyaml/"]);
  assert.equal(doc.getElementById("not-found-description").textContent, "");  // nothing claimed before leaving
});

test("the lookup link carries the name to the home page's own lookup", () => {
  const doc = mockDocument();
  render404(doc, "/tracker/p/some-package/", { replace: () => assert.fail("no redirect for a canonical name") });
  assert.equal(doc.getElementById("not-found-lookup").attrs.href, "/tracker/#package=some-package");
  const plain = mockDocument();
  render404(plain, "/tracker/other/", { replace: () => assert.fail("no redirect") });
  assert.equal(plain.getElementById("not-found-lookup").attrs.href, undefined);
});

test("in the browser, logic.js and not-found.js together render the page", () => {
  // The browser path: no require(), isPackageName from logic.js as a global, render on load.
  const doc = mockDocument();
  const replaced = [];
  const context = vm.createContext({
    document: doc,
    location: { pathname: "/tracker/p/Django/", replace: (url) => replaced.push(url) },
    decodeURIComponent,
  });
  for (const file of ["logic.js", "not-found.js"]) {
    vm.runInContext(fs.readFileSync(path.join(site, file), "utf8"), context);
  }
  assert.deepEqual(replaced, ["/tracker/p/django/"]);
  const miss = mockDocument();
  const context2 = vm.createContext({
    document: miss,
    location: { pathname: "/tracker/p/no-such-package/", replace: () => assert.fail("no redirect") },
    decodeURIComponent,
  });
  for (const file of ["logic.js", "not-found.js"]) {
    vm.runInContext(fs.readFileSync(path.join(site, file), "utf8"), context2);
  }
  assert.equal(miss.getElementById("not-found-command").textContent, "uvx wheelgap no-such-package -t all --explain");
  assert.match(miss.getElementById("not-found-description").textContent, /^No page for no-such-package/);
});
