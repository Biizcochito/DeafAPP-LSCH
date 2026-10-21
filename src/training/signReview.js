// Contrato de las revisiones humanas; las propuestas automáticas nunca aprueban una seña.
export const REVIEW_PAGE_SIZE=25;
export const REVIEW_STATUSES={pending:'Pendiente',approved:'Confirmada',rejected:'Descartada'};
export function validCandidateKey(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{11}@[0-9]{1,12}$/.test(value);}
export function validSegment(row){return !!row&&validCandidateKey(row.key)&&typeof row.videoId==='string'&&/^[A-Za-z0-9_-]{11}$/.test(row.videoId)&&row.key.split('@')[0]===row.videoId&&Number.isFinite(row.start)&&Number.isFinite(row.end)&&row.start>=0&&row.end>row.start&&row.end<=86400;}
export function segmentWatchUrl(row){if(!validSegment(row))throw Error('Segmento no válido.');return `https://www.youtube.com/watch?v=${row.videoId}&t=${Math.floor(row.start)}s`;}
export function segmentTime(seconds){const whole=Math.floor(seconds/60);return `${whole}:${(seconds-whole*60).toFixed(1).padStart(4,'0')}`;}
export function reviewExportText(data){if(!data?.decisions||Array.isArray(data.decisions)||typeof data.decisions!=='object'||Object.entries(data.decisions).some(([key,label])=>!validCandidateKey(key)||typeof label!=='string'||!label||label.length>80))throw Error('Exportación no válida.');return JSON.stringify(data.decisions,null,2);}
