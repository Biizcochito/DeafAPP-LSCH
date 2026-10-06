// @ts-nocheck
// DeafApp compatibility patch for expo-camera 57.0.3. Keep native capture unchanged.
import * as React from 'react';
import * as Utils from './WebCameraUtils';
import { FacingModeToCameraType } from './WebConstants';
import { requestUserMediaAsync } from './WebUserMediaManager';

const VALID_SETTINGS_KEYS = [
  'autoFocus', 'flashMode', 'exposureCompensation', 'colorTemperature', 'iso',
  'brightness', 'contrast', 'saturation', 'sharpness', 'focusDistance', 'whiteBalance', 'zoom',
];

const waitForDevice = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// The queue belongs to the module, so a remount also waits for a pending old request.
// getUserMedia cannot be aborted; a stream returned after closing must be stopped.
export function createWebCameraLifecycle({
  requestStream,
  requestFallbackStream,
  stopStream,
  wait = waitForDevice,
  now = Date.now,
  releaseDelayMs = 180,
  retryDelayMs = 500,
}) {
  let pending = Promise.resolve();
  let releasedAt = -Infinity;

  const release = stream => {
    if (!stream) return;
    stopStream(stream);
    releasedAt = now();
  };

  return {
    open({ facing, onStream, onError }) {
      let closed = false;
      let ownedStream = null;
      const close = () => {
        closed = true;
        release(ownedStream);
        ownedStream = null;
      };

      const start = async () => {
        if (closed) return;
        // Also allow the permission probe's stopped track to release the device.
        await wait(Math.max(releaseDelayMs, releasedAt + releaseDelayMs - now()));
        if (closed) return;
        try {
          let nextStream;
          try {
            nextStream = await requestStream(facing);
          } catch (error) {
            if (closed) return;
            const transient = ['NotReadableError', 'AbortError', 'TrackStartError'].includes(error?.name);
            const constrained = ['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error?.name);
            if (!transient && !constrained) throw error;
            await wait(retryDelayMs);
            if (closed) return;
            // Retry startup once. Only discard camera constraints if they failed.
            nextStream = await (constrained ? requestFallbackStream(facing) : requestStream(facing));
          }
          if (closed) {
            release(nextStream);
            return;
          }
          ownedStream = nextStream;
          onStream(nextStream);
        } catch (error) {
          release(ownedStream);
          ownedStream = null;
          if (!closed) onError(error);
        }
      };
      const done = pending.then(start, start);
      pending = done.catch(() => {});
      return { close, done };
    },
  };
}

const lifecycle = createWebCameraLifecycle({
  requestStream: facing => Utils.getPreferredStreamDevice(facing),
  requestFallbackStream: () => requestUserMediaAsync({ audio: false, video: true }),
  stopStream: stream => Utils.stopMediaStream(stream),
});

export function useWebCameraStream(video, preferredType, settings, callbacks) {
  const listeners = React.useRef(callbacks);
  listeners.current = callbacks;
  const capabilities = React.useRef({ autoFocus: 'continuous', flashMode: 'off', whiteBalance: 'continuous', zoom: 0 });
  const [stream, setStream] = React.useState(null);

  const mediaTrackSettings = React.useMemo(() => stream?.getVideoTracks()[0]?.getSettings() ?? null, [stream]);
  const type = React.useMemo(() => {
    if (!mediaTrackSettings) return null;
    return FacingModeToCameraType[mediaTrackSettings.facingMode || 'user'] ?? null;
  }, [mediaTrackSettings]);

  React.useEffect(() => {
    const element = video.current;
    if (!element) return;
    let disposed = false;
    let ready = false;
    let track = null;
    const report = error => {
      if (!disposed) listeners.current.onMountError?.({ nativeEvent: error });
    };
    const ended = () => report({ name: 'NotReadableError', message: 'La cámara dejó de enviar imagen. Pulsa Reiniciar cámara.' });
    const loaded = () => {
      if (disposed || ready || element.readyState < 2 || !element.videoWidth) return;
      ready = true;
      listeners.current.onCameraReady?.();
    };
    const applyCapabilities = () => {
      if (!disposed && element.srcObject) {
        Utils.syncTrackCapabilities(preferredType, element.srcObject, capabilities.current);
      }
    };
    element.addEventListener('loadeddata', loaded);
    element.addEventListener('playing', loaded);
    element.addEventListener('loadedmetadata', applyCapabilities);
    setStream(null);
    const session = lifecycle.open({
      facing: preferredType,
      onStream(nextStream) {
        if (disposed) return;
        track = nextStream.getVideoTracks()[0];
        track?.addEventListener('ended', ended);
        Utils.setVideoSource(element, nextStream);
        setStream(nextStream);
        const playback = element.play();
        playback?.catch(error => {
          if (disposed || error?.name === 'AbortError') return;
          session.close();
          Utils.setVideoSource(element, null);
          setStream(null);
          report(error);
        });
        loaded();
      },
      onError: report,
    });
    return () => {
      disposed = true;
      element.removeEventListener('loadeddata', loaded);
      element.removeEventListener('playing', loaded);
      element.removeEventListener('loadedmetadata', applyCapabilities);
      track?.removeEventListener('ended', ended);
      Utils.setVideoSource(element, null);
      session.close();
    };
  }, [video, preferredType]);

  React.useEffect(() => {
    const changes = {};
    for (const key of VALID_SETTINGS_KEYS) {
      if (key in settings && settings[key] !== capabilities.current[key]) changes[key] = settings[key];
    }
    capabilities.current = { ...capabilities.current, ...changes };
    if (stream && Object.keys(changes).length) Utils.syncTrackCapabilities(preferredType, stream, changes);
  }, [stream, preferredType, ...VALID_SETTINGS_KEYS.map(key => settings[key])]);

  return { type, mediaTrackSettings };
}
