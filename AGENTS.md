# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Ramas (obligatorio)

Sigue CONTRIBUTING.md. En resumen:

- Nunca hagas commits directamente en `master` ni en `dev`.
- Empieza con `git checkout dev && git pull origin dev`.
- Crea una rama desde `dev` con nombre `feature/<tema>` o `fix/<tema>`, trabaja ahí y abre un Pull Request hacia `dev`.
- `master` solo se actualiza con un Pull Request aprobado desde `dev`; cada cambio en `master` se publica en deafapps.com.
- No agregues `deploy/.htaccess` al `.gitignore`.

# Publicación completa y verificación del historial

- Cuando el usuario pida publicar o subir un cambio a GitHub, completa el flujo: validar el cambio, hacer commit en su rama `feature/*` o `fix/*`, subirla, abrir el PR hacia `dev` y fusionarlo. No termines dejando el PR pendiente si el usuario ya pidió publicarlo.
- El administrador ha autorizado este flujo: la petición de publicar incluye la autorización para fusionar el PR hacia `dev`, sin pedir otra confirmación. Respeta las comprobaciones y protecciones de GitHub; si impiden la fusión, informa el motivo concreto.
- Antes de fusionar, comprueba la rama de destino y que el commit del PR sea el mismo que se verificó.
- Confirma la fusión consultando GitHub y comprueba que su commit aparece en el historial remoto de `dev`. Crear el PR o subir la rama no basta para dar la publicación por completada.
- Después de fusionar, sincroniza la rama `dev` local con `origin/dev` y déjala activa, conservando los cambios locales y archivos ajenos a la tarea. Usa actualizaciones de avance directo; no fuerces ni descartes trabajo local.
- En la respuesta final incluye el enlace al PR, el commit integrado y el enlace al historial de `dev`, para que el usuario pueda comprobarlo.
- La publicación en `deafapps.com` requiere una petición explícita de producción y sigue el PR de `dev` hacia `master` indicado arriba.
