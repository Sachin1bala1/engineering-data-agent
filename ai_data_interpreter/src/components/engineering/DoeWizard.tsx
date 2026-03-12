import React, { useMemo, useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { engineeringApi } from "@/lib/engineering-api";
import type {
  DOEWizardFactor,
  DOEWizardDesignResponse,
  DOEWizardRecommendResponse,
  DOEWizardAnalyzeResponse,
} from "@/types/engineering-api";
import {
  Sparkles,
  Target,
  Sliders,
  Wand2,
  Table as TableIcon,
  Upload,
  BarChart3,
  HelpCircle,
  GraduationCap,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ScatterChart, Scatter, CartesianGrid, ReferenceLine, ZAxis } from "recharts";
import * as XLSX from "xlsx";

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

const GOALS = [
  { id: "optimize", label: "Optimize", desc: "Find the best settings fast." },
  { id: "reduce defects", label: "Reduce Defects", desc: "Lower defect rate or scrap." },
  { id: "maximize yield", label: "Maximize Yield", desc: "Boost output or throughput." },
  { id: "explore unknowns", label: "Explore Unknowns", desc: "Learn what matters most." },
];

const METHODS = [
  { id: "full_factorial", label: "Full Factorial", hint: "All combinations. Best for few factors." },
  { id: "fractional_factorial", label: "Fractional Factorial", hint: "Fewer runs, some interactions confounded." },
  { id: "taguchi", label: "Taguchi (Orthogonal Arrays)", hint: "Robust, industry-friendly." },
  { id: "plackett_burman", label: "Plackett–Burman", hint: "Screen many factors quickly." },
  { id: "response_surface", label: "Response Surface (CCD)", hint: "Optimize with curvature." },
  { id: "box_behnken", label: "Box–Behnken", hint: "Quadratic optimization with fewer runs." },
  { id: "sequential", label: "Sequential DOE", hint: "Adaptive next experiments." },
  { id: "bayesian_optimization", label: "Bayesian Optimization", hint: "AI-guided search." },
];

const RUN_BUDGET_OPTIONS = [
  { value: "8", label: "8 runs" },
  { value: "12", label: "12 runs" },
  { value: "16", label: "16 runs" },
  { value: "24", label: "24 runs" },
  { value: "32", label: "32 runs" },
  { value: "64", label: "64 runs" },
  { value: "128", label: "128 runs" },
];

const TEMPLATES = [
  {
    id: "manufacturing",
    label: "Manufacturing",
    goal: "reduce defects",
    factors: [
      { name: "Temperature", low: 120, high: 180 },
      { name: "Speed", low: 5, high: 15 },
      { name: "Pressure", low: 2, high: 5 },
    ],
  },
  {
    id: "pharma",
    label: "Pharma",
    goal: "maximize yield",
    factors: [
      { name: "Mixing Speed", low: 200, high: 800 },
      { name: "pH", low: 6.5, high: 7.5 },
      { name: "Temperature", low: 20, high: 30 },
    ],
  },
  {
    id: "battery",
    label: "Battery Coating",
    goal: "reduce defects",
    factors: [
      { name: "Coating Speed", low: 5, high: 15 },
      { name: "Solvent Ratio", low: 10, high: 30 },
      { name: "Oven Temp", low: 120, high: 180 },
    ],
  },
  {
    id: "semiconductor",
    label: "Semiconductor",
    goal: "optimize",
    factors: [
      { name: "Etch Time", low: 30, high: 90 },
      { name: "RF Power", low: 100, high: 300 },
      { name: "Gas Flow", low: 50, high: 150 },
    ],
  },
];

export function DoeWizard() {
  const [step, setStep] = useState<WizardStep>(1);
  const [mode, setMode] = useState<"design" | "analysis">("design");
  const [goal, setGoal] = useState<string>(GOALS[0].id);
  const [budget, setBudget] = useState("medium");
  const [skillLevel, setSkillLevel] = useState("beginner");
  const [interactions, setInteractions] = useState("yes");
  const [nonlinearity, setNonlinearity] = useState("yes");
  const [runBudget, setRunBudget] = useState("32");
  const [continuousFactors, setContinuousFactors] = useState("yes");
  const [noiseLevel, setNoiseLevel] = useState("low");
  const [factors, setFactors] = useState<DOEWizardFactor[]>([
    { name: "Temperature", low: 120, high: 180 },
    { name: "Speed", low: 5, high: 15 },
  ]);
  const [recommendation, setRecommendation] = useState<DOEWizardRecommendResponse | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<string>("response_surface");
  const [matrix, setMatrix] = useState<DOEWizardDesignResponse | null>(null);
  const [replicates, setReplicates] = useState(1);
  const [centerPoints, setCenterPoints] = useState(0);
  const [resultsFile, setResultsFile] = useState<File | null>(null);
  const [responseColumn, setResponseColumn] = useState<string>("response");
  const [resultColumns, setResultColumns] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState<DOEWizardAnalyzeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [analysisResponses, setAnalysisResponses] = useState<Array<{ id: string; columnName: string; isCustom: boolean }>>([
    { id: "response-1", columnName: "response", isCustom: false },
  ]);
  const [analysisByResponse, setAnalysisByResponse] = useState<Record<string, DOEWizardAnalyzeResponse>>({});
  const [selectedAnalysisResponse, setSelectedAnalysisResponse] = useState<string>("response");
  const [analysisFactors, setAnalysisFactors] = useState<Array<{ id: string; factorName: string; columnName: string }>>([]);
  const [chatQuestion, setChatQuestion] = useState("");
  const [chatAnswer, setChatAnswer] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [cleanInfo, setCleanInfo] = useState<{ cleaned: number; dropped: number } | null>(null);
  const [leverageCutoff, setLeverageCutoff] = useState<number | null>(null);
  const [cooksCutoff, setCooksCutoff] = useState<number | null>(null);
  const [stdResidCutoff, setStdResidCutoff] = useState<number | null>(null);
  const [includeInteractions, setIncludeInteractions] = useState(true);
  const storageRef = useRef(false);
  const STORAGE_KEY = "doe_wizard_state_v1";

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        storageRef.current = true;
        return;
      }
      const saved = JSON.parse(raw);
      if (saved.goal) setGoal(saved.goal);
      if (saved.budget) setBudget(saved.budget);
      if (saved.skillLevel) setSkillLevel(saved.skillLevel);
      if (saved.interactions) setInteractions(saved.interactions);
      if (saved.nonlinearity) setNonlinearity(saved.nonlinearity);
      if (saved.runBudget) setRunBudget(saved.runBudget);
      if (saved.continuousFactors) setContinuousFactors(saved.continuousFactors);
      if (saved.noiseLevel) setNoiseLevel(saved.noiseLevel);
      if (Array.isArray(saved.factors)) setFactors(saved.factors);
      if (saved.selectedMethod) setSelectedMethod(saved.selectedMethod);
      if (saved.replicates) setReplicates(saved.replicates);
      if (saved.centerPoints !== undefined) setCenterPoints(saved.centerPoints);
      if (saved.matrix) setMatrix(saved.matrix);
      if (saved.mode) setMode(saved.mode);
      if (saved.step) setStep(saved.step);
      if (saved.includeInteractions !== undefined) setIncludeInteractions(saved.includeInteractions);
    } catch {
      // ignore corrupted storage
    } finally {
      storageRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!storageRef.current) return;
    const payload = {
      goal,
      budget,
      skillLevel,
      interactions,
      nonlinearity,
      runBudget,
      continuousFactors,
      noiseLevel,
      factors,
      selectedMethod,
      replicates,
      centerPoints,
      matrix,
      mode,
      step,
      includeInteractions,
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }, [goal, budget, skillLevel, interactions, nonlinearity, runBudget, continuousFactors, noiseLevel, factors, selectedMethod, replicates, centerPoints, matrix, mode, step, includeInteractions]);

  const stepProgress = (step / 6) * 100;

  const switchMode = (next: "design" | "analysis") => {
    setMode(next);
    setStep((prev) => {
      if (next === "analysis") return prev < 5 ? 5 : prev;
      return prev <= 4 ? prev : 1;
    });
  };

  const handleTemplate = (id: string) => {
    const template = TEMPLATES.find((t) => t.id === id);
    if (!template) return;
    setGoal(template.goal);
    setFactors(template.factors);
  };

  const handleAddFactor = () => {
    setFactors((prev) => [...prev, { name: "", low: 0, high: 1 }]);
  };

  const handleRemoveFactor = (idx: number) => {
    setFactors((prev) => prev.filter((_, i) => i !== idx));
  };

  const factorCount = factors.filter((f) => f.name).length;
  const estimatedRuns = useMemo(() => {
    if (selectedMethod !== "full_factorial") return null;
    const levels = factors.map((f) => (f.levels?.length ? f.levels.length : 2));
    if (!levels.length) return null;
    const base = levels.reduce((acc, l) => acc * l, 1);
    return base * Math.max(1, replicates) + Math.max(0, centerPoints);
  }, [factors, selectedMethod, replicates, centerPoints]);

  const mainEffectsData = useMemo(() => {
    if (!analysis?.analysis?.main_effects) return [];
    const effects = analysis.analysis.main_effects as Record<string, Array<Record<string, unknown>>>;
    const entries: Array<{ name: string; effect: number }> = [];
    Object.entries(effects).forEach(([name, rows]) => {
      if (!rows?.length) return;
      const values = rows.map((r) => Number((r as any)[analysis.response_column] ?? 0));
      const effect = values.length ? Math.max(...values) - Math.min(...values) : 0;
      entries.push({ name, effect: Number(effect.toFixed(3)) });
    });
    return entries;
  }, [analysis]);

  const anovaRows = (analysis?.analysis?.anova as Array<Record<string, unknown>>) || [];

  const correlation = (analysis?.analysis as any)?.correlation;
  const regression = (analysis?.analysis as any)?.regression;
  const regressionPoints = (regression?.predicted_vs_actual || []) as Array<{ actual: number; predicted: number; residual: number }>;
  const aiSummary = (analysis?.analysis as any)?.ai_summary as string | undefined;
  const diagnostics = (analysis?.analysis as any)?.diagnostics as any;
  useEffect(() => {
    const t = diagnostics?.thresholds;
    if (!t) return;
    setLeverageCutoff(t.leverage ?? null);
    setCooksCutoff(t.cooks ?? null);
    setStdResidCutoff(t.std_resid ?? null);
  }, [diagnostics?.thresholds]);

  const plotExplanations = (analysis?.analysis as any)?.plot_explanations as any;

  const qqLine = (() => {
    const qq = diagnostics?.qq || [];
    if (!qq.length) return null;
    const xs = qq.map((p: any) => p.theoretical);
    const ys = qq.map((p: any) => p.residual);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const min = Math.min(minX, minY);
    const max = Math.max(maxX, maxY);
    return [{ x: min, y: min }, { x: max, y: max }];
  })();
  const residualHistogram = (() => {
    const points = diagnostics?.residuals_vs_fitted || [];
    if (!points.length) return [];
    const residuals = points.map((p: any) => p.residual);
    const min = Math.min(...residuals);
    const max = Math.max(...residuals);
    const bins = 10;
    const width = (max - min) || 1;
    const bucketSize = width / bins;
    const counts = Array.from({ length: bins }, (_, i) => ({
      bin: (min + i * bucketSize + bucketSize / 2),
      count: 0,
    }));
    residuals.forEach((r: number) => {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((r - min) / bucketSize)));
      counts[idx].count += 1;
    });
    return counts;
  })();

  const corrColor = (value: number) => {
    const v = Math.max(-1, Math.min(1, value || 0));
    const intensity = Math.round(Math.abs(v) * 200);
    if (v >= 0) return `rgb(${255 - intensity}, ${255 - intensity}, 255)`;
    return `rgb(255, ${255 - intensity}, ${255 - intensity})`;
  };

  const handleRecommend = async () => {
    setError(null);
    setIsBusy(true);
    try {
      const numericRunBudget = Math.max(1, Number(runBudget) || 32);
      const rec = await engineeringApi.recommendDoe({
        goal,
        factors: factorCount,
        budget,
        skill_level: skillLevel,
        interactions,
        nonlinearity,
        run_budget: numericRunBudget,
        continuous: continuousFactors === "yes",
        noise: noiseLevel,
      });
      setRecommendation(rec);
      setSelectedMethod(rec.method);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleGenerateMatrix = async () => {
    setError(null);
    setIsBusy(true);
    try {
      const invalid = factors.some((f) => !f.name || (!f.levels && (f.low === undefined || f.high === undefined)));
      if (invalid) {
        setError("Please fill in every factor name and its low/high values.");
        return;
      }
      const res = await engineeringApi.generateDoeDesign({
        method: selectedMethod,
        factors,
        center_points: centerPoints,
        replicates,
      });
      setMatrix(res);
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleDownloadMatrix = (format: "xlsx" | "csv") => {
    if (!matrix) return;
    const responseHeader = "Response";
    const rows = matrix.matrix.map((row) => ({
      ...row,
      [responseHeader]: "",
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows, { header: [...matrix.columns, responseHeader] });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "DOE");
    if (format === "xlsx") {
      XLSX.writeFile(workbook, "doe_experiment_sheet.xlsx");
      return;
    }
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "doe_experiment_sheet.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAnalyze = async () => {
    if (!resultsFile) return;
    setError(null);
    const responseColumns = Array.from(
      new Set(
        analysisResponses
          .map((row) => row.columnName.trim())
          .filter(Boolean)
      )
    );
    if (!responseColumns.length) {
      setError("Please add at least one response column.");
      return;
    }
    if (!analysisFactors.length) {
      setError("Please add at least one factor mapping.");
      return;
    }
    setIsBusy(true);
    try {
      const mappedFactors = analysisFactors
        .filter((row) => row.factorName.trim() && row.columnName.trim())
        .map((row) => {
          const source = factors.find((f) => f.name === row.factorName);
          return {
            name: row.columnName,
            low: source?.low,
            high: source?.high,
            levels: source?.levels,
          };
        });
      if (!mappedFactors.length) {
        setError("Please provide valid factor-to-column mappings.");
        setIsBusy(false);
        return;
      }
      const nextByResponse: Record<string, DOEWizardAnalyzeResponse> = {};
      for (const response of responseColumns) {
        const formData = new FormData();
        formData.append("results_file", resultsFile, resultsFile.name);
        formData.append("response_column", response);
        formData.append("include_interactions", String(includeInteractions));
        formData.append("factors_json", JSON.stringify(mappedFactors));
        const res = await engineeringApi.analyzeDoeResults(formData);
        nextByResponse[response] = res;
      }
      const firstResponse = responseColumns[0];
      setAnalysisByResponse(nextByResponse);
      setSelectedAnalysisResponse(firstResponse);
      setResponseColumn(firstResponse);
      setAnalysis(nextByResponse[firstResponse]);
      setStep(6);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const handleChat = async () => {
    if (!chatQuestion.trim()) return;
    setIsBusy(true);
    try {
      const res = await engineeringApi.chatDoe({
        question: chatQuestion,
        context: { goal, factors, selectedMethod },
      });
      let answer = String(res.answer ?? "");
      try {
        const parsed = JSON.parse(answer);
        if (parsed && typeof parsed === "object" && typeof (parsed as { answer?: unknown }).answer === "string") {
          answer = (parsed as { answer: string }).answer;
        }
      } catch {
        // answer is already plain text
      }
      setChatAnswer(answer);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  const formatTutorAnswer = (raw: string): string => {
    let text = String(raw || "").trim();
    if (!text) return "";
    if (text.startsWith("{") && text.includes('"answer"')) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && typeof (parsed as { answer?: unknown }).answer === "string") {
          text = (parsed as { answer: string }).answer;
        }
      } catch {
        // keep raw
      }
    }
    return text
      .replace(/\\"/g, "\"")
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\r\n/g, "\n")
      .trim();
  };

  const buildInitialAnalysisFactors = (cols: string[], nextResponseColumn: string) => {
    const designMatches = factors
      .filter((f) => Boolean(f.name) && cols.includes(f.name))
      .map((f, idx) => ({
        id: `${Date.now()}-design-${idx}`,
        factorName: f.name,
        columnName: f.name,
      }));
    if (designMatches.length) return designMatches;

    const candidateCols = cols.filter((col) => col !== nextResponseColumn);
    if (!candidateCols.length) return [];
    return candidateCols.slice(0, Math.min(2, candidateCols.length)).map((col, idx) => ({
      id: `${Date.now()}-auto-${idx}`,
      factorName: col,
      columnName: col,
    }));
  };

  const handleResultsFile = async (file: File | null, opts?: { preserveCleanInfo?: boolean }) => {
    setResultsFile(file);
    setResultColumns([]);
    setAnalysisFactors([]);
    setAnalysisByResponse({});
    if (!opts?.preserveCleanInfo) {
      setCleanInfo(null);
    }
    if (!file) return;
    try {
      if (file.name.toLowerCase().endsWith(".csv")) {
        const text = await file.text();
        const firstLine = text.split(/\r?\n/)[0] || "";
        const cols = firstLine.split(",").map((c) => c.trim()).filter(Boolean);
        setResultColumns(cols);
        let nextResponse = responseColumn;
        if (cols.length && !cols.includes(responseColumn)) {
          nextResponse = cols[cols.length - 1];
          setResponseColumn(nextResponse);
        }
        setAnalysisResponses([{ id: `${Date.now()}-response-0`, columnName: nextResponse, isCustom: false }]);
        setSelectedAnalysisResponse(nextResponse);
        setAnalysisFactors(buildInitialAnalysisFactors(cols, nextResponse));
        return;
      }
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
      const header = (rows[0] as Array<any>) || [];
      const cols = header.map((c) => String(c).trim()).filter(Boolean);
      setResultColumns(cols);
      let nextResponse = responseColumn;
      if (cols.length && !cols.includes(responseColumn)) {
        nextResponse = cols[cols.length - 1];
        setResponseColumn(nextResponse);
      }
      setAnalysisResponses([{ id: `${Date.now()}-response-0`, columnName: nextResponse, isCustom: false }]);
      setSelectedAnalysisResponse(nextResponse);
      setAnalysisFactors(buildInitialAnalysisFactors(cols, nextResponse));
    } catch {
      setResultColumns([]);
      setAnalysisFactors([]);
    }
  };

  const handleCleanResults = async () => {
    if (!resultsFile) return;
    setError(null);
    setIsBusy(true);
    try {
      const formData = new FormData();
      formData.append("results_file", resultsFile, resultsFile.name);
      const res = await engineeringApi.cleanDoeResults(formData);
      const binary = Uint8Array.from(atob(res.file_base64), (c) => c.charCodeAt(0));
      const cleanedFile = new File([binary], res.filename, { type: "text/csv" });
      setCleanInfo({ cleaned: res.cleaned_rows, dropped: res.dropped_rows });
      await handleResultsFile(cleanedFile, { preserveCleanInfo: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border-2 border-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            DOE Wizard (Beginner Friendly)
          </CardTitle>
          <CardDescription>Simple steps, enterprise-grade results.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Step {step} of 6</span>
            <span>{Math.round(stepProgress)}% complete</span>
          </div>
          <Progress value={stepProgress} />
          <div className="flex flex-wrap gap-2">
            {(["1", "2", "3", "4", "5", "6"] as const).map((s) => (
              <Badge key={s} variant={step === Number(s) ? "default" : "secondary"}>
                Step {s}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project Workspace</CardTitle>
          <CardDescription>Choose where you want to work today.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button
            variant={mode === "design" ? "default" : "outline"}
            onClick={() => switchMode("design")}
          >
            Design DOE (Steps 1?4)
          </Button>
          <Button
            variant={mode === "analysis" ? "default" : "outline"}
            onClick={() => switchMode("analysis")}
          >
            Analyze Results (Steps 5?6)
          </Button>
          <div className="text-xs text-muted-foreground self-center">
            You can return later and go straight to Analysis.
          </div>
        </CardContent>
      </Card>

      {mode === "design" && step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Step 1: Define Your Goal
            </CardTitle>
            <CardDescription>Pick the outcome you care about most.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3">
              {GOALS.map((g) => (
                <button
                  key={g.id}
                  className={`border rounded-lg p-4 text-left ${goal === g.id ? "border-primary bg-primary/5" : "border-muted"}`}
                  onClick={() => setGoal(g.id)}
                >
                  <div className="font-medium">{g.label}</div>
                  <div className="text-xs text-muted-foreground">{g.desc}</div>
                </button>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Budget</div>
                <Select value={budget} onValueChange={setBudget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select budget" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Skill Level</div>
                <Select value={skillLevel} onValueChange={setSkillLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select skill level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="engineer">Engineer</SelectItem>
                    <SelectItem value="expert">Expert</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Run Budget (max runs)</div>
                <Select value={runBudget} onValueChange={setRunBudget}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select max runs" />
                  </SelectTrigger>
                  <SelectContent>
                    {RUN_BUDGET_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Interaction Expected</div>
                <Select value={interactions} onValueChange={setInteractions}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select interaction expectation" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Continuous Factors</div>
                <Select value={continuousFactors} onValueChange={setContinuousFactors}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select factor type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No (discrete/categorical)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Nonlinearity Expected</div>
                <Select value={nonlinearity} onValueChange={setNonlinearity}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select nonlinearity" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <div className="text-xs text-muted-foreground">Noise Level (process/material/operator variation)</div>
                <Select value={noiseLevel} onValueChange={setNoiseLevel}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select noise level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "design" && step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Step 2: Factors and Levels
            </CardTitle>
            <CardDescription>Define what you can control.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <Button key={t.id} variant="outline" size="sm" onClick={() => handleTemplate(t.id)}>
                  {t.label} template
                </Button>
              ))}
            </div>
            <div className="overflow-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Factor</th>
                    <th className="p-2 text-left">Low</th>
                    <th className="p-2 text-left">High</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {factors.map((factor, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-2">
                        <Input value={factor.name} onChange={(e) => {
                          const value = e.target.value;
                          setFactors((prev) => prev.map((f, i) => i === idx ? { ...f, name: value } : f));
                        }} placeholder="e.g., Temperature" />
                      </td>
                      <td className="p-2">
                        <Input
                          value={factor.low ?? ""}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setFactors((prev) => prev.map((f, i) => i === idx ? { ...f, low: value } : f));
                          }}
                          placeholder="Low"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          value={factor.high ?? ""}
                          onChange={(e) => {
                            const value = Number(e.target.value);
                            setFactors((prev) => prev.map((f, i) => i === idx ? { ...f, high: value } : f));
                          }}
                          placeholder="High"
                        />
                      </td>
                      <td className="p-2 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveFactor(idx)}>
                          Remove
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => handleDownloadMatrix("xlsx")}>Download DOE Excel</Button>
              <Button variant="outline" onClick={() => handleDownloadMatrix("csv")}>Download DOE CSV</Button>
              <div className="text-xs text-muted-foreground">Fill in the Response column after running experiments.</div>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={handleAddFactor}>Add Factor</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "design" && step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-5 w-5 text-primary" />
              Step 3: Choose DOE Method (AI Recommended)
            </CardTitle>
            <CardDescription>Let AI guide the method selection.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2">
              <Button onClick={handleRecommend} disabled={isBusy}>
                {isBusy ? "Thinking..." : "Ask AI Recommendation"}
              </Button>
              {recommendation && (
                <div className="text-sm text-muted-foreground">
                  <strong>AI Suggests:</strong> {recommendation.method} — {recommendation.plain_english || recommendation.reason}
                </div>
              )}
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Replicates</div>
                <Input
                  type="number"
                  min={1}
                  value={replicates}
                  onChange={(e) => setReplicates(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Center Points</div>
                <Input
                  type="number"
                  min={0}
                  value={centerPoints}
                  onChange={(e) => setCenterPoints(Math.max(0, Number(e.target.value) || 0))}
                />
              </div>
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Estimated Runs</div>
                <div className="text-sm font-medium">
                  {estimatedRuns ?? "Calculated after generate"}
                </div>
              </div>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="grid md:grid-cols-2 gap-3">
              {METHODS.map((m) => (
                <button
                  key={m.id}
                  className={`border rounded-lg p-4 text-left ${selectedMethod === m.id ? "border-primary bg-primary/5" : "border-muted"}`}
                  onClick={() => setSelectedMethod(m.id)}
                >
                  <div className="font-medium">{m.label}</div>
                  <div className="text-xs text-muted-foreground">{m.hint}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleGenerateMatrix} disabled={isBusy}>Generate Matrix</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "design" && step >= 4 && matrix && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TableIcon className="h-5 w-5 text-primary" />
              Step 4: Experiment Matrix
            </CardTitle>
            <CardDescription>Run these experiments in order (or randomize).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-auto border rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    {matrix.columns.map((col) => (
                      <th key={col} className="p-2 text-left">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrix.matrix.map((row, idx) => (
                    <tr key={idx} className="border-t">
                      {matrix.columns.map((col) => (
                        <td key={col} className="p-2">
                          {String((row as any)[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => handleDownloadMatrix("xlsx")}>Download DOE Excel</Button>
                <Button variant="outline" onClick={() => handleDownloadMatrix("csv")}>Download DOE CSV</Button>
                <Button onClick={() => setStep(5)}>Next</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "analysis" && step >= 5 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Step 5: Upload Results
            </CardTitle>
            <CardDescription>Upload a CSV/Excel with factor columns + response column.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input type="file" accept=".csv,.xls,.xlsx" onChange={(e) => handleResultsFile(e.target.files?.[0] ?? null)} />
            {resultsFile && (
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={handleCleanResults} disabled={isBusy}>
                  {isBusy ? "Cleaning..." : "Clean Data (remove NaN/inf rows)"}
                </Button>
                {cleanInfo && (
                  <div className="text-xs text-muted-foreground">
                    Cleaned rows: {cleanInfo.cleaned} • Dropped rows: {cleanInfo.dropped}
                  </div>
                )}
              </div>
            )}
            {resultColumns.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Response columns</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAnalysisResponses((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-response-${prev.length + 1}`,
                          columnName: resultColumns[0] || "",
                          isCustom: false,
                        },
                      ])
                    }
                  >
                    Add Response
                  </Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {analysisResponses.map((row) => (
                    <div key={row.id} className="space-y-1 border rounded-md p-3">
                      <select
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white w-full"
                        value={row.isCustom ? "__custom__" : row.columnName}
                        onChange={(e) =>
                          setAnalysisResponses((prev) =>
                            prev.map((item) =>
                              item.id === row.id
                                ? e.target.value === "__custom__"
                                  ? { ...item, isCustom: true, columnName: resultColumns[0] || "" }
                                  : { ...item, isCustom: false, columnName: e.target.value }
                                : item
                            )
                          )
                        }
                      >
                        <option value="" disabled>Select response column</option>
                        {resultColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                        <option value="__custom__">Custom response column...</option>
                      </select>
                      {row.isCustom ? (
                        <Input
                          value={row.columnName}
                          onChange={(e) =>
                            setAnalysisResponses((prev) =>
                              prev.map((item) =>
                                item.id === row.id ? { ...item, columnName: e.target.value } : item
                              )
                            )
                          }
                          placeholder="Enter custom response column"
                        />
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setAnalysisResponses((prev) => prev.filter((item) => item.id !== row.id))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <Input
                value={responseColumn}
                onChange={(e) => {
                  const next = e.target.value;
                  setResponseColumn(next);
                  setAnalysisResponses([{ id: "manual-response", columnName: next, isCustom: true }]);
                }}
                placeholder="response column name"
              />
            )}
            {resultColumns.length ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-xs text-muted-foreground">Map factor names to columns</div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setAnalysisFactors((prev) => [
                        ...prev,
                        {
                          id: `${Date.now()}-${prev.length + 1}`,
                          factorName: `Factor_${prev.length + 1}`,
                          columnName: resultColumns[0] || "",
                        },
                      ])
                    }
                  >
                    Add Factor
                  </Button>
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  {analysisFactors.map((row) => (
                    <div key={row.id} className="space-y-1 border rounded-md p-3">
                      <Input
                        value={row.factorName}
                        onChange={(e) =>
                          setAnalysisFactors((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, factorName: e.target.value } : item
                            )
                          )
                        }
                        placeholder="Factor name"
                      />
                      <select
                        className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white w-full"
                        value={row.columnName}
                        onChange={(e) =>
                          setAnalysisFactors((prev) =>
                            prev.map((item) =>
                              item.id === row.id ? { ...item, columnName: e.target.value } : item
                            )
                          )
                        }
                      >
                        {resultColumns.map((col) => (
                          <option key={col} value={col}>
                            {col}
                          </option>
                        ))}
                      </select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setAnalysisFactors((prev) => prev.filter((item) => item.id !== row.id))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="flex items-center gap-2 text-sm">
              <input
                id="doe-interactions"
                type="checkbox"
                checked={includeInteractions}
                onChange={(e) => setIncludeInteractions(e.target.checked)}
              />
              <label htmlFor="doe-interactions" className="text-sm text-muted-foreground">
                Include interaction terms (advanced)
              </label>
            </div>
            <div className="text-xs text-muted-foreground">
              Need a sample?{" "}
              <a className="underline" href="/doe_examples/battery_example.csv" download>
                Download example dataset
              </a>
            </div>
            {error && <div className="text-sm text-red-600">{error}</div>}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={() => setStep(4)}>Back</Button>
              <Button onClick={handleAnalyze} disabled={!resultsFile || isBusy}>
                {isBusy ? "Analyzing..." : "Run Analysis"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {mode === "analysis" && step === 6 && analysis && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              Step 6: Results
            </CardTitle>
            <CardDescription>Engineering-grade insights in plain English.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {Object.keys(analysisByResponse).length > 1 ? (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">Viewing response</div>
                <select
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white w-full"
                  value={selectedAnalysisResponse}
                  onChange={(e) => {
                    const next = e.target.value;
                    setSelectedAnalysisResponse(next);
                    if (analysisByResponse[next]) {
                      setAnalysis(analysisByResponse[next]);
                      setResponseColumn(next);
                    }
                  }}
                >
                  {Object.keys(analysisByResponse).map((resp) => (
                    <option key={resp} value={resp}>
                      {resp}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {(analysis.analysis as any)?.warnings?.length ? (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                Warnings: {(analysis.analysis as any).warnings.join(", ")}
              </div>
            ) : null}
            {aiSummary ? (
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm">Engineering Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm whitespace-pre-wrap">
                  {aiSummary}
                </CardContent>
              </Card>
            ) : null}
            <div className="grid md:grid-cols-3 gap-3">
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm">Confidence Score</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{analysis.analysis?.confidence ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">Based on model fit + significance</div>
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm">Optimization</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div className="font-medium">Recommended Settings</div>
                  <pre className="text-xs whitespace-pre-wrap">
                    {JSON.stringify(analysis.analysis?.optimization?.recommended_settings, null, 2)}
                  </pre>
                </CardContent>
              </Card>
              <Card className="border-primary/20">
                <CardHeader>
                  <CardTitle className="text-sm">Model Summary</CardTitle>
                </CardHeader>
                <CardContent className="text-sm">
                  <div>R²: {(analysis.analysis?.model_summary?.r2 ?? 0).toFixed?.(3) ?? analysis.analysis?.model_summary?.r2}</div>
                  <div>Adj R²: {(analysis.analysis?.model_summary?.adj_r2 ?? 0).toFixed?.(3) ?? analysis.analysis?.model_summary?.adj_r2}</div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Main Effects (impact size)</h4>
              {plotExplanations?.main_effects ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.main_effects}</div>
              ) : null}
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={mainEffectsData}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="effect" fill="#2563EB" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Correlation Heatmap (Numeric Factors)</h4>
              {correlation ? (
                <div className="overflow-auto border rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left"></th>
                        {correlation.columns.map((col: string) => (
                          <th key={col} className="p-2 text-left">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {correlation.matrix.map((row: number[], rIdx: number) => (
                        <tr key={rIdx} className="border-t">
                          <td className="p-2 font-medium">{correlation.columns[rIdx]}</td>
                          {row.map((value: number, cIdx: number) => (
                            <td
                              key={`${rIdx}-${cIdx}`}
                              className="p-2 text-center"
                              style={{ backgroundColor: corrColor(value) }}
                            >
                              {Number.isFinite(value) ? value.toFixed(2) : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Not enough numeric columns to compute correlations.</div>
              )}
              {plotExplanations?.correlation ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.correlation}</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Regression: Predicted vs Actual</h4>
              {regressionPoints.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis dataKey="predicted" name="Predicted" />
                      <YAxis dataKey="actual" name="Actual" />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={regressionPoints} fill="#16a34a" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Regression output not available.</div>
              )}
              {plotExplanations?.regression ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.regression}</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Regression Equation</h4>
              {regression?.equation ? (
                <div className="text-sm font-mono bg-muted p-2 rounded">{regression.equation}</div>
              ) : (
                <div className="text-sm text-muted-foreground">Equation not available.</div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Regression Coefficients</h4>
              {regression?.coefficients?.length ? (
                <div className="overflow-auto border rounded-lg">
                  <table className="min-w-full text-xs">
                    <thead className="bg-muted">
                      <tr>
                        <th className="p-2 text-left">Term</th>
                        <th className="p-2 text-left">Coef</th>
                        <th className="p-2 text-left">Std Err</th>
                        <th className="p-2 text-left">p-value</th>
                      </tr>
                    </thead>
                    <tbody>
                      {regression.coefficients.map((row: any, idx: number) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">{row.term}</td>
                          <td className="p-2">{row.coef?.toFixed ? row.coef.toFixed(4) : row.coef}</td>
                          <td className="p-2">{row.stderr?.toFixed ? row.stderr.toFixed(4) : row.stderr ?? ""}</td>
                          <td className="p-2">{row.p_value?.toFixed ? row.p_value.toFixed(4) : row.p_value ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Regression coefficients not available.</div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Residuals vs Fitted</h4>
              {diagnostics?.residuals_vs_fitted?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis dataKey="fitted" name="Fitted" />
                      <YAxis dataKey="residual" name="Residual" />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <ReferenceLine y={0} stroke="#999" strokeDasharray="4 4" />
                      {diagnostics?.residuals_vs_fitted_smooth?.length ? (
                        <Scatter data={diagnostics.residuals_vs_fitted_smooth} line={{ stroke: '#0f172a' }} fill="#0f172a" />
                      ) : null}
                      <Scatter data={diagnostics.residuals_vs_fitted} fill="#2563eb" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Residual plot not available.</div>
              )}
              {plotExplanations?.residuals_vs_fitted ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.residuals_vs_fitted}</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Residuals Histogram</h4>
              {residualHistogram.length ? (
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={residualHistogram}>
                      <CartesianGrid />
                      <XAxis dataKey="bin" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill="#0ea5e9" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Residual histogram not available.</div>
              )}
              {plotExplanations?.residuals_vs_fitted ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.residuals_vs_fitted}</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Normal Q-Q Plot</h4>
              {diagnostics?.qq?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis dataKey="theoretical" name="Theoretical Quantile" />
                      <YAxis dataKey="residual" name="Ordered Residual" />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      {qqLine ? <ReferenceLine segment={qqLine} stroke="#999" strokeDasharray="4 4" /> : null}
                      <Scatter data={diagnostics.qq} fill="#f97316" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Q-Q plot not available.</div>
              )}
              {plotExplanations?.qq ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.qq}</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">Leverage / Cook's Distance</h4>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Leverage cutoff</div>
                  <Input
                    type="number"
                    value={leverageCutoff ?? ""}
                    onChange={(e) => setLeverageCutoff(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Cook's D cutoff</div>
                  <Input
                    type="number"
                    value={cooksCutoff ?? ""}
                    onChange={(e) => setCooksCutoff(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-xs text-muted-foreground">Std Residual cutoff</div>
                  <Input
                    type="number"
                    value={stdResidCutoff ?? ""}
                    onChange={(e) => setStdResidCutoff(e.target.value ? Number(e.target.value) : null)}
                  />
                </div>
              </div>
              {diagnostics?.leverage?.length ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart>
                      <CartesianGrid />
                      <XAxis dataKey="leverage" name="Leverage" />
                      <YAxis dataKey="std_resid" name="Std Residual" />
                      <ZAxis dataKey="cooks" range={[40, cooksCutoff ? 280 : 200]} />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      {leverageCutoff ? (
                        <ReferenceLine x={leverageCutoff} stroke="#999" strokeDasharray="4 4" />
                      ) : null}
                      {stdResidCutoff ? (
                        <>
                          <ReferenceLine y={stdResidCutoff} stroke="#999" strokeDasharray="4 4" />
                          <ReferenceLine y={-stdResidCutoff} stroke="#999" strokeDasharray="4 4" />
                        </>
                      ) : null}
                      <Scatter data={diagnostics.leverage} fill="#dc2626" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Leverage/Cook's plot not available.</div>
              )}
              {plotExplanations?.leverage ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.leverage}</div>
              ) : null}
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">ANOVA Table</h4>
              {plotExplanations?.anova ? (
                <div className="text-xs text-muted-foreground">{plotExplanations.anova}</div>
              ) : null}
              <div className="overflow-auto border rounded-lg">
                <table className="min-w-full text-xs">
                  <thead className="bg-muted">
                    <tr>
                      {anovaRows[0] ? Object.keys(anovaRows[0]).map((key) => (
                        <th key={key} className="p-2 text-left">{key}</th>
                      )) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {anovaRows.map((row, idx) => (
                      <tr key={idx} className="border-t">
                        {Object.keys(row).map((key) => (
                          <td key={key} className="p-2">{String((row as any)[key])}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            DOE Tutor
          </CardTitle>
          <CardDescription>Ask questions and get simple explanations.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={chatQuestion} onChange={(e) => setChatQuestion(e.target.value)} placeholder="Ask a DOE question..." />
            <Button onClick={handleChat} disabled={isBusy}>
              <HelpCircle className="h-4 w-4 mr-1" /> Ask
            </Button>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          {chatAnswer && (
            <div className="text-sm bg-muted p-3 rounded leading-7">
              {formatTutorAnswer(chatAnswer).split(/\n{2,}/).map((paragraph, idx) => {
                const trimmed = paragraph.trim();
                if (!trimmed) return null;
                if (/^([*-]|\d+\.)\s+/.test(trimmed)) {
                  const lines = trimmed
                    .split("\n")
                    .map((line) => line.trim())
                    .filter(Boolean);
                  return (
                    <ul key={idx} className="list-disc pl-5 space-y-1 mb-3">
                      {lines.map((line, lineIdx) => (
                        <li key={lineIdx}>{line.replace(/^([*-]|\d+\.)\s+/, "")}</li>
                      ))}
                    </ul>
                  );
                }
                return (
                  <p key={idx} className="mb-3 whitespace-pre-wrap">
                    {trimmed}
                  </p>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
