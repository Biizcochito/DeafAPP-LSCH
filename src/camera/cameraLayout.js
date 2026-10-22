const DESKTOP_CAMERA = Object.freeze({ maxWidth: 600, aspectRatio: 4 / 3 });
const MOBILE_CAMERA = Object.freeze({ maxWidth: 450, aspectRatio: 9 / 16 });

// Use device signals first: resizing a desktop window must not turn it into
// a phone, and rotating a phone must not select the desktop frame.
export function getWebCameraLayout({
  mobile,
  userAgent = "",
  touchPoints = 0,
  coarsePointer = false,
  screenWidth = 0,
  screenHeight = 0,
  viewportWidth = 0,
  viewportHeight = 0,
} = {}) {
  if (mobile === true || /Android|iPhone|iPad|iPod|IEMobile|Windows Phone|Opera Mini/i.test(userAgent)) {
    return MOBILE_CAMERA;
  }
  // iPadOS can report the desktop Safari user agent.
  if (/Macintosh/i.test(userAgent) && touchPoints > 1) return MOBILE_CAMERA;
  if (mobile === false) return DESKTOP_CAMERA;

  const deviceWidth = screenWidth > 0 ? screenWidth : viewportWidth;
  const deviceHeight = screenHeight > 0 ? screenHeight : viewportHeight;
  const shortSide = Math.min(deviceWidth, deviceHeight);
  return coarsePointer && touchPoints > 0 && shortSide > 0 && shortSide <= 600
    ? MOBILE_CAMERA
    : DESKTOP_CAMERA;
}
