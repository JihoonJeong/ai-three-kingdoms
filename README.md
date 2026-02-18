# AI Three Kingdoms — 적벽대전

> A Human-AI cooperative strategy game.
> Part of [AI Ludens](https://jihoonjeong.github.io/ai-ludens/) Category B.

AI 책사(제갈량)와 함께 적벽대전을 이끄는 턴제 전략 게임입니다. 매 턴 제갈량의 조언을 참고하여 내정, 외교, 군사 행동을 결정하고, 20턴 안에 조조의 대군을 물리쳐야 합니다.

**4개국어 지원**: 한국어 / English / 中文 / 日本語

## Quick Start

```bash
git clone https://github.com/JihoonJeong/ai-three-kingdoms.git
npm install
npm start
```

`npm start`를 실행하면 빌드 → 서버 기동 → 브라우저 자동 오픈이 한 번에 이루어집니다.

**Requirements**: Node.js 18+, AI API key or [Ollama](https://ollama.com/download)

개발 모드: `npm run dev` (Vite HMR + 서버 핫리로드)

## AI Provider Setup

첫 실행 시 브라우저에서 설정 마법사가 자동으로 표시됩니다. AI 제공자를 선택하고 API 키를 입력하면 바로 플레이할 수 있습니다.

또는 `.env` 파일로 사전 설정할 수 있습니다 (`.env.example` 참고).

**Ollama (로컬/무료)**: GPU가 있는 PC에서 무료로 사용 가능합니다. [ollama.com](https://ollama.com/download)에서 설치 후 추천 모델(qwen3:8b)을 다운로드하세요.

## Cost Estimates

| Model | Provider | Cost per Game |
|-------|----------|---------------|
| Ollama (local) | Ollama | Free |
| Gemini 2.5 Flash | Google | ~$0.01 |
| GPT-4o Mini | OpenAI | ~$0.02 |
| Gemini 3 Flash | Google | ~$0.07 |
| Claude Haiku 4.5 | Anthropic | ~$0.12 |
| o4-mini | OpenAI | ~$0.33 |
| Claude Sonnet 4.5 | Anthropic | ~$0.36 |

*Estimates based on ~20-turn game. Actual costs may vary. Ollama runs locally with no API charges.*

## Contributing Game Data

게임 종료 화면에서 **결과 공유** 버튼을 클릭하면 익명화된 게임 데이터가 연구팀에 전송됩니다.

파일로 저장하여 이메일로 전송할 수도 있습니다. 데이터에는 개인정보나 API 키가 포함되지 않습니다.

## Research Background

이 프로젝트는 AI와 인간의 협력적 의사결정을 연구하기 위한 실험 플랫폼입니다. 자세한 내용은 [AI Ludens 블로그](https://jihoonjeong.github.io/ai-ludens/games/three-kingdoms/)를 참고하세요.

## License

MIT
