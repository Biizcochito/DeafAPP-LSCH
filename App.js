/**
 * DeafApp — Recopilación de señas LSCh
 * Dataset completo con todas las categorías + feedback
 */

import { useState, useRef, useEffect, useCallback } from "react";
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, SafeAreaView, Dimensions, Image,
  ActivityIndicator, StatusBar, Animated, TextInput,
  Platform, useWindowDimensions,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { cameraStartupMessage } from "./cameraStartup";
import { createClient } from "@supabase/supabase-js";
import CameraLandmarks from "./CameraLandmarks";
import { warmSignTracking } from "./landmarkTracking";
import { handsReadyForRecording, hasTrackedHand, captureTrackedFrames, prepareTrackedRecording, cameraFrameReady } from "./recordingHandGuard";
import { createGestureGate, assertGestureAllowed, BLOCKED_GESTURE_MESSAGE } from "./gestureModeration";
import { getWebCameraLayout } from "./cameraLayout";
import { recordingDraftStore } from "./recordingDraftStore";
import { createRecordingDraft, isRecordingDraft, submitRecordingDraft, createTimedFetch, withRecordingSendLock } from "./recordingSubmission";
import { CATEGORIAS } from "./signCatalog";
import { createTrainingCapture, captureTrackingSample, makeParticipantId } from "./trainingCapture";
import { useRecordingSource } from "./RecordingProfiles";
import AdminPanel from "./AdminPanel";
import { createHiddenAdminEntry } from "./adminAccess";

const { width, height } = Dimensions.get("window");

if (typeof document !== "undefined") {
  document.body.style.backgroundColor = "#0F0F1E";
  document.body.style.margin = "0";
  document.documentElement.style.backgroundColor = "#0F0F1E";
  const style = document.createElement("style");
  style.textContent = `::-webkit-scrollbar { width: 8px; } ::-webkit-scrollbar-track { background: #1A1A2E; } ::-webkit-scrollbar-thumb { background: #E94560; border-radius: 4px; }`;
  document.head.appendChild(style);

  // Logo/ícono de la pestaña del navegador
  document.title = "DeafApp 🤟";
  const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#0F0F1E"/><text x="50%" y="58%" font-size="55" text-anchor="middle" dominant-baseline="middle">🤟</text></svg>`;
  let favicon = document.querySelector("link[rel='icon']");
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    document.head.appendChild(favicon);
  }
  favicon.href = `data:image/svg+xml,${encodeURIComponent(faviconSvg)}`;
}


const SUPABASE_URL = "https://didlffnluqqurelgnqdp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZGxmZm5sdXFxdXJlbGducWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDMwNTYsImV4cCI6MjA5OTk3OTA1Nn0.G6MqUFXNJleUTBtZu7kQb58E-rGWk3w-rLbvRu6xOVE";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: createTimedFetch(fetch.bind(globalThis)) } });

// Algunos navegadores (sobre todo la cámara en versión web) ya devuelven el base64
// con el prefijo "data:image/..." incluido. Esta función evita duplicarlo.
function armarDataUri(base64Frame) {
  if (!base64Frame) return "";
  return base64Frame.startsWith("data:") ? base64Frame : `data:image/jpeg;base64,${base64Frame}`;
}

const META_POR_SEÑA = 15;
const TOTAL_FRAMES  = 30;
const FPS_INTERVALO = 100;



const colorProgreso = (n) => {
  if (n === 0)                  return "#555";
  if (n < META_POR_SEÑA * 0.3) return "#E74C3C";
  if (n < META_POR_SEÑA * 0.7) return "#F39C12";
  return "#27AE60";
};

function CategoriaCard({ cat, conteos, onPress }) {
  const listas = cat.señas.filter(s => (conteos[s] || 0) >= META_POR_SEÑA).length;
  const pct    = cat.señas.length > 0 ? listas / cat.señas.length : 0;
  return (
    <TouchableOpacity style={[styles.catCard, { borderColor: cat.color }]} onPress={onPress}>
      <Text style={styles.catEmoji}>{cat.emoji}</Text>
      <Text style={styles.catNombre}>{cat.nombre}</Text>
      <View style={styles.barraFondo}>
        <View style={[styles.barraRelleno, { width: `${pct * 100}%`, backgroundColor: cat.color }]} />
      </View>
      <Text style={styles.catProgreso}>{listas}/{cat.señas.length} listas</Text>
    </TouchableOpacity>
  );
}

function SignaRow({ seña, conteo, onGrabar }) {
  const n   = conteo || 0;
  const pct = Math.min(n / META_POR_SEÑA, 1);
  const col = colorProgreso(n);
  return (
    <View style={styles.señaFila}>
      <View style={styles.señaInfo}>
        <Text style={styles.señaNombre}>{seña}</Text>
        <View style={styles.barraFondo}>
          <View style={[styles.barraRelleno, { width: `${pct * 100}%`, backgroundColor: col }]} />
        </View>
        <Text style={[styles.señaConteo, { color: col }]}>{n}/{META_POR_SEÑA}</Text>
      </View>
      <TouchableOpacity
        style={[styles.btnGrabar, n >= META_POR_SEÑA && styles.btnGrabarListo]}
        onPress={onGrabar}
      >
        <Text style={styles.btnGrabarTexto}>{n >= META_POR_SEÑA ? "✓" : "⊙"}</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function App() {
  const origenGrabacion = useRecordingSource();
  const sesionDatosRef = useRef(null);
  if (!sesionDatosRef.current) sesionDatosRef.current = makeParticipantId();
  const viewport = useWindowDimensions();
  const estiloCamaraWeb = Platform.OS === "web" ? getWebCameraLayout({
    mobile: typeof navigator !== "undefined" ? navigator.userAgentData?.mobile : undefined,
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    touchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
    coarsePointer: typeof window !== "undefined" && !!window.matchMedia?.("(pointer: coarse)").matches,
    screenWidth: typeof window !== "undefined" ? window.screen?.width : 0,
    screenHeight: typeof window !== "undefined" ? window.screen?.height : 0,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
  }) : undefined;
  const [permission, requestPermission] = useCameraPermissions();
  const [pantalla,   setPantalla]   = useState("bienvenida");
  const entradaAdminRef = useRef(null);
  if (!entradaAdminRef.current) entradaAdminRef.current = createHiddenAdminEntry();
  const pulsarLogo = () => {
    if (entradaAdminRef.current.press(Date.now())) setPantalla("admin");
  };
  const [progresoAbierto, setProgresoAbierto] = useState(false);
  const [catActual,  setCatActual]  = useState(null);
  const [señaActual, setSeñaActual] = useState(null);
  const [conteos,    setConteos]    = useState({});
  const [countdown,  setCountdown]  = useState(null);
  const [preparando, setPreparando] = useState(false);
  const [camaraSesion, setCamaraSesion] = useState(0);
  const [capturando, setCapturando] = useState(false);
  const [subiendo,   setSubiendo]   = useState(false);
  const [progreso,   setProgreso]   = useState(0);
  const [exito,      setExito]      = useState(false);
  const [error,      setError]      = useState(null);
  const [borrador, setBorrador] = useState(null);
  const borradorRef = useRef(null);
  const enviandoRef = useRef(false);
  const [borradorRecuperado, setBorradorRecuperado] = useState(false);
  const [guardadoLocal, setGuardadoLocal] = useState(false);
  const [mensajeLocal, setMensajeLocal] = useState("");
  const [envioFallido, setEnvioFallido] = useState(false);
  const [repitiendo, setRepitiendo] = useState(false);
  const [fotogramaVista, setFotogramaVista] = useState(0);
  const [reproduciendo, setReproduciendo] = useState(true);
  const [trazadoActivo, setTrazadoActivo] = useState(true);
  const [estadoTrazado, setEstadoTrazado] = useState("Cargando trazado de cara y manos…");
  const [estadoManos, setEstadoManos] = useState({ phase: "loading", left: false, right: false });
  const [ayudaManos, setAyudaManos] = useState("");
  const [manosConfirmadas, setManosConfirmadas] = useState(false);
  const [gestoBloqueado, setGestoBloqueado] = useState(false);
  const filtroGestosRef = useRef(null);
  if (!filtroGestosRef.current) filtroGestosRef.current = createGestureGate();
  const gestoBloqueadoRef = useRef(false);
  const gestoEnGrabacionRef = useRef(false);
  const estadoManosClaveRef = useRef("");
  const contenedorCamaraRef = useRef(null);
  const ultimaDeteccionRef = useRef({ enabled: false });
  const grabacionEnCursoRef = useRef(false);
  const grabacionInvalidaRef = useRef(false);
  const vigilarCapturaRef = useRef(false);
  const grabacionSesionRef = useRef(0);
  const actualizarTrazado = useCallback(tracking => {
    ultimaDeteccionRef.current = tracking;
    const { blocked } = filtroGestosRef.current.update(tracking, performance.now());
    if (blocked !== gestoBloqueadoRef.current) {
      gestoBloqueadoRef.current = blocked;
      setGestoBloqueado(blocked);
    }
    if (grabacionEnCursoRef.current && blocked) gestoEnGrabacionRef.current = true;
    const ready = handsReadyForRecording(tracking, performance.now(), 1);
    if (vigilarCapturaRef.current && !ready) grabacionInvalidaRef.current = true;
    const phase = tracking.handStatus || "disabled";
    const left = ready && hasTrackedHand(tracking.leftHandLandmarks);
    const right = ready && hasTrackedHand(tracking.rightHandLandmarks);
    const key = `${phase}:${left}:${right}`;
    if (key !== estadoManosClaveRef.current) {
      estadoManosClaveRef.current = key;
      setEstadoManos({ phase, left, right });
    }
  }, []);
  useEffect(() => {
    filtroGestosRef.current.reset();
    gestoBloqueadoRef.current = false;
    setGestoBloqueado(false);
  }, [pantalla, camaraSesion]);
  useEffect(() => {
    setAyudaManos("");
    if (estadoManos.phase === "loading") {
      setAyudaManos("La primera detección de manos puede tardar un poco. Mantén las manos frente a la cámara mientras preparamos el trazado.");
      return;
    }
    if (estadoManos.phase !== "ready") return;
    const { left, right } = estadoManos;
    let message = "";
    if (manosConfirmadas) {
      if (!left && !right) message = "No vemos ninguna mano. Vuelve a mostrar al menos una dentro del encuadre para continuar.";
    } else if (left && !right) {
      message = "No vemos tu mano derecha. Sácala un momento del encuadre y vuelve a mostrarla frente a la cámara, con buena luz y los dedos visibles.";
    } else if (right && !left) {
      message = "No vemos tu mano izquierda. Sácala un momento del encuadre y vuelve a mostrarla frente a la cámara, con buena luz y los dedos visibles.";
    } else if (!left && !right) {
      message = "Aún no vemos tus manos. Muéstralas separadas y con buena luz. Si no aparecen los puntos, sácalas un momento del encuadre y vuelve a mostrarlas.";
    }
    // Brief gaps while moving must not flash advice or interrupt the sign.
    if (message) {
      const timer = setTimeout(() => setAyudaManos(message), 1200);
      return () => clearTimeout(timer);
    }
  }, [estadoManos, manosConfirmadas]);
  useEffect(() => {
    if (Platform.OS === "web" && permission?.granted) {
      warmSignTracking().catch(error => console.warn("Preparación del trazado:", error));
    }
  }, [permission?.granted]);

  // Feedback
  const [tipoFeedback,    setTipoFeedback]    = useState("sugerencia");
  const [mensajeFeedback, setMensajeFeedback] = useState("");
  const [enviandoFeedback,setEnviandoFeedback]= useState(false);
  const [exitoFeedback,   setExitoFeedback]   = useState(false);

  // Revisión comunitaria

  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    let vigente = true;
    recordingDraftStore.load().then(async draft => {
      if (!vigente || !draft) return;
      const category = CATEGORIAS.find(c => c.id === draft.category);
      if (!isRecordingDraft(draft) || !category?.señas.includes(draft.label)) {
        throw new Error("No se pudo recuperar la grabación pendiente.");
      }
      if (draft.submitted) { await recordingDraftStore.remove(draft.id); return; }
      borradorRef.current = draft;
      setBorrador(draft);
      setGuardadoLocal(true);
    }).catch(() => {
      if (vigente) setMensajeLocal("No se pudo revisar el guardado local de este dispositivo.");
    }).finally(() => { if (vigente) setBorradorRecuperado(true); });
    return () => { vigente = false; };
  }, []);

  useEffect(() => {
    if (pantalla !== "vistaPrevia" || !borrador || !reproduciendo || subiendo) return;
    const timer = setInterval(() => {
      setFotogramaVista(frame => (frame + 1) % borrador.frames.length);
    }, borrador.intervalMs);
    return () => clearInterval(timer);
  }, [pantalla, borrador?.id, reproduciendo, subiendo]);

  const guardarBorradorLocal = async draft => {
    try {
      await recordingDraftStore.save(draft);
      setGuardadoLocal(true);
      setMensajeLocal("");
    } catch {
      setGuardadoLocal(false);
      setMensajeLocal("No pudimos guardar una copia local. Mantén esta página abierta para revisar o reintentar el envío.");
    }
  };

  const mostrarVistaPrevia = (draft = borradorRef.current) => {
    if (!draft) return;
    setCatActual(CATEGORIAS.find(c => c.id === draft.category));
    setSeñaActual(draft.label);
    setRepitiendo(false);
    setFotogramaVista(0);
    setReproduciendo(true);
    setExito(false);
    setError(null);
    setPantalla("vistaPrevia");
  };

  const abrirGrabacion = seña => {
    if (borradorRef.current) { mostrarVistaPrevia(); return; }
    setSeñaActual(seña);
    setExito(false);
    setError(null);
    setProgreso(0);
    setRepitiendo(false);
    setPantalla("grabar");
  };

  useEffect(() => {
    cargarConteos();
    const intervalo = setInterval(cargarConteos, 30000);
    return () => clearInterval(intervalo);
  }, []);

  useEffect(() => {
    if (capturando) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.4, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [capturando]);

  const cargarConteos = async () => {
    try {
      const { data } = await supabase.from("grabaciones").select("label").eq("aprobada", true);
      if (data) {
        const c = {};
        data.forEach(r => { c[r.label] = (c[r.label] || 0) + 1; });
        setConteos(c);
      }
    } catch (e) { console.log("Error conteos:", e); }
  };

  const enviarFeedback = async () => {
    if (!mensajeFeedback.trim()) return;
    setEnviandoFeedback(true);
    try {
      await supabase.from("feedback").insert({
        tipo:    tipoFeedback,
        mensaje: mensajeFeedback.trim(),
      });
      setExitoFeedback(true);
      setMensajeFeedback("");
      setTimeout(() => setExitoFeedback(false), 3000);
    } catch (e) {
      console.log("Error feedback:", e);
    }
    setEnviandoFeedback(false);
  };

  // Revisa si un fotograma está casi todo negro (cámara no detectada a tiempo).
  // Solo funciona en la versión web (usa canvas del navegador); en apps nativas se omite.
  const fotogramaEsNegro = (base64Frame) => {
    return new Promise((resolve) => {
      if (typeof document === "undefined") { resolve(false); return; }
      try {
        const img = new window.Image();
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = 20; canvas.height = 20; // muestreamos chico, es suficiente
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, 20, 20);
            const datos = ctx.getImageData(0, 0, 20, 20).data;
            let suma = 0;
            for (let i = 0; i < datos.length; i += 4) {
              suma += (datos[i] + datos[i + 1] + datos[i + 2]) / 3;
            }
            const promedio = suma / (datos.length / 4);
            resolve(promedio < 12); // muy oscuro en promedio = cámara no detectada
          } catch (e) { resolve(false); }
        };
        img.onerror = () => resolve(false);
        img.src = armarDataUri(base64Frame);
      } catch (e) { resolve(false); }
    });
  };

  const cancelarCaptura = () => {
    grabacionSesionRef.current++;
    setPreparando(false);
    setCountdown(null);
  };

  const iniciarCaptura = async () => {
    if (!cameraRef.current || grabacionEnCursoRef.current || capturando || subiendo) return;
    if (!borradorRecuperado || !origenGrabacion) return;
    const origenCaptura = origenGrabacion;
    if (borradorRef.current && !repitiendo) { mostrarVistaPrevia(); return; }
    const sesion = ++grabacionSesionRef.current;
    const cancelada = () => sesion !== grabacionSesionRef.current;
    const verificarManos = (minimumHands = 2) => !cancelada() && (Platform.OS !== "web" ||
      (cameraFrameReady(contenedorCamaraRef.current?.querySelector("video")) &&
        handsReadyForRecording(ultimaDeteccionRef.current, performance.now(), minimumHands)));
    const capturaValida = () => !grabacionInvalidaRef.current && verificarManos(1);
    const gestoPermitido = () => assertGestureAllowed(gestoBloqueadoRef.current || gestoEnGrabacionRef.current);
    grabacionEnCursoRef.current = true;
    grabacionInvalidaRef.current = false;
    gestoEnGrabacionRef.current = false;
    setManosConfirmadas(false);
    setTrazadoActivo(true);
    setError(null);
    try {
      await prepareTrackedRecording({
        assertAllowed: gestoPermitido,
        isReady: verificarManos, isCountdownReady: () => verificarManos(1), isCancelled: cancelada, now: () => performance.now(),
        delay: ms => new Promise(r => setTimeout(r, ms)),
        stableMs: Platform.OS === "web" ? 500 : 0,
        onWaiting: () => { setPreparando(true); setCountdown(null); },
        onCountdown: number => { setManosConfirmadas(true); setPreparando(false); setCountdown(number); },
      });
      vigilarCapturaRef.current = true;
      setCountdown(null);
      setCapturando(true);
      setProgreso(0);
      setError(null);
      const inicioSecuencia = performance.now();
      let aspectoSecuencia = 4 / 3;
      let tamañoFotograma;
      const muestrasSeguimiento = [];
      const frames = await captureTrackedFrames({
        assertAllowed: gestoPermitido,
        count: TOTAL_FRAMES,
        isReady: capturaValida,
        capture: async () => {
          const muestra = captureTrackingSample(ultimaDeteccionRef.current, performance.now(), inicioSecuencia);
          const foto = await cameraRef.current.takePictureAsync({
            quality: 0.15, base64: true, skipProcessing: true, imageType: "jpg",
          });
          muestra.completedAtMs = performance.now() - inicioSecuencia;
          muestrasSeguimiento.push(muestra);
          if (foto.width > 0 && foto.height > 0) {
            aspectoSecuencia = foto.width / foto.height;
            tamañoFotograma = { width: foto.width, height: foto.height };
          }
          return foto.base64;
        },
        onFrame: setProgreso,
        delay: () => new Promise(r => setTimeout(r, FPS_INTERVALO)),
      });
      const intervaloSecuencia = Math.max(30, Math.min(1000, Math.round((performance.now() - inicioSecuencia) / frames.length)));
      vigilarCapturaRef.current = false;
      setCapturando(false);
      const mitad = frames[Math.floor(frames.length / 2)];
      const esNegro = await fotogramaEsNegro(mitad);
      if (esNegro) {
        setError("No detectamos tu cámara. Revisa que no esté tapada e intenta de nuevo.");
        return;
      }
      if (cancelada()) return;
      const training = tamañoFotograma ? createTrainingCapture({
        participantId: origenCaptura.id, participantIdentity: origenCaptura.participantIdentity,
        sessionId: sesionDatosRef.current, samples: muestrasSeguimiento,
        platform: Platform.OS, frameSize: tamañoFotograma, jpegQuality: 0.15,
      }) : undefined;
      const draft = createRecordingDraft({ label: señaActual, category: catActual.id, frames, intervalMs: intervaloSecuencia, frameAspectRatio: aspectoSecuencia, training });
      borradorRef.current = draft;
      setBorrador(draft);
      setEnvioFallido(false);
      await guardarBorradorLocal(draft);
      if (!cancelada()) mostrarVistaPrevia(draft);
    } catch (e) {
      if (!cancelada() && e.code !== "CANCELLED") setError(e.message || "Error al capturar. Intenta de nuevo.");
    } finally {
      vigilarCapturaRef.current = false;
      setPreparando(false);
      setManosConfirmadas(false);
      setCapturando(false);
      setCountdown(null);
      grabacionEnCursoRef.current = false;
      grabacionInvalidaRef.current = false;
      gestoEnGrabacionRef.current = false;
    }
  };

  const enviarBorrador = async () => {
    const draft = borradorRef.current;
    if (!draft || enviandoRef.current) return;
    enviandoRef.current = true;
    setSubiendo(true);
    setReproduciendo(false);
    setError(null);
    setEnvioFallido(false);
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        throw new Error("Sin conexión a internet. Conéctate y pulsa Reintentar envío.");
      }
      await withRecordingSendLock(draft.id, () => submitRecordingDraft({
        draft, client: supabase,
        onUploaded: async updated => {
          borradorRef.current = updated;
          setBorrador(updated);
          await guardarBorradorLocal(updated);
        },
      }));
      await guardarBorradorLocal({ ...borradorRef.current, submitted: true });
      try { await recordingDraftStore.remove(draft.id); } catch { /* The submitted marker prevents restoration as pending. */ }
      borradorRef.current = null;
      setBorrador(null);
      setExito(true);
      setPantalla("envioListo");
    } catch (e) {
      setEnvioFallido(true);
      setError(`No se pudo enviar la seña. ${e.message || "Intenta de nuevo cuando tengas conexión."}`);
    } finally {
      enviandoRef.current = false;
      setSubiendo(false);
    }
  };

  if (pantalla === "vistaPrevia" && borrador) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.grabarContenido}>
          <View style={styles.grabarHeader}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a la lista" disabled={subiendo} onPress={() => setPantalla("categoria")} style={styles.btnBack}>
              <Text style={styles.btnBackTexto}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.grabarTitulo}>{borrador.label.toUpperCase()}</Text>
            <View style={{ width: 44 }} />
          </View>
          <Text style={styles.previewTitulo}>Revisa tu seña</Text>
          <View style={[styles.camaraBox, estiloCamaraWeb, { aspectRatio: borrador.frameAspectRatio || 4 / 3 }]}>
            <Image accessibilityLabel={`Vista previa de la seña ${borrador.label}`} source={{ uri: armarDataUri(borrador.frames[fotogramaVista] || borrador.frames[0]) }} resizeMode="contain" style={[styles.camara, Platform.OS === "web" && { transform: [{ scaleX: -1 }] }]} />
            <View style={styles.progresoBarra}>
              <View style={[styles.progresoRelleno, { width: `${((fotogramaVista + 1) / borrador.frames.length) * 100}%` }]} />
            </View>
          </View>
          <View style={styles.previewControles}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={reproduciendo ? "Pausar vista previa" : "Reproducir vista previa"} disabled={subiendo} onPress={() => setReproduciendo(value => !value)} style={styles.trazadoBoton}>
              <Text style={styles.trazadoBotonTexto}>{reproduciendo ? "⏸ Pausar" : "▶ Reproducir"}</Text>
            </TouchableOpacity>
            <Text style={styles.trazadoEstado}>{(borrador.frames.length * borrador.intervalMs / 1000).toFixed(1)} segundos</Text>
          </View>
          <Text style={styles.instruccion}>Comprueba que la seña se vea completa. Puedes repetirla o enviarla cuando estés conforme.</Text>
          <View style={styles.ayudaManosBox}>
            <Text accessibilityLiveRegion="polite" style={styles.ayudaManosTexto}>
              {guardadoLocal ? "Tu grabación está guardada en este dispositivo. Podrás recuperarla al volver a abrir esta misma web." : mensajeLocal}
            </Text>
          </View>
          {error && <Text accessibilityRole="alert" style={styles.errorTexto}>{error}</Text>}
          <View style={styles.grabarBotones}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={envioFallido ? "Reintentar envío" : "Enviar seña"} disabled={subiendo} onPress={enviarBorrador} style={[styles.btnOtraVez, styles.previewAccion, subiendo && { opacity: 0.5 }]}>
              <Text style={styles.btnTextoBlanco}>{subiendo ? "Enviando tu seña…" : envioFallido ? "Reintentar envío" : "Enviar seña"}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Repetir grabación" disabled={subiendo} style={[styles.btnVolver, styles.previewAccion, subiendo && { opacity: 0.5 }]} onPress={() => {
              setReproduciendo(false); setRepitiendo(true); setError(null); setProgreso(0); setPantalla("grabar");
            }}>
              <Text style={styles.btnTextoBlanco}>Repetir grabación</Text>
            </TouchableOpacity>
            {subiendo && <ActivityIndicator size="large" color="#E94560" />}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={guardadoLocal ? "Guardar para después" : "Volver a la lista"} disabled={subiendo} onPress={() => setPantalla("categoria")}>
              <Text style={styles.trazadoBotonTexto}>{guardadoLocal ? "Guardar para después" : "Volver a la lista"}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (pantalla === "envioListo") {
    return (
      <SafeAreaView style={[styles.root, styles.centrado]}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 70 }}>✅</Text>
        <Text style={styles.exitoTexto}>¡Gracias!</Text>
        <Text style={styles.instruccion}>Tu seña «{señaActual}» fue enviada para revisión.</Text>
        <View style={styles.grabarBotones}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Grabar otra vez" style={[styles.btnOtraVez, styles.previewAccion]} onPress={() => abrirGrabacion(señaActual)}>
            <Text style={styles.btnTextoBlanco}>Grabar otra vez</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver a la lista" style={[styles.btnVolver, styles.previewAccion]} onPress={() => { setPantalla("categoria"); setExito(false); }}>
            <Text style={styles.btnTextoGris}>‹ Volver a la lista</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (pantalla === "admin") return <AdminPanel client={supabase} onExit={() => setPantalla("home")} onModerated={cargarConteos} />;

  if (pantalla === "grabar" && !permission) return <View style={styles.root} />;
  if (pantalla === "grabar" && !permission.granted) {
    return (
      <SafeAreaView style={[styles.root, styles.centrado]}>
        <Text style={{ fontSize: 70 }}>📷</Text>
        <Text style={styles.permisoTitulo}>Necesitamos la cámara</Text>
        <Text style={styles.permisoSub}>Para grabar tus señas</Text>
        <TouchableOpacity style={styles.btnPrimario} onPress={requestPermission}>
          <Text style={styles.btnPrimarioTexto}>Permitir cámara</Text>
        </TouchableOpacity>
        {borrador && (
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Revisar grabación pendiente" style={styles.trazadoBoton} onPress={() => mostrarVistaPrevia()}>
            <Text style={styles.trazadoBotonTexto}>Revisar grabación pendiente</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  // ── BIENVENIDA ───────────────────────────────────────────────────
  if (pantalla === "bienvenida") {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.bienvenidaScroll}>
          <Text style={styles.bienvenidaEmoji}>🤟</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="DeafApp" onPress={pulsarLogo} activeOpacity={0.8}>
            <Text style={styles.bienvenidaTitulo}>Bienvenidx a DeafApp</Text>
          </TouchableOpacity>
          <Text style={styles.bienvenidaSubtitulo}>Lengua de Señas Chilena 🇨🇱</Text>
          <View style={[styles.bienvenidaCard, { borderColor: "#F1C40F" }]}>
            <Text style={styles.bienvenidaSeccion}>⚠️ Proyecto en fase BETA</Text>
            <Text style={styles.bienvenidaTexto}>
              Esta app está en desarrollo y puede presentar cambios, errores o ajustes seguido.
            </Text>
          </View>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>¿Qué es esto?</Text>
            <Text style={styles.bienvenidaTexto}>
              DeafApp ayuda a crear una IA que entienda la Lengua de Señas Chilena (LSCh)🇨🇱{"\n"}
              Te servira en el dia a dia para hablar con cualquier persona oyente sin problemas
            </Text>
          </View>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>🤟 ¿Cómo funciona?</Text>
            <Text style={styles.bienvenidaTexto}>
             Tu grabas una seña.
             Esa grabacion ayuda a enseñar a la IA.
             Mientras mas personas participen, Mas rapido podras usar la app en tu dia a dia.
            </Text>
          </View>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>✅ ¿Qué es "validar"?</Text>
            <Text style={styles.bienvenidaTexto}>
              Las grabaciones se envían para revisión.{"\n"}
              El equipo administrador comprueba la seña y decide si se aprueba o necesita correcciones.{"\n"}
              Graba la palabra solicitada y revisa tu video antes de enviarlo.
            </Text>
          </View>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>🚀 En el futuro</Text>
            <Text style={styles.bienvenidaTexto}>
              La app podrá:{"\n"}
              • Traducir señas a texto.{"\n"}
              • Pasar señas a voz.{"\n"}
              • Funcionar sin internet.{"\n"}
              • Hablar con cualquier persona oyente sin problemas.
            </Text>
          </View>
          <View style={[styles.bienvenidaCard, { borderColor: "#E94560" }]}>
            <Text style={styles.bienvenidaSeccion}>❤️ Tu Ayuda importa</Text>
            <Text style={styles.bienvenidaTexto}>
              Cada video ayuda a mejorar la app.
              Asi sera mas facil la comunicacion entre personas sordas y oyentes{"\n"}
              ¡Gracias por ser parte de este proyecto 🤟!
            </Text>
          </View>
          <TouchableOpacity style={styles.btnComenzar} onPress={() => setPantalla("home")}>
            <Text style={styles.btnComenzarTexto}>¡Comenzar a Grabar! 🤟</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── FEEDBACK ─────────────────────────────────────────────────────
  if (pantalla === "feedback") {
    const tipos = [
      { id: "sugerencia", label: "💡 Sugerencia", color: "#F39C12" },
      { id: "error",      label: "🐛 Error",       color: "#E74C3C" },
      { id: "seña_nueva", label: "🤟 Seña nueva",  color: "#27AE60" },
      { id: "otro",       label: "📝 Otro",         color: "#607D8B" },
    ];
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.feedbackHeader}>
          <TouchableOpacity onPress={() => setPantalla("home")} style={styles.btnBack}>
            <Text style={styles.btnBackTexto}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.feedbackTitulo}>Sugerencias📩</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={styles.feedbackScroll}>
          <Text style={styles.feedbackSubtitulo}>
            Tu opinión nos ayuda a mejorar DeafApp 💬
          </Text>

          <Text style={styles.feedbackLabel}>Tipo de Comentario:</Text>
          <View style={styles.tiposGrid}>
            {tipos.map(t => (
              <TouchableOpacity
                key={t.id}
                style={[styles.tipoBtn, tipoFeedback === t.id && { borderColor: t.color, backgroundColor: t.color + "22" }]}
                onPress={() => setTipoFeedback(t.id)}
              >
                <Text style={[styles.tipoTexto, tipoFeedback === t.id && { color: t.color }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.feedbackLabel}>Tu mensaje:</Text>
          <TextInput
            style={styles.feedbackInput}
            placeholder="Escribe aquí tu sugerencia, error, o la  seña que falta o agregarias..."
            placeholderTextColor="#555"
            multiline
            numberOfLines={5}
            value={mensajeFeedback}
            onChangeText={setMensajeFeedback}
            textAlignVertical="top"
          />

          {exitoFeedback && (
            <View style={styles.exitoFeedback}>
              <Text style={styles.exitoFeedbackTexto}>✅ ¡Gracias por tu sugerencia!</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btnEnviarFeedback, (!mensajeFeedback.trim() || enviandoFeedback) && { opacity: 0.5 }]}
            onPress={enviarFeedback}
            disabled={!mensajeFeedback.trim() || enviandoFeedback}
          >
            {enviandoFeedback
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.btnEnviarFeedbackTexto}>📤 Enviar sugerencia</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── REVISAR (validación comunitaria) ────────────────────────────
  if (pantalla === "grabar") {
    const pctProgreso = (progreso / TOTAL_FRAMES) * 100;
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.grabarContenido}>
        <View style={styles.grabarHeader}>
          <TouchableOpacity onPress={() => { cancelarCaptura(); if (repitiendo && borradorRef.current) mostrarVistaPrevia(); else setPantalla("categoria"); setExito(false); setError(null); }} style={styles.btnBack}>
            <Text style={styles.btnBackTexto}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.grabarTitulo}>{señaActual?.toUpperCase()}</Text>
          <View style={{ width: 44 }} />
        </View>
        <View ref={contenedorCamaraRef} style={[styles.camaraBox, estiloCamaraWeb]}>
          <CameraView key={camaraSesion} ref={cameraRef} style={styles.camara} facing="front" onMountError={failure => setError(Platform.OS === "web" ? cameraStartupMessage(failure) : failure.message || "No se pudo abrir la cámara. Pulsa Reiniciar cámara.")} />
          <CameraLandmarks cameraContainerRef={contenedorCamaraRef} enabled={trazadoActivo} onStatus={setEstadoTrazado} onTracking={actualizarTrazado} />
          {gestoBloqueado && (
            <View pointerEvents="none" accessibilityRole="alert" style={styles.gestoAviso}>
              <Text style={styles.gestoAvisoTexto}>{BLOCKED_GESTURE_MESSAGE}</Text>
            </View>
          )}
          {countdown !== null && (
            <View pointerEvents="none" style={styles.countdownOverlay}>
              <Text style={styles.countdownTexto}>{countdown}</Text>
            </View>
          )}
          {capturando && (
            <View style={styles.recIndicador}>
              <Animated.View style={[styles.recPunto, { transform: [{ scale: pulseAnim }] }]} />
              <Text style={styles.recTexto}>{progreso}/{TOTAL_FRAMES}</Text>
            </View>
          )}
          {exito && (
            <View style={styles.exitoOverlay}>
              <Text style={{ fontSize: 70 }}>✅</Text>
              <Text style={styles.exitoTexto}>¡Gracias!</Text>
              <Text style={styles.exitoSub}>Tu seña fue guardada</Text>
            </View>
          )}
          <View style={styles.progresoBarra}>
            <View style={[styles.progresoRelleno, { width: `${pctProgreso}%` }]} />
          </View>
        </View>
        {Platform.OS === "web" && (
          <View style={styles.trazadoPanel}>
            <TouchableOpacity
              accessibilityRole="switch"
              accessibilityState={{ checked: trazadoActivo }}
              accessibilityLabel="Mostrar trazado de cara y manos"
              disabled={preparando || countdown !== null || capturando || subiendo}
              onPress={() => setTrazadoActivo(activo => !activo)}
              style={styles.trazadoBoton}
            >
              <Text style={styles.trazadoBotonTexto}>{trazadoActivo ? "Ocultar trazado" : "Mostrar trazado"}</Text>
            </TouchableOpacity>
            {trazadoActivo && <Text style={styles.trazadoEstado}>{estadoTrazado}</Text>}
            {trazadoActivo && <Text style={styles.trazadoLeyenda}>Amarillo: cara · Verde: mano derecha · Azul: mano izquierda</Text>}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reiniciar cámara" disabled={preparando || countdown !== null || capturando || subiendo} onPress={() => { setCamaraSesion(value => value + 1); setError(null); }}>
              <Text style={styles.trazadoBotonTexto}>Reiniciar cámara</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.instruccion}>
          {capturando
            ? "¡Haz la seña frente a la cámara!"
            : preparando ? "Confirma ambas manos frente a la cámara al inicio. Después puedes hacer la seña con una o las dos manos."
            : countdown !== null ? "Mantén al menos una mano trazada. Graba al terminar la cuenta atrás."
            : `Pulsa Preparar grabación y después coloca ambas manos frente a la cámara para grabar: "${señaActual}".`}
        </Text>
        {repitiendo && <Text style={styles.trazadoEstado}>Conservaremos tu grabación anterior hasta que termines una nueva.</Text>}
        {Platform.OS === "web" && trazadoActivo && ayudaManos && !gestoBloqueado && !capturando && !subiendo && !exito && !error && (
          <View style={styles.ayudaManosBox}>
            <Text style={styles.ayudaManosTexto}>{ayudaManos}</Text>
          </View>
        )}
        {error && <Text style={styles.errorTexto}>{error}</Text>}
        <View style={styles.grabarBotones}>
          {!preparando && countdown === null && !capturando && !subiendo && !exito && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Preparar grabación"
              disabled={gestoBloqueado || !borradorRecuperado || !origenGrabacion}
              style={[styles.btnGrabarGrande, (gestoBloqueado || !borradorRecuperado || !origenGrabacion) && { opacity: 0.45 }]}
              onPress={iniciarCaptura}
            >
              <Text style={{ fontSize: 40 }}>⊙</Text>
              <Text style={styles.btnGrabarGrandeTexto}>{!borradorRecuperado || !origenGrabacion ? "Preparando grabación…" : gestoBloqueado ? "Grabación bloqueada" : "Preparar grabación"}</Text>
            </TouchableOpacity>
          )}
          {(preparando || countdown !== null || capturando) && (
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancelar grabación" onPress={cancelarCaptura} style={styles.btnVolver}>
              <Text style={styles.btnTextoGris}>Cancelar grabación</Text>
            </TouchableOpacity>
          )}
          {(capturando || subiendo) && (
            <View style={styles.subiendoBox}>
              <ActivityIndicator size="large" color="#E94560" />
              <Text style={styles.subiendoTexto}>
                {capturando ? `Capturando... ${progreso}/${TOTAL_FRAMES}` : "Subiendo tu seña..."}
              </Text>
            </View>
          )}
          {exito && (
            <View style={{ width: "100%", gap: 12 }}>
              <TouchableOpacity style={styles.btnOtraVez} onPress={() => { setExito(false); setProgreso(0); }}>
                <Text style={styles.btnTextoBlanco}>⊙ Grabar otra vez</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnVolver} onPress={() => { setPantalla("categoria"); setExito(false); }}>
                <Text style={styles.btnTextoGris}>‹ Volver a la lista</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── CATEGORÍA ────────────────────────────────────────────────────
  if (pantalla === "categoria" && catActual) {
    const pendientes = catActual.señas.filter(s => (conteos[s] || 0) < META_POR_SEÑA);
    const listas     = catActual.señas.filter(s => (conteos[s] || 0) >= META_POR_SEÑA);
    const AVISOS_Ñ_POR_CATEGORIA = {
      hogar:        "ℹ️ En esta categoría, la palabra \"bano\" en realidad representa la letra \"Ñ\": es \"baño\".",
      necesidades:  "ℹ️ En esta categoría, la palabra \"bano\" en realidad representa la letra \"Ñ\": es \"baño\".",
      regiones:     "ℹ️ En esta categoría, la palabra \"nuble\" en realidad representa la letra \"Ñ\": es \"Ñuble\".",
      tiempo:       "ℹ️ En esta categoría, la palabra \"manana\" en realidad representa la letra \"Ñ\": es \"mañana\".",
    };
    const avisoÑ = AVISOS_Ñ_POR_CATEGORIA[catActual.id];
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={[styles.catHeader, { borderBottomColor: catActual.color }]}>
          <TouchableOpacity onPress={() => setPantalla("home")} style={styles.btnBack}>
            <Text style={styles.btnBackTexto}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.catHeaderEmoji}>{catActual.emoji}</Text>
          <Text style={styles.catHeaderNombre}>{catActual.nombre}</Text>
        </View>
        <ScrollView showsVerticalScrollIndicator={true}>
          {avisoÑ && (
            <View style={styles.avisoÑBox}>
              <Text style={styles.avisoÑTexto}>{avisoÑ}</Text>
            </View>
          )}
          {pendientes.length > 0 && (
            <>
              <Text style={styles.seccionTitulo}>Necesitamos tu ayuda 🔴</Text>
              {pendientes.map(s => (
                <SignaRow key={s} seña={s} conteo={conteos[s]}
                  onGrabar={() => abrirGrabacion(s)} />
              ))}
            </>
          )}
          {listas.length > 0 && (
            <>
              <Text style={styles.seccionTitulo}>Señas completas ✅</Text>
              {listas.map(s => (
                <SignaRow key={s} seña={s} conteo={conteos[s]}
                  onGrabar={() => abrirGrabacion(s)} />
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── HOME ─────────────────────────────────────────────────────────
  const totalCategoriasApp     = CATEGORIAS.length;
  const categoriasCompletasApp = CATEGORIAS.filter(
    cat => cat.señas.every(s => (conteos[s] || 0) >= META_POR_SEÑA)
  ).length;
  const pctGeneralApp = totalCategoriasApp > 0 ? categoriasCompletasApp / totalCategoriasApp : 0;

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.avisoBetaTop}>
        <Text style={styles.avisoBetaTopTexto}>⚠️ Proyecto en fase BETA — puede presentar cambios</Text>
      </View>
      <View style={styles.homeHeader}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="DeafApp" activeOpacity={0.8} onPress={pulsarLogo}>
          <Text style={styles.homeTitulo}>DeafApp 🤟</Text>
        </TouchableOpacity>
        <Text style={styles.homeSubtitulo}>Lengua de Señas Chilena</Text>
      </View>
      <Text style={styles.homeInstruccion}>Selecciona una categoría y graba tus señas 👇</Text>
      <View style={styles.avisoImportanteBox}>
        <Text style={styles.avisoImportanteTexto}>
          ⚠️ Este proyecto NO busca reemplazar en ningún caso a los Intérpretes.
        </Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={true}>
        {borrador && (
          <View style={styles.pendienteBox}>
            <Text style={styles.pendienteTitulo}>Tienes una grabación pendiente: «{borrador.label}»</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Revisar grabación pendiente" onPress={() => mostrarVistaPrevia()} style={styles.trazadoBoton}>
              <Text style={styles.trazadoBotonTexto}>Revisar y enviar</Text>
            </TouchableOpacity>
          </View>
        )}
        <View style={styles.progresoGeneralBox}>
          <TouchableOpacity
            style={styles.progresoGeneralHeader}
            onPress={() => setProgresoAbierto(!progresoAbierto)}
            activeOpacity={0.7}
          >
            <Text style={styles.progresoGeneralTitulo}>🚀 Progreso general</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={styles.progresoGeneralPct}>{Math.round(pctGeneralApp * 100)}%</Text>
              <Text style={styles.progresoGeneralFlecha}>{progresoAbierto ? "▾" : "▸"}</Text>
            </View>
          </TouchableOpacity>
          {progresoAbierto && (
            <>
              <View style={styles.progresoGeneralBarraFondo}>
                <View style={[styles.progresoGeneralBarraRelleno, { width: `${pctGeneralApp * 100}%` }]} />
              </View>
              <Text style={styles.progresoGeneralSub}>
                {categoriasCompletasApp} de {totalCategoriasApp} categorías completas · faltan {totalCategoriasApp - categoriasCompletasApp}
              </Text>
            </>
          )}
        </View>
        <View style={styles.grid}>
          {CATEGORIAS.map(cat => (
            <CategoriaCard key={cat.id} cat={cat} conteos={conteos}
              onPress={() => { setCatActual(cat); setPantalla("categoria"); }} />
          ))}
        </View>

        <TouchableOpacity style={styles.btnFeedback} onPress={() => setPantalla("feedback")}>
          <Text style={styles.btnFeedbackTexto}>💬 Que opinas tu?</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}


const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#0F0F1E" },
  centrado:{ alignItems: "center", justifyContent: "center" },

  bienvenidaScroll:    { alignItems: "center", paddingHorizontal: 20, paddingTop: 40, maxWidth: 600, alignSelf: "center", width: "100%" },
  bienvenidaEmoji:     { fontSize: 70, marginBottom: 12 },
  bienvenidaTitulo:    { fontSize: 30, fontWeight: "900", color: "#FFF", textAlign: "center" },
  bienvenidaSubtitulo: { fontSize: 14, color: "#888", marginBottom: 24, textAlign: "center" },
  bienvenidaCard:      { backgroundColor: "#1A1A2E", borderRadius: 16, padding: 18, marginBottom: 14, width: "100%", borderWidth: 1, borderColor: "#333" },
  bienvenidaSeccion:   { fontSize: 16, fontWeight: "800", color: "#FFF", marginBottom: 8 },
  bienvenidaTexto:     { fontSize: 14, color: "#AAA", lineHeight: 22 },
  btnComenzar:         { backgroundColor: "#E94560", borderRadius: 20, paddingVertical: 18, paddingHorizontal: 40, marginTop: 10, width: "100%", alignItems: "center" },
  btnComenzarTexto:    { fontSize: 18, fontWeight: "900", color: "#FFF" },

  homeHeader:     { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  homeTitulo:     { fontSize: 28, fontWeight: "900", color: "#FFF" },
  homeSubtitulo:  { fontSize: 13, color: "#888", marginTop: 2 },
  homeInstruccion:{ fontSize: 14, color: "#AAA", textAlign: "center", marginBottom: 12, paddingHorizontal: 20 },
  grid:           { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 12 },

  progresoGeneralBox:        { width: "70%", alignSelf: "center", marginBottom: 12, backgroundColor: "#1A1A2E", borderRadius: 16, padding: 12, borderWidth: 2, borderColor: "#E94560" },
  progresoGeneralHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  progresoGeneralFlecha:     { fontSize: 14, fontWeight: "900", color: "#E94560" },
  progresoGeneralTitulo:     { fontSize: 13, fontWeight: "900", color: "#FFF" },
  progresoGeneralPct:        { fontSize: 16, fontWeight: "900", color: "#E94560" },
  progresoGeneralBarraFondo: { width: "100%", height: 8, backgroundColor: "#333", borderRadius: 4, overflow: "hidden", marginTop: 10 },
  progresoGeneralBarraRelleno:{ height: 8, borderRadius: 4, backgroundColor: "#E94560" },
  progresoGeneralSub:        { fontSize: 11, color: "#AAA", marginTop: 6, textAlign: "center" },

  avisoImportanteBox:   { width: "70%", alignSelf: "center", marginBottom: 12, backgroundColor: "#241A2E", borderRadius: 16, padding: 12, borderWidth: 2, borderColor: "#8E44AD" },
  avisoImportanteTexto: { fontSize: 13, color: "#C39BD3", lineHeight: 19, textAlign: "center", fontWeight: "600" },

  avisoBetaTop:      { backgroundColor: "#3A2E0A", paddingVertical: 6, alignItems: "center" },
  avisoBetaTopTexto: { fontSize: 11.5, color: "#F1C40F", fontWeight: "700" },

  catCard:    { width: "47%", backgroundColor: "#1A1A2E", borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 2 },
  catEmoji:   { fontSize: 34, marginBottom: 6 },
  catNombre:  { fontSize: 13, fontWeight: "700", color: "#FFF", marginBottom: 8, textAlign: "center" },
  catProgreso:{ fontSize: 11, color: "#888", marginTop: 4 },

  totalBox:       { alignItems: "center", marginTop: 20, gap: 6 },
  totalTexto:     { fontSize: 13, color: "#666" },
  actualizarTexto:{ fontSize: 13, color: "#4CAF50" },

  btnFeedback:     { marginHorizontal: 16, marginTop: 16, backgroundColor: "#1A1A2E", borderRadius: 16, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: "#F39C12" },
  btnFeedbackTexto:{ fontSize: 16, fontWeight: "700", color: "#F39C12" },

  btnRevisar:          { marginHorizontal: 16, marginTop: 16, backgroundColor: "#1A1A2E", borderRadius: 16, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: "#3498DB" },
  btnRevisarLinkTexto: { fontSize: 16, fontWeight: "700", color: "#3498DB" },
  revisarPregunta:     { fontSize: 18, fontWeight: "800", color: "#FFF", textAlign: "center", marginBottom: 16, textTransform: "capitalize" },
  revisarMarco:        { width: "100%", maxWidth: 500, height: 420, alignSelf: "center", backgroundColor: "#000", borderRadius: 16, overflow: "hidden" },
  revisarImagen:       { width: "100%", height: "100%" },
  revisarContador:     { position: "absolute", bottom: 8, right: 10, color: "#FFF", fontSize: 11, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  revisarBotones:      { flexDirection: "row", gap: 12, marginTop: 20, maxWidth: 500, alignSelf: "center", width: "100%" },
  btnRevisarBien:      { flex: 1, backgroundColor: "#27AE60", borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnRevisarMal:       { flex: 1, backgroundColor: "#E74C3C", borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnRevisarTexto:     { fontSize: 16, fontWeight: "800", color: "#FFF" },
  revisarAyuda:        { fontSize: 12.5, color: "#888", textAlign: "center", marginBottom: 14, marginTop: -6 },
  btnRevisarNeutral:      { marginTop: 12, maxWidth: 500, alignSelf: "center", width: "100%", paddingVertical: 12, alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: "#444" },
  btnRevisarNeutralTexto: { fontSize: 13.5, color: "#999", fontWeight: "600" },

  barraFondo:   { width: "100%", height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  barraRelleno: { height: 6, borderRadius: 3 },

  catHeader:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, gap: 10 },
  catHeaderEmoji: { fontSize: 26 },
  catHeaderNombre:{ fontSize: 20, fontWeight: "800", color: "#FFF", flex: 1 },
  seccionTitulo:  { fontSize: 14, fontWeight: "700", color: "#AAA", marginLeft: 16, marginTop: 18, marginBottom: 6 },

  avisoÑBox:   { backgroundColor: "#2A2410", borderRadius: 12, marginHorizontal: 12, marginTop: 14, padding: 12, borderWidth: 1, borderColor: "#F39C12" },
  avisoÑTexto: { fontSize: 12.5, color: "#F1C40F", lineHeight: 18 },

  señaFila:   { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A2E", marginHorizontal: 12, marginVertical: 4, borderRadius: 14, padding: 14 },
  señaInfo:   { flex: 1, marginRight: 12 },
  señaNombre: { fontSize: 17, fontWeight: "700", color: "#FFF", textTransform: "capitalize", marginBottom: 6 },
  señaConteo: { fontSize: 11, marginTop: 3 },
  btnGrabar:  { width: 50, height: 50, borderRadius: 25, backgroundColor: "#E94560", justifyContent: "center", alignItems: "center" },
  btnGrabarListo: { backgroundColor: "#27AE60" },
  btnGrabarTexto: { fontSize: 22, color: "#FFF", fontWeight: "bold" },

  grabarContenido: { width: "100%", paddingHorizontal: 12, paddingBottom: 24 },
  grabarHeader: { width: "100%", maxWidth: 600, alignSelf: "center", flexDirection: "row", alignItems: "center", paddingVertical: 10 },
  btnBack:      { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  btnBackTexto: { fontSize: 32, color: "#FFF", fontWeight: "300" },
  grabarTitulo: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "900", color: "#FFF", letterSpacing: 1 },

  camaraBox: { width: "100%", maxWidth: 600, alignSelf: "center", flexShrink: 0, height: Platform.OS === "web" ? undefined : height * 0.50, overflow: "hidden", backgroundColor: "#000", borderRadius: 16 },
  camara:    { ...StyleSheet.absoluteFillObject },
  previewTitulo: { color: "#FFF", fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  previewControles: { alignItems: "center", justifyContent: "center", flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 12 },
  previewAccion: { width: "100%", maxWidth: 480, paddingHorizontal: 16 },
  pendienteBox: { marginHorizontal: 16, marginTop: 12, padding: 16, borderRadius: 14, backgroundColor: "#1A1A2E", borderWidth: 1, borderColor: "#4ECDC4", alignItems: "center", gap: 12 },
  pendienteTitulo: { color: "#FFF", fontSize: 15, fontWeight: "700", textAlign: "center" },
  gestoAviso: { position: "absolute", zIndex: 3, bottom: 18, left: 12, right: 12, backgroundColor: "rgba(145,25,45,0.95)", borderRadius: 12, padding: 12 },
  gestoAvisoTexto: { color: "#FFF", fontSize: 14, lineHeight: 20, fontWeight: "700", textAlign: "center" },
  trazadoPanel: { alignItems: "center", paddingHorizontal: 16, marginTop: 10, gap: 6 },
  trazadoBoton: { backgroundColor: "#1A1A2E", borderColor: "#4ECDC4", borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 9 },
  trazadoBotonTexto: { color: "#4ECDC4", fontWeight: "700", fontSize: 13 },
  trazadoEstado: { color: "#DDD", fontSize: 12, textAlign: "center" },
  trazadoLeyenda: { color: "#AAA", fontSize: 11, textAlign: "center" },

  countdownOverlay: { position: "absolute", zIndex: 2, top: 12, right: 12, minWidth: 90, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "center", alignItems: "center" },
  countdownTexto:   { fontSize: 100, fontWeight: "900", color: "#FFF" },

  recIndicador: { position: "absolute", zIndex: 2, top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  recPunto:     { width: 14, height: 14, borderRadius: 7, backgroundColor: "#E74C3C" },
  recTexto:     { color: "#FFF", fontSize: 14, fontWeight: "600" },

  progresoBarra:  { position: "absolute", zIndex: 2, bottom: 0, left: 0, right: 0, height: 6, backgroundColor: "rgba(255,255,255,0.15)" },
  progresoRelleno:{ height: 6, backgroundColor: "#E94560" },

  exitoOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 2, backgroundColor: "rgba(39,174,96,0.92)", justifyContent: "center", alignItems: "center", gap: 8 },
  exitoTexto:   { fontSize: 36, fontWeight: "900", color: "#FFF" },
  exitoSub:     { fontSize: 16, color: "#D5F5E3" },

  instruccion: { fontSize: 14, color: "#AAA", textAlign: "center", marginTop: 12, paddingHorizontal: 20 },
  ayudaManosBox: { width: "100%", maxWidth: 600, alignSelf: "center", backgroundColor: "#1A1A2E", borderLeftWidth: 3, borderLeftColor: "#4ECDC4", borderRadius: 10, padding: 12, marginTop: 10 },
  ayudaManosTexto: { color: "#BCE9E5", fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorTexto:  { fontSize: 13, color: "#E74C3C", textAlign: "center", marginTop: 6 },

  grabarBotones: { width: "100%", maxWidth: 600, alignSelf: "center", justifyContent: "center", alignItems: "center", paddingVertical: 18, gap: 12 },
  btnGrabarGrande:     { backgroundColor: "#E94560", borderRadius: 20, paddingVertical: 18, paddingHorizontal: 40, alignItems: "center", gap: 4, width: "80%" },
  btnGrabarGrandeTexto:{ fontSize: 17, fontWeight: "700", color: "#FFF" },

  subiendoBox:  { alignItems: "center", gap: 12 },
  subiendoTexto:{ fontSize: 15, color: "#E94560" },

  btnOtraVez: { backgroundColor: "#E94560", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  btnVolver:  { backgroundColor: "#333",    borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  btnTextoBlanco:{ fontSize: 16, fontWeight: "700", color: "#FFF" },
  btnTextoGris:  { fontSize: 15, fontWeight: "600", color: "#AAA" },

  // Feedback
  feedbackHeader:   { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#333" },
  feedbackTitulo:   { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "900", color: "#FFF" },
  feedbackScroll:   { paddingHorizontal: 20, paddingTop: 20, maxWidth: 600, alignSelf: "center", width: "100%" },
  feedbackSubtitulo:{ fontSize: 15, color: "#AAA", textAlign: "center", marginBottom: 24 },
  feedbackLabel:    { fontSize: 14, fontWeight: "700", color: "#AAA", marginBottom: 10 },
  tiposGrid:        { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  tipoBtn:          { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: "#333", backgroundColor: "#1A1A2E" },
  tipoTexto:        { fontSize: 14, color: "#888", fontWeight: "600" },
  feedbackInput:    { backgroundColor: "#1A1A2E", borderRadius: 16, padding: 16, color: "#FFF", fontSize: 15, minHeight: 120, borderWidth: 1, borderColor: "#333", marginBottom: 16 },
  exitoFeedback:    { backgroundColor: "#1A4A2A", borderRadius: 12, padding: 14, marginBottom: 12, alignItems: "center" },
  exitoFeedbackTexto:{ fontSize: 15, color: "#4CAF50", fontWeight: "700" },
  btnEnviarFeedback:    { backgroundColor: "#F39C12", borderRadius: 16, paddingVertical: 16, alignItems: "center" },
  btnEnviarFeedbackTexto:{ fontSize: 16, fontWeight: "700", color: "#FFF" },

  permisoTitulo:{ fontSize: 22, fontWeight: "800", color: "#FFF", textAlign: "center", marginTop: 16 },
  permisoSub:   { fontSize: 15, color: "#888", textAlign: "center", marginTop: 6, marginBottom: 40 },
  btnPrimario:  { backgroundColor: "#E94560", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40 },
  btnPrimarioTexto:{ fontSize: 17, fontWeight: "700", color: "#FFF" },
});
