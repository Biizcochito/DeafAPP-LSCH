import {View,Text,TouchableOpacity} from 'react-native';
export default function TrainingWorkbench({onBack}){return <View style={{padding:24}}><Text>El administrador de entrenamiento está disponible en la web.</Text><TouchableOpacity onPress={onBack}><Text>Volver al administrador</Text></TouchableOpacity></View>;}
