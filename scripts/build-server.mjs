import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
rmSync(`${root}dist/server`, { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json'], { cwd: root, stdio: 'inherit' });
for (const name of ['apps/server', 'packages/contracts', 'packages/game-core']) {
  const pkg = JSON.parse(readFileSync(`${root}${name}/package.json`, 'utf8'));
  if (pkg.exports) pkg.exports = pkg.exports.replace(/\.ts$/, '.js');
  mkdirSync(`${root}dist/server/${name}`, { recursive: true });
  writeFileSync(`${root}dist/server/${name}/package.json`, JSON.stringify(pkg, null, 2) + '\n');
}
rmSync(`${root}dist/server/apps/server/migrations`, { recursive: true, force: true });
cpSync(`${root}apps/server/migrations`, `${root}dist/server/apps/server/migrations`, { recursive: true });
console.log('Server JavaScript and versioned migrations built.');
