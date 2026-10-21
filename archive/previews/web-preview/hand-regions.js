/* Geometry only. Points are always supplied by the trained hand model. */
self.HandRegions = (() => {
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  function seeds(face, width, height, phase = 0) {
    const ratio = width / height;
    const span = face ? clamp(face.height / ratio * 1.45, .28, .68) : .55;
    const cx = face?.x ?? .45;
    const offset = face ? face.width * .8 : .25;
    const y = face ? clamp(face.y + face.height * .45, .3, .84) : .72;
    const size = phase % 3 === 1 ? span * .72 : span;
    const cy = phase % 3 === 2 ? clamp(y - span * .55, .2, .75) : y;
    return [-1, 1].map(side => ({ xCenter: clamp(cx + side * offset, .1, .9), yCenter: cy, width: size, height: size * ratio, rotation: 0 }));
  }
  function valid(hand) {
    return hand?.handScore >= .8 && hand.landmarks?.length === 21 &&
      hand.landmarks.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z));
  }
  function duplicate(a, b) {
    if (!a || !b) return false;
    const distance = [0,5,9,13,17].reduce((sum,i) => sum + Math.hypot(a[i].x-b[i].x,a[i].y-b[i].y),0)/5;
    const span = Math.max(Math.hypot(a[5].x-a[17].x,a[5].y-a[17].y),Math.hypot(b[5].x-b[17].x,b[5].y-b[17].y));
    return distance < Math.max(.018, span * .3);
  }
  return { seeds, valid, duplicate };
})();
