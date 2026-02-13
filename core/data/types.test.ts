import { describe, it, expect } from 'vitest';
import {
  GRADE_VALUES, GRADE_ORDER, gradeUp, gradeDown,
  getRelationLevel, getTotalTroopsOfCity, TACTIC_DATA,
  type City,
} from './types.js';

describe('Grade 시스템', () => {
  it('등급별 수치가 올바르다', () => {
    expect(GRADE_VALUES['S']).toBe(95);
    expect(GRADE_VALUES['A']).toBe(80);
    expect(GRADE_VALUES['B']).toBe(65);
    expect(GRADE_VALUES['C']).toBe(50);
    expect(GRADE_VALUES['D']).toBe(35);
  });

  it('gradeUp은 한 단계 상승시킨다', () => {
    expect(gradeUp('D')).toBe('C');
    expect(gradeUp('C')).toBe('B');
    expect(gradeUp('B')).toBe('A');
    expect(gradeUp('A')).toBe('S');
    expect(gradeUp('S')).toBe('S'); // 최대
  });

  it('gradeDown은 한 단계 하락시킨다', () => {
    expect(gradeDown('S')).toBe('A');
    expect(gradeDown('A')).toBe('B');
    expect(gradeDown('D')).toBe('D'); // 최소
  });

  it('GRADE_ORDER가 오름차순이다', () => {
    expect(GRADE_ORDER).toEqual(['D', 'C', 'B', 'A', 'S']);
  });
});

describe('관계 레벨', () => {
  it('수치에 따라 올바른 레벨을 반환한다', () => {
    expect(getRelationLevel(90)).toBe('긴밀');
    expect(getRelationLevel(81)).toBe('긴밀');
    expect(getRelationLevel(70)).toBe('우호');
    expect(getRelationLevel(50)).toBe('중립');
    expect(getRelationLevel(30)).toBe('냉담');
    expect(getRelationLevel(10)).toBe('적대');
    expect(getRelationLevel(0)).toBe('적대');
  });
});

describe('도시 병력 합계', () => {
  it('보병+기병+수군 합계를 반환한다', () => {
    const city = {
      troops: { infantry: 5000, cavalry: 1000, navy: 2000 },
    } as City;
    expect(getTotalTroopsOfCity(city)).toBe(8000);
  });
});

describe('전술 데이터', () => {
  it('7개 전술이 정의되어 있다', () => {
    expect(Object.keys(TACTIC_DATA)).toHaveLength(7);
  });

  it('화공의 공격 배율이 1.8이다', () => {
    expect(TACTIC_DATA['fire_attack']?.attackMultiplier).toBe(1.8);
  });

  it('화선의 공격 배율이 2.0이다', () => {
    expect(TACTIC_DATA['fire_ships']?.attackMultiplier).toBe(2.0);
  });
});
