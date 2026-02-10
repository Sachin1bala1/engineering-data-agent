import { useState } from "react";


export function UploadAndAnalyze() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
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
    const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    const res = await fetch(`${apiBase}/api/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    setPreview(data.preview);
    setColumns(data.columns);
    setSessionId(data.sessionId || null);
    setAiHistory([]); // Reset chat on new upload
    setLoading(false);
  };

  // Ask AI (chat style)
  const handleAnalyze = async () => {
    if (!question.trim()) return;
    if (!sessionId) return;
    setLoading(true);
    setAiHistory(h => [...h, { role: "user", content: question }]);
    const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:8000";
    const res = await fetch(`${apiBase}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, sessionId }),
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
    try {
      const apiBase = import.meta.env.VITE_API_BASE || "http://localhost:8000";
      const res = await fetch(`${apiBase}/api/generate-pptx`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slides }),
      });
      
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to generate PPTX: ${res.status} ${txt}`);
      }
      
      // Check if the response is actually a PPTX file
      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();
      
      // Verify it's a PPTX file, not JSON
      if (blob.type === 'application/json' || contentType.includes('application/json')) {
        const text = await blob.text();
        try {
          const error = JSON.parse(text);
          throw new Error(error.error || 'Server returned JSON instead of PPTX file');
        } catch {
          throw new Error('Server returned JSON instead of PPTX file');
        }
      }
      
      // Ensure the blob is treated as PPTX
      const pptxBlob = new Blob([blob], { 
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' 
      });
      
      const url = window.URL.createObjectURL(pptxBlob);
      setPptxUrl(url);
      
      // Auto-download the file
      const a = document.createElement('a');
      a.href = url;
      a.download = 'AI_Report.pptx';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      console.error('Failed to generate PPTX:', err);
      alert(`Failed to generate PPTX: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
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
