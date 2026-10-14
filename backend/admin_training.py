"""Training controls protected by the existing DeafApp administrator session."""
from __future__ import annotations

import atexit
from collections import deque
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import threading
import uuid

from flask import jsonify, request
import requests
import config


def verify_admin_session(token):
    response = requests.post(
        f"{config.SUPABASE_URL}/rest/v1/rpc/deafapp_admin_overview",
        headers={"apikey": config.SUPABASE_KEY, "Authorization": f"Bearer {config.SUPABASE_KEY}"},
        json={"p_token": token}, timeout=10,
    )
    return response.ok and response.json().get("ok") is True


def read_report(directory):
    path = directory / "informe_entrenamiento.json"
    return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else None


class TrainingJobs:
    def __init__(self, root):
        self.root = root.resolve()
        self.lock = threading.Lock()
        self.jobs = {}
        self.process = None
        atexit.register(self.stop)

    def snapshot(self):
        with self.lock:
            return [{k: list(v) if isinstance(v, deque) else v for k, v in j.items()}
                    for j in self.jobs.values()]

    def start(self, operation):
        if operation not in ("import", "train"):
            raise ValueError("Elige importar grabaciones o entrenar un candidato.")
        with self.lock:
            if self.process is not None or any(j["status"] in ("queued", "running") for j in self.jobs.values()):
                raise RuntimeError("Ya hay un proceso en curso.")
            identifier = uuid.uuid4().hex
            self.jobs[identifier] = {"id": identifier, "operation": operation, "status": "queued",
                "createdAt": datetime.now(timezone.utc).isoformat(), "logs": deque(maxlen=60)}
            old = [i for i, j in self.jobs.items() if j["status"] not in ("queued", "running")]
            for key in old[:-7]:
                del self.jobs[key]
        threading.Thread(target=self._run, args=(identifier,), daemon=True).start()
        return identifier

    def _run(self, identifier):
        try:
            with self.lock:
                job = self.jobs[identifier]
                if job["status"] == "cancelled":
                    return
                args = [sys.executable, "-u", str(self.root / "importar_deafapp.py")]
                if job["operation"] == "train":
                    args = [sys.executable, "-u", str(self.root / "entrenar_modelo.py"),
                            "--salida", str(self.root / "runs" / identifier)]
                self.process = subprocess.Popen(args, cwd=self.root, env={**os.environ, "PYTHONUTF8": "1"}, stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
                process = self.process
                job["status"] = "running"
            for line in process.stdout:
                with self.lock:
                    job["logs"].append(line.rstrip()[:1500])
            code = process.wait()
            with self.lock:
                if job["status"] != "cancelled":
                    job["status"] = "complete" if code == 0 else "error"
                job["finishedAt"] = datetime.now(timezone.utc).isoformat()
                self.process = None
        except Exception:
            with self.lock:
                if self.process is not None and self.process.poll() is None:
                    self.process.terminate()
                self.jobs[identifier]["status"] = "error"
                self.jobs[identifier]["logs"].append("No se pudo completar el proceso. Revisa la consola de Python.")
                self.process = None

    def cancel(self, identifier):
        with self.lock:
            job = self.jobs.get(identifier)
            if not job:
                raise KeyError(identifier)
            if job["status"] in ("queued", "running"):
                job["status"] = "cancelled"
                if self.process is not None:
                    self.process.terminate()

    def stop(self):
        with self.lock:
            if self.process is not None and self.process.poll() is None:
                self.process.terminate()


def install_admin_routes(app, root, *, verify=verify_admin_session, jobs=None):
    root = root.resolve()
    jobs = jobs or TrainingJobs(root)

    @app.before_request
    def authorize_training():
        if not request.path.startswith("/admin/training") or request.method == "OPTIONS":
            return None
        header = request.headers.get("Authorization", "")
        token = header.removeprefix("Bearer ") if header.startswith("Bearer ") else ""
        if not re.fullmatch(r"[a-f0-9]{64}", token):
            return jsonify(error="Vuelve a ingresar al administrador."), 401
        try:
            authorized = verify(token)
        except (requests.RequestException, ValueError):
            return jsonify(error="No se pudo comprobar la sesión del administrador."), 503
        if not authorized:
            return jsonify(error="La sesión del administrador terminó."), 401

    @app.get("/admin/training")
    def training_status():
        try:
            candidates = [{"id": p.parent.name, "report": read_report(p.parent)} for p in
                sorted((root / "runs").glob("*/informe_entrenamiento.json"),
                       key=lambda p: p.stat().st_mtime, reverse=True)[:10]]
            return jsonify(report=read_report(root), candidates=candidates, jobs=jobs.snapshot())
        except (OSError, ValueError):
            return jsonify(error="No se pudo leer el informe del modelo."), 500

    @app.post("/admin/training/jobs")
    def start_training_job():
        body = request.get_json(silent=True)
        if not isinstance(body, dict):
            return jsonify(error="Solicitud no válida."), 400
        try:
            identifier = jobs.start(body.get("operation"))
        except ValueError as error:
            return jsonify(error=str(error)), 400
        except RuntimeError as error:
            return jsonify(error=str(error)), 409
        return jsonify(id=identifier), 202

    @app.post("/admin/training/jobs/<identifier>/cancel")
    def cancel_training_job(identifier):
        try:
            jobs.cancel(identifier)
        except KeyError:
            return jsonify(error="El proceso no existe."), 404
        return jsonify(ok=True)

    return jobs
