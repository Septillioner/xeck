import type { TranscriptBlock } from '../../../../shared/types.ts';

/**
 * The text blocks cut at `limit` characters of the whole text stream, in block
 * order. A streamed answer arrives as one growing run of characters split across
 * the text blocks it is interrupted by, so one count from the start of the run
 * is all the reveal needs. Non-text blocks keep an empty placeholder entry.
 */
export function revealedBlockText(blocks: TranscriptBlock[], limit: number): string[] {
  let consumed = 0;
  return blocks.map((block) => {
    if (block.kind !== 'text') return '';
    const visible = block.text.slice(0, Math.max(0, limit - consumed));
    consumed += block.text.length;
    return visible;
  });
}
