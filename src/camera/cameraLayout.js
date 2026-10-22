const CAMERA_LAYOUT = Object.freeze({ maxWidth: 450, aspectRatio: 9 / 16 });

// Keep the same portrait frame on desktop and mobile browsers.
export function getWebCameraLayout() {
  return CAMERA_LAYOUT;
}
