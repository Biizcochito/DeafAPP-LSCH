import {useEffect,useMemo,useRef,useState} from 'react';
import {SafeAreaView,ScrollView,View,Text,TextInput,TouchableOpacity,Image,ActivityIndicator,StyleSheet} from 'react-native';
import {CATEGORIAS} from './signCatalog';
import {frameDataUri} from './adminClient';
import {listApprovedRows} from './training/browserDataset';
import {openRecoveryStore} from './training/recoveryStore';
import {recoverApprovedLegacy,downloadApprovedRecording,currentRecovery} from './training/legacyRecoveryBrowser';
import {preparePersonalPrototype,summarizeRecovery} from './training/legacyRecovery';
import {createTrainingPlan} from './training/trainingPlan';

function Button({label,onPress,disabled}) {return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.button,disabled&&{opacity:0.4}]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>;}
export default function LegacyRecoveryPanel({api,session,client,onBack,onUsePrototype,onAccessError}) {
  const [rows,setRows]=useState([]),[items,setItems]=useState({}),[busy,setBusy]=useState(true),[progress,setProgress]=useState('Abriendo las aprobaciones y la recuperación local…'),[error,setError]=useState(''),[query,setQuery]=useState(''),[limit,setLimit]=useState(20);
  const [editing,setEditing]=useState(null),[target,setTarget]=useState(''),[participant,setParticipant]=useState(''),[confirmed,setConfirmed]=useState(false),[preview,setPreview]=useState(null),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(true);
  const alive=useRef(true),lock=useRef(true),store=useRef(null),abort=useRef(null),previewRequest=useRef(0);
  useEffect(()=>{
    alive.current=true;const controller=new AbortController();abort.current=controller;
    (async()=>{try{const saved=await openRecoveryStore();store.current=saved;if(!alive.current){saved.close();return;}
      const approved=await listApprovedRows(api,session,controller.signal),cached=await saved.all();
      if(alive.current){setRows(approved);setItems(Object.fromEntries(cached.map(item=>[String(item.id),item])));setProgress(`${approved.length} aprobadas disponibles. La recuperación conserva imágenes originales y guarda los puntos en este navegador.`);}}
      catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
      finally{lock.current=false;if(alive.current)setBusy(false);}})();
    return()=>{alive.current=false;abort.current?.abort();previewRequest.current++;store.current?.close();};
  },[]);
  useEffect(()=>{if(!preview||!playing)return;const timer=setInterval(()=>setFrame(value=>(value+1)%preview.frames.length),preview.intervalMs);return()=>clearInterval(timer);},[preview,playing]);
  const valid=useMemo(()=>rows.map(row=>items[String(row.id)]).filter((item,index)=>item&&currentRecovery(item,rows[index])),[rows,items]);
  const dataset=useMemo(()=>preparePersonalPrototype(valid),[valid]),plan=useMemo(()=>createTrainingPlan(dataset,{approvedCounts:dataset.approvedCounts}),[dataset]);
  async function recover() {
    if(lock.current||!store.current)return;lock.current=true;setBusy(true);setError('');const controller=new AbortController();abort.current=controller;
    try{const result=await recoverApprovedLegacy({api,session,client,store:store.current,signal:controller.signal,
      onProgress:value=>{if(alive.current)setProgress(value.text);},onItem:item=>{if(alive.current)setItems(value=>({...value,[String(item.id)]:item}));}});
      const approved=await listApprovedRows(api,session,controller.signal);
      if(alive.current){setRows(approved);setProgress(`Recuperación completa: ${result.processed} procesadas ahora, ${result.reused} ya guardadas y ${result.failed} con un error de archivo o procesamiento.`);}}
    catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function showPreview(row) {
    const request=++previewRequest.current;setError('');
    try{await api.overview(session);const recording=await downloadApprovedRecording(client,row);
      const frames=recording.frames?.map(frameDataUri);if(!frames?.length||frames.some(value=>!value))throw new Error('Esta secuencia no se puede reproducir.');
      if(alive.current&&request===previewRequest.current){setPreview({row,frames,intervalMs:Number.isFinite(recording.intervalMs)?Math.max(30,Math.min(1000,recording.intervalMs)):150});setFrame(0);setPlaying(true);}}
    catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
  }
  async function saveReview() {
    if(lock.current||!editing||!confirmed||!target)return;lock.current=true;setBusy(true);setError('');
    try{
      const current=await listApprovedRows(api,session),row=current.find(value=>String(value.id)===editing.id);
      if(!row||!currentRecovery(editing,row))throw new Error('Cambió la aprobación. Vuelve a recuperar esa grabación.');
      const code=participant.trim();const item={...editing,classId:target,labelReviewed:true,labelReviewBasis:'admin-corrected-exact-sign',participantId:code||null,participantIdentity:code?'admin-declared':'unknown',reviewedAt:new Date().toISOString()};
      await store.current.put(item);
      if(alive.current){setItems(value=>({...value,[item.id]:item}));setEditing(null);setProgress(`Revisión local de #${item.id} guardada. El archivo original y su aprobación se conservan.`);}
    }catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  async function usePrototype() {
    if(lock.current)return;lock.current=true;setBusy(true);setError('');
    try{const current=await listApprovedRows(api,session);const fresh=current.map(row=>items[String(row.id)]).filter((item,index)=>item&&currentRecovery(item,current[index]));
      const prepared=preparePersonalPrototype(fresh);if(!createTrainingPlan(prepared).trainingAvailable)throw new Error('Faltan dos señas con dos grabaciones recuperadas y distintas por seña.');
      if(alive.current)onUsePrototype(prepared);
    }catch(e){if(alive.current){setError(e.message);onAccessError?.(e);}}
    finally{lock.current=false;if(alive.current)setBusy(false);}
  }
  const term=query.trim().toLocaleLowerCase('es'),visible=rows.filter(row=>!term||`${row.label} ${row.category} ${row.id}`.toLocaleLowerCase('es').includes(term));
  return <SafeAreaView style={styles.root}><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.actions}><Text style={styles.title}>Recuperar grabaciones antiguas</Text><Button label="Volver a entrenamiento" onPress={onBack}/></View>
    <Text style={styles.body}>Extraemos puntos de las imágenes JPEG, PNG o WebP guardadas. Cada fotograma se procesa de nuevo. Las grabaciones originales se conservan.</Text>
    <Text style={styles.warning}>Si faltan tiempos, usamos el orden de imágenes y lo indicamos. Un participante sin confirmar permanece desconocido. Este material permite experimentos privados; no demuestra funcionamiento con otras personas.</Text>
    <View style={styles.actions}><Button label="Recuperar todas las aprobadas" onPress={recover} disabled={busy||!store.current}/><Button label="Preparar prototipo experimental" onPress={usePrototype} disabled={busy||!plan.trainingAvailable}/></View>
    <Text accessibilityRole="status" style={styles.body}>{progress}</Text>{busy&&<><ActivityIndicator color="#4ECDC4"/><Button label="Cancelar recuperación" onPress={()=>abort.current?.abort()}/></>}
    {error?<Text accessibilityRole="alert" style={styles.error}>{error}</Text>:null}
    <View style={styles.actions}>{[['Aprobadas',rows.length],['Procesadas y guardadas',valid.length],['Con calidad utilizable',valid.filter(item=>summarizeRecovery(item.observations).usable).length],['Señas para experimentar',plan.readyClasses.length]].map(([label,value])=><View style={styles.stat} key={label}><Text style={styles.number}>{value}</Text><Text style={styles.muted}>{label}</Text></View>)}</View>
    <Text style={styles.body}>Para el experimento: al menos dos señas y dos grabaciones distintas por seña. Una se reserva para una prueba interna; puede ser de la misma persona. No se cuentan las variaciones artificiales como grabaciones nuevas.</Text>
    {plan.rows.some(row=>row.usableRecordings>0)&&<View style={styles.card}><Text style={styles.subtitle}>Primeras señas recuperadas</Text>{plan.rows.filter(row=>row.usableRecordings>0).slice(0,12).map(row=><Text key={row.classId} style={styles.body}>{row.classId}: {row.usableRecordings} originales útiles · {row.state==='ready'?'lista para el experimento':`falta ${Math.max(0,2-row.usableRecordings)} toma distinta para la prueba interna`}.</Text>)}</View>}
    {preview&&<View style={styles.card}><Text style={styles.subtitle}>Grabación #{preview.row.id}: {preview.row.label}</Text><Image source={{uri:preview.frames[frame]}} resizeMode="contain" style={{width:'100%',height:300}}/><Text style={styles.muted}>Imagen {frame+1}/{preview.frames.length}. Reproducción orientativa; los tiempos reales solo se conocen si estaban guardados.</Text><View style={styles.actions}><Button label={playing?'Pausar secuencia':'Reproducir secuencia'} onPress={()=>setPlaying(value=>!value)}/><Button label="Cerrar secuencia" onPress={()=>{previewRequest.current++;setPreview(null);}}/></View></View>}
    {editing&&<View style={styles.card}><Text style={styles.subtitle}>Revisar recuperación #{editing.id}</Text><Text style={styles.body}>Original: {editing.originalCategory}/{editing.originalLabel}. Elige la seña exacta solamente si corresponde a toda esta secuencia.</Text>
      <select aria-label="Seña corregida de la recuperación" value={target} onChange={event=>{setTarget(event.target.value);setConfirmed(false);}} style={styles.select}><option value="">Pendiente de identificar o recortar</option>{CATEGORIAS.map(category=><optgroup key={category.id} label={category.nombre}>{category.señas.map(label=><option key={label} value={`${category.id}/${label}`}>{label}</option>)}</optgroup>)}</select>
      <TextInput accessibilityLabel="Código del participante recuperado" placeholder="Código si sabes quién grabó; vacío si no se sabe" placeholderTextColor="#9090A8" value={participant} onChangeText={setParticipant} style={styles.input}/><Text style={styles.muted}>Usa el mismo código para la misma persona, incluso entre distintas grabaciones. No inventes una persona nueva por archivo.</Text>
      <TouchableOpacity accessibilityRole="checkbox" accessibilityLabel="Confirmar la seña recuperada" accessibilityState={{checked:confirmed}} onPress={()=>setConfirmed(value=>!value)} style={styles.actions}><Text style={styles.body}>{confirmed?'☑':'☐'} Confirmo que la secuencia corresponde a la seña elegida.</Text></TouchableOpacity>
      <View style={styles.actions}><Button label="Guardar revisión de recuperación" onPress={saveReview} disabled={busy||!confirmed||!target}/><Button label="Cerrar revisión de recuperación" onPress={()=>setEditing(null)} disabled={busy}/></View></View>}
    <TextInput accessibilityLabel="Buscar grabación recuperada" placeholder="Buscar seña, categoría o número…" placeholderTextColor="#9090A8" value={query} onChangeText={value=>{setQuery(value);setLimit(20);}} style={styles.input}/>
    <Text style={styles.muted}>{visible.length} grabaciones con este filtro.</Text>
    {visible.slice(0,limit).map(row=>{const item=items[String(row.id)],current=item&&currentRecovery(item,row),quality=current?summarizeRecovery(item.observations):null;
      return <View style={styles.card} key={row.id}><Text style={styles.subtitle}>{row.label} · #{row.id}</Text><Text style={styles.muted}>{row.category} · {current?(quality.usable?'Puntos recuperados utilizables para experimentar':'Puntos recuperados; requiere revisar encuadre'):'Pendiente de recuperación'}</Text>
        {current&&<><Text style={styles.body}>{quality.totalFrames} imágenes · cara útil: {quality.faceFrames} · manos: {quality.handFrames}. {item.classId?`Seña: ${item.classId}.`:'Falta identificar una seña del vocabulario.'}</Text><Text style={styles.muted}>{item.intervalMs?`Intervalo nominal guardado: ${item.intervalMs} ms.`:'Tiempo entre imágenes desconocido; se conserva su orden.'} Participante: {item.participantId||'sin confirmar'}.</Text></>}
        {item?.error&&<Text style={styles.error}>{item.error}</Text>}
        <View style={styles.actions}><Button label={`Ver secuencia recuperada ${row.id}`} onPress={()=>showPreview(row)} disabled={busy}/>{current&&<Button label={`Revisar recuperación ${row.id}`} onPress={()=>{setEditing(item);setTarget(item.classId||'');setParticipant(item.participantId||'');setConfirmed(false);}} disabled={busy}/>}</View>
      </View>;})}
    {visible.length>limit&&<Button label="Mostrar más recuperadas" onPress={()=>setLimit(value=>value+20)}/>}
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({root:{flex:1,backgroundColor:'#0F0F1E'},content:{maxWidth:940,width:'100%',alignSelf:'center',padding:20,paddingBottom:50},title:{color:'#FFF',fontSize:24,fontWeight:'800',flex:1},subtitle:{color:'#FFF',fontSize:18,fontWeight:'700'},body:{color:'#D0D0DF',fontSize:14,lineHeight:23,marginVertical:8},muted:{color:'#AAAABC',fontSize:13,lineHeight:21},warning:{color:'#D8BD84',fontSize:13,lineHeight:22,marginVertical:8},error:{color:'#FF9BAD',lineHeight:22},actions:{flexDirection:'row',flexWrap:'wrap',gap:10,alignItems:'center',marginVertical:10},button:{backgroundColor:'#23877F',borderRadius:10,padding:13},buttonText:{color:'#FFF',fontWeight:'700'},card:{backgroundColor:'#1A1A2E',padding:18,borderRadius:14,marginVertical:8},input:{color:'#FFF',backgroundColor:'#171729',borderColor:'#55556A',borderWidth:1,padding:14,borderRadius:10,marginVertical:12},stat:{backgroundColor:'#1A1A2E',padding:14,borderRadius:12,minWidth:160,flex:1},number:{color:'#FFF',fontSize:27,fontWeight:'800'},select:{color:'#FFF',backgroundColor:'#171729',padding:12,width:'100%',borderRadius:8}});
