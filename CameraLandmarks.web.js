import { useEffect, useRef } from "react";
import { warmSignTracking, drawSignLandmarks } from "./landmarkTracking";
import { freshLandmarks, landmarkViewport, withTrackingTimeout } from "./trackingOverlay";
import { cameraFrameReady } from "./recordingHandGuard";

export default function CameraLandmarks({ cameraContainerRef, enabled, onStatus, onTracking }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { alpha: false });
    let cancelled = false;
    let raf;
    let tracker;
    let results = {};
    let lastStatus = "";
    let startupError = "";
    const sessionStart = performance.now();
    const channels = {
      face: { busy: false, ready: false, lastTime: -1, next: 0 },
      hands: { busy: false, ready: false, lastTime: -1, next: 0 },
    };
    const status = message => {
      if (!cancelled && message !== lastStatus) { lastStatus = message; onStatus(message); }
    };
    const clear = () => ctx.clearRect(0, 0, canvas.width, canvas.height);

    function send(channelName, video, now) {
      const channel = channels[channelName];
      if (channel.busy || channel.error || channel.lastTime === video.currentTime || now < channel.next) return;
      channel.busy = true;
      channel.lastTime = video.currentTime;
      const job = channelName === "face" ? tracker.sendFace({ image: video }) : tracker.sendHands({ image: video });
      withTrackingTimeout(job, channel.ready ? 10000 : 45000).then(() => {
        channel.ready = true;
      }).catch(error => {
        channel.error = error.message || "No se pudo iniciar el detector.";
        console.warn(`Trazado (${channelName}):`, error);
      }).finally(() => {
        channel.busy = false;
        channel.next = performance.now() + (channelName === "hands" ? 0 : 33);
      });
    }

    function frame(now) {
      if (cancelled) return;
      try {
      const video = cameraContainerRef.current?.querySelector("video");
      if (cameraFrameReady(video)) {
        const box = cameraContainerRef.current.getBoundingClientRect();
        const bounds = video.getBoundingClientRect();
        const css = window.getComputedStyle(video);
        const width = Math.round(bounds.width);
        const height = Math.round(bounds.height);
        Object.assign(canvas.style, {
          left: `${bounds.left - box.left}px`, top: `${bounds.top - box.top}px`,
          width: `${bounds.width}px`, height: `${bounds.height}px`,
        });
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        const fresh = freshLandmarks(results, now);
        onTracking?.(enabled ? {
          ...fresh, enabled: true, sourceWidth: video.videoWidth, sourceHeight: video.videoHeight,
          handStatus: startupError || channels.hands.error ? "error" : !tracker || !channels.hands.ready ? "loading" : "ready",
        } : { enabled: false, handStatus: "disabled" });
        const viewport = landmarkViewport(video.videoWidth, video.videoHeight, width, height, css);
        clear();
        ctx.save();
        if (viewport.mirrored) { ctx.translate(width, 0); ctx.scale(-1, 1); }
        ctx.translate(viewport.x, viewport.y);
        ctx.scale(viewport.drawWidth / width, viewport.drawHeight / height);
        // Paint the real camera frame and its marks in the same 2D surface.
        // This avoids black accelerated <video> layers beneath the overlay.
        ctx.drawImage(video, 0, 0, width, height);
        if (enabled) drawSignLandmarks(ctx, fresh);
        ctx.restore();
        canvas.dataset.facePoints = String(fresh.faceLandmarks?.length || 0);
        canvas.dataset.leftHandPoints = String(fresh.leftHandLandmarks?.length || 0);
        canvas.dataset.rightHandPoints = String(fresh.rightHandLandmarks?.length || 0);
        canvas.dataset.faceTime = String(results.faceTime || 0);
        canvas.dataset.handTime = String(results.handTime || 0);
        canvas.dataset.faceLatency = String(Math.round(results.faceLatency || 0));
        canvas.dataset.handLatency = String(Math.round(results.handLatency || 0));
        canvas.dataset.handBackend = results.handBackend || 'loading';
        const faceStatus = channels.face.error ? `Cara: ${channels.face.error}` : !channels.face.ready ? "Iniciando cara…" : fresh.faceLandmarks?.length ? "Cara detectada" : "Buscando cara";
        const handStatus = channels.hands.error ? `Manos: ${channels.hands.error}` : !channels.hands.ready ? "Iniciando manos…" : `Izquierda: ${fresh.leftHandLandmarks?.length ? "detectada" : "buscando"} · Derecha: ${fresh.rightHandLandmarks?.length ? "detectada" : "buscando"}`;
        if (enabled) {
          status(startupError || (tracker ? `${faceStatus} · ${handStatus}` : "Preparando detectores de cara y manos…"));
          if (tracker) { send("hands", video, now); send("face", video, now); }
        }
      } else {
        clear();
        onTracking?.({ enabled: false, handStatus: "camera" });
        status("Esperando imagen de la cámara…");
      }
      } catch (error) {
        clear();
        onTracking?.({ enabled: false, handStatus: "error" });
        status("No se pudo dibujar el trazado. Recarga la página para reintentar.");
        console.warn("Dibujo del trazado:", error);
      } finally {
        if (!cancelled) raf = requestAnimationFrame(frame);
      }
    }

    async function start() {
      if (!enabled) return;
      try {
        status("Descargando detectores de cara y manos…");
        onTracking?.({ enabled: true, handStatus: "loading" });
        tracker = await warmSignTracking();
        if (cancelled) return;
        tracker.onResults(value => {
          if (!cancelled) results = {
            ...value,
            leftHandLandmarks: value.handTime >= sessionStart ? value.leftHandLandmarks : undefined,
            rightHandLandmarks: value.handTime >= sessionStart ? value.rightHandLandmarks : undefined,
          };
        });
      } catch (error) {
        clear();
        onTracking?.({ enabled: false, handStatus: "error" });
        startupError = error.message || "No se pudo cargar el trazado. Vuelve a activarlo para reintentar.";
        status(startupError);
      }
    }
    raf = requestAnimationFrame(frame);
    start();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      clear();
      onTracking?.({ enabled: false, handStatus: "disabled" });
      tracker?.onResults(() => {});
    };
  }, [cameraContainerRef, enabled, onStatus, onTracking]);

  return <canvas ref={canvasRef} aria-label="Vista de la cámara y trazado" data-tracker="face-mesh-hands" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 1 }} />;
}
