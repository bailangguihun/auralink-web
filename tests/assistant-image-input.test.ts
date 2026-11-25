import assert from 'node:assert/strict';
import { test } from 'node:test';
import { assistantImageFile, isAssistantImageInput } from '../lib/assistant-image-input.ts';

test('JPEG with missing or nonstandard MIME keeps its bytes and receives a canonical MIME', async () => {
  const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]);
  for (const type of ['', 'image/jpg', 'application/octet-stream']) {
    const original = new File([bytes], 'sample.JPG', { type });
    assert.ok(isAssistantImageInput(original));
    const upload = await assistantImageFile(original, original.name);
    assert.equal(upload.name, 'sample.JPG');
    assert.equal(upload.type, 'image/jpeg');
    assert.deepEqual(new Uint8Array(await upload.arrayBuffer()), bytes);
  }
  const jfif = new File([bytes], 'sample.jfif', { type: 'image/jpeg' });
  assert.equal((await assistantImageFile(jfif, jfif.name)).name, 'sample.jpg');
});

test('an image filename or MIME does not allow unsupported content', async () => {
  const invalid = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'sample.jpg', { type: 'image/jpeg' });
  await assert.rejects(assistantImageFile(invalid, invalid.name), /请选择有效的/);
  await assert.rejects(assistantImageFile(new Blob(), 'empty.jpg'), /文件为空/);
  await assert.rejects(assistantImageFile(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), 'large.jpg'), /10 MiB/);
});
