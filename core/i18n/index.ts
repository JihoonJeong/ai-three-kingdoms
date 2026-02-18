// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// i18n — 다국어 지원
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 한국어 문자열이 곧 번역 키.
// t('전략 맵') → 한국어면 '전략 맵', 영어면 'Strategy Map'
//
// t(): 정적 문자열 번역 (UI 표시 단계)
// tf(): 동적 템플릿 번역 ({placeholder} 치환, 엔진 내부에서도 사용)

import type { GameLanguage } from '../data/types.js';
import en from './en.js';
import zh from './zh.js';
import ja from './ja.js';

type Dict = Record<string, string>;

const dicts: Record<string, Dict> = { en, zh, ja };

let currentLang: GameLanguage = 'ko';

/** 현재 언어 설정 */
export function setLanguage(lang: GameLanguage): void {
  currentLang = lang;
}

/** 현재 언어 반환 */
export function getLanguage(): GameLanguage {
  return currentLang;
}

/**
 * 번역 함수.
 * 한국어 원문을 키로 사용하여 현재 언어의 번역을 반환한다.
 * 번역이 없으면 한국어 원문을 그대로 반환 (graceful fallback).
 */
export function t(korean: string): string {
  if (currentLang === 'ko') return korean;
  return dicts[currentLang]?.[korean] ?? korean;
}

/**
 * 템플릿 번역 함수.
 * 한국어 템플릿을 키로 사용하여 번역 후 {placeholder}를 치환한다.
 * 예: tf('{city}에서 징병했습니다.', { city: t('강하') })
 *   → 영어: 'Conscripted in Jiangxia.'
 */
export function tf(template: string, params: Record<string, string | number>): string {
  const translated = t(template);
  return translated.replace(/\{(\w+)\}/g, (_, key) =>
    params[key] !== undefined ? String(params[key]) : `{${key}}`
  );
}
