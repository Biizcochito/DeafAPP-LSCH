"""Prepare reviewed private progress for upload. Never packages recordings or local paths."""
import argparse
import base64
import gzip
import json
from collections import Counter
from pathlib import Path

def original_rows(bundle, split, allowed):
    rows = {}
    for sample in bundle[split]:
        if sample.get('variant') != 'original':
            continue
        identity = sample.get('recordingId')
        value = (sample['classId'], sample['parentHash'])
        if not identity or sample['classId'] not in allowed or identity in rows and rows[identity] != value:
            raise ValueError('Invalid or conflicting original sequence')
        rows[identity] = value
    return rows

def package(root):
    report = json.loads((root / 'report.json').read_text(encoding='utf-8'))
    scope = json.loads((root / 'scope.json').read_text(encoding='utf-8'))['targets']
    allowed = {row['classId'] for row in scope}
    models, payloads, bundles = [], {}, {}
    primary = max(report['models'], key=lambda row: (len(row['classes']), row['originals']))
    for row in report['models']:
        model_id = row['modelId']
        if len(model_id) != 32 or any(c not in '0123456789abcdef' for c in model_id):
            raise ValueError('Invalid model ID')
        directory = root / 'models' / model_id
        if model_id in payloads:
            raise ValueError('Duplicate candidate ID')
        model = json.loads((directory / 'modelo.json').read_text(encoding='utf-8'))
        if model.get('id') != model_id or model['classes'] != row['classes'] or not set(model['classes']) <= allowed or model.get('testOnly'):
            raise ValueError('Candidate outside reviewed scope')
        bundle = json.loads((directory / 'dataset.json').read_text(encoding='utf-8'))
        bundles[model_id] = bundle
        if len(original_rows(bundle, 'train', allowed)) != row['originals'] or len(bundle['evaluation']) != row['evaluationSamples']:
            raise ValueError('Candidate counts differ from saved dataset')
        clean = {key: model[key] for key in ('format','version','id','language','inputShape','classes','featureLayout','decision','trees')}
        clean['publicActivation'] = False
        raw = json.dumps(clean, separators=(',', ':')).encode()
        payloads[model_id] = {'encoding':'gzip-base64','data':base64.b64encode(gzip.compress(raw, mtime=0)).decode(),'modelId':model_id}
        models.append({key:row.get(key) for key in ('modelId','classes','originals','variants','evaluationSamples','accuracy','evaluationScope')})
        models[-1].update(name=row.get('name','Random Forest · catálogo disponible'),correct=row.get('correct',0),publicActivation=False)
    originals = original_rows(bundles[primary['modelId']], 'train', allowed)
    counts = Counter(value[0] for value in originals.values())
    reserved = {}
    context = report.get('contextSummary')
    if context:
        for row in report['models']:
            if row.get('contextRun') != report.get('contextRun'):
                continue
            for identity, value in original_rows(bundles[row['modelId']], 'evaluation', allowed).items():
                if identity in reserved and reserved[identity] != value:
                    raise ValueError('Conflicting reserved sequence')
                reserved[identity] = value
        reserved_hashes = {value[1] for value in reserved.values()}
        for bundle in bundles.values():
            if reserved_hashes & {sample['parentHash'] for sample in bundle['train']}:
                raise ValueError('Reserved source video entered candidate fitting')
        if context['newReservedOriginals'] != len(reserved) or context['totalAvailableOriginals'] != len(originals) + len(reserved):
            raise ValueError('Context counts differ from reviewed datasets')
    reserved_counts = Counter(value[0] for value in reserved.values())
    progress = {'updatedAt': report.get('coverageUpdatedAt',report['createdAt']), 'targetCount':len(scope),
                'trainedCount':len(counts),'originals':sum(counts.values()),'models':models,
                'primaryModelId':primary['modelId'],'availableOriginals':len(originals)+len(reserved),'reservedOriginals':len(reserved),
                'targets':[{key:row[key] for key in ('classId','category','label')} | {'originals':counts[row['classId']], 'reservedOriginals':reserved_counts[row['classId']]} for row in scope],
                'completePhraseOriginals':0,'publicActivation':False,
                'sources':[{'title':'Recursos digitales de Mineduc','url':'https://especial.mineduc.cl/recursos-apoyo-al-aprendizaje/recursos-audiovisuales-para-la-diversificacion-de-la-ensenanza/recursos-educactivos-digitales/'},
                           {'title':'Diccionario LSCh de JuegoEduca','url':'https://juegoeduca.com/palabras_lsch'}]}
    if context:
        progress['context'] = {key:context[key] for key in ('runId','createdAt','newReviewedSequences','newTrainingOriginals','newReservedOriginals','totalAvailableOriginals','expertValidation','participantIndependenceTested')}
    if progress['trainedCount']!=report['trainedCount'] or progress['originals']!=primary['originals']:
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
