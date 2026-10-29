import {Text, View, Pressable} from 'react-native';

export default function LiveInterpretation({onBack}) {
  return <View style={{flex:1,backgroundColor:'#080c0a',padding:28,justifyContent:'center',gap:20}}>
    <Text style={{fontSize:28,color:'#f5f2eb'}}>Interpretar en vivo</Text>
    <Text style={{color:'#a9b5ad'}}>Abre la versión web para interpretar señas con cámara, texto y voz.</Text>
    <Pressable onPress={onBack} accessibilityRole="button"><Text style={{color:'#a99bff'}}>Volver al inicio</Text></Pressable>
  </View>;
}
