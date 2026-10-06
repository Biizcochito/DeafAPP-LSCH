from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile
from lxml import etree
from docx import Document
import hashlib
import json
import shutil

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(__file__).resolve().parent
SOURCE = Path(r'D:\Descargas D\2.6_GuiaEstudiante_Fase 2_Informe Final Proyecto APT.docx')
TARGET = ROOT / 'entregables' / 'DeafApp-Informe-Final-Proyecto-APT-completo.docx'
ANS = json.loads((WORK / 'respuestas.json').read_text(encoding='utf-8'))
INVENTORY = json.loads((ROOT / '.codex-docs-apt-20261004/informe-inventory.json').read_text(encoding='utf-8'))

# Reuse the reviewed OOXML paragraph and figure helpers without their build calls.
helper_file = ROOT / '.codex-docs-apt-20261004/completar_guias.py'
helper_source = helper_file.read_text(encoding='utf-8').split("\nmake('desarrollo',", 1)[0]
helpers = {'__file__': str(helper_file)}
exec(compile(helper_source, str(helper_file), 'exec'), helpers)
NS = helpers['NS']
qn = helpers['_qn']
paragraph = helpers['paragraph']
rows = helpers['rows']
cells = helpers['cells']

assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == INVENTORY['sha256'], 'The original guide changed; inspect the new source.'
backup = WORK / 'guia-original.docx'
if not backup.exists():
    shutil.copyfile(SOURCE, backup)
assert backup.read_bytes() == SOURCE.read_bytes()
with ZipFile(SOURCE) as z:
    infos = z.infolist()
    package = {i.filename: z.read(i.filename) for i in infos}

document = etree.fromstring(package['word/document.xml'])
body = document.find('w:body', NS)
blocks = list(body)
relationships = etree.fromstring(package['word/_rels/document.xml.rels'])
types = etree.fromstring(package['[Content_Types].xml'])
coverage = []

def answer_paragraph(heading, answer, last=False):
    p = paragraph(answer, after=0 if last else 90)
    if heading:
        run = deepcopy(p.find('w:r', NS))
        etree.SubElement(run.find('w:rPr', NS), qn('w', 'b'))
        text = run.find('w:t', NS)
        text.text = heading + ': '
        text.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        p.insert(p.index(p.find('w:r', NS)), run)
    return p

for row, value in zip(rows(blocks[9]), [ANS['proyecto'], ANS['areas'], ANS['competencias']]):
    helpers['cell_text'](cells(row)[1], [value])
    helpers['remove_row_minimum'](row)

response_cells = []
for row, section in zip(rows(blocks[11])[1:], ANS['secciones']):
    cell = cells(row)[1]
    for node in list(cell):
        if node.tag != qn('w', 'tcPr'):
            cell.remove(node)
    for index, (heading, answer) in enumerate(section['respuestas']):
        cell.append(answer_paragraph(heading, answer, index == len(section['respuestas']) - 1))
        coverage.append({'section': section['nombre'], 'question': heading or 'continuacion', 'answered': bool(answer.strip())})
    helpers['remove_row_minimum'](row)
    response_cells.append(cell)

for index, key, size, after in [(4, 'grupo', 22, 30), (5, 'carrera', 20, 30), (6, 'fecha', 20, 180)]:
    body.replace(blocks[index], paragraph(ANS[key], align='center', size=size, after=after))

images = [
    ('grabacion-una-mano.png', 'Captura real de cara y una mano durante una prueba de grabación', 4.4),
    ('ppt-moderacion-actual.jpg', 'Panel de revisión con 110 grabaciones aprobadas y 20 pendientes', 5.8),
    ('ppt-recuperacion-actual.jpg', 'Recuperación del material antiguo y selección de dos señas para experimentar', 5.8),
    ('ppt-modelo-guardado.jpg', 'Informe del prototipo de cerdo y día con una de dos pruebas acertada', 5.8),
]
new_parts = helpers['add_appendix'](body, relationships, types, images)
package['word/document.xml'] = helpers['xml_bytes'](document)
package['word/_rels/document.xml.rels'] = helpers['xml_bytes'](relationships)
package['[Content_Types].xml'] = helpers['xml_bytes'](types)
package.update(new_parts)
TARGET.parent.mkdir(exist_ok=True)
with ZipFile(TARGET, 'w') as z:
    for info in infos:
        z.writestr(info, package.pop(info.filename))
    for name, data in package.items():
        z.writestr(name, data, compress_type=8)

all_text = '\n'.join(document.xpath('//w:t/text()', namespaces=NS))
response_text = '\n'.join(' '.join(cell.xpath('.//w:t/text()', namespaces=NS)) for cell in response_cells)
for forbidden in ['¿', 'Escribe el nombre de tu Proyecto', 'Menciona la(s)', 'Diego001']:
    assert forbidden not in response_text, forbidden
assert all(item['answered'] for item in coverage)
assert len(response_cells) == 6
assert 'Firefox' in response_text and 'siguen pendientes' in response_text
with ZipFile(TARGET) as z:
    assert z.testzip() is None
    changed = [name for name, info in INVENTORY['parts'].items() if hashlib.sha256(z.read(name)).hexdigest() != info['sha256']]
    assert set(changed) == {'word/document.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml'}
    for name in z.namelist():
        if name.endswith('.xml') or name.endswith('.rels'):
            etree.fromstring(z.read(name))
    assert len(new_parts) == 4

final = Document(TARGET)
original = Document(backup)
assert len(final.sections) == len(original.sections) == 1
assert etree.tostring(final.sections[0]._sectPr) == etree.tostring(original.sections[0]._sectPr)
assert len(final.inline_shapes) == 4
(WORK / 'texto-final.txt').write_text(all_text, encoding='utf-8')
report = {
    'output': str(TARGET), 'backup': str(backup), 'source_sha256': INVENTORY['sha256'],
    'output_sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(), 'sections_answered': 6,
    'answer_paragraphs': len(coverage), 'coverage': coverage, 'word_count': len(all_text.split()),
    'image_count': 4, 'changed_original_parts': changed, 'section_geometry_preserved': True,
    'all_xml_well_formed': True, 'original_updated': False,
    'render_status': 'Not verified: bundled LibreOffice executable is unavailable on this Windows runtime',
}
(WORK / 'validacion.json').write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding='utf-8')
print(json.dumps({key: value for key, value in report.items() if key != 'coverage'}, ensure_ascii=False))
