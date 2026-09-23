const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '..', 'frontend', 'dist', 'assets');
const bundles = fs
  .readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => fs.readFileSync(path.join(assetsDir, name), 'utf8'))
  .join('\n');

assert.match(bundles, /\/api\/subscribe/);
assert.match(bundles, /\/api\/subscriptions/);
assert.doesNotMatch(bundles, /https?:\/\/127\.0\.0\.1:5050/);
assert.doesNotMatch(bundles, /https?:\/\/localhost:5050/);

console.log('Production bundle uses same-origin /api endpoints and contains no localhost API URL.');
