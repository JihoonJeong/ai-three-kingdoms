# AI 삼국지 — 에셋 생성 프롬프트 시트

> 이 문서의 프롬프트를 Flow, Veo, Gemini 등에 복사-붙여넣기하여 에셋을 생성합니다.
> 생성 후 `assets/` 디렉토리의 해당 경로에 저장하세요.

---

## 공통 스타일 프리픽스

모든 캐릭터 프롬프트 앞에 붙이세요:

```
STYLE PREFIX (캐릭터):
"Epic Three Kingdoms era character portrait, bust shot, 512x512,
semi-realistic digital painting, dramatic lighting from upper left,
subtle ink wash texture background, artstation quality,
detailed armor and clothing, expressive face, transparent background"
```

```
STYLE PREFIX (배경/맵):
"Traditional Chinese ink wash painting (sumi-e), atmospheric perspective,
mountains and rivers, muted earth tones with selective color accents,
1920x1080, cinematic composition, highly detailed"
```

```
STYLE PREFIX (이벤트 일러스트):
"Epic historical illustration, Three Kingdoms era, cinematic composition,
dramatic lighting, ink wash texture overlay, 1920x1080,
digital painting, atmospheric, emotionally evocative"
```

---

## A. 캐릭터 초상화 (15명 × 4표정 = 60장)

### A-1. 유비 (劉備) — `assets/characters/liubei/`

**기본 설정**: 중년 남성, 인자하고 자비로운 인상, 긴 귀(복이 있는 관상), 단정한 수염, 녹색 비단 도포, 유건(관모), 쌍검을 허리에 찬 모습

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Liu Bei, benevolent Chinese warlord, middle-aged man with long earlobes and kind eyes, neat short beard, wearing green silk robe (道袍) with jade ornaments, traditional scholar's hat (儒巾), twin swords at waist, calm and dignified expression, warm gentle gaze, green and gold color scheme` |
| `worried.webp` | 걱정 | `[STYLE PREFIX] Liu Bei, same character as above, deeply worried expression, furrowed brows, looking down slightly, concern in his eyes, hand near chin in thought, heavy atmosphere, darker lighting` |
| `determined.webp` | 결의 | `[STYLE PREFIX] Liu Bei, same character, burning determination in his eyes, firm jaw, standing tall, gripping sword handle, wind blowing his robe, heroic backlight, resolved expression` |
| `smile.webp` | 미소 | `[STYLE PREFIX] Liu Bei, same character, warm genuine smile, kind crinkled eyes, relaxed posture, soft golden lighting, benevolent aura, welcoming expression` |

### A-2. 관우 (關羽) — `assets/characters/guanyu/`

**기본 설정**: 장대한 체구, 붉은 얼굴(대추빛), 매우 긴 아름다운 수염(미염공), 청룡언월도, 녹색 전포(戰袍), 위엄있는 자태

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Guan Yu, legendary Chinese warrior, tall imposing figure, distinctive red face (jujube complexion), magnificent long flowing black beard reaching chest, Green Dragon Crescent Blade (青龍偃月刀) visible, wearing green warrior's robe (戰袍), phoenix eyes (丹鳳眼), majestic and dignified, loyal warrior aura` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Guan Yu, same character, fierce angry expression, phoenix eyes blazing with fury, beard bristling, gripping his blade tightly, red aura emanating, intimidating presence, dramatic red lighting accent` |
| `majestic.webp` | 위엄 | `[STYLE PREFIX] Guan Yu, same character, commanding majestic presence, looking down with authority, half-closed contemplative eyes, stroking his long beard, golden backlight, aura of a war god, serene power` |
| `smile.webp` | 미소 | `[STYLE PREFIX] Guan Yu, same character, rare gentle smile, softened eyes showing warmth, dignified contentment, subtle nod of approval, warm lighting` |

### A-3. 장비 (張飛) — `assets/characters/zhangfei/`

**기본 설정**: 거친 야성적 얼굴, 번개 같은 큰 눈(환안), 표범 머리(표두), 짧고 거친 수염, 장팔사모(뱀 창), 흑갑, 강인한 체구

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Zhang Fei, fierce Chinese warrior, wild rugged face, large round lightning eyes (環眼), leopard-like head shape, short bristly beard, wearing dark steel armor, Serpent Spear (丈八蛇矛) visible, muscular build, rough but loyal demeanor, bold and imposing` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Zhang Fei, same character, explosive rage, mouth open in a war cry, veins visible on temples, eyes bulging with fury, gripping spear with both hands, dust and wind swirling around, terrifying presence` |
| `roar.webp` | 포효 | `[STYLE PREFIX] Zhang Fei, same character, thunderous battle roar at Changban Bridge, mouth wide open screaming, shockwave effect around his voice, spear raised high, legendary intimidation pose, dramatic backlighting` |
| `laugh.webp` | 웃음 | `[STYLE PREFIX] Zhang Fei, same character, hearty boisterous laugh, head thrown back, wide open mouth showing teeth, slapping knee, jovial and infectious energy, warm rough charm` |

### A-4. 조자룡 (趙子龍) — `assets/characters/zhaozilong/`

**기본 설정**: 젊고 잘생긴 영웅, 은백색 갑옷, 장창, 백마, 단정하고 영웅적인 인상

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Zhao Yun (Zhao Zilong), young handsome Chinese warrior hero, sharp noble features, wearing gleaming silver-white armor with flowing white cape, long spear, clean-shaven with short neat hair, bright determined eyes, heroic and gallant aura, silver and white color scheme` |
| `determined.webp` | 결의 | `[STYLE PREFIX] Zhao Yun, same character, steely determination, eyes focused and burning with resolve, gripping spear firmly, battle-ready stance, wind catching his cape, dawn light behind him, one-man-army presence` |
| `smile.webp` | 미소 | `[STYLE PREFIX] Zhao Yun, same character, confident charming smile, youthful energy, relaxed but alert, sunlight highlighting his silver armor, approachable hero, warm golden hour lighting` |
| `combat.webp` | 전투 | `[STYLE PREFIX] Zhao Yun, same character, intense combat expression, mid-battle motion, spear thrust forward, silver armor with battle marks, fierce concentrated eyes, dynamic pose, motion blur on weapon, adrenaline-filled moment` |

### A-5. 제갈량 (諸葛亮) — `assets/characters/zhugeliang/`

**기본 설정**: 지적이고 신비로운 도사풍, 흰색 학창의(鶴氅), 깃털 부채(우선), 관건(도사 관), 날카롭고 깊은 눈, 마른 체형

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Zhuge Liang (Kongming), legendary Chinese strategist, thin elegant figure, wearing white crane feather cloak (鶴氅), holding white feather fan (羽扇), Daoist headdress (綸巾), sharp penetrating intelligent eyes, enigmatic slight smile, mystical scholarly aura, ethereal lighting` |
| `thinking.webp` | 사색 | `[STYLE PREFIX] Zhuge Liang, same character, deep in thought, eyes half-closed looking into distance, feather fan held near chin, contemplating strategy, subtle celestial patterns in background, meditative atmosphere, cool blue-white tones` |
| `smile.webp` | 미소 | `[STYLE PREFIX] Zhuge Liang, same character, knowing confident smile, "everything is going according to plan" expression, eyes twinkling with intelligence, fan partially covering mouth, mysterious and assured, warm golden accents` |
| `warning.webp` | 경고 | `[STYLE PREFIX] Zhuge Liang, same character, serious urgent warning expression, eyes wide and piercing, fan pointing forward gesturing emphasis, wind blowing cloak dramatically, ominous clouds in background, grave atmosphere` |

### A-6. 황충 (黃忠) — `assets/characters/huangzhong/`

**기본 설정**: 백발의 노장군, 강궁(활), 전투 갑옷, 근엄하고 강인한 인상, 전혀 늙어 보이지 않는 강건함

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Huang Zhong, elderly but formidable Chinese warrior general, white hair and beard, wearing battle-worn heavy armor, carrying a powerful longbow (強弓), fierce sharp eyes that defy his age, muscular despite age, veteran soldier's dignity, iron will expression` |
| `determined.webp` | 결의 | `[STYLE PREFIX] Huang Zhong, same character, fierce determination burning in old eyes, drawing his great bow, muscles tensed, "age means nothing" defiant energy, powerful stance, heroic backlight` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Huang Zhong, same character, righteous anger, white beard bristling, slamming fist, offended warrior pride, "don't call me old" fury, intense red accents in lighting` |
| `tired.webp` | 피로 | `[STYLE PREFIX] Huang Zhong, same character, battle fatigue showing, leaning on bow slightly, sweat on brow, heavy breathing visible, but still standing tall with unbroken spirit, twilight lighting` |

### A-7. 위연 (魏延) — `assets/characters/weiyuan/`

**기본 설정**: 험상궂은 인상, 반골상(뒤통수에 뼈가 돌출), 거친 투구, 대도, 야심적인 눈빛

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Wei Yan, fierce Chinese warrior with sinister features, protruding bone at back of skull (反骨之相), rough battle helmet, carrying a large curved blade, dark armor, ambitious calculating eyes, dangerous but capable warrior, shadow-heavy lighting` |
| `ambitious.webp` | 야심 | `[STYLE PREFIX] Wei Yan, same character, ambitious scheming expression, eyes gleaming with hidden plans, slight smirk, looking upward as if envisioning power, dramatic shadow play on face, green-tinted lighting` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Wei Yan, same character, explosive anger, baring teeth, gripping blade, veins on neck, feeling disrespected and furious, violent energy, red-tinted harsh lighting` |
| `displeased.webp` | 불만 | `[STYLE PREFIX] Wei Yan, same character, sulking displeasure, arms crossed, looking away, bitter frown, resentful eyes, feeling undervalued, cold moody lighting` |

### A-8. 간옹 (簡雍) — `assets/characters/jianyong/`

**기본 설정**: 문관 복식, 온화하고 세련된 인상, 두루마리, 외교관의 풍채

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Jian Yong, Chinese diplomat and civil official, wearing elegant scholar's robes in muted green, holding scroll, warm gentle face with intelligent eyes, well-groomed short beard, diplomatic bearing, soft ambient lighting, refined and approachable` |
| `smile.webp` | 미소 | `[STYLE PREFIX] Jian Yong, same character, warm diplomatic smile, hands clasped in greeting, welcoming expression, persuasive charm, golden warm lighting` |
| `worried.webp` | 걱정 | `[STYLE PREFIX] Jian Yong, same character, concerned expression, looking at scroll with furrowed brows, hand on forehead, worried about diplomatic matters, dim worried lighting` |
| `thinking.webp` | 사색 | `[STYLE PREFIX] Jian Yong, same character, thoughtful contemplation, stroking beard, looking at distance, weighing diplomatic options, scholarly atmosphere, study room lighting` |

### A-9. 조조 (曹操) — `assets/characters/caocao/`

**기본 설정**: 날카로운 매의 눈, 짧은 수염, 검은색/진남색 갑옷, 왕관(면류관), 카리스마 넘치는 위압감

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Cao Cao, supreme Chinese warlord and ruler, sharp hawk-like eyes, short trimmed beard, wearing ornate black and dark navy armor with gold trim, imperial crown (冕旒冠), overwhelming charisma and authority, calculating intelligence, dark regal presence, deep navy and black color scheme` |
| `sneer.webp` | 냉소 | `[STYLE PREFIX] Cao Cao, same character, cold contemptuous sneer, one eyebrow raised, looking down at viewer, amused by others' weakness, cruel intelligence in eyes, dark shadows emphasizing his menace` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Cao Cao, same character, terrifying cold anger, eyes like daggers, clenched jaw, restrained fury more frightening than explosive rage, dark aura intensifying, crimson accents in lighting` |
| `arrogant.webp` | 오만 | `[STYLE PREFIX] Cao Cao, same character, supreme confidence and arrogance, chin raised high, sweeping gesture, "the world is mine" expression, golden light surrounding him like a conqueror, imperial majesty` |

### A-10. 하후연 (夏侯淵) — `assets/characters/xiahouyuan/`

**기본 설정**: 건장한 체구, 경장갑, 기마 전사, 창, 전격전 전문가

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Xiahou Yuan, Chinese cavalry general, muscular athletic build, wearing light flexible armor for speed, carrying a spear, martial confident expression, wind-swept appearance suggesting constant movement, dynamic energy, steel gray color scheme` |
| `charge.webp` | 돌격 | `[STYLE PREFIX] Xiahou Yuan, same character, charging forward expression, eyes blazing with battle fury, spear leveled forward, leaning into attack, wind rushing past, motion blur, explosive charging energy` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Xiahou Yuan, same character, fierce anger, gritting teeth, aggressive stance, ready to fight, hot-headed warrior energy, red-tinted lighting` |
| `alert.webp` | 경계 | `[STYLE PREFIX] Xiahou Yuan, same character, sharp alertness, scanning surroundings, hand on weapon ready to draw, tense muscles, perceptive warrior's instinct, cool blue moonlight` |

### A-11. 조인 (曹仁) — `assets/characters/caoren/`

**기본 설정**: 충직한 인상, 중갑(무거운 갑옷), 대방패, 수성 전문가

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Cao Ren, stalwart Chinese defensive general, loyal dependable face, wearing heavy plate armor, carrying large tower shield, solid immovable stance like a fortress wall, determined protective expression, iron and bronze color scheme` |
| `defend.webp` | 수성 | `[STYLE PREFIX] Cao Ren, same character, defensive stance, shield raised, feet planted firmly, "none shall pass" expression, castle wall behind him, dust and arrows bouncing off shield, unwavering resolve` |
| `determined.webp` | 결의 | `[STYLE PREFIX] Cao Ren, same character, grim determination, jaw set firm, eyes steely, ready to hold the line no matter the cost, duty above all, solemn lighting` |
| `alert.webp` | 경계 | `[STYLE PREFIX] Cao Ren, same character, alert defensive posture, surveying battlefield from ramparts, calculating defensive positions, strategic mind at work, dawn patrol lighting` |

### A-12. 채모 (蔡瑁) — `assets/characters/caimao/`

**기본 설정**: 형주 지방 관리 복식, 교활하고 기회주의적인 인상, 약간 비만

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Cai Mao, Chinese naval commander and opportunist, slightly overweight, wearing Jingzhou official robes with naval insignia, cunning shifty eyes, thin mustache, politician's fake composure, scheming aura, muted gray-green tones` |
| `nervous.webp` | 불안 | `[STYLE PREFIX] Cai Mao, same character, nervous anxious expression, sweating, looking over shoulder, fidgeting with hands, fear of being discovered, paranoid atmosphere, harsh shadows` |
| `scheming.webp` | 교활 | `[STYLE PREFIX] Cai Mao, same character, cunning scheming smile, rubbing hands together, narrow calculating eyes, plotting behind the scenes, dim candlelit atmosphere, sinister shadows` |
| `fearful.webp` | 공포 | `[STYLE PREFIX] Cai Mao, same character, abject terror, wide eyes, mouth agape, backing away, face drained of color, realizing his fate, cold blue-white lighting` |

### A-13. 장윤 (張允) — `assets/characters/zhangyun/`

**기본 설정**: 수군 복식, 평범한 인상, 채모의 부관

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Zhang Yun, Chinese naval vice-commander, average unremarkable features, wearing simple naval officer uniform, following orders type, standing at attention, dull but competent expression, blue-gray naval tones` |
| `nervous.webp` | 불안 | `[STYLE PREFIX] Zhang Yun, same character, nervous and uncertain, glancing sideways at Cai Mao for direction, wringing hands, follower's anxiety, dim uneasy lighting` |
| `determined.webp` | 결의 | `[STYLE PREFIX] Zhang Yun, same character, rare moment of resolve, standing firm at his post, duty-bound expression, naval fleet in background, morning sea light` |
| `fearful.webp` | 공포 | `[STYLE PREFIX] Zhang Yun, same character, terrified expression, trembling, looking at execution grounds, pale face, accepting fate, cold harsh lighting` |

### A-14. 손권 (孫權) — `assets/characters/sunquan/`

**기본 설정**: 젊은 군주, 벽안(푸른 눈) 자수염(붉은 수염), 금관, 붉은 갑옷, 강남의 젊은 호랑이

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Sun Quan, young Chinese lord of Wu, striking blue-green eyes (碧眼), reddish-brown beard (紫髯), wearing golden crown and crimson armor with tiger motifs, youthful but regal bearing, "young tiger of Jiangdong" aura, red and gold color scheme` |
| `decisive.webp` | 결단 | `[STYLE PREFIX] Sun Quan, same character, decisive leadership expression, drawing sword and slamming it on table, eyes blazing with resolve, "the decision is made" moment, dramatic lighting flash, powerful royal authority` |
| `contemplating.webp` | 고민 | `[STYLE PREFIX] Sun Quan, same character, deep contemplation, young ruler's burden, looking at map, weighing alliance options, heavy is the crown, thoughtful moody lighting` |
| `majestic.webp` | 위엄 | `[STYLE PREFIX] Sun Quan, same character, full royal majesty, standing before his court, tiger banner behind him, supreme confidence of a born ruler, commanding gaze, golden throne room lighting` |

### A-15. 주유 (周瑜) — `assets/characters/zhouyu/`

**기본 설정**: 미남 도독, 문무 겸비(갑옷 위에 학자의 문양), 자신감 넘치는 포즈, 음악적 감성

| 파일명 | 표정 | 프롬프트 |
|--------|------|----------|
| `default.webp` | 기본 | `[STYLE PREFIX] Zhou Yu, handsome Chinese grand commander, strikingly beautiful male face, wearing armor with scholarly embroidery over it, commander's cape, both warrior and scholar aura, confident half-smile, elegant and dangerous, red-gold Wu faction colors` |
| `confident.webp` | 자신감 | `[STYLE PREFIX] Zhou Yu, same character, supreme military confidence, arms crossed, knowing smile, looking at Chibi battlefield, "I've already won" expression, wind in his cape, golden sunset backlighting` |
| `angry.webp` | 분노 | `[STYLE PREFIX] Zhou Yu, same character, jealous angry expression, fist clenched, beautiful face twisted with competitive fury, rivalry burning in eyes, stormy atmosphere, sharp dramatic lighting` |
| `strategic.webp` | 전략 | `[STYLE PREFIX] Zhou Yu, same character, brilliant strategist at work, pointing at naval battle map, sharp focused eyes, commanding his fleet, firelight reflecting off his face, midnight war council atmosphere` |

---

## B. 전략 맵 에셋

### B-1. 맵 배경 — `assets/map/background.webp`

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

### B-2. 도시 마커 — `assets/map/city-marker-*.svg`

> SVG로 직접 제작 권장. AI 생성 시:

```
(유비) Small castle/fortress icon, top-down view, green jade color (#2d6a4f),
traditional Chinese castle gate style, ink brush stroke outlines, 64x64,
transparent background, simple elegant design

(조조) Same style castle icon, dark navy/black color (#1b1b3a),
more imposing and fortified look, iron gates

(손권) Same style castle icon, crimson red color (#c9184a) with gold accents,
southern Chinese architectural style, elegant
```

### B-3. 전투 마커 — `assets/map/battle-marker.svg`

```
Crossed swords with flame emblem, ink brush style, crimson and gold colors,
64x64, transparent background, dramatic, battle indicator icon,
Chinese military style, Three Kingdoms era
```

### B-4. 계절 오버레이 — `assets/map/seasons/`

```
(가을) Autumn overlay texture, scattered golden-brown maple and ginkgo leaves,
warm amber atmosphere, transparent overlay meant to cover a map,
1920x1080, very subtle, 30% opacity feel

(겨울) Winter overlay texture, light snowfall, frost on edges,
cold blue-gray atmosphere, bare tree branches visible,
1920x1080, subtle overlay, misty cold breath

(봄) Spring overlay texture, cherry blossom petals floating,
soft pink and white, warm hopeful atmosphere,
1920x1080, gentle overlay
```

---

## C. 전투 씬 에셋

### C-1. 전투 배경 — 수상전 — `assets/battle/bg-water.webp`

```
Epic naval battle scene background, Three Kingdoms era Battle of Red Cliffs,
the great Yangtze River at twilight, massive Chinese warships with red and black sails,
waves crashing against hulls, mist rising from water, dramatic cloudy sky,
ink wash painting style with vivid dramatic lighting,
1920x1080, cinematic composition, no characters visible,
atmospheric tension before battle, torch lights reflecting on dark water
```

### C-2. 전투 배경 — 평야 — `assets/battle/bg-plains.webp`

```
Epic open battlefield scene, Three Kingdoms era Chinese plains,
vast flat grassland stretching to horizon, military banners and flags
fluttering in wind, dust clouds rising, dramatic sky with
gathering storm clouds, ink wash painting style,
1920x1080, cinematic wide shot, no characters visible,
tension before the charge, autumn dried grass, distant mountain silhouettes
```

### C-3. 전투 배경 — 성곽 — `assets/battle/bg-castle.webp`

```
Chinese fortress siege scene background, Three Kingdoms era castle walls,
massive stone fortification with watchtowers, siege ladders and
burning arrows in sky, smoke rising, defenders on ramparts,
ink wash painting style with dramatic fire lighting,
1920x1080, looking up at imposing walls, no clear character faces,
desperate siege atmosphere, dawn or dusk lighting
```

### C-4. 화공 이펙트 — `assets/battle/fx-fire.webp`

```
Fire attack visual effect overlay, massive flames engulfing Chinese warships,
orange and red inferno, sparks and embers flying, smoke billowing,
transparent/dark background for overlay use, 1920x1080,
dramatic and terrifying, the great fire of Red Cliffs (赤壁之戰),
painterly style fire, not photorealistic
```

### C-5. 동남풍 이펙트 — `assets/battle/fx-wind.webp`

```
Supernatural southeast wind visual effect, powerful gale blowing from
bottom-left to upper-right, dramatic swirling clouds, mystical blue-green energy,
Zhuge Liang's prayer answered, wind carrying embers and leaves,
transparent/dark background for overlay use, 1920x1080,
divine intervention atmosphere, ink wash clouds mixed with ethereal light
```

### C-6. 연환진 — `assets/battle/formation-chain.webp`

```
Chain formation (連環陣) of Chinese warships, multiple large wooden warships
linked together by heavy iron chains, viewed from above at angle,
Cao Cao's fleet chained together on the Yangtze River,
ink wash painting style, ominous atmosphere,
the ships cannot separate — a fatal tactical decision,
1920x1080, detailed ship rigging and chain links visible
```

---

## D. 이벤트 컷신 일러스트 (8장)

### D-1. 게임 시작 — `assets/events/opening.webp`

```
[EVENT STYLE PREFIX] The eve of the Battle of Red Cliffs,
panoramic view of the Yangtze River at sunset,
silhouette of Zhuge Liang standing on a cliff edge holding his feather fan,
looking out at Cao Cao's massive fleet of warships in the distance,
thousands of ships with dark sails covering the river,
dramatic orange sunset sky, sense of destiny and impossible odds,
"one strategist against a million soldiers" atmosphere,
epic cinematic composition, wide shot
```

### D-2. 동맹 체결 — `assets/events/alliance.webp`

```
[EVENT STYLE PREFIX] Historic alliance between Liu Bei and Sun Quan,
two leaders meeting in a grand Chinese hall,
Liu Bei in green robes bowing respectfully,
Sun Quan in crimson armor extending his hand,
advisors standing behind each (Zhuge Liang, Zhou Yu),
large map of China on the table between them,
golden candlelight, solemn atmosphere of mutual respect,
two banners — green (Shu) and red (Wu) — hanging together,
"the alliance that changed history" moment
```

### D-3. 연환진 — `assets/events/chain-formation.webp`

```
[EVENT STYLE PREFIX] Cao Cao's fleet being chained together,
massive Chinese warships on the Yangtze River connected by
heavy iron chains as workers hammer the links,
Cai Mao supervising with a proud expression,
Cao Cao observing from the flagship with satisfaction,
the ships forming an immovable fortress — or a deathtrap,
ominous dark clouds gathering, foreshadowing doom,
dramatic overhead perspective showing the scale
```

### D-4. 동남풍 — `assets/events/southeast-wind.webp`

```
[EVENT STYLE PREFIX] Zhuge Liang summoning the southeast wind,
standing on a ritual altar (七星壇) on a hilltop,
arms raised with feather fan, daoist robes billowing in sudden gale,
supernatural wind swirling around him with mystical energy,
stars visible in the dark sky aligning, candles blown sideways,
dramatic lightning in background, divine intervention moment,
the wind that will decide the fate of China,
blue-green ethereal energy, powerful mystical atmosphere
```

### D-5. 적벽 화공 — `assets/events/fire-attack.webp`

```
[EVENT STYLE PREFIX] The Great Fire Attack at Red Cliffs (赤壁之戰),
the most epic moment — Cao Cao's chained fleet engulfed in massive flames,
fire ships crashing into the chained armada,
the entire Yangtze River lit up in orange inferno,
towering flames reaching into the night sky,
soldiers in chaos, ships breaking apart,
the southeast wind spreading flames unstoppably,
cinematic wide shot showing the scale of destruction,
THE defining moment of the Three Kingdoms era,
apocalyptic beauty, fire reflecting on dark water
```

### D-6. 조조 퇴각 (화용도) — `assets/events/retreat.webp`

```
[EVENT STYLE PREFIX] Cao Cao's retreat through Huarong Trail (華容道),
defeated Cao Cao on horseback, disheveled and exhausted,
leading remnants of his once-mighty army through a narrow muddy mountain pass,
rain falling, wounded soldiers struggling, broken banners,
the great conqueror humbled by fire,
dark gloomy atmosphere, fog in the mountain valley,
rear guard looking back fearfully for pursuers,
the price of arrogance, somber grey and brown tones
```

### D-7. 승리 엔딩 — `assets/events/victory.webp`

```
[EVENT STYLE PREFIX] Victory at Red Cliffs — Liu Bei's triumph,
Liu Bei and his generals standing on the Red Cliffs at dawn,
looking out at the smoking ruins of Cao Cao's fleet,
sunrise casting golden light on the victors,
Zhuge Liang with a satisfied smile, Guan Yu and Zhang Fei beside Liu Bei,
green banners of Shu flying triumphantly,
the beginning of a new era, hope and accomplishment,
epic hero pose composition, golden hour lighting,
"against all odds, we prevailed"
```

### D-8. 패배 엔딩 — `assets/events/defeat.webp`

```
[EVENT STYLE PREFIX] Defeat and ruin,
Liu Bei's destroyed camp in the aftermath of battle,
burning tents, broken weapons scattered,
a lone green banner (Shu) fallen and torn on the ground,
heavy rain falling, dark stormy sky,
silhouettes of retreating soldiers in the distance,
desolation and loss, everything was for nothing,
cold blue-gray tones, devastating atmosphere,
"the dream dies here"
```

---

## E. UI 에셋

### E-1. 메인 프레임 — `assets/ui/frame-main.svg`

> SVG 직접 제작 권장. AI 레퍼런스 생성 시:

```
Traditional Chinese decorative border frame, ink brush stroke style,
subtle dragon and cloud motifs in corners, rice paper texture interior,
dark ink (#1a1a2e) brush strokes on beige (#f5f0e8) background,
elegant and minimal, not overly ornate,
game UI frame suitable for strategy game panel,
square format with rounded inner corners
```

### E-2. 대화 프레임 — `assets/ui/frame-dialog.svg`

```
Chinese scroll-style dialog box frame, horizontal scroll shape,
ink brush borders, wooden scroll handles on sides,
rice paper background, elegant calligraphy-ready interior,
suitable for character dialogue in a strategy game,
transparent center for text, decorative but readable
```

### E-3. 전술 카드 (7종) — `assets/ui/tactic-cards/`

| 전술 | 파일명 | 프롬프트 |
|------|--------|----------|
| 정면돌파 | `frontal_assault.webp` | `Game card icon, crossed swords, frontal assault concept, Chinese military style, ink brush art, red accent, 120x160, transparent bg` |
| 방어 | `defend.webp` | `Game card icon, great shield with fortress wall, defensive stand concept, Chinese military style, ink brush art, blue accent, 120x160, transparent bg` |
| 측면공격 | `flank_attack.webp` | `Game card icon, curved arrow flanking movement, pincer attack concept, Chinese military style, ink brush art, green accent, 120x160, transparent bg` |
| 기병돌격 | `cavalry_charge.webp` | `Game card icon, galloping horse silhouette with spear, cavalry charge concept, Chinese military style, ink brush art, silver accent, 120x160, transparent bg` |
| 화선 | `fire_ships.webp` | `Game card icon, burning ship on water, fire ship attack concept, Chinese naval military style, ink brush art, orange flame accent, 120x160, transparent bg` |
| 화공 | `fire_attack.webp` | `Game card icon, massive flames engulfing fortress, fire attack concept, Chinese military style, ink brush art, intense red-orange, 120x160, transparent bg` |
| 매복 | `ambush.webp` | `Game card icon, hidden warriors in bamboo forest, ambush concept, Chinese military style, ink brush art, dark green shadow accent, 120x160, transparent bg` |

### E-4. 자원 아이콘 (4종) — `assets/ui/icons/`

```
(병력) Chinese military troops icon, soldier helmet silhouette, ink brush style,
simple clean design, 48x48, transparent bg, dark ink color

(군량) Chinese grain/food supply icon, rice sack or grain bundle,
ink brush style, 48x48, transparent bg, warm brown tone

(민심) People's heart/morale icon, group of people silhouette or heart with people,
ink brush style, 48x48, transparent bg, warm red tone

(훈련도) Military training level icon, crossed spear and shield or drill formation,
ink brush style, 48x48, transparent bg, steel gray tone
```

### E-5. 세력 문양 (3종) — `assets/ui/emblems/`

```
(유비) Liu Bei Shu faction emblem, twin swords crossed over a peach blossom,
Chinese calligraphy style, green (#2d6a4f) ink on transparent,
128x128, noble and righteous symbolism

(조조) Cao Cao Wei faction emblem, black hawk/eagle with spread wings
over a dark flag, Chinese calligraphy style, navy (#1b1b3a) ink,
128x128, power and authority symbolism

(손권) Sun Quan Wu faction emblem, fierce tiger head facing forward,
Chinese calligraphy style, crimson (#c9184a) and gold (#d4a017),
128x128, southern vigor and wealth symbolism
```

### E-6. 등급 배지 (6종) — `assets/ui/grades/`

```
(S) Gold circular badge with large "S" character, Chinese imperial seal style,
ornate gold (#d4a017) with red accents, radiating light, 64x64, transparent bg

(A) Silver-gold badge with "A" character, military merit medal style,
silver with gold trim, elegant, 64x64, transparent bg

(B) Bronze badge with "B" character, solid military medal,
bronze (#cd7f32) tone, respectable, 64x64, transparent bg

(C) Iron badge with "C" character, simple military badge,
iron gray, plain but dignified, 64x64, transparent bg

(D) Worn iron badge with "D" character, slightly damaged/weathered,
dark gray, minimal decoration, 64x64, transparent bg

(F) Broken/cracked badge with "F" character, shattered medal,
dark damaged metal, somber, 64x64, transparent bg
```

---

## F. 영상 클립 (Veo용)

### F-1. 화공 이펙트 루프 — `assets/battle/fx-fire-loop.mp4`

```
3-5 second looping video clip, massive fire burning on water,
Chinese warships engulfed in flames, fire spreading across water surface,
sparks and embers floating upward, smoke billowing,
dramatic orange-red lighting, dark night sky background,
cinematic quality, painterly style, seamless loop,
suitable for game battle overlay effect
```

### F-2. 동남풍 이펙트 루프 — `assets/battle/fx-wind-loop.mp4`

```
3-5 second looping video clip, powerful mystical wind blowing,
leaves and debris carried in the gale, swirling clouds overhead,
blue-green ethereal energy streaks in the wind,
dramatic atmospheric effect, supernatural feeling,
suitable for game weather overlay, seamless loop
```

### F-3. 전투 승리 연출 — `assets/battle/victory-cinematic.mp4`

```
5 second video clip, dramatic victory moment,
Chinese military banners rising triumphantly,
golden sunlight breaking through clouds,
slow-motion confetti/petals falling,
epic orchestral feeling visualization,
fade to golden light at end
```

### F-4. 전투 패배 연출 — `assets/battle/defeat-cinematic.mp4`

```
5 second video clip, somber defeat moment,
broken weapons falling to ground in slow motion,
rain beginning to fall, colors desaturating to gray,
torn banner falling, fading to black at end,
melancholic atmosphere
```

---

## 생성 체크리스트

### 1차 우선순위 (게임 플레이에 필수)
- [ ] 제갈량 초상화 4종 (턴마다 브리핑에 등장)
- [ ] 유비 초상화 4종 (플레이어 세력 대표)
- [ ] 맵 배경 1장
- [ ] 수상전 배경 1장
- [ ] 화공 이펙트 1장
- [ ] 메인 프레임 SVG
- [ ] 전술 카드 7종

### 2차 우선순위 (주요 장면 연출)
- [ ] 관우, 장비, 조자룡 초상화 (각 4종)
- [ ] 조조, 손권, 주유 초상화 (각 4종)
- [ ] 이벤트 일러스트 — 적벽 화공, 동남풍, 게임 시작
- [ ] 평야 전투 배경, 성곽 전투 배경
- [ ] 세력 문양 3종

### 3차 우선순위 (완성도 향상)
- [ ] 나머지 장수 초상화 (황충, 위연, 간옹, 하후연, 조인, 채모, 장윤)
- [ ] 나머지 이벤트 일러스트 (동맹, 연환진, 퇴각, 엔딩)
- [ ] 자원 아이콘, 등급 배지
- [ ] 계절 오버레이
- [ ] 영상 클립 (Veo)
