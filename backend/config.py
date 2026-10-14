"""
config.py — Configuración compartida (API Flask e importador de DeafApp)
════════════════════════════════════════════════════════════════════════
La URL y la clave son las PÚBLICAS (publishable/anon) de Supabase: ya están en el código de la
web y de la API, y solo permiten lo que las políticas de seguridad (RLS) del proyecto permiten.
Se pueden sustituir con variables de entorno, por ejemplo para apuntar a otro proyecto:

    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_PUBLISHABLE_KEY=...

Nunca pongas aquí una clave de servicio (service_role): este archivo se versiona.
"""

import os

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://didlffnluqqurelgnqdp.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpZGxmZm5sdXFxdXJlbGducWRwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MDMwNTYsImV4cCI6MjA5OTk3OTA1Nn0.G6MqUFXNJleUTBtZu7kQb58E-rGWk3w-rLbvRu6xOVE")
