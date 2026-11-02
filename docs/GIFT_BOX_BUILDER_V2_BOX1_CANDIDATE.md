# BOX-1 conservative alpha candidate — Phase 4

28 October 2026. A separate candidate was prepared under the owner's Phase 4 authorization. Approval remains pending. The original source image, its immutable component identity, the authoritative asset manifest, the builder mapping and the existing asset issue were not changed.

## Candidate and evidence

All outputs are local-only and Git-ignored under:

`server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/`

- [Candidate PNG](../server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/box-1-open-top-alpha-rgb-candidate-v1.png)
- [Light/dark/checkerboard comparison sheet](../server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/box-1-review-alpha-rgb-candidate-v1.png)
- [Exact pixel-comparison report](../server/.cache/gift-box-phase4/box-1-candidate/alpha-rgb-candidate-v1/pixel-comparison-alpha-rgb-candidate-v1.json)
- Six full-resolution preview files, `box-1-{original|candidate}-{light|dark|checkerboard}-alpha-rgb-candidate-v1.png`.

The candidate is **1453 × 1083**, PNG, **809,452 bytes**. PNG was chosen to preserve the corrected RGBA data exactly. No WebP candidate or lossy re-encoding was introduced.

| Identity | SHA-256 |
| --- | --- |
| Unchanged original `boxes/box-1-open-top.webp` | `8d0944c0d98ffa3e685c56863316c3163398d88e06c1cc572d5ec7d81544b55d` |
| Original decoded sRGB RGBA | `a9b84ed3cbb832a68dd1b3bb8edcd462cd04f808a1134213afbc5b7e598ddd92` |
| Candidate PNG | `0a0477ba1be45bb1a4253f23c5709cc60b5ddd9f74be1a26c2bac0ddebd364e6` |
| Candidate decoded sRGB RGBA | `108d6035f5536390d7387d083fb694969458f7e8aedc7ed2fd49d6f37b8efbe1` |

## Pixel operation and verification

The command first verifies the source's byte hash, decoded pixel hash, dimensions, format and alpha against a fixed original pin and the authoritative manifest entry. It reads the image as sRGB RGBA. For a pixel whose alpha equals **zero**, only its three RGB bytes are set to zero. Every other pixel's four bytes are copied unchanged. There is no masking, edge repainting, cropping, resizing, smoothing or generative editing of the candidate.

After lossless PNG encoding, the tool decodes the PNG and requires equality with the complete corrected RGBA buffer before accepting the candidate.

| Comparison | Result |
| --- | ---: |
| Total pixels | 1,573,599 |
| Alpha-zero source pixels | 755,843 |
| Nonzero-alpha source pixels, all unchanged | 817,756 |
| Partially transparent source pixels, all unchanged | 9,643 |
| Pixels whose hidden RGB was cleared | 96,750 |
| Changed RGB channels | 185,733 |
| Alpha changes | **0** |
| Changes to visible/partial RGBA pixels | **0** |
| Remaining nonzero RGB at alpha zero | **0** |
| Hidden RGB pixels in right strip, before → after | **44,049 → 0** |

The composited RGB pixels are identical before and after on light, dark and checkerboard backgrounds. The report records pairwise composited pixel hashes and preview-file hashes. This confirms that the operation removes hidden data without altering correctly composited appearance. Direct inspection of the candidate also no longer shows the original horizontal hidden-color remnants in the native transparent preview.

The original file was re-read after generation and its byte hash still matches the pin. The candidate and comparison sheet were inspected locally. The preparation command was run twice successfully; existing byte-identical outputs were reused. Different existing output content is refused rather than overwritten.

## Tooling and safety

Created source files:

- `server/scripts/lib/box-1-candidate.js` — pure RGBA correction, comparison, pin checks, exact PNG round-trip and preview generation.
- `server/scripts/prepare-box-1-candidate.js` — fixed offline CLI; accepts no source/output/approval/upload arguments.
- `server/test/gift-box-box1-candidate.test.js` — six focused synthetic pixel-invariant tests.
- `docs/GIFT_BOX_BUILDER_V2_BOX1_CANDIDATE.md` — this review record.

Run from `server/`:

```powershell
node scripts/prepare-box-1-candidate.js
node scripts/run-tests.js test/gift-box-box1-candidate.test.js
```

Both candidate source access and output directories use the existing ancestor/junction checks. Outputs use exclusive creation and refuse different-content overwrites. There is no runtime application configuration, database, storage provider, upload or production URL in this workflow. SVG labels emitted a system font-cache warning but rendered successfully; all image decoding, pixel comparisons and writes passed.

All six focused tests passed: exact alpha-zero-only changes, unchanged input/visible/partial pixels, idempotency, deliberate invariant violation detection, identical compositing across all three backgrounds, invalid raw buffer rejection, and pinned lossless PNG round-trip. JavaScript syntax checks passed for both new tooling modules.

## Remaining approval

The candidate is **not production-approved** and does not clear `box-1-right-edge-remnants`. It is not registered as builder artwork, served through the development media allowlist, placed in the public directory or uploaded to R2. Physical placement geometry remains unreviewed independently of the alpha correction.

The owner must review the candidate and edge appearance on the provided backgrounds. A future explicitly approved asset update can then retain `box-1`'s component identity while recording the new reviewed artwork under a new versioned manifest. Keep the old original for historical identity. No such manifest or media activation action was performed here.
