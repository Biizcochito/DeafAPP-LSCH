import {useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,AppState,Easing,Image,Pressable,Text} from 'react-native';
import {useHomeNavigation} from './HomeNavigation';

export default function BrandHome({onHome,size=36,compact=false}) {
  const home=useHomeNavigation(),motion=useRef(new Animated.Value(0)).current;
  const [reduced,setReduced]=useState(true),[visible,setVisible]=useState(AppState.currentState==='active');
  useEffect(()=>{let alive=true;void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setReduced(value);}).catch(()=>{});const preference=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced),visibility=AppState.addEventListener('change',state=>setVisible(state==='active'));return()=>{alive=false;preference.remove();visibility.remove();};},[]);
  useEffect(()=>{if(reduced||!visible){motion.setValue(0);return;}const timing={duration:3200,easing:Easing.inOut(Easing.sin),useNativeDriver:true};const animation=Animated.loop(Animated.sequence([Animated.timing(motion,{...timing,toValue:1}),Animated.timing(motion,{...timing,toValue:0})]));animation.start();return()=>animation.stop();},[reduced,visible,motion]);
  return <Pressable accessibilityRole="button" accessibilityLabel="DeafApp, volver al inicio" onPress={onHome||home} style={{flexDirection:'row',alignItems:'center',gap:10,padding:4}}><Animated.View style={{transform:[{translateY:motion.interpolate({inputRange:[0,1],outputRange:[0,-2]})},{rotate:motion.interpolate({inputRange:[0,1],outputRange:['0deg','-3deg']})}]}}><Image source={require('../../public/apple-touch-icon.png')} style={{width:size,height:size}} accessibilityElementsHidden/></Animated.View>{!compact&&<Text style={{color:'#f5f2eb',fontSize:24,fontWeight:'800'}}>Deaf<Text style={{fontWeight:'400'}}>App</Text></Text>}</Pressable>;
}
