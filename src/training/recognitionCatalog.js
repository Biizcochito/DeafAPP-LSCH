import {CATEGORIAS,CATEGORIAS_VISIBLES} from '../catalog/signCatalog.js';
import {canonicalPhraseClassId,isNecesitarAlias} from './phraseLabels.js';
import {displayWord} from '../ui/signNames.js';

export const VOCABULARY_STATES=['collecting','testing','enabled','paused'];
export const VOCABULARY_LABELS={collecting:'Recopilando',testing:'En evaluación',enabled:'Habilitada',paused:'Pausada'};
export const COLLECTION_GOALS={recordings:50,people:10,minimum:3};
export function normalizedLabel(value){const label=String(value??'').normalize('NFC').trim().toLocaleLowerCase('es').replaceAll('_',' ').replace(/\s+/g,' ');return isNecesitarAlias(label)?'necesito':label;}
const comparison=value=>normalizedLabel(value).replaceAll('ñ','\u0001').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replaceAll('\u0001','ñ');
export function catalogueKey(category,label){return `${category}/${comparison(label)}`;}
export function catalogueSeed(){
  const visible=new Set(CATEGORIAS_VISIBLES.flatMap(c=>c.señas.map(label=>canonicalPhraseClassId(`${c.id}/${label}`))));
  const found=new Set();
  return CATEGORIAS.flatMap(category=>category.señas.flatMap(label=>{
    const classId=canonicalPhraseClassId(`${category.id}/${label}`),key=catalogueKey(category.id,classId.split('/').at(-1));
    if(found.has(key))return [];found.add(key);
    return [{classId,category:category.id,label:classId.split('/').at(-1),displayLabel:displayWord(classId.split('/').at(-1)),categoryTitle:category.nombre,
      color:category.color,emoji:category.emoji,collection:visible.has(classId),state:visible.has(classId)?'enabled':'collecting',
      activationScope:'prototype',minimum:COLLECTION_GOALS.minimum,recordingGoal:COLLECTION_GOALS.recordings,peopleGoal:COLLECTION_GOALS.people,version:0,aliasOf:null}];
  }));
}
export function validateCatalogueEntry(entry){
  if(!entry||typeof entry.category!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(entry.category)||typeof entry.label!=='string'||
    entry.label!==normalizedLabel(entry.label)||entry.label.length<1||entry.label.length>80||/[\u0000-\u001f/<>]/.test(entry.label)||entry.classId!==`${entry.category}/${entry.label}`||
    !VOCABULARY_STATES.includes(entry.state)||!Number.isInteger(entry.minimum)||entry.minimum<3||entry.minimum>100||
    !Number.isInteger(entry.recordingGoal)||entry.recordingGoal<entry.minimum||entry.recordingGoal>2000||!Number.isInteger(entry.peopleGoal)||entry.peopleGoal<1||entry.peopleGoal>200||
    typeof entry.displayLabel!=='string'||entry.displayLabel.length<1||entry.displayLabel.length>100||typeof entry.collection!=='boolean'||!Number.isInteger(entry.version)||entry.version<0)
    throw Error('La seña tiene datos de catálogo no válidos.');
  return entry;
}
export function resolveCatalogueClass(classId,catalogue){
  return createCatalogueResolver(catalogue)(classId);
}
export function createCatalogueResolver(catalogue){
  const byId=new Map(catalogue.map(row=>[row.classId,row])),cache=new Map();
  return classId=>{classId=canonicalPhraseClassId(classId);if(cache.has(classId))return cache.get(classId);
    let row=byId.get(classId);const seen=new Set();
    while(row?.aliasOf){if(seen.has(row.classId)){cache.set(classId,null);return null;}seen.add(row.classId);row=byId.get(row.aliasOf);}
    const result=row?.classId||null;cache.set(classId,result);return result;
  };
}
export function collectionCategories(catalogue){
  const groups=new Map();
  for(const entry of catalogue){if(!entry.collection||entry.aliasOf||entry.state==='paused')continue;
    if(!groups.has(entry.category))groups.set(entry.category,{id:entry.category,nombre:entry.categoryTitle||entry.category,color:entry.color||'#a99bff',emoji:entry.emoji||'🤟',señas:[]});
    if(!groups.get(entry.category).señas.includes(entry.label))groups.get(entry.category).señas.push(entry.label);
  }
  return [...groups.values()];
}
