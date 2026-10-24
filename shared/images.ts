/** Limits apply to decoded bytes, independently of the JSON transport overhead. */
export const IMAGE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_MESSAGE_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_MESSAGE_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: (typeof IMAGE_MIME_TYPES)[number];
  /** Raw base64. Never a remote URL or filesystem path. */
  data: string;
}

export function imageDataUrl(image: ImageAttachment): string {
  return `data:${image.mimeType};base64,${image.data}`;
}

export function sameImages(a: Pick<ImageAttachment, 'data' | 'mimeType'>[] = [], b: Pick<ImageAttachment, 'data' | 'mimeType'>[] = []): boolean {
  return a.length === b.length && a.every((image, index) => image.data === b[index].data && image.mimeType === b[index].mimeType);
}

/** Validate again on the host; client-side validation is only feedback. */
export function readImageAttachments(value: unknown): ImageAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_MESSAGE_IMAGES) throw new Error('Attach up to 4 photos.');
  let total = 0;
  const ids = new Set<string>();
  return value.map((raw) => {
    if (!raw || typeof raw !== 'object') throw new Error('Invalid photo attachment.');
    const image = raw as Partial<ImageAttachment>;
    if (typeof image.id !== 'string' || !image.id || image.id.length > 100 || ids.has(image.id)
      || typeof image.name !== 'string' || !image.name || image.name.length > 200
      || !IMAGE_MIME_TYPES.includes(image.mimeType as ImageAttachment['mimeType'])
      || typeof image.data !== 'string' || !image.data || image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
      || image.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(image.data)) throw new Error('Invalid photo attachment.');
    const bytes = atob(image.data);
    if (bytes.length > MAX_IMAGE_BYTES) throw new Error('Each photo must be 5 MB or smaller.');
    total += bytes.length;
    if (total > MAX_MESSAGE_IMAGE_BYTES) throw new Error('Photos must total 10 MB or less.');
    const png = bytes.startsWith('\x89PNG\r\n\x1a\n');
    const jpeg = bytes.startsWith('\xff\xd8\xff');
    const webp = bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
    if (!(image.mimeType === 'image/png' && png || image.mimeType === 'image/jpeg' && jpeg || image.mimeType === 'image/webp' && webp)) throw new Error('Use a valid PNG, JPEG or WebP photo.');
    ids.add(image.id);
    return { id: image.id, name: image.name, mimeType: image.mimeType!, data: image.data };
  });
}
