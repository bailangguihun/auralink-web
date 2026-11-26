import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCatalogThumbnailUrl, resolveMediaUrl } from "../lib/media.ts";

describe("resolveMediaUrl", () => {
  it("resolves only logical MediaAsset content and download URLs", () => {
    const id = "00000000-0000-0000-0000-000000000001";
    assert.equal(resolveMediaUrl(`/api/v1/assets/${id}/content`),
      `http://localhost:5000/api/v1/assets/${id}/content`,
    );
    assert.equal(resolveMediaUrl(`/api/v1/assets/${id}/download`),
      `http://localhost:5000/api/v1/assets/${id}/download`,
    );
  });

  it("rejects absolute, provider, filesystem, and malformed values", () => {
    assert.equal(resolveMediaUrl("https://provider.example/image.jpg"), null);
    assert.equal(resolveMediaUrl("/srv/auralink/image.jpg"), null);
    assert.equal(resolveMediaUrl("/api/files/legacy.jpg"), null);
    assert.equal(resolveMediaUrl("/api/v1/assets/not-a-uuid/content"), null);
  });
});

it("resolves only a versioned thumbnail belonging to the same logical catalog image", () => {
  const id = "00000000-0000-0000-0000-000000000001";
  const thumbnailUrl = `/api/v1/assets/public-catalog-thumbnails/v1/${id}/${"a".repeat(64)}.jpg`;
  const image = { assetId: id, contentUrl: `/api/v1/assets/${id}/content`, thumbnailUrl };
  assert.equal(resolveCatalogThumbnailUrl(image), `http://localhost:5000${thumbnailUrl}`);
  assert.equal(resolveCatalogThumbnailUrl({ ...image, assetId: "00000000-0000-0000-0000-000000000002" }), null);
  assert.equal(resolveCatalogThumbnailUrl({ ...image, thumbnailUrl: `${thumbnailUrl}?override=1` }), null);
  assert.equal(resolveCatalogThumbnailUrl({ ...image, thumbnailUrl: `https://other.example${thumbnailUrl}` }), null);
  assert.equal(resolveCatalogThumbnailUrl({ ...image, contentUrl: `/api/v1/assets/${id}/download` }), null);
  assert.equal(resolveMediaUrl(thumbnailUrl), null);
});
