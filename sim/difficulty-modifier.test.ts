import { describe, it, expect } from 'vitest';
import { createRedCliffsScenario } from '../core/data/scenarios/red-cliffs.js';
import { applyDifficultyModifier, DIFFICULTY_PRESETS } from './difficulty-modifier.js';

describe('DifficultyModifier', () => {
  it('easy: 남군 병력 70%, 유비 식량 150%, flags 설정', () => {
    const state = createRedCliffsScenario('test-easy');
    const nanjunBefore = state.cities.find(c => c.id === 'nanjun')!;
    const origInfantry = nanjunBefore.troops.infantry;
    const origCavalry = nanjunBefore.troops.cavalry;
    const origNavy = nanjunBefore.troops.navy;

    const ganghaBefore = state.cities.find(c => c.id === 'gangha')!;
    const origGanghaFood = ganghaBefore.food;

    applyDifficultyModifier(state, 'easy');

    const nanjun = state.cities.find(c => c.id === 'nanjun')!;
    expect(nanjun.troops.infantry).toBe(Math.floor(origInfantry * 0.7));
    expect(nanjun.troops.cavalry).toBe(Math.floor(origCavalry * 0.7));
    expect(nanjun.troops.navy).toBe(Math.floor(origNavy * 0.7));

    const gangha = state.cities.find(c => c.id === 'gangha')!;
    expect(gangha.food).toBe(Math.floor(origGanghaFood * 1.5));

    expect(state.flags['difficulty']).toBe('easy');
    expect(state.flags['nanjunCollapseRatio']).toBe(0.7);
    expect(state.flags['nanjunMoralePenalty']).toBe(-40);
    expect(state.flags['sunQuanFoodSupport']).toBe(5000);
  });

  it('medium: 남군 병력 80%, 유비 식량 135%', () => {
    const state = createRedCliffsScenario('test-medium');
    const nanjun = state.cities.find(c => c.id === 'nanjun')!;
    const origInfantry = nanjun.troops.infantry;
    const gangha = state.cities.find(c => c.id === 'gangha')!;
    const origFood = gangha.food;

    applyDifficultyModifier(state, 'medium');

    expect(nanjun.troops.infantry).toBe(Math.floor(origInfantry * 0.8));
    expect(gangha.food).toBe(Math.floor(origFood * 1.35));
    expect(state.flags['nanjunCollapseRatio']).toBe(0.65);
    expect(state.flags['nanjunMoralePenalty']).toBe(-35);
    expect(state.flags['sunQuanFoodSupport']).toBe(4000);
  });

  it('normal: 남군 병력 85%, 유비 식량 125% (구 medium)', () => {
    const state = createRedCliffsScenario('test-normal');
    const nanjun = state.cities.find(c => c.id === 'nanjun')!;
    const origInfantry = nanjun.troops.infantry;
    const gangha = state.cities.find(c => c.id === 'gangha')!;
    const origFood = gangha.food;

    applyDifficultyModifier(state, 'normal');

    expect(nanjun.troops.infantry).toBe(Math.floor(origInfantry * 0.85));
    expect(gangha.food).toBe(Math.floor(origFood * 1.25));
    expect(state.flags['nanjunCollapseRatio']).toBe(0.6);
    expect(state.flags['sunQuanFoodSupport']).toBe(3000);
  });

  it('hard: 남군 병력 100%, 유비 식량 100% (구 normal)', () => {
    const state = createRedCliffsScenario('test-hard');
    const nanjun = state.cities.find(c => c.id === 'nanjun')!;
    const origInfantry = nanjun.troops.infantry;
    const gangha = state.cities.find(c => c.id === 'gangha')!;
    const origFood = gangha.food;

    applyDifficultyModifier(state, 'hard');

    expect(nanjun.troops.infantry).toBe(origInfantry);
    expect(gangha.food).toBe(origFood);
    expect(state.flags['nanjunCollapseRatio']).toBe(0.5);
    expect(state.flags['sunQuanFoodSupport']).toBe(0);
  });

  it('expert: 남군 병력 120%, 유비 식량 80% (구 hard)', () => {
    const state = createRedCliffsScenario('test-expert');
    const nanjun = state.cities.find(c => c.id === 'nanjun')!;
    const origInfantry = nanjun.troops.infantry;
    const gangha = state.cities.find(c => c.id === 'gangha')!;
    const origFood = gangha.food;

    applyDifficultyModifier(state, 'expert');

    expect(nanjun.troops.infantry).toBe(Math.floor(origInfantry * 1.2));
    expect(gangha.food).toBe(Math.floor(origFood * 0.8));
    expect(state.flags['nanjunCollapseRatio']).toBe(0.3);
  });

  it('DIFFICULTY_PRESETS에 모든 난이도가 존재', () => {
    expect(DIFFICULTY_PRESETS).toHaveProperty('easy');
    expect(DIFFICULTY_PRESETS).toHaveProperty('medium');
    expect(DIFFICULTY_PRESETS).toHaveProperty('normal');
    expect(DIFFICULTY_PRESETS).toHaveProperty('hard');
    expect(DIFFICULTY_PRESETS).toHaveProperty('expert');
  });

  it('손권 도시(sishang)는 식량 변경 안됨', () => {
    const state = createRedCliffsScenario('test-easy-sun');
    const sishang = state.cities.find(c => c.id === 'sishang')!;
    const origFood = sishang.food;

    applyDifficultyModifier(state, 'easy');

    expect(sishang.food).toBe(origFood);
  });
});
