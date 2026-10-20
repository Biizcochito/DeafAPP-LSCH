"""Prepare reviewed private progress for upload. Never packages recordings or local paths."""
import argparse
import base64
import gzip
import json
from collections import Counter
from pathlib import Path

def package(root):
    report = json.loads((root / 'report.json').read_text(encoding='utf-8'))
    scope = json.loads((root / 'scope.json').read_text(encoding='utf-8'))['targets']
    allowed = {row['classId'] for row in scope}
    models, payloads, counts = [], {}, Counter()
    for index, row in enumerate(report['models']):
        model_id = row['modelId']
        if len(model_id) != 32 or any(c not in '0123456789abcdef' for c in model_id):
            raise ValueError('Invalid model ID')
        directory = root / 'models' / model_id
        model = json.loads((directory / 'modelo.json').read_text(encoding='utf-8'))
        if not set(model['classes']) <= allowed or model.get('testOnly'):
            raise ValueError('Candidate outside reviewed scope')
        clean = {key: model[key] for key in ('format','version','id','language','inputShape','classes','featureLayout','decision','trees')}
        clean['publicActivation'] = False
        raw = json.dumps(clean, separators=(',', ':')).encode()
        payloads[model_id] = {'encoding':'gzip-base64','data':base64.b64encode(gzip.compress(raw, mtime=0)).decode(),'modelId':model_id}
        models.append({key:row.get(key) for key in ('modelId','classes','originals','variants','evaluationSamples','accuracy')})
        models[-1].update(name=row.get('name','Random Forest · catálogo disponible'),correct=row.get('correct',0),publicActivation=False)
        if index == 0:
            bundle = json.loads((directory / 'dataset.json').read_text(encoding='utf-8'))
            originals = {sample.get('sampleRecordingId') or sample.get('recordingId'):sample['classId'] for sample in bundle['train'] if sample.get('variant')=='original'}
            counts.update(originals.values())
    progress = {'updatedAt': report.get('coverageUpdatedAt',report['createdAt']), 'targetCount':len(scope),
                'trainedCount':len(counts),'originals':sum(counts.values()),'models':models,
                'targets':[{key:row[key] for key in ('classId','category','label')} | {'originals':counts[row['classId']]} for row in scope],
                'completePhraseOriginals':0,'publicActivation':False,
                'sources':[{'title':'Recursos digitales de Mineduc','url':'https://especial.mineduc.cl/recursos-apoyo-al-aprendizaje/recursos-audiovisuales-para-la-diversificacion-de-la-ensenanza/recursos-educactivos-digitales/'},
                           {'title':'Diccionario LSCh de JuegoEduca','url':'https://juegoeduca.com/palabras_lsch'}]}
    if progress['trainedCount']!=report['trainedCount'] or progress['originals']!=report['models'][0]['originals']:
        raise ValueError('Original counts differ from reviewed report')
    return {'visible-training-progress':progress, **{'training-candidate:'+key:value for key,value in payloads.items()}}

if __name__ == '__main__':
    parser=argparse.ArgumentParser();parser.add_argument('root',type=Path);args=parser.parse_args()
    payloads=package(args.root)
    output=args.root/'publication';output.mkdir(exist_ok=True)
    for key,value in payloads.items():
        (output/(key.replace(':','-')+'.json')).write_text(json.dumps(value,separators=(',',':')),encoding='utf-8')
    (output/'manifest.json').write_text(json.dumps([{'name':key,'file':key.replace(':','-')+'.json','size':len(json.dumps(value,separators=(',',':')))} for key,value in payloads.items()]),encoding='utf-8')
    print(json.dumps({'packaged':len(payloads),'classes':payloads['visible-training-progress']['trainedCount'],'originals':payloads['visible-training-progress']['originals']}))
