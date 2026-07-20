/**
 * DeafApp — Recopilación de señas LSCh
 * Dataset completo con todas las categorías + feedback
 */

import { useState, useRef, useEffect } from "react";
import {
  StyleSheet, Text, View, TouchableOpacity,
  ScrollView, SafeAreaView, Dimensions,
  ActivityIndicator, StatusBar, Animated, TextInput,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { createClient } from "@supabase/supabase-js";

const { width, height } = Dimensions.get("window");

if (typeof document !== "undefined") {
  document.body.style.backgroundColor = "#0F0F1E";
  document.body.style.margin = "0";
  document.documentElement.style.backgroundColor = "#0F0F1E";
}

const SUPABASE_URL = "https://didlffnluqqurelgnqdp.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZGxmZm5sdXFxdXJlbGducWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDMwNTYsImV4cCI6MjA5OTk3OTA1Nn0.G6MqUFXNJleUTBtZu7kQb58E-rGWk3w-rLbvRu6xOVE";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const META_POR_SEÑA = 30;
const TOTAL_FRAMES  = 30;
const FPS_INTERVALO = 100;

const CATEGORIAS = [
  {
    id: "abecedario", nombre: "Abecedario", emoji: "🔤", color: "#E67E22",
    señas: ["a","b","c","d","e","f","g","h","i","j","k","l","m","n","ñ","o","p","q","r","s","t","u","v","w","x","y","z"],
  },
  {
    id: "numeros", nombre: "Números", emoji: "🔢", color: "#C39BD3",
    señas: ["uno","dos","tres","cuatro","cinco","seis","siete","ocho","nueve","diez","veinte","treinta","cuarenta","cincuenta","cien","mil"],
  },
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
    señas: ["comer","beber","dormir","trabajar","estudiar","caminar","correr","hablar","escuchar","ver","ir","venir","leer","escribir","jugar","nadar","bailar","cantar","reir","llorar","ayudar","querer","amar","pensar","saber","poder","tener","hacer","dar","salir","entrar","comprar","vender","vivir"],
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

export default function App() {
  const [permission, requestPermission] = useCameraPermissions();
  const [pantalla,   setPantalla]   = useState("bienvenida");
  const [catActual,  setCatActual]  = useState(null);
  const [señaActual, setSeñaActual] = useState(null);
  const [conteos,    setConteos]    = useState({});
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

  const cameraRef = useRef(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    cargarConteos();
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
        setConteos(prev => ({ ...prev, [señaActual]: (prev[señaActual] || 0) + 1 }));
        setExito(true);
      }
    } catch (e) {
      setError(`Error al subir: ${e.message}`);
    }
    setSubiendo(false);
  };

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

  // ── BIENVENIDA ───────────────────────────────────────────────────
  if (pantalla === "bienvenida") {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.bienvenidaScroll}>
          <Text style={styles.bienvenidaEmoji}>🤟</Text>
          <Text style={styles.bienvenidaTitulo}>Bienvenidx a DeafApp</Text>
          <Text style={styles.bienvenidaSubtitulo}>Lengua de Señas Chilena 🇨🇱</Text>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>¿Qué es esto?</Text>
            <Text style={styles.bienvenidaTexto}>
              DeafApp ayuda a crear una IA que entienda la Lengua de Señas Chilena (LSCh)🇨🇱
            </Text>
          </View>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>🤟 ¿Cómo funciona?</Text>
            <Text style={styles.bienvenidaTexto}>
             Tu grabas una seña.
             Esa grabacion ayuda a enseñar a la IA.
             Mientras mas personas participen, mejor aprendera.
            </Text>
          </View>
          <View style={styles.bienvenidaCard}>
            <Text style={styles.bienvenidaSeccion}>🚀 En el futuro</Text>
            <Text style={styles.bienvenidaTexto}>
              La app podrá:{"\n"}
              • Traducir señas a texto.{"\n"}
              • Pasar voz a señas.{"\n"}
              • Funcionar sin internet.
            </Text>
          </View>
          <View style={[styles.bienvenidaCard, { borderColor: "#E94560" }]}>
            <Text style={styles.bienvenidaSeccion}>❤️ Tu Ayuda importa</Text>
            <Text style={styles.bienvenidaTexto}>
              Cada video ayuda a mejorar la app.
              Asi sera mas facil la comunicacion entre personas sordas y oyentes

             ¡Gracias por ser parte de este proyecto!
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
          <Text style={styles.feedbackTitulo}>Feedback</Text>
          <View style={{ width: 44 }} />
        </View>
        <ScrollView contentContainerStyle={styles.feedbackScroll}>
          <Text style={styles.feedbackSubtitulo}>
            Tu opinión nos ayuda a mejorar DeafApp 💬
          </Text>

          <Text style={styles.feedbackLabel}>Tipo de feedback:</Text>
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
              <Text style={styles.exitoFeedbackTexto}>✅ ¡Gracias por tu feedback!</Text>
            </View>
          )}

          <TouchableOpacity
            style={[styles.btnEnviarFeedback, (!mensajeFeedback.trim() || enviandoFeedback) && { opacity: 0.5 }]}
            onPress={enviarFeedback}
            disabled={!mensajeFeedback.trim() || enviandoFeedback}
          >
            {enviandoFeedback
              ? <ActivityIndicator color="#FFF" />
              : <Text style={styles.btnEnviarFeedbackTexto}>📤 Enviar feedback</Text>
            }
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── GRABAR ───────────────────────────────────────────────────────
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

  // ── HOME ─────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" />
      <View style={styles.homeHeader}>
        <Text style={styles.homeTitulo}>DeafApp 🤟</Text>
        <Text style={styles.homeSubtitulo}>Lengua de Señas Chilena</Text>
      </View>
      <Text style={styles.homeInstruccion}>Selecciona una categoría y graba tus señas 👇</Text>
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

        {/* Botón Feedback */}
        <TouchableOpacity style={styles.btnFeedback} onPress={() => setPantalla("feedback")}>
          <Text style={styles.btnFeedbackTexto}>💬 Dar feedback o sugerencia</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const CARD_W = (width - 48) / 2;

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

  catCard:    { width: CARD_W, backgroundColor: "#1A1A2E", borderRadius: 16, padding: 14, alignItems: "center", borderWidth: 2 },
  catEmoji:   { fontSize: 34, marginBottom: 6 },
  catNombre:  { fontSize: 13, fontWeight: "700", color: "#FFF", marginBottom: 8, textAlign: "center" },
  catProgreso:{ fontSize: 11, color: "#888", marginTop: 4 },

  totalBox:       { alignItems: "center", marginTop: 20, gap: 6 },
  totalTexto:     { fontSize: 13, color: "#666" },
  actualizarTexto:{ fontSize: 13, color: "#4CAF50" },

  btnFeedback:     { marginHorizontal: 16, marginTop: 16, backgroundColor: "#1A1A2E", borderRadius: 16, paddingVertical: 16, alignItems: "center", borderWidth: 1, borderColor: "#F39C12" },
  btnFeedbackTexto:{ fontSize: 16, fontWeight: "700", color: "#F39C12" },

  barraFondo:   { width: "100%", height: 6, backgroundColor: "#333", borderRadius: 3, overflow: "hidden" },
  barraRelleno: { height: 6, borderRadius: 3 },

  catHeader:      { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 2, gap: 10 },
  catHeaderEmoji: { fontSize: 26 },
  catHeaderNombre:{ fontSize: 20, fontWeight: "800", color: "#FFF", flex: 1 },
  seccionTitulo:  { fontSize: 14, fontWeight: "700", color: "#AAA", marginLeft: 16, marginTop: 18, marginBottom: 6 },

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
});
