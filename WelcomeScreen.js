import { StyleSheet, Text, View, TouchableOpacity, ScrollView, SafeAreaView, StatusBar } from "react-native";

export default function WelcomeScreen({ onBegin, onLogo }) {
    return (
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={styles.bienvenidaScroll}>
          <Text style={styles.bienvenidaEmoji}>🤟</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="DeafApp" onPress={onLogo} activeOpacity={0.8}>
            <Text style={styles.bienvenidaTitulo}>Bienvenidx a DeafApp</Text>
          </TouchableOpacity>
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
              Las grabaciones se envían para revisión.{"\n"}
              El equipo administrador comprueba la seña y decide si se aprueba o necesita correcciones.{"\n"}
              Graba la palabra solicitada y revisa tu video antes de enviarlo.
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
          <TouchableOpacity style={styles.btnComenzar} onPress={onBegin}>
            <Text style={styles.btnComenzarTexto}>¡Comenzar a Grabar! 🤟</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0F0F1E" },
  bienvenidaScroll:    { alignItems: "center", paddingHorizontal: 20, paddingTop: 40, maxWidth: 600, alignSelf: "center", width: "100%" },
  bienvenidaEmoji:     { fontSize: 70, marginBottom: 12 },
  bienvenidaTitulo:    { fontSize: 30, fontWeight: "900", color: "#FFF", textAlign: "center" },
  bienvenidaSubtitulo: { fontSize: 14, color: "#888", marginBottom: 24, textAlign: "center" },
  bienvenidaCard:      { backgroundColor: "#1A1A2E", borderRadius: 16, padding: 18, marginBottom: 14, width: "100%", borderWidth: 1, borderColor: "#333" },
  bienvenidaSeccion:   { fontSize: 16, fontWeight: "800", color: "#FFF", marginBottom: 8 },
  bienvenidaTexto:     { fontSize: 14, color: "#AAA", lineHeight: 22 },
  btnComenzar:         { backgroundColor: "#E94560", borderRadius: 20, paddingVertical: 18, paddingHorizontal: 40, marginTop: 10, width: "100%", alignItems: "center" },
  btnComenzarTexto:    { fontSize: 18, fontWeight: "900", color: "#FFF" },

});
