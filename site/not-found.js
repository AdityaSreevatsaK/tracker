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

function commandFor404Path(pathname) {
  return "uvx wheelgap " + (packageFrom404Path(pathname) || "NAME") + " -t all --explain";
}

function render404(doc, pathname) {
  const name = packageFrom404Path(pathname);
  doc.getElementById("not-found-command").textContent = commandFor404Path(pathname);
  doc.getElementById("not-found-description").textContent = name
    ? "No page for " + name + ": this package isn't among the top 5,000 in the nightly scan, or its page is unavailable."
    : "This page couldn't be found. You can still check any Python package with wheelgap.";
}

if (typeof document !== "undefined" && typeof location !== "undefined") {
  render404(document, location.pathname);
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { packageFrom404Path, commandFor404Path, render404 };
}
