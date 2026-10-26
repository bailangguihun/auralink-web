// Server-only adapter for the installed c5ea launcher's env -i boundary.
// Never import this module into client components or expose it in next.config.
import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { communityOrigin } from "./community-proxy.ts";

export const COMMUNITY_ORIGIN_FILE = "/root/autodl-tmp/auralink-web-deploy/runtime/community-origin.json";

export async function readPrivateCommunityOrigin(path: string, ownerUid = 0): Promise<string | null> {
  if (path !== resolve(path)) throw new Error("Community configuration path is not canonical");
  for (let parent = dirname(path); parent !== "/"; parent = dirname(parent)) {
    const info = await lstat(parent);
    if (!info.isDirectory() || info.isSymbolicLink() || (info.mode & 0o022)) throw new Error("Unsafe Community configuration directory");
  }
  let file;
  try { file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  try {
    const info = await file.stat();
    if (!info.isFile() || info.uid !== ownerUid || info.gid !== ownerUid || (info.mode & 0o777) !== 0o600 || info.nlink !== 1 || info.size > 512) {
      throw new Error("Invalid private Community configuration");
    }
    const raw = await file.readFile("utf8"), value = JSON.parse(raw) as Record<string, unknown>;
    if (Object.keys(value).length !== 1 || typeof value.COMMUNITY_INTERNAL_ORIGIN !== "string") throw new Error("Invalid Community settings scope");
    if (raw !== JSON.stringify({ COMMUNITY_INTERNAL_ORIGIN: value.COMMUNITY_INTERNAL_ORIGIN }) + "\n") throw new Error("Noncanonical Community settings");
    const after = await file.stat();
    if (after.ino !== info.ino || after.size !== info.size || after.mtimeMs !== info.mtimeMs || after.ctimeMs !== info.ctimeMs) throw new Error("Community settings changed while reading");
    return communityOrigin(value.COMMUNITY_INTERNAL_ORIGIN);
  } finally { await file.close(); }
}

export async function configuredCommunityOrigin(): Promise<string | null> {
  // Existing explicit server environment remains useful in isolated fixtures.
  // Production env -i uses only this one private setting, without changing the
  // accepted launcher, its hashes or any public build-time configuration.
  if (process.env.COMMUNITY_INTERNAL_ORIGIN !== undefined) return communityOrigin(process.env.COMMUNITY_INTERNAL_ORIGIN);
  return readPrivateCommunityOrigin(COMMUNITY_ORIGIN_FILE);
}
