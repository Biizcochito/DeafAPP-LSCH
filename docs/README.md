# Documentación de DeafApp

Ejecuta los comandos desde la raíz del repositorio. La aplicación se inicia con `App.js` y sus módulos están agrupados en `src/`.

| Guía | Contenido |
| --- | --- |
| [README principal](../README.md) | Funciones, instalación y desarrollo local |
| [Contribuir](../CONTRIBUTING.md) | Ramas, Pull Requests y publicación |
| [Diseño](DESIGN.md) | Estilos y componentes de la interfaz |
| [Producto](PRODUCT.md) | Propósito y alcance de la aplicación |
| [Privacidad](PRIVACIDAD-LEY-21719.md) | Consentimiento, conservacion y responsabilidades |
| [Backend Python](../backend/README.md) | API, dependencias y entrenamiento local |
| [Entrenamiento LSCh](../training/README.md) | Preparación de datos y evaluación |
| [Administrador](../admin/README.md) | Configuración y operaciones del panel privado |
| [Archivo](../archive/README.md) | Exportaciones y prototipos de referencia |

## Ubicación de los archivos

- `src/`: pantallas y lógica de la aplicación; cada función mantiene juntos sus archivos web, nativos y estilos.
- `src/training/`: módulos de entrenamiento y reconocimiento que utiliza la aplicación.
- `training/`: documentación, metadatos de fuentes y rutas de datos locales. Las grabaciones y salidas privadas siguen excluidas de Git.
- `admin/` y `supabase/`: configuración SQL y metadatos de administración.
- `public/` y `assets/`: recursos necesarios para compilar y ejecutar.
- `scripts/` y `tests/`: herramientas del proyecto y pruebas automatizadas.
- `archive/`: copias anteriores; el despliegue se genera desde la raíz con `npx expo export --platform web`.

`Capstone/` conserva su ubicación y sus entregables académicos.
