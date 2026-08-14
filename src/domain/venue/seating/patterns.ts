import { SeatItem, PatternConfig } from './types';

/**
 * Parses pattern strings into a sequence of seat items and gap offsets.
 * Supported patterns:
 * - Symbolic: "● ● _ ● ● ● _ ● ●"
 * - Tokenized: "Seat x2, Gap, Seat x3, Gap, Seat x2" or "Seat 2, Gap 1, Seat 3"
 */
export function parseSeatPattern(config: PatternConfig, startNumber: number = 1): SeatItem[] {
  const { pattern, seatWidth, seatSpacing } = config;
  const items: SeatItem[] = [];

  let currentNum = startNumber;
  let currentX = 0;

  const normalized = pattern.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const tokens = normalized.split(' ');

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];
    if (!token) continue;

    const lower = token.toLowerCase();

    if (lower === '●') {
      items.push({ type: 'seat', seatNumber: currentNum++, xOffset: currentX });
      currentX += seatWidth + seatSpacing;
    } else if (lower === '_') {
      items.push({ type: 'gap', xOffset: currentX });
      currentX += seatWidth + seatSpacing;
    } else if (lower === 'seat' || lower.startsWith('seat')) {
      let count = 1;

      const match = lower.match(/^seat(?:x|\*|)?(\d+)$/);
      if (match && match[1]) {
        count = parseInt(match[1], 10);
      } else if (idx + 1 < tokens.length && tokens[idx + 1]) {
        const nextToken = tokens[idx + 1]!;
        const next = nextToken.toLowerCase();
        const nextMatch = next.match(/^(?:x|\*|)?(\d+)$/);
        if (nextMatch && nextMatch[1]) {
          count = parseInt(nextMatch[1], 10);
          idx++;
        }
      }

      for (let i = 0; i < count; i++) {
        items.push({ type: 'seat', seatNumber: currentNum++, xOffset: currentX });
        currentX += seatWidth + seatSpacing;
      }
    } else if (lower === 'gap' || lower.startsWith('gap')) {
      let count = 1;

      const match = lower.match(/^gap(?:x|\*|)?(\d+)$/);
      if (match && match[1]) {
        count = parseInt(match[1], 10);
      } else if (idx + 1 < tokens.length && tokens[idx + 1]) {
        const nextToken = tokens[idx + 1]!;
        const next = nextToken.toLowerCase();
        const nextMatch = next.match(/^(?:x|\*|)?(\d+)$/);
        if (nextMatch && nextMatch[1]) {
          count = parseInt(nextMatch[1], 10);
          idx++;
        }
      }

      for (let i = 0; i < count; i++) {
        items.push({ type: 'gap', xOffset: currentX });
        currentX += seatWidth + seatSpacing;
      }
    }
  }

  return items;
}
