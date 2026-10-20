// Equivalencia indicada por el equipo: la frase completa «yo bien» se muestra y prepara como «estoy bien».
// Las señas aisladas «yo» y «bien» conservan sus clases y no se concatenan para fabricar una muestra.
export const ESTOY_BIEN_CLASS='oraciones/estoy bien';
export function isYoBienAlias(value){return typeof value==='string'&&value.split('/').at(-1).replaceAll('_',' ').trim().replace(/\s+/g,' ').toLocaleLowerCase('es')==='yo bien';}
export function canonicalPhraseClassId(value){return isYoBienAlias(value)?ESTOY_BIEN_CLASS:value;}
export function canonicalPhraseLabel(value){return isYoBienAlias(value)?'estoy bien':value;}
export function canonicalPhraseRow(row){
  if(!row||row.wholePhrase!==true||!isYoBienAlias(row.classId))return row;
  return {...row,classId:ESTOY_BIEN_CLASS,sourceClassId:row.sourceClassId||row.classId};
}
