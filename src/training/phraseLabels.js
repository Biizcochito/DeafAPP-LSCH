// Equivalencia indicada por el equipo: la frase completa «yo bien» se muestra y prepara como «estoy bien».
// Las señas aisladas «yo» y «bien» conservan sus clases y no se concatenan para fabricar una muestra.
export const ESTOY_BIEN_CLASS='oraciones/estoy bien';
export function isYoBienAlias(value){return typeof value==='string'&&value.split('/').at(-1).replaceAll('_',' ').trim().replace(/\s+/g,' ').toLocaleLowerCase('es')==='yo bien';}
export function isNecesitarAlias(value){return typeof value==='string'&&value.trim().toLocaleLowerCase('es')==='necesitar';}
export function canonicalPhraseClassId(value){
  if(isYoBienAlias(value))return ESTOY_BIEN_CLASS;
  return typeof value==='string'&&/^verbos\/necesitar$/i.test(value.trim())?'verbos/necesito':value;
}
export function canonicalPhraseLabel(value){return isYoBienAlias(value)?'estoy bien':isNecesitarAlias(value)?'necesito':value;}
export function canonicalPhraseRow(row){
  if(!row)return row;
  const classId=canonicalPhraseClassId(row.classId);
  if(classId===row.classId||isYoBienAlias(row.classId)&&row.wholePhrase!==true)return row;
  return {...row,classId,sourceClassId:row.sourceClassId||row.classId};
}
