import { describe, it, expect } from 'vitest';
import { createRedCliffsScenario } from '../data/scenarios/red-cliffs.js';
import { filterGameState } from './state-filter.js';
import {
  buildSystemPrompt,
  buildBriefingUserMessage,
  buildActionCommentMessage,
  buildBattleAdviceMessage,
} from './prompts.js';

describe('prompts', () => {
  describe('buildSystemPrompt', () => {
    it('제갈량 페르소나를 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('제갈량');
      expect(prompt).toContain('주공');
      expect(prompt).toContain('군사');
    });

    it('현재 턴 정보를 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('턴: 1/20');
      expect(prompt).toContain('preparation');
    });

    it('아군 도시 정보를 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('강하');
      expect(prompt).toContain('하구');
      // 범주형 값 포함
      expect(prompt).toMatch(/병력 (풍부|충분|부족|위험)/);
      expect(prompt).toMatch(/식량 (풍부|충분|부족|위험)/);
    });

    it('적군 정보를 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('조조');
      expect(prompt).toMatch(/추정 총병력: (압도적|우세|비슷|열세)/);
    });

    it('배경지식을 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('배경지식');
    });

    it('긴급 사안이 있으면 포함한다', () => {
      const state = createRedCliffsScenario('test');
      const hagu = state.cities.find(c => c.id === 'hagu')!;
      hagu.food = 500;

      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('긴급 사안');
      expect(prompt).toContain('하구');
    });

    it('언어 규칙을 포함한다 (기본 ko)', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      expect(prompt).toContain('## 언어 규칙');
      expect(prompt).toContain('한국어');
    });

    it('언어 파라미터에 따라 언어 규칙이 바뀐다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);

      expect(buildSystemPrompt(view, 'en')).toContain('English');
      expect(buildSystemPrompt(view, 'zh')).toContain('中文');
      expect(buildSystemPrompt(view, 'ja')).toContain('日本語');
    });

    it('정확한 숫자를 노출하지 않는다', () => {
      const state = createRedCliffsScenario('test');
      const view = filterGameState(state);
      const prompt = buildSystemPrompt(view);

      // 병력/식량 숫자가 직접 노출되지 않아야 함
      expect(prompt).not.toMatch(/병력[:\s]*\d{4,}/);
      expect(prompt).not.toMatch(/식량[:\s]*\d{4,}/);
    });
  });

  describe('메시지 빌더', () => {
    it('턴 브리핑 메시지를 생성한다', () => {
      const msg = buildBriefingUserMessage(3);
      expect(msg).toContain('턴 3');
      expect(msg).toContain('조언');
    });

    it('행동 코멘트 메시지를 생성한다', () => {
      const msg = buildActionCommentMessage('강하에서 징병 실시', true);
      expect(msg).toContain('징병');
      expect(msg).toContain('성공');
    });

    it('전투 조언 메시지를 생성한다', () => {
      const msg = buildBattleAdviceMessage('적벽');
      expect(msg).toContain('적벽');
      expect(msg).toContain('전투');
    });
  });
});
