// Speech APIs expose names and languages, but no standard gender field.
// Only offer gender shortcuts for identifiable voices; keep other voices selectable by name.
const female=/\b(female|mujer|femenina|helena|sabina|paulina|monica|mónica|sandra|elvira|dalia|laura|lucia|lucía|lupe|mia|mía|conchita|penelope|penélope|maria|maría|catalina|isidora|paloma|camila|carlota|emilia|flor|karina|marta|teresa|sofia|sofía|ximena)\b/i;
const male=/\b(male|hombre|masculina|pablo|jorge|diego|juan|carlos|raul|raúl|enrique|andres|andrés|tomas|tomás|alvaro|álvaro|alonso|david|rodrigo|gonzalo|lorenzo|mateo|emilio|alex|antonio|javier|miguel|rafael|sergio)\b/i;
export function spanishVoices(voices=[]){
  const seen=new Set();
  return voices.filter(voice=>/^es(?:[-_]|$)/i.test(voice.language)&&voice.identifier&&!seen.has(voice.identifier)&&seen.add(voice.identifier))
    .map(voice=>({...voice,gender:female.test(voice.name)?'female':male.test(voice.name)?'male':null}))
    .sort((a,b)=>Number(/^es[-_]CL$/i.test(b.language))-Number(/^es[-_]CL$/i.test(a.language)));
}
export function voiceForGender(voices,gender){return voices.find(voice=>voice.gender===gender)?.identifier||'';}
