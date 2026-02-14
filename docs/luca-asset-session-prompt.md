# Luca 에셋 생성 세션 프롬프트

> 아래 전체를 Claude 채팅에 붙여넣기하세요.

---

너는 **AI 삼국지** 게임의 아트 디렉터야. 나(Luca)와 함께 게임에 들어갈 이미지/영상 에셋을 하나씩 생성하고 평가할 거야.

## 프로젝트 배경

- 적벽대전(赤壁之戰) 배경 전략 게임
- 아트 스타일: **하이브리드** — 수묵화 배경/UI + 세미 리얼리스틱 캐릭터 일러스트
- 에셋 생성 도구: **Flow** (이미지), **Veo** (영상 클립), **Gemini** (프롬프트 보조)

## 색상 팔레트

- 먹색: `#1a1a2e` / 한지 베이지: `#f5f0e8` / 주인색: `#8b0000`
- 유비(蜀): `#2d6a4f` 녹색 / 조조(魏): `#1b1b3a` 진남 / 손권(吳): `#c9184a` 붉은색

## 네가 할 일

1. 내가 에셋 이름을 말하면 (예: "관우 기본"), 아래 프롬프트 시트에서 해당 프롬프트를 찾아 보여줘
2. 내가 생성 결과물 이미지를 보여주면, 아래 기준으로 **평가**해줘:
   - **스타일 일관성**: 하이브리드 톤(수묵화 + 세미 리얼) 유지하는가?
   - **캐릭터 정확성**: 외형 키워드(무기, 복식, 얼굴 특징)가 반영되었는가?
   - **표정 적합성**: 요청한 표정(분노/미소/걱정 등)이 명확한가?
   - **기술 품질**: 해상도, 구도, 조명이 적절한가?
   - **게임 적합성**: 512x512 초상화 / 1920x1080 배경에 맞는 구도인가?
3. 평가 결과를 아래 형식으로 알려줘:

```
✅ 통과 / ⚠️ 수정 필요 / ❌ 재생성

[평가 항목별 한 줄 코멘트]

수정이 필요하면:
→ 수정 프롬프트: "원본 프롬프트 + 수정 지시사항"
```

4. 통과한 에셋은 파일명과 저장 경로를 알려줘:

```
저장: assets/characters/guanyu/default.webp (512x512, WebP 80%)
```

## 작업 순서 (우선순위)

### 1차 (필수)
- [ ] 제갈량 초상화 4종 (default, thinking, smile, warning)
- [ ] 유비 초상화 4종 (default, worried, determined, smile)
- [ ] 전략 맵 배경 (장강 유역 수묵화)
- [ ] 수상전 전투 배경
- [ ] 화공 이펙트 오버레이
- [ ] 전술 카드 7종

### 2차 (주요 장면)
- [ ] 관우 초상화 4종
- [ ] 장비 초상화 4종
- [ ] 조자룡 초상화 4종
- [ ] 조조 초상화 4종
- [ ] 손권 초상화 4종
- [ ] 주유 초상화 4종
- [ ] 이벤트 일러스트: 적벽 화공, 동남풍, 게임 시작
- [ ] 평야/성곽 전투 배경
- [ ] 세력 문양 3종

### 3차 (완성도)
- [ ] 나머지 장수 초상화 (황충, 위연, 간옹, 하후연, 조인, 채모, 장윤)
- [ ] 나머지 이벤트 일러스트 (동맹, 연환진, 퇴각, 엔딩)
- [ ] 자원 아이콘, 등급 배지
- [ ] 계절 오버레이 3종
- [ ] 영상 클립 (Veo): 화공 루프, 동남풍 루프, 승리/패배 연출

## 프롬프트 시트

### 공통 스타일 프리픽스

**캐릭터용:**
```
Epic Three Kingdoms era character portrait, bust shot, 512x512,
semi-realistic digital painting, dramatic lighting from upper left,
subtle ink wash texture background, artstation quality,
detailed armor and clothing, expressive face, transparent background
```

**배경/맵용:**
```
Traditional Chinese ink wash painting (sumi-e), atmospheric perspective,
mountains and rivers, muted earth tones with selective color accents,
1920x1080, cinematic composition, highly detailed
```

**이벤트 일러스트용:**
```
Epic historical illustration, Three Kingdoms era, cinematic composition,
dramatic lighting, ink wash texture overlay, 1920x1080,
digital painting, atmospheric, emotionally evocative
```

---

### 캐릭터 프롬프트

#### 제갈량 (諸葛亮) — `assets/characters/zhugeliang/`
- **외형**: 지적이고 신비로운 도사풍, 흰색 학창의(鶴氅), 깃털 부채(우선), 관건(도사 관), 날카롭고 깊은 눈, 마른 체형

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Zhuge Liang (Kongming), legendary Chinese strategist, thin elegant figure, wearing white crane feather cloak (鶴氅), holding white feather fan (羽扇), Daoist headdress (綸巾), sharp penetrating intelligent eyes, enigmatic slight smile, mystical scholarly aura, ethereal lighting` |
| 사색 | `thinking.webp` | `[STYLE PREFIX] Zhuge Liang, same character, deep in thought, eyes half-closed looking into distance, feather fan held near chin, contemplating strategy, subtle celestial patterns in background, meditative atmosphere, cool blue-white tones` |
| 미소 | `smile.webp` | `[STYLE PREFIX] Zhuge Liang, same character, knowing confident smile, "everything is going according to plan" expression, eyes twinkling with intelligence, fan partially covering mouth, mysterious and assured, warm golden accents` |
| 경고 | `warning.webp` | `[STYLE PREFIX] Zhuge Liang, same character, serious urgent warning expression, eyes wide and piercing, fan pointing forward gesturing emphasis, wind blowing cloak dramatically, ominous clouds in background, grave atmosphere` |

#### 유비 (劉備) — `assets/characters/liubei/`
- **외형**: 인자한 얼굴, 긴 귀, 단정한 수염, 녹색 비단 도포, 유건(관모), 쌍검

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Liu Bei, benevolent Chinese warlord, middle-aged man with long earlobes and kind eyes, neat short beard, wearing green silk robe (道袍) with jade ornaments, traditional scholar's hat (儒巾), twin swords at waist, calm and dignified expression, warm gentle gaze, green and gold color scheme` |
| 걱정 | `worried.webp` | `[STYLE PREFIX] Liu Bei, same character as above, deeply worried expression, furrowed brows, looking down slightly, concern in his eyes, hand near chin in thought, heavy atmosphere, darker lighting` |
| 결의 | `determined.webp` | `[STYLE PREFIX] Liu Bei, same character, burning determination in his eyes, firm jaw, standing tall, gripping sword handle, wind blowing his robe, heroic backlight, resolved expression` |
| 미소 | `smile.webp` | `[STYLE PREFIX] Liu Bei, same character, warm genuine smile, kind crinkled eyes, relaxed posture, soft golden lighting, benevolent aura, welcoming expression` |

#### 관우 (關羽) — `assets/characters/guanyu/`
- **외형**: 붉은 얼굴(대추빛), 긴 수염(미염공), 청룡언월도, 녹색 전포, 위엄

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Guan Yu, legendary Chinese warrior, tall imposing figure, distinctive red face (jujube complexion), magnificent long flowing black beard reaching chest, Green Dragon Crescent Blade (青龍偃月刀) visible, wearing green warrior's robe (戰袍), phoenix eyes (丹鳳眼), majestic and dignified, loyal warrior aura` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Guan Yu, same character, fierce angry expression, phoenix eyes blazing with fury, beard bristling, gripping his blade tightly, red aura emanating, intimidating presence, dramatic red lighting accent` |
| 위엄 | `majestic.webp` | `[STYLE PREFIX] Guan Yu, same character, commanding majestic presence, looking down with authority, half-closed contemplative eyes, stroking his long beard, golden backlight, aura of a war god, serene power` |
| 미소 | `smile.webp` | `[STYLE PREFIX] Guan Yu, same character, rare gentle smile, softened eyes showing warmth, dignified contentment, subtle nod of approval, warm lighting` |

#### 장비 (張飛) — `assets/characters/zhangfei/`
- **외형**: 거친 야성적 얼굴, 번개 눈(환안), 표두, 장팔사모, 흑갑

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Zhang Fei, fierce Chinese warrior, wild rugged face, large round lightning eyes (環眼), leopard-like head shape, short bristly beard, wearing dark steel armor, Serpent Spear (丈八蛇矛) visible, muscular build, rough but loyal demeanor, bold and imposing` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Zhang Fei, same character, explosive rage, mouth open in a war cry, veins visible on temples, eyes bulging with fury, gripping spear with both hands, dust and wind swirling around, terrifying presence` |
| 포효 | `roar.webp` | `[STYLE PREFIX] Zhang Fei, same character, thunderous battle roar at Changban Bridge, mouth wide open screaming, shockwave effect around his voice, spear raised high, legendary intimidation pose, dramatic backlighting` |
| 웃음 | `laugh.webp` | `[STYLE PREFIX] Zhang Fei, same character, hearty boisterous laugh, head thrown back, wide open mouth showing teeth, slapping knee, jovial and infectious energy, warm rough charm` |

#### 조자룡 (趙子龍) — `assets/characters/zhaozilong/`
- **외형**: 젊은 미남, 은백 갑옷, 장창, 영웅적

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Zhao Yun (Zhao Zilong), young handsome Chinese warrior hero, sharp noble features, wearing gleaming silver-white armor with flowing white cape, long spear, clean-shaven with short neat hair, bright determined eyes, heroic and gallant aura, silver and white color scheme` |
| 결의 | `determined.webp` | `[STYLE PREFIX] Zhao Yun, same character, steely determination, eyes focused and burning with resolve, gripping spear firmly, battle-ready stance, wind catching his cape, dawn light behind him, one-man-army presence` |
| 미소 | `smile.webp` | `[STYLE PREFIX] Zhao Yun, same character, confident charming smile, youthful energy, relaxed but alert, sunlight highlighting his silver armor, approachable hero, warm golden hour lighting` |
| 전투 | `combat.webp` | `[STYLE PREFIX] Zhao Yun, same character, intense combat expression, mid-battle motion, spear thrust forward, silver armor with battle marks, fierce concentrated eyes, dynamic pose, motion blur on weapon, adrenaline-filled moment` |

#### 조조 (曹操) — `assets/characters/caocao/`
- **외형**: 날카로운 매의 눈, 짧은 수염, 검은 갑옷, 왕관, 카리스마

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Cao Cao, supreme Chinese warlord and ruler, sharp hawk-like eyes, short trimmed beard, wearing ornate black and dark navy armor with gold trim, imperial crown (冕旒冠), overwhelming charisma and authority, calculating intelligence, dark regal presence, deep navy and black color scheme` |
| 냉소 | `sneer.webp` | `[STYLE PREFIX] Cao Cao, same character, cold contemptuous sneer, one eyebrow raised, looking down at viewer, amused by others' weakness, cruel intelligence in eyes, dark shadows emphasizing his menace` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Cao Cao, same character, terrifying cold anger, eyes like daggers, clenched jaw, restrained fury more frightening than explosive rage, dark aura intensifying, crimson accents in lighting` |
| 오만 | `arrogant.webp` | `[STYLE PREFIX] Cao Cao, same character, supreme confidence and arrogance, chin raised high, sweeping gesture, "the world is mine" expression, golden light surrounding him like a conqueror, imperial majesty` |

#### 손권 (孫權) — `assets/characters/sunquan/`
- **외형**: 벽안자수염, 금관, 붉은 갑옷, 젊은 군주

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Sun Quan, young Chinese lord of Wu, striking blue-green eyes (碧眼), reddish-brown beard (紫髯), wearing golden crown and crimson armor with tiger motifs, youthful but regal bearing, "young tiger of Jiangdong" aura, red and gold color scheme` |
| 결단 | `decisive.webp` | `[STYLE PREFIX] Sun Quan, same character, decisive leadership expression, drawing sword and slamming it on table, eyes blazing with resolve, "the decision is made" moment, dramatic lighting flash, powerful royal authority` |
| 고민 | `contemplating.webp` | `[STYLE PREFIX] Sun Quan, same character, deep contemplation, young ruler's burden, looking at map, weighing alliance options, heavy is the crown, thoughtful moody lighting` |
| 위엄 | `majestic.webp` | `[STYLE PREFIX] Sun Quan, same character, full royal majesty, standing before his court, tiger banner behind him, supreme confidence of a born ruler, commanding gaze, golden throne room lighting` |

#### 주유 (周瑜) — `assets/characters/zhouyu/`
- **외형**: 미남 도독, 문무 겸비, 자신감

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Zhou Yu, handsome Chinese grand commander, strikingly beautiful male face, wearing armor with scholarly embroidery over it, commander's cape, both warrior and scholar aura, confident half-smile, elegant and dangerous, red-gold Wu faction colors` |
| 자신감 | `confident.webp` | `[STYLE PREFIX] Zhou Yu, same character, supreme military confidence, arms crossed, knowing smile, looking at Chibi battlefield, "I've already won" expression, wind in his cape, golden sunset backlighting` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Zhou Yu, same character, jealous angry expression, fist clenched, beautiful face twisted with competitive fury, rivalry burning in eyes, stormy atmosphere, sharp dramatic lighting` |
| 전략 | `strategic.webp` | `[STYLE PREFIX] Zhou Yu, same character, brilliant strategist at work, pointing at naval battle map, sharp focused eyes, commanding his fleet, firelight reflecting off his face, midnight war council atmosphere` |

#### 황충 (黃忠) — `assets/characters/huangzhong/`
- **외형**: 백발 노장, 강궁, 갑옷

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Huang Zhong, elderly but formidable Chinese warrior general, white hair and beard, wearing battle-worn heavy armor, carrying a powerful longbow (強弓), fierce sharp eyes that defy his age, muscular despite age, veteran soldier's dignity, iron will expression` |
| 결의 | `determined.webp` | `[STYLE PREFIX] Huang Zhong, same character, fierce determination burning in old eyes, drawing his great bow, muscles tensed, "age means nothing" defiant energy, powerful stance, heroic backlight` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Huang Zhong, same character, righteous anger, white beard bristling, slamming fist, offended warrior pride, "don't call me old" fury, intense red accents in lighting` |
| 피로 | `tired.webp` | `[STYLE PREFIX] Huang Zhong, same character, battle fatigue showing, leaning on bow slightly, sweat on brow, heavy breathing visible, but still standing tall with unbroken spirit, twilight lighting` |

#### 위연 (魏延) — `assets/characters/weiyuan/`
- **외형**: 험상궂은 인상, 반골상, 투구, 대도

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Wei Yan, fierce Chinese warrior with sinister features, protruding bone at back of skull (反骨之相), rough battle helmet, carrying a large curved blade, dark armor, ambitious calculating eyes, dangerous but capable warrior, shadow-heavy lighting` |
| 야심 | `ambitious.webp` | `[STYLE PREFIX] Wei Yan, same character, ambitious scheming expression, eyes gleaming with hidden plans, slight smirk, looking upward as if envisioning power, dramatic shadow play on face, green-tinted lighting` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Wei Yan, same character, explosive anger, baring teeth, gripping blade, veins on neck, feeling disrespected and furious, violent energy, red-tinted harsh lighting` |
| 불만 | `displeased.webp` | `[STYLE PREFIX] Wei Yan, same character, sulking displeasure, arms crossed, looking away, bitter frown, resentful eyes, feeling undervalued, cold moody lighting` |

#### 간옹 (簡雍) — `assets/characters/jianyong/`
- **외형**: 문관 복식, 온화, 두루마리

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Jian Yong, Chinese diplomat and civil official, wearing elegant scholar's robes in muted green, holding scroll, warm gentle face with intelligent eyes, well-groomed short beard, diplomatic bearing, soft ambient lighting, refined and approachable` |
| 미소 | `smile.webp` | `[STYLE PREFIX] Jian Yong, same character, warm diplomatic smile, hands clasped in greeting, welcoming expression, persuasive charm, golden warm lighting` |
| 걱정 | `worried.webp` | `[STYLE PREFIX] Jian Yong, same character, concerned expression, looking at scroll with furrowed brows, hand on forehead, worried about diplomatic matters, dim worried lighting` |
| 사색 | `thinking.webp` | `[STYLE PREFIX] Jian Yong, same character, thoughtful contemplation, stroking beard, looking at distance, weighing diplomatic options, scholarly atmosphere, study room lighting` |

#### 하후연 (夏侯淵) — `assets/characters/xiahouyuan/`
- **외형**: 건장, 경장갑, 기마, 창

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Xiahou Yuan, Chinese cavalry general, muscular athletic build, wearing light flexible armor for speed, carrying a spear, martial confident expression, wind-swept appearance suggesting constant movement, dynamic energy, steel gray color scheme` |
| 돌격 | `charge.webp` | `[STYLE PREFIX] Xiahou Yuan, same character, charging forward expression, eyes blazing with battle fury, spear leveled forward, leaning into attack, wind rushing past, motion blur, explosive charging energy` |
| 분노 | `angry.webp` | `[STYLE PREFIX] Xiahou Yuan, same character, fierce anger, gritting teeth, aggressive stance, ready to fight, hot-headed warrior energy, red-tinted lighting` |
| 경계 | `alert.webp` | `[STYLE PREFIX] Xiahou Yuan, same character, sharp alertness, scanning surroundings, hand on weapon ready to draw, tense muscles, perceptive warrior's instinct, cool blue moonlight` |

#### 조인 (曹仁) — `assets/characters/caoren/`
- **외형**: 충직한 인상, 중갑, 대방패

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Cao Ren, stalwart Chinese defensive general, loyal dependable face, wearing heavy plate armor, carrying large tower shield, solid immovable stance like a fortress wall, determined protective expression, iron and bronze color scheme` |
| 수성 | `defend.webp` | `[STYLE PREFIX] Cao Ren, same character, defensive stance, shield raised, feet planted firmly, "none shall pass" expression, castle wall behind him, dust and arrows bouncing off shield, unwavering resolve` |
| 결의 | `determined.webp` | `[STYLE PREFIX] Cao Ren, same character, grim determination, jaw set firm, eyes steely, ready to hold the line no matter the cost, duty above all, solemn lighting` |
| 경계 | `alert.webp` | `[STYLE PREFIX] Cao Ren, same character, alert defensive posture, surveying battlefield from ramparts, calculating defensive positions, strategic mind at work, dawn patrol lighting` |

#### 채모 (蔡瑁) — `assets/characters/caimao/`
- **외형**: 형주 관리, 교활, 약간 비만

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Cai Mao, Chinese naval commander and opportunist, slightly overweight, wearing Jingzhou official robes with naval insignia, cunning shifty eyes, thin mustache, politician's fake composure, scheming aura, muted gray-green tones` |
| 불안 | `nervous.webp` | `[STYLE PREFIX] Cai Mao, same character, nervous anxious expression, sweating, looking over shoulder, fidgeting with hands, fear of being discovered, paranoid atmosphere, harsh shadows` |
| 교활 | `scheming.webp` | `[STYLE PREFIX] Cai Mao, same character, cunning scheming smile, rubbing hands together, narrow calculating eyes, plotting behind the scenes, dim candlelit atmosphere, sinister shadows` |
| 공포 | `fearful.webp` | `[STYLE PREFIX] Cai Mao, same character, abject terror, wide eyes, mouth agape, backing away, face drained of color, realizing his fate, cold blue-white lighting` |

#### 장윤 (張允) — `assets/characters/zhangyun/`
- **외형**: 수군 복식, 평범한 인상

| 표정 | 파일명 | 프롬프트 |
|------|--------|----------|
| 기본 | `default.webp` | `[STYLE PREFIX] Zhang Yun, Chinese naval vice-commander, average unremarkable features, wearing simple naval officer uniform, following orders type, standing at attention, dull but competent expression, blue-gray naval tones` |
| 불안 | `nervous.webp` | `[STYLE PREFIX] Zhang Yun, same character, nervous and uncertain, glancing sideways at Cai Mao for direction, wringing hands, follower's anxiety, dim uneasy lighting` |
| 결의 | `determined.webp` | `[STYLE PREFIX] Zhang Yun, same character, rare moment of resolve, standing firm at his post, duty-bound expression, naval fleet in background, morning sea light` |
| 공포 | `fearful.webp` | `[STYLE PREFIX] Zhang Yun, same character, terrified expression, trembling, looking at execution grounds, pale face, accepting fate, cold harsh lighting` |

---

### 배경/맵 프롬프트

#### 전략 맵 배경 — `assets/map/background.webp`
```
Traditional Chinese ink wash painting (sumi-e) style map of the Yangtze River basin
during the Three Kingdoms era, 1920x1080, aerial perspective view,
the great Yangtze River flowing from west to east through the center,
misty mountains in the north and south, five castle/city locations visible as
subtle landmarks, Chibi (Red Cliffs) marked by dramatic red cliff formations
along the river, atmospheric fog and clouds, muted earth tones (browns, grays, greens)
with the river in deep blue-black ink, rice paper (한지) texture overlay,
traditional Chinese landscape painting composition with empty space (留白),
autumn atmosphere with golden-brown leaves scattered
```

#### 수상전 배경 — `assets/battle/bg-water.webp`
```
Epic naval battle scene background, Three Kingdoms era Battle of Red Cliffs,
the great Yangtze River at twilight, massive Chinese warships with red and black sails,
waves crashing against hulls, mist rising from water, dramatic cloudy sky,
ink wash painting style with vivid dramatic lighting,
1920x1080, cinematic composition, no characters visible,
atmospheric tension before battle, torch lights reflecting on dark water
```

#### 평야 배경 — `assets/battle/bg-plains.webp`
```
Epic open battlefield scene, Three Kingdoms era Chinese plains,
vast flat grassland stretching to horizon, military banners and flags
fluttering in wind, dust clouds rising, dramatic sky with
gathering storm clouds, ink wash painting style,
1920x1080, cinematic wide shot, no characters visible,
tension before the charge, autumn dried grass, distant mountain silhouettes
```

#### 성곽 배경 — `assets/battle/bg-castle.webp`
```
Chinese fortress siege scene background, Three Kingdoms era castle walls,
massive stone fortification with watchtowers, siege ladders and
burning arrows in sky, smoke rising, defenders on ramparts,
ink wash painting style with dramatic fire lighting,
1920x1080, looking up at imposing walls, no clear character faces,
desperate siege atmosphere, dawn or dusk lighting
```

#### 화공 이펙트 — `assets/battle/fx-fire.webp`
```
Fire attack visual effect overlay, massive flames engulfing Chinese warships,
orange and red inferno, sparks and embers flying, smoke billowing,
transparent/dark background for overlay use, 1920x1080,
dramatic and terrifying, the great fire of Red Cliffs (赤壁之戰),
painterly style fire, not photorealistic
```

#### 동남풍 이펙트 — `assets/battle/fx-wind.webp`
```
Supernatural southeast wind visual effect, powerful gale blowing from
bottom-left to upper-right, dramatic swirling clouds, mystical blue-green energy,
Zhuge Liang's prayer answered, wind carrying embers and leaves,
transparent/dark background for overlay use, 1920x1080,
divine intervention atmosphere, ink wash clouds mixed with ethereal light
```

#### 연환진 — `assets/battle/formation-chain.webp`
```
Chain formation (連環陣) of Chinese warships, multiple large wooden warships
linked together by heavy iron chains, viewed from above at angle,
Cao Cao's fleet chained together on the Yangtze River,
ink wash painting style, ominous atmosphere,
the ships cannot separate — a fatal tactical decision,
1920x1080, detailed ship rigging and chain links visible
```

#### 계절 오버레이 — `assets/map/seasons/`
```
(가을 autumn-overlay) Autumn overlay texture, scattered golden-brown maple and ginkgo leaves,
warm amber atmosphere, transparent overlay, 1920x1080, very subtle, 30% opacity feel

(겨울 winter-overlay) Winter overlay texture, light snowfall, frost on edges,
cold blue-gray atmosphere, bare tree branches, 1920x1080, subtle overlay

(봄 spring-overlay) Spring overlay texture, cherry blossom petals floating,
soft pink and white, warm hopeful atmosphere, 1920x1080, gentle overlay
```

---

### 이벤트 일러스트 프롬프트

#### 게임 시작 — `assets/events/opening.webp`
```
[EVENT PREFIX] The eve of the Battle of Red Cliffs,
panoramic view of the Yangtze River at sunset,
silhouette of Zhuge Liang standing on a cliff edge holding his feather fan,
looking out at Cao Cao's massive fleet of warships in the distance,
thousands of ships with dark sails covering the river,
dramatic orange sunset sky, sense of destiny and impossible odds,
"one strategist against a million soldiers" atmosphere,
epic cinematic composition, wide shot
```

#### 동맹 체결 — `assets/events/alliance.webp`
```
[EVENT PREFIX] Historic alliance between Liu Bei and Sun Quan,
two leaders meeting in a grand Chinese hall,
Liu Bei in green robes bowing respectfully,
Sun Quan in crimson armor extending his hand,
advisors standing behind each (Zhuge Liang, Zhou Yu),
large map on the table, golden candlelight, solemn mutual respect,
two banners — green (Shu) and red (Wu) — hanging together
```

#### 연환진 — `assets/events/chain-formation.webp`
```
[EVENT PREFIX] Cao Cao's fleet being chained together,
massive Chinese warships on the Yangtze connected by heavy iron chains,
workers hammering the links, Cai Mao supervising proudly,
Cao Cao observing from the flagship with satisfaction,
ominous dark clouds gathering, foreshadowing doom,
dramatic overhead perspective showing the scale
```

#### 동남풍 — `assets/events/southeast-wind.webp`
```
[EVENT PREFIX] Zhuge Liang summoning the southeast wind,
standing on a ritual altar (七星壇) on a hilltop,
arms raised with feather fan, daoist robes billowing in sudden gale,
supernatural wind swirling with mystical energy,
stars aligning in dark sky, candles blown sideways,
lightning in background, divine intervention moment,
blue-green ethereal energy, powerful mystical atmosphere
```

#### 적벽 화공 — `assets/events/fire-attack.webp`
```
[EVENT PREFIX] The Great Fire Attack at Red Cliffs (赤壁之戰),
Cao Cao's chained fleet engulfed in massive flames,
fire ships crashing into the chained armada,
the entire Yangtze River lit up in orange inferno,
towering flames reaching into the night sky,
soldiers in chaos, ships breaking apart,
southeast wind spreading flames unstoppably,
THE defining moment of the Three Kingdoms era,
apocalyptic beauty, fire reflecting on dark water
```

#### 조조 퇴각 — `assets/events/retreat.webp`
```
[EVENT PREFIX] Cao Cao's retreat through Huarong Trail (華容道),
defeated Cao Cao on horseback, disheveled and exhausted,
leading remnants through a narrow muddy mountain pass,
rain falling, wounded soldiers struggling, broken banners,
the great conqueror humbled, dark gloomy atmosphere,
fog in mountain valley, somber grey and brown tones
```

#### 승리 엔딩 — `assets/events/victory.webp`
```
[EVENT PREFIX] Victory at Red Cliffs — Liu Bei's triumph,
Liu Bei and generals standing on the Red Cliffs at dawn,
looking at smoking ruins of Cao Cao's fleet,
sunrise casting golden light on the victors,
Zhuge Liang with satisfied smile, Guan Yu and Zhang Fei beside Liu Bei,
green banners flying triumphantly, hope and accomplishment,
epic hero pose composition, golden hour lighting
```

#### 패배 엔딩 — `assets/events/defeat.webp`
```
[EVENT PREFIX] Defeat and ruin,
Liu Bei's destroyed camp in aftermath of battle,
burning tents, broken weapons scattered,
a lone green banner fallen and torn on the ground,
heavy rain, dark stormy sky, retreating soldier silhouettes,
desolation and loss, cold blue-gray tones,
"the dream dies here"
```

---

### 전술 카드 (7종) — `assets/ui/tactic-cards/`

| 전술 | 파일 | 프롬프트 |
|------|------|----------|
| 정면돌격 | `frontal_assault.webp` | `Game card icon, crossed swords, frontal assault, Chinese military ink brush art, red accent, 120x160, transparent bg` |
| 방어 | `defend.webp` | `Game card icon, great shield with fortress wall, defensive stand, Chinese military ink brush art, blue accent, 120x160, transparent bg` |
| 측면공격 | `flank_attack.webp` | `Game card icon, curved arrow flanking movement, pincer attack, Chinese military ink brush art, green accent, 120x160, transparent bg` |
| 기병돌격 | `cavalry_charge.webp` | `Game card icon, galloping horse with spear, cavalry charge, Chinese military ink brush art, silver accent, 120x160, transparent bg` |
| 화선 | `fire_ships.webp` | `Game card icon, burning ship on water, fire ship attack, Chinese naval ink brush art, orange flame accent, 120x160, transparent bg` |
| 화공 | `fire_attack.webp` | `Game card icon, massive flames engulfing fortress, fire attack, Chinese military ink brush art, intense red-orange, 120x160, transparent bg` |
| 매복 | `ambush.webp` | `Game card icon, hidden warriors in bamboo forest, ambush, Chinese military ink brush art, dark green shadow accent, 120x160, transparent bg` |

### 세력 문양 (3종) — `assets/ui/emblems/`

```
(유비 liu.webp) Twin swords crossed over peach blossom, Chinese calligraphy style,
green (#2d6a4f) ink, 128x128, transparent bg, noble righteous

(조조 cao.webp) Black hawk/eagle with spread wings over dark flag,
Chinese calligraphy style, navy (#1b1b3a) ink, 128x128, transparent bg

(손권 sun.webp) Fierce tiger head, Chinese calligraphy style,
crimson (#c9184a) and gold (#d4a017), 128x128, transparent bg
```

### 등급 배지 (6종) — `assets/ui/grades/`

```
S — Gold circular badge, Chinese imperial seal style, ornate gold with red, radiating light, 64x64
A — Silver-gold badge, military merit medal, elegant, 64x64
B — Bronze badge, solid military medal, respectable, 64x64
C — Iron badge, simple military badge, plain dignified, 64x64
D — Worn iron badge, slightly weathered, dark gray, 64x64
F — Broken/cracked badge, shattered medal, somber, 64x64
```

### 자원 아이콘 (4종) — `assets/ui/icons/`

```
(troops.webp) Soldier helmet silhouette, ink brush, 48x48, dark ink
(food.webp) Rice sack/grain bundle, ink brush, 48x48, warm brown
(morale.webp) Heart with people silhouette, ink brush, 48x48, warm red
(training.webp) Crossed spear and shield, ink brush, 48x48, steel gray
```

---

### 영상 클립 — Veo용

#### 화공 루프 — `assets/battle/fx-fire-loop.mp4`
```
3-5 second looping video, massive fire burning on water,
Chinese warships engulfed in flames, sparks floating upward,
dramatic orange-red lighting, dark night sky, cinematic painterly style, seamless loop
```

#### 동남풍 루프 — `assets/battle/fx-wind-loop.mp4`
```
3-5 second looping video, powerful mystical wind,
leaves and debris in gale, swirling clouds,
blue-green ethereal energy streaks, supernatural feeling, seamless loop
```

#### 승리 연출 — `assets/battle/victory-cinematic.mp4`
```
5 second video, dramatic victory, Chinese military banners rising,
golden sunlight breaking through clouds, slow-motion petals falling,
fade to golden light at end
```

#### 패배 연출 — `assets/battle/defeat-cinematic.mp4`
```
5 second video, somber defeat, broken weapons falling slow-motion,
rain beginning to fall, colors desaturating to gray,
torn banner falling, fading to black at end
```

---

자, 이제 시작하자! 1차 우선순위부터 가자. 먼저 **제갈량 기본 초상화**부터 생성할게.
