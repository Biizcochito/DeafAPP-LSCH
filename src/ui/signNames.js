import {canonicalPhraseLabel} from '../training/phraseLabels.js';

// Presentation only: recording labels and model class IDs remain stable.
export const DISPLAY_WORDS={
  adios:'adiós','buenos dias':'buenos días','como estas':'cómo estás',si:'sí','mas despacio':'más despacio',
  mama:'mamá',tio:'tío',tia:'tía',bebe:'bebé',pure:'puré',azucar:'azúcar',
  platano:'plátano',sandia:'sandía',melon:'melón',limon:'limón',brocoli:'brócoli',reir:'reír',
  rapido:'rápido',frio:'frío',debil:'débil',vacio:'vacío',
  que:'qué',como:'cómo',donde:'dónde',cuando:'cuándo',quien:'quién','por que':'por qué',
  cuanto:'cuánto',cual:'cuál','para que':'para qué','de donde':'de dónde','a donde':'a dónde',cuantos:'cuántos',
  tu:'tú',el:'él',aqui:'aquí',alli:'allí',operacion:'operación',resfrio:'resfrío',
  habitacion:'habitación',bano:'baño',sofa:'sofá',television:'televisión',telefono:'teléfono',jardin:'jardín',
  avion:'avión',camion:'camión',policia:'policía',semaforo:'semáforo',estacion:'estación',
  lapiz:'lápiz',matematicas:'matemáticas','educacion fisica':'educación física',ingles:'inglés',
  pajaro:'pájaro',raton:'ratón',leon:'león',delfin:'delfín',
  futbol:'fútbol',basquetbol:'básquetbol',natacion:'natación',campeon:'campeón',caida:'caída',
  cafe:'café',corazon:'corazón',estomago:'estómago',
  peru:'perú',mexico:'méxico',canada:'canadá',japon:'japón',panama:'panamá',haiti:'haití','republica dominicana':'república dominicana',
  tarapaca:'tarapacá',valparaiso:'valparaíso',nuble:'Ñuble',biobio:'biobío',araucania:'araucanía','los rios':'los ríos',aysen:'aysén',
  america:'américa','america del sur':'américa del sur','america del norte':'américa del norte','america central':'américa central',
  africa:'áfrica',oceania:'oceanía',antartica:'antártica',oracion:'oración',bendicion:'bendición',
  manana:'mañana',despues:'después',miercoles:'miércoles',sabado:'sábado',dia:'día',
};
export const CATEGORY_DISPLAY_WORDS={'familia/papa':'papá'};

export function displayWord(value,category){
  if(typeof value!=='string')return value;
  const parts=value.split('/'),label=canonicalPhraseLabel(parts.at(-1).replaceAll('_',' '));
  const categoryId=typeof category==='string'?category:category?.id||parts.slice(0,-1).join('/');
  const key=label.normalize('NFC').toLocaleLowerCase('es');
  const scopedKey=`${categoryId}/${key}`;
  const corrected=Object.hasOwn(CATEGORY_DISPLAY_WORDS,scopedKey)?CATEGORY_DISPLAY_WORDS[scopedKey]:Object.hasOwn(DISPLAY_WORDS,key)?DISPLAY_WORDS[key]:null;
  if(!corrected)return label;
  if(label===label.toLocaleUpperCase('es'))return corrected.toLocaleUpperCase('es');
  return /^[A-ZÁÉÍÓÚÑ]/.test(label)?corrected[0].toLocaleUpperCase('es')+corrected.slice(1):corrected;
}
