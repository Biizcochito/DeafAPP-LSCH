# Verificación de la integración · 14 de octubre de 2026

Flujo: administrador → Entrenamiento LSCh → Modelo del traductor → API Python
→ informe local y operaciones privadas verificadas con la sesión de Supabase.

- 225 pruebas Python pasaron, incluidas las nuevas pruebas de autorización,
  operaciones permitidas y separación de candidatos.
- Pasaron las pruebas del cliente Python, traductor, administrador y entrenamiento
  experimental de TensorFlow.js.
- Expo 57 exportó la web correctamente después de instalar package-lock.json.
- La API real respondió en el puerto 5000 con versión 1.2 y 19 clases.
- POST /clasificar recibió una secuencia existente y devolvió tres candidatas.
  Esa comprobación verifica la conexión; no mide nuevamente la precisión.
- La ruta privada sin sesión respondió 401 y el preflight CORS admitió la web local.
- La interfaz se verificó en Edge aislado con una sesión de administración simulada
  y el informe real importado: tres métricas, cambio de apartados y ancho móvil.
  No se usaron credenciales reales ni se inició una ronda de entrenamiento.
- La exportación pública no contiene .py, .npy, .keras ni .pkl.
- El modelo conserva la huella Git original
  `73f3d7280f5dfc79b4bec7c792926f98e89a7cc5`.

Capturas locales: `.impeccable/review/python-backend/admin-desktop.png` y
`admin-mobile.png`. La incorporación está en `feature/integrar-backend-admin`,
basada en dev. El usuario autorizó su publicación e integración mediante un Pull
Request hacia dev, sin solicitar revisores.
