# Privacidad y consentimiento de DeafApp

Revisión: 17 de octubre de 2026. Versión: **2026-10-17-v1**. El usuario autorizó publicar mediante PR normales de la rama de trabajo a `dev` y de `dev` a `master`, con conservación de **24 meses desde el envío** y nuevas grabaciones habilitadas tras consentir.

## Resultado de la investigación

La Ley 21.719 reforma la Ley 19.628 y comienza a regir el **1 de diciembre de 2026**. Hasta entonces rige el régimen actual. No basta añadir una aceptación genérica de términos.

Los artículos 12 y 16 exigen consentimiento previo, específico, informado e inequívoco, y expreso para datos sensibles. El responsable debe poder probarlo y permitir retirarlo. El artículo 14 ter exige publicar identidad del responsable, contacto, usos, destinatarios, conservación y derechos. El artículo 16 ter define biometría por su capacidad de identificar de forma única: no cualquier punto de movimiento lo es automáticamente. Exige informar sistema, finalidad, período de uso y ejercicio de derechos.

El artículo 15 ter exige evaluar impacto si existe probable alto riesgo y en sus supuestos obligatorios. El artículo 16 quáter regula menores. Los artículos 15 y 15 bis y el título V deben considerarse al usar encargados, ceder datos o transferirlos internacionalmente.

Fuentes primarias:

- [Ley 21.719, BCN, versión con vigencia diferida](https://www.bcn.cl/leychile/navegar?i=1209272).
- [Texto oficial completo en PDF, generado por BCN](https://nuevo.leychile.cl/servicios/Consulta/Exportar?exportar_con_notas_al_pie=False&exportar_con_notas_bcn=False&exportar_con_notas_originales=False&exportar_formato=pdf&hddResultadoExportar=1209272.2026-12-01.0.0%23&nombrearchivo=Ley-21719_13-DIC-2024&radioExportar=Normas). Referencias: arts. 12, 14 ter, 15 ter, 16, 16 ter, 16 quáter y disposiciones transitorias.
- [Ley 19.628, BCN](https://www.bcn.cl/leychile/navegar?idNorma=141599).

Este trabajo incorpora una interfaz y controles técnicos de consentimiento. No certifica cumplimiento jurídico ni reemplaza revisar el funcionamiento real y los procedimientos del responsable.

## Responsable y continuidad del proyecto

Por indicación del usuario, el responsable indicado es **Diego Padilla**, persona natural. Debe ser quien realmente decide la finalidad y los medios del tratamiento y asume sus obligaciones. No se atribuye esa calidad a Duoc UC ni se inventa un RUT o domicilio.

El usuario indicó **diego0padilla1717@gmail.com** como contacto de privacidad y autorizó publicar el aviso. Debe mantenerlo operativo y atender las solicitudes que reciba.

La finalidad propuesta es desarrollar y mejorar el reconocimiento de LSCh en DeafApp. Así puede revisarse la continuidad del proyecto como aplicación después de la etapa académica sin una licencia genérica para cualquier uso futuro. Cambios de responsable, nuevas finalidades, nuevas cesiones o conservación más prolongada requieren revisar la base jurídica y la información a los participantes; no se aplican retroactivamente por editar un texto.

## Qué recoge realmente la aplicación

Revisión de `App.js`, `src/recording/trainingCapture.js`, `src/recording/recordingSubmission.js` y `src/recording/browserRecordingDraftStore.js`:

- Secuencias de imágenes JPEG, etiqueta de la seña y categoría, tiempos y tamaño de captura.
- Puntos de manos y rostro, cuando el seguimiento los obtiene, e identificadores de participante y sesión.
- Un borrador en IndexedDB en la web; la app prepara el aporte antes del envío explícito.
- El envío existente sube un JSON a Supabase Storage y registra su ruta en `grabaciones`. La preparación y el entrenamiento del backend pueden consumir los aportes.
- El flujo de grabación no solicita audio ni nombre o RUT. Esto no significa anonimato: un rostro visible puede identificar a la persona. Tampoco evita que los proveedores procesen metadatos técnicos de conexión.

Esta entrega no modifica la base de datos ni los permisos del almacenamiento, por indicación del usuario. Los cambios de cierre de acceso preparados por separado no se incluyen en el PR. No se consultaron imágenes de participantes para verificar este cambio.

## Compromiso de no publicar rostros

Por petición del usuario, el aviso y los términos establecen que el equipo de DeafApp no mostrará rostros ni grabaciones identificables en sus páginas públicas, redes, demostraciones o conjuntos abiertos. Dentro del equipo, la revisión y administración corresponde a administradores autorizados mediante el panel. El texto describe esa regla de uso y no afirma haber verificado un acceso técnico exclusivo a los archivos. Los proveedores de almacenamiento o procesamiento deben documentarse como encargados, sin confundirlos con usuarios del panel.

El diagnóstico técnico y la preparación de cambios de acceso se conservan aparte en local. No deben describirse como aplicados. El modo local de demostración conserva el bloqueo de cámara y envíos; la versión publicada utiliza el consentimiento real y permite nuevas capturas y envíos autorizados.

## Conservación de 24 meses

El plazo autorizado por el usuario es de 24 meses desde el envío, contado por meses de calendario. Cada archivo nuevo incluye `retention.months`, `retention.startsAt` y `retention.expiresAt`, además del comprobante de consentimiento versionado. Se contempla el ajuste del 29 de febrero al último día de febrero cuando el año de vencimiento no es bisiesto.

Estos metadatos no eliminan archivos por sí solos. El responsable debe revisar vencimientos, ejecutar la supresión de grabaciones, rasgos y copias de trabajo, y atender solicitudes anteriores al vencimiento. Esta entrega no configura tareas automáticas ni modifica datos remotos existentes. Las grabaciones anteriores no reciben autorización ni un plazo nuevo de manera retroactiva.

La autorización de un adulto no habilita automáticamente la grabación de un menor. El artículo 16 quáter exige atender al interés superior y la autonomía progresiva. Para menores de 14 años exige consentimiento de padres, representante legal o quien tenga el cuidado personal; para adolescentes menores de 16 exige esa autorización cuando se tratan datos sensibles. Esta propuesta adopta la ruta de representante para todos los menores de 16 años por el tipo de imágenes y rasgos previsto. Debe verificarse la representación, informar antes de captar, definir conservación y aplicar las protecciones reales; se explicará la actividad según su comprensión y no se grabará si no quiere participar. La nueva norma rige desde el 1 de diciembre de 2026 y no sustituye las obligaciones vigentes antes de esa fecha.

## Recorrido propuesto

1. La bienvenida y «Más» ofrecen términos y privacidad sin exigir una autorización. El catálogo, las categorías, Mis aportes, Más, ayuda y sugerencias tienen además enlaces permanentes en el pie inferior de la aplicación, sin exigir desplazarse al final de una lista.
2. Antes de acceder a la cámara se muestran datos, finalidad y decisiones separadas, sin casillas premarcadas.
3. Pueden participar personas de todas las edades. Se distingue entre autorización personal desde los 16 años y autorización de madre, padre, representante legal o persona a cargo del cuidado personal para participantes menores de 16 años. Se registra un grupo de edad declarado, no la fecha de nacimiento. La declaración del representante no sustituye la comprobación de sus facultades; ese procedimiento sigue pendiente antes de recibir datos reales.
4. Se distinguen la aceptación de términos, el tratamiento de imagen/rasgos y la finalidad de entrenamiento y evaluación. Se puede salir y explorar sin autorizar. Ambas finalidades se exigen para esta actividad voluntaria de aporte al conjunto de entrenamiento.
5. Se prepara un comprobante versionado con fecha, copia del aviso y calidad declarada de quien autoriza (participante o representante; relación y declaración de facultades en el segundo caso). No se guardan IP, huellas del navegador ni documentos de identidad como evidencia en esta prueba.
6. El comprobante acompaña al archivo de un aporte nuevo en el flujo de envío. No se añaden columnas a la base de datos. Una toma antigua sin evidencia previa puede recuperarse para revisión, pero no obtiene autorización retroactiva.
7. La retirada de esta prueba borra solo el comprobante del dispositivo; no finge eliminar aportes remotos ni retirar material de modelos ya entrenados.

## Prueba local

```powershell
npm run web:privacy-preview
```

- Autorización: http://localhost:8083/consentimiento
- Aviso: http://localhost:8083/privacidad
- Términos: http://localhost:8083/terminos
- Catálogo: http://localhost:8083/app

El modo de prueba requiere `EXPO_PUBLIC_PRIVACY_PREVIEW=1` y un hostname local exacto. Sustituye la entrada a la cámara por una confirmación ilustrada. Las escrituras del cliente quedan rechazadas y el comprobante de demostración no es aceptado por el envío real. Fuera de este modo, `approvedForPublication: true`, el contacto indicado y el plazo de 24 meses habilitan el recorrido de autorización real. Aceptar cada decisión habilita la cámara y permite enviar una toma nueva tras revisarla; no se solicita una autorización retroactiva para tomas anteriores.

## Responsabilidades operativas

- Mantener el contacto operativo y ejecutar la conservación de 24 meses y la eliminación correspondiente; registrar fechas no sustituye eliminar los datos.
- Confirmar la individualización del responsable y su aceptación del rol, y revisar el texto con asesoría apropiada.
- Comprobar la representación para aportes de menores de 16 años con una verificación proporcionada y sin recopilar documentos innecesarios. La interfaz registra la declaración y no autentica al representante por sí sola.
- Revisar accesos efectivos, región, proveedores, encargados y transferencias, además de los permisos de aportes existentes; esta entrega no cambia esa configuración ni acredita autorizaciones anteriores.
- Implementar evidencia y validación en servidor. El control del navegador y un JSON editable no bastan como protección frente a clientes modificados. No existe todavía revocación o supresión remota en esta propuesta.
- Disponer de un canal operativo para solicitudes y de un procedimiento para retirar un aporte de la revisión, preparación y entrenamiento, incluidos respaldos y candidatos. No prometer que se puede desentrenar automáticamente un modelo existente.
- Evaluar los riesgos, si corresponde una evaluación de impacto y qué instrucciones generales estén vigentes al momento de publicar.
- La autorización de publicación registrada en la configuración no es una certificación jurídica ni sustituye estas responsabilidades.

Cambiar el plazo más adelante requiere una revisión: un cambio prospectivo para nuevos aportes no autoriza por sí solo prolongar la conservación de los anteriores. Conviene decidir por separado cuánto se necesita la imagen original y cuánto sus datos derivados, que también pueden ser personales.

## Verificación

Las pruebas usan imágenes ficticias y el SDK con respuestas simuladas, sin subir biometría. `npm run test:privacy` comprueba decisiones afirmativas, bloqueo del aviso incompleto, versión del comprobante, autorización anterior a la captura, retirada entre etapas y bloqueo de escrituras locales. Las verificaciones de interfaz se registran fuera del código en `flujo-git-validacion`.

La ampliación a la suite general detectó una prueba previa desactualizada en `tests/modelTraining.test.mjs:19`: espera 531 clases y el catálogo vigente contiene 541. Se confirmó que el catálogo, el plan de entrenamiento y ese test no tienen cambios de esta propuesta. No se cambió esa prueba ajena al consentimiento ni se presentó la suite general como aprobada. Registro: `flujo-git-validacion/privacidad-tests.log`.
