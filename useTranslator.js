import { useEffect, useRef, useState } from "react";
import { useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { displayWord } from "./ui/signNames";
import { translatorSettingsStore } from "./translatorSettingsStore";
import {
  API_POR_DEFECTO, CUENTA_ATRAS, advertenciaDeUrl, capturarClip, clasificarClip, consultarEstado,
  normalizarUrlApi, resumirResultado,
} from "./translator";

const esperar = ms => new Promise(resolve => setTimeout(resolve, ms));

// Estado y acciones del traductor, compartidos por la pantalla web (DOM) y la nativa (React Native).
// Una seña por clip: cuenta atrás, 30 fotogramas con la cámara y consulta a la API de LSCh.
export default function useTranslator({ protocoloPagina = "" } = {}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camara = useRef(null);
  const montada = useRef(true);
  const sesion = useRef(0);
  const [apiUrl, setApiUrl] = useState(API_POR_DEFECTO);
  const [borrador, setBorrador] = useState(API_POR_DEFECTO);
  const [errorUrl, setErrorUrl] = useState("");
  const [servidor, setServidor] = useState({ fase: "comprobando" });   // comprobando | ok | error
  const [camaraLista, setCamaraLista] = useState(false);
  const [fase, setFase] = useState("listo");                           // listo | cuenta | capturando | analizando | resultado | error
  const [cuenta, setCuenta] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [resumen, setResumen] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    montada.current = true;
    translatorSettingsStore.load().then(guardada => {
      const r = guardada && normalizarUrlApi(guardada.apiUrl);
      if (montada.current && r && r.ok) { setApiUrl(r.url); setBorrador(r.url); }
    });
    return () => { montada.current = false; sesion.current += 1; };
  }, []);

  useEffect(() => {
    let vigente = true;
    setServidor({ fase: "comprobando" });
    consultarEstado({ apiUrl }).then(r => { if (vigente) setServidor(r.ok ? { fase: "ok", clases: r.clases } : { fase: "error", mensaje: r.error }); });
    return () => { vigente = false; };
  }, [apiUrl]);

  const ocupada = fase === "cuenta" || fase === "capturando" || fase === "analizando";

  async function traducir() {
    if (ocupada || !camara.current) return;
    const mia = ++sesion.current;
    const vigente = () => montada.current && sesion.current === mia;
    setError(""); setResumen(null);
    try {
      setFase("cuenta");
      for (let n = CUENTA_ATRAS; n >= 1; n -= 1) { setCuenta(n); await esperar(1000); if (!vigente()) return; }
      setCuenta(null); setProgreso(0); setFase("capturando");
      const clip = await capturarClip({
        tomarFoto: () => camara.current.takePictureAsync({ quality: 0.15, base64: true, skipProcessing: true, imageType: "jpg" }),
        alFotograma: n => { if (vigente()) setProgreso(n); }, cancelado: () => !vigente(),
      });
      if (!vigente()) return;
      setFase("analizando");
      const datos = await clasificarClip({ apiUrl, frames: clip.frames, intervaloMs: clip.intervaloMs });
      if (!vigente()) return;
      setResumen(resumirResultado(datos, displayWord));
      setFase("resultado");
    } catch (fallo) {
      if (!vigente() || fallo.codigo === "cancelado") return;
      setError(fallo.message || "Algo salió mal. Intenta de nuevo.");
      setFase("error");
    } finally {
      if (montada.current) setCuenta(null);
    }
  }

  function guardarServidor() {
    const r = normalizarUrlApi(borrador);
    if (!r.ok) { setErrorUrl(r.error); return; }
    setErrorUrl(""); setApiUrl(r.url); setBorrador(r.url);
    translatorSettingsStore.save({ apiUrl: r.url });
  }

  function escuchar() {
    const principal = resumen && resumen.candidatos[0];
    if (!principal) return;
    try { Speech.stop(); Speech.speak(principal.nombre, { language: "es" }); } catch { /* Sin voz disponible en este dispositivo. */ }
  }

  function falloDeCamara() {
    setCamaraLista(false);
    setError("No se pudo abrir la cámara. Revisa que no esté en uso por otra aplicación.");
    setFase("error");
  }

  return {
    permission, requestPermission, camara, apiUrl, borrador, setBorrador, errorUrl, servidor, setCamaraLista, fase, cuenta,
    progreso, resumen, error, ocupada, traducir, guardarServidor, escuchar, falloDeCamara,
    listaParaTraducir: camaraListaYServidor(camaraLista, servidor, ocupada),
    advertencia: advertenciaDeUrl(apiUrl, protocoloPagina),
  };
}

function camaraListaYServidor(camaraLista, servidor, ocupada) { return camaraLista && servidor.fase === "ok" && !ocupada; }
