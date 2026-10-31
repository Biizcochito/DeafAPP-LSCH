-- Limit the exception to the service-only administrative integrity audit.
-- Large feature/model JSON can exceed PostgREST's default 8-second timeout on
-- Nano. All other roles/functions retain their existing timeout and grants.
alter function public.deafapp_storage_integrity_snapshot() set statement_timeout to '45s';
notify pgrst,'reload schema';
