import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCatalogThumbnailUrl, resolveMediaUrl, resolveResponsiveCatalogThumbnail } from "../lib/media.ts";

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
  const previewUrl = thumbnailUrl.replace("public-catalog-thumbnails/v1/", "public-catalog-thumbnails/v2/");
  assert.equal(resolveCatalogThumbnailUrl({ ...image, previewUrl }), `http://localhost:5000${previewUrl}`);
  assert.equal(resolveCatalogThumbnailUrl({ ...image, previewUrl: `https://other.example${previewUrl}` }), `http://localhost:5000${thumbnailUrl}`);
});

it("uses intrinsic thumbnail widths for both landscape and vertical artwork", () => {
  const assetId = "00000000-0000-0000-0000-000000000001";
  const prefix = "/api/v1/assets/public-catalog-thumbnails/v2/";
  const suffix = assetId + "/" + "a".repeat(64) + ".jpg";
  const previewUrl = prefix + suffix;
  const smallPreviewUrl = prefix + "480/" + suffix;
  const image = { assetId, contentUrl: "/api/v1/assets/" + assetId + "/content", previewUrl, smallPreviewUrl };

  assert.equal(resolveCatalogThumbnailUrl({ ...image, previewUrl: smallPreviewUrl }), "http://localhost:5000" + smallPreviewUrl);
  assert.deepEqual(resolveResponsiveCatalogThumbnail({ ...image, width: 1200, height: 900 }), {
    small: "http://localhost:5000" + smallPreviewUrl,
    srcSet: "http://localhost:5000" + smallPreviewUrl + " 480w, http://localhost:5000" + previewUrl + " 720w",
  });
  assert.deepEqual(resolveResponsiveCatalogThumbnail({ ...image, width: 500, height: 1000 }), {
    small: "http://localhost:5000" + smallPreviewUrl,
    srcSet: "http://localhost:5000" + smallPreviewUrl + " 240w, http://localhost:5000" + previewUrl + " 360w",
  });
  assert.equal(resolveResponsiveCatalogThumbnail({ ...image, width: null, height: 1200 }), null);
  assert.equal(resolveResponsiveCatalogThumbnail({ ...image, width: 460, height: 350 }), null);
  assert.equal(resolveResponsiveCatalogThumbnail({ ...image, width: 1, height: 1200 }), null);
  assert.equal(resolveResponsiveCatalogThumbnail({ ...image, width: 500, height: 1000, smallPreviewUrl: smallPreviewUrl.replace("a".repeat(64), "b".repeat(64)) }), null);
  assert.equal(resolveResponsiveCatalogThumbnail({ ...image, width: 500, height: 1000, smallPreviewUrl: "https://other.example" + smallPreviewUrl }), null);
  assert.equal(resolveResponsiveCatalogThumbnail({ ...image, width: 500, height: 1000, smallPreviewUrl: previewUrl }), null);
});
