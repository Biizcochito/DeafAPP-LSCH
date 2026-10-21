export function withTrackingTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("El detector tardó demasiado. Recarga la página para reintentar.")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

export function freshLandmarks(results, now) {
  return {
    ...results,
    faceLandmarks: now - results.faceTime <= 600 ? results.faceLandmarks : undefined,
    leftHandLandmarks: now - results.handTime <= 600 ? results.leftHandLandmarks : undefined,
    rightHandLandmarks: now - results.handTime <= 600 ? results.rightHandLandmarks : undefined,
  };
}

// Match the actual video crop in display pixels. Mirror drawing coordinates
// explicitly, instead of relying on a canvas object's CSS object-fit.
export function landmarkViewport(sourceWidth, sourceHeight, width, height, css) {
  const scale = css.objectFit === "contain"
    ? Math.min(width / sourceWidth, height / sourceHeight)
    : Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  const position = (css.objectPosition || "50% 50%").split(/\s+/);
  const fraction = value => value?.endsWith("%") ? parseFloat(value) / 100 : 0.5;
  return {
    drawWidth, drawHeight,
    x: (width - drawWidth) * fraction(position[0]),
    y: (height - drawHeight) * fraction(position[1]),
    mirrored: /^matrix\(\s*-/.test(css.transform || "") || css.transform === "scaleX(-1)",
  };
}
