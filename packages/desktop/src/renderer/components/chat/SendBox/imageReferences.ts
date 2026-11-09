import type { DraftImageReference } from '@/renderer/hooks/chat/useSendBoxDraft';

export type ImageReference = DraftImageReference;

/** Assigns a stable, short draft token without losing the original image path. */
export function addImageReference(references: ImageReference[], path: string): ImageReference {
  const existing = references.find((reference) => reference.path === path);
  if (existing) return existing;
  const filename = path.split(/[\\/]/).pop() || 'image';
  const stem = filename
    .replace(/\.[^.]+$/, '')
    .replaceAll('[', '_')
    .replaceAll(']', '_')
    .replace(/[\r\n]/g, '_');
  let token = `[${stem}]`;
  let suffix = 2;
  while (references.some((reference) => reference.token === token)) token = `[${stem}-${suffix++}]`;
  const reference = { token, path };
  references.push(reference);
  return reference;
}

/** Finds only complete references so ordinary filenames remain editable text. */
export function getImageReferenceRanges(value: string, references: ImageReference[]) {
  const ranges: Array<{ start: number; end: number; reference: ImageReference }> = [];
  for (const reference of references) {
    let start = value.indexOf(reference.token);
    while (start >= 0) {
      ranges.push({ start, end: start + reference.token.length, reference });
      start = value.indexOf(reference.token, start + reference.token.length);
    }
  }
  return ranges.toSorted((left, right) => left.start - right.start);
}

/** Expands draft labels at the send boundary, keeping the backend's path syntax. */
export function expandImageReferences(value: string, references: ImageReference[]): string {
  const ranges = getImageReferenceRanges(value, references);
  let expanded = value;
  for (const range of ranges.toReversed()) {
    expanded = `${expanded.slice(0, range.start)}[${range.reference.path}]${expanded.slice(range.end)}`;
  }
  return expanded;
}
