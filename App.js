/**
 * DeafApp — Recopilación de señas LSCh
 * Captura 30 frames en 3 segundos y los sube a Supabase
 * Funciona en cualquier navegador móvil sin instalar nada
 */

import { useState, useRef, useEffect } from "react";
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, SafeAreaView, Dimensions,
  ActivityIndicator, StatusBar, Animated,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { createClient } from "@supabase/supabase-js";

const { width, height } = Dimensions.get("window");

// ── SUPABASE ───────────────────────────────────────────────────────
const SUPABASE_URL = "https://didlffnluqqurelgnqdp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZGxmZm5sdXFxdXJlbGducWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDMwNTYsImV4cCI6MjA5OTk3OTA1Nn0.G6MqUFXNJleUTBtZu7kQb58E-rGWk3w-rLbvRu6xOVE";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const META_POR_SEÑA  = 30;   // grabaciones objetivo por seña
const TOTAL_FRAMES   = 30;   // frames por secuencia
const FPS_INTERVALO  = 100;  // ms entre frames (10fps)

// ── CATEGORÍAS ─────────────────────────────────────────────────────
const CATEGORIAS = [
  {
    id: "alimentos", nombre: "Alimentos", emoji: "🍎", color: "#FF6B6B",
    señas: ["arroz","fideos","pure","porotos","lentejas","carne","cerdo",
            "pavo","longaniza","vianesa","pollo","pescado","aceite","sal",
            "azucar","pimienta","ajo"],
  },
  {
    id: "saludos", nombre: "Saludos", emoji: "👋", color: "#4ECDC4",
    señas: ["hola","adios","buenos dias","buenas tardes","buenas noches",
            "gracias","por favor","de nada","como estas","bien","mal"],
  },
  {
    id: "familia", nombre: "Familia", emoji: "👨‍👩‍👧", color: "#45B7D1",
    señas: ["mama","papa","hermano","hermana","abuelo","abuela",
            "hijo","hija","tio","tia","primo","familia"],
  },
  {
    id: "verbos", nombre: "Verbos", emoji: "⚡", color: "#96CEB4",
    señas: ["comer","beber","dormir","trabajar","estudiar",
            "caminar","correr","hablar","escuchar","ver","ir","venir"],
  },
  {
    id: "pronombres", nombre: "Pronombres", emoji: "👤", color: "#F7DC6F",
    señas: ["yo","tu","el","ella","nosotros","ellos","esto","eso"],
  },
  {
    id: "numeros", nombre: "Números", emoji: "🔢", color: "#C39BD3",
    señas: ["uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez"],
  },
];

// ── HELPERS ────────────────────────────────────────────────────────
const colorProgreso = (n) => {
  if (n === 0)                  return "#555";
  if (n < META_POR_SEÑA * 0.3) return "#E74C3C";
  if (n < META_POR_SEÑA * 0.7) return "#F39C12";
  return "#27AE60";
};

// ── COMPONENTES ────────────────────────────────────────────────────
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

// ── APP ────────────────────────────────────────────────────────────
export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [pantalla,   setPantalla]   = useState("home");
  const [catActual,  setCatActual]  = useState(null);
  const [señaActual, setSeñaActual] = useState(null);
  const [conteos,    setConteos]    = useState({});
  const [countdown,  setCountdown]  = useState(null);
  const [capturando, setCapturando] = useState(false);
  const [subiendo,   setSubiendo]   = useState(false);
  const [progreso,   setProgreso]   = useState(0);   // 0-30 frames capturados
  const [exito,      setExito]      = useState(false);
  const [error,      setError]      = useState(null);

  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    cargarConteos();
    // Auto-refresh cada 30 segundos
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
      const { data } = await supabase.from("grabaciones").select("label");
      if (data) {
        const c = {};
        data.forEach(r => { c[r.label] = (c[r.label] || 0) + 1; });
        setConteos(c);
      }
    } catch (e) { console.log("Error conteos:", e); }
  };

  const iniciarCaptura = async () => {
    if (!cameraRef.current || capturando || subiendo) return;

    // Countdown 3-2-1
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise(r => setTimeout(r, 900));
    }
    setCountdown("¡Ya!");
    await new Promise(r => setTimeout(r, 400));
    setCountdown(null);

    setCapturando(true);
    setProgreso(0);
    setError(null);

    const frames = [];
    try {
      for (let i = 0; i < TOTAL_FRAMES; i++) {
        const foto = await cameraRef.current.takePictureAsync({
          quality:         0.15,   // muy comprimida para ahorrar espacio
          base64:          true,
          skipProcessing:  true,
        });
        frames.push(foto.base64);
        setProgreso(i + 1);
        await new Promise(r => setTimeout(r, FPS_INTERVALO));
      }
      setCapturando(false);
      await subirFrames(frames);
    } catch (e) {
      setCapturando(false);
      setError("Error al capturar. Intenta de nuevo.");
    }
  };

  const subirFrames = async (frames) => {
    setSubiendo(true);
    try {
      const timestamp   = Date.now();
      const nombre      = `${señaActual}_${timestamp}.json`;
      const storagePath = `${catActual.id}/${señaActual}/${nombre}`;

      // Empaquetar los 30 frames en un JSON
      const payload = JSON.stringify({
        label:     señaActual,
        categoria: catActual.id,
        frames:    frames,        // array de 30 strings base64
        timestamp: timestamp,
        n_frames:  frames.length,
      });

      const blob = new Blob([payload], { type: "application/json" });

      const { error: uploadError } = await supabase.storage
        .from("contribuciones")
        .upload(storagePath, blob, { contentType: "application/json" });

      if (uploadError) {
        setError(`Error: ${uploadError.message}`);
      } else {
        await supabase.from("grabaciones").insert({
          label:        señaActual,
          categoria:    catActual.id,
          archivo_path: storagePath,
        });
        setConteos(prev => ({ ...prev, [señaActual]: (prev[señaActual] || 0) + 1 }));
        setExito(true);
      }
    } catch (e) {
      setError(`Error al subir: ${e.message}`);
    }
    setSubiendo(false);
  };

  // ── PERMISOS ───────────────────────────────────────────────────
  if (!permission) return <View style={styles.root} />;
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.root, styles.centrado]}>
        <Text style={{ fontSize: 70 }}>📷</Text>
        <Text style={styles.permisoTitulo}>Necesitamos la cámara</Text>
        <Text style={styles.permisoSub}>Para grabar tus señas</Text>
        <TouchableOpacity style={styles.btnPrimario} onPress={requestPermission}>
          <Text style={styles.btnPrimarioTexto}>Permitir cámara</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ── PANTALLA GRABAR ────────────────────────────────────────────
  if (pantalla === "grabar") {
    const pctProgreso = (progreso / TOTAL_FRAMES) * 100;
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.grabarHeader}>
          <TouchableOpacity onPress={() => { setPantalla("categoria"); setExito(false); setError(null); }} style={styles.btnBack}>
            <Text style={styles.btnBackTexto}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.grabarTitulo}>{señaActual?.toUpperCase()}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.camaraBox}>
          <CameraView ref={cameraRef} style={styles.camara} facing="front" />

          {countdown !== null && (
            <View style={styles.countdownOverlay}>
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

          {/* Barra de progreso de captura */}
          <View style={styles.progresoBarra}>
            <View style={[styles.progresoRelleno, { width: `${pctProgreso}%` }]} />
          </View>
        </View>

        <Text style={styles.instruccion}>
          {capturando
            ? "¡Haz la seña frente a la cámara!"
            : `Graba la seña: "${señaActual}"`}
        </Text>

        {error && <Text style={styles.errorTexto}>{error}</Text>}

        <View style={styles.grabarBotones}>
          {!capturando && !subiendo && !exito && (
            <TouchableOpacity style={styles.btnGrabarGrande} onPress={iniciarCaptura}>
              <Text style={{ fontSize: 40 }}>⊙</Text>
              <Text style={styles.btnGrabarGrandeTexto}>Grabar seña (3 seg)</Text>
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
      </SafeAreaView>
    );
  }

  // ── PANTALLA CATEGORÍA ─────────────────────────────────────────
  if (pantalla === "categoria" && catActual) {
    const pendientes = catActual.señas.filter(s => (conteos[s] || 0) < META_POR_SEÑA);
    const listas     = catActual.señas.filter(s => (conteos[s] || 0) >= META_POR_SEÑA);
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
        <ScrollView showsVerticalScrollIndicator={false}>
          {pendientes.length > 0 && (
            <>
              <Text style={styles.seccionTitulo}>Necesitamos tu ayuda 🔴</Text>
              {pendientes.map(s => (
                <SignaRow key={s} seña={s} conteo={conteos[s]}
                  onGrabar={() => { setSeñaActual(s); setExito(false); setError(null); setProgreso(0); setPantalla("grabar"); }} />
              ))}
            </>
          )}
          {listas.length > 0 && (
            <>
              <Text style={styles.seccionTitulo}>Señas completas ✅</Text>
              {listas.map(s => (
                <SignaRow key={s} seña={s} conteo={conteos[s]}
                  onGrabar={() => { setSeñaActual(s); setExito(false); setError(null); setProgreso(0); setPantalla("grabar"); }} />
              ))}
            </>
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── PANTALLA HOME ──────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.homeHeader}>
        <Text style={styles.homeTitulo}>DeafApp</Text>
        <Text style={styles.homeSubtitulo}>Lenguaje de Señas Chileno</Text>
      </View>
      <Text style={styles.homeInstruccion}>Selecciona una categoría 👇</Text>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {CATEGORIAS.map(cat => (
            <CategoriaCard key={cat.id} cat={cat} conteos={conteos}
              onPress={() => { setCatActual(cat); setPantalla("categoria"); }} />
          ))}
        </View>
        <View style={styles.totalBox}>
          <Text style={styles.totalTexto}>
            {Object.values(conteos).reduce((a, b) => a + b, 0)} grabaciones totales
          </Text>
          <TouchableOpacity onPress={cargarConteos}>
            <Text style={styles.actualizarTexto}>↻ Actualizar</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── ESTILOS ────────────────────────────────────────────────────────
const CARD_W = (width - 48) / 2;

const styles = StyleSheet.create({
  root:    { flex: 1, backgroundColor: "#0F0F1E" },
  centrado:{ alignItems: "center", justifyContent: "center" },

  // Home
  homeHeader:    { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  homeTitulo:    { fontSize: 32, fontWeight: "900", color: "#FFF" },
  homeSubtitulo: { fontSize: 13, color: "#888", marginTop: 2 },
  homeInstruccion:{ fontSize: 15, color: "#AAA", textAlign: "center", marginBottom: 12, paddingHorizontal: 20 },
  grid:          { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 12, gap: 12 },

  // Categoria card
  catCard:    { width: CARD_W, backgroundColor: "#1A1A2E", borderRadius: 16, padding: 16, alignItems: "center", borderWidth: 2 },
  catEmoji:   { fontSize: 38, marginBottom: 6 },
  catNombre:  { fontSize: 15, fontWeight: "700", color: "#FFF", marginBottom: 8 },
  catProgreso:{ fontSize: 11, color: "#888", marginTop: 4 },

  // Total
  totalBox:       { alignItems: "center", marginTop: 20, gap: 6 },
  totalTexto:     { fontSize: 13, color: "#666" },
  actualizarTexto:{ fontSize: 13, color: "#4CAF50" },

  // Barra de progreso genérica
  barraFondo:   { width: "100%", height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  barraRelleno: { height: 6, borderRadius: 3 },

  // Categoria screen
  catHeader:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, gap: 10 },
  catHeaderEmoji: { fontSize: 26 },
  catHeaderNombre:{ fontSize: 20, fontWeight: "800", color: "#FFF", flex: 1 },
  seccionTitulo:  { fontSize: 14, fontWeight: "700", color: "#AAA", marginLeft: 16, marginTop: 18, marginBottom: 6 },

  // Sign row
  señaFila:   { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A2E", marginHorizontal: 12, marginVertical: 4, borderRadius: 14, padding: 14 },
  señaInfo:   { flex: 1, marginRight: 12 },
  señaNombre: { fontSize: 17, fontWeight: "700", color: "#FFF", textTransform: "capitalize", marginBottom: 6 },
  señaConteo: { fontSize: 11, marginTop: 3 },
  btnGrabar:  { width: 50, height: 50, borderRadius: 25, backgroundColor: "#E94560", justifyContent: "center", alignItems: "center" },
  btnGrabarListo: { backgroundColor: "#27AE60" },
  btnGrabarTexto: { fontSize: 22, color: "#FFF", fontWeight: "bold" },

  // Grabar screen
  grabarHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  btnBack:      { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  btnBackTexto: { fontSize: 32, color: "#FFF", fontWeight: "300" },
  grabarTitulo: { flex: 1, textAlign: "center", fontSize: 22, fontWeight: "900", color: "#FFF", letterSpacing: 2 },

  camaraBox: { width: "100%", height: height * 0.50, overflow: "hidden", backgroundColor: "#000" },
  camara:    { flex: 1 },

  countdownOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "center", alignItems: "center" },
  countdownTexto:   { fontSize: 100, fontWeight: "900", color: "#FFF" },

  recIndicador: { position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.65)", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20 },
  recPunto:     { width: 14, height: 14, borderRadius: 7, backgroundColor: "#E74C3C" },
  recTexto:     { color: "#FFF", fontSize: 14, fontWeight: "600" },

  progresoBarra:  { position: "absolute", bottom: 0, left: 0, right: 0, height: 6, backgroundColor: "rgba(255,255,255,0.15)" },
  progresoRelleno:{ height: 6, backgroundColor: "#E94560" },

  exitoOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(39,174,96,0.92)", justifyContent: "center", alignItems: "center", gap: 8 },
  exitoTexto:   { fontSize: 36, fontWeight: "900", color: "#FFF" },
  exitoSub:     { fontSize: 16, color: "#D5F5E3" },

  instruccion: { fontSize: 15, color: "#AAA", textAlign: "center", marginTop: 12, paddingHorizontal: 20 },
  errorTexto:  { fontSize: 13, color: "#E74C3C", textAlign: "center", marginTop: 6 },

  grabarBotones: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 20 },
  btnGrabarGrande:     { backgroundColor: "#E94560", borderRadius: 20, paddingVertical: 18, paddingHorizontal: 40, alignItems: "center", gap: 4, width: "80%" },
  btnGrabarGrandeTexto:{ fontSize: 17, fontWeight: "700", color: "#FFF" },

  subiendoBox:  { alignItems: "center", gap: 12 },
  subiendoTexto:{ fontSize: 15, color: "#E94560" },

  btnOtraVez: { backgroundColor: "#E94560", borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  btnVolver:  { backgroundColor: "#333",    borderRadius: 16, paddingVertical: 14, alignItems: "center" },
  btnTextoBlanco:{ fontSize: 16, fontWeight: "700", color: "#FFF" },
  btnTextoGris:  { fontSize: 15, fontWeight: "600", color: "#AAA" },

  // Permisos
  permisoTitulo:{ fontSize: 22, fontWeight: "800", color: "#FFF", textAlign: "center", marginTop: 16 },
  permisoSub:   { fontSize: 15, color: "#888", textAlign: "center", marginTop: 6, marginBottom: 40 },
  btnPrimario:  { backgroundColor: "#E94560", borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40 },
  btnPrimarioTexto:{ fontSize: 17, fontWeight: "700", color: "#FFF" },
});
