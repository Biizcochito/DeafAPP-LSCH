export const QUALITY_LEVELS = ['high','medium','low','unrated'];
export const QUALITY_LABELS = {high:'Alto',medium:'Medio',low:'Bajo',unrated:'Sin evaluar'};
export const QUALITY_SYMBOLS = {high:'✓',medium:'≈',low:'↓',unrated:'?'};
export const QUALITY_MINIMUM_SAMPLES = 5;

// The live match score is a similarity measure, not a measure of accuracy.
// Only completed, held-out evaluations can assign an automatic quality level.
export function recognitionQuality(row,observed) {
  const manual=row?.manualLevel;
  if(QUALITY_LEVELS.includes(manual))return {level:manual,source:'manual',label:QUALITY_LABELS[manual],observedStreak:observed?.bestStreak,detail:`Nivel asignado manualmente por administración.${observed?.bestStreak?` La cámara observó una mejor racha de ${observed.bestStreak}/5, pero el nivel manual mantiene la prioridad.`:''}`};
  if(Number.isInteger(observed?.bestStreak)&&observed.bestStreak>=1&&observed.bestStreak<=5){
    const n=observed.bestStreak,level=n>=5?'high':n>=3?'medium':'low';
    return {level,source:'stability',label:QUALITY_LABELS[level],detail:`Mejor racha observada en este navegador: ${n} ${n===1?'detección consecutiva':'detecciones consecutivas'} de esta seña, con movimientos separados. Mide consistencia del modelo, no aciertos comprobados.`,bestStreak:n};
  }
  const e=row?.evaluation;
  const count=n=>Number.isSafeInteger(n)&&n>=0;
  const valid=e&&['different-recordings','different-confirmed-people'].includes(e.scope)&&count(e.samples)&&count(e.correct)&&count(e.predicted)&&e.correct<=e.samples&&e.correct<=e.predicted;
  if(!valid||e.samples<QUALITY_MINIMUM_SAMPLES)return {level:'unrated',source:'automatic',label:QUALITY_LABELS.unrated,detail:`Se necesitan al menos ${QUALITY_MINIMUM_SAMPLES} pruebas reservadas completas para calcular el nivel automático.`};
  const recall=e.correct/e.samples,precision=e.predicted?e.correct/e.predicted:0,score=Math.min(recall,precision);
  const level=score>=.85?'high':score>=.60?'medium':'low';
  const scope=e.scope==='different-confirmed-people'?'personas distintas':'grabaciones distintas; personas sin verificar';
  return {level,source:'automatic',label:QUALITY_LABELS[level],detail:`Pruebas con ${scope}: ${e.correct} de ${e.samples} reconocidas correctamente. Acierto ${Math.round(recall*100)} %; precisión ${Math.round(precision*100)} %.`,samples:e.samples};
}

export function qualityByClass(rows) {
  const result=new Map();
  for(const row of Array.isArray(rows)?rows:[])if(typeof row?.classId==='string'&&!result.has(row.classId))result.set(row.classId,row);
  return result;
}
