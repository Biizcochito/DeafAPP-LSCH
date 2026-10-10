import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CameraView } from "expo-camera";
import { displayWord } from "./ui/signNames";
import useTranslator from "./useTranslator";
import { TOTAL_FOTOGRAMAS, titularDeResultado } from "./translator";

// «Probar el traductor» en el celular: una seña por clip. La app (que no calcula puntos) manda los 30 fotogramas a la
// API de LSCh, que los procesa con el mismo MediaPipe con que se armó el dataset y responde con las 3 señas más probables.
export default function TranslatorScreen({ onBack }) {
  const t = useTranslator();
  const { servidor, fase, resumen } = t;
  const sinPermiso = t.permission && !t.permission.granted;

  return <View style={s.root}>
    <View style={s.top}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Volver" onPress={onBack} disabled={t.ocupada} style={s.volver}><Text style={s.volverTexto}>‹ Volver</Text></TouchableOpacity>
      <Text style={s.titulo}>Probar el traductor</Text>
      <Text style={s.beta}>BETA</Text>
    </View>
    <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">
      <View style={s.marco}>
        {!t.permission ? <View style={s.cubierta}><ActivityIndicator color="#d6f36a" /></View>
          : sinPermiso ? <View style={s.cubierta}>
              <Text style={s.cubiertaTexto}>Necesito la cámara para ver tus manos.</Text>
              <TouchableOpacity accessibilityRole="button" style={s.primario} onPress={t.requestPermission}><Text style={s.primarioTexto}>Permitir cámara</Text></TouchableOpacity>
            </View>
          : <CameraView ref={t.camara} style={StyleSheet.absoluteFill} facing="front" onCameraReady={() => t.setCamaraLista(true)} onMountError={t.falloDeCamara} />}
        {fase === "cuenta" && t.cuenta ? <View style={s.capa} pointerEvents="none"><Text style={s.cuenta}>{t.cuenta}</Text></View> : null}
        {fase === "capturando" ? <View style={s.progreso}><Text style={s.progresoTexto}>Haz la seña · {t.progreso}/{TOTAL_FOTOGRAMAS}</Text><View style={s.barraFondo}><View style={[s.barra, { width: `${(t.progreso / TOTAL_FOTOGRAMAS) * 100}%` }]} /></View></View> : null}
        {fase === "analizando" ? <View style={[s.capa, s.capaOscura]} pointerEvents="none"><ActivityIndicator size="large" color="#d6f36a" /><Text style={s.analizando}>Analizando…</Text></View> : null}
      </View>

      <Text style={[s.estado, servidor.fase === "ok" ? s.estadoOk : servidor.fase === "error" ? s.estadoError : null]} accessibilityRole="text">
        {servidor.fase === "comprobando" ? "Conectando con el servidor…" : servidor.fase === "ok" ? `Servidor conectado · ${servidor.clases.length} palabras` : "Sin conexión con el servidor"}
      </Text>
      {servidor.fase === "error" ? <Text style={s.error}>{servidor.mensaje} Revisa la dirección en «Servidor».</Text> : null}

      {fase === "resultado" && resumen ? <View style={s.resultado}>
        <Text style={s.resultadoEtiqueta}>{resumen.sinManos ? "NO PUDE VERTE LAS MANOS" : "RESULTADO"}</Text>
        <Text style={s.resultadoTitular} accessibilityLiveRegion="polite">{titularDeResultado(resumen)}</Text>
        {!resumen.sinManos ? resumen.candidatos.map(c => <View key={c.sena} style={s.fila}>
          <Text style={[s.filaNombre, c.principal && s.filaPrincipal]} numberOfLines={1}>{c.nombre}</Text>
          <View style={s.filaFondo}><View style={[s.filaBarra, c.principal && s.filaBarraPrincipal, { width: `${c.porcentaje}%` }]} /></View>
          <Text style={s.filaPorcentaje}>{c.porcentaje}%</Text>
        </View>) : null}
        <View style={s.acciones}>
          <TouchableOpacity accessibilityRole="button" style={[s.primario, !t.listaParaTraducir && s.apagado]} onPress={t.traducir} disabled={!t.listaParaTraducir}><Text style={s.primarioTexto}>Traducir otra seña</Text></TouchableOpacity>
          {!resumen.sinManos ? <TouchableOpacity accessibilityRole="button" style={s.secundario} onPress={t.escuchar}><Text style={s.secundarioTexto}>Escuchar</Text></TouchableOpacity> : null}
        </View>
        {!resumen.sinManos ? <Text style={s.nota}>Con pocos datos el traductor puede equivocarse, por eso muestra tres opciones: la seña correcta suele estar entre ellas.</Text> : null}
      </View> : <View style={s.guia}>
        {["Colócate de modo que se vean tus manos y tu cara.", "Pulsa «Traducir una seña» y espera la cuenta atrás.", "Haz una seña durante unos 3 segundos."].map((texto, i) => <View key={texto} style={s.guiaFila}><Text style={s.guiaNumero}>{i + 1}</Text><Text style={s.guiaTexto}>{texto}</Text></View>)}
        {fase === "error" ? <Text style={s.error}>{t.error}</Text> : null}
        <TouchableOpacity accessibilityRole="button" style={[s.primario, s.grande, !t.listaParaTraducir && s.apagado]} onPress={t.traducir} disabled={!t.listaParaTraducir}>
          <Text style={s.primarioTexto}>{t.ocupada ? (fase === "analizando" ? "Analizando…" : "Un momento…") : "Traducir una seña"}</Text>
        </TouchableOpacity>
      </View>}

      {servidor.fase === "ok" && servidor.clases.length > 0 ? <View style={s.caja}>
        <Text style={s.cajaTitulo}>Palabras que reconoce ({servidor.clases.length})</Text>
        <View style={s.fichas}>{servidor.clases.map(c => <Text key={c} style={s.ficha}>{displayWord(c)}</Text>)}</View>
      </View> : null}

      <View style={s.caja}>
        <Text style={s.cajaTitulo}>Servidor</Text>
        <Text style={s.cajaAyuda}>Dirección de la API de LSCh. Con el túnel de Cloudflare es una dirección https://…trycloudflare.com.</Text>
        <TextInput style={s.entrada} value={t.borrador} onChangeText={t.setBorrador} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://algo.trycloudflare.com" placeholderTextColor="#a9b5ad" accessibilityLabel="Dirección de la API de LSCh" />
        {t.errorUrl ? <Text style={s.error}>{t.errorUrl}</Text> : null}
        <TouchableOpacity accessibilityRole="button" style={s.secundario} onPress={t.guardarServidor}><Text style={s.secundarioTexto}>Guardar y probar</Text></TouchableOpacity>
      </View>
    </ScrollView>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#080c0a" },
  top: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingTop: 48, paddingBottom: 10 },
  volver: { paddingVertical: 8, paddingRight: 10 },
  volverTexto: { color: "#a9b5ad", fontSize: 15 },
  titulo: { flex: 1, color: "#f5f2eb", fontSize: 22, fontWeight: "700" },
  beta: { color: "#d6f36a", fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  contenido: { padding: 18, paddingBottom: 48, gap: 16 },
  marco: { aspectRatio: 3 / 4, overflow: "hidden", borderRadius: 24, backgroundColor: "#111a15", borderWidth: 1, borderColor: "#2a3a30" },
  cubierta: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", gap: 14, padding: 24 },
  cubiertaTexto: { color: "#a9b5ad", fontSize: 15, textAlign: "center" },
  capa: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  capaOscura: { backgroundColor: "rgba(8,12,10,.55)", gap: 12 },
  cuenta: { color: "#d6f36a", fontSize: 140, fontWeight: "800" },
  analizando: { color: "#f5f2eb", fontSize: 20, fontWeight: "600" },
  progreso: { position: "absolute", left: 14, right: 14, bottom: 14, padding: 12, borderRadius: 18, backgroundColor: "rgba(8,12,10,.78)", gap: 8 },
  progresoTexto: { color: "#f5f2eb", fontSize: 13 },
  barraFondo: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,.16)", overflow: "hidden" },
  barra: { height: 6, backgroundColor: "#d6f36a" },
  estado: { alignSelf: "flex-start", color: "#a9b5ad", fontSize: 13, borderWidth: 1, borderColor: "#2a3a30", borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  estadoOk: { color: "#4ee0b5", borderColor: "#4ee0b5" },
  estadoError: { color: "#ff8e72", borderColor: "#ff8e72" },
  error: { color: "#f5f2eb", fontSize: 14, borderWidth: 1, borderColor: "#ff8e72", backgroundColor: "rgba(255,142,114,.1)", borderRadius: 14, padding: 12 },
  guia: { gap: 12 },
  guiaFila: { flexDirection: "row", alignItems: "center", gap: 12 },
  guiaNumero: { width: 28, height: 28, borderRadius: 14, overflow: "hidden", textAlign: "center", lineHeight: 28, color: "#d6f36a", backgroundColor: "rgba(214,243,106,.14)", fontWeight: "700" },
  guiaTexto: { flex: 1, color: "#a9b5ad", fontSize: 15 },
  primario: { minHeight: 50, alignItems: "center", justifyContent: "center", borderRadius: 999, paddingHorizontal: 22, backgroundColor: "#d6f36a" },
  grande: { minHeight: 56 },
  primarioTexto: { color: "#080c0a", fontSize: 16, fontWeight: "700" },
  secundario: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: 999, paddingHorizontal: 20, borderWidth: 1, borderColor: "#a9b5ad" },
  secundarioTexto: { color: "#f5f2eb", fontSize: 15, fontWeight: "600" },
  apagado: { opacity: 0.45 },
  resultado: { gap: 10, padding: 18, borderRadius: 22, backgroundColor: "#111a15", borderWidth: 1, borderColor: "#2a3a30" },
  resultadoEtiqueta: { color: "#a9b5ad", fontSize: 12, fontWeight: "600", letterSpacing: 1 },
  resultadoTitular: { color: "#f5f2eb", fontSize: 26, fontWeight: "700" },
  fila: { flexDirection: "row", alignItems: "center", gap: 10 },
  filaNombre: { width: 96, color: "#a9b5ad", fontSize: 15 },
  filaPrincipal: { color: "#f5f2eb", fontWeight: "700" },
  filaFondo: { flex: 1, height: 12, borderRadius: 6, backgroundColor: "rgba(255,255,255,.08)", overflow: "hidden" },
  filaBarra: { height: 12, borderRadius: 6, backgroundColor: "rgba(245,242,235,.5)" },
  filaBarraPrincipal: { backgroundColor: "#d6f36a" },
  filaPorcentaje: { width: 44, textAlign: "right", color: "#f5f2eb", fontSize: 14 },
  acciones: { gap: 10, marginTop: 8 },
  nota: { color: "#a9b5ad", fontSize: 13 },
  caja: { gap: 10, padding: 16, borderRadius: 18, borderWidth: 1, borderColor: "#2a3a30" },
  cajaTitulo: { color: "#f5f2eb", fontSize: 15, fontWeight: "600" },
  cajaAyuda: { color: "#a9b5ad", fontSize: 13 },
  fichas: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  ficha: { color: "#f5f2eb", fontSize: 12.5, backgroundColor: "rgba(255,255,255,.07)", borderRadius: 999, overflow: "hidden", paddingVertical: 4, paddingHorizontal: 11 },
  entrada: { minHeight: 46, borderWidth: 1, borderColor: "#a9b5ad", borderRadius: 14, paddingHorizontal: 14, color: "#f5f2eb", fontSize: 15 },
});
