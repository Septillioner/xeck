import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_IMAGE_BYTES, MAX_MESSAGE_IMAGES, readImageAttachments } from '../../../shared/images.ts';

const png = { id: 'test-photo', name: 'pixel.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=' };

test('photo input validates payloads, types, byte limits and attachment counts', () => {
  assert.deepEqual(readImageAttachments(undefined), []);
  assert.deepEqual(readImageAttachments([png]), [png]);
  for (const value of [null, {}, [null], [{ ...png, data: 'https://example.com/photo.png' }], [{ ...png, mimeType: 'image/svg+xml' }], [{ ...png, mimeType: 'image/jpeg' }], [{ ...png, data: 'A===' }], [png, png]]) {
    assert.throws(() => readImageAttachments(value));
  }
  assert.throws(() => readImageAttachments(Array.from({ length: MAX_MESSAGE_IMAGES + 1 }, (_, i) => ({ ...png, id: String(i) }))), /4 photos/);
  const large = Buffer.alloc(MAX_IMAGE_BYTES + 1); Buffer.from('\x89PNG\r\n\x1a\n', 'binary').copy(large);
  assert.throws(() => readImageAttachments([{ ...png, data: large.toString('base64') }]), /5 MB|Invalid photo/);
  const allowed = large.subarray(0, MAX_IMAGE_BYTES).toString('base64');
  assert.throws(() => readImageAttachments([0, 1, 2].map((i) => ({ ...png, id: String(i), data: allowed }))), /10 MB/);
});
