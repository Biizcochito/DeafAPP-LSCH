import { useEffect, useMemo, useState } from "react";
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Linking, StyleSheet } from "react-native";
import { EDUCATIONAL_SOURCES } from "./training/educationalSources";
import { safeSourceUrl } from "./training/sourceCatalog";

const searchText = value => value.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export default function LschSources({ onBack, loadCatalog, onAccessError, backLabel = "Volver al administrador" }) {
  const [catalog, setCatalog] = useState(null);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    Promise.resolve().then(() => { if (!loadCatalog) throw new Error(); return loadCatalog(); })
      .then(value => {
        if (value?.language !== "csg" || !Array.isArray(value.videos)) throw new Error();
        if (!cancelled) setCatalog(value);
      })
      .catch(e => { if (!cancelled) { setError("No se pudo cargar el catálogo. Puedes reintentar."); if (e?.code === "session_expired") onAccessError?.(e); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt, loadCatalog]);
  const matching = useMemo(() => {
    const term = searchText(query.trim());
    return (catalog?.videos || []).filter(video => !term || searchText(`${video.title} ${video.channel}`).includes(term));
  }, [catalog, query]);
  const educational = EDUCATIONAL_SOURCES.filter(source => !query.trim() || searchText(`${source.title} ${source.author}`).includes(searchText(query.trim())));
  const open = async url => {
    const safe = safeSourceUrl(url);
    if (!safe) return;
    try { await Linking.openURL(safe); } catch { setError("No se pudo abrir el enlace. Inténtalo de nuevo."); }
  };
  return <SafeAreaView style={styles.root}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={backLabel} onPress={onBack}><Text style={styles.back}>‹</Text></TouchableOpacity>
      <Text style={styles.title}>Material de LSCh</Text>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.intro}>Explora recursos de Lengua de Señas Chilena y consulta quién los publicó.</Text>
      <View style={styles.notice}><Text style={styles.note}>Estos enlaces ayudan a encontrar ejemplos. Cada seña y sus variantes deben revisarse antes de usarlas para enseñar o entrenar el traductor.</Text></View>
      <TextInput accessibilityLabel="Buscar material de LSCh" placeholder="Buscar tema o fuente…" placeholderTextColor="#888" value={query} onChangeText={text => { setQuery(text); setPage(1); }} style={styles.input} />
      <Text style={styles.section}>Recursos educativos</Text>
      {educational.map(source => <View key={source.id} style={styles.card}>
        <Text style={styles.cardTitle}>{source.title}</Text><Text style={styles.note}>{source.author}</Text>
        <Text style={styles.tag}>{source.statusNote || "Referencia temática · fragmentos pendientes de revisar"}</Text>
        <View style={styles.actions}>
          <TouchableOpacity accessibilityRole="link" accessibilityLabel={`Ver ${source.title}`} onPress={() => open(source.url)}><Text style={styles.link}>Ver recurso ↗</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="link" accessibilityLabel={`Fuente de ${source.title}`} onPress={() => open(source.sourceUrl)}><Text style={styles.link}>Consultar fuente ↗</Text></TouchableOpacity>
        </View>
      </View>)}
      {loading && <ActivityIndicator color="#4ECDC4" style={{ marginVertical: 12 }} />}
      {!!error && <View style={styles.notice}><Text accessibilityRole="alert" style={styles.note}>{error}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Reintentar catálogo" onPress={() => setAttempt(attempt + 1)}><Text style={styles.link}>Reintentar catálogo</Text></TouchableOpacity>
      </View>}
      {catalog && <>
        <Text style={styles.section}>Catálogo académico · {catalog.videos.length} videos de LSCh</Text>
        <Text style={styles.note}>{catalog.channels.length} fuentes · {Math.round(catalog.totalDurationSeconds / 3600)} horas de material catalogado. La disponibilidad de cada video puede cambiar.</Text>
        <Text style={styles.note}>Recopilación TUB / DFKI. Los títulos y subtítulos todavía no están validados como etiquetas de señas. Las condiciones de uso de cada video se revisan por separado.</Text>
        <Text style={styles.results}>{matching.length} resultados por título o fuente</Text>
        {matching.slice(0, page * 20).map(video => <View key={video.id} style={styles.card}>
          <Text style={styles.cardTitle}>{video.title}</Text><Text style={styles.note}>{video.channel}</Text>
          <Text style={styles.tag}>Pendiente de revisar · licencia indicada: {video.reportedLicense}</Text>
          <TouchableOpacity accessibilityRole="link" accessibilityLabel={`Abrir original: ${video.title}`} onPress={() => open(video.url)}><Text style={styles.link}>Abrir original ↗</Text></TouchableOpacity>
        </View>)}
        {matching.length > page * 20 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Mostrar más recursos" onPress={() => setPage(page + 1)} style={styles.more}><Text style={styles.link}>Mostrar más recursos</Text></TouchableOpacity>}
        {!matching.length && <Text style={styles.note}>No encontramos ese término en los títulos. Eso no confirma que la seña falte dentro de los videos.</Text>}
        <TouchableOpacity accessibilityRole="link" accessibilityLabel="Consultar catálogo académico" onPress={() => open(catalog.repository)}><Text style={styles.link}>Consultar catálogo académico ↗</Text></TouchableOpacity>
      </>}
    </ScrollView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F0F1E" },
  header: { width: "100%", maxWidth: 800, alignSelf: "center", paddingHorizontal: 18, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 18 },
  back: { color: "#FFF", fontSize: 34, paddingHorizontal: 8 }, title: { color: "#FFF", fontSize: 22, fontWeight: "800", flex: 1 },
  content: { width: "100%", maxWidth: 800, alignSelf: "center", padding: 18, paddingBottom: 40 },
  intro: { color: "#DDD", fontSize: 16, lineHeight: 24, marginBottom: 12 },
  notice: { backgroundColor: "#241E2E", padding: 12, borderRadius: 12, marginBottom: 12 },
  note: { color: "#AAA", fontSize: 13, lineHeight: 20 },
  input: { backgroundColor: "#1A1A2E", color: "#FFF", borderWidth: 1, borderColor: "#4ECDC4", borderRadius: 12, padding: 14, marginBottom: 10, fontSize: 15 },
  section: { color: "#FFF", fontSize: 17, fontWeight: "800", marginTop: 18, marginBottom: 12 },
  card: { backgroundColor: "#1A1A2E", borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTitle: { color: "#FFF", fontSize: 15, fontWeight: "700", lineHeight: 22, marginBottom: 6 },
  tag: { color: "#C8B98E", fontSize: 11, lineHeight: 17, marginTop: 8 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 20 },
  link: { color: "#4ECDC4", fontWeight: "700", fontSize: 13, paddingVertical: 10 },
  results: { color: "#AAA", marginVertical: 12 }, more: { alignItems: "center", borderWidth: 1, borderColor: "#4ECDC4", borderRadius: 12 },
});
