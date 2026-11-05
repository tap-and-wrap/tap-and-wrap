// Display footprints only; these are not physical print dimensions or prices.
export function photoPrintFootprint(aspectRatio, canvasAspect = 1) {
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return { width:.12, height:.16 };
  const width = Math.min(.18, .18 * aspectRatio / canvasAspect);
  return { width, height:width * canvasAspect / aspectRatio };
}
