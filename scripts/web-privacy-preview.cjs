const { spawn } = require("node:child_process");
const path = require("node:path");
const port = process.argv[2] || "8083";
if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Usa un puerto local entre 1024 y 65535.");
console.log(`Prueba local de privacidad: http://localhost:${port}/consentimiento`);
console.log("No activa la cámara ni permite enviar grabaciones. No publica cambios.");
const child = spawn(process.execPath, [require.resolve("expo/bin/cli"), "start", "--web", "--host", "localhost", "--port", port], {
  cwd: path.resolve(__dirname, ".."), stdio: "inherit",
  env: { ...process.env, EXPO_PUBLIC_PRIVACY_PREVIEW: "1", EXPO_NO_TELEMETRY: "1", BROWSER: "none" },
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code || 0; });
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
