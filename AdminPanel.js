import { useEffect, useMemo, useRef, useState } from "react";
import { SafeAreaView, ScrollView, View, Text, TextInput, TouchableOpacity, ActivityIndicator, Image, StyleSheet, Platform } from "react-native";
import { AdminLogin } from "./AppWorkspace";
import { ADMIN_PAGE_SIZE, MODERATION_LABELS, createAdminClient, recordingPreview, validAdminSession } from "./adminClient";
import LschSources from "./LschSources";
import TrainingWorkbench from "./TrainingWorkbench";

function Action({ label, onPress, disabled, danger, secondary }) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress}
    style={[styles.action, secondary && styles.secondary, danger && styles.danger, disabled && styles.disabled]}>
    <Text style={styles.actionText}>{label}</Text>
  </TouchableOpacity>;
}

export default function AdminPanel({ client, onExit, onModerated }) {
  const api = useMemo(() => createAdminClient(client), [client]);
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const loadMaterial = useMemo(() => () => api.material(session).then(data => data.catalog), [api, session]);
  const sessionRef = useRef(null);
  const [section, setSection] = useState("recordings");
  const [status, setStatus] = useState("pending");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [listing, setListing] = useState(null);
  const [selected, setSelected] = useState([]);
  const [preview, setPreview] = useState(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [coverageQuery, setCoverageQuery] = useState("");
  const [coverageLimit, setCoverageLimit] = useState(25);
  const requestRef = useRef(0);
  const operationRef = useRef(false);
  const clipRequestRef = useRef(0);

  function invalidate() {
    sessionRef.current = null; setSession(null); setPassword(""); setPreview(null); setSelected([]); setListing(null); setOverview(null);
  }
  function fail(e) {
    if (e?.code === "session_expired") invalidate();
    setError(e?.message || "No se pudo completar la operación.");
  }
  useEffect(() => {
    sessionRef.current = session;
    if (!session) return;
    const timer = setTimeout(() => { invalidate(); setError("La sesión terminó. Vuelve a ingresar."); }, Math.max(0, session.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => () => {
    requestRef.current++; clipRequestRef.current++;
    const active = sessionRef.current;
    if (active) void api.logout(active).catch(() => {});
  }, [api]);
  useEffect(() => {
    if (!session || section !== "recordings") return;
    const requestId = ++requestRef.current;
    setLoading(true); setError(""); setSelected([]); setListing(null); setPreview(null); clipRequestRef.current++;
    const timer = setTimeout(() => {
      api.list(session, { status, query, page }).then(data => {
        if (requestId === requestRef.current) setListing(data);
      }).catch(e => { if (requestId === requestRef.current) fail(e); })
        .finally(() => { if (requestId === requestRef.current) setLoading(false); });
    }, query ? 300 : 0);
    return () => { clearTimeout(timer); if (requestId === requestRef.current) requestRef.current++; };
  }, [session, section, status, query, page, refresh]);
  useEffect(() => {
    if (!session || section !== "tools") return;
    let cancelled = false; setLoading(true); setError("");
    api.overview(session).then(data => { if (!cancelled) { setOverview(data); setNotice("Conexión comprobada."); } })
      .catch(e => { if (!cancelled) fail(e); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [session, section, refresh]);
  useEffect(() => {
    if (!preview || !playing) return;
    const timer = setInterval(() => setFrame(value => (value + 1) % preview.frames.length), preview.intervalMs);
    return () => clearInterval(timer);
  }, [preview, playing]);

  async function login() {
    if (operationRef.current) return;
    operationRef.current = true; setBusy(true); setError(""); setNotice("");
    try { const active = await api.login(password); sessionRef.current = active; setSession(active); setPassword(""); }
    catch(e) { fail(e); }
    finally { setBusy(false); operationRef.current = false; }
  }
  async function exit() {
    if (operationRef.current) return;
    const active = sessionRef.current; invalidate();
    if (active) void api.logout(active).catch(() => {});
    onExit();
  }
  async function openRecording(row) {
    if (operationRef.current || !validAdminSession(session)) return;
    const requestId = ++clipRequestRef.current;
    setPreview(null); setLoading(true); setError(""); setFrame(0); setPlaying(true);
    try {
      if (typeof row.path !== "string" || row.path.includes("..") || !row.path.endsWith(".json")) throw new Error("La ruta del archivo requiere revisión.");
      const result = await client.storage.from("contribuciones").download(row.path);
      if (result.error || !result.data) throw new Error("No se pudo descargar la grabación. Puedes reintentar.");
      if (result.data.size > 25_000_000) throw new Error("El archivo supera el tamaño permitido para esta vista previa.");
      const payload = JSON.parse(await result.data.text());
      if (payload.label && payload.label !== row.label) throw new Error("La etiqueta del archivo no coincide con el registro. Revisa esta grabación antes de aprobarla.");
      const sequence = recordingPreview(payload);
      if (requestId === clipRequestRef.current) setPreview({ ...sequence, row });
    } catch (e) { if (requestId === clipRequestRef.current) fail(e); }
    finally { if (requestId === clipRequestRef.current) setLoading(false); }
  }
  async function moderate(rows, target) {
    if (operationRef.current || rows.length === 0) return;
    operationRef.current = true; setBusy(true); setError(""); setNotice(""); clipRequestRef.current++;
    try {
      const data = await api.review(session, rows, target);
      setNotice(`Estado guardado: ${MODERATION_LABELS[target].toLocaleLowerCase("es")}. ${data.changed} grabación${data.changed === 1 ? "" : "es"} actualizada${data.changed === 1 ? "" : "s"}.`);
      setPreview(null); setSelected([]); setRefresh(value => value + 1); onModerated?.();
    } catch (e) { fail(e); }
    finally { operationRef.current = false; setBusy(false); }
  }
  const rows = listing?.rows || [];
  const picked = rows.filter(row => selected.includes(row.id));
  const preparation = overview?.preparation;
  const coverage = (preparation?.classes || []).filter(item => !coverageQuery.trim() || `${item.category} ${item.label}`.toLocaleLowerCase("es").includes(coverageQuery.toLocaleLowerCase("es").trim()));

  if (!session && Platform.OS === "web") return <AdminLogin password={password} setPassword={setPassword} login={login} exit={exit} busy={busy} error={error} />;

  if (!session) return <SafeAreaView style={styles.root}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.header}><Text style={styles.title}>Administración</Text><Action label="Volver" secondary onPress={exit} disabled={busy} /></View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Acceso privado</Text>
        <Text style={styles.muted}>Ingresa tu contraseña para revisar grabaciones y trabajar con el material de LSCh.</Text>
        <TextInput accessibilityLabel="Contraseña de administrador" secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={72}
          placeholder="Contraseña" placeholderTextColor="#9191A8" value={password} onChangeText={setPassword} onSubmitEditing={login} editable={!busy} style={styles.input} />
        <Action label={busy ? "Ingresando…" : "Entrar al panel"} onPress={login} disabled={busy || !password} />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </View>
    </ScrollView>
  </SafeAreaView>;

  if (section === "material") return <LschSources loadCatalog={loadMaterial} onAccessError={fail} onBack={() => setSection("recordings")} backLabel="Volver al administrador" />;
  if (section === "training") return <TrainingWorkbench api={api} session={session} client={client} onAccessError={fail} onBack={() => setSection("recordings")} onOpenMaterial={() => setSection("material")} />;

  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <View style={styles.header}><View style={{ flex: 1 }}><Text style={styles.title}>Administración</Text><Text style={styles.muted}>DeafApp · LSCh</Text></View><Action label="Cerrar sesión" secondary onPress={exit} disabled={busy} /></View>
    <View style={styles.actions}>
      <Action label="Grabaciones" secondary={section !== "recordings"} onPress={() => { setSection("recordings"); setNotice(""); setError(""); }} disabled={busy} />
      <Action label="Material de LSCh" secondary onPress={() => { setSection("material"); setPreview(null); clipRequestRef.current++; }} disabled={busy} />
      <Action label="Datos y diagnóstico" secondary={section !== "tools"} onPress={() => { setSection("tools"); setPreview(null); clipRequestRef.current++; setNotice(""); }} disabled={busy} />
      <Action label="Entrenamiento LSCh" secondary onPress={() => { setSection("training"); setPreview(null); clipRequestRef.current++; setNotice(""); }} disabled={busy} />
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {notice ? <Text accessibilityRole="status" style={styles.notice}>{notice}</Text> : null}
    {section === "recordings" && <>
      <View style={styles.stats}>{["pending", "approved", "rejected"].map(key => <View key={key} style={styles.stat}><Text style={styles.statNumber}>{listing?.counts?.[key] ?? "—"}</Text><Text style={styles.muted}>{MODERATION_LABELS[key]}s</Text></View>)}</View>
      <Text style={styles.muted}>Revisa cada seña antes de decidir. Rechazar conserva el archivo y lo excluye de las aprobadas.</Text>
      <View style={styles.actions}>{["pending", "approved", "rejected", "all"].map(key => <Action key={key} label={key === "all" ? "Todas" : `${MODERATION_LABELS[key]}s`} secondary={status !== key} onPress={() => { setStatus(key); setPage(0); setNotice(""); }} disabled={busy} />)}</View>
      <TextInput accessibilityLabel="Buscar grabaciones" placeholder="Buscar palabra o categoría…" placeholderTextColor="#9191A8" value={query} onChangeText={value => { setQuery(value); setPage(0); }} editable={!busy} style={styles.input} />
      <View style={styles.actions}><Action label="Actualizar grabaciones" secondary onPress={() => setRefresh(value => value + 1)} disabled={busy || loading} />
        <Action label={selected.length === rows.length && rows.length ? "Quitar selección" : "Seleccionar esta página"} secondary disabled={busy || loading || !rows.length} onPress={() => setSelected(selected.length === rows.length ? [] : rows.map(row => row.id))} /></View>
      {picked.length > 0 && <View style={styles.card}><Text style={styles.cardTitle}>{picked.length} seleccionada{picked.length === 1 ? "" : "s"}</Text><View style={styles.actions}>
        <Action label="Aprobar seleccionadas" onPress={() => moderate(picked, "approved")} disabled={busy || loading} />
        <Action label="Rechazar seleccionadas" danger onPress={() => moderate(picked, "rejected")} disabled={busy || loading} />
      </View></View>}
      {loading && <ActivityIndicator accessibilityLabel="Cargando grabaciones" size="large" color="#4ECDC4" style={{ margin: 14 }} />}
      {preview && <View style={styles.card}>
        <Text style={styles.cardTitle}>Revisando «{preview.row.label}»</Text><Text style={styles.muted}>{preview.row.category} · {MODERATION_LABELS[preview.row.status]}</Text>
        <Image accessibilityLabel={`Vista previa de ${preview.row.label}`} source={{ uri: preview.frames[frame] }} resizeMode="contain" style={{ width: "100%", aspectRatio: preview.aspectRatio, maxHeight: 440, backgroundColor: "#050509", borderRadius: 12, marginVertical: 14 }} />
        <Text style={styles.muted}>Fotograma {frame + 1} de {preview.frames.length}</Text>
        <View style={styles.actions}><Action label={playing ? "Pausar vista previa" : "Reproducir vista previa"} secondary onPress={() => setPlaying(value => !value)} disabled={busy} />
          <Action label="Aprobar grabación" onPress={() => moderate([preview.row], "approved")} disabled={busy} />
          <Action label="Rechazar grabación" danger onPress={() => moderate([preview.row], "rejected")} disabled={busy} />
          <Action label="Devolver a pendientes" secondary onPress={() => moderate([preview.row], "pending")} disabled={busy} />
        </View>
      </View>}
      {!loading && !error && rows.length === 0 && <Text style={styles.muted}>No hay grabaciones con este filtro.</Text>}
      {rows.map(row => <View key={row.id} style={styles.row}>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`Seleccionar grabación ${row.id}`} accessibilityState={{ checked: selected.includes(row.id), disabled: busy || loading }} disabled={busy || loading} style={styles.checkbox}
          onPress={() => setSelected(value => value.includes(row.id) ? value.filter(id => id !== row.id) : [...value, row.id])}><Text style={styles.checkText}>{selected.includes(row.id) ? "☑" : "☐"}</Text></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{row.label}</Text><Text style={styles.muted}>{row.category || "Sin categoría"} · #{row.id}</Text><Text style={styles.tag}>{MODERATION_LABELS[row.status]}</Text></View>
        <Action label={`Ver grabación ${row.id}`} secondary onPress={() => openRecording(row)} disabled={busy || loading} />
      </View>)}
      <View style={styles.actions}><Action label="Página anterior" secondary disabled={busy || loading || page === 0} onPress={() => setPage(value => value - 1)} />
        <Text style={styles.muted}>Página {page + 1} · {listing?.total ?? "—"} resultados</Text>
        <Action label="Página siguiente" secondary disabled={busy || loading || (page + 1) * ADMIN_PAGE_SIZE >= (listing?.total || 0)} onPress={() => setPage(value => value + 1)} /></View>
    </>}
    {section === "tools" && <>
      <Action label="Comprobar conexión y actualizar" onPress={() => setRefresh(value => value + 1)} disabled={loading} />
      {loading && <ActivityIndicator size="large" color="#4ECDC4" style={{ margin: 14 }} />}
      {preparation && <View style={styles.card}>
        <Text style={styles.cardTitle}>Preparación del entrenamiento</Text>
        <Text style={styles.muted}>Informe del {new Date(preparation.snapshotAt).toLocaleDateString("es-CL")}. Es una auditoría guardada; las nuevas grabaciones se incorporan al ejecutar otra preparación.</Text>
        <Text style={styles.body}>{preparation.inputRecordings} grabaciones examinadas · {preparation.acceptedRecordings} aptas para el preparador actual · {preparation.declaredParticipants} participantes identificados.</Text>
        <Text style={styles.body}>{preparation.targetClasses} entradas de vocabulario · {preparation.quarantinedRecordings} grabaciones pendientes de preparación.</Text>
        <Text style={styles.warning}>Todavía no hay un modelo de traducción entrenado. Las variaciones de una misma persona no equivalen a participantes nuevos.</Text>
        <TextInput accessibilityLabel="Buscar cobertura del vocabulario" placeholder="Buscar palabra o categoría…" placeholderTextColor="#9191A8" value={coverageQuery} onChangeText={value => { setCoverageQuery(value); setCoverageLimit(25); }} style={styles.input} />
        {coverage.slice(0, coverageLimit).map(item => <View key={item.classId} style={styles.coverageRow}><Text style={styles.rowTitle}>{item.label}</Text><Text style={styles.muted}>{item.category} · {item.recordings} muestras aptas · {item.declaredParticipants} personas</Text></View>)}
        {coverage.length > coverageLimit && <Action label="Mostrar más entradas" secondary onPress={() => setCoverageLimit(value => value + 25)} />}
      </View>}
      {!loading && overview && !preparation && <Text style={styles.muted}>No hay un informe de preparación guardado todavía.</Text>}
    </>}
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F0F1E" }, content: { width: "100%", maxWidth: 940, alignSelf: "center", padding: 20, paddingBottom: 48 },
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 22 }, title: { color: "#FFF", fontSize: 25, fontWeight: "800", flex: 1 },
  card: { backgroundColor: "#1A1A2E", borderRadius: 16, padding: 20, marginVertical: 12 }, cardTitle: { color: "#FFF", fontSize: 19, fontWeight: "700", marginBottom: 10 },
  muted: { color: "#AAAABC", fontSize: 13, lineHeight: 21 }, body: { color: "#E2E2EA", lineHeight: 24, marginVertical: 8 }, warning: { color: "#D8BD84", fontSize: 13, lineHeight: 21, marginVertical: 10 },
  input: { color: "#FFF", backgroundColor: "#171729", borderColor: "#55556A", borderWidth: 1, padding: 14, borderRadius: 10, marginVertical: 14, fontSize: 16 },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 10, marginVertical: 10 },
  action: { backgroundColor: "#23877F", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: "#23877F", alignItems: "center" },
  secondary: { backgroundColor: "transparent", borderColor: "#55556A" }, danger: { backgroundColor: "#AD304A", borderColor: "#AD304A" }, disabled: { opacity: 0.45 }, actionText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  error: { color: "#FF9BAD", lineHeight: 22, marginVertical: 12 }, notice: { color: "#77DECF", marginVertical: 12, lineHeight: 22 },
  stats: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 18 }, stat: { flex: 1, minWidth: 120, backgroundColor: "#1A1A2E", padding: 18, borderRadius: 12 }, statNumber: { color: "#FFF", fontWeight: "800", fontSize: 27 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#1A1A2E", borderRadius: 12, padding: 14, marginVertical: 5 }, rowTitle: { color: "#FFF", fontSize: 15, fontWeight: "700" },
  checkbox: { padding: 8 }, checkText: { color: "#4ECDC4", fontSize: 25 }, tag: { color: "#9EDDD7", fontSize: 12, marginTop: 4 }, coverageRow: { borderBottomColor: "#343447", borderBottomWidth: 1, paddingVertical: 10 },
});
