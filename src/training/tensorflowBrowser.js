let loading;
export function loadTrainingTensorflow() {
  if(!loading)loading=new Promise((resolve,reject)=>{
    if(window.tf?.version?.tfjs==='4.22.0'){resolve(window.tf);return;}
    const script=document.createElement('script');script.src=new URL('hand-model/tf.min.js',document.baseURI).href;
    const timer=setTimeout(()=>{script.remove();reject(new Error('No se pudo cargar el entrenador. Inténtalo de nuevo.'));},30000);
    script.onload=()=>{clearTimeout(timer);window.tf?.version?.tfjs==='4.22.0'?resolve(window.tf):reject(new Error('Versión del entrenador incompatible.'));};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error('No se pudo cargar el entrenador.'));};document.head.appendChild(script);
  }).then(async tf=>{try{await tf.setBackend('webgl');}catch{await tf.setBackend('cpu');}await tf.ready();return tf;}).catch(e=>{loading=null;throw e;});
  return loading;
}
