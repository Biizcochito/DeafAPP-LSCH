export function validSequence(features) {
  if(!Array.isArray(features)||features.length!==32)return false;
  for(const frame of features){
    if(!Array.isArray(frame)||frame.length!==171)return false;
    for(const value of frame)if(!Number.isFinite(value)||Math.abs(value)>50)return false;
    if(frame.slice(168).some(value=>value!==0&&value!==1))return false;
  }
  return true;
}

export function sequenceKey(features) {return validSequence(features)?JSON.stringify(features):null;}
