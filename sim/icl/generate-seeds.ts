#!/usr/bin/env node
// o4-mini 승리 로그에서 시드 경험 자동 추출
// 배치 결과 JSON에서 chibiVictory 게임을 직접 추출한다.

import { ExperienceExtractor } from './experience-extractor.js';
import { ExperienceStore } from './experience-store.js';
import { readFileSync, readdirSync } from 'node:fs';
import type { SimResult, BatchResult } from '../sim-config.js';

const store = new ExperienceStore({ maxExperiences: 20, selectionStrategy: 'balanced' });

// o4-mini 배치 결과 파일들
const batchFiles = [
  'sim/results/batch-2026-02-16T04-29-58-931Z.json',
  'sim/results/batch-2026-02-16T06-57-22-833Z.json',
];

let idx = 0;
for (const file of batchFiles) {
  const batch: BatchResult = JSON.parse(readFileSync(file, 'utf-8'));
  const wins = batch.results.filter(r => r.flags['chibiVictory'] === true);
  for (const result of wins) {
    idx++;
    const exp = ExperienceExtractor.extract(result, idx);
    store.add(exp);
    console.log(`Game ${idx}: ${exp.grade}등급, chibi=${exp.chibiVictory}`);
    console.log(`  transfer: ${exp.strategyProfile.transferPattern.totalTransfers}, target: ${exp.strategyProfile.transferPattern.concentrationTarget}`);
    console.log(`  firstMarch: 턴${exp.strategyProfile.firstMarchTurn}, targets: ${exp.strategyProfile.marchTargets}`);
    console.log(`  phases: ${exp.strategyProfile.phases.map(p => `${p.name}(${p.startTurn}-${p.endTurn})`).join(' → ')}`);
    console.log(`  lessons: ${exp.lessons.join(' / ')}`);
  }
}

if (idx === 0) {
  console.log('승리 게임을 찾지 못했습니다.');
  process.exit(1);
}

store.save('sim/icl/seeds/o4-mini-wins.json');
console.log(`\nSaved ${store.size}개 경험 → sim/icl/seeds/o4-mini-wins.json`);
