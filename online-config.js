const fs = require('node:fs'), path = require('node:path');
const configFile = path.join(__dirname, 'tools', 'online-session.json');
function normalizePublicUrl(value) {
  if (!value) return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash && url.pathname === '/' ? url.origin : null; } catch { return null; }
}
function publishedUrl(explicit, port) {
  if (explicit) return normalizePublicUrl(explicit);
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    if (config.port !== port || !Number.isInteger(config.pid) || config.pid <= 0) return null;
    process.kill(config.pid, 0);
    return normalizePublicUrl(config.publicUrl);
  } catch { return null; }
}
module.exports = { normalizePublicUrl, publishedUrl, configFile };
