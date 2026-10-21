export function cameraStartupMessage(error) {
  const name = error?.name;
  if (['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(name)) {
    return 'Permite el acceso a la cámara en los permisos de esta web y pulsa Reiniciar cámara.';
  }
  if (['NotFoundError', 'DevicesNotFoundError'].includes(name)) {
    return 'No se encontró una cámara disponible. Comprueba que esté conectada y pulsa Reiniciar cámara.';
  }
  if (['NotReadableError', 'AbortError', 'TrackStartError'].includes(name) || /videoinput|video source/i.test(error?.message || '')) {
    return 'No se pudo iniciar la cámara. Cierra otras pestañas o aplicaciones que la estén usando y pulsa Reiniciar cámara.';
  }
  return 'No se pudo abrir la cámara. Pulsa Reiniciar cámara para volver a intentarlo.';
}
