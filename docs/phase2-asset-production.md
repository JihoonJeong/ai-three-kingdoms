# Phase 2: 에셋 제작 계획

> Faction AI 시스템 변경 후 에셋 영향도 분석 + 미제작 에셋 목록

---

## 1. Faction AI 변경으로 인한 에셋 영향

### 결론: 에셋 변동 없음

Faction AI 시스템(`faction-ai.ts`)은 **게임 로직만 교체**했으며, 시각적 리소스에 영향을 주지 않습니다.

| 항목 | 변경 여부 | 근거 |
|------|-----------|------|
| 시나리오 이벤트 8개 | 변동 없음 | `red-cliffs.ts` EVENTS 배열 동일 |
| 컷신 데이터 11개 | 변동 없음 | `event-cutscene.ts` 이미지키/캐릭터 동일 |
| 서버 엔드포인트 8개 | 변동 없음 | `/api/chat`, `/api/config/*`, `/api/health` |
| 전투 시스템 | 변동 없음 | BattleEngine, 전술 카드 체계 그대로 |
| 맵/도시 구조 | 변동 없음 | 5 도시 + 2 전장 + 동일 좌표 |

**AI 세력 행동은 텍스트 메시지(`result.changes`)로만 전달**되며, 새로운 컷신이나 일러스트를 요구하지 않습니다.

---

## 2. 현재 보유 에셋 (19개 파일)

| 카테고리 | 파일 | 상태 |
|----------|------|------|
| **캐릭터: 제갈량** | `zhugeliang/default.webp` | ✅ |
| | `zhugeliang/thinking.webp` | ✅ |
| | `zhugeliang/smile.webp` | ✅ |
| | `zhugeliang/warning.webp` | ✅ |
| **캐릭터: 유비** | `liubei/default.webp` | ✅ |
| | `liubei/determined.webp` | ✅ |
| | `liubei/smile.webp` | ✅ |
| | `liubei/worried.webp` | ✅ |
| **전략 맵** | `map/background.webp` | ✅ |
| **전투 배경** | `battle/bg-water.webp` | ✅ |
| **전투 이펙트** | `battle/fx-fire.webp` | ✅ |
| **이벤트 일러스트** | `events/opening.webp` | ✅ |
| **전술 카드 7종** | `ui/tactic-cards/*.webp` (7장) | ✅ |

---

## 3. 미제작 에셋 전체 목록

### A. 캐릭터 초상화 — 52장 (13명 × 4표정)

컷신에서 실제 참조하는 캐릭터를 **굵게** 표시합니다.

| 캐릭터 | 필요 표정 | 컷신 사용 | 우선순위 |
|--------|-----------|-----------|----------|
| **관우** | default, angry, majestic, smile | `cao_cao_retreat`에서 majestic 사용 | P1 |
| **간옹** | default, smile, worried, thinking | `lusu_visit`에서 smile 사용 | P1 |
| 장비 | default, angry, roar, laugh | — | P2 |
| 조자룡 | default, determined, smile, combat | — | P2 |
| **조조** | default, sneer, angry, arrogant | 게임 핵심 적대 세력 | P2 |
| **손권** | default, decisive, contemplating, majestic | 외교/동맹 핵심 | P2 |
| **주유** | default, confident, angry, strategic | 적벽 핵심 인물 | P2 |
| 황충 | default, determined, angry, tired | — | P3 |
| 위연 | default, ambitious, angry, displeased | — | P3 |
| 하후연 | default, charge, angry, alert | — | P3 |
| 조인 | default, defend, determined, alert | — | P3 |
| 채모 | default, nervous, scheming, fearful | — | P3 |
| 장윤 | default, nervous, determined, fearful | — | P3 |

### B. 이벤트 일러스트 — 7장

| 이벤트 | 파일명 | 참조하는 컷신 | 우선순위 |
|--------|--------|--------------|----------|
| 동맹 체결 | `events/alliance.webp` | `lusu_visit` | P1 |
| 연환진 | `events/chain-formation.webp` | `chain_formation` (2 스텝) | P1 |
| 동남풍 | `events/southeast-wind.webp` | `southeast_wind` (2 스텝) | P1 |
| 적벽 화공 | `events/fire-attack.webp` | `chibi_fire`, `jingzhou_surrender` | P1 |
| 조조 퇴각 | `events/retreat.webp` | `cao_cao_retreat` | P2 |
| 승리 엔딩 | `events/victory.webp` | `victory_ending` | P2 |
| 패배 엔딩 | `events/defeat.webp` | `defeat_ending` | P2 |

> 현재 `opening.webp` 1장만 보유. 컷신에서 이미지키가 없으면 `opening` 이미지로 폴백합니다.

### C. 전투 배경 — 2장

| 배경 | 파일명 | 용도 | 우선순위 |
|------|--------|------|----------|
| 평야전 | `battle/bg-plains.webp` | 육상 전투 배경 | P2 |
| 성곽전 | `battle/bg-castle.webp` | 공성전 배경 | P3 |

> `bg-water.webp` (수상전) 보유 중. 적벽 시나리오 핵심 전투는 수상전이므로 P1 불필요.

### D. 전투 이펙트 — 2장

| 이펙트 | 파일명 | 용도 | 우선순위 |
|--------|--------|------|----------|
| 동남풍 | `battle/fx-wind.webp` | 풍향 전술 오버레이 | P2 |
| 연환진 | `battle/formation-chain.webp` | 연환진 시각화 | P3 |

> `fx-fire.webp` (화공 이펙트) 보유 중.

### E. 전략 맵 — 7장

| 에셋 | 파일명 | 우선순위 |
|------|--------|----------|
| 도시 마커 (유비) | `map/city-marker-liu.svg` | P2 |
| 도시 마커 (조조) | `map/city-marker-cao.svg` | P2 |
| 도시 마커 (손권) | `map/city-marker-sun.svg` | P2 |
| 전투 마커 | `map/battle-marker.svg` | P2 |
| 계절: 가을 | `map/seasons/autumn.webp` | P3 |
| 계절: 겨울 | `map/seasons/winter.webp` | P3 |
| 계절: 봄 | `map/seasons/spring.webp` | P3 |

### F. UI 에셋 — 15장

| 에셋 | 파일명 | 우선순위 |
|------|--------|----------|
| 메인 프레임 | `ui/frame-main.svg` | P2 |
| 대화 프레임 | `ui/frame-dialog.svg` | P2 |
| 아이콘: 병력 | `ui/icons/troops.webp` | P2 |
| 아이콘: 군량 | `ui/icons/food.webp` | P2 |
| 아이콘: 민심 | `ui/icons/morale.webp` | P2 |
| 아이콘: 훈련도 | `ui/icons/training.webp` | P2 |
| 문양: 유비 | `ui/emblems/liu.webp` | P2 |
| 문양: 조조 | `ui/emblems/cao.webp` | P2 |
| 문양: 손권 | `ui/emblems/sun.webp` | P2 |
| 등급 S | `ui/grades/s.webp` | P3 |
| 등급 A | `ui/grades/a.webp` | P3 |
| 등급 B | `ui/grades/b.webp` | P3 |
| 등급 C | `ui/grades/c.webp` | P3 |
| 등급 D | `ui/grades/d.webp` | P3 |
| 등급 F | `ui/grades/f.webp` | P3 |

### G. 영상 클립 (Veo) — 4개

| 영상 | 파일명 | 우선순위 |
|------|--------|----------|
| 화공 루프 | `battle/fx-fire-loop.mp4` | P3 |
| 동남풍 루프 | `battle/fx-wind-loop.mp4` | P3 |
| 승리 연출 | `battle/victory-cinematic.mp4` | P3 |
| 패배 연출 | `battle/defeat-cinematic.mp4` | P3 |

---

## 4. 우선순위별 요약

### P1 — 컷신 정상 동작에 필수 (10장)

현재 컷신에서 존재하지 않는 이미지키/캐릭터를 참조하고 있어 폴백 처리됩니다.

| # | 에셋 | 이유 |
|---|------|------|
| 1 | `characters/guanyu/majestic.webp` | `cao_cao_retreat` 컷신 |
| 2 | `characters/guanyu/default.webp` | 관우 기본 (위 표정의 전제) |
| 3 | `characters/jianyong/smile.webp` | `lusu_visit` 컷신 |
| 4 | `characters/jianyong/default.webp` | 간옹 기본 |
| 5 | `events/alliance.webp` | `lusu_visit` 컷신 배경 |
| 6 | `events/chain-formation.webp` | `chain_formation` 컷신 배경 |
| 7 | `events/southeast-wind.webp` | `southeast_wind` 컷신 배경 |
| 8 | `events/fire-attack.webp` | `chibi_fire` + `jingzhou_surrender` 컷신 |
| 9 | `characters/guanyu/angry.webp` | 관우 세트 (4종 일괄 생성 효율) |
| 10 | `characters/guanyu/smile.webp` | 관우 세트 |

### P2 — 게임 완성도 핵심 (47장)

| 카테고리 | 수량 |
|----------|------|
| 캐릭터 초상화 (장비, 조자룡, 조조, 손권, 주유) | 20장 |
| 이벤트 일러스트 (퇴각, 승리, 패배 엔딩) | 3장 |
| 전투 배경 (평야) + 이펙트 (동남풍) | 2장 |
| 맵 마커 SVG 4종 | 4장 |
| UI 프레임 2종 + 아이콘 4종 + 문양 3종 | 9장 |
| 간옹 나머지 표정 (worried, thinking) | 2장 |
| **소계** | **40장** |

### P3 — 완성도 향상 (39장 + 영상 4개)

| 카테고리 | 수량 |
|----------|------|
| 캐릭터 (황충, 위연, 하후연, 조인, 채모, 장윤) | 24장 |
| 전투 배경 (성곽) + 이펙트 (연환진) | 2장 |
| 계절 오버레이 3종 | 3장 |
| 등급 배지 6종 | 6장 |
| 영상 클립 4종 | 4개 |
| **소계** | **35장 + 4영상** |

---

## 5. 총계

| 구분 | 보유 | 미제작 | 합계 |
|------|------|--------|------|
| 캐릭터 초상화 | 8장 | 52장 | 60장 |
| 이벤트 일러스트 | 1장 | 7장 | 8장 |
| 전투 에셋 | 2장 | 4장 | 6장 |
| 전략 맵 | 1장 | 7장 | 8장 |
| UI 에셋 | 7장 | 15장 | 22장 |
| 영상 클립 | 0 | 4개 | 4개 |
| **합계** | **19장** | **89장 + 4영상** | **108장 + 4영상** |

---

## 6. 제작 순서 권장

```
Phase 2-A (P1 필수):  관우 4종 + 간옹 4종 + 이벤트 일러스트 4장 = 12장
Phase 2-B (P2 핵심):  주요 장수 20장 + 엔딩 3장 + 전투/맵/UI = 40장
Phase 2-C (P3 마감):  나머지 장수 24장 + 시즌/등급/영상 = 35장 + 4영상
```

> **참고**: 프롬프트 시트(`docs/asset-prompt-sheet.md`)의 스타일 프리픽스와 개별 프롬프트는 변경 없이 그대로 사용 가능합니다. Faction AI 시스템 변경으로 인한 새로운 에셋 요구사항은 없습니다.
