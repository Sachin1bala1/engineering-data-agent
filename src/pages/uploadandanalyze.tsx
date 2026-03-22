import { useState } from "react";

export function UploadAndAnalyze() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fullData, setFullData] = useState<any[]>([]);
  const [question, setQuestion] = useState("");
  const [aiHistory, setAiHistory] = useState<{role: "user" | "ai", content: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [slides, setSlides] = useState<{title: string, text: string, imageBase64?: string}[]>([]);
  const [pptxUrl, setPptxUrl] = useState<string | null>(null);

  // Upload CSV
  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch("http://localhost:5000/api/upload", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setPreview(data.preview);
    setColumns(data.columns);
    setFullData(data.data);
    setAiHistory([]); // Reset chat on new upload
    setLoading(false);
  };

  // Ask AI (chat style)
  const handleAnalyze = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAiHistory(h => [...h, { role: "user", content: question }]);
    const res = await fetch("http://localhost:5000/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, data: fullData }),
    });
    const data = await res.json();
    setAiHistory(h => [...h, { role: "ai", content: data.answer || "No response from AI." }]);
    setQuestion("");
    setLoading(false);
  };

  // Add last AI answer to slides
  const handleAddSlide = () => {
    const lastAi = [...aiHistory].reverse().find(m => m.role === "ai");
    if (lastAi) {
      setSlides([...slides, { title: "AI Insight", text: lastAi.content }]);
    }
  };

  // Generate PPTX
  const handleGeneratePPTX = async () => {
    setLoading(true);
    const res = await fetch("http://localhost:5000/api/generate-pptx", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides }),
    });
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    setPptxUrl(url);
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 700, margin: "0 auto", padding: 24 }}>
      <h2>Upload and Analyze CSV with AI</h2>
      <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
      <button onClick={handleUpload} disabled={!file || loading} style={{ marginLeft: 8 }}>
        {loading ? "Uploading..." : "Upload"}
      </button>
      {preview.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h4>Preview (first 5 rows):</h4>
          <pre style={{ background: "#f6f8fa", padding: 12, borderRadius: 6 }}>
            {JSON.stringify(preview, null, 2)}
          </pre>
          <div style={{ margin: "24px 0" }}>
            <h4>AI Chat</h4>
            <div style={{ maxHeight: 250, overflowY: "auto", background: "#fafbfc", padding: 12, borderRadius: 6, marginBottom: 8 }}>
              {aiHistory.length === 0 && <div style={{ color: "#888" }}>No AI conversation yet.</div>}
              {aiHistory.map((msg, i) =>
                <div key={i} style={{ marginBottom: 10 }}>
                  <b style={{ color: msg.role === "user" ? "#1976d2" : "#388e3c" }}>
                    {msg.role === "user" ? "You" : "AI"}:
                  </b>
                  <div style={{ whiteSpace: "pre-wrap", marginLeft: 8 }}>{msg.content}</div>
                </div>
              )}
            </div>
            <input
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="Ask a question about your data"
              style={{ width: "70%", marginRight: 8 }}
              onKeyDown={e => { if (e.key === "Enter") handleAnalyze(); }}
              disabled={loading}
            />
            <button onClick={handleAnalyze} disabled={loading || !question.trim()}>
              {loading ? "Thinking..." : "Ask AI"}
            </button>
            <button
              onClick={handleAddSlide}
              disabled={aiHistory.filter(m => m.role === "ai").length === 0}
              style={{ marginLeft: 8 }}
            >
              Add Last AI Answer to Slides
            </button>
          </div>
        </div>
      )}
      {slides.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h4>Slides:</h4>
          <ul>
            {slides.map((s, i) => (
              <li key={i} style={{ marginBottom: 8 }}>
                <b>{s.title}</b>: {s.text}
              </li>
            ))}
          </ul>
          <button onClick={handleGeneratePPTX} disabled={loading}>
            {loading ? "Generating..." : "Generate PPTX"}
          </button>
        </div>
      )}
      {pptxUrl && (
        <div style={{ marginTop: 24 }}>
          <a href={pptxUrl} download="AI_Report.pptx" style={{ fontWeight: "bold", color: "#1976d2" }}>
            Download PPTX
          </a>
        </div>
      )}
    </div>
  );
}