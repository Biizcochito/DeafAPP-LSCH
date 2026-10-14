import {validAdminSession} from '../adminClient.js';

export function createPythonBackendClient(apiUrl, session, {fetchImpl = fetch} = {}) {
  async function request(path, body, signal) {
    if (!validAdminSession(session)) throw new Error('La sesión terminó. Vuelve a ingresar al administrador.');
    const controller = new AbortController(), abort = () => controller.abort();
    if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, {once:true});
    const timer = setTimeout(abort, 15000);
    try {
      const response = await fetchImpl(`${apiUrl}${path}`, {
        method:body === undefined ? 'GET' : 'POST', signal:controller.signal,
        headers:{Authorization:`Bearer ${session.token}`, ...(body === undefined ? {} : {'Content-Type':'application/json'})},
        ...(body === undefined ? {} : {body:JSON.stringify(body)}),
      });
      let data;
      try {data = await response.json();}
      catch {throw new Error('Este servidor no incluye el apartado de entrenamiento. Inicia el backend integrado de este proyecto.');}
      if (!data || typeof data !== 'object') throw new Error('Python devolvió una respuesta no válida.');
      if (!response.ok) throw new Error(data.error || 'Python no pudo completar la operación.');
      return data;
    } catch (error) {
      if (error.name === 'AbortError') throw new Error(signal?.aborted ? 'Consulta cancelada.' : 'Python tardó demasiado en responder.');
      if (error instanceof TypeError) throw new Error('No se pudo conectar con Python. Inicia el backend de este proyecto y comprueba su dirección.');
      throw error;
    } finally {
      clearTimeout(timer); signal?.removeEventListener('abort', abort);
    }
  }
  return {
    status:signal => request('/admin/training', undefined, signal),
    start:(operation, signal) => {
      if (!['import','train'].includes(operation)) throw new Error('Operación no válida.');
      return request('/admin/training/jobs', {operation}, signal);
    },
    cancel:(id, signal) => {
      if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Proceso no válido.');
      return request(`/admin/training/jobs/${id}/cancel`, {}, signal);
    },
  };
}

export function trainingMetrics(report) {
  const cv = report?.validacion_cruzada;
  const percentage = value => Number.isFinite(value) ? `${(value * 100).toFixed(2).replace('.',',')} %` : 'Sin evaluación';
  return {accuracy:percentage(cv?.exactitud), answeredAccuracy:percentage(cv?.acerto_entre_respondidas),
    top3:percentage(cv?.top3), samples:cv?.n ?? 0, answered:cv?.respondio ?? 0,
    classes:Array.isArray(report?.clases) ? report.clases : []};
}
