// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 릴리스 번들 진입점 — 서버 기동 + 브라우저 오픈
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// esbuild --banner로 __BUNDLED=true 설정 → server/index.ts 자동 시작 비활성화
// 이 파일에서만 startServer() 명시 호출

import { exec } from 'node:child_process';
import { startServer } from '../server/index.js';

const PORT = Number(process.env.PORT) || 3001;
const URL = `http://localhost:${PORT}`;

startServer();

setTimeout(() => {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? `open "${URL}"`
    : platform === 'win32' ? `start "" "${URL}"`
    : `xdg-open "${URL}"`;
  exec(cmd, (err) => {
    if (err) console.log(`Open ${URL} in your browser`);
  });
}, 1500);
