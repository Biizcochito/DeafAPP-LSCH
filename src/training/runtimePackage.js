import {validateSequenceCandidate} from './sequenceCandidate.js';

const MAX_COMPRESSED=16_000_000,MAX_EXPANDED=64_000_000;
const hex=bytes=>Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
export async function digestText(text){return hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)));}
async function boundedBytes(stream,maximum){
  const reader=stream.getReader(),chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maximum){await reader.cancel();throw Error('El modelo supera el tamaño permitido.');}chunks.push(value);}}
  finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function encodeRuntimePackage(model){
  if(model)validateSequenceCandidate(model);
  let stream,size,encoding='gzip-base64';
  if(model){
    const metadata={...model,references:model.references.map(({sequence,...row})=>({...row,length:sequence.length}))};
    const header=new TextEncoder().encode(JSON.stringify(metadata)),prefix=new Uint8Array(4);new DataView(prefix.buffer).setUint32(0,header.length,true);
    size=4+header.length+model.references.reduce((n,row)=>n+row.sequence.length*88*4,0);let index=-2;
    stream=new ReadableStream({pull(controller){
      if(index===-2){index++;controller.enqueue(prefix);return;}if(index===-1){index++;controller.enqueue(header);return;}
      if(index>=model.references.length){controller.close();return;}
      const row=model.references[index++],bytes=new Uint8Array(row.sequence.length*88*4),view=new DataView(bytes.buffer);let offset=0;
      for(const frame of row.sequence)for(let i=0;i<88;i++){view.setFloat32(offset,frame[i],true);offset+=4;}controller.enqueue(bytes);
    }});encoding='gzip-base64-f32';
  }else{const blob=new Blob(['null']);stream=blob.stream();size=blob.size;}
  if(size>MAX_EXPANDED)throw Error('El modelo preparado es demasiado grande. Reduce las clases activas.');
  const compressed=await boundedBytes(stream.pipeThrough(new CompressionStream('gzip')),MAX_COMPRESSED);
  let binary='';for(let i=0;i<compressed.length;i+=8192)binary+=String.fromCharCode(...compressed.subarray(i,i+8192));
  return {encoding,data:btoa(binary),sha256:hex(await crypto.subtle.digest('SHA-256',compressed)),compressedBytes:compressed.length,expandedBytes:size};
}
export async function decodeRuntimePackage(packet){
  if(!['gzip-base64','gzip-base64-f32'].includes(packet?.encoding)||typeof packet.data!=='string'||packet.data.length>Math.ceil(MAX_COMPRESSED*4/3)+4||!/^[A-Za-z0-9+/]*={0,2}$/.test(packet.data)||
    typeof packet.sha256!=='string'||!/^[a-f0-9]{64}$/.test(packet.sha256))throw Error('El modelo preparado no tiene un formato válido.');
  const binary=atob(packet.data),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
  if(hex(await crypto.subtle.digest('SHA-256',bytes))!==packet.sha256)throw Error('La descarga del modelo está incompleta.');
  const expanded=await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),MAX_EXPANDED);
  if(packet.encoding==='gzip-base64'){const model=JSON.parse(new TextDecoder().decode(expanded));return model===null?null:validateSequenceCandidate(model);}
  if(expanded.length<4)throw Error('El paquete del modelo está truncado.');
  const view=new DataView(expanded.buffer,expanded.byteOffset,expanded.byteLength),size=view.getUint32(0,true);
  if(size<2||size>2_000_000||size+4>expanded.length)throw Error('La cabecera del modelo no es válida.');
  const model=JSON.parse(new TextDecoder().decode(expanded.subarray(4,4+size)));let offset=4+size;
  if(!Array.isArray(model.references)||model.references.length>8192)throw Error('El índice del modelo no es válido.');
  for(const row of model.references){if(!Number.isInteger(row.length)||row.length<3||row.length>32||offset+row.length*88*4>expanded.length)throw Error('Las referencias del modelo están truncadas.');
    row.sequence=Array.from({length:row.length},()=>{const frame=new Float32Array(88);for(let i=0;i<88;i++){frame[i]=view.getFloat32(offset,true);offset+=4;}return frame;});delete row.length;}
  if(offset!==expanded.length)throw Error('El paquete del modelo contiene datos inesperados.');return validateSequenceCandidate(model);
}
