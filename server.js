
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";
const PUBLIC_DIR = path.join(__dirname, "public");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

  if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return fs.createReadStream(path.join(PUBLIC_DIR, "index.html")).pipe(res);
  }

  if (req.method === "POST" && url.pathname === "/api/reply") {
    if (!API_KEY) {
      res.writeHead(503, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Der Server hat noch keinen KI-API-Schlüssel. Bitte OPENAI_API_KEY einrichten." }));
    }

    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 9_000_000) throw new Error("Die Anfrage ist zu groß. Bitte ein kleineres Bild verwenden.");
      }
      const body = JSON.parse(raw || "{}");
      const { message = "", history = "", style = "Alle Stile", goal = "Eine gute Antwort finden", image = "" } = body;

      if (!message.trim() && !image) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Bitte gib eine Nachricht ein oder lade einen Screenshot hoch." }));
      }

      const instructions = [
        "Du bist AuraBro AI, ein hilfreicher Assistent für das Formulieren von Nachrichten.",
        "Analysiere den bereitgestellten Text, Chatverlauf und gegebenenfalls Screenshot.",
        "Schlage genau drei unterschiedliche, natürliche Antwortmöglichkeiten auf Deutsch vor.",
        "Passe Ton und Länge an den Kontext an. Erfinde keine Fakten über die andere Person.",
        "Bleibe respektvoll und dränge niemanden. Bei Flirt-Kontext nur altersangemessene, nicht-sexuelle Vorschläge.",
        "Gib zuerst eine kurze Einschätzung der Nachricht, danach drei Antworten mit Stil-Labels und zum Schluss eine kurze Empfehlung.",
        "Wenn der Screenshot unleserlich ist, sage das offen und bitte um Abschrift."
      ].join(" ");

      const content = [{
        type: "input_text",
        text: `Gewünschter Schreibstil: ${style}\nZiel: ${goal}\nNachricht: ${message}\nBisheriger Chatverlauf: ${history}`
      }];
      if (image && image.startsWith("data:image/")) {
        content.push({ type: "input_image", image_url: image });
      }

      const apiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: MODEL,
          instructions,
          input: [{ role: "user", content }],
          max_output_tokens: 700
        })
      });

      const data = await apiResponse.json();
      if (!apiResponse.ok) {
        throw new Error(data.error?.message || `KI-Anfrage fehlgeschlagen (${apiResponse.status})`);
      }

      const answer = (data.output || [])
        .flatMap(item => item.content || [])
        .filter(item => item.type === "output_text")
        .map(item => item.text)
        .join("\n");

      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ answer: answer || "Ich konnte gerade keine Antwort erstellen. Versuch es bitte erneut." }));
    } catch (error) {
      res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      return res.end(JSON.stringify({ error: error.message || "Unbekannter Serverfehler." }));
    }
  }

  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Nicht gefunden");
});

server.listen(PORT, () => {
  console.log(`AuraBro AI läuft auf http://localhost:${PORT}`);
});
