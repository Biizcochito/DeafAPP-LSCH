export const TUB_REVISION = "10a99529c9d3e0cb4b356897f39fb54b94ff0fbf";
export const TUB_REPOSITORY = "https://github.com/DFKI-SignLanguage/TUB-Sign-Language-Corpus-Collection";

export function parseCsv(text) {
  const rows = []; let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (quoted || field === "") quoted = !quoted;
      else throw new Error("CSV con comillas fuera de un campo.");
    } else if (!quoted && (char === "," || char === "\n" || char === "\r")) {
      row.push(field); field = "";
      if (char !== ",") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        if (row.some(v => v !== "")) rows.push(row);
        row = [];
      }
    } else field += char;
  }
  if (quoted) throw new Error("CSV con un campo sin cerrar.");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((v, i) => i === 0 ? v.replace(/^\uFEFF/, "") : v);
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error("CSV con una fila incompleta.");
    return Object.fromEntries(headers.map((header, i) => [header, values[i]]));
  });
}

export function safeSourceUrl(value) {
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}

export function buildLschSourceCatalog(channelRows, videoRows, { revision = TUB_REVISION, retrievedAt } = {}) {
  const channelMap = new Map(channelRows.filter(row => row["Sign Language"] === "LSCh").map(row => [row["Channel ID"], row]));
  const seen = new Set(); const videos = []; const rejected = [];
  for (const row of videoRows) {
    if (row["Sign Language"] !== "LSCh") continue;
    const channel = channelMap.get(row["Channel ID"]);
    const url = safeSourceUrl(row["Webpage URL"]);
    if (!channel || !url || !row["Video Name"]) { rejected.push({ id: row.ID, reason: "missing-source-or-url" }); continue; }
    if (seen.has(url)) { rejected.push({ id: row.ID, reason: "duplicate-url" }); continue; }
    seen.add(url);
    const durationSeconds = Number(row["Video Length"]);
    videos.push({
      id: `tub-${row.ID}`, language: "csg", title: row["Video Name"], url,
      channelId: channel["Channel ID"], channel: channel.Name,
      publishedAt: row["Release Date"], durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
      reportedLicense: channel.License || "unknown", subtitlesType: row["Subtitles Type"] || "unknown",
      reviewStatus: "unreviewed", trainingStatus: "needs-license-and-language-review", segments: [],
    });
  }
  const channels = [...channelMap.values()].map(channel => ({
    id: channel["Channel ID"], name: channel.Name, url: safeSourceUrl(channel.Source),
    reportedLicense: channel.License || "unknown", contentType: channel["Content type"],
    videoCount: videos.filter(video => video.channelId === channel["Channel ID"]).length,
  }));
  return {
    version: 1, language: "csg", retrievedAt, repository: TUB_REPOSITORY, revision,
    metadataLicense: "MIT", videoLicensesInheritedFromMetadata: false,
    note: "Enlaces candidatos de LSCh. No son muestras etiquetadas ni autorizadas automáticamente para entrenamiento.",
    channels, videos, rejected,
    totalDurationSeconds: videos.reduce((sum, video) => sum + (video.durationSeconds || 0), 0),
  };
}
