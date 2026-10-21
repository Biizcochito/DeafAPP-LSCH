import { useState } from "react";
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { CONSENT_CHOICES, GUARDIAN_RELATIONSHIPS, PRIVACY_NOTICE, isConsentAuthorizer, privacyReady } from "./privacyConsent";
import { TERMS_SECTIONS, privacySections } from "./privacyDocuments";
const styles = StyleSheet.create({ root:{flex:1,backgroundColor:"#080c0a"},body:{padding:24,paddingTop:55,gap:18},h1:{color:"#d6f36a",fontSize:32,fontWeight:"700"},h2:{color:"#f5f2eb",fontSize:20,fontWeight:"600"},text:{color:"#b5c1b9",fontSize:15,lineHeight:24},choice:{padding:16,borderWidth:1,borderColor:"#42543f",borderRadius:12,gap:8},button:{padding:17,backgroundColor:"#d6f36a",borderRadius:10},buttonText:{color:"#080c0a",fontWeight:"700",textAlign:"center"},disabled:{opacity:.4} });
export function PrivacyConsent({ onAccept, onBack, notice = PRIVACY_NOTICE }) {
  const [choices,setChoices] = useState({});
  const [authorizer,setAuthorizer] = useState(null);
  const [error,setError] = useState("");
  const [busy,setBusy] = useState(false);
  const ready = CONSENT_CHOICES.every(({id})=>choices[id]) && isConsentAuthorizer(authorizer) && privacyReady(notice) && !busy;
  return <ScrollView style={styles.root} contentContainerStyle={styles.body}>
    <Text accessibilityRole="header" style={styles.h1}>Tu seña. Tu decisión.</Text>
    <Text style={styles.text}>Todas las edades pueden sumar, con la autorización que corresponda. Responsable: {notice.controller}. Contacto: {notice.contact || "pendiente"}. Conservación: {notice.retention}.</Text>
    <Text style={styles.h2}>¿Quién autoriza este aporte?</Text>
    <TouchableOpacity style={styles.choice} accessibilityRole="radio" accessibilityState={{checked:authorizer?.role==="participant"}} onPress={()=>{setAuthorizer({role:"participant",ageDeclaration:"16-or-older"});setChoices({});}}><Text style={styles.text}>Yo, por mi propio aporte (desde los 16 años)</Text></TouchableOpacity>
    <TouchableOpacity style={styles.choice} accessibilityRole="radio" accessibilityState={{checked:authorizer?.role==="representative"}} onPress={()=>{setAuthorizer({role:"representative",ageDeclaration:"under-16",relationship:"",authorityConfirmed:false});setChoices({});}}><Text style={styles.text}>Su madre, padre o representante (participante menor de 16 años)</Text></TouchableOpacity>
    {authorizer?.role==="representative" && <View style={{gap:12}}><Text style={styles.h2}>Mi relación con quien participa</Text>
      {GUARDIAN_RELATIONSHIPS.map(([id,label])=><TouchableOpacity key={id} style={styles.choice} accessibilityRole="radio" accessibilityState={{checked:authorizer.relationship===id}} onPress={()=>setAuthorizer(value=>({...value,relationship:id,authorityConfirmed:false}))}><Text style={styles.text}>{label}</Text></TouchableOpacity>)}
      <TouchableOpacity style={styles.choice} accessibilityRole="checkbox" accessibilityState={{checked:authorizer.authorityConfirmed}} onPress={()=>setAuthorizer(value=>({...value,authorityConfirmed:!value.authorityConfirmed}))}><Text style={styles.text}>Declaro que tengo facultad legal para autorizar este aporte y actúo en interés de quien participa.</Text></TouchableOpacity>
      <Text style={styles.text}>Autoriza únicamente si tienes facultades para representar a quien participa. El responsable podrá solicitar su comprobación antes de utilizar el aporte.</Text>
    </View>}
    {CONSENT_CHOICES.map(choice=><TouchableOpacity key={choice.id} style={styles.choice} accessibilityRole="checkbox" accessibilityState={{checked:!!choices[choice.id]}} onPress={()=>setChoices(value=>({...value,[choice.id]:!value[choice.id]}))}><Text style={styles.h2}>{choices[choice.id]?"✓ ":"○ "}{choice.title}</Text><Text style={styles.text}>{choice.detail}</Text></TouchableOpacity>)}
    {error?<Text style={styles.text}>{error}</Text>:null}
    <TouchableOpacity style={[styles.button,!ready&&styles.disabled]} disabled={!ready} onPress={async()=>{setBusy(true);try{await onAccept({...choices,authorizer});}catch(e){setError(e.message);}finally{setBusy(false);}}}><Text style={styles.buttonText}>Autorizar y continuar</Text></TouchableOpacity>
    <TouchableOpacity onPress={onBack}><Text style={styles.text}>Seguir explorando sin autorizar</Text></TouchableOpacity>
    {[...TERMS_SECTIONS,...privacySections(notice)].map((section,index)=><View key={index} style={{gap:8}}><Text style={styles.h2}>{section.title}</Text><Text style={styles.text}>{section.text}</Text></View>)}
  </ScrollView>;
}
export function PrivacyDocument({kind,onBack,notice=PRIVACY_NOTICE}) { return <ScrollView style={styles.root} contentContainerStyle={styles.body}><Text style={styles.h1}>{kind==="terminos"?"Términos y condiciones":"Tu privacidad importa"}</Text>{(kind==="terminos"?TERMS_SECTIONS:privacySections(notice)).map(section=><View key={section.title}><Text style={styles.h2}>{section.title}</Text><Text style={styles.text}>{section.text}</Text></View>)}<TouchableOpacity onPress={onBack}><Text style={styles.text}>Volver al catálogo</Text></TouchableOpacity></ScrollView>; }
export function PrivacyPreviewComplete() { return null; }
