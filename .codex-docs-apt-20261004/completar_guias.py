from pathlib import Path
from copy import deepcopy
from zipfile import ZipFile
from lxml import etree
from PIL import Image
from docx import Document
import hashlib
import json
import sys

SKILL = Path(r'C:\Users\bizco\.codex\plugins\cache\openai-primary-runtime\documents\26.930.11008\skills\documents')
sys.path.insert(0, str(SKILL / 'scripts'))
from docx_ooxml_patch import _qn

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(__file__).resolve().parent
OUT = ROOT / 'entregables'
ANS = json.loads((WORK / 'respuestas.json').read_text(encoding='utf-8'))
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
      'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'pic': 'http://schemas.openxmlformats.org/drawingml/2006/picture'}
W = NS['w']
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'


def child(parent, name, attrs=None):
    node = etree.SubElement(parent, _qn('w', name))
    for key, val in (attrs or {}).items():
        node.set(_qn('w', key), str(val))
    return node


def paragraph(text='', size=22, bold=False, align='both', after=90, before=0, keep=False):
    p = etree.Element(_qn('w', 'p'))
    pp = child(p, 'pPr')
    child(pp, 'spacing', {'before': before, 'after': after, 'line': 240, 'lineRule': 'auto'})
    child(pp, 'jc', {'val': align})
    if keep:
        child(pp, 'keepNext')
    r = child(p, 'r')
    rp = child(r, 'rPr')
    child(rp, 'rFonts', {'ascii': 'Calibri', 'hAnsi': 'Calibri', 'cs': 'Calibri'})
    if bold:
        child(rp, 'b')
    child(rp, 'color', {'val': '000000'})
    child(rp, 'sz', {'val': size})
    child(rp, 'szCs', {'val': size})
    child(rp, 'lang', {'val': 'es-CL'})
    child(r, 't').text = text
    return p


def cell_text(cell, texts, size=22, align='both', heading=None):
    for node in list(cell):
        if node.tag != _qn('w', 'tcPr'):
            cell.remove(node)
    if heading:
        cell.append(paragraph(heading, size=size, bold=True, align='left', keep=True))
    for i, txt in enumerate(texts):
        cell.append(paragraph(txt, size=size, align=align, after=90 if i < len(texts)-1 else 0))
    tp = cell.find('w:tcPr', NS)
    if tp is not None:
        va = tp.find('w:vAlign', NS)
        if va is not None:
            va.set(_qn('w', 'val'), 'center')


def rows(table):
    return table.findall('w:tr', NS)


def cells(row):
    return row.findall('w:tc', NS)


def remove_row_minimum(row):
    for node in row.findall('w:trPr/w:trHeight', NS):
        node.getparent().remove(node)


def xml_bytes(tree):
    return etree.tostring(tree, encoding='UTF-8', xml_declaration=True, standalone=True)


def image_para(image_id, rid, path, width_in):
    width_px, height_px = Image.open(path).size
    cx = int(width_in * 914400)
    cy = int(cx * height_px / width_px)
    p = paragraph('', size=20, align='center', after=80)
    p.find('w:r/w:t', NS).getparent().remove(p.find('w:r/w:t', NS))
    run = p.find('w:r', NS)
    drawing = child(run, 'drawing')
    q = lambda prefix, tag: '{'+NS[prefix]+'}'+tag
    inline = etree.SubElement(drawing, q('wp', 'inline'), distT='0', distB='0', distL='0', distR='0')
    etree.SubElement(inline, q('wp', 'extent'), cx=str(cx), cy=str(cy))
    etree.SubElement(inline, q('wp', 'docPr'), id=str(image_id), name=path.stem,
                     descr='Captura real de la aplicación DeafApp')
    frame = etree.SubElement(inline, q('wp', 'cNvGraphicFramePr'))
    etree.SubElement(frame, q('a', 'graphicFrameLocks'), noChangeAspect='1')
    graphic = etree.SubElement(inline, q('a', 'graphic'))
    gd = etree.SubElement(graphic, q('a', 'graphicData'), uri=NS['pic'])
    pic = etree.SubElement(gd, q('pic', 'pic'))
    nv = etree.SubElement(pic, q('pic', 'nvPicPr'))
    etree.SubElement(nv, q('pic', 'cNvPr'), id='0', name=path.name)
    etree.SubElement(nv, q('pic', 'cNvPicPr'))
    bf = etree.SubElement(pic, q('pic', 'blipFill'))
    etree.SubElement(bf, q('a', 'blip'), {q('r', 'embed'): rid})
    stretch = etree.SubElement(bf, q('a', 'stretch'))
    etree.SubElement(stretch, q('a', 'fillRect'))
    sp = etree.SubElement(pic, q('pic', 'spPr'))
    xf = etree.SubElement(sp, q('a', 'xfrm'))
    etree.SubElement(xf, q('a', 'off'), x='0', y='0')
    etree.SubElement(xf, q('a', 'ext'), cx=str(cx), cy=str(cy))
    geom = etree.SubElement(sp, q('a', 'prstGeom'), prst='rect')
    etree.SubElement(geom, q('a', 'avLst'))
    return p


def add_appendix(body, relationships, types, image_paths):
    additions = {}
    anchor = body.find('w:sectPr', NS)
    ids = {r.get('Id') for r in relationships}
    number = 200
    for i, (name, caption, width) in enumerate(image_paths):
        if i % 2 == 0:
            p = paragraph('Evidencias del proyecto' if i == 0 else 'Evidencias del entrenamiento',
                          size=26, bold=True, align='left', after=140, keep=True)
            child(p.find('w:pPr', NS), 'pageBreakBefore')
            body.insert(body.index(anchor), p)
        path = ROOT / 'artifacts' / name
        extension = path.suffix.lower().lstrip('.')
        while 'rIdAPT'+str(number) in ids:
            number += 1
        rid = 'rIdAPT'+str(number)
        rel = etree.SubElement(relationships, '{'+REL+'}Relationship',
                              Id=rid, Type=NS['r']+'/image', Target='media/apt-'+name)
        ids.add(rid)
        additions['word/media/apt-'+name] = path.read_bytes()
        if not any(x.get('Extension') == extension for x in types):
            etree.SubElement(types, '{'+CT+'}Default', Extension=extension,
                             ContentType='image/png' if extension == 'png' else 'image/jpeg')
        title = paragraph(f'Figura {i+1}  {caption}', size=20, align='left', after=65, keep=True)
        body.insert(body.index(anchor), title)
        body.insert(body.index(anchor), image_para(number, rid, path, width))
        number += 1
    return additions


def make(label, original, filename):
    original = Path(original)
    inv = json.loads((WORK / (label+'-inventory.json')).read_text(encoding='utf-8'))
    assert hashlib.sha256(original.read_bytes()).hexdigest() == inv['sha256']
    with ZipFile(original) as z:
        package = {info.filename: z.read(info.filename) for info in z.infolist()}
        infos = z.infolist()
    document = etree.fromstring(package['word/document.xml'])
    body = document.find('w:body', NS)
    blocks = list(body)
    rels = etree.fromstring(package['word/_rels/document.xml.rels'])
    types = etree.fromstring(package['[Content_Types].xml'])
    if label == 'desarrollo':
        main = rows(blocks[11])
        for r, key in zip(main, ['resumen', 'objetivos', 'metodologia', 'evidencias']):
            cell_text(cells(r)[1], ANS['desarrollo'][key])
            remove_row_minimum(r)
        plan = blocks[14]
        template = deepcopy(rows(plan)[2])
        plan.remove(rows(plan)[2])
        for ri, data in enumerate(ANS['desarrollo']['plan']):
            row = deepcopy(template)
            remove_row_minimum(row)
            rp = row.find('w:trPr', NS)
            if rp is None:
                rp = etree.Element(_qn('w', 'trPr'))
                row.insert(0, rp)
            if rp.find('w:cantSplit', NS) is None:
                child(rp, 'cantSplit')
            for ci, (c, value) in enumerate(zip(cells(row), data)):
                cell_text(c, [value], size=18, align='left' if ci in [0, 1, 2, 5, 7] else 'center')
            plan.append(row)
        for header in rows(plan)[:2]:
            hp = header.find('w:trPr', NS)
            if hp is None:
                hp = etree.Element(_qn('w', 'trPr')); header.insert(0, hp)
            if hp.find('w:tblHeader', NS) is None:
                child(hp, 'tblHeader')
        heads = [('facilitadores',18,'Factores que han facilitado y dificultado el plan de trabajo'),
                 ('ajustes',20,'Actividades ajustadas o eliminadas'),
                 ('pendientes',23,'Actividades no iniciadas o con retraso')]
        for key, index, title in heads:
            row = rows(blocks[index])[0]
            cell_text(cells(row)[0], ANS['desarrollo'][key], heading=title)
            remove_row_minimum(row)
        # A blank source paragraph is the group-information slot; the original title drawing stays intact.
        nameslot = blocks[5]
        nameslot.getparent().replace(nameslot, paragraph(ANS['grupo'], align='center', size=22, after=30))
        body.replace(blocks[6], paragraph(ANS['carrera'], align='center', size=20, after=30))
        body.replace(blocks[7], paragraph(ANS['fecha'], align='center', size=20, after=180))
        note = paragraph('Responsables y plazos según la definición del proyecto. «Equipo» corresponde a Diego Padilla, Ignacio Hernández y Felipe Crisóstomo. Los estados reflejan el avance al 4 de octubre.', size=20, align='left', after=120)
        body.insert(body.index(plan), note)
        pictures = [('grabacion-una-mano.png','Prueba de cámara con puntos de cara y una mano detectada',4.4),
                    ('ppt-moderacion-actual.jpg','Panel de revisión con 110 aprobadas y 20 pendientes',5.8)]
    else:
        main = rows(blocks[9])
        for row, value in zip(main, [ANS['proyecto'],ANS['informe']['areas'],ANS['informe']['competencias']]):
            cell_text(cells(row)[1], [value]); remove_row_minimum(row)
        content = rows(blocks[11])[1:]
        for row, key in zip(content,['relevancia','objetivos','metodologia','desarrollo','evidencias','intereses']):
            cell_text(cells(row)[1], ANS['informe'][key]); remove_row_minimum(row)
        body.replace(blocks[4], paragraph(ANS['grupo'], align='center', size=22, after=30))
        body.replace(blocks[5], paragraph(ANS['carrera'], align='center', size=20, after=30))
        body.replace(blocks[6], paragraph(ANS['fecha'], align='center', size=20, after=180))
        pictures = [('grabacion-una-mano.png','Prueba real del seguimiento de cara y manos',4.4),
                    ('ppt-moderacion-actual.jpg','Revisión de contribuciones en el administrador',5.8),
                    ('ppt-recuperacion-actual.jpg','Recuperación de 110 grabaciones y dos señas para experimentar',5.8),
                    ('ppt-modelo-guardado.jpg','Informe del prototipo de cerdo y día con una de dos pruebas acertada',5.8)]
    new_parts = add_appendix(body, rels, types, pictures)
    package['word/document.xml'] = xml_bytes(document)
    package['word/_rels/document.xml.rels'] = xml_bytes(rels)
    package['[Content_Types].xml'] = xml_bytes(types)
    package.update(new_parts)
    target = OUT / filename
    OUT.mkdir(exist_ok=True)
    with ZipFile(target, 'w') as dest:
        for info in infos:
            dest.writestr(info, package.pop(info.filename))
        for name, data in package.items():
            dest.writestr(name, data, compress_type=8)
    changed = []
    with ZipFile(target) as z:
        assert z.testzip() is None
        for name, data in inv['parts'].items():
            if hashlib.sha256(z.read(name)).hexdigest() != data['sha256']:
                changed.append(name)
        assert set(changed) == {'word/document.xml','word/_rels/document.xml.rels','[Content_Types].xml'}
        for name in z.namelist():
            if name.endswith('.xml') or name.endswith('.rels'):
                etree.fromstring(z.read(name))
        all_text = '\n'.join(document.xpath('//w:t/text()',namespaces=NS))
        forbidden = ['Opcional en caso de ajuste','Escribe el nombre de tu Proyecto','Nombra las actividades que se necesitan', 'Diego001']
        assert all(f not in all_text for f in forbidden)
        (WORK / (label+'-final-text.txt')).write_text(all_text,encoding='utf-8')
    final = Document(target)
    original_doc = Document(original)
    assert len(final.sections) == len(original_doc.sections)
    assert etree.tostring(final.sections[0]._sectPr) == etree.tostring(original_doc.sections[0]._sectPr)
    audit = {'output':str(target),'changed_original_parts':changed,
             'original_sha256_unchanged':hashlib.sha256(original.read_bytes()).hexdigest() == inv['sha256'],
             'image_count':len(final.inline_shapes),'sections':len(final.sections),
             'word_count':len(all_text.split()),'all_xml_well_formed':True,
             'render_validation':'unavailable: bundled LibreOffice is not provided on Windows'}
    (WORK / (label+'-validation.json')).write_text(json.dumps(audit,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(audit,ensure_ascii=False))


make('desarrollo',r'D:\Descargas D\2.4_GuiaEstudiante_Fase 2_DesarrolloProyecto APT.docx', 'DeafApp-Desarrollo-Proyecto-APT.docx')
make('informe',r'D:\Descargas D\2.6_GuiaEstudiante_Fase 2_Informe Final Proyecto APT.docx', 'DeafApp-Informe-Final-Proyecto-APT.docx')
