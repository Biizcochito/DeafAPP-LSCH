# Contrato de edición de las guías APT

## Fuentes conservadas

- Desarrollo: D:\Descargas D\2.4_GuiaEstudiante_Fase 2_DesarrolloProyecto APT.docx. SHA-256 y mapa íntegro de partes en desarrollo-inventory.json.
- Informe: D:\Descargas D\2.6_GuiaEstudiante_Fase 2_Informe Final Proyecto APT.docx. SHA-256 y mapa íntegro de partes en informe-inventory.json.
- Referencia de voz, datos de integrantes y planificación: D:\Descargas D\Definicion Proyecto APT.docx. SHA-256 y mapa de partes en referencia-inventory.json.

## Diseño y conservación

Las guías adjuntas son la autoridad de diseño. Una sección A4 vertical por documento; medidas exactas y márgenes en los inventarios. Se conservan sectPr, los títulos con dibujo y alternativa VML, estilos, encabezado con logo, numeración, tema, notas, customXml y todas las relaciones preexistentes. No se aplica una plantilla nueva. Se parchea el XML de cuerpo y se añaden únicamente relaciones y partes de cuatro o dos capturas en un anexo.

Los textos de ayuda de las celdas de respuesta se reemplazan por las respuestas. Los títulos y las introducciones institucionales permanecen. La escritura toma la primera persona plural y la relación con el caso cercano del documento de definición, sin copiar errores ortográficos ni declarar logros no comprobados.

Los párrafos de respuesta usan Calibri 11 negro, interlineado sencillo, 4,5 pt después entre párrafos, justificación. El plan mantiene Calibri 9, tamaño de la tabla original, con respuestas breves, encabezados repetidos y filas sin división. Se retiran alturas mínimas de las filas completadas para no conservar espacios artificiales de las instrucciones. Las celdas no usan altura exacta. Las etiquetas institucionales mantienen sus propiedades originales. Los anexos usan Calibri 13 para títulos y 10 para pies, capturas sin deformar y salto de página cada dos figuras.

## Localizadores y contenido

Desarrollo word/document.xml w:body (índices originales desde cero): B11 filas 0–3 columna 1 reciben resumen, objetivos ajustados, metodología y evidencias. B14 conserva título y encabezado, sustituye fila 2 de ejemplo por 14 actividades de la definición, con responsables oficiales, plazos originales, estados actuales y ajustes. B18/B20/B23 reciben factores, ajustes y pendientes; se conservan sus cajas institucionales con encabezado breve. B5/B6/B7, antes vacíos, identifican equipo, carrera y fecha del estado. Se añade aclaración de responsables delante del plan y dos figuras al final.

Informe word/document.xml w:body: B9 filas 0–2 columna 1 reciben nombre oficial, áreas y competencias. B11 filas 1–6 columna 1 reciben relevancia, objetivos, metodología, desarrollo, evidencias y reflexión profesional. B4/B5/B6, antes vacíos, identifican equipo, carrera y fecha del estado. Cuatro figuras al final.

Se revisaron cuerpo, celdas, encabezados, pie, cuadros de texto, campos y controles. No hay controles de contenido ni campos TOC/REF/PAGE en el cuerpo; no se exige actualizar campos.

## Fidelidad y verificación

Los originales permanecen byte por byte iguales. Las únicas partes originales que pueden cambiar son word/document.xml, word/_rels/document.xml.rels y [Content_Types].xml. Se comparan hashes de todas las otras partes y se comprueba la geometría exacta de sección. Se valida apertura python-docx, XML de cada parte, CRC ZIP, cobertura de respuestas, imágenes y ausencia de contraseñas o instrucciones de respuesta pendientes.

La ejecución del renderizador oficial render_docx.py falló antes de procesar la guía: FileNotFoundError, soffice.exe no está disponible. El runtime de Windows no contiene LibreOffice y no hay una sesión de Word conectada. Por ello no se puede verificar la paginación real ni producir el diff visual obligatorio en este entorno. No se instala ni se usa un motor sustituto para afirmar esa verificación. Se informará esta limitación al entregar las copias editables.
