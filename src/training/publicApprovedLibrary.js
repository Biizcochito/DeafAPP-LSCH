// Read only the recordings already approved for the public library. This
// adapter never calls administration RPCs or requests pending contributions.
export function publicApprovedLibrary(client, signal) {
  return {
    async list(_session, {status = 'approved', page = 0} = {}) {
      if (status !== 'approved' || !Number.isInteger(page) || page < 0) throw Error('Consulta de biblioteca no válida.');
      const {data, count, error} = await client.from('grabaciones')
        .select('id,label,categoria,archivo_path,moderation_version', {count:'exact'})
        .eq('aprobada', true).order('id').range(page * 100, page * 100 + 99).abortSignal(signal);
      if (error || !Array.isArray(data) || !Number.isInteger(count)) throw Error('No se pudo cargar la biblioteca. Comprueba tu conexión e inténtalo de nuevo.');
      return {rows:data.map(row => ({id:String(row.id),label:row.label,category:row.categoria,path:row.archivo_path,
        version:row.moderation_version,status:'approved'})),total:count,counts:{approved:count,pending:0}};
    },
  };
}
