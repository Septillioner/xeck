import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { sessionRoutes } from '../../../http/routes/sessions.ts';
import { updateProvider } from '../../../stores/provider-store.ts';
import { writeSettings } from '../../../stores/settings-store.ts';
import { createSession, readSession } from '../../../stores/sessions.ts';
import { dropAgent } from '../agents/pool.ts';

const image = { id: 'photo-1', name: 'pixel.png', mimeType: 'image/png', data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=' };

test('photo-only HTTP turns reach the model, persist, replay and survive text edits', async () => {
  const previous = process.env.APPDATA;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'xeck-photo-turn-'));
  const captured: any[] = [];
  const server = http.createServer(async (request, response) => {
    let input = ''; for await (const chunk of request) input += chunk;
    captured.push(JSON.parse(input));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end('data: {"choices":[{"delta":{"content":"A photo."}}]}\n\ndata: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  process.env.APPDATA = directory;
  let id = '';
  try {
    const host = `http://127.0.0.1:${address.port}`;
    await updateProvider('llamacpp', { enabled: true, host });
    await writeSettings({ autocompleteProfile: null });
    const session = await createSession({ provider: 'llamacpp', model: 'vision-fixture', host }); id = session.id;
    const post = (body: unknown) => sessionRoutes.request(`/api/sessions/${id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const invalid = await post({ content: 'Invalid', images: [{ ...image, mimeType: 'image/svg+xml' }] });
    assert.equal(invalid.status, 400); assert.equal(captured.length, 0);
    const first = await post({ content: '', images: [image] });
    assert.equal(first.status, 200); await first.text();
    let stored = (await readSession(id))!;
    assert.deepEqual(stored.messages[0].images, [image]);
    assert.equal(stored.libraryMessages[0].images?.[0].data, image.data);
    assert.ok(captured[0].messages.find((m: any) => m.role === 'user').content.some((part: any) => part.type === 'image_url'));
    dropAgent(id);
    const followup = await post({ content: 'What was in the photo?' }); await followup.text();
    assert.ok(captured.at(-1).messages.some((m: any) => Array.isArray(m.content) && m.content.some((p: any) => p.type === 'image_url')));
    stored = (await readSession(id))!;
    const edited = await post({ content: 'Describe this photo.', edit: { messageId: stored.messages[0].id, expectedContent: '', lastMessageId: stored.messages.at(-1)!.id } });
    assert.equal(edited.status, 200); await edited.text();
    assert.deepEqual((await readSession(id))!.messages[0].images, [image]);
  } finally {
    if (id) dropAgent(id);
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previous === undefined) delete process.env.APPDATA; else process.env.APPDATA = previous;
    await rm(directory, { recursive: true, force: true });
  }
});
