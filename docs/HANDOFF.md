# AI 삼국지: 적벽대전 — 에셋 핸드오프 문서

**프로젝트:** AI Three Kingdoms Strategy Game (적벽대전 시나리오)
**시점:** 촉한(Shu) 진영 플레이어 시점
**날짜:** 2025-02-17
**스타일:** 수묵화 배경 + 세미리얼리스틱 캐릭터 하이브리드


## 1. 스타일 가이드

### 색상 팔레트
| 세력 | 주색 | 보조색 |
|------|------|--------|
| 촉(Shu) | 녹색 #2d6a4f | 금+동 |
| 위(Wei) | 네이비 #1a237e | 은+검정 |
| 오(Wu) | 홍색 #8b0000 | 금+백 |

### 규칙
- 텍스트 금지 (한자 깃발은 허용)
- 손은 반드시 2개만
- 해부학적 정확성 유지
- 수묵화 배경 + 세미리얼리스틱 인물


## 2. 캐릭터 초상화

**사양:** 512×512px, WebP 80%
**경로:** `assets/characters/{id}/`
**표정:** 캐릭터당 4개 (default + 3 변형)

### 촉한 (8명)

| ID | 이름 | 역할 | 표정 |
|---|---|---|---|
| zhugeliang | 제갈량 | 군사/전략가 | default, pleased, serious, mystical |
| liubei | 유비 | 촉 군주 | default, determined, compassionate, worried |
| guanyu | 관우 | 의장 | default, stern, battle-ready, noble |
| zhangfei | 장비 | 맹장 | default, enraged, laughing, fierce |
| jianyong | 간옹 | 외교관 | default, persuasive, amused, concerned |
| zhaozilong | 조자룡 | 기병장 | default, heroic, calm, charging |
| huangzhong | 황충 | 노장 궁수 | default, determined, battle-cry, proud |
| weiyan | 위연 | 반골 장수 | default, rage, defiant, sinister-smile |

### 조위 (5명)

| ID | 이름 | 역할 | 표정 |
|---|---|---|---|
| caocao | 조조 | 위 군주 | default, scheming, commanding, amused |
| xiahoyuan | 하후연 | 기병장 | default, charging, fierce, confident |
| caoren | 조인 | 수비 장수 | default, commanding, defiant, stoic |
| caimao | 채모 | 수군 도독 | default, scheming, nervous, pleading |
| zhangyun | 장윤 | 부 도독 | default, fearful, obedient, panicked |

### 동오 (2명)

| ID | 이름 | 역할 | 표정 |
|---|---|---|---|
| sunquan | 손권 | 오 군주 | default, resolute, contemplative, angered |
| zhouyu | 주유 | 수군 대도독 | default, confident, angry, thinking |

**참고:** 채모·장윤의 표정은 캐릭터 아크(책략 → 불안 → 공포)를 반영


## 3. 이벤트 일러스트

**사양:** 1920×1080px, WebP 80%
**경로:** `assets/events/`

| 파일 | 장면 | 세션 |
|------|------|------|
| alliance.webp | 촉-오 동맹 결성 | 1 |
| chain-formation.webp | 연환계 (함선 연결) | 1 |
| southeast-wind.webp | 동남풍 기원 | 1 |
| fire-attack.webp | 화공 장면 | 1 |
| retreat.webp | 조조 화용도 퇴각 | 1 |
| victory.webp | 승리 엔딩 (촉-오 승전) | 3 |
| defeat.webp | 패배 엔딩 (촉-오 패배) | 3 |


## 4. 배경

### 전략 맵
**경로:** `assets/map/`

| 파일 | 용도 | 크기 |
|------|------|------|
| strategic-map.webp | 전략맵 배경 | 1920×1080 |

### 전투 배경
**경로:** `assets/battle/`

| 파일 | 용도 | 크기 |
|------|------|------|
| bg-water.webp | 수상전 배경 | 1920×1080 |
| bg-plains.webp | 평야 전투 배경 | 1920×1080 |
| bg-castle.webp | 산지/성벽 전투 배경 | 1920×1080 |


## 5. 이펙트/오버레이

### 전투 이펙트
**경로:** `assets/effects/`

| 파일 | 용도 | 크기 |
|------|------|------|
| fire-overlay.webp | 화공 이펙트 오버레이 | 1920×1080 |

### 계절 오버레이
**경로:** `assets/map/seasons/`
**블렌드 모드:** Multiply, Screen, 또는 Soft Light 권장

| 파일 | 계절 | 톤 | 크기 |
|------|------|-----|------|
| autumn-overlay.webp | 가을 | 앰버 + 은행잎·단풍잎 | 1920×1080 |
| winter-overlay.webp | 겨울 | 청백 + 서리·눈발 | 1920×1080 |
| spring-overlay.webp | 봄 | 금빛 + 벚꽃잎 | 1920×1080 |


## 6. 전술 카드

**사양:** 120×160px, WebP 80%
**경로:** `assets/cards/`

| 파일 | 전술 |
|------|------|
| fire-attack.webp | 화공 |
| arrow-barrage.webp | 화살 일제사격 |
| ambush.webp | 매복 |
| naval-ram.webp | 충파 (돌격) |
| fortify.webp | 수비 강화 |
| spy.webp | 첩보 |
| retreat.webp | 퇴각 |


## 7. UI 요소

### 세력 문장
**사양:** 256×256px, WebP 80% (Gemini 이미지 생성)
**경로:** `assets/ui/emblems/`

| 파일 | 세력 | 모티프 |
|------|------|--------|
| liu.webp | 촉한 | 녹색 용 + 금 구름문양 테두리 |
| cao.webp | 조위 | 네이비 호랑이 + 은 테두리 |
| sun.webp | 동오 | 홍색 봉황 + 금 장식 테두리 |

### 등급 뱃지
**사양:** 128×128px
**경로:** `assets/ui/grades/`
**구현 권장: 코드(CSS/Canvas)로 동적 생성**

현재 파일은 ImageMagick 플레이스홀더입니다. 실제 게임에서는 아래 사양으로 프로그래밍 처리를 권장합니다:

| 등급 | 배경색 | 테두리 |
|------|--------|--------|
| S | #FFD700 (금) | #FF6B00 |
| A | #C0392B (적) | #922B21 |
| B | #2980B9 (청) | #1A5276 |
| C | #27AE60 (녹) | #1E8449 |
| D | #7F8C8D (회) | #566573 |

코드 생성 시 장점: 크기 조절, 애니메이션(등급 상승 연출), 글로우/쉐이더 효과 적용 용이

### 자원 아이콘
**사양:** 128×128px
**경로:** `assets/ui/icons/`
**구현 권장: 코드(CSS/Canvas/SVG)로 동적 생성**

현재 파일은 ImageMagick 플레이스홀더입니다. 실제 게임에서는 아래 사양으로 프로그래밍 처리를 권장합니다:

| 파일 | 자원 | 모양 | 색상 |
|------|------|------|------|
| gold.webp | 금 | 동전 (¥) | #FFD700 / #B8860B |
| food.webp | 군량 | 밀 이삭 | #DAA520 / #8B4513 |
| troops.webp | 병력 | 검 | #C0C0C0 / #808080 |
| morale.webp | 사기 | 불꽃 | #FF4500 / #FFD700 |

SVG로 구현하면 해상도 독립적이고, 상태에 따라 색상·크기 변경이 자유로움


## 8. 파일 포맷 규격 요약

| 에셋 유형 | 크기 | 포맷 |
|-----------|------|------|
| 캐릭터 초상화 | 512×512 | WebP 80% |
| 이벤트 일러스트 | 1920×1080 | WebP 80% |
| 배경 | 1920×1080 | WebP 80% |
| 계절 오버레이 | 1920×1080 | WebP 80% |
| 이펙트 오버레이 | 1920×1080 | WebP 80% |
| 전술 카드 | 120×160 | WebP 80% |
| 세력 문장 | 256×256 | WebP 80% |
| 등급 뱃지 | 128×128 | WebP (→코드 전환 권장) |
| 자원 아이콘 | 128×128 | WebP (→코드 전환 권장) |


## 9. 에셋 수량 총계

| 카테고리 | 수량 |
|----------|------|
| 캐릭터 초상화 | 15명 × 4표정 = **60장** |
| 이벤트 일러스트 | **7장** |
| 배경 (전략맵+전투) | **4장** |
| 이펙트/오버레이 | **4장** (화공 1 + 계절 3) |
| 전술 카드 | **7장** |
| 세력 문장 | **3장** |
| 등급 뱃지 | **5장** (→코드 전환) |
| 자원 아이콘 | **4장** (→코드 전환) |
| **합계** | **94개 파일** |


## 10. 디렉토리 구조

```
assets/
├── characters/
│   ├── zhugeliang/    (default, pleased, serious, mystical)
│   ├── liubei/        (default, determined, compassionate, worried)
│   ├── guanyu/        (default, stern, battle-ready, noble)
│   ├── zhangfei/      (default, enraged, laughing, fierce)
│   ├── jianyong/      (default, persuasive, amused, concerned)
│   ├── zhaozilong/    (default, heroic, calm, charging)
│   ├── huangzhong/    (default, determined, battle-cry, proud)
│   ├── weiyan/        (default, rage, defiant, sinister-smile)
│   ├── caocao/        (default, scheming, commanding, amused)
│   ├── xiahoyuan/     (default, charging, fierce, confident)
│   ├── caoren/        (default, commanding, defiant, stoic)
│   ├── caimao/        (default, scheming, nervous, pleading)
│   ├── zhangyun/      (default, fearful, obedient, panicked)
│   ├── sunquan/       (default, resolute, contemplative, angered)
│   └── zhouyu/        (default, confident, angry, thinking)
├── events/
│   ├── alliance.webp
│   ├── chain-formation.webp
│   ├── southeast-wind.webp
│   ├── fire-attack.webp
│   ├── retreat.webp
│   ├── victory.webp
│   └── defeat.webp
├── map/
│   ├── strategic-map.webp
│   └── seasons/
│       ├── autumn-overlay.webp
│       ├── winter-overlay.webp
│       └── spring-overlay.webp
├── battle/
│   ├── bg-water.webp
│   ├── bg-plains.webp
│   └── bg-castle.webp
├── effects/
│   └── fire-overlay.webp
├── cards/
│   ├── fire-attack.webp
│   ├── arrow-barrage.webp
│   ├── ambush.webp
│   ├── naval-ram.webp
│   ├── fortify.webp
│   ├── spy.webp
│   └── retreat.webp
└── ui/
    ├── emblems/
    │   ├── liu.webp
    │   ├── cao.webp
    │   └── sun.webp
    ├── grades/          ← 플레이스홀더, 코드 전환 권장
    │   ├── S.webp
    │   ├── A.webp
    │   ├── B.webp
    │   ├── C.webp
    │   └── D.webp
    └── icons/           ← 플레이스홀더, 코드 전환 권장
        ├── gold.webp
        ├── food.webp
        ├── troops.webp
        └── morale.webp
```


## 11. i2i 프롬프트 생성 가이드

캐릭터 추가 표정 생성 시, base 이미지를 참조하므로 변경사항만 기술합니다:

**패턴:**
```
[base image reference] — Change expression to [표정].
[구체적 변경사항: 눈, 입, 근육, 조명, 배경].
Keep all other elements identical: armor, weapon, pose, style.
```

**예시 (주유 angry):**
```
Change expression to jealous rage ("既生瑜何生亮").
Brows furrowed deeply, teeth clenched, grip tightening on fan.
Dark storm clouds behind, dramatic red lighting from below.
Keep all other elements identical.
```
