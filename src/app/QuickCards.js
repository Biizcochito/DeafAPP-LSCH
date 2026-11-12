import {Text, View, Pressable} from 'react-native';

export default function QuickCards({navigate}) {
  return <View style={{flex:1, backgroundColor:'#080c0a', padding:28, justifyContent:'center', gap:20}}>
    <Text style={{fontSize:28, color:'#f5f2eb'}}>Comunicación rápida</Text>
    <Text style={{color:'#a9b5ad'}}>Abre la versión web para usar las tarjetas de comunicación.</Text>
    <Pressable accessibilityRole="button" onPress={() => navigate('bienvenida')}><Text style={{color:'#a99bff'}}>Volver al inicio</Text></Pressable>
  </View>;
}
