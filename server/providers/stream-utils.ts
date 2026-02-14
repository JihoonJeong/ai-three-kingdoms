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

/**
 * Reasoning 모델의 thinking 블록을 제거한다.
 * <think>...</think> 및 <thought>...</thought> 모두 지원.
 */
export function stripThinking(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<thought>[\s\S]*?<\/thought>/g, '')
    .trim();
}

/**
 * 스트리밍용 thinking 필터 상태 머신.
 * <think>...</think> 및 <thought>...</thought> 블록을 실시간 제거.
 */
export class ThinkingFilter {
  private buffer = '';
  private inThinking = false;

  // 지원하는 태그 쌍
  private static readonly OPEN_TAGS = ['<think>', '<thought>'];
  private static readonly CLOSE_TAGS = ['</think>', '</thought>'];
  private static readonly MAX_TAG_LEN = '<thought>'.length; // 가장 긴 태그

  /** 토큰을 넣으면 표시할 텍스트를 반환 (빈 문자열이면 suppress) */
  push(token: string): string {
    this.buffer += token;
    let output = '';

    while (this.buffer.length > 0) {
      if (this.inThinking) {
        const closeResult = this.findFirstTag(this.buffer, ThinkingFilter.CLOSE_TAGS);
        if (closeResult !== null) {
          this.buffer = this.buffer.slice(closeResult.end);
          this.inThinking = false;
        } else {
          // 닫는 태그 부분 매칭 가능성을 위해 끝부분 보존
          if (this.buffer.length > ThinkingFilter.MAX_TAG_LEN) {
            this.buffer = this.buffer.slice(-(ThinkingFilter.MAX_TAG_LEN - 1));
          }
          break;
        }
      } else {
        const openResult = this.findFirstTag(this.buffer, ThinkingFilter.OPEN_TAGS);
        if (openResult !== null) {
          output += this.buffer.slice(0, openResult.start);
          this.buffer = this.buffer.slice(openResult.end);
          this.inThinking = true;
        } else {
          const partialIdx = this.findPartialOpenTag(this.buffer);
          if (partialIdx !== -1) {
            output += this.buffer.slice(0, partialIdx);
            this.buffer = this.buffer.slice(partialIdx);
            break;
          } else {
            output += this.buffer;
            this.buffer = '';
          }
        }
      }
    }

    return output;
  }

  /** 남은 버퍼 flush (스트리밍 끝) */
  flush(): string {
    const rest = this.inThinking ? '' : this.buffer;
    this.buffer = '';
    this.inThinking = false;
    return rest;
  }

  private findFirstTag(text: string, tags: string[]): { start: number; end: number } | null {
    let best: { start: number; end: number } | null = null;
    for (const tag of tags) {
      const idx = text.indexOf(tag);
      if (idx !== -1 && (best === null || idx < best.start)) {
        best = { start: idx, end: idx + tag.length };
      }
    }
    return best;
  }

  private findPartialOpenTag(text: string): number {
    for (const tag of ThinkingFilter.OPEN_TAGS) {
      for (let i = text.length - tag.length + 1; i < text.length; i++) {
        if (i < 0) continue;
        const suffix = text.slice(i);
        if (tag.startsWith(suffix)) return i;
      }
    }
    return -1;
  }
}

export function inferExpression(text: string): AdvisorExpression {
  if (/급|위험|경고|주의|위태|긴급/.test(text)) return 'warning';
  if (/심각|패배|위기|절체절명/.test(text)) return 'serious';
  if (/승리|축하|훌륭|탁월|좋은/.test(text)) return 'smile';
  if (/고려|생각|분석|판단|살펴/.test(text)) return 'thinking';
  return 'default';
}
