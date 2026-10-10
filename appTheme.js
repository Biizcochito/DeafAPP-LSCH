// Keep the camera and review flows in the web app's palette while retaining
// the existing native styles. Only presentation values are translated.
const colors = {
  "#0F0F1E": "#080c0a", "#1A1A2E": "#111a15", "#333": "#2a3a30",
  "#FFF": "#f5f2eb", "#AAA": "#a9b5ad", "#DDD": "#f5f2eb",
  "#888": "#a9b5ad", "#999": "#a9b5ad", "#666": "#a9b5ad",
  "#E94560": "#d6f36a", "#4ECDC4": "#d6f36a", "#E74C3C": "#ff8e72",
  "#BCE9E5": "#f5f2eb",
};
export function themeWebStyles(definitions, web) {
  if (!web) return definitions;
  const themed = Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
    const value = Object.fromEntries(Object.entries(definition).map(([key, item]) => [key, typeof item === "string" ? colors[item] || item : item]));
    if (value.fontSize) value.fontFamily = "Onest";
    return [name, value];
  }));
  Object.assign(themed.btnGrabarGrande, { borderRadius:12, width:"100%" });
  for (const name of ["btnGrabarGrandeTexto", "btnPrimarioTexto"]) themed[name].color = "#080c0a";
  // btnTextoBlanco is shared by primary and secondary review actions.
  // Preserve cream for secondary controls and give lime actions their own text.
  themed.btnTextoPrimario = { ...themed.btnTextoBlanco, color:"#080c0a" };
  themed.grabarTitulo.fontFamily = "Bricolage Grotesque";
  themed.grabarTitulo.letterSpacing = -1;
  themed.grabarTitulo.fontWeight = "700";
  themed.ayudaManosBox.borderLeftWidth = 0;
  themed.grabarContenido.paddingBottom = 34;
  // Avisos sobre la cámara: se apartan de las esquinas del marco de grabación de RecordingScreens.web.js.
  Object.assign(themed.countdownOverlay, { top:56, right:24, minWidth:84, borderRadius:24, backgroundColor:"rgba(8,12,10,.62)" });
  Object.assign(themed.countdownTexto, { fontFamily:"Bricolage Grotesque", fontSize:84, fontWeight:"800", color:"#d6f36a" });
  Object.assign(themed.recIndicador, { top:20, left:56, borderRadius:999, backgroundColor:"rgba(8,12,10,.72)" });
  Object.assign(themed.gestoAviso, { bottom:30, left:26, right:26, borderRadius:18 });
  return themed;
}
