import json
from pathlib import Path
import tempfile
import unittest

from flask import Flask
from admin_training import install_admin_routes, TrainingJobs


class FakeJobs:
    def __init__(self):
        self.operations = []

    def snapshot(self):
        return []

    def start(self, operation):
        if operation not in ("import", "train"):
            raise ValueError("Operación no válida")
        self.operations.append(operation)
        return "a" * 32

    def cancel(self, identifier):
        raise KeyError(identifier)


class AdminTrainingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "informe_entrenamiento.json").write_text(json.dumps({"clases": ["ajo"]}))
        self.jobs = FakeJobs()
        app = Flask(__name__)
        install_admin_routes(app, self.root, verify=lambda token: token == "a" * 64, jobs=self.jobs)
        self.client = app.test_client()
        self.headers = {"Authorization": "Bearer " + "a" * 64}

    def test_anonymous_and_expired_sessions_cannot_read_or_train(self):
        for headers in ({}, {"Authorization": "Bearer " + "b" * 64}):
            self.assertEqual(self.client.get("/admin/training", headers=headers).status_code, 401)
            self.assertEqual(self.client.post("/admin/training/jobs", json={"operation": "train"}, headers=headers).status_code, 401)
        self.assertEqual(self.jobs.operations, [])

    def test_valid_session_reads_report_and_starts_a_fixed_operation(self):
        status = self.client.get("/admin/training", headers=self.headers)
        self.assertEqual(status.json["report"]["clases"], ["ajo"])
        result = self.client.post("/admin/training/jobs", json={"operation": "train"}, headers=self.headers)
        self.assertEqual(result.status_code, 202)
        self.assertEqual(self.jobs.operations, ["train"])

    def test_arbitrary_commands_are_rejected(self):
        result = self.client.post("/admin/training/jobs", json={"operation": "python -c anything"}, headers=self.headers)
        self.assertEqual(result.status_code, 400)

    def test_only_complete_candidate_reports_are_listed(self):
        candidate = self.root / "runs" / ("c" * 32)
        candidate.mkdir(parents=True)
        self.assertEqual(self.client.get("/admin/training", headers=self.headers).json["candidates"], [])
        (candidate / "informe_entrenamiento.json").write_text('{"clases":["cerdo"]}')
        report = self.client.get("/admin/training", headers=self.headers).json["candidates"][0]
        self.assertEqual(report["id"], "c" * 32)

    def test_a_running_process_prevents_concurrent_training(self):
        jobs = TrainingJobs(self.root)
        jobs.process = object()
        with self.assertRaises(RuntimeError):
            jobs.start("train")
        jobs.process = None


if __name__ == "__main__":
    unittest.main()
