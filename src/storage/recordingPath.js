export function isRecordingPath(path) {
  return typeof path === 'string' && path.length <= 512 && path.endsWith('.json') &&
    !/[\\%?#\u0000-\u001f]/.test(path) && path.split('/').length <= 8 &&
    path.split('/').every(part => part && part !== '.' && part !== '..');
}
