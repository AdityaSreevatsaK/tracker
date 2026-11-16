"use strict";
// The browser loads logic.js first; Node tests use that same name validator via require().
const valid404Name = typeof module !== "undefined" && module.exports
  ? require("./logic.js").isPackageName
  : isPackageName;

function packageFrom404Path(pathname) {
  if (typeof pathname !== "string") return null;
  const match = /^\/tracker\/p\/([^/]+)\/?$/.exec(pathname);
  if (!match) return null;
  let name;
  try {
    name = decodeURIComponent(match[1]);
  } catch {
    return null; // Malformed percent encoding is not a package name.
  }
  return name.length <= 200 && valid404Name(name) ? name : null;
}

// Package pages live only at the PEP 503 name (lowercase, runs of -_. as one -), and Pages paths are
// case-sensitive: /tracker/p/PyYAML/ 404s though pyyaml is scanned. Its only characters are [a-z0-9-], so the
// canonical path maps to itself and redirecting to it can't loop.
function canonical404Name(name) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function redirectFor404Path(pathname) {
  const name = packageFrom404Path(pathname);
  if (!name) return null;
  const canonical = canonical404Name(name);
  const segment = /^\/tracker\/p\/([^/]+)\/?$/.exec(pathname)[1];
  return segment === canonical ? null : "/tracker/p/" + canonical + "/";
}

function commandFor404Path(pathname) {
  return "uvx wheelgap " + (packageFrom404Path(pathname) || "NAME") + " -t all --explain";
}

// The site lives under /tracker/ on wheelgap.github.io; moving it (a custom domain, the root) means updating the
// paths here and in 404.html.
function render404(doc, pathname, loc) {
  const target = redirectFor404Path(pathname);
  if (target && loc) {
    loc.replace(target); // the scanned page, if there is one; a real miss lands back here with the canonical name
    return;
  }
  const name = packageFrom404Path(pathname);
  const lookup = doc.getElementById("not-found-lookup");
  if (lookup && name) lookup.setAttribute("href", "/tracker/#package=" + encodeURIComponent(name));
  doc.getElementById("not-found-command").textContent = commandFor404Path(pathname);
  doc.getElementById("not-found-description").textContent = name
    ? "No page for " + name + ": this package isn't among the top 5,000 in the nightly scan, or its page is unavailable."
    : "This page couldn't be found. You can still check any Python package with wheelgap.";
}

if (typeof document !== "undefined" && typeof location !== "undefined") {
  render404(document, location.pathname, location);
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { packageFrom404Path, redirectFor404Path, commandFor404Path, render404 };
}
