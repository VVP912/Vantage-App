// Minimal webpack loader: returns an empty module body for any file
// it's applied to. Used in next.config.js to skip yahoo-finance2's
// internal tests/ directory, which contains Deno-runtime fixtures
// that reference dependencies not available in a Node/Vercel build
// (and are never executed at runtime anyway). Zero npm dependencies,
// so it adds no install risk on top of everything else tonight.
module.exports = function emptyLoader() {
  return 'module.exports = {};'
}
