"""Imported recognizer plus the private administrator training panel."""
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def create_server():
    os.chdir(ROOT)
    os.environ.setdefault("LSCH_CORS_ORIGINS", ",".join([
        "http://localhost:8081", "http://127.0.0.1:8081",
        "http://localhost:8082", "http://127.0.0.1:8082",
        "https://deafapps.com", "https://www.deafapps.com",
        "https://deafapp-lsch.deafapp-lsch.workers.dev",
    ]))
    from api_flask import _crear_desde_recursos
    from admin_training import install_admin_routes
    app = _crear_desde_recursos()
    install_admin_routes(app, ROOT)
    return app


if __name__ == "__main__":
    app = create_server()
    host = os.environ.get("LSCH_HOST", "127.0.0.1")
    port = int(os.environ.get("LSCH_PUERTO", "5000"))
    print(f"DeafApp · API Python: http://{host}:{port}", flush=True)
    print("Entrenamiento: Administrador → Entrenamiento LSCh → Modelo de interpretación", flush=True)
    try:
        from waitress import serve
    except ImportError:
        app.run(host=host, port=port, debug=False, threaded=True)
    else:
        serve(app, host=host, port=port, threads=8)
