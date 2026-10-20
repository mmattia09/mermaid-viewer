import { test, expect } from 'bun:test';
import { mkdtemp, writeFile, symlink, unlink, rm, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFileAccess } from '../server/files.ts';

test('file authorization is repeated after replacement with a symlink outside its root', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(),'viewer-root-')));
  const outside = await mkdtemp(join(tmpdir(),'viewer-outside-'));
  const file = join(root,'diagram.mmd');
  const target = join(outside,'diagram.mmd');
  const access = createFileAccess([root]);
  try {
    await writeFile(file,'flowchart TD\n A-->B');
    await writeFile(target,'outside');
    expect((await access.openFile(file)).text).toContain('flowchart');
    await unlink(file); await symlink(target,file);
    await expect(access.openFile(file)).rejects.toThrow('file non consentito');
  } finally { await rm(root,{recursive:true,force:true}); await rm(outside,{recursive:true,force:true}); }
});
