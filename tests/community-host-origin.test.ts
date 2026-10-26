import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, symlink, link, rm } from "node:fs/promises";
import { join } from "node:path";
import { readPrivateCommunityOrigin } from "../lib/community-host-origin.ts";

test("private host origin accepts one server setting and refuses unsafe identity", async () => {
  // A private fixture under cwd, avoiding world-writable /tmp ancestors.
  const folder = await mkdtemp(join(process.cwd(), ".community-origin-fixture-"));
  const path = join(folder, "origin.json"), owner = process.getuid!();
  const valid = JSON.stringify({ COMMUNITY_INTERNAL_ORIGIN: "http://127.0.0.1:19086" }) + "\n";
  try {
    await chmod(folder, 0o700);
    assert.equal(await readPrivateCommunityOrigin(path, owner), null);
    await writeFile(path, valid, { mode: 0o600 });
    assert.equal(await readPrivateCommunityOrigin(path, owner), "http://127.0.0.1:19086");
    await chmod(path, 0o644); await assert.rejects(readPrivateCommunityOrigin(path, owner));
    await chmod(path, 0o600);
    await link(path, join(folder, "hardlink")); await assert.rejects(readPrivateCommunityOrigin(path, owner));
    await rm(join(folder, "hardlink"));
    await symlink(path, join(folder, "symlink")); await assert.rejects(readPrivateCommunityOrigin(join(folder, "symlink"), owner));
    for (const value of [
      { COMMUNITY_INTERNAL_ORIGIN: "https://public.example" },
      { COMMUNITY_INTERNAL_ORIGIN: "http://127.0.0.1:19086", TOKEN: "forbidden" },
      { NEXT_PUBLIC_COMMUNITY_INTERNAL_ORIGIN: "http://127.0.0.1:19086" },
    ]) {
      await writeFile(path, JSON.stringify(value) + "\n");
      await assert.rejects(readPrivateCommunityOrigin(path, owner));
    }
    await writeFile(path, valid + " "); await assert.rejects(readPrivateCommunityOrigin(path, owner));
    await writeFile(path, valid); await chmod(folder, 0o777);
    await assert.rejects(readPrivateCommunityOrigin(path, owner));
  } finally { await rm(folder, { recursive: true, force: true }); }
});
