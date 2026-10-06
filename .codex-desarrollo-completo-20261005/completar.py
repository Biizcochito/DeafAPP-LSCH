from pathlib import Path
from zipfile import ZipFile
from copy import deepcopy
from lxml import etree
import hashlib, json

ROOT = Path(__file__).resolve().parent.parent
WORK = Path(__file__).resolve().parent
# Reuse source-preserving OOXML helpers, without running previous build calls.
helpers = ROOT / '.codex-docs-apt-20261004/completar_guias.py'
env = {'__file__': str(helpers), '__name__': 'helpers'}
exec(helpers.read_text(encoding='utf-8').split("\nmake('desarrollo',")[0], env)
NS, child, paragraph, cell_text = (env[k] for k in ['NS', 'child', 'paragraph', 'cell_text'])
rows, cells, remove_row_minimum, xml_bytes, add_appendix = (env[k] for k in ['rows', 'cells', 'remove_row_minimum', 'xml_bytes', 'add_appendix'])
qn = env['_qn']

SOURCE = Path(r'D:\Descargas D\2.4_GuiaEstudiante_Fase 2_DesarrolloProyecto APT.docx')
TARGET = ROOT / 'entregables/2.4_DesarrolloProyecto_APT_completado.docx'
source_bytes = SOURCE.read_bytes()
source_hash = hashlib.sha256(source_bytes).hexdigest()
assert source_hash == '8b1647ab6c8c4766d0949f6507d79eda92eb9581b3a7e6b6bc4fa566205e1294'
with ZipFile(SOURCE) as z:
    infos = z.infolist()
    package = {i.filename: z.read(i.filename) for i in infos}
original_parts = {k: hashlib.sha256(v).hexdigest() for k, v in package.items()}
document = etree.fromstring(package['word/document.xml'])
body = document.find('w:body', NS)
blocks = list(body)
original_section = etree.tostring(body.find('w:sectPr', NS))
rels = etree.fromstring(package['word/_rels/document.xml.rels'])
types = etree.fromstring(package['[Content_Types].xml'])

answers = {
 'resumen': [
  'Durante el desarrollo de DeafApp mejoramos la captura de grabaciones de Lengua de Señas Chilena. Trabajamos en el seguimiento de cara y manos, adaptamos la cámara para computador y celular e incorporamos mensajes de ayuda, preparación con cuenta regresiva y una vista previa antes de enviar la grabación. Al inicio se confirman ambas manos y después se permite realizar la seña con una o dos manos.',
  'También implementamos un panel privado de administración para aprobar o rechazar grabaciones. Los materiales de LSCh y las pruebas quedaron en este espacio. Así avanzamos en los objetivos de facilitar la captura y controlar qué muestras se incorporan al conjunto de datos.',
  'Revisamos 110 grabaciones y recuperamos datos técnicos de seguimiento en 44. Con una selección pequeña probamos un modelo para las señas “cerdo” y “día”. La aplicación permite recopilar y revisar muestras, pero todavía no contamos con un traductor completo en tiempo real ni con el reconocimiento de todo el catálogo.'
 ],
 'objetivos': [
  'Mantuvimos el objetivo general de desarrollar una herramienta que facilite la comunicación entre personas sordas y oyentes mediante LSCh, texto y voz. Ajustamos el alcance de esta etapa para avanzar según la calidad y cantidad de las muestras disponibles.',
  'Los objetivos específicos de esta etapa son mejorar la captura y el seguimiento; organizar y revisar las grabaciones antes de entrenar; comprobar el proceso de reconocimiento con un grupo pequeño de señas; y ampliar el modelo cuando existan suficientes muestras revisadas. El catálogo de la aplicación no significa que todas sus señas ya puedan reconocerse automáticamente.'
 ],
 'metodologia': [
  'Trabajamos mediante mejoras y pruebas por etapas, utilizando CRISP-DM como referencia para comprender, preparar y evaluar los datos. Primero revisamos las grabaciones, después recuperamos su información de seguimiento y finalmente realizamos un experimento de reconocimiento. Conservamos los archivos originales y separamos las muestras de entrenamiento y evaluación.',
  'La propuesta original contemplaba un modelo LSTM. Para comprobar primero el proceso utilizamos un prototipo Conv1D de dos señas. Su evaluación inicial acertó una de dos pruebas; por la cantidad reducida de muestras, este resultado no demuestra precisión general ni funcionamiento con distintas personas. El entrenamiento más amplio y la integración completa siguen pendientes.'
 ],
 'evidencias': [
  'Adjuntamos capturas reales de la cámara con trazados, del panel de revisión de grabaciones, de la recuperación de datos y del informe del prototipo. Estas evidencias muestran las mejoras visibles, la organización de las muestras y el alcance del primer experimento.',
  'También contamos con el código del proyecto, registros de pruebas y la web publicada. Para resguardar la calidad conservamos los originales, incorporamos revisión administrativa y comprobamos aspectos del funcionamiento de cámara y grabación. Aún necesitamos ampliar las pruebas con más personas y distintas condiciones. Las capturas se incluyen al final de esta guía.'
 ],
 'facilitadores': [
  'Contar con una aplicación existente, un computador con cámara y servicios configurados facilitó el desarrollo. También ayudó distribuir las tareas de programación, análisis de datos e interfaz entre los integrantes del equipo. La experiencia cercana de una persona sorda permitió orientar el proyecto hacia una necesidad real.',
  'Las principales dificultades fueron los errores al iniciar la cámara, la lentitud del seguimiento de manos, las diferencias entre navegadores y la falta de grabaciones de distintas personas. Para abordarlas ajustamos el inicio de cámara, el seguimiento y los mensajes de ayuda. Además, revisamos las grabaciones antiguas y priorizamos las muestras que permiten recuperar datos útiles. Continuaremos comprobando la compatibilidad y reuniendo nuevas muestras.'
 ],
 'ajustes': [
  'Ajustamos el entrenamiento previsto para comenzar con dos señas, porque todavía no existen suficientes muestras útiles para cubrir todo el catálogo. La propuesta LSTM sigue siendo parte de la planificación, pero primero comprobamos la preparación de datos y un prototipo Conv1D.',
  'Trasladamos la aprobación y el rechazo de grabaciones al panel privado de administración. También cambiamos la preparación de la grabación para confirmar ambas manos solo al inicio y permitir después señas con una o dos manos.',
  'El material de LSCh quedó como apoyo para consultar y organizar referencias. Su uso en entrenamiento requiere revisar el contenido y sus condiciones de uso. No eliminamos el objetivo del traductor; dividimos su desarrollo en etapas para trabajar con resultados comprobables.'
 ],
 'pendientes': [
  'La ampliación del conjunto de grabaciones quedó retrasada por la poca participación y por las limitaciones de algunas muestras antiguas. Para avanzar continuaremos recuperando datos útiles y solicitando nuevas grabaciones, priorizando las señas que tengan mejores muestras.',
  'La integración completa del modelo, las pruebas del traductor y la defensa todavía no se han iniciado. Según la planificación, sus periodos comienzan después del 5 de octubre. Primero validaremos un grupo pequeño de señas, luego integraremos el reconocimiento y finalmente ampliaremos el sistema. Los borradores del informe final y la presentación se actualizarán con los resultados del cierre.'
 ]
}

plan = [
 ['Análisis y diseño de sistemas', 'Definir problema, objetivos y alcance.', 'Guías APT y aplicación existente.', '12–25 ago.', 'Diego Padilla', 'La aplicación previa y el caso cercano ayudaron a definir la necesidad.', 'Completado', 'Diferenciar el objetivo final del alcance del prototipo.'],
 ['IA y preparación de datos', 'Recopilar y organizar grabaciones.', 'DeafApp, cámara y Supabase.', '19 ago.–22 sep.', 'Diego Padilla', 'Pocas personas disponibles y muestras antiguas incompletas.', 'Con retraso', 'Continuar recopilando y recuperar muestras útiles.'],
 ['Bases de datos y backend', 'Revisar almacenamiento y aprobación.', 'Supabase, código y administrador.', '26 ago.–8 sep.', 'Diego Padilla', 'Se necesitó controlar las grabaciones incorporadas al conjunto de datos.', 'Ajustada', 'Aprobación y rechazo desde el panel privado.'],
 ['Análisis de datos', 'Evaluar calidad de las grabaciones.', 'Python, videos y datos de seguimiento.', '2–29 sep.', 'Ignacio Hernández', '44 de 110 grabaciones permitieron recuperar datos técnicos.', 'Ajustada', 'Clasificar utilidad y compatibilidad antes de entrenar.'],
 ['Interfaces web y móviles', 'Mejorar cámara y grabación.', 'React Native, Expo y cámara.', '2–29 sep.', 'Felipe Crisóstomo', 'Problemas de cámara, seguimiento y diferencias entre dispositivos.', 'Ajustada', 'Encuadre adaptable, mensajes, cuenta regresiva y vista previa.'],
 ['Inteligencia artificial', 'Entrenar y evaluar un primer modelo.', 'Python y datos preparados.', '9 sep.–6 oct.', 'Diego Padilla', 'Las muestras no permiten reconocer todo el catálogo.', 'Ajustada', 'Prototipo Conv1D de “cerdo” y “día”; LSTM pendiente.'],
 ['Metodología CRISP-DM', 'Documentar comprensión y preparación de datos.', 'Guía CRISP-DM y registros.', '16 sep.–6 oct.', 'Ignacio Hernández', 'La revisión identificó límites del conjunto de datos.', 'En curso', 'Documentar criterios de selección y descarte.'],
 ['Pruebas de software', 'Apoyar pruebas entre interfaz, modelo y backend.', 'Aplicación y entorno de pruebas.', '7 oct.–10 nov.', 'Felipe Crisóstomo', 'Depende de un modelo preparado para integrar.', 'No iniciado', 'Probar por componentes y luego el flujo completo.'],
 ['Documentación técnica', 'Elaborar informe de avance.', 'Guía APT, capturas y registros.', '23 sep.–6 oct.', 'Equipo', 'Existen evidencias de mejoras y pruebas iniciales.', 'En curso', 'Incluir cambios de alcance y tareas pendientes.'],
 ['Evaluación de modelos', 'Analizar resultados y errores.', 'Resultados del modelo y Python.', '30 sep.–13 oct.', 'Ignacio Hernández', 'La evaluación inicial tiene muy pocas muestras.', 'En curso', 'Ampliar evaluación sin atribuir precisión general.'],
 ['Integración de software', 'Conectar el modelo con la aplicación.', 'Modelo, backend y DeafApp.', '7–27 oct.', 'Diego Padilla', 'Requiere validar previamente el reconocimiento.', 'No iniciado', 'Integrar primero señas con muestras suficientes y revisadas.'],
 ['Pruebas y despliegue', 'Probar y publicar el sistema integrado.', 'Cloudflare y entorno de pruebas.', '28 oct.–10 nov.', 'Diego Padilla', 'La web está publicada; el traductor completo sigue pendiente.', 'No iniciado', 'Validar captura, reconocimiento y respuesta antes de publicar.'],
 ['Documentación y comunicación', 'Preparar informe final y presentación.', 'Guías, capturas y resultados.', '11–24 nov.', 'Equipo', 'Ya se adelantaron borradores y la presentación.', 'En curso', 'Actualizar los borradores con los resultados del cierre.'],
 ['Comunicación técnica', 'Presentar y defender el proyecto.', 'Informe, presentación y demostración.', '25 nov.–1 dic.', 'Equipo', 'La demostración debe mostrar funciones comprobadas.', 'No iniciado', 'Explicar resultados, límites y próximos pasos.']
]

for row, key in zip(rows(blocks[11]), ['resumen', 'objetivos', 'metodologia', 'evidencias']):
    cell_text(cells(row)[1], answers[key])
    remove_row_minimum(row)
for key, index, title in [
 ('facilitadores', 18, 'Factores que han facilitado y dificultado el plan de trabajo'),
 ('ajustes', 20, 'Actividades ajustadas o eliminadas'),
 ('pendientes', 23, 'Actividades no iniciadas o con retraso')]:
    row = rows(blocks[index])[0]
    cell_text(cells(row)[0], answers[key], heading=title)
    remove_row_minimum(row)

for index, text, size, after in [
 (5, 'Diego Padilla, Ignacio Hernández y Felipe Crisóstomo', 22, 30),
 (6, 'Ingeniería en Informática · Duoc UC sede San Joaquín', 20, 30),
 (7, 'DeafApp · Avance al 5 de octubre de 2026', 20, 180)]:
    body.replace(blocks[index], paragraph(text, size=size, align='center', after=after))

table = blocks[14]
template = deepcopy(rows(table)[2])
table.remove(rows(table)[2])
for data in plan:
    row = deepcopy(template)
    remove_row_minimum(row)
    rp = row.find('w:trPr', NS)
    if rp is None:
        rp = etree.Element(qn('w', 'trPr')); row.insert(0, rp)
    if rp.find('w:cantSplit', NS) is None:
        child(rp, 'cantSplit')
    for ci, (cell, value) in enumerate(zip(cells(row), data)):
        cell_text(cell, [value], size=18, align='center' if ci in [3, 4, 6] else 'left')
    table.append(row)
for row in rows(table)[:2]:
    rp = row.find('w:trPr', NS)
    if rp is None:
        rp = etree.Element(qn('w', 'trPr')); row.insert(0, rp)
    if rp.find('w:tblHeader', NS) is None:
        child(rp, 'tblHeader')

note = paragraph('Responsables y periodos según la planificación original. “Equipo” corresponde a Diego Padilla, Ignacio Hernández y Felipe Crisóstomo. Los estados reflejan el avance conocido al 5 de octubre de 2026.', size=20, align='left', after=120)
body.insert(body.index(table), note)

# Source tables are anchored at fixed page positions and exceed the text area.
# Keep section geometry and institutional styling, but use inline flow and widths
# inside the original margins so expanded answers can paginate without overlap.
available = 11906 - 1701 - 1701
plan_widths = [1090, 1200, 900, 750, 900, 1250, 900, 1514]
assert sum(plan_widths) == available
for tbl in body.findall('w:tbl', NS):
    pr = tbl.find('w:tblPr', NS)
    if pr is None:
        pr = etree.Element(qn('w', 'tblPr')); tbl.insert(0, pr)
    for floating in pr.findall('w:tblpPr', NS):
        pr.remove(floating)
    width = pr.find('w:tblW', NS)
    if width is None:
        width = child(pr, 'tblW')
    width.set(qn('w', 'w'), str(available)); width.set(qn('w', 'type'), 'dxa')
    grid = tbl.find('w:tblGrid', NS)
    old = [int(c.get(qn('w', 'w'))) for c in grid] if grid is not None else []
    if tbl is table:
        widths = plan_widths
    elif old:
        widths = [round(v * available / sum(old)) for v in old]
        widths[-1] += available - sum(widths)
    else:
        continue
    for c, value in zip(grid, widths):
        c.set(qn('w', 'w'), str(value))
    layout = pr.find('w:tblLayout', NS)
    if layout is None:
        layout = child(pr, 'tblLayout')
    layout.set(qn('w', 'type'), 'fixed')
    for row in rows(tbl):
        remove_row_minimum(row)
        offset = 0
        for cell in cells(row):
            cp = cell.find('w:tcPr', NS)
            span = cp.find('w:gridSpan', NS)
            count = int(span.get(qn('w', 'val'))) if span is not None else 1
            cw = cp.find('w:tcW', NS)
            if cw is None:
                cw = child(cp, 'tcW')
            cw.set(qn('w', 'w'), str(sum(widths[offset:offset+count])))
            cw.set(qn('w', 'type'), 'dxa')
            offset += count

pictures = [
 ('grabacion-una-mano.png', 'Seguimiento de cara y una mano durante una prueba de grabación', 4.4),
 ('ppt-moderacion-actual.jpg', 'Panel privado con grabaciones aprobadas y pendientes de revisión', 5.8),
 ('ppt-recuperacion-actual.jpg', 'Registro de recuperación y preparación de grabaciones', 5.8),
 ('ppt-modelo-guardado.jpg', 'Informe del experimento inicial con las señas cerdo y día', 5.8)
]
package.update(add_appendix(body, rels, types, pictures))
package['word/document.xml'] = xml_bytes(document)
package['word/_rels/document.xml.rels'] = xml_bytes(rels)
package['[Content_Types].xml'] = xml_bytes(types)
TARGET.parent.mkdir(exist_ok=True)
with ZipFile(TARGET, 'w') as z:
    for info in infos:
        z.writestr(info, package.pop(info.filename))
    for name, data in package.items():
        z.writestr(name, data, compress_type=8)

text = '\n'.join(document.xpath('//w:t/text()', namespaces=NS))
assert all(value in text for values in answers.values() for value in values)
assert len(rows(table)) == 16
assert all(len(cells(r)) == 8 for r in rows(table)[1:])
assert all(all(v.strip() for v in r) for r in plan)
assert not any(s in text for s in ['Opcional en caso de ajuste', 'Nombra las actividades que se necesitan', 'Diego001'])
assert etree.tostring(body.find('w:sectPr', NS)) == original_section
with ZipFile(TARGET) as z:
    assert z.testzip() is None
    for name in z.namelist():
        if name.endswith('.xml') or name.endswith('.rels'):
            etree.fromstring(z.read(name))
    changed = [name for name, sha in original_parts.items() if hashlib.sha256(z.read(name)).hexdigest() != sha]
    assert set(changed) == {'word/document.xml', 'word/_rels/document.xml.rels', '[Content_Types].xml'}
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == source_hash
from docx import Document
doc = Document(TARGET)
assert len(doc.inline_shapes) == 4
audit = {'output': str(TARGET), 'source_unchanged': True, 'filled_sections': 7,
         'work_plan_activities': 14, 'work_plan_columns': 8, 'real_screenshots': 4,
         'word_count': len(text.split()), 'changed_parts': changed,
         'section_geometry_preserved': True, 'floating_tables_removed': True,
         'table_width_twips': available, 'xml_and_zip_valid': True}
(WORK/'texto-final.txt').write_text(text, encoding='utf-8')
(WORK/'validacion.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2), encoding='utf-8')
(WORK/'artifact.md').write_text('''# Edición de guía de desarrollo APT

Fuente conservada: D:/Descargas D/2.4_GuiaEstudiante_Fase 2_DesarrolloProyecto APT.docx
SHA256: 8b1647ab6c8c4766d0949f6507d79eda92eb9581b3a7e6b6bc4fa566205e1294
Contrato base: ../.codex-docs-apt-20261004/artifact.md

Se completan las cuatro respuestas del resumen, las 14 actividades con ocho
columnas y los tres apartados de seguimiento. Se incorpora identificación
del equipo y fecha del avance, junto con cuatro capturas reales en anexo.
Se mantienen sección, márgenes, encabezados, logo, estilos, dibujo del título,
numeración y partes no editadas byte por byte.

Ajuste necesario al flujo: las tablas de la guía están flotando en coordenadas
fijas y exceden el ancho entre márgenes. Se pasan a flujo en línea y se ajustan
a 8504 twips, sin cambiar la geometría de página. El plan usa columnas según
su contenido, Calibri 9, cabeceras repetidas y filas sin altura exacta.
Las respuestas usan Calibri 11. La voz es breve, en primera persona plural.
El estado del prototipo se diferencia del traductor futuro.

Se validan cobertura, celdas, partes preservadas, XML, ZIP e imágenes.
La renderización depende del LibreOffice empaquetado; su resultado se registra
por separado y no se asume verificado a partir del XML.
''', encoding='utf-8')
print(json.dumps(audit, ensure_ascii=False))
