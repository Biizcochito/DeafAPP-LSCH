"""Synthetic packaging fixtures; never training data or evidence of recognition."""
import base64
import gzip
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('publication', Path(__file__).resolve().parents[1] / 'scripts/package-visible-training.py')
publication = importlib.util.module_from_spec(spec)
spec.loader.exec_module(publication)

class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        targets = [{'classId':'necesidades/agua','category':'necesidades','label':'agua'},
                   {'classId':'verbos/comer','category':'verbos','label':'comer'}]
        self.write('scope.json', {'targets':targets})
        self.report = {'createdAt':'2026-10-20','trainedCount':2,'contextRun':'fixture-run',
            'contextSummary':{'runId':'fixture-run','createdAt':'2026-10-20','newReviewedSequences':3,
                'newTrainingOriginals':1,'newReservedOriginals':2,'totalAvailableOriginals':5,
                'expertValidation':False,'participantIndependenceTested':False}, 'models':[]}
        a,b=targets[0]['classId'],targets[1]['classId']
        self.old=self.add_model('a'*32,[self.sample('a1',a),self.sample('b1',b)])
        self.new=self.add_model('b'*32,[self.sample('a1',a),self.sample('b1',b),self.sample('b2',b)])
        self.check=self.add_model('c'*32,[self.sample('a1',a),self.sample('b1',b)],
            [self.sample('reserved-a',a,'evaluation'),self.sample('reserved-b',b,'evaluation')])
        self.report['models'][-1]['contextRun']='fixture-run'
        self.write('report.json',self.report)

    def write(self,name,value):
        path=self.root/name
        path.parent.mkdir(parents=True,exist_ok=True)
        path.write_text(json.dumps(value),encoding='utf-8')

    def sample(self,identity,label,split='train'):
        return {'recordingId':identity,'parentHash':'source-'+identity,'classId':label,
                'variant':'original','split':split,'features':'PRIVATE-POINTS-MUST-NOT-BE-PACKAGED'}

    def add_model(self,identity,train,evaluation=None):
        evaluation=evaluation or []
        classes=sorted({x['classId'] for x in train})
        model={'id':identity,'format':'deafapp-lsch-python-forest','version':1,'language':'csg',
               'inputShape':[32,171],'classes':classes,'featureLayout':{},'decision':{},'trees':[],
               'directory':'PRIVATE-PATH','rawFrames':'PRIVATE-VIDEO'}
        self.write(f'models/{identity}/modelo.json',model)
        self.write(f'models/{identity}/dataset.json',{'train':train,'evaluation':evaluation})
        self.report['models'].append({'modelId':identity,'classes':classes,'originals':len(train),
            'variants':len(train),'evaluationSamples':len(evaluation),'accuracy':0 if evaluation else None,
            'directory':'PRIVATE-PATH'})
        return identity

    def test_counts_use_latest_full_candidate_and_keep_holdout_separate(self):
        data=publication.package(self.root)
        progress=data['visible-training-progress']
        self.assertEqual(progress['primaryModelId'],self.new)
        self.assertEqual((progress['originals'],progress['reservedOriginals'],progress['availableOriginals']),(3,2,5))
        self.assertEqual([x['originals'] for x in progress['targets']],[1,2])
        self.assertEqual([x['reservedOriginals'] for x in progress['targets']],[1,1])
        exported=json.dumps(data)
        self.assertNotIn('PRIVATE-',exported)
        for key,payload in data.items():
            if not key.startswith('training-candidate:'):continue
            model=json.loads(gzip.decompress(base64.b64decode(payload['data'])))
            self.assertFalse(model['publicActivation'])
            self.assertNotIn('rawFrames',model)
            self.assertNotIn('directory',model)

    def test_rejects_source_leak_even_under_different_recording_id(self):
        path=f'models/{self.old}/dataset.json'
        value=json.loads((self.root/path).read_text())
        value['train'][0]['parentHash']='source-reserved-a'
        self.write(path,value)
        with self.assertRaisesRegex(ValueError,'Reserved source'):
            publication.package(self.root)

    def test_rejects_invented_totals(self):
        self.report['contextSummary']['totalAvailableOriginals']=50
        self.write('report.json',self.report)
        with self.assertRaisesRegex(ValueError,'Context counts'):
            publication.package(self.root)

    def test_earlier_report_without_context_still_packages(self):
        del self.report['contextSummary']
        del self.report['contextRun']
        self.write('report.json',self.report)
        progress=publication.package(self.root)['visible-training-progress']
        self.assertEqual(progress['availableOriginals'],3)
        self.assertEqual(progress['reservedOriginals'],0)
        self.assertNotIn('context',progress)

if __name__=='__main__':unittest.main()
