#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# 릴리스 zip 빌드 스크립트
# 사용법: bash scripts/release/build-release.sh
# 출력: release/ai-three-kingdoms-v1.0.0.zip
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
set -e

VERSION=$(node -e "console.log(require('./package.json').version)")
RELEASE_NAME="ai-three-kingdoms-v${VERSION}"
BUILD_DIR="/tmp/${RELEASE_NAME}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "📦 릴리스 빌드: ${RELEASE_NAME}"

# 1. 클린업
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/server" "$BUILD_DIR/data/results"

# 2. 웹 빌드
echo "🔨 웹 빌드..."
cd "$PROJECT_DIR"
npm run build:web

# 3. 서버 번들
echo "🔨 서버 번들..."
npx esbuild scripts/release-entry.ts \
  --bundle \
  --outfile="$BUILD_DIR/server/index.mjs" \
  --platform=node \
  --format=esm \
  --target=node18 \
  --minify \
  --banner:js="globalThis.__BUNDLED=true;"

# 4. 파일 복사
echo "📋 파일 복사..."
cp -r dist-web "$BUILD_DIR/dist-web"
cp scripts/release/start.sh "$BUILD_DIR/"
cp scripts/release/start.bat "$BUILD_DIR/"
cp scripts/release/start.command "$BUILD_DIR/"
cp .env.example "$BUILD_DIR/"
chmod +x "$BUILD_DIR/start.sh" "$BUILD_DIR/start.command"

# 5. 릴리스용 README
cat > "$BUILD_DIR/README.md" << 'READMEEOF'
# AI 삼국지: 적벽대전 v1.0

AI 책사(제갈량)와 함께하는 턴제 전략 게임.

## 실행 방법

**필요**: Node.js 18+ (https://nodejs.org)

### macOS
`start.command` 더블클릭 또는:
```bash
./start.sh
```

### Windows
`start.bat` 더블클릭 또는:
```cmd
start.bat
```

### Linux
```bash
./start.sh
```

브라우저가 자동으로 열립니다. 열리지 않으면 http://localhost:3001 에 접속하세요.

## AI 설정

첫 실행 시 브라우저에서 설정 마법사가 표시됩니다.

- **Ollama (무료/로컬)**: https://ollama.com 에서 설치 후 `ollama pull qwen3:8b`
- **Cloud API**: Claude, OpenAI, Gemini 지원 (API 키 필요)

또는 `.env.example`을 `.env`로 복사하여 사전 설정할 수 있습니다.

## 4개국어 지원

한국어 / English / 中文 / 日本語

---
https://github.com/JihoonJeong/ai-three-kingdoms
READMEEOF

# 6. zip 생성
echo "📦 zip 생성..."
mkdir -p "$PROJECT_DIR/release"
cd /tmp
zip -r "$PROJECT_DIR/release/${RELEASE_NAME}.zip" "$RELEASE_NAME" -x "*.DS_Store"

echo ""
echo "✅ 완료: release/${RELEASE_NAME}.zip"
echo "   크기: $(du -h "$PROJECT_DIR/release/${RELEASE_NAME}.zip" | cut -f1)"
