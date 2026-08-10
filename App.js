/**
 * DeafApp — Recopilación de señas LSCh
 * Dataset completo con todas las categorías + feedback
 */

import { useState, useRef, useEffect } from "react";
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, SafeAreaView, Dimensions, Image,
  ActivityIndicator, StatusBar, Animated, TextInput,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { createClient } from "@supabase/supabase-js";

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
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ADMIN_PASSWORD = "Diego001";
function armarDataUri(base64Frame) {
  if (!base64Frame) return "";
  return base64Frame.startsWith("data:") ? base64Frame : `data:image/jpeg;base64,${base64Frame}`;
}

const META_POR_SEÑA = 15;
const TOTAL_FRAMES  = 30;
const FPS_INTERVALO = 100;
const VOTOS_PARA_APROBAR = 2;  // diferencia (positivos - negativos) para aprobar
const VOTOS_PARA_DESCARTAR = 2; // diferencia (negativos - positivos) para descartar

const CATEGORIAS = [
 
  {
    id: "saludos", nombre: "Saludos", emoji: "👋", color: "#4ECDC4",
    señas: ["hola","adios","buenos dias","buenas tardes","buenas noches","gracias","por favor","de nada","como estas","bien","mal","mucho gusto","hasta luego","bienvenido"],
  },
  {
    id: "conversacion", nombre: "Conversación", emoji: "💬", color: "#1ABC9C",
    señas: ["si","no","tal vez","no entiendo","repite","mas despacio","espera","claro","de acuerdo","por supuesto","nunca","siempre","a veces","todo","nada","algo","alguien","nadie"],
  },
  {
    id: "familia", nombre: "Familia", emoji: "👨‍👩‍👧", color: "#45B7D1",
    señas: ["mama","papa","hermano","hermana","abuelo","abuela","hijo","hija","tio","tia","primo","familia","esposo","esposa","bebe","niño","niña"],
  },
  {
    id: "alimentos", nombre: "Alimentos", emoji: "🍎", color: "#FF6B6B",
    señas: ["arroz","fideos","pure","porotos","lentejas","carne","cerdo","pavo","longaniza","vianesa","pollo","pescado","aceite","sal","azucar","pimienta","ajo","pan","leche","queso","huevo"],
  },
  {
    id: "frutas_verduras", nombre: "Frutas y Verduras", emoji: "🥦", color: "#27AE60",
    señas: ["manzana","naranja","platano","uva","frutilla","pera","sandia","melon","limon","durazno","tomate","lechuga","zanahoria","cebolla","papa","pepino","brocoli","espinaca","choclo","zapallo"],
  },
  {
    id: "verbos", nombre: "Verbos", emoji: "⚡", color: "#96CEB4",
    señas: ["comer","beber","dormir","trabajar","estudiar","caminar","correr","hablar","escuchar","ver","ir","venir","leer","escribir","jugar","nadar","bailar","cantar","reir","llorar","ayudar","querer","amar","pensar","saber","poder","tener","hacer","dar","salir","entrar","comprar","vender","vivir","responder","informar","obligar","aprobar","reprobar","quedar","borrar","explicar","avisar","me aviso","ahi","guardar","invitar","preparar","aconsejar","buscar","revisar","respetar","pedir","enviar","recibido"],
  },
  {
    id: "adjetivos", nombre: "Adjetivos", emoji: "🎨", color: "#E74C3C",
    señas: ["grande","pequeño","bonito","feo","bueno","malo","rapido","lento","caliente","frio","nuevo","viejo","feliz","triste","alto","bajo","gordo","flaco","fuerte","debil","inteligente","rico","pobre","limpio","sucio","lleno","vacio"],
  },
  {
    id: "preguntas", nombre: "Preguntas", emoji: "❓", color: "#F39C12",
    señas: ["que","como","donde","cuando","quien","por que","cuanto","cual","para que","de donde","a donde","cuantos"],
  },
  {
    id: "pronombres", nombre: "Pronombres", emoji: "👤", color: "#F7DC6F",
    señas: ["yo","tu","el","ella","nosotros","ellos","ellas","usted","ustedes","este","ese","aquel","aqui","alli","esto","eso"],
  },
  {
    id: "emociones", nombre: "Emociones", emoji: "😊", color: "#FF9800",
    señas: ["feliz","triste","enojado","asustado","sorprendido","aburrido","cansado","emocionado","nervioso","tranquilo","preocupado","confundido","avergonzado","orgulloso","celoso","amor","odio"],
  },
  {
    id: "salud", nombre: "Salud y Médico", emoji: "🏥", color: "#E91E63",
    señas: ["doctor","enfermo","hospital","medicina","dolor","operacion","urgencia","farmacia","enfermera","sangre","fiebre","gripe","resfrio","embarazada","discapacidad","sordo","ciego","alergia","herida","pastilla"],
  },
  {
    id: "hogar", nombre: "Hogar", emoji: "🏠", color: "#795548",
    señas: ["casa","habitacion","cocina","bano","cama","silla","mesa","puerta","ventana","sofa","television","refrigerador","lavadora","microondas","telefono","computador","luz","llave","escalera","jardin"],
  },
  {
    id: "transporte", nombre: "Transporte", emoji: "🚗", color: "#607D8B",
    señas: ["bus","metro","auto","taxi","bicicleta","avion","tren","barco","moto","camion","ambulancia","policia","semaforo","calle","avenida","puente","estacion","aeropuerto","puerto"],
  },
  {
    id: "educacion", nombre: "Educación", emoji: "🏫", color: "#3F51B5",
    señas: ["colegio","universidad","profesor","alumno","libro","tarea","clase","examen","nota","lapiz","cuaderno","mochila","recreo","matematicas","lenguaje","historia","ciencias","educacion fisica","ingles","arte"],
  },
  {
    id: "dinero", nombre: "Dinero y Comercio", emoji: "💰", color: "#FFC107",
    señas: ["peso","comprar","vender","caro","barato","pagar","cambio","banco","tarjeta","efectivo","deuda","precio","descuento","factura","recibo","mercado","supermercado","tienda","farmacia"],
  },
  {
    id: "clima", nombre: "Clima y Tiempo", emoji: "🌤️", color: "#00BCD4",
    señas: ["sol","lluvia","frio","calor","viento","nube","nieve","temperatura","tormenta","niebla","granizo","humedad","seco","mojado","primavera","verano","otoño","invierno"],
  },
  {
    id: "animales", nombre: "Animales", emoji: "🐶", color: "#8BC34A",
    señas: ["perro","gato","vaca","caballo","pajaro","pez","conejo","raton","cerdo","gallina","oveja","leon","tigre","elefante","mono","delfin","ballena","serpiente","araña","mariposa"],
  },
  {
    id: "deportes", nombre: "Deportes", emoji: "🏋️", color: "#FF5722",
    señas: ["futbol","basquetbol","tenis","natacion","correr","ganar","perder","equipo","partido","campeon","estadio","pelota","raqueta","piscina","gimnasio","entrenamiento","competencia"],
  },
  {
    id: "emergencias", nombre: "Emergencias", emoji: "🚨", color: "#F44336",
    señas: ["ayuda","peligro","accidente","fuego","policia","ambulancia","bombero","robo","perdido","llamar","emergencia","herido","dolor fuerte","no puedo respirar","caida","ataque"],
  },
  {
    id: "necesidades", nombre: "Necesidades Básicas", emoji: "💊", color: "#9C27B0",
    señas: ["agua","comida","bano","ayuda","cansado","hambre","sed","frio","calor","dormir","trabajar","dinero","medicamento","doctor","descanso","casa","familia","amigo"],
  },
  {
    id: "colores", nombre: "Colores", emoji: "🌈", color: "#E91E63",
    señas: ["rojo","azul","verde","amarillo","blanco","negro","naranja","morado","rosado","cafe","gris","celeste","dorado","plateado"],
  },
  {
    id: "cuerpo", nombre: "Cuerpo Humano", emoji: "🫀", color: "#9C27B0",
    señas: ["cabeza","cara","ojo","nariz","boca","oreja","cuello","hombro","brazo","mano","dedo","pecho","espalda","pierna","rodilla","pie","corazon","cerebro","estomago"],
  },
  {
    id: "paises", nombre: "Países", emoji: "🌎", color: "#2980B9",
    señas: ["chile","argentina","peru","brasil","colombia","bolivia","ecuador","venezuela","paraguay","uruguay","mexico","usa","canada","españa","francia","alemania","italia","china","japon","corea","cuba","panama","costa rica","guatemala","honduras","el salvador","nicaragua","haiti","republica dominicana"],
  },
  {
    id: "regiones", nombre: "Regiones de Chile", emoji: "🗺️", color: "#8E44AD",
    señas: ["arica","tarapaca","antofagasta","atacama","coquimbo","valparaiso","metropolitana","ohiggins","maule","nuble","biobio","araucania","los rios","los lagos","aysen","magallanes"],
  },
  {
    id: "continentes", nombre: "Continentes", emoji: "🌍", color: "#16A085",
    señas: ["america","america del sur","america del norte","america central","europa","asia","africa","oceania","antartica"],
  },
  {
    id: "estados_civiles", nombre: "Estados Civiles", emoji: "💍", color: "#D35400",
    señas: ["soltero","soltera","casado","casada","divorciado","divorciada","viudo","viuda","separado","separada","conviviente","comprometido"],
  },
  {
    id: "religion", nombre: "Religión", emoji: "🙏", color: "#795548",
    señas: ["dios","iglesia","oracion","fe","gracias a dios","biblia","misa","pastor","santo","bendicion","amor de dios","creer","alma","cielo","bautismo"],
  },
  {
    id: "tiempo", nombre: "Tiempo y Fechas", emoji: "🕐", color: "#607D8B",
    señas: ["hoy","ayer","manana","ahora","antes","despues","siempre","nunca","a veces","lunes","martes","miercoles","jueves","viernes","sabado","domingo","enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre","año","mes","semana","dia","hora","minuto"],
  },
];

const colorProgreso = (n) => {
  if (n === 0)                  return "#555";
  if (n < META_POR_SEÑA * 0.3) return "#E74C3C";
  if (n < META_POR_SEÑA * 0.7) return "#F39C12";
  return "#27AE60";
};

function CategoriaCard({ cat, conteos, conteosTotal, onPress }) {
  const listas      = cat.señas.filter(s => (conteos[s] || 0) >= META_POR_SEÑA).length;
  const conProgreso = cat.señas.filter(s => (conteosTotal[s] || 0) > 0).length;
  const pct         = cat.señas.length > 0 ? conProgreso / cat.señas.length : 0;
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
  const [permission, requestPermission] = useCameraPermissions();
  const [pantalla,   setPantalla]   = useState("bienvenida");
  const [progresoAbierto, setProgresoAbierto] = useState(false);
  const [catActual,  setCatActual]  = useState(null);
  const [señaActual, setSeñaActual] = useState(null);
  const [conteos,      setConteos]      = useState({});
  const [conteosTotal, setConteosTotal] = useState({});
  const [countdown,  setCountdown]  = useState(null);
  const [capturando, setCapturando] = useState(false);
  const [subiendo,   setSubiendo]   = useState(false);
  const [progreso,   setProgreso]   = useState(0);
  const [exito,      setExito]      = useState(false);
  const [error,      setError]      = useState(null);

  // Feedback
  const [tipoFeedback,    setTipoFeedback]    = useState("sugerencia");
  const [mensajeFeedback, setMensajeFeedback] = useState("");
  const [enviandoFeedback,setEnviandoFeedback]= useState(false);
  const [exitoFeedback,   setExitoFeedback]   = useState(false);

  // Revisión comunitaria
  const [itemRevision,    setItemRevision]    = useState(null); // { id, label, categoria, frames }
  const [cargandoRevision,setCargandoRevision]= useState(false);
  const [fotogramaRev,    setFotogramaRev]    = useState(0);
  const [sinPendientes,   setSinPendientes]   = useState(false);

  // Admin
  const [passwordAdmin,   setPasswordAdmin]   = useState("");
  const [errorAdmin,      setErrorAdmin]      = useState("");
  const [grabsPendientes, setGrabsPendientes] = useState([]);
  const [cargandoAdmin,   setCargandoAdmin]   = useState(false);
  const [accionando,      setAccionando]      = useState(null);
  const [grabPreview,     setGrabPreview]     = useState(null);
  const [framesPreview,   setFramesPreview]   = useState([]);
  const [fotogramaPreview,setFotogramaPreview]= useState(0);
  const [cargandoPreview, setCargandoPreview] = useState(false);

  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    cargarConteos();
    cargarConteosTotal();
    const intervalo = setInterval(() => { cargarConteos(); cargarConteosTotal(); }, 30000);
    if (typeof window !== "undefined" && window.location.hash === "#admin") {
      setPantalla("admin_login");
    }
    return () => clearInterval(intervalo);
  }, []);

  // Animar frames del preview en admin
  useEffect(() => {
    if (framesPreview.length === 0) return;
    const intervalo = setInterval(() => {
      setFotogramaPreview(f => (f + 1) % framesPreview.length);
    }, 100);
    return () => clearInterval(intervalo);
  }, [framesPreview]);

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

  const cargarConteosTotal = async () => {
    try {
      const { data } = await supabase.from("grabaciones").select("label");
      if (data) {
        const c = {};
        data.forEach(r => { c[r.label] = (c[r.label] || 0) + 1; });
        setConteosTotal(c);
      }
    } catch (e) { console.log("Error conteos total:", e); }
  };

  // ── FUNCIONES ADMIN ──────────────────────────────────────────────
  const loginAdmin = () => {
    if (passwordAdmin === ADMIN_PASSWORD) {
      setErrorAdmin("");
      setPantalla("admin_panel");
      cargarPendientes();
    } else {
      setErrorAdmin("Contraseña incorrecta");
    }
  };

  const cargarPendientes = async () => {
    setCargandoAdmin(true);
    try {
      const { data } = await supabase
        .from("grabaciones")
        .select("*")
        .eq("aprobada", false)
        .order("timestamp", { ascending: false });
      setGrabsPendientes(data || []);
    } catch (e) { console.log("Error pendientes:", e); }
    setCargandoAdmin(false);
  };

  const aprobarGrabacion = async (id) => {
    setAccionando(id);
    try {
      await supabase.from("grabaciones")
        .update({ aprobada: true, visible: true })
        .eq("id", id);
      setGrabsPendientes(prev => prev.filter(g => g.id !== id));
      if (grabPreview?.id === id) { setGrabPreview(null); setFramesPreview([]); }
      cargarConteos();
    } catch (e) { console.log("Error aprobando:", e); }
    setAccionando(null);
  };

  const rechazarGrabacion = async (id) => {
    setAccionando(id);
    try {
      // Eliminar el registro completamente — así no vuelve a aparecer al recargar
      await supabase.from("grabaciones")
        .delete()
        .eq("id", id);
      setGrabsPendientes(prev => prev.filter(g => g.id !== id));
      if (grabPreview?.id === id) { setGrabPreview(null); setFramesPreview([]); }
    } catch (e) { console.log("Error rechazando:", e); }
    setAccionando(null);
  };

  const aprobarTodas = async () => {
    setCargandoAdmin(true);
    try {
      await supabase.from("grabaciones")
        .update({ aprobada: true, visible: true })
        .eq("aprobada", false);
      setGrabsPendientes([]);
      setGrabPreview(null);
      setFramesPreview([]);
      cargarConteos();
    } catch (e) { console.log("Error aprobando todas:", e); }
    setCargandoAdmin(false);
  };

  const cargarPreview = async (grab) => {
    if (!grab.archivo_path) return;
    setCargandoPreview(true);
    setGrabPreview(grab);
    setFramesPreview([]);
    setFotogramaPreview(0);
    try {
      const { data, error } = await supabase.storage
        .from("contribuciones")
        .download(grab.archivo_path);
      if (error) throw error;
      const texto = await data.text();
      const json  = JSON.parse(texto);
      if (Array.isArray(json.frames) && json.frames.length > 0) {
        setFramesPreview(json.frames);
      }
    } catch (e) { console.log("Error preview:", e); }
    setCargandoPreview(false);
  };

  const cargarSiguienteRevision = async () => {
    setCargandoRevision(true);
    setItemRevision(null);
    setSinPendientes(false);
    try {
      const idsValidos = CATEGORIAS.map(c => c.id);
      const { data } = await supabase
        .from("grabaciones")
        .select("id, label, categoria, archivo_path, votos_positivos, votos_negativos")
        .eq("aprobada", false)
        .eq("visible", true)
        .lt("votos_negativos", VOTOS_PARA_DESCARTAR)
        .in("categoria", idsValidos)
        .limit(30);
      if (!data || data.length === 0) {
        setSinPendientes(true);
        setCargandoRevision(false);
        return;
      }
      // Barajamos el lote y probamos cada una hasta encontrar una con video válido
      const candidatos = [...data].sort(() => Math.random() - 0.5);
      for (const candidato of candidatos) {
        const { data: archivo, error: errArchivo } = await supabase.storage
          .from("contribuciones")
          .download(candidato.archivo_path);
        if (errArchivo || !archivo) continue;
        try {
          const texto = await archivo.text();
          const contenido = JSON.parse(texto);
          const frames = contenido.frames || [];
          if (frames.length > 0) {
            setItemRevision({ ...candidato, frames });
            setFotogramaRev(0);
            setCargandoRevision(false);
            return;
          }
        } catch (e) { /* grabación corrupta, probamos la siguiente */ }
      }
      // Ninguna del lote sirvió
      setSinPendientes(true);
      setCargandoRevision(false);
    } catch (e) {
      console.log("Error cargando revisión:", e);
      setSinPendientes(true);
    }
    setCargandoRevision(false);
  };

  const votar = async (esCorrecta) => {
    if (!itemRevision) return;
    const nuevosPositivos = itemRevision.votos_positivos + (esCorrecta ? 1 : 0);
    const nuevosNegativos = itemRevision.votos_negativos + (esCorrecta ? 0 : 1);
    const aprobar = (nuevosPositivos - nuevosNegativos) >= VOTOS_PARA_APROBAR;
    try {
      const { error } = await supabase.from("grabaciones").update({
        votos_positivos: nuevosPositivos,
        votos_negativos: nuevosNegativos,
        aprobada: aprobar,
      }).eq("id", itemRevision.id);
      if (error) {
        console.log("Error al votar (bloqueado por Supabase):", error.message);
      } else if (aprobar) {
        cargarConteos();
      }
    } catch (e) { console.log("Error al votar:", e); }
    cargarSiguienteRevision();
  };

  useEffect(() => {
    if (!itemRevision || itemRevision.frames.length === 0) return;
    const intervalo = setInterval(() => {
      setFotogramaRev(f => (f + 1) % itemRevision.frames.length);
    }, FPS_INTERVALO);
    return () => clearInterval(intervalo);
  }, [itemRevision]);

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

  const iniciarCaptura = async () => {
    if (!cameraRef.current || capturando || subiendo) return;
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
          quality: 0.15, base64: true, skipProcessing: true,
        });
        frames.push(foto.base64);
        setProgreso(i + 1);
        await new Promise(r => setTimeout(r, FPS_INTERVALO));
      }
      setCapturando(false);
      const mitad = frames[Math.floor(frames.length / 2)];
      const esNegro = await fotogramaEsNegro(mitad);
      if (esNegro) {
        setError("No detectamos tu cámara. Revisa que no esté tapada e intenta de nuevo.");
        return;
      }
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
      const payload = JSON.stringify({
        label: señaActual, categoria: catActual.id,
        frames: frames, timestamp: timestamp, n_frames: frames.length,
      });
      const blob = new Blob([payload], { type: "application/json" });
      const { error: uploadError } = await supabase.storage
        .from("contribuciones")
        .upload(storagePath, blob, { contentType: "application/json" });
      if (uploadError) {
        setError(`Error: ${uploadError.message}`);
      } else {
        await supabase.from("grabaciones").insert({
          label: señaActual, categoria: catActual.id, archivo_path: storagePath,
        });
        setExito(true);
      }
    } catch (e) {
      setError(`Error al subir: ${e.message}`);
    }
    setSubiendo(false);
  };

  if (!permission) return <View style={styles.root} />;
  if (!permission.granted && pantalla !== "admin_login" && pantalla !== "admin_panel") {
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

  // ── ADMIN LOGIN ──────────────────────────────────────────────────
  if (pantalla === "admin_login") {
    return (
      <SafeAreaView style={[styles.root, styles.centrado]}>
        <StatusBar barStyle="light-content" />
        <Text style={{ fontSize: 60, marginBottom: 16 }}>🔐</Text>
        <Text style={styles.bienvenidaTitulo}>Panel Admin</Text>
        <Text style={[styles.bienvenidaSubtitulo, { marginBottom: 32 }]}>DeafApp — LSCh</Text>
        <View style={{ width: "80%", maxWidth: 360, gap: 12 }}>
          <TextInput
            style={[styles.feedbackInput, { minHeight: 50 }]}
            placeholder="Contraseña"
            placeholderTextColor="#555"
            secureTextEntry
            value={passwordAdmin}
            onChangeText={setPasswordAdmin}
            onSubmitEditing={loginAdmin}
          />
          {errorAdmin ? <Text style={styles.errorTexto}>{errorAdmin}</Text> : null}
          <TouchableOpacity style={[styles.btnPrimario, { alignItems: "center" }]} onPress={loginAdmin}>
            <Text style={styles.btnPrimarioTexto}>Entrar</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPantalla("bienvenida")}>
            <Text style={[styles.actualizarTexto, { textAlign: "center" }]}>← Volver a la app</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── ADMIN PANEL ──────────────────────────────────────────────────
  if (pantalla === "admin_panel") {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.adminHeader}>
          <Text style={styles.adminTitulo}>🔐 Panel Admin</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity style={styles.btnAdminSmall} onPress={cargarPendientes}>
              <Text style={styles.btnAdminSmallTexto}>↻</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnAdminSmall} onPress={() => setPantalla("bienvenida")}>
              <Text style={styles.btnAdminSmallTexto}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.adminStats}>
          <Text style={styles.adminStatsTexto}>📋 {grabsPendientes.length} grabaciones pendientes</Text>
          {grabsPendientes.length > 0 && (
            <TouchableOpacity style={styles.btnAprobarTodas} onPress={aprobarTodas}>
              <Text style={styles.btnAprobarTodasTexto}>✓ Aprobar todas</Text>
            </TouchableOpacity>
          )}
        </View>
        {cargandoAdmin ? (
          <View style={[styles.centrado, { flex: 1 }]}>
            <ActivityIndicator size="large" color="#E94560" />
          </View>
        ) : grabsPendientes.length === 0 ? (
          <View style={[styles.centrado, { flex: 1 }]}>
            <Text style={{ fontSize: 50 }}>✅</Text>
            <Text style={styles.adminVacioTexto}>No hay grabaciones pendientes</Text>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={true}>
            {/* Preview de grabación seleccionada */}
            {grabPreview && (
              <View style={styles.adminPreviewBox}>
                <Text style={styles.adminPreviewTitulo}>
                  👁 Previsualizando: <Text style={{ color: "#E94560" }}>{grabPreview.label}</Text>
                  {grabPreview.fuente === "drive" ? "  🗂️ Drive" : "  👤 Comunidad"}
                </Text>
                <View style={styles.adminPreviewMarco}>
                  {cargandoPreview ? (
                    <View style={[styles.centrado, { flex: 1 }]}>
                      <ActivityIndicator color="#E94560" />
                      <Text style={{ color: "#888", marginTop: 8, fontSize: 12 }}>Cargando...</Text>
                    </View>
                  ) : framesPreview.length > 0 ? (
                    <>
                      <Image
                        source={{ uri: armarDataUri(framesPreview[fotogramaPreview]) }}
                        style={styles.adminPreviewImagen}
                        resizeMode="contain"
                      />
                      <Text style={styles.adminPreviewContador}>
                        {fotogramaPreview + 1}/{framesPreview.length}
                      </Text>
                    </>
                  ) : (
                    <View style={[styles.centrado, { flex: 1, padding: 20 }]}>
                      <Text style={{ fontSize: 40 }}>🗂️</Text>
                      <Text style={{ color: "#FFF", fontWeight: "700", fontSize: 15, textAlign: "center", marginTop: 8 }}>
                        Seña del Drive
                      </Text>
                      <Text style={{ color: "#AAA", fontSize: 13, textAlign: "center", marginTop: 6 }}>
                        Procesada con MediaPipe — de confianza
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.btnAprobarTodas, { flex: 1 }]}
                    onPress={() => aprobarGrabacion(grabPreview.id)}
                    disabled={accionando === grabPreview.id}
                  >
                    {accionando === grabPreview.id
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Text style={styles.btnAprobarTodasTexto}>✓ Aprobar</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnAprobarTodas, { flex: 1, backgroundColor: "#E74C3C" }]}
                    onPress={() => rechazarGrabacion(grabPreview.id)}
                    disabled={accionando === grabPreview.id}
                  >
                    <Text style={styles.btnAprobarTodasTexto}>✕ Rechazar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
            {/* Lista de pendientes */}
            {grabsPendientes.map(grab => (
              <TouchableOpacity
                key={grab.id}
                style={[styles.adminGrabCard, grabPreview?.id === grab.id && { borderWidth: 1, borderColor: "#E94560" }]}
                onPress={() => cargarPreview(grab)}
              >
                <View style={styles.adminGrabInfo}>
                  <Text style={styles.adminGrabLabel}>{grab.label}</Text>
                  <Text style={styles.adminGrabMeta}>
                    📁 {grab.categoria}  •  {grab.fuente === "drive" ? "🗂️ Drive" : "👤 Comunidad"}
                  </Text>
                  <Text style={styles.adminGrabFecha}>
                    {grab.timestamp ? new Date(grab.timestamp).toLocaleString("es-CL") : ""}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    style={styles.btnAprobar}
                    onPress={() => aprobarGrabacion(grab.id)}
                    disabled={accionando === grab.id}
                  >
                    {accionando === grab.id
                      ? <ActivityIndicator size="small" color="#FFF" />
                      : <Text style={styles.btnAprobarTexto}>✓</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.btnRechazar}
                    onPress={() => rechazarGrabacion(grab.id)}
                    disabled={accionando === grab.id}
                  >
                    <Text style={styles.btnRechazarTexto}>✕</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
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
          <Text style={styles.bienvenidaTitulo}>Bienvenidx a DeafApp</Text>
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
              • Otra persona grabó una seña.{"\n"}
              • Tú miras el video.{"\n"}
              • Tú decides: ¿la seña está bien o está mal?{"\n"}
              • Si varias personas dicen "está bien", esa seña queda guardada.{"\n"}
              Así, todas las señas guardadas son correctas de verdad.{"\n"}
              ‼️Esto es muy importante. Por favor, hazlo bien.‼️
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
  if (pantalla === "revisar") {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <View style={styles.feedbackHeader}>
          <TouchableOpacity onPress={() => { setPantalla("home"); setItemRevision(null); }} style={styles.btnBack}>
            <Text style={styles.btnBackTexto}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.feedbackTitulo}>Revisar señas 🔍</Text>
          <View style={{ width: 44 }} />
        </View>

        {cargandoRevision && (
          <View style={[styles.root, { justifyContent: "center", alignItems: "center" }]}>
            <ActivityIndicator size="large" color="#E94560" />
          </View>
        )}

        {!cargandoRevision && sinPendientes && (
          <View style={[styles.root, styles.centrado, { paddingHorizontal: 30 }]}>
            <Text style={{ fontSize: 60 }}>✅</Text>
            <Text style={styles.permisoTitulo}>¡Todo revisado por ahora!</Text>
            <Text style={styles.permisoSub}>No hay grabaciones pendientes de validar. Vuelve más tarde.</Text>
            <TouchableOpacity style={styles.btnPrimario} onPress={cargarSiguienteRevision}>
              <Text style={styles.btnPrimarioTexto}>↻ Revisar de nuevo</Text>
            </TouchableOpacity>
          </View>
        )}

        {!cargandoRevision && !sinPendientes && itemRevision && (
          <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 10 }}>
            <Text style={styles.revisarPregunta}>
              ¿Reconoces esta seña como una forma real de decir "{itemRevision.label}"?
            </Text>
            <Text style={styles.revisarAyuda}>
              Puede que no la hagas tú así — recuerda que hay variantes según la zona.
            </Text>
            <View style={styles.revisarMarco}>
              {itemRevision.frames.length > 0 && (
                <Image
                  key={fotogramaRev}
                  source={{ uri: armarDataUri(itemRevision.frames[fotogramaRev]) }}
                  style={styles.revisarImagen}
                  resizeMode="cover"
                  onError={e => console.log("Error cargando fotograma:", e.nativeEvent?.error)}
                />
              )}
              <Text style={styles.revisarContador}>
                {fotogramaRev + 1}/{itemRevision.frames.length}
              </Text>
            </View>
            <View style={styles.revisarBotones}>
              <TouchableOpacity style={styles.btnRevisarMal} onPress={() => votar(false)}>
                <Text style={styles.btnRevisarTexto}>✗ No es esta palabra</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnRevisarBien} onPress={() => votar(true)}>
                <Text style={styles.btnRevisarTexto}>✓ La reconozco</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.btnRevisarNeutral} onPress={cargarSiguienteRevision}>
              <Text style={styles.btnRevisarNeutralTexto}>🤷 No la conozco, pero no digo que esté mal</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    );
  }


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
          <View style={styles.progresoBarra}>
            <View style={[styles.progresoRelleno, { width: `${pctProgreso}%` }]} />
          </View>
        </View>
        <Text style={styles.instruccion}>
          {capturando
            ? "¡Haz la seña frente a la cámara!"
            : `Graba la seña: "${señaActual}" — Asegúrate que se vean tus manos`}
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
        <Text style={styles.homeTitulo}>DeafApp 🤟</Text>
        <Text style={styles.homeSubtitulo}>Lengua de Señas Chilena</Text>
      </View>
      <Text style={styles.homeInstruccion}>Selecciona una categoría y graba tus señas 👇</Text>
      <View style={styles.avisoImportanteBox}>
        <Text style={styles.avisoImportanteTexto}>
          ⚠️ Este proyecto NO busca reemplazar en ningún caso a los Intérpretes.
        </Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={true}>
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
            <CategoriaCard key={cat.id} cat={cat} conteos={conteos} conteosTotal={conteosTotal}
              onPress={() => { setCatActual(cat); setPantalla("categoria"); }} />
          ))}
        </View>

        {/* Botón Feedback */}
        <TouchableOpacity
          style={styles.btnRevisar}
          onPress={() => { setPantalla("revisar"); cargarSiguienteRevision(); }}
        >
          <Text style={styles.btnRevisarLinkTexto}>🔍 Ayuda a revisar señas</Text>
        </TouchableOpacity>

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

  grabarHeader: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10 },
  btnBack:      { width: 44, height: 44, justifyContent: "center", alignItems: "center" },
  btnBackTexto: { fontSize: 32, color: "#FFF", fontWeight: "300" },
  grabarTitulo: { flex: 1, textAlign: "center", fontSize: 20, fontWeight: "900", color: "#FFF", letterSpacing: 1 },

  camaraBox: { width: "100%", maxWidth: 600, alignSelf: "center", height: height * 0.50, overflow: "hidden", backgroundColor: "#000", borderRadius: 16 },
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

  instruccion: { fontSize: 14, color: "#AAA", textAlign: "center", marginTop: 12, paddingHorizontal: 20 },
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

  // Admin
  adminHeader:         { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#333" },
  adminTitulo:         { fontSize: 20, fontWeight: "900", color: "#FFF" },
  adminStats:          { margin: 12, backgroundColor: "#1A1A2E", borderRadius: 14, padding: 14, gap: 10 },
  adminStatsTexto:     { fontSize: 14, color: "#AAA" },
  btnAprobarTodas:     { backgroundColor: "#27AE60", borderRadius: 10, paddingVertical: 10, alignItems: "center" },
  btnAprobarTodasTexto:{ fontSize: 14, fontWeight: "700", color: "#FFF" },
  adminVacioTexto:     { fontSize: 16, color: "#666", marginTop: 12 },
  adminPreviewBox:     { margin: 12, backgroundColor: "#1A1A2E", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "#E94560" },
  adminPreviewTitulo:  { fontSize: 14, fontWeight: "700", color: "#FFF", marginBottom: 10 },
  adminPreviewMarco:   { width: "100%", height: 280, backgroundColor: "#000", borderRadius: 12, overflow: "hidden", justifyContent: "center", alignItems: "center" },
  adminPreviewImagen:  { width: "100%", height: "100%" },
  adminPreviewContador:{ position: "absolute", bottom: 6, right: 10, color: "#FFF", fontSize: 11, backgroundColor: "rgba(0,0,0,0.5)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  adminGrabCard:       { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1A2E", marginHorizontal: 12, marginVertical: 4, borderRadius: 14, padding: 14 },
  adminGrabInfo:       { flex: 1 },
  adminGrabLabel:      { fontSize: 16, fontWeight: "700", color: "#FFF", textTransform: "capitalize" },
  adminGrabMeta:       { fontSize: 12, color: "#888", marginTop: 3 },
  adminGrabFecha:      { fontSize: 11, color: "#555", marginTop: 2 },
  btnAprobar:          { width: 44, height: 44, borderRadius: 22, backgroundColor: "#27AE60", justifyContent: "center", alignItems: "center" },
  btnAprobarTexto:     { fontSize: 20, color: "#FFF", fontWeight: "bold" },
  btnRechazar:         { width: 44, height: 44, borderRadius: 22, backgroundColor: "#E74C3C", justifyContent: "center", alignItems: "center" },
  btnRechazarTexto:    { fontSize: 20, color: "#FFF", fontWeight: "bold" },
  btnAdminSmall:       { width: 36, height: 36, borderRadius: 18, backgroundColor: "#333", justifyContent: "center", alignItems: "center" },
  btnAdminSmallTexto:  { fontSize: 16, color: "#FFF" },
});
