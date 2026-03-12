import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { engineeringApi, getErrorMessage } from "@/lib/engineering-api";
import type {
  KnowledgeGraphResponse,
  KnowledgeRecommendationResponse,
  KnowledgeQueryResponse,
  ScriptRunResponse,
  IndustrialStreamUploadResponse,
  IndustrialLiveDriftResponse,
  IndustrialLiveDriversResponse,
  IndustrialPrescriptiveResponse,
  TwinSimulationResponse,
} from "@/types/engineering-api";
import { toast } from "sonner";
import * as d3 from "d3";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type TimelineRow = {
  name: string;
  incidents: number;
  unresolved: number;
};

type CauseRow = {
  cause: string;
  count: number;
};

function toTimelineRows(incidents: Array<Record<string, unknown>>): TimelineRow[] {
  const buckets = new Map<string, { incidents: number; unresolved: number }>();
  for (const row of incidents) {
    const timestamp = String(row.timestamp || "");
    const day = timestamp ? timestamp.slice(0, 10) : "unknown";
    const current = buckets.get(day) || { incidents: 0, unresolved: 0 };
    current.incidents += 1;
    if (!Boolean(row.resolved)) current.unresolved += 1;
    buckets.set(day, current);
  }
  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, values]) => ({ name, ...values }));
}

function toCauseRows(
  queryResponse: KnowledgeQueryResponse | null,
  incidents: Array<Record<string, unknown>>
): CauseRow[] {
  const deterministic = (queryResponse?.deterministic_answer || {}) as Record<string, any>;
  const leading = deterministic.leading_failure_causes as Array<Record<string, unknown>> | undefined;
  if (leading && leading.length) {
    return leading
      .map((item) => ({
        cause: String(item.cause || "unknown_cause"),
        count: Number(item.count || 0),
      }))
      .filter((item) => item.count > 0);
  }

  const counts = new Map<string, number>();
  for (const row of incidents) {
    const cause = String(row.root_cause || "unknown_cause");
    counts.set(cause, (counts.get(cause) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([cause, count]) => ({ cause, count }));
}

function extractPythonCode(text: string): string {
  const content = String(text || "");
  const fenced = content.match(/```python\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const generic = content.match(/```\s*([\s\S]*?)```/);
  if (generic && generic[1]) return generic[1].trim();
  return "";
}

export default function KnowledgeTwin() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [assetId, setAssetId] = useState("MOTOR-1");
  const [failureMode, setFailureMode] = useState("");
  const [question, setQuestion] = useState("Why is this asset failing and what worked historically?");
  const [logFile, setLogFile] = useState<File | null>(null);
  const [incidentFile, setIncidentFile] = useState<File | null>(null);
  const [sopFile, setSopFile] = useState<File | null>(null);
  const [logsUploaded, setLogsUploaded] = useState(false);
  const [incidentsUploaded, setIncidentsUploaded] = useState(false);
  const [sopUploaded, setSopUploaded] = useState(false);
  const [sopName, setSopName] = useState("Motor Maintenance SOP");
  const [sopAssetType, setSopAssetType] = useState("motor");
  const [graph, setGraph] = useState<KnowledgeGraphResponse | null>(null);
  const [recommendation, setRecommendation] = useState<KnowledgeRecommendationResponse | null>(null);
  const [queryResponse, setQueryResponse] = useState<KnowledgeQueryResponse | null>(null);
  const [chatSessionId, setChatSessionId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: string; content: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [memoryConfigLoading, setMemoryConfigLoading] = useState(false);
  const [memoryPersistenceEnabled, setMemoryPersistenceEnabled] = useState(false);
  const [memoryUseAssetHistory, setMemoryUseAssetHistory] = useState(true);
  const [pendingDatasetIds, setPendingDatasetIds] = useState<string[]>([]);
  const [savingDatasets, setSavingDatasets] = useState(false);
  const [savingChat, setSavingChat] = useState(false);
  const [pythonCode, setPythonCode] = useState("");
  const [pythonRunning, setPythonRunning] = useState(false);
  const [pythonResult, setPythonResult] = useState<ScriptRunResponse | null>(null);
  const [industrialFile, setIndustrialFile] = useState<File | null>(null);
  const [industrialStreamName, setIndustrialStreamName] = useState("Line-4 Stream");
  const [industrialTarget, setIndustrialTarget] = useState("yield");
  const [industrialTimestamp, setIndustrialTimestamp] = useState("timestamp");
  const [industrialStream, setIndustrialStream] = useState<IndustrialStreamUploadResponse | null>(null);
  const [industrialDrift, setIndustrialDrift] = useState<IndustrialLiveDriftResponse | null>(null);
  const [industrialDrivers, setIndustrialDrivers] = useState<IndustrialLiveDriversResponse | null>(null);
  const [prescriptiveObjective, setPrescriptiveObjective] = useState<"maximize" | "minimize">("maximize");
  const [prescriptiveResult, setPrescriptiveResult] = useState<IndustrialPrescriptiveResponse | null>(null);
  const [twinInput, setTwinInput] = useState<string>(
    JSON.stringify(
      {
        nodes: [
          { id: "pump", label: "Pump", setpoint: 40, gain: 1.0, min_value: 10, max_value: 100 },
          { id: "valve", label: "Valve", setpoint: 30, gain: 0.7, min_value: 5, max_value: 90 },
          { id: "heater", label: "Heater", setpoint: 55, gain: 0.5, min_value: 20, max_value: 130 },
        ],
        edges: [
          { source: "pump", target: "valve", weight: 0.6 },
          { source: "valve", target: "heater", weight: 0.8 },
        ],
        scenarios: [
          { name: "Reduce pressure 5%", changes: { pump: { setpoint: 38 } } },
          { name: "Increase valve +8%", changes: { valve: { setpoint: 32.4 } } },
        ],
      },
      null,
      2
    )
  );
  const [twinResult, setTwinResult] = useState<TwinSimulationResponse | null>(null);

  const timelineRows = useMemo(() => toTimelineRows(graph?.incidents || []), [graph?.incidents]);
  const leadingCauseRows = useMemo(
    () => toCauseRows(queryResponse, graph?.incidents || []),
    [queryResponse, graph?.incidents]
  );
  const driftRows = useMemo(
    () => ((industrialDrift?.drift?.columns || []) as Array<Record<string, unknown>>).slice(0, 8),
    [industrialDrift]
  );
  const driverRows = useMemo(
    () => (industrialDrivers?.drivers || []).slice(0, 8),
    [industrialDrivers]
  );
  const twinScenarioRows = useMemo(
    () =>
      (twinResult?.scenarios || []).map((s: any) => ({
        name: String(s.name || "scenario"),
        sink_total: Object.values((s.sink_outputs || {}) as Record<string, unknown>).reduce(
          (acc, val) => acc + Number(val || 0),
          0
        ),
      })),
    [twinResult]
  );

  useEffect(() => {
    if (!graph || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const width = 720;
    const height = 360;

    const nodeColor: Record<string, string> = {
      asset: "#1e8e3e",
      incident: "#64748b",
      failure_mode: "#dc2626",
      root_cause: "#f59e0b",
      corrective_action: "#0ea5e9",
      sop: "#8b5cf6",
    };

    const nodes = graph.nodes.map((n) => ({ ...n })) as Array<{ id: string; label: string; type: string }>;
    const links = graph.edges.map((e) => ({ ...e })) as Array<{ source: string; target: string; weight?: number }>;
    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(82))
      .force("charge", d3.forceManyBody().strength(-220))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .attr("stroke", "#94a3b8")
      .attr("stroke-opacity", 0.7)
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", (d) => Math.max(1.2, (d.weight || 1) * 1.3));

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", (d) => nodeColor[d.type] || "#334155")
      .call(
        d3
          .drag<SVGCircleElement, any>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node.append("title").text((d) => `${d.type}: ${d.label}`);

    const labels = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d) => d.label)
      .attr("font-size", 10)
      .attr("fill", "#0f172a");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      labels.attr("x", (d: any) => d.x + 10).attr("y", (d: any) => d.y + 4);
    });

    return () => {
      simulation.stop();
    };
  }, [graph]);

  useEffect(() => {
    const loadMemoryConfig = async () => {
      try {
        const cfg = await engineeringApi.getKnowledgeMemoryConfig();
        setMemoryPersistenceEnabled(Boolean(cfg.persistence_enabled));
        setMemoryUseAssetHistory(Boolean(cfg.use_asset_history));
      } catch (error) {
        toast.error(getErrorMessage(error, "Failed to load memory settings."));
      }
    };
    loadMemoryConfig();
  }, []);

  useEffect(() => {
    const source = queryResponse?.ai_summary || "";
    const extracted = extractPythonCode(source);
    if (extracted) setPythonCode(extracted);
  }, [queryResponse?.ai_summary]);

  const loadKnowledge = async () => {
    if (!assetId.trim()) {
      toast.error("Asset ID is required.");
      return;
    }
    setLoading(true);
    try {
      const [graphRes, recRes] = await Promise.all([
        engineeringApi.getKnowledgeGraph(assetId.trim()),
        engineeringApi.getKnowledgeRecommendation(assetId.trim(), failureMode.trim() || undefined),
      ]);
      setGraph(graphRes);
      setRecommendation(recRes);
      toast.success("Knowledge Twin loaded.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to load Knowledge Twin."));
    } finally {
      setLoading(false);
    }
  };

  const runQuery = async () => {
    if (!assetId.trim() || !question.trim()) {
      toast.error("Asset ID and question are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await engineeringApi.queryKnowledge(assetId.trim(), question.trim(), failureMode.trim() || undefined);
      setQueryResponse(res);
      setChatInput(question.trim());
      toast.success("Deterministic query completed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Query failed."));
    } finally {
      setLoading(false);
    }
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!assetId.trim() || !text) {
      toast.error("Asset ID and chat question are required.");
      return;
    }
    setLoading(true);
    try {
      const res = await engineeringApi.chatKnowledge({
        asset_id: assetId.trim(),
        question: text,
        failure: failureMode.trim() || undefined,
        session_id: chatSessionId || undefined,
      });
      setChatSessionId(res.session_id);
      setChatMessages(res.history || []);
      setQueryResponse({
        asset_id: assetId.trim(),
        question: text,
        deterministic_answer: res.deterministic_answer,
        ai_summary: res.answer,
        evidence: res.evidence,
        confidence: res.confidence,
      });
      setChatInput("");
    } catch (error) {
      toast.error(getErrorMessage(error, "Chat failed."));
    } finally {
      setLoading(false);
    }
  };

  const resetChat = async () => {
    if (!chatSessionId) {
      setChatMessages([]);
      return;
    }
    try {
      await engineeringApi.resetKnowledgeChat(chatSessionId);
      setChatSessionId(null);
      setChatMessages([]);
      toast.success("Knowledge chat reset.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to reset chat."));
    }
  };

  const applyMemoryConfig = async () => {
    setMemoryConfigLoading(true);
    try {
      const cfg = await engineeringApi.setKnowledgeMemoryConfig({
        persistence_enabled: memoryPersistenceEnabled,
        use_asset_history: memoryUseAssetHistory,
      });
      setMemoryPersistenceEnabled(Boolean(cfg.persistence_enabled));
      setMemoryUseAssetHistory(Boolean(cfg.use_asset_history));
      toast.success("Knowledge memory settings updated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to update memory settings."));
    } finally {
      setMemoryConfigLoading(false);
    }
  };

  const uploadLogs = async () => {
    if (!logFile) return;
    setLoading(true);
    try {
      const res = await engineeringApi.uploadKnowledgeLogs(logFile, false);
      toast.success(`Logs ingested: ${res.rows_ingested || 0} rows`);
      setLogsUploaded(true);
      if (res.dataset_id) setPendingDatasetIds((prev) => Array.from(new Set([...prev, String(res.dataset_id)])));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to upload logs."));
    } finally {
      setLoading(false);
    }
  };

  const uploadIncidents = async () => {
    if (!incidentFile) return;
    setLoading(true);
    try {
      const res = await engineeringApi.uploadKnowledgeIncidents(incidentFile, false);
      toast.success(`Incidents ingested: ${res.rows_ingested || 0} rows`);
      setIncidentsUploaded(true);
      if (res.dataset_id) setPendingDatasetIds((prev) => Array.from(new Set([...prev, String(res.dataset_id)])));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to upload incidents."));
    } finally {
      setLoading(false);
    }
  };

  const uploadSop = async () => {
    if (!sopFile) return;
    setLoading(true);
    try {
      const res = await engineeringApi.uploadKnowledgeSop(
        sopFile,
        sopName.trim() || "Engineering SOP",
        sopAssetType.trim() || "generic_asset",
        false
      );
      toast.success(`SOP ingested: ${res.steps_ingested || 0} steps`);
      setSopUploaded(true);
      if (res.dataset_id) setPendingDatasetIds((prev) => Array.from(new Set([...prev, String(res.dataset_id)])));
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to upload SOP."));
    } finally {
      setLoading(false);
    }
  };

  const saveUploadedDataToMemory = async () => {
    if (pendingDatasetIds.length === 0) {
      toast.error("No newly uploaded datasets to save.");
      return;
    }
    setSavingDatasets(true);
    try {
      const res = await engineeringApi.saveKnowledgeDatasets(pendingDatasetIds);
      const saved = res.saved_dataset_ids?.length || 0;
      const missing = res.missing_dataset_ids?.length || 0;
      toast.success(`Saved ${saved} dataset(s) to persistent memory${missing ? ` (${missing} missing)` : ""}.`);
      setPendingDatasetIds([]);
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save datasets to memory."));
    } finally {
      setSavingDatasets(false);
    }
  };

  const saveChatSessionToMemory = async () => {
    if (!chatSessionId) {
      toast.error("No active chat session to save.");
      return;
    }
    setSavingChat(true);
    try {
      const res = await engineeringApi.saveKnowledgeChatSession(chatSessionId, assetId.trim() || undefined);
      if ((res.saved_messages || 0) > 0) {
        toast.success(`Saved ${res.saved_messages} chat message(s) to persistent memory.`);
      } else {
        toast.error("No chat history found to save.");
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to save chat session to memory."));
    } finally {
      setSavingChat(false);
    }
  };

  const runPythonAgent = async () => {
    const code = pythonCode.trim();
    if (!code) {
      toast.error("No Python code to run.");
      return;
    }
    setPythonRunning(true);
    setPythonResult(null);
    try {
      const res = await engineeringApi.runScript({ code, timeout_sec: 30 });
      setPythonResult(res);
      toast.success("Python agent executed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Python execution failed."));
    } finally {
      setPythonRunning(false);
    }
  };

  const uploadIndustrialStream = async () => {
    if (!industrialFile) {
      toast.error("Choose a stream dataset first.");
      return;
    }
    setLoading(true);
    try {
      const res = await engineeringApi.uploadIndustrialLiveData(
        industrialFile,
        industrialTarget.trim() || undefined,
        industrialTimestamp.trim() || undefined,
        industrialStreamName.trim() || undefined
      );
      setIndustrialStream(res);
      setIndustrialDrift({ stream_id: res.stream_id, drift: res.drift });
      setIndustrialDrivers({ stream_id: res.stream_id, target_col: res.target_col, drivers: res.drivers });
      toast.success("Live stream ingested.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to ingest live stream."));
    } finally {
      setLoading(false);
    }
  };

  const refreshIndustrialInsights = async () => {
    if (!industrialStream?.stream_id) {
      toast.error("Upload live stream first.");
      return;
    }
    setLoading(true);
    try {
      const [driftRes, driverRes] = await Promise.all([
        engineeringApi.getIndustrialDrift(industrialStream.stream_id),
        engineeringApi.getIndustrialDrivers(industrialStream.stream_id, industrialTarget.trim() || undefined),
      ]);
      setIndustrialDrift(driftRes);
      setIndustrialDrivers(driverRes);
      toast.success("Live drift + drivers refreshed.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to refresh live insights."));
    } finally {
      setLoading(false);
    }
  };

  const runPrescriptive = async () => {
    if (!industrialStream?.stream_id) {
      toast.error("Upload live stream first.");
      return;
    }
    setLoading(true);
    try {
      const topVars = (industrialDrivers?.drivers || []).slice(0, 5).map((d) => d.variable);
      const res = await engineeringApi.getPrescriptiveRecommendation({
        stream_id: industrialStream.stream_id,
        target_col: industrialTarget.trim() || industrialStream.target_col,
        objective: prescriptiveObjective,
        controllable_vars: topVars,
      });
      setPrescriptiveResult(res);
      toast.success("Prescriptive recommendation generated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to generate prescriptive recommendation."));
    } finally {
      setLoading(false);
    }
  };

  const runTwinSimulation = async () => {
    setLoading(true);
    try {
      const payload = JSON.parse(twinInput);
      const res = await engineeringApi.simulateTwin(payload);
      setTwinResult(res);
      toast.success("Digital Twin scenario simulated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Twin simulation failed. Check JSON format."));
    } finally {
      setLoading(false);
    }
  };

  const confidencePct = Math.round((recommendation?.confidence || queryResponse?.confidence || 0) * 100);
  const gaugeData = [{ name: "Confidence", value: confidencePct }];
  const matchedSops = (recommendation?.sop_mapping?.matched_sops || []).slice(0, 2);
  const deterministicRecommendation = ((queryResponse?.deterministic_answer as any)?.recommendation || recommendation?.recommendation || {}) as any;
  const chosenAction = deterministicRecommendation?.recommendation?.action || deterministicRecommendation?.action || "N/A";
  const evidenceCount = (queryResponse?.evidence || recommendation?.evidence || []).length;

  return (
    <main className="min-h-screen bg-slate-50 py-6">
      <section className="container px-4 space-y-4">
        <div>
          <h1 className="text-4xl font-semibold text-slate-900 tracking-tight">Engineering Knowledge Twin</h1>
          <p className="text-slate-600 mt-2">
            Deterministic engineering reasoning with evidence trace and AI summary for maintenance decisions.
          </p>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Ingestion Pipelines</CardTitle>
            <CardDescription>Load maintenance logs, incidents, and SOPs into the Knowledge Twin graph.</CardDescription>
          </CardHeader>
          <CardContent className="grid md:grid-cols-3 gap-4">
            <div className="md:col-span-3 rounded-md border border-slate-200 bg-white p-3 flex items-center justify-between gap-3">
              <p className="text-sm text-slate-700">
                Uploaded data is not persisted automatically. Save only when you want to keep it as historical memory.
              </p>
              <Button
                variant="outline"
                onClick={saveUploadedDataToMemory}
                disabled={savingDatasets || pendingDatasetIds.length === 0}
              >
                {savingDatasets ? "Saving..." : `Save Uploaded Data (${pendingDatasetIds.length})`}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Maintenance logs</Label>
              <Input
                type="file"
                onChange={(e) => {
                  setLogFile(e.target.files?.[0] || null);
                  setLogsUploaded(false);
                }}
              />
              <Button className="w-full" onClick={uploadLogs} disabled={loading || !logFile}>
                {logsUploaded ? "Uploaded" : "Upload Logs"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>Incident reports</Label>
              <Input
                type="file"
                onChange={(e) => {
                  setIncidentFile(e.target.files?.[0] || null);
                  setIncidentsUploaded(false);
                }}
              />
              <Button className="w-full" onClick={uploadIncidents} disabled={loading || !incidentFile}>
                {incidentsUploaded ? "Uploaded" : "Upload Incidents"}
              </Button>
            </div>
            <div className="space-y-2">
              <Label>SOP PDF / text</Label>
              <Input value={sopName} onChange={(e) => setSopName(e.target.value)} placeholder="SOP Name" />
              <Input value={sopAssetType} onChange={(e) => setSopAssetType(e.target.value)} placeholder="Asset Type" />
              <Input
                type="file"
                onChange={(e) => {
                  setSopFile(e.target.files?.[0] || null);
                  setSopUploaded(false);
                }}
              />
              <Button className="w-full" onClick={uploadSop} disabled={loading || !sopFile}>
                {sopUploaded ? "Uploaded" : "Upload SOP"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Knowledge Query</CardTitle>
            <CardDescription>Ask deterministic questions with evidence and confidence scoring.</CardDescription>
          </CardHeader>
          <CardContent className="grid lg:grid-cols-4 gap-4">
            <Input value={assetId} onChange={(e) => setAssetId(e.target.value)} placeholder="Asset ID (e.g. MOTOR-1)" />
            <Input value={failureMode} onChange={(e) => setFailureMode(e.target.value)} placeholder="Detected failure (optional)" />
            <Button onClick={loadKnowledge} disabled={loading}>
              Load Twin
            </Button>
            <Button variant="outline" onClick={runQuery} disabled={loading}>
              Run Query
            </Button>
            <div className="lg:col-span-4">
              <Textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} />
            </div>
            <div className="lg:col-span-4 rounded-md border border-slate-200 p-3 bg-white">
              <div className="flex flex-wrap items-center gap-4">
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={memoryPersistenceEnabled}
                    onChange={(e) => setMemoryPersistenceEnabled(e.target.checked)}
                  />
                  Activate persistence memory
                </Label>
                <Label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={memoryUseAssetHistory}
                    onChange={(e) => setMemoryUseAssetHistory(e.target.checked)}
                    disabled={!memoryPersistenceEnabled}
                  />
                  Use historical saved data by asset
                </Label>
                <Button variant="outline" onClick={applyMemoryConfig} disabled={memoryConfigLoading}>
                  {memoryConfigLoading ? "Applying..." : "Apply Memory Settings"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-slate-200">
            <CardHeader>
              <CardTitle>Failure Knowledge Graph</CardTitle>
              <CardDescription>Asset → Failure Mode → Root Cause → Corrective Action</CardDescription>
            </CardHeader>
            <CardContent>
              <svg ref={svgRef} width={720} height={360} className="w-full h-[360px] rounded-md border border-slate-200 bg-white" />
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle>Confidence Gauge</CardTitle>
              <CardDescription>Deterministic confidence derived from historical outcomes.</CardDescription>
            </CardHeader>
            <CardContent className="h-[360px]">
              <ResponsiveContainer width="100%" height="75%">
                <RadialBarChart data={gaugeData} innerRadius="60%" outerRadius="100%" startAngle={180} endAngle={0}>
                  <RadialBar dataKey="value" fill="#1e8e3e" background />
                  <Tooltip />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="text-center text-3xl font-semibold text-slate-900">{confidencePct}%</div>
              <div className="text-center text-sm text-slate-600 mt-1">{recommendation?.risk?.risk_level || "No risk profile loaded"}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2 border-slate-200">
            <CardHeader>
              <CardTitle>Incident Timeline</CardTitle>
              <CardDescription>Trend of incidents and unresolved events over time.</CardDescription>
            </CardHeader>
            <CardContent className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineRows}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="incidents" stroke="#0ea5e9" strokeWidth={2} />
                  <Line type="monotone" dataKey="unresolved" stroke="#dc2626" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <div className="space-y-4">
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>Leading Failure Causes</CardTitle>
                <CardDescription>Top causes from current query evidence and history.</CardDescription>
              </CardHeader>
              <CardContent className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={leadingCauseRows}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="cause" angle={-25} textAnchor="end" interval={0} height={80} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#dc2626" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle>SOP Decision Tree</CardTitle>
                <CardDescription>Matched SOP guidance for selected failure context.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 max-h-[280px] overflow-y-auto">
                {matchedSops.length === 0 && <p className="text-sm text-slate-600">No SOP matches yet.</p>}
                {matchedSops.map((sop) => (
                  <div key={sop.sop_name} className="rounded-md border border-slate-200 p-3">
                    <p className="font-medium text-slate-900">{sop.sop_name}</p>
                    {(sop.steps || []).slice(0, 5).map((step: any) => (
                      <p key={`${sop.sop_name}-${step.id || step.step_number}`} className="text-sm text-slate-700 mt-1">
                        {step.step_number}. {step.instruction}
                      </p>
                    ))}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Industrial AI Co-Pilot (Top Upgrade 1 + 2)</CardTitle>
            <CardDescription>
              Ingest live-like process stream, detect drift + top drivers, then generate guardrailed prescriptive setpoint actions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid lg:grid-cols-5 gap-3">
              <Input
                type="file"
                className="lg:col-span-2"
                onChange={(e) => setIndustrialFile(e.target.files?.[0] || null)}
              />
              <Input value={industrialStreamName} onChange={(e) => setIndustrialStreamName(e.target.value)} placeholder="Stream name" />
              <Input value={industrialTarget} onChange={(e) => setIndustrialTarget(e.target.value)} placeholder="Target column" />
              <Input value={industrialTimestamp} onChange={(e) => setIndustrialTimestamp(e.target.value)} placeholder="Timestamp column" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button onClick={uploadIndustrialStream} disabled={loading || !industrialFile}>Upload Stream</Button>
              <Button variant="outline" onClick={refreshIndustrialInsights} disabled={loading || !industrialStream?.stream_id}>
                Refresh Drift + Drivers
              </Button>
              <Button
                variant={prescriptiveObjective === "maximize" ? "default" : "outline"}
                onClick={() => setPrescriptiveObjective("maximize")}
              >
                Maximize Target
              </Button>
              <Button
                variant={prescriptiveObjective === "minimize" ? "default" : "outline"}
                onClick={() => setPrescriptiveObjective("minimize")}
              >
                Minimize Target
              </Button>
              <Button onClick={runPrescriptive} disabled={loading || !industrialStream?.stream_id}>
                Run Prescriptive
              </Button>
            </div>
            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Live Drift Score</CardTitle>
                  <CardDescription>Recent window vs historical baseline</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-semibold text-slate-900">
                    {Math.round(Number(industrialDrift?.drift?.drift_score || 0) * 100)}%
                  </div>
                  <p className="text-xs text-slate-600 mt-1">
                    Top drift: {(industrialDrift?.drift?.top_drift_columns || []).slice(0, 3).join(", ") || "N/A"}
                  </p>
                </CardContent>
              </Card>
              <Card className="lg:col-span-2 border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Top Driver Variables</CardTitle>
                  <CardDescription>Lag-aware feature ranking for target influence</CardDescription>
                </CardHeader>
                <CardContent className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={driverRows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="variable" angle={-20} textAnchor="end" interval={0} height={70} />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="importance" fill="#1e8e3e" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
            {prescriptiveResult && (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <p className="text-sm font-medium text-slate-900">Prescriptive Actions (Guardrailed)</p>
                <p className="text-xs text-slate-600 mt-1">
                  Predicted target delta: {prescriptiveResult.predicted_total_target_delta} | Confidence:{" "}
                  {Math.round((prescriptiveResult.confidence || 0) * 100)}%
                </p>
                <div className="mt-2 space-y-1">
                  {(prescriptiveResult.recommendations || []).slice(0, 5).map((item: any, idx: number) => (
                    <p key={idx} className="text-sm text-slate-700">
                      {idx + 1}. {String(item.action || item.variable)} (delta {String(item.expected_target_delta ?? 0)})
                    </p>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>No-Code Digital Twin (Top Upgrade 3)</CardTitle>
            <CardDescription>Define nodes/edges and run what-if scenarios instantly.</CardDescription>
          </CardHeader>
          <CardContent className="grid lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Twin JSON (nodes, edges, scenarios)</Label>
              <Textarea rows={16} value={twinInput} onChange={(e) => setTwinInput(e.target.value)} />
              <Button onClick={runTwinSimulation} disabled={loading}>Run Twin Simulation</Button>
            </div>
            <div className="space-y-3">
              <Card className="border-slate-200">
                <CardHeader>
                  <CardTitle className="text-base">Scenario Sink Output Comparison</CardTitle>
                </CardHeader>
                <CardContent className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={twinScenarioRows}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="sink_total" fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <div className="rounded-md border border-slate-200 bg-white p-3 max-h-[220px] overflow-y-auto">
                <p className="text-sm font-medium text-slate-900">Baseline Outputs</p>
                <pre className="text-xs text-slate-700 whitespace-pre-wrap mt-2">
                  {JSON.stringify(twinResult?.baseline?.outputs || {}, null, 2)}
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>AI Explanation Panel</CardTitle>
            <CardDescription>Deterministic answer + chat memory grounded on uploaded evidence.</CardDescription>
          </CardHeader>
          <CardContent className="grid lg:grid-cols-2 gap-4">
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Question Asked</p>
              <p className="text-sm text-slate-800 mt-1">{queryResponse?.question || question}</p>
              <p className="text-sm font-medium text-slate-900">Summary</p>
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">
                {queryResponse?.ai_summary || recommendation?.ai_summary || "No summary generated yet."}
              </p>
              <div className="mt-3 text-xs text-slate-700 space-y-1">
                <p><strong>Recommended action:</strong> {chosenAction}</p>
                <p><strong>Confidence:</strong> {confidencePct}%</p>
                <p><strong>Evidence records:</strong> {evidenceCount}</p>
              </div>
            </div>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-900">Knowledge Chat</p>
                <Button variant="outline" size="sm" onClick={resetChat}>Reset</Button>
              </div>
              <div className="mt-2 space-y-2 max-h-[180px] overflow-y-auto rounded border border-slate-200 p-2">
                {chatMessages.length === 0 && <p className="text-xs text-slate-500">No chat yet. Ask a follow-up question below.</p>}
                {chatMessages.map((msg, idx) => (
                  <div key={`${msg.role}-${idx}`} className="text-xs">
                    <div className="font-semibold text-slate-700">{msg.role === "user" ? "You" : "Assistant"}</div>
                    <div className="text-slate-700 whitespace-pre-wrap">{msg.content}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask follow-up with memory (e.g., exclude unknown and compare by asset)"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      sendChat();
                    }
                  }}
                />
                <Button onClick={sendChat} disabled={loading || !chatInput.trim()}>
                  Send
                </Button>
              </div>
              <div className="mt-2 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveChatSessionToMemory}
                  disabled={savingChat || !chatSessionId || chatMessages.length === 0}
                >
                  {savingChat ? "Saving..." : "Save Chat to Persistent Memory"}
                </Button>
              </div>
              <div className="mt-3">
                <p className="text-sm font-medium text-slate-900">Evidence Trace</p>
                <div className="mt-2 space-y-2 max-h-[110px] overflow-y-auto">
                  {(queryResponse?.evidence || recommendation?.evidence || []).slice(0, 10).map((item: any, index) => (
                    <div key={`${item.incident_id || index}`} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">Incident {item.incident_id || "-"}</Badge>
                        <span>{String(item.failure_mode || "unknown")}</span>
                        <span>→</span>
                        <span>{String(item.corrective_action || "none")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle>Python Agent Runner</CardTitle>
            <CardDescription>Run Python scripts from AI output and view generated plots/output in this window.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={10}
              value={pythonCode}
              onChange={(e) => setPythonCode(e.target.value)}
              placeholder="Paste or generate Python code from chat, then run it here."
            />
            <div className="flex justify-end">
              <Button onClick={runPythonAgent} disabled={pythonRunning || !pythonCode.trim()}>
                {pythonRunning ? "Running..." : "Run Python Agent"}
              </Button>
            </div>
            {pythonResult && (
              <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3">
                <div>
                  <p className="text-xs text-slate-500">STDOUT</p>
                  <pre className="text-xs whitespace-pre-wrap text-slate-800">{pythonResult.stdout || "(empty)"}</pre>
                </div>
                {pythonResult.stderr && (
                  <div>
                    <p className="text-xs text-red-600">STDERR</p>
                    <pre className="text-xs whitespace-pre-wrap text-red-700">{pythonResult.stderr}</pre>
                  </div>
                )}
                {(pythonResult.images || []).length > 0 && (
                  <div className="grid md:grid-cols-2 gap-3">
                    {pythonResult.images.map((img) => (
                      <div key={img.filename} className="rounded border border-slate-200 p-2">
                        <p className="text-xs text-slate-600 mb-1">{img.filename}</p>
                        <img src={img.data_uri} alt={img.filename} className="w-full rounded" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
