// One fitted artwork rectangle is shared by the image and its normalized SVG.
export function fittedArtwork(stageWidth, stageHeight, imageWidth, imageHeight) {
  if (![stageWidth, stageHeight, imageWidth, imageHeight].every(value => Number.isFinite(value) && value > 0)) return null;
  const scale = .9 * Math.min(stageWidth / imageWidth, stageHeight / imageHeight);
  return {width: imageWidth * scale, height: imageHeight * scale};
}

export function artworkPoint(svg, clientX, clientY) {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
  if (![point.x, point.y].every(Number.isFinite)) return null;
  return {x: Math.max(0, Math.min(1, point.x)), y: Math.max(0, Math.min(1, point.y))};
}
