// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SSE 스트림 유틸리티
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { AdvisorExpression } from '../../core/advisor/types.js';

const encoder = new TextEncoder();

export function sseEncode(data: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function sseToken(token: string): Uint8Array {
  return sseEncode({ type: 'token', token });
}

export function sseDone(fullText: string, expression: AdvisorExpression): Uint8Array {
  return sseEncode({ type: 'done', fullText, expression });
}

export function sseError(error: string): Uint8Array {
  return sseEncode({ type: 'error', error });
}

export function inferExpression(text: string): AdvisorExpression {
  if (/급|위험|경고|주의|위태|긴급/.test(text)) return 'warning';
  if (/심각|패배|위기|절체절명/.test(text)) return 'serious';
  if (/승리|축하|훌륭|탁월|좋은/.test(text)) return 'smile';
  if (/고려|생각|분석|판단|살펴/.test(text)) return 'thinking';
  return 'default';
}
