// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// npm start — 빌드 + 서버 + 브라우저 오픈
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = resolve(fileURLToPath(import.meta.url), '..');
const ROOT = resolve(__dirname, '..');
const DIST_WEB = resolve(ROOT, 'dist-web');
const PORT = Number(process.env.PORT) || 3001;
const URL = `http://localhost:${PORT}`;

// 1. 빌드 확인
if (!existsSync(resolve(DIST_WEB, 'index.html'))) {
  console.log('🔨 웹 빌드 중...');
  execSync('npm run build:web', { cwd: ROOT, stdio: 'inherit' });
} else {
  console.log('✅ 빌드 캐시 사용 (dist-web/)');
}

// 2. 서버 기동
const { startServer } = await import('../server/index.js');
startServer();

// 3. 브라우저 오픈 (1초 대기)
setTimeout(() => {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${URL}"`
    : platform === 'win32' ? `start "${URL}"`
    : `xdg-open "${URL}"`;

  exec(cmd, (err) => {
    if (err) console.log(`💡 브라우저에서 ${URL} 을 열어주세요`);
  });
}, 1000);
