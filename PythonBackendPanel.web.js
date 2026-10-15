import {useEffect, useRef, useState} from 'react';
import {View, Text, TextInput, TouchableOpacity, StyleSheet} from 'react-native';
import {API_POR_DEFECTO, normalizarUrlApi, consultarEstado, advertenciaDeUrl} from './translator';
import {translatorSettingsStore} from './translatorSettingsStore';
import {createPythonBackendClient, trainingMetrics} from './training/pythonBackendClient';

function Button({label, onPress, disabled}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[s.button,disabled && {opacity:0.45}]}><Text style={s.buttonText}>{label}</Text></TouchableOpacity>;
}
function Report({report, title}) {
  const metrics = trainingMetrics(report);
  return <View style={s.card}><Text style={s.subtitle}>{title}</Text>
    <View style={s.metrics}>{[['Aciertos globales',metrics.accuracy],['Aciertos entre respuestas',metrics.answeredAccuracy],['Entre las tres opciones',metrics.top3]].map(([label,value]) => <View key={label} style={s.metric}><Text style={s.number}>{value}</Text><Text style={s.muted}>{label}</Text></View>)}</View>
    <Text style={s.body}>{metrics.classes.length} palabras · {metrics.samples} secuencias evaluadas · {metrics.answered} respuestas por encima del umbral.</Text>
    <Text style={s.muted}>Los aciertos entre respuestas se calculan solo sobre las que superan el umbral. La validación cruzada utiliza las tomas disponibles; todavía falta evaluar con personas nuevas.</Text>
    <Text style={s.body}>{metrics.classes.join(' · ')}</Text>
  </View>;
}

export default function PythonBackendPanel({api, session, onAccessError, disabled, onTest}) {
  const [url,setUrl] = useState(API_POR_DEFECTO), [draft,setDraft] = useState(API_POR_DEFECTO);
  const [status,setStatus] = useState(null), [data,setData] = useState(null), [error,setError] = useState('');
  const [busy,setBusy] = useState(false), [ready,setReady] = useState(false);
  const alive = useRef(false), controller = useRef(null), locked = useRef(false);
  useEffect(() => {
    alive.current = true;
    translatorSettingsStore.load().then(saved => {
      if (!alive.current) return;
      const normalized = saved?.apiUrl && normalizarUrlApi(saved.apiUrl);
      if (normalized?.ok) {setUrl(normalized.url);setDraft(normalized.url);}
      setReady(true);
    }).catch(() => {if (alive.current) setReady(true);});
    return () => {alive.current=false;controller.current?.abort();};
  }, []);

  async function refresh(address, signal) {
    await api.overview(session);
    const connection = await consultarEstado({apiUrl:address});
    if (alive.current && !signal.aborted) setStatus(connection);
    if (!connection.ok) {if (alive.current) setData(null); throw new Error(connection.error);}
    const next = await createPythonBackendClient(address,session).status(signal);
    if (alive.current && !signal.aborted) setData(next);
  }
  async function act(operation) {
    if (locked.current || disabled) return;
    locked.current=true;setBusy(true);setError('');
    const abort = new AbortController();controller.current=abort;
    try {await operation(abort.signal);}
    catch (failure) {if (alive.current && !abort.signal.aborted) {setError(failure.message);onAccessError?.(failure);}}
    finally {locked.current=false;if (alive.current) setBusy(false);}
  }
  useEffect(() => {
    if (ready) act(signal => refresh(url,signal));
  }, [url,ready]);
  const active = data?.jobs?.find(job => ['queued','running'].includes(job.status));
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => act(signal => refresh(url,signal)), 2500);
    return () => clearInterval(timer);
  }, [active?.id,url]);
  const blocked = busy || disabled;
  const notice = advertenciaDeUrl(url, typeof window === 'undefined' ? '' : window.location.protocol);
  async function connect() {
    const normalized = normalizarUrlApi(draft);
    if (!normalized.ok) {setError(normalized.error);return;}
    await act(async signal => {
      await translatorSettingsStore.save({apiUrl:normalized.url});
      if (alive.current) {setUrl(normalized.url);setData(null);}
      await refresh(normalized.url,signal);
    });
  }
  async function start(operation) {
    await act(async signal => {
      await api.overview(session);
      await createPythonBackendClient(url,session).start(operation,signal);
      await refresh(url,signal);
    });
  }
  return <View>
    <View style={s.card}><Text style={s.subtitle}>Modelo de interpretación</Text>
      <Text style={s.body}>Consulta el modelo de Python que utiliza «Probar interpretación» y prepara nuevos candidatos con las grabaciones revisadas.</Text>
      <Text accessibilityRole="status" style={s.body}>{status?.ok ? `Python conectado · ${status.clases.length} palabras disponibles` : busy ? 'Comprobando Python…' : 'Python sin conexión'}</Text>
      <Text style={s.muted}>Inicia el backend con iniciar-proyecto.bat en este computador. El panel y la prueba de interpretación comparten la dirección del servidor.</Text>
      <Text style={s.body}>Dirección del servidor</Text><TextInput accessibilityLabel="Dirección del backend Python" value={draft} onChangeText={setDraft} autoCapitalize="none" placeholder="http://localhost:5000" placeholderTextColor="#999" style={s.input}/>
      <View style={s.actions}><Button label="Guardar y comprobar servidor" onPress={connect} disabled={blocked}/><Button label="Actualizar resultados" onPress={() => act(signal => refresh(url,signal))} disabled={blocked}/></View>
      {notice && <Text style={s.warning}>{notice}</Text>}
      {error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </View>
    <View style={s.card}><Text style={s.subtitle}>Prueba de interpretación (beta)</Text>
      <Text style={s.body}>Evalúa una seña por toma y revisa las opciones que devuelve el modelo. Esta prueba forma parte de las herramientas de entrenamiento.</Text>
      <Button label="Probar interpretación (beta)" onPress={onTest} disabled={disabled || !onTest}/>
    </View>
    {data?.report && <Report report={data.report} title="Resultados del modelo en uso"/>}
    <View style={s.card}><Text style={s.subtitle}>Preparar y entrenar</Text>
      <Text style={s.body}>1. Aprobar y revisar las grabaciones. 2. Importarlas al conjunto de Python. 3. Entrenar un candidato y revisar sus resultados.</Text>
      <View style={s.actions}><Button label="Importar grabaciones aprobadas" onPress={() => start('import')} disabled={blocked || !data || Boolean(active)}/><Button label="Entrenar nuevo candidato" onPress={() => start('train')} disabled={blocked || !data || Boolean(active)}/></View>
      <Text style={s.muted}>La importación prepara copias locales de las aprobadas. Cada entrenamiento guarda un candidato separado; el modelo de interpretación sigue disponible hasta que el equipo decida reemplazarlo. Mantén Python abierto durante el proceso.</Text>
      {data?.jobs?.slice().reverse().map(job => <View key={job.id} style={s.job}><Text style={s.body}>{job.operation === 'import' ? 'Importación de grabaciones' : 'Entrenamiento del candidato'} · {({queued:'En espera',running:'En curso',complete:'Completado',error:'Requiere revisión',cancelled:'Cancelado'})[job.status] || job.status}</Text>
        {['queued','running'].includes(job.status) && <Button label="Cancelar proceso de Python" disabled={blocked} onPress={() => act(async signal => {await createPythonBackendClient(url,session).cancel(job.id,signal);await refresh(url,signal);})}/>}
        {!!job.logs?.length && <details><summary>Ver progreso</summary><pre style={{whiteSpace:'pre-wrap',fontSize:12,color:'#CCC'}}>{job.logs.slice(-12).join('\n')}</pre></details>}
      </View>)}
    </View>
    {data?.candidates?.map(candidate => <Report key={candidate.id} report={candidate.report} title={`Candidato del ${new Date(candidate.report.fecha).toLocaleString('es-CL')}`}/>)}
  </View>;
}
const s = StyleSheet.create({card:{backgroundColor:'#1A1A2E',padding:18,borderRadius:14,marginVertical:8},subtitle:{color:'#FFF',fontSize:20,fontWeight:'700'},body:{color:'#D0D0DF',fontSize:14,lineHeight:23,marginVertical:8},muted:{color:'#AAAABC',fontSize:13,lineHeight:21},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:10},button:{backgroundColor:'#23877F',padding:13,borderRadius:10},buttonText:{color:'#FFF',fontSize:13,fontWeight:'700'},input:{color:'#FFF',backgroundColor:'#171729',borderColor:'#55556A',borderWidth:1,padding:12,borderRadius:8},metrics:{flexDirection:'row',flexWrap:'wrap',gap:12,marginVertical:12},metric:{flex:1,minWidth:170},number:{color:'#4ECDC4',fontSize:27,fontWeight:'800'},warning:{color:'#D8BD84',lineHeight:22},error:{color:'#FF9BAD',lineHeight:22},job:{borderTopColor:'#44445A',borderTopWidth:1,marginTop:12,paddingTop:8}});
