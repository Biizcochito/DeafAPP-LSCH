# Administración de DeafApp

## Acceso y uso

Pulsa cinco veces el logo «DeafApp» en un máximo de 3,5 segundos desde bienvenida o inicio. Aparece el acceso privado. Ingresa la contraseña indicada por el propietario; no está guardada en el código del navegador. No se necesita activar la cámara para administrar.

- **Grabaciones:** todas las categorías, búsqueda, filtros pendientes/aprobadas/rechazadas y páginas de 25 registros. «Ver grabación» reproduce sus imágenes y permite aprobar, rechazar o devolver a pendientes. También se pueden seleccionar registros de la página y decidir por lote. Seleccionar por sí solo no cambia su estado.
- **Material de LSCh:** referencias y catálogo académico de 379 videos, disponibles después de iniciar sesión. Son candidatos que requieren revisión lingüística y de permisos de uso.
- **Entrenamiento LSCh:** prioridades de las 531 entradas, análisis de aprobaciones vigentes e importación de conjuntos externos revisados. Permite seleccionar grupos de 2 a 12 señas aptas y entrenar una red temporal local. Cada candidato guarda sus etiquetas e informe por separado en el navegador; no activa reconocimiento público.
- **Recuperar grabaciones antiguas**, dentro de Entrenamiento: extrae puntos de JPEG/PNG/WebP existentes, conserva su orden y mantiene desconocidos los tiempos y participantes que no se registraron. Guarda la recuperación local para continuar después. Incluye reproducción y corrección de etiquetas con confirmación. No modifica las aprobaciones del servidor.
- **Datos y diagnóstico:** comprobación de conexión, auditoría fechada y cobertura del vocabulario. Es un informe guardado; no declara que exista un modelo entrenado ni que las contribuciones nuevas se preparen automáticamente.

Cada contribución nueva llega pendiente. Aprobar activa `aprobada`, `validada` y `visible`; rechazar o devolver a pendientes las desactiva. Se conserva el archivo en Storage y se registra la decisión. Los votos públicos ya no conceden aprobación. Las decisiones usan una versión de registro: una revisión anterior no puede sobrescribir otra más reciente; los lotes se aplican completos o se rechazan completos.

La sesión dura dos horas y se mantiene únicamente en memoria. «Cerrar sesión», salir del panel o recargar exige volver a entrar. El servidor valida la sesión en cada operación, almacena únicamente la huella de su token y revoca ese token al cerrar sesión. Cinco intentos fallidos dentro de diez minutos aplican una espera de dos minutos. La contraseña se almacena mediante bcrypt en un esquema privado con RLS y sin acceso directo del cliente.

## Instalación realizada

El 4 de octubre de 2026 se instaló en el proyecto **DeafApp**, referencia `didlffnluqqurelgnqdp`. Se conservaron 110 registros aprobados y 20 pendientes. Los registros usados para comprobar decisiones fueron sintéticos y se revirtieron al terminar; no se aprobaron ni rechazaron grabaciones reales durante la prueba.

`install.sql` crea las tablas privadas, inicializa los estados de los registros existentes, restringe las escrituras públicas y agrega los RPC de acceso/revisión. `material.sql` agrega el RPC del catálogo privado. La contraseña inicial se configuró directamente en el proyecto con un hash; no se incluye en estos archivos ni en la exportación web.

Para instalar en otro proyecto, el propietario debe ejecutar `install.sql`, luego `material.sql`, configurar por sí mismo su contraseña en `deafapp_private.admin_config` mediante `extensions.crypt`/`extensions.gen_salt('bf',11)`, y cargar `update-snapshot.sql` y `update-catalog.sql`. No hace falta repetir estos pasos en DeafApp. Ninguna clave de servicio se entrega al cliente.

## Actualizar el material y la auditoría

`npm run dataset:refresh` importa metadatos, sincroniza las grabaciones aprobadas, incorpora fragmentos ya revisados, prepara los datos y genera los informes para el administrador. No ejecuta SQL en Supabase ni entrena un modelo. `npm run admin:snapshot` solo vuelve a generar las copias de administración a partir de los archivos locales existentes.

Para reflejar una preparación nueva en el panel, ejecutar `update-snapshot.sql` y `update-catalog.sql` en el editor SQL del mismo proyecto. Los SQL contienen el informe y metadatos del catálogo, sin imágenes ni identificadores privados de participantes. El informe actual corresponde a la auditoría del 3 de octubre: 110 grabaciones examinadas, 0 aptas para el preparador actual y 531 entradas de vocabulario. Las grabaciones antiguas se conservan para preparación posterior.

El apartado **Entrenamiento LSCh** usa un análisis nuevo de las aprobaciones vigentes, sin necesitar actualizar ese informe SQL. Al 4 de octubre encontró 110 aprobadas, 0 aptas y 0 señas listas. Aprobar una grabación no garantiza que tenga puntos, tiempos o un perfil usable. Las entradas explican qué falta. Una seña requiere al menos 5 originales de aprendizaje y 2 de prueba, con participantes separados, para intentar el primer experimento; ese mínimo no garantiza precisión.

Los fragmentos externos se revisan y preparan antes de importar `training/prepared/dataset.json`. Los detalles y comandos están en `training/README.md`. El aprendizaje comprueba las versiones de aprobación antes y después de entrenar. Ninguna nueva contribución se aprende automáticamente sin revisión. No se aplicó ningún cambio de esquema ni de moderación en Supabase para añadir este apartado.

El nuevo **prototipo experimental** permite dos o tres señas con al menos dos originales utilizables y distintos por seña. Reserva una toma para comprobar el aprendizaje, aunque pertenezca a la misma persona; no afirma una evaluación con personas independientes. Se habilita con **Preparar prototipo experimental** desde la recuperación y se entrena con **Entrenar prototipo experimental**. Los modelos de ese modo se guardan por separado. Los requisitos del modo de evaluación independiente se conservan.

El 4 de octubre se recuperaron las 110 aprobadas sin errores de archivo o procesamiento. 44 tienen puntos utilizables para el experimento; 12 tienen además etiquetas compatibles y aprobadas. `alimentos/cerdo` y `tiempo/dia` permiten el primer grupo. Se entrenó con dos originales y se reservó otro original por clase: acertó 1 de 2 pruebas internas. El candidato y las recuperaciones persistieron tras recargar. **Ver modelos guardados en este navegador** recupera el informe histórico; no activa traducción. No se cambió ninguna aprobación ni archivo del servidor.

## Verificación y publicación

`npm run test:admin` comprueba el acceso por cinco pulsaciones, sesión, parámetros de moderación, conflictos, paginación y formatos de reproducción. Pasaron 32 pruebas de administración, envío, requisitos de manos y tamaño de cámara. `verify.sql` comprobó en el servidor contraseña, privilegios, contribución pendiente, aprobación, rechazo, conflictos, atomicidad por lote y cierre de sesión; revirtió sus registros de prueba. `verify-material.sql` comprueba acceso denegado al catálogo sin sesión y permisos/RLS sin usar grabaciones.

En el navegador se verificó contraseña incorrecta/correcta, listado real, selección por lote, reproducción de una secuencia de 30 imágenes, búsqueda del material privado y diagnóstico. No se abrió la cámara ni se cambiaron decisiones reales. Los archivos públicos del catálogo anterior y las páginas de prueba responden 404 en la exportación actual.

El Security Advisor se volvió a ejecutar: 0 errores y 10 advertencias sobre políticas generales existentes, listado del bucket público y la función existente `public.rls_auto_enable`. Los RPC nuevos tienen envoltorios públicos `SECURITY INVOKER` y permisos de administrador comprobados en los manejadores privados. Las advertencias de políticas sobre `grabaciones` no conceden las escrituras revocadas; las pruebas comprobaron que el cliente no puede aprobar por INSERT/UPDATE directo. El bucket de contribuciones conserva su configuración pública anterior: este cambio protege las decisiones y el catálogo privado, pero no convierte los archivos existentes de Storage en archivos privados.

Para Cloudflare, subir **`DeafApp-recuperacion.zip`**, **`DeafApp-entrenamiento.zip`**, **`DeafApp-cloudflare.zip`** o la carpeta **`dist` completa**. El ZIP contiene `index.html` en la raíz y los modelos de seguimiento necesarios. Los puntos recuperados y el candidato entrenado pertenecen al almacenamiento del navegador local, no al ZIP; desde el dominio oficial hay que recuperar y entrenar en ese navegador. No subir este directorio, SQL, contraseñas ni `training`. La preparación local no publica por sí sola la interfaz en Cloudflare.
