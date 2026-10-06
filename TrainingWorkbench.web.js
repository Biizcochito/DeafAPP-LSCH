import {useEffect,useRef,useState} from 'react';
import {SafeAreaView,ScrollView,View,Text,TextInput,TouchableOpacity,ActivityIndicator,StyleSheet} from 'react-native';
import {createTrainingPlan} from './training/trainingPlan';
import {prepareDataset} from './training/datasetPreparation';
import {buildReviewedBrowserDataset,assertReviewSnapshotCurrent} from './training/browserDataset';
import {loadTrainingTensorflow} from './training/tensorflowBrowser';
import {trainReviewedModel} from './training/modelTraining';
import LegacyRecoveryPanel from './LegacyRecoveryPanel.web';
const states={ready:'Lista para un primer entrenamiento','needs-samples':'Faltan muestras separadas','needs-preparation':'Aprobadas que requieren preparación','needs-material':'Falta material revisado'};
const automaticSourceReason='Origen automático sin identidad confirmada: disponible para recuperación experimental; pendiente de revisión para evaluar con personas distintas';
const reasons={'unknown-label-or-category':'Etiqueta/categoría fuera del vocabulario','missing-or-invalid-training-metadata':'Faltan puntos, tiempos o perfil de captura','invalid-jpeg-sequence':'Formato de imágenes por revisar','insufficient-fresh-hands':'Faltan detecciones recientes de manos','insufficient-fresh-face':'Faltan detecciones recientes de cara','too-few-distinct-hand-results':'El trazado se repite sin nuevas detecciones','not-approved':'Pendiente de aprobación','download-failed':'No se pudo abrir el archivo','insufficient-recovered-hands':'Esta toma necesita revisar la visibilidad de las manos','insufficient-recovered-face':'Esta toma necesita revisar la visibilidad de la cara','needs-legacy-label-review':'Falta confirmar una seña exacta del vocabulario'};
function Button({label,onPress,disabled}){return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:0.4}]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;}
export default function TrainingWorkbench({api,session,client,onBack,onAccessError,onOpenMaterial}){
  const [dataset,setDataset]=useState(()=>prepareDataset([])),[plan,setPlan]=useState(()=>createTrainingPlan(prepareDataset([])));
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState('Analiza las grabaciones aprobadas para actualizar las prioridades.'),[error,setError]=useState(''),[query,setQuery]=useState(''),[filter,setFilter]=useState('all'),[limit,setLimit]=useState(25),[report,setReport]=useState(null),[selected,setSelected]=useState([]);
  const alive=useRef(true),controller=useRef(null),lock=useRef(false);
  const [recovering,setRecovering]=useState(false);
  const [savedCandidates,setSavedCandidates]=useState([]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();};},[]);
  async function analyze(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setReport(null);const abort=new AbortController();controller.current=abort;
    try{const data=await buildReviewedBrowserDataset({api,session,client,signal:abort.signal,onProgress:value=>{if(alive.current)setProgress(value);}});await api.overview(session);
      if(alive.current){const next=createTrainingPlan(data,{approvedCounts:data.approvedCounts});setDataset(data);setPlan(next);setSelected(next.readyClasses.slice(0,12));setProgress(`Análisis completo: ${data.report.inputRecordings} aprobadas examinadas, ${data.report.acceptedRecordings} aptas para entrenamiento.`);}}
    catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function train(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setReport(null);const abort=new AbortController();controller.current=abort;let trained;
    try{
      setProgress('Comprobando que las aprobaciones sigan vigentes…');await assertReviewSnapshotCurrent(dataset,api,session,abort.signal);
      const tf=await loadTrainingTensorflow();if(abort.signal.aborted)throw new Error('Entrenamiento cancelado.');
      trained=await trainReviewedModel(dataset,{tf,classIds:selected,signal:abort.signal,onProgress:value=>{if(alive.current)setProgress(value.stage==='evaluation'?(plan.mode==='personal-prototype'?'Comprobando grabaciones reservadas del prototipo…':'Comprobando con las personas reservadas para prueba…'):`Aprendiendo patrones: pasada ${value.epoch} de ${value.epochs}…`);}});
      await assertReviewSnapshotCurrent(dataset,api,session,abort.signal);
      if(!alive.current||abort.signal.aborted)throw new Error('Entrenamiento cancelado.');
      trained.model.setUserDefinedMetadata({report:trained.report,featureLayout:dataset.featureLayout});
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({mode:plan.mode,classes:trained.report.classes})));
      const groupId=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('').slice(0,16);
      if(abort.signal.aborted)throw new Error('Entrenamiento cancelado.');
      await trained.model.save(`indexeddb://deafapp-lsch-candidate-${groupId}`,{includeOptimizer:false});
      if(alive.current){setReport(trained.report);setProgress('Modelo candidato guardado en este navegador. Requiere revisión y pruebas con cámara antes de incorporarlo a la web pública.');}
    }catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
    finally{trained?.model.dispose();lock.current=false;if(alive.current)setBusy(false);}
  }
  async function importPrepared(event){
    const file=event.target.files?.[0];event.target.value='';if(!file||lock.current)return;
    lock.current=true;setBusy(true);setError('');const abort=new AbortController();controller.current=abort;
    try{
      if(file.size>64_000_000)throw new Error('El conjunto supera el tamaño permitido para este navegador.');
      const data=JSON.parse(await file.text());
      if(data.reviewedBundleVersion!==1||!Array.isArray(data.reviewSnapshot)||data.approvedCounts&&Object.values(data.approvedCounts).some(n=>!Number.isInteger(n)||n<0))throw new Error('Importa el archivo dataset.json generado por la preparación de DeafApp.');
      const next=createTrainingPlan(data,{approvedCounts:data.approvedCounts});
      await assertReviewSnapshotCurrent(data,api,session,abort.signal);
      if(alive.current&&!abort.signal.aborted){setDataset(data);setPlan(next);setSelected(next.readyClasses.slice(0,next.minimums.maxClassesPerGroup));setReport(null);setProgress(`Conjunto local preparado: ${next.usableRecordings} muestras aptas. Incluye solamente las revisiones registradas por el preparador; el archivo permanece en tu navegador.`);}
    }catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function readSavedCandidates(){
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setProgress('Abriendo informes de modelos guardados en este navegador…');const abort=new AbortController();controller.current=abort;
    try{await api.overview(session);const tf=await loadTrainingTensorflow(),models=await tf.io.listModels(),found=[];
      for(const url of Object.keys(models).filter(value=>value.startsWith('indexeddb://deafapp-lsch-candidate-')).slice(0,100)){
        if(abort.signal.aborted)throw new Error('Lectura cancelada.');let model;
        try{model=await tf.loadLayersModel(url);const metadata=model.getUserDefinedMetadata();if(metadata?.report?.publicActivation===false&&Array.isArray(metadata.report.classes))found.push({url,report:metadata.report});}
        finally{model?.dispose();}
      }
      await api.overview(session);if(alive.current&&!abort.signal.aborted){setSavedCandidates(found.sort((a,b)=>b.report.createdAt.localeCompare(a.report.createdAt)));setProgress(`${found.length} modelos candidatos locales encontrados. Sus informes describen pruebas anteriores; no activan la traducción pública.`);}
    }catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  const term=query.trim().toLocaleLowerCase('es');
  const rows=plan.rows.filter(row=>(filter==='all'||filter===row.state)&&(!term||`${row.label} ${row.category}`.toLocaleLowerCase('es').includes(term)));
  const personal=plan.mode==='personal-prototype',maxClasses=plan.minimums.maxClassesPerGroup;
  if(recovering)return <LegacyRecoveryPanel api={api} session={session} client={client} onAccessError={onAccessError} onBack={()=>setRecovering(false)} onUsePrototype={data=>{const next=createTrainingPlan(data,{approvedCounts:data.approvedCounts});setDataset(data);setPlan(next);setSelected(next.readyClasses.slice(0,next.minimums.maxClassesPerGroup));setReport(null);setError('');setQuery('');setFilter('ready');setLimit(25);setProgress(`Prototipo experimental preparado: ${next.usableRecordings} grabaciones recuperadas. La prueba reserva otras grabaciones, sin garantizar personas distintas.`);setRecovering(false);}}/>;
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.actions}><Text style={styles.title}>Entrenamiento LSCh</Text><Button label="Volver al administrador" onPress={onBack}/></View>
    <Text style={styles.body}>Seguimiento de las {plan.totalClasses} entradas del vocabulario. Incorporamos primero las señas con muestras revisadas y suficientes para aprender y probar.</Text>
    <View style={styles.card}><Text style={styles.subtitle}>Cómo se entrenará</Text>
      <Text style={styles.body}>1. Revisar significado y permisos de cada fragmento. 2. Extraer puntos de manos y cara y comprobar su calidad. 3. Reservar personas para la prueba. 4. Aprender patrones de movimiento. 5. Medir errores por seña y probar con cámara antes de habilitar un modelo.</Text>
      <Text style={styles.warning}>{personal?'Modo experimental: al menos una grabación para aprender y otra distinta para una prueba interna por seña. Pueden pertenecer a la misma persona. El movimiento se representa por el orden de las imágenes; no se recupera una velocidad que el archivo no guardó.':'Modo de evaluación independiente: 5 originales de aprendizaje y 2 de prueba por seña, con personas separadas. Este mínimo permite un primer experimento y no garantiza buena precisión.'} Las variaciones artificiales no cuentan como grabaciones nuevas.</Text>
    </View>
    <View style={styles.actions}><Button label="Analizar grabaciones aprobadas" onPress={analyze} disabled={busy}/><Button label="Recuperar grabaciones antiguas" onPress={()=>setRecovering(true)} disabled={busy}/><Button label="Consultar material de LSCh" onPress={onOpenMaterial} disabled={busy}/></View>
    <Button label="Ver modelos guardados en este navegador" onPress={readSavedCandidates} disabled={busy}/>
    {savedCandidates.map(candidate=><View key={candidate.url} style={styles.card}><Text style={styles.subtitle}>{candidate.report.mode==='personal-prototype'?'Prototipo experimental':'Candidato de evaluación independiente'}</Text><Text style={styles.body}>{candidate.report.classes.join(' · ')} · {new Date(candidate.report.createdAt).toLocaleString('es-CL')}</Text><Button label={`Mostrar informe: ${candidate.report.classes.join(', ')}`} onPress={()=>setReport(candidate.report)} disabled={busy}/></View>)}
    <View style={styles.card}><Text style={styles.subtitle}>Incorporar material externo revisado</Text><Text style={styles.body}>Después de verificar la seña y el permiso de uso, el preparador local genera dataset.json con los puntos y las muestras separadas. Puedes importarlo aquí para entrenar el grupo disponible. Seleccionar el archivo no lo sube a ningún servicio.</Text><input type="file" accept=".json,application/json" aria-label="Importar conjunto preparado de LSCh" disabled={busy} onChange={importPrepared} style={{color:'#DDD',maxWidth:'100%'}}/></View>
    <Text accessibilityRole="status" style={styles.body}>{progress}</Text>{busy&&<><ActivityIndicator color="#4ECDC4"/><Button label="Cancelar proceso" onPress={()=>controller.current?.abort()}/></>}
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    <View style={styles.actions}>{[['Listas para intentar entrenar',plan.readyClasses.length],['Muestras aptas',plan.usableRecordings],['Entradas pendientes',plan.totalClasses-plan.readyClasses.length]].map(([label,value])=><View key={label} style={styles.stat}><Text style={styles.number}>{value}</Text><Text style={styles.muted}>{label}</Text></View>)}</View>
    <Button label={personal?'Entrenar prototipo experimental':'Entrenar primeras señas disponibles'} onPress={train} disabled={busy||!plan.trainingAvailable||selected.length<2}/>
    <Text style={styles.muted}>{plan.trainingAvailable?`Grupo seleccionado: ${selected.length} señas de hasta ${maxClasses}. Puedes cambiarlo marcando las señas listas. Cada grupo y modo se guarda por separado en este navegador.`:'El entrenamiento se habilita cuando al menos dos señas cumplen los requisitos. Puedes recuperar los archivos antiguos para experimentar, o preparar las capturas para una evaluación independiente.'}</Text>
    {plan.trainingAvailable&&<Text style={styles.body}>{selected.join(' · ')||'Selecciona al menos dos señas listas.'}</Text>}
    {report&&<View style={styles.card}><Text style={styles.subtitle}>Resultado del grupo candidato</Text><Text style={styles.body}>{report.classes.length} señas · {report.trainOriginals} originales de aprendizaje · {report.evaluationSamples} originales de prueba · {(report.accuracy*100).toFixed(1)}% de aciertos en esas muestras reservadas.</Text>
      <Text style={styles.warning}>{report.mode==='personal-prototype'?'Esta es una prueba interna con grabaciones distintas de la misma colección; pueden ser de la misma persona y su identidad puede no estar confirmada.':'La identidad de los perfiles debe revisarse.'} Falta probar gestos desconocidos y la cámara real; este resultado no activa la traducción pública.</Text>
      {report.perClass.map(row=><Text key={row.classId} style={styles.body}>{row.classId}: {row.correct}/{row.samples} pruebas acertadas.</Text>)}</View>}
    <View style={styles.actions}>{[['all','Todas'],['ready','Listas'],['needs-preparation','Requieren preparación'],['needs-samples','Faltan muestras'],['needs-material','Falta material']].map(([value,label])=><Button key={value} label={label} onPress={()=>{setFilter(value);setLimit(25);}}/>)}</View>
    <TextInput accessibilityLabel="Buscar seña para entrenar" placeholder="Buscar seña o categoría…" placeholderTextColor="#9191A8" value={query} onChangeText={value=>{setQuery(value);setLimit(25);}} style={styles.input}/>
    <Text style={styles.muted}>{rows.length} entradas con este filtro · Las primeras tienen más datos revisados.</Text>
    {rows.slice(0,limit).map(row=><View key={row.classId} style={styles.card}><Text style={styles.subtitle}>{row.label}</Text><Text style={styles.muted}>{row.category} · {states[row.state]}</Text>
      {row.state==='ready'&&<TouchableOpacity accessibilityRole="checkbox" accessibilityLabel={`Incluir ${row.classId} en el entrenamiento`} accessibilityState={{checked:selected.includes(row.classId),disabled:busy||!selected.includes(row.classId)&&selected.length>=maxClasses}} disabled={busy||!selected.includes(row.classId)&&selected.length>=maxClasses} onPress={()=>setSelected(value=>value.includes(row.classId)?value.filter(id=>id!==row.classId):[...value,row.classId])} style={styles.button}><Text style={styles.buttonText}>{selected.includes(row.classId)?'✓ Incluida en el grupo':'Incluir en el grupo'}</Text></TouchableOpacity>}
      <Text style={styles.body}>{row.approvedRecordings} aprobadas · {row.usableRecordings} aptas · {row.trainOriginals}/{plan.minimums.trainOriginals} originales de aprendizaje · {row.evaluationOriginals}/{plan.minimums.evaluationOriginals} de prueba.</Text>
      {row.reasons.map(reason=><Text key={reason} style={styles.warning}>{reason==='unverified-participant-identity'?automaticSourceReason:reasons[reason]||reason}</Text>)}
    </View>)}
    {rows.length>limit&&<Button label="Mostrar más señas" onPress={()=>setLimit(value=>value+25)}/>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#0F0F1E'},content:{width:'100%',maxWidth:940,alignSelf:'center',padding:20,paddingBottom:48},title:{fontSize:25,fontWeight:'800',color:'#FFF',flex:1},subtitle:{fontSize:19,fontWeight:'700',color:'#FFF'},body:{color:'#D0D0DF',fontSize:14,lineHeight:23,marginVertical:8},muted:{color:'#AAAABC',fontSize:13,lineHeight:21},warning:{color:'#D8BD84',fontSize:13,lineHeight:22,marginVertical:8},error:{color:'#FF9BAD',lineHeight:22,marginVertical:10},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center',marginVertical:10},card:{backgroundColor:'#1A1A2E',padding:18,borderRadius:14,marginVertical:8},button:{backgroundColor:'#23877F',padding:13,borderRadius:10},buttonText:{color:'#FFF',fontSize:13,fontWeight:'700'},input:{backgroundColor:'#171729',borderColor:'#55556A',borderWidth:1,borderRadius:10,padding:14,color:'#FFF',marginVertical:14},stat:{flex:1,minWidth:150,backgroundColor:'#1A1A2E',padding:15,borderRadius:12},number:{fontSize:27,fontWeight:'800',color:'#FFF'}});
