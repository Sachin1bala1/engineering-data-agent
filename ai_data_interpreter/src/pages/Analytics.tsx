// Analytics.tsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { toast } from '@/components/ui/use-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AiResponseMessage } from '@/components/features/analytics/AiResponseMessage';
import { LinkedDataWorkbench, type OpenEditableChartRequest } from '@/components/features/analytics/LinkedDataWorkbench';
import { ComparePanel } from '@/components/engineering/ComparePanel';
import { AnalyzerPanel } from '@/components/engineering/AnalyzerPanel';
import { DoeWizard } from '@/components/engineering/DoeWizard';
import { EnterpriseAgentsPanel } from '@/components/engineering/EnterpriseAgentsPanel';
import {
  Upload,
  Brain,
  Download,
  Play,
  MessageSquare,
  Table,
  FileText,
  FileSpreadsheet,
  Send,
  GitCompare,
  FlaskConical,
  BarChart3,
  Rocket,
  ChevronDown,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
} from 'lucide-react';

interface SessionData {
  sessionId: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  preview: any[];
}

const sameColumns = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  content: string;
  timestamp: Date;
  type?: 'text' | 'analysis' | 'chart';
  chartData?: string;
}

interface SerializedHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ParsedBinaryRule {
  targetColumn: string;
  sourceColumn: string;
  operator: '>' | '<' | '>=' | '<=' | '==';
  threshold: number;
  trueValue: number;
  falseValue: number;
}

const HISTORY_MESSAGE_LIMIT = 12;

interface SlideContent {
  id: string;
  title: string;
  content: string;		 
  chartPath?: string;
  findings?: string;
  type: 'text' | 'chart' | 'mixed';
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";
const MAX_LINKED_ROWS = 20000;
const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [slides, setSlides] = useState<SlideContent[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [slideTitle, setSlideTitle] = useState('');
  const [slideFindings, setSlideFindings] = useState('');
  const [slideCopilotInput, setSlideCopilotInput] = useState('');
  const [slideCopilotBusy, setSlideCopilotBusy] = useState(false);
  const [dataRows, setDataRows] = useState<any[]>([]);
  const [allDataRows, setAllDataRows] = useState<any[]>([]);
  const [dataOffset, setDataOffset] = useState(0);
  const [dataLimit, setDataLimit] = useState(100);
  const [dataLoading, setDataLoading] = useState(false);
  const [allDataLoading, setAllDataLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [markedRows, setMarkedRows] = useState<number[]>([]);
  const [editedCells, setEditedCells] = useState<Record<string, string>>({});
  const [savingEdits, setSavingEdits] = useState(false);
  const [savingMarks, setSavingMarks] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [formulaInput, setFormulaInput] = useState('');
  const [formulaTargetColumn, setFormulaTargetColumn] = useState('');
  const [formulaNewColumn, setFormulaNewColumn] = useState('');
  const [applyingFormula, setApplyingFormula] = useState(false);
  const [slideRunnerCode, setSlideRunnerCode] = useState('');
  const [slideRunnerOutput, setSlideRunnerOutput] = useState('');
  const [slideRunnerChart, setSlideRunnerChart] = useState<string | null>(null);
  const [slideRunnerChartSpec, setSlideRunnerChartSpec] = useState<any | null>(null);
  const [openEditableChartRequest, setOpenEditableChartRequest] = useState<OpenEditableChartRequest | null>(null);
  const [slideBuilderOpen, setSlideBuilderOpen] = useState(false);
  const [sidePanelCollapsed, setSidePanelCollapsed] = useState(false);
  const [requestInFlight, setRequestInFlight] = useState(false);
  const [requestLabel, setRequestLabel] = useState('');
  const [activeTab, setActiveTab] = useState<'enterprise'|'chat'|'data'|'highsize'|'slides'|'compare'|'analyzer'|'doe'>('chat');
  const [highSessionData, setHighSessionData] = useState<SessionData | null>(null);
  const [highDataRows, setHighDataRows] = useState<any[]>([]);
  const [highAllRows, setHighAllRows] = useState<any[]>([]);
  const [highDataOffset, setHighDataOffset] = useState(0);
  const [highDataLimit, setHighDataLimit] = useState(250);
  const [highStride, setHighStride] = useState(1);
  const [highDataLoading, setHighDataLoading] = useState(false);
  const [highAllDataLoading, setHighAllDataLoading] = useState(false);
  const [highDataError, setHighDataError] = useState<string | null>(null);
  const [highEngine, setHighEngine] = useState<string>('');
  const [highCopilotInput, setHighCopilotInput] = useState('');
  const [highCopilotBusy, setHighCopilotBusy] = useState(false);
  const [highRunnerCode, setHighRunnerCode] = useState('');
  const [highRunnerOutput, setHighRunnerOutput] = useState('');
  const [highRunnerChart, setHighRunnerChart] = useState<string | null>(null);
  const [highRunnerChartSpec, setHighRunnerChartSpec] = useState<any | null>(null);
  const [highUseStandardEndpoint, setHighUseStandardEndpoint] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  const [mainPaneRatio, setMainPaneRatio] = useState<number>(() => {
    if (typeof window === "undefined") return 68;
    const saved = window.localStorage.getItem("analytics_main_pane_ratio");
    const parsed = Number(saved);
    return Number.isFinite(parsed) ? Math.max(45, Math.min(80, parsed)) : 68;
  });
  const highUploadInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const sessionId = useMemo(() => sessionData?.sessionId || "", [sessionData?.sessionId]);
  const displaySession = activeTab === 'highsize' ? highSessionData : sessionData;
  const isHighSizeContext = activeTab === 'highsize';

  const beginCancelableRequest = (label: string) => {
    if (activeAbortRef.current) activeAbortRef.current.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;
    setRequestInFlight(true);
    setRequestLabel(label);
    return controller;
  };

  const endCancelableRequest = (controller: AbortController) => {
    if (activeAbortRef.current === controller) {
      activeAbortRef.current = null;
      setRequestInFlight(false);
      setRequestLabel('');
    }
  };

  const cancelActiveRequest = () => {
    if (!activeAbortRef.current) return;
    activeAbortRef.current.abort();
    activeAbortRef.current = null;
    setRequestInFlight(false);
    setRequestLabel('');
    setIsAnalyzing(false);
    setSlideCopilotBusy(false);
    setAnalysisProgress(0);
    toast({ title: 'Request cancelled', description: 'The active AI/Python request was cancelled.' });
  };

  const resolveColumnName = (candidate: string, columns: string[]): string | null => {
    const needle = String(candidate || '').trim().toLowerCase();
    if (!needle) return null;
    const exact = columns.find((c) => c.toLowerCase() === needle);
    return exact || null;
  };

  const extractMentionedColumns = (question: string, columns: string[]): string[] => {
    const lower = (question || '').toLowerCase();
    return columns.filter((c) => lower.includes(c.toLowerCase()));
  };

  const parseBinaryLabelRule = (question: string, columns: string[]): ParsedBinaryRule | null => {
    const q = String(question || '');
    const targetMatch = q.match(/for\s+([A-Za-z_]\w*)\s+column/i);
    const condMatch = q.match(
      /if\s+([A-Za-z_]\w*)\s+(?:is\s+)?(greater than or equal to|less than or equal to|greater than|less than|equal to|equals|>=|<=|>|<|==)\s*(-?\d+(?:\.\d+)?)\s*(?:then|put)?\s*(-?\d+(?:\.\d+)?)\s*else\s*(?:put\s*)?(-?\d+(?:\.\d+)?)/i
    );
    if (!condMatch) return null;

    const sourceColumn = resolveColumnName(condMatch[1], columns);
    if (!sourceColumn) return null;

    let targetColumn = targetMatch ? resolveColumnName(targetMatch[1], columns) || targetMatch[1] : '';
    if (!targetColumn) {
      const newColMatch = q.match(/\b(?:add|create|new)\s+(?:a\s+)?column\s+([A-Za-z_]\w*)/i);
      if (newColMatch) targetColumn = resolveColumnName(newColMatch[1], columns) || newColMatch[1];
    }
    if (!targetColumn) return null;

    const opRaw = condMatch[2].toLowerCase();
    const opMap: Record<string, ParsedBinaryRule['operator']> = {
      '>': '>',
      '<': '<',
      '>=': '>=',
      '<=': '<=',
      '==': '==',
      'greater than': '>',
      'less than': '<',
      'greater than or equal to': '>=',
      'less than or equal to': '<=',
      'equal to': '==',
      'equals': '==',
    };
    const operator = opMap[opRaw];
    if (!operator) return null;

    return {
      targetColumn,
      sourceColumn,
      operator,
      threshold: Number(condMatch[3]),
      trueValue: Number(condMatch[4]),
      falseValue: Number(condMatch[5]),
    };
  };

  const codeMentionsColumn = (code: string, col: string): boolean => {
    const c = (code || '').toLowerCase();
    const colLower = (col || '').toLowerCase();
    if (!colLower) return false;
    return c.includes(colLower);
  };

  const inferEditableChartConfig = (pythonCode: string, columns: string[]) => {
    const code = String(pythonCode || '');
    const lower = code.toLowerCase();
    const titleMatch = code.match(/plt\.title\(\s*['"]([^'"]+)['"]/i);
    const xLabelMatch = code.match(/plt\.xlabel\(\s*['"]([^'"]+)['"]/i);
    const yLabelMatch = code.match(/plt\.ylabel\(\s*['"]([^'"]+)['"]/i);

    let chartType: OpenEditableChartRequest["chartType"] = "bar";
    if (/\bscatter\s*\(/i.test(lower)) chartType = "scatter";
    else if (/\bbar\s*\(/i.test(lower)) chartType = "bar";

    const referencedColumns = Array.from(code.matchAll(/df\[['"]([^'"]+)['"]\]/g))
      .map((m) => String(m[1] || '').trim())
      .filter(Boolean);
    const uniqueRefs = Array.from(new Set(referencedColumns));

    const inferredX = resolveColumnName(xLabelMatch?.[1] || '', columns)
      || resolveColumnName(uniqueRefs[0] || '', columns)
      || columns[0]
      || "";
    let inferredY = resolveColumnName(yLabelMatch?.[1] || '', columns)
      || resolveColumnName(uniqueRefs[1] || '', columns)
      || columns.find((c) => c !== inferredX)
      || columns[0]
      || "";
    if (inferredY === inferredX) {
      inferredY = columns.find((c) => c !== inferredX) || inferredY;
    }

    return {
      title: titleMatch?.[1] || "AI Generated Chart",
      chartType,
      xColumn: inferredX,
      yColumn: inferredY,
      seriesColor: "#2563eb",
    };
  };

  const handleOpenEditableChartTab = () => {
    if (!sessionData || !slideRunnerChart) return;
    const inferred = inferEditableChartConfig(slideRunnerCode, sessionData.columns);
    setActiveTab('data');
    setOpenEditableChartRequest({
      requestId: Date.now(),
      ...inferred,
      sourceImage: slideRunnerChart,
      sourceSpec: slideRunnerChartSpec,
    });
    toast({ title: 'Editable chart tab opened', description: 'A new chart tab was created in Data Preview.' });
  };

  const handleOpenEditableChartTabFromHighSize = () => {
    if (!highSessionData || !highRunnerChart) return;
    const inferred = inferEditableChartConfig(highRunnerCode, highSessionData.columns);
    setActiveTab('highsize');
    setOpenEditableChartRequest({
      requestId: Date.now(),
      ...inferred,
      sourceImage: highRunnerChart,
      sourceSpec: highRunnerChartSpec,
    });
    toast({ title: 'Editable chart tab opened', description: 'A new chart tab was created in High-Size Preview.' });
  };

  const buildHistoryPayload = (source: ChatMessage[]): SerializedHistoryMessage[] => {
    const entries = source
      .filter((msg) => (msg.role === 'user' || msg.role === 'ai') && Boolean(msg.content?.trim()))
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: String(msg.content ?? '').slice(0, 4000),
      }));
    return entries.slice(-HISTORY_MESSAGE_LIMIT);
  };


  useEffect(() => {
    const saved = sessionStorage.getItem('analysisSessionData');
    if (saved) {
      try {
        const data: SessionData = JSON.parse(saved);
        setSessionData(data);

        if (messages.length === 0) {
            const welcomeMessage: ChatMessage = {
                id: Date.now().toString(),
                role: 'ai',
                content: `Hello! I've loaded your file "${data.fileName}" with ${data.rowCount.toLocaleString()} rows and ${data.columns.length} columns. Ask me anything about the data or run the Initial Analysis.`,
                timestamp: new Date(),
                type: 'text'
            };
            setMessages([welcomeMessage]);
        }
      } catch (err) {
        console.error('Failed parsing analysisSessionData from sessionStorage', err);
        sessionStorage.removeItem('analysisSessionData');
        setSessionData(null);
        toast({ title: "Session data corrupted", description: "Please re-upload your file.", variant: "destructive" });
      }
    }
  }, []);

  useEffect(() => {
    const requestedTab = new URLSearchParams(location.search).get('tab');
    const supported = new Set(['enterprise', 'chat', 'data', 'highsize', 'slides', 'compare', 'analyzer', 'doe']);
    if (requestedTab && supported.has(requestedTab)) {
      setActiveTab(requestedTab as typeof activeTab);
      return;
    }
    if (!sessionData && ['chat', 'data', 'slides'].includes(activeTab)) {
      setActiveTab('enterprise');
    }
  }, [location.search, sessionData, activeTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktopLayout(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("analytics_main_pane_ratio", String(mainPaneRatio));
  }, [mainPaneRatio]);

  const startMainPaneResize = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDesktopLayout || sidePanelCollapsed || !workspaceGridRef.current) return;
    event.preventDefault();
    const host = workspaceGridRef.current;
    const rect = host.getBoundingClientRect();

    const onMove = (e: MouseEvent) => {
      const x = e.clientX - rect.left;
      const pct = (x / rect.width) * 100;
      setMainPaneRatio(Math.max(45, Math.min(80, pct)));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchDataPage = async (nextOffset?: number, nextLimit?: number) => {
    if (!sessionData) return;
    const requestedOffset = Math.max(0, nextOffset ?? dataOffset);
    const requestedLimit = Math.max(1, Math.min(2000, nextLimit ?? dataLimit));
    setDataLoading(true);
    setDataError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/session/${encodeURIComponent(sessionData.sessionId)}/data?offset=${requestedOffset}&limit=${requestedLimit}`
      );
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to fetch data preview (${res.status})`);
      }
      const payload = await res.json();
      setDataRows(Array.isArray(payload.rows) ? payload.rows : []);
      setDataOffset(Number(payload.offset || requestedOffset));
      setDataLimit(Number(payload.limit || requestedLimit));
      setMarkedRows(Array.isArray(payload.markedRows) ? payload.markedRows.map((v:any)=>Number(v)) : []);
      setSessionData((prev) => {
        if (!prev) return prev;
        const nextRowCount = Number(payload.totalRows ?? prev.rowCount);
        const nextColumns = Array.isArray(payload.columns) ? payload.columns : prev.columns;
        if (nextRowCount === prev.rowCount && sameColumns(nextColumns, prev.columns)) {
          return prev;
        }
        return {
          ...prev,
          rowCount: nextRowCount,
          columns: nextColumns,
        };
      });
    } catch (err: any) {
      setDataError(err?.message || "Failed to load data preview.");
    } finally {
      setDataLoading(false);
    }
  };

  const fetchAllDataRows = async (maxRows: number = MAX_LINKED_ROWS) => {
    if (!sessionData) return;
    setAllDataLoading(true);
    try {
      const batchSize = 1000;
      let offset = 0;
      let totalRows = Number(sessionData.rowCount || 0);
      const targetRows = Math.max(0, Math.min(totalRows, Number(maxRows || MAX_LINKED_ROWS)));
      const merged: any[] = [];
      while (offset < targetRows) {
        const requested = Math.min(batchSize, targetRows - offset);
        const res = await fetch(
          `${API_BASE}/api/session/${encodeURIComponent(sessionData.sessionId)}/data?offset=${offset}&limit=${requested}`
        );
        if (!res.ok) {
          const txt = await res.text().catch(() => "");
          throw new Error(txt || `Failed to fetch full dataset (${res.status})`);
        }
        const payload = await res.json();
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        merged.push(...rows);
        totalRows = Number(payload.totalRows ?? totalRows);
        offset += rows.length;
        if (!rows.length) break;
      }
      setAllDataRows(merged);
    } catch (err: any) {
      console.error("fetchAllDataRows failed", err);
      setDataError(err?.message || "Failed to load full dataset.");
    } finally {
      setAllDataLoading(false);
    }
  };

  const fetchHighDataPage = async (nextOffset?: number, nextLimit?: number, nextStride?: number) => {
    if (!highSessionData) return;
    const requestedOffset = Math.max(0, nextOffset ?? highDataOffset);
    const requestedLimit = Math.max(1, Math.min(10000, nextLimit ?? highDataLimit));
    const requestedStride = Math.max(1, nextStride ?? highStride);
    setHighDataLoading(true);
    setHighDataError(null);
    try {
      const url = highUseStandardEndpoint
        ? `${API_BASE}/api/session/${encodeURIComponent(highSessionData.sessionId)}/data?offset=${requestedOffset}&limit=${requestedLimit}`
        : `${API_BASE}/api/highsize/session/${encodeURIComponent(highSessionData.sessionId)}/data?offset=${requestedOffset}&limit=${requestedLimit}&stride=${requestedStride}`;
      const res = await fetch(url);
      if (!res.ok) {
        if (!highUseStandardEndpoint && res.status === 404) {
          setHighUseStandardEndpoint(true);
          const fallbackRes = await fetch(
            `${API_BASE}/api/session/${encodeURIComponent(highSessionData.sessionId)}/data?offset=${requestedOffset}&limit=${requestedLimit}`
          );
          if (!fallbackRes.ok) {
            const txt = await fallbackRes.text().catch(() => "");
            throw new Error(txt || `Failed to fetch high-size data (${fallbackRes.status})`);
          }
          const payload = await fallbackRes.json();
          setHighDataRows(Array.isArray(payload.rows) ? payload.rows : []);
          setHighDataOffset(Number(payload.offset || requestedOffset));
          setHighDataLimit(Number(payload.limit || requestedLimit));
          setHighStride(1);
          setHighEngine('pandas_csv (fallback)');
          setHighSessionData((prev) => {
            if (!prev) return prev;
            const nextRowCount = Number(payload.totalRows ?? prev.rowCount);
            const nextColumns = Array.isArray(payload.columns) ? payload.columns : prev.columns;
            if (nextRowCount === prev.rowCount && sameColumns(nextColumns, prev.columns)) return prev;
            return { ...prev, rowCount: nextRowCount, columns: nextColumns };
          });
          return;
        }
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `Failed to fetch high-size data (${res.status})`);
      }
      const payload = await res.json();
      setHighDataRows(Array.isArray(payload.rows) ? payload.rows : []);
      setHighDataOffset(Number(payload.offset || requestedOffset));
      setHighDataLimit(Number(payload.limit || requestedLimit));
      setHighStride(Number(payload.stride || requestedStride));
      setHighEngine(String(payload.engine || ''));
      setHighSessionData((prev) => {
        if (!prev) return prev;
        const nextRowCount = Number(payload.totalRows ?? prev.rowCount);
        const nextColumns = Array.isArray(payload.columns) ? payload.columns : prev.columns;
        if (nextRowCount === prev.rowCount && sameColumns(nextColumns, prev.columns)) return prev;
        return { ...prev, rowCount: nextRowCount, columns: nextColumns };
      });
    } catch (err: any) {
      setHighDataError(err?.message || "Failed to load high-size data preview.");
    } finally {
      setHighDataLoading(false);
    }
  };

  const fetchHighAllRows = async (maxRows: number = MAX_LINKED_ROWS) => {
    if (!highSessionData) return;
    setHighAllDataLoading(true);
    try {
      const batchSize = 2000;
      let offset = 0;
      let totalRows = Number(highSessionData.rowCount || 0);
      const targetRows = Math.max(0, Math.min(totalRows, Number(maxRows || MAX_LINKED_ROWS)));
      const merged: any[] = [];
      while (offset < targetRows) {
        const req = Math.min(batchSize, targetRows - offset);
        const url = highUseStandardEndpoint
          ? `${API_BASE}/api/session/${encodeURIComponent(highSessionData.sessionId)}/data?offset=${offset}&limit=${req}`
          : `${API_BASE}/api/highsize/session/${encodeURIComponent(highSessionData.sessionId)}/data?offset=${offset}&limit=${req}&stride=${highStride}`;
        let res = await fetch(url);
        if (!res.ok) {
          if (!highUseStandardEndpoint && res.status === 404) {
            setHighUseStandardEndpoint(true);
            res = await fetch(
              `${API_BASE}/api/session/${encodeURIComponent(highSessionData.sessionId)}/data?offset=${offset}&limit=${req}`
            );
            if (!res.ok) {
              const txt = await res.text().catch(() => "");
              throw new Error(txt || `Failed to fetch linked high-size rows (${res.status})`);
            }
          } else {
            const txt = await res.text().catch(() => "");
            throw new Error(txt || `Failed to fetch linked high-size rows (${res.status})`);
          }
        }
        const payload = await res.json();
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        merged.push(...rows);
        totalRows = Number(payload.sampledTotalRows ?? payload.totalRows ?? totalRows);
        offset += rows.length;
        if (!rows.length) break;
      }
      setHighAllRows(merged);
    } catch (err: any) {
      setHighDataError(err?.message || "Failed to load linked high-size rows.");
    } finally {
      setHighAllDataLoading(false);
    }
  };

  const handleHighSizeUpload = async (file: File | null) => {
    if (!file) return;
    const controller = beginCancelableRequest('High-size upload');
    setHighDataError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      let res = await fetch(`${API_BASE}/api/highsize/upload`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (res.status === 404 || res.status === 405) {
        setHighUseStandardEndpoint(true);
        res = await fetch(`${API_BASE}/api/upload`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });
      }
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `High-size upload failed (${res.status})`);
      }
      const payload = await res.json();
      const session: SessionData = {
        sessionId: String(payload.sessionId),
        fileName: String(payload.fileName || file.name),
        rowCount: Number(payload.rowCount || 0),
        columns: Array.isArray(payload.columns) ? payload.columns : [],
        preview: Array.isArray(payload.preview) ? payload.preview : [],
      };
      setHighSessionData(session);
      setHighEngine(String(payload.engine || payload.storage || ''));
      if (!payload.engine && !payload.storage && highUseStandardEndpoint) {
        setHighEngine('pandas_csv (fallback)');
      }
      setHighDataOffset(0);
      setHighStride(1);
      setHighAllRows([]);
      await fetchHighDataPage(0, highDataLimit, 1);
      await fetchHighAllRows();
      toast({ title: 'High-size session ready', description: `${session.rowCount.toLocaleString()} rows loaded.` });
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      const msg = err?.message || String(err);
      setHighDataError(msg);
      toast({ title: 'High-size upload failed', description: msg, variant: 'destructive' });
    } finally {
      endCancelableRequest(controller);
    }
  };

  const handleHighCopilotAsk = async () => {
    if (!highSessionData || !highCopilotInput.trim()) return;
    const question = highCopilotInput.trim();
    const controller = beginCancelableRequest('High-size AI Copilot');
    setHighCopilotBusy(true);
    setHighRunnerOutput('');
    setHighRunnerChart(null);
    setHighRunnerChartSpec(null);
    setHighRunnerCode('');
    try {
      const codePrompt = `You are an engineering analytics copilot. Use dataframe df already loaded.
User request: "${question}"
If visualization or simulation is requested, return ONLY one python fenced code block and save any figure via plt.savefig('plot.png').
If descriptive answer is requested, provide concise markdown.`;
      const res = await callAnalyze(codePrompt, highSessionData.sessionId, 'user', [], controller.signal);
      const answer = String(res?.answer || '');
      const { code } = parsePythonResponse(answer);
      if (!code) {
        setHighRunnerOutput(answer || 'No answer generated.');
        return;
      }
      setHighRunnerCode(code);
      const execRes = await callExecPython(code, highSessionData.sessionId, false, controller.signal);
      if ((execRes as any)?.success) {
        const stdoutText = String((execRes as any).output ?? (execRes as any).stdout ?? '').trim();
        const images = Array.isArray((execRes as any).images) ? (execRes as any).images : [];
        const plotData = (execRes as any).plotData || (images[0] && images[0].data_uri) || null;
        setHighRunnerOutput(stdoutText || 'Python executed successfully.');
        setHighRunnerChart(plotData);
        setHighRunnerChartSpec((execRes as any).chartSpec || null);
      } else {
        if ((execRes as any)?.aborted) {
          setHighRunnerOutput('Request cancelled by user.');
        } else {
          setHighRunnerOutput(`Python execution failed: ${String((execRes as any)?.error || 'Unknown error')}`);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') return;
      setHighRunnerOutput(`High-size copilot failed: ${err?.message || String(err)}`);
    } finally {
      setHighCopilotBusy(false);
      endCancelableRequest(controller);
    }
  };

  useEffect(() => {
    if (activeTab !== 'data' || !sessionId) return;
    fetchDataPage(0, dataLimit);
    if (sessionData && Number(sessionData.rowCount || 0) > MAX_LINKED_ROWS) {
      setAllDataRows([]);
      setAllDataLoading(false);
      return;
    }
    fetchAllDataRows();
  }, [activeTab, sessionId]);

  useEffect(() => {
    if (activeTab !== 'highsize' || !highSessionData?.sessionId) return;
    fetchHighDataPage(0, highDataLimit, highStride);
    fetchHighAllRows();
  }, [activeTab, highSessionData?.sessionId, highStride]);

  useEffect(() => {
    if (!sessionData) return;
    setSelectedColumns((prev) => prev.filter((c) => sessionData.columns.includes(c)));
    if (formulaTargetColumn && !sessionData.columns.includes(formulaTargetColumn)) {
      setFormulaTargetColumn('');
    }
  }, [sessionData?.columns?.join('|')]);

  const cellKey = (rowIndex: number, column: string) => `${rowIndex}::${column}`;

  const toggleRowMark = (rowIndex: number, checked: boolean) => {
    setMarkedRows(prev => {
      const next = new Set(prev);
      if (checked) next.add(rowIndex);
      else next.delete(rowIndex);
      return Array.from(next).sort((a, b) => a - b);
    });
  };

  const saveMarkedRows = async () => {
    if (!sessionData) return;
    setSavingMarks(true);
    try {
      const res = await fetch(`${API_BASE}/api/session/${encodeURIComponent(sessionData.sessionId)}/marks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marked_rows: markedRows }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Failed to save marked rows (${res.status})`);
      }
      toast({ title: 'Marked rows saved', description: `${markedRows.length} row(s) marked.` });
      await fetchDataPage(dataOffset, dataLimit);
      await fetchAllDataRows();
    } catch (err: any) {
      toast({ title: 'Save marks failed', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setSavingMarks(false);
    }
  };

  const saveEditedCells = async () => {
    if (!sessionData) return;
    const updates = Object.entries(editedCells).map(([key, value]) => {
      const [rowIndexStr, column] = key.split('::');
      return { row_index: Number(rowIndexStr), column, value };
    });
    if (!updates.length) return;
    setSavingEdits(true);
    try {
      const res = await fetch(`${API_BASE}/api/session/${encodeURIComponent(sessionData.sessionId)}/edits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edits: updates }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Failed to save edits (${res.status})`);
      }
      setEditedCells({});
      toast({ title: 'Data edits saved', description: `${updates.length} edit(s) applied.` });
      await fetchDataPage(dataOffset, dataLimit);
      await fetchAllDataRows();
    } catch (err: any) {
      toast({ title: 'Save edits failed', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setSavingEdits(false);
    }
  };

  const toggleColumnSelection = (col: string, checked: boolean) => {
    setSelectedColumns((prev) => {
      const next = new Set(prev);
      if (checked) next.add(col);
      else next.delete(col);
      return Array.from(next);
    });
  };

  const applyFormulaToDataset = async () => {
    if (!sessionData) return;
    if (!formulaInput.trim()) {
      toast({ title: 'Formula required', description: 'Enter a formula like =Temperature*1.8+32', variant: 'destructive' });
      return;
    }
    const target = formulaTargetColumn.trim() || undefined;
    const newCol = formulaNewColumn.trim() || undefined;
    if (!target && !newCol) {
      toast({ title: 'Target required', description: 'Choose existing target column or enter new column name.', variant: 'destructive' });
      return;
    }
    setApplyingFormula(true);
    try {
      const res = await fetch(`${API_BASE}/api/session/${encodeURIComponent(sessionData.sessionId)}/formula`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formula: formulaInput,
          target_column: target,
          new_column_name: newCol,
        }),
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(txt || `Formula apply failed (${res.status})`);
      }
      const payload = await res.json();
      setSessionData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          columns: Array.isArray(payload.columns) ? payload.columns : prev.columns,
        };
      });
      if (newCol) setFormulaTargetColumn(newCol);
      setFormulaNewColumn('');
      toast({ title: 'Formula applied', description: `Updated column: ${payload.column}` });
      await fetchDataPage(dataOffset, dataLimit);
      await fetchAllDataRows();
    } catch (err: any) {
      toast({ title: 'Formula failed', description: err?.message || String(err), variant: 'destructive' });
    } finally {
      setApplyingFormula(false);
    }
  };

  const callAnalyze = async (
    prompt: string,
    sessionId: string,
    requestType: 'initial' | 'user' = 'user',
    history: SerializedHistoryMessage[] = [],
    signal?: AbortSignal
  ) => {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: prompt, sessionId: sessionId, requestType, history }),
      signal,
    });
    if (!res.ok) {
      const raw = await res.text().catch(() => '');
      let msg = raw || `Analysis failed with status ${res.status}`;
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.error) {
          msg = String(parsed.error);
          if (parsed?.retryable && Number.isFinite(Number(parsed?.retryAfterSec))) {
            msg += ` Retry in about ${Math.max(1, Number(parsed.retryAfterSec))}s.`;
          }
        }
      } catch {
        // Keep raw text fallback.
      }
      console.warn('analyze returned non-OK:', res.status, msg);
      throw new Error(msg);
    }
    return await res.json();
  };
    
  const callExecPython = async (code: string, sessionId: string, persistChanges = false, signal?: AbortSignal) => {
    try {
      const res = await fetch(`${API_BASE}/script/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, session_id: sessionId, timeout_sec: 30, persist_changes: persistChanges }),
        signal,
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { success: false, error: txt || `Execution failed: ${res.status}` };
      }
      const payload = await res.json();
      return { success: true, ...payload };
    } catch (err) {
      if ((err as any)?.name === 'AbortError') {
        return { success: false, aborted: true, error: 'Request cancelled by user.' };
      }
      console.error("callExecPython error", err);
      return { success: false, error: String(err) };
    }
  };

  const parsePythonResponse = (response: string | undefined | null): { code: string | null; codeOnly: boolean } => {
    if (!response) return { code: null, codeOnly: false };
    const fenceRegex = /```(?:python|py)?([\s\S]*?)```/i;
    const fenceMatch = response.match(fenceRegex);
    if (fenceMatch) {
      const code = fenceMatch[1]?.trim() ?? '';
      const codeOnly = response.trim() === fenceMatch[0].trim();
      return { code: code || null, codeOnly };
    }
    const trimmed = response.trim();
    if (!trimmed) return { code: null, codeOnly: false };
    if (trimmed.toLowerCase().startsWith('python')) {
      const code = trimmed.replace(/^python\s*/i, '').trimStart();
      return { code: code || null, codeOnly: true };
    }
    const firstLine = trimmed.split('\n')[0]?.trim() ?? '';
    const codeIndicators = [/^import\s+/i, /^from\s+\w+\s+import/i, /^df\./i, /^plt\./i, /^sns\./i, /^fig\s*=/i];
    if (codeIndicators.some((regex) => regex.test(firstLine))) {
      return { code: trimmed, codeOnly: true };
    }
    return { code: null, codeOnly: false };
  };

  const attemptAutoFix = async (
    failedCode: string,
    errorText: string,
    baseHistory: ChatMessage[]
  ): Promise<boolean> => {
    if (!sessionData) return false;
    const condensedError = (errorText || '').trim().slice(0, 2000) || 'Unknown error';
    const truncatedCode = failedCode.slice(0, 8000);

    const autoFixIntro: ChatMessage = {
      id: (Date.now() + 6).toString(),
      role: 'ai',
      content: 'The script failed. Trying to auto-correct and re-run it...',
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, autoFixIntro]);

    const historyWithIntro = [...baseHistory, autoFixIntro];
    const historyPayload = buildHistoryPayload(historyWithIntro);

    const autoPrompt = `You previously generated a Python script for a pandas DataFrame named 'df'.
That script failed during execution with the following error:

${condensedError}

Here is the script that failed:
"""
${truncatedCode}
"""

Provide a corrected script that avoids this error. RULES:
- Respond ONLY with valid Python code inside a single fenced code block.
- Assume 'df' is already loaded.
- Do NOT call plt.show().
- Prefer numeric 'time' columns (e.g., seconds) that may already exist.`;

    try {
      const { answer: autoAnswer } = await callAnalyze(autoPrompt, sessionData.sessionId, 'user', historyPayload);
      const aiContent = autoAnswer || 'Auto-fix attempt did not return any content.';

      const autoResponseMessage: ChatMessage = {
        id: (Date.now() + 7).toString(),
        role: 'ai',
        content: aiContent,
        timestamp: new Date(),
        type: 'analysis'
      };
      setMessages(prev => [...prev, autoResponseMessage]);

      const { code: correctedCode } = parsePythonResponse(aiContent);
      if (correctedCode) {
        await handlePythonExecution(correctedCode, false);
        return true;
      }

      const autoFailMessage: ChatMessage = {
        id: (Date.now() + 8).toString(),
        role: 'ai',
        content: 'Auto-fix attempt did not yield an executable script. Please try another request.',
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, autoFailMessage]);
    } catch (err) {
      const autoErrorMessage: ChatMessage = {
        id: (Date.now() + 9).toString(),
        role: 'ai',
        content: `Auto-fix attempt failed: ${err instanceof Error ? err.message : String(err)}`,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, autoErrorMessage]);
    }
    return false;
  };

  const addChartToSlides = (message: ChatMessage) => {
    if (!message || message.type !== 'chart') return;
    const title = slideTitle?.trim() || 'Chart';
    const newSlide: SlideContent = {
      id: Date.now().toString(),
      title,
      content: message.content || 'Generated visualization',
      chartPath: message.chartData,
      findings: slideFindings?.trim() || '',
      type: 'mixed'
    };
    setSlides(prev => [...prev, newSlide]);
    setSlideFindings('');
    setActiveTab('slides');
  };

  const inferPersistChangesFromCode = (pythonCode: string): boolean => {
    const code = String(pythonCode || '').toLowerCase();
    const editPatterns = [
      /df\[[^\]]+\]\s*=/,
      /df\.loc\[[^\]]+\]\s*=/,
      /df\.iloc\[[^\]]+\]\s*=/,
      /\.drop\(/,
      /\.rename\(/,
      /\.assign\(/,
      /\.fillna\(/,
      /\.replace\(/,
      /\.astype\(/,
    ];
    return editPatterns.some((re) => re.test(code));
  };

  const handlePythonExecution = async (
    pythonCode: string,
    allowAutoRetry: boolean = true,
    persistChanges: boolean = false,
    signal?: AbortSignal
  ) => {
    if (!sessionData) return;

    const shouldPersist = persistChanges || inferPersistChangesFromCode(pythonCode);
    const execResult = await callExecPython(pythonCode, sessionData.sessionId, shouldPersist, signal);

    if (execResult.success) {
      const stdoutText = String(execResult.output ?? execResult.stdout ?? '').trim();
      const stderrText = String(execResult.stderr ?? '').trim();
      const isShowWarningOnly =
        stderrText &&
        /FigureCanvasAgg is non-interactive/i.test(stderrText) &&
        !/Traceback|Error/i.test(stderrText);

      if (stderrText && !isShowWarningOnly) {
        const errorMessage: ChatMessage = {
          id: (Date.now() + 4).toString(),
          role: "ai",
          content: `**Python execution failed:**\n\n${stderrText}`,
          timestamp: new Date(),
          type: "text"
        };
        setMessages(prev => [...prev, errorMessage]);
        if (allowAutoRetry) {
          await attemptAutoFix(pythonCode, stderrText, [...messages, errorMessage]);
        }
        return;
      }

      if (stdoutText) {
        const outputMessage: ChatMessage = {
          id: (Date.now() + 2).toString(),
          role: "ai",
          content: `**Python Script Output:**\n\n${stdoutText}\n`,
          timestamp: new Date(),
          type: "text"
        };
        setMessages(prev => [...prev, outputMessage]);
      }
      const images = Array.isArray(execResult.images) ? execResult.images : [];
      const plotData = execResult.plotData || (images[0] && images[0].data_uri);
      if (plotData) {
        const chartMessage: ChatMessage = {
          id: (Date.now() + 3).toString(),
          role: "ai",
          content: "Here’s the generated plot:",
          timestamp: new Date(),
          type: "chart",
          chartData: plotData
        };
        setMessages(prev => [...prev, chartMessage]);
      }
      if (shouldPersist) {
        await fetchDataPage(dataOffset, dataLimit);
        if (sessionData.rowCount <= MAX_LINKED_ROWS) {
          await fetchAllDataRows();
        }
        toast({ title: 'Dataset updated', description: 'Python script changes were persisted to the dataset.' });
      }
    } else {
      if ((execResult as any).aborted) {
        const cancelledMessage: ChatMessage = {
          id: (Date.now() + 4).toString(),
          role: "ai",
          content: "Python execution cancelled by user.",
          timestamp: new Date(),
          type: "text"
        };
        setMessages(prev => [...prev, cancelledMessage]);
        return;
      }
      const errorText = String(execResult.error || execResult.stderr || 'Unknown error');
      toast({
        title: 'Python execution failed',
        description: errorText,
        variant: 'destructive'
      });
      const errorMessage: ChatMessage = {
        id: (Date.now() + 4).toString(),
        role: "ai",
        content: `**Python execution failed:**\n\n${errorText}\n`,
        timestamp: new Date(),
        type: "text"
      };
      const historyWithError = [...messages, errorMessage];
      setMessages(prev => [...prev, errorMessage]);

      const shouldSkipAutoFix =
        /FigureCanvasAgg is non-interactive/i.test(errorText) ||
        /Too Many Requests|429/i.test(errorText);

      if (allowAutoRetry && !shouldSkipAutoFix) {
        await attemptAutoFix(pythonCode, errorText, historyWithError);
      }
    }
  };

  const handleInitialAnalysis = async () => {
    if (!sessionData) return;
    const controller = beginCancelableRequest('Initial AI analysis');
    setIsAnalyzing(true);
    setAnalysisProgress(10);

    try {
      const textPrompt = `
        Perform a full statistical analysis of the dataset. I need a professional report in Markdown that includes:
        1. A summary of data quality, identifying any missing values or potential issues.
        2. A table of descriptive statistics for each numerical column (mean, median, std, min, max).
        3. Key insights and data-driven recommendations based on your findings.
        IMPORTANT: Do NOT include any Python code in this response.
      `;

      const historyPayload = buildHistoryPayload(messages);
      const { answer: textAnswer } = await callAnalyze(textPrompt, sessionData.sessionId, 'user', historyPayload, controller.signal);
      setAnalysisProgress(50);

      const textMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: textAnswer ?? "Text analysis failed to produce a result.",
        timestamp: new Date(),
        type: "analysis"
      };
      setMessages(prev => [...prev, textMessage]);

      const vizHistoryPayload = buildHistoryPayload([...messages, textMessage]);

      setAnalysisProgress(60);
      const vizPrompt = "Generate a correlation matrix heatmap for the dataset.";
      const { answer: vizAnswer } = await callAnalyze(vizPrompt, sessionData.sessionId, 'user', vizHistoryPayload, controller.signal);
      setAnalysisProgress(90);

      const { code: vizCode, codeOnly: vizCodeOnly } = parsePythonResponse(vizAnswer);
      if (vizCode) {
        if (vizAnswer) {
          const vizTextMessage: ChatMessage = {
            id: (Date.now() + 5).toString(),
            role: "ai",
            content: vizAnswer,
            timestamp: new Date(),
            type: "analysis"
          };
          setMessages(prev => [...prev, vizTextMessage]);
        }
        await handlePythonExecution(vizCode, true, false, controller.signal);
      } else {
        const vizTextMessage: ChatMessage = {
            id: (Date.now() + 5).toString(),
            role: "ai",
            content: vizAnswer ?? "Visualization request failed.",
            timestamp: new Date(),
            type: "text"
        };
        setMessages(prev => [...prev, vizTextMessage]);
      }

    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setMessages(prev => [...prev, {
          id: (Date.now() + 2).toString(),
          role: "ai",
          content: `Initial analysis cancelled by user.`,
          timestamp: new Date(),
          type: "text"
        }]);
        return;
      }
      console.error("Initial analysis failed", err);
      setMessages(prev => [...prev, {
        id: (Date.now() + 2).toString(),
        role: "ai",
        content: `Initial analysis failed: ${err.message}`,
        timestamp: new Date(),
        type: "text"
      }]);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
      endCancelableRequest(controller);
    }
  };

  const submitQuestionToAi = async (question: string, opts?: { clearMainInput?: boolean; slideMode?: boolean }) => {
    if (!question.trim() || !sessionData) return;
    const controller = beginCancelableRequest('AI Chat');

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: question,
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    if (opts?.clearMainInput) {
      setCurrentInput('');
    }
    if (opts?.slideMode) {
      setSlideCopilotBusy(true);
      setSlideCopilotInput('');
    }
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const t = setInterval(() => {
      setAnalysisProgress(p => Math.min(95, p + Math.random()*8));
    }, 250);

    try {
      const wantsExplanationOnly = /\b(explain|describe|interpret)\b/i.test(question) && /\b(chart|plot|graph|visual)/i.test(question);
      const asksForPlot = /\b(plot|chart|graph|visual|scatter|histogram|box\s*plot|heatmap|line\s*plot|bar\s*chart|xbar)\b/i.test(question);
      const asksWhatIf = /\bwhat\s*if|simulate|scenario|sensitivity\b/i.test(question);
      const asksDataEdit = /\b(add|create|new)\s+(column|field)\b|\b(rename|replace|change|update|fill|clean|normalize|convert|delete|drop)\b/i.test(question);
      const needsPythonRun = (asksForPlot || asksWhatIf || asksDataEdit) && !wantsExplanationOnly;

      const historyPayload = buildHistoryPayload([...messages, userMessage]);
      let aiContent = "";
      let pythonCode: string | null = null;

      if (needsPythonRun) {
        const codePrompt = asksDataEdit
          ? `You are a process engineering data copilot.
Generate Python code only (single fenced python block) to modify the uploaded dataset df according to:
"${question}"

Hard rules:
- Use only DataFrame df already loaded by system.
- Never fabricate data.
- Modify df in place.
- If user asks to add a column, derive it deterministically from existing columns.
- Do not use input() or external files.
- Do not call plt.show().
- Print a concise summary of what changed.
- No markdown explanations outside code block.`
          : `You are a process engineering + ML expert.
Generate Python code only (single fenced python block) to answer this request from the uploaded df:
"${question}"

Hard rules:
- Use only DataFrame df already loaded by system.
- Never fabricate data.
- Highlight marked rows where df['__marked__'] == True in a different color/size on charts.
- Include mathematically correct stats in printed output.
- Save figure using plt.savefig('plot.png').
- Do not call plt.show().`;

        const codeRes = await callAnalyze(codePrompt, sessionData.sessionId, 'user', historyPayload, controller.signal);
        aiContent = String(codeRes?.answer || '');
        pythonCode = parsePythonResponse(aiContent).code;

        if (!pythonCode) {
          const retryPrompt = `Return ONLY executable Python code in one fenced python block for this request: "${question}".`;
          const retryRes = await callAnalyze(retryPrompt, sessionData.sessionId, 'user', historyPayload, controller.signal);
          aiContent = String(retryRes?.answer || aiContent);
          pythonCode = parsePythonResponse(aiContent).code;
        }
      } else {
        const res = await callAnalyze(question, sessionData.sessionId, 'user', historyPayload, controller.signal);
        aiContent = String(res?.answer || "No answer from AI");
        pythonCode = parsePythonResponse(aiContent).code;
      }

      setAnalysisProgress(100);

      const aiMessage: ChatMessage = {
        id: (Date.now()+1).toString(),
        role: 'ai',
        content: String(aiContent || "No answer from AI"),
        timestamp: new Date(),
        type: 'analysis'
      };
      setMessages(prev => [...prev, aiMessage]);

      if (pythonCode && !wantsExplanationOnly) {
        await handlePythonExecution(pythonCode, true, asksDataEdit, controller.signal);
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const cancelledMessage: ChatMessage = {
          id: (Date.now()+1).toString(),
          role: 'ai',
          content: `Request cancelled by user.`,
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, cancelledMessage]);
        return;
      }
      console.error('submitQuestionToAi error', err);
      const errMessage: ChatMessage = {
        id: (Date.now()+1).toString(),
        role: 'ai',
        content: `Sorry, I couldn't get a response. Error: ${err.message}`,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errMessage]);
    } finally {
      clearInterval(t);
      setIsAnalyzing(false);
      setSlideCopilotBusy(false);
      setAnalysisProgress(0);
      endCancelableRequest(controller);
    }
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim()) return;
    await submitQuestionToAi(currentInput, { clearMainInput: true });
  };

  const handleSlideCopilotAsk = async () => {
    if (!slideCopilotInput.trim() || !sessionData) return;
    const controller = beginCancelableRequest('Data AI Copilot');
    const userQuestion = slideCopilotInput.trim();
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: `Slide Builder Request: ${userQuestion}`,
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    setSlideCopilotBusy(true);
    setSlideCopilotInput('');
    setSlideRunnerOutput('');
    setSlideRunnerChart(null);
    setSlideRunnerChartSpec(null);
    setSlideRunnerCode('');
    const asksForPlot = /\b(plot|chart|graph|visual|scatter|histogram|box\s*plot|heatmap|line\s*plot|bar\s*chart)\b/i.test(userQuestion);
    const asksWhatIf = /\bwhat\s*if|simulate|scenario|sensitivity\b/i.test(userQuestion);
    const asksDataEdit = /\b(add|create|new)\s+(column|field)\b|\b(rename|replace|change|update|fill|clean|normalize|convert|delete|drop)\b/i.test(userQuestion);
    const needsPythonRun = asksForPlot || asksWhatIf || asksDataEdit;
    const deterministicRule = sessionData ? parseBinaryLabelRule(userQuestion, sessionData.columns) : null;
    try {
      if (asksDataEdit && deterministicRule && deterministicRule.trueValue === deterministicRule.falseValue) {
        const clarification: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'ai',
          content: `I need clarification before applying this rule: both outcomes are ${deterministicRule.trueValue}, so the condition has no effect.\nPlease confirm intended values (example: > ${deterministicRule.threshold} => 1, else 0).`,
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, clarification]);
        setSlideRunnerOutput('Clarification required: conditional true/false values are identical.');
        return;
      }

      let aiUnavailableError = "";

      if (needsPythonRun) {
        const codePrompt = asksDataEdit
          ? `You are a process engineering data copilot.
Generate Python code only (single fenced python block) to modify the uploaded dataset df according to:
"${userQuestion}"

Hard rules:
- Use only DataFrame df already loaded by system.
- Never fabricate data.
- Modify df in place.
- If user asks to add a column, derive it deterministically from existing columns.
- If user asks text replacement, apply replacement across relevant text columns safely.
- Do not use input() or external files.
- Do not call plt.show().
- Print a concise summary of what changed (columns added/edited, rows affected).
- No markdown explanations outside code block.
- Never change columns not requested by the user.
- If the request is ambiguous, return a code block that only prints: "CLARIFICATION_REQUIRED: <question>".`
          : `You are a process engineering + ML expert.
Generate Python code only (single fenced python block) to answer this request from the uploaded df:
"${userQuestion}"

Hard rules:
- Use only DataFrame df already loaded by system.
- Never fabricate data.
- Highlight marked rows where df['__marked__'] == True in a different color/size on charts.
- Include mathematically correct stats in printed output.
- Save figure using plt.savefig('plot.png').
- Do not call plt.show().
- If scenario/what-if requested, run deterministic what-if calculations and print numeric results.`;
        const historyPayload = buildHistoryPayload(messages);
        let codeRes: any = null;
        try {
          codeRes = await callAnalyze(codePrompt, sessionData.sessionId, 'user', historyPayload, controller.signal);
        } catch (aiErr: any) {
          aiUnavailableError = aiErr?.message || String(aiErr);
        }
        if (!codeRes) {
          const warnMessage: ChatMessage = {
            id: (Date.now()+1).toString(),
            role: 'ai',
            content: `AI service unavailable (${aiUnavailableError}). Falling back to deterministic logic where possible.`,
            timestamp: new Date(),
            type: 'text'
          };
          setMessages(prev => [...prev, warnMessage]);
          if (asksDataEdit && deterministicRule) {
            const targetExists = sessionData.columns.includes(deterministicRule.targetColumn);
            const safeSource = deterministicRule.sourceColumn.replace(/'/g, "\\'");
            const formula = `=np.where(df['${safeSource}'] ${deterministicRule.operator} ${deterministicRule.threshold}, ${deterministicRule.trueValue}, ${deterministicRule.falseValue})`;
            const formulaRes = await fetch(`${API_BASE}/api/session/${encodeURIComponent(sessionData.sessionId)}/formula`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                formula,
                target_column: targetExists ? deterministicRule.targetColumn : undefined,
                new_column_name: targetExists ? undefined : deterministicRule.targetColumn,
              }),
            });
            if (!formulaRes.ok) {
              const txt = await formulaRes.text().catch(() => '');
              throw new Error(txt || `Deterministic formula apply failed (${formulaRes.status})`);
            }
            const payload = await formulaRes.json();
            setSessionData((prev) => {
              if (!prev) return prev;
              return { ...prev, columns: Array.isArray(payload.columns) ? payload.columns : prev.columns };
            });
            await fetchDataPage(dataOffset, dataLimit);
            await fetchAllDataRows();
            setSlideRunnerOutput(`AI unavailable. Applied deterministic fallback formula:\n${formula}`);
            return;
          }
          return;
        }
        const aiCodeMsg: ChatMessage = {
          id: (Date.now()+2).toString(),
          role: 'ai',
          content: String(codeRes?.answer || ''),
          timestamp: new Date(),
          type: 'analysis'
        };
        setMessages(prev => [...prev, aiCodeMsg]);
        let { code: pythonCode } = parsePythonResponse(codeRes?.answer || '');
        const mentionedColumns = extractMentionedColumns(userQuestion, sessionData.columns);
        const missingColumns = asksDataEdit
          ? mentionedColumns.filter((col) => !codeMentionsColumn(pythonCode || '', col))
          : [];
        if (asksDataEdit && pythonCode && missingColumns.length > 0) {
          const retryPrompt = `You returned code that does not use required columns from user request: ${missingColumns.join(', ')}.
Regenerate Python code only (single fenced python block) and ensure these columns are used exactly.
User request: "${userQuestion}"`;
          const retryRes = await callAnalyze(retryPrompt, sessionData.sessionId, 'user', historyPayload, controller.signal);
          const retryParsed = parsePythonResponse(retryRes?.answer || '');
          pythonCode = retryParsed.code;
        }
        if (pythonCode) {
          const missingAfterRetry = asksDataEdit
            ? extractMentionedColumns(userQuestion, sessionData.columns).filter((col) => !codeMentionsColumn(pythonCode || '', col))
            : [];
          if (asksDataEdit && missingAfterRetry.length > 0) {
            const clarification: ChatMessage = {
              id: (Date.now()+3).toString(),
              role: 'ai',
              content: `I need clarification before applying data edits. I could not reliably map these referenced columns in code: ${missingAfterRetry.join(', ')}.\nPlease confirm exact column names and intended rule.`,
              timestamp: new Date(),
              type: 'text'
            };
            setMessages(prev => [...prev, clarification]);
            setSlideRunnerOutput(`Clarification required. Missing referenced columns in generated code: ${missingAfterRetry.join(', ')}`);
            return;
          }
          setSlideRunnerCode(pythonCode);
          const execRes = await callExecPython(pythonCode, sessionData.sessionId, asksDataEdit, controller.signal);
          if ((execRes as any)?.success) {
            const stdoutText = String((execRes as any).output ?? (execRes as any).stdout ?? '').trim();
            const images = Array.isArray((execRes as any).images) ? (execRes as any).images : [];
            const plotData = (execRes as any).plotData || (images[0] && images[0].data_uri) || null;
            setSlideRunnerOutput(stdoutText || 'Python executed successfully.');
            setSlideRunnerChart(plotData);
            const returnedSpec = (execRes as any).chartSpec || null;
            setSlideRunnerChartSpec(returnedSpec);
            if (plotData) {
              const inferred = inferEditableChartConfig(pythonCode, sessionData.columns);
              setOpenEditableChartRequest({
                requestId: Date.now(),
                ...inferred,
                sourceImage: plotData,
                sourceSpec: returnedSpec,
              });
            }
            if (asksDataEdit) {
              await fetchDataPage(dataOffset, dataLimit);
              await fetchAllDataRows();
              toast({ title: 'Dataset updated', description: 'AI-generated script was executed and changes were applied.' });
            }
          } else {
            setSlideRunnerOutput(`Python execution failed: ${String((execRes as any)?.error || 'Unknown error')}`);
          }
        } else if (asksDataEdit) {
          setSlideRunnerOutput('AI did not return executable Python code for the requested data change.');
        }
      } else {
        const textPrompt = `You are a professional engineering analytics copilot.
Answer the user's question using only the uploaded dataset context for session ${sessionData.sessionId}.
Rules:
- Do not fabricate values.
- If evidence is insufficient, explicitly say what columns/fields are missing.
- Keep the answer concise and factual.
Question: ${userQuestion}`;
        const historyPayload = buildHistoryPayload(messages);
        try {
          const aiRes = await callAnalyze(textPrompt, sessionData.sessionId, 'user', historyPayload, controller.signal);
          const aiAnswer = String(aiRes?.answer || 'No answer generated.');
          const aiMessage: ChatMessage = {
            id: (Date.now()+1).toString(),
            role: 'ai',
            content: aiAnswer,
            timestamp: new Date(),
            type: 'analysis'
          };
          setMessages(prev => [...prev, aiMessage]);
          const { code: fallbackCode } = parsePythonResponse(aiAnswer);
          if (fallbackCode) {
            setSlideRunnerCode(fallbackCode);
            const execRes = await callExecPython(fallbackCode, sessionData.sessionId, false, controller.signal);
            if ((execRes as any)?.success) {
              const stdoutText = String((execRes as any).output ?? (execRes as any).stdout ?? '').trim();
              const images = Array.isArray((execRes as any).images) ? (execRes as any).images : [];
              const plotData = (execRes as any).plotData || (images[0] && images[0].data_uri) || null;
              const returnedSpec = (execRes as any).chartSpec || null;
              setSlideRunnerOutput(stdoutText || 'Python executed successfully.');
              setSlideRunnerChart(plotData);
              setSlideRunnerChartSpec(returnedSpec);
              if (plotData) {
                const inferred = inferEditableChartConfig(fallbackCode, sessionData.columns);
                setOpenEditableChartRequest({
                  requestId: Date.now(),
                  ...inferred,
                  sourceImage: plotData,
                  sourceSpec: returnedSpec,
                });
              }
            } else {
              setSlideRunnerOutput(`Python execution failed: ${String((execRes as any)?.error || 'Unknown error')}`);
            }
          }
        } catch (aiErr: any) {
          const aiErrText = aiErr?.message || String(aiErr);
          const warnMessage: ChatMessage = {
            id: (Date.now()+1).toString(),
            role: 'ai',
            content: `AI service unavailable (${aiErrText}). Using deterministic fallback response.`,
            timestamp: new Date(),
            type: 'text'
          };
          setMessages(prev => [...prev, warnMessage]);
          const res = await fetch(`${API_BASE}/api/grounded-insight`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: userQuestion,
              sessionId: sessionData.sessionId
            })
          });
          if (!res.ok) {
            const txt = await res.text().catch(() => '');
            throw new Error(txt || `Deterministic fallback failed (${res.status})`);
          }
          const payload = await res.json();
          const fallbackMessage: ChatMessage = {
            id: (Date.now()+2).toString(),
            role: 'ai',
            content: String(payload?.answer || 'No deterministic insight generated.'),
            timestamp: new Date(),
            type: 'analysis'
          };
          setMessages(prev => [...prev, fallbackMessage]);
        }
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        const cancelledMessage: ChatMessage = {
          id: (Date.now()+1).toString(),
          role: 'ai',
          content: `Data AI Copilot request cancelled by user.`,
          timestamp: new Date(),
          type: 'text'
        };
        setMessages(prev => [...prev, cancelledMessage]);
        return;
      }
      const errMessage: ChatMessage = {
        id: (Date.now()+1).toString(),
        role: 'ai',
        content: `Slide Copilot failed: ${err?.message || String(err)}`,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errMessage]);
    } finally {
      setSlideCopilotBusy(false);
      endCancelableRequest(controller);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const exportPresentation = async (slides: SlideContent[]) => {
    if (slides.length === 0) return;
    try {
      // Map local slide structure to backend schema
      const payload = {
        slides: slides.map((s) => ({
          title: s.title,
          text: s.content,
          findings: s.findings,
          imageBase64: s.chartPath, // chartPath already holds base64 data URL if a chart was added
        })),
      };

      const res = await fetch(`${API_BASE}/api/generate-pptx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Failed to generate PPTX: ${res.status} ${txt}`);
      }

      const contentType = res.headers.get('content-type') || '';
      const blob = await res.blob();

      // Ensure we received a PPTX and not a JSON error payload
      if (blob.type === 'application/json' || contentType.includes('application/json')) {
        const text = await blob.text();
        try {
          const error = JSON.parse(text);
          throw new Error(error.error || 'Server returned JSON instead of PPTX file');
        } catch {
          throw new Error('Server returned JSON instead of PPTX file');
        }
      }

      const pptxBlob = new Blob([blob], {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      });
      const url = URL.createObjectURL(pptxBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analysis-presentation-${Date.now()}.pptx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Exported PPTX', description: 'PowerPoint downloaded successfully.' });
    } catch (err) {
      console.error('Export PPTX failed', err);
      toast({
        title: 'PPTX export failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-gradient">AI Data Analytics</h1>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                {displaySession ? (
                  <>
                    <Badge variant="secondary">{displaySession.fileName}</Badge>
                    <span>{displaySession.rowCount.toLocaleString()} rows</span>
                    <span>{displaySession.columns.length} columns</span>
                  </>
                ) : (
                  <Badge variant="outline">No active upload session</Badge>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setSidePanelCollapsed((prev) => !prev)}
                title={sidePanelCollapsed ? "Show right sidebar" : "Hide right sidebar"}
              >
                {sidePanelCollapsed ? <PanelRightOpen className="w-4 h-4 mr-2" /> : <PanelRightClose className="w-4 h-4 mr-2" />}
                {sidePanelCollapsed ? "Show Sidebar" : "Hide Sidebar"}
              </Button>
              <Button onClick={() => navigate('/upload')} variant="outline">
                <Upload className="w-4 h-4 mr-2" />
                Upload New File
              </Button>
            </div>
          </div>
        </div>

        <div
          ref={workspaceGridRef}
          className={`grid grid-cols-1 ${
            sidePanelCollapsed
              ? "lg:grid-cols-[1fr_auto] gap-4"
              : isDesktopLayout
                ? "lg:grid-cols-[minmax(0,1fr)_8px_minmax(320px,1fr)] gap-0"
                : "lg:grid-cols-3 gap-6"
          }`}
          style={
            !sidePanelCollapsed && isDesktopLayout
              ? { gridTemplateColumns: `minmax(0, ${mainPaneRatio}fr) 8px minmax(320px, ${100 - mainPaneRatio}fr)` }
              : undefined
          }
        >
          <div className="min-w-0">
            <Tabs value={activeTab} onValueChange={(v:any)=>setActiveTab(v)} className="h-full">
              <TabsList className="grid w-full grid-cols-4 md:grid-cols-8">
                <TabsTrigger value="enterprise" className="flex items-center space-x-2"><Rocket className="w-4 h-4" /><span>Enterprise</span></TabsTrigger>
                <TabsTrigger value="chat" className="flex items-center space-x-2"><MessageSquare className="w-4 h-4" /><span>AI Chat</span></TabsTrigger>
                <TabsTrigger value="data" className="flex items-center space-x-2"><Table className="w-4 h-4" /><span>Data Preview</span></TabsTrigger>
                <TabsTrigger value="highsize" className="flex items-center space-x-2"><FileSpreadsheet className="w-4 h-4" /><span>High-Size</span></TabsTrigger>
                <TabsTrigger value="slides" className="flex items-center space-x-2"><FileText className="w-4 h-4" /><span>Slides ({slides.length})</span></TabsTrigger>
                <TabsTrigger value="compare" className="flex items-center space-x-2"><GitCompare className="w-4 h-4" /><span>Compare</span></TabsTrigger>
                <TabsTrigger value="analyzer" className="flex items-center space-x-2"><FlaskConical className="w-4 h-4" /><span>Analyzer</span></TabsTrigger>
                <TabsTrigger value="doe" className="flex items-center space-x-2"><BarChart3 className="w-4 h-4" /><span>DOE</span></TabsTrigger>
              </TabsList>

              <TabsContent value="enterprise">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Enterprise Analytics Workspace</CardTitle>
                    <CardDescription>All enterprise features are centralized here. Launch Compare, Analyzer, and DOE directly.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="border-primary/20">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2"><GitCompare className="w-4 h-4" /> Compare</CardTitle>
                          <CardDescription>Baseline vs experiment comparison with copilot and script execution.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" onClick={() => setActiveTab('compare')}>Open Compare</Button>
                        </CardContent>
                      </Card>
                      <Card className="border-primary/20">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Analyzer</CardTitle>
                          <CardDescription>Plan, execute, validate, and run copilot scripts for root-cause analysis.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" onClick={() => setActiveTab('analyzer')}>Open Analyzer</Button>
                        </CardContent>
                      </Card>
                      <Card className="border-primary/20">
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4" /> DOE Wizard</CardTitle>
                          <CardDescription>Design and analyze experiments with guided recommendations and diagnostics.</CardDescription>
                        </CardHeader>
                        <CardContent>
                          <Button className="w-full" onClick={() => setActiveTab('doe')}>Open DOE</Button>
                        </CardContent>
                      </Card>
                    </div>

                    {!sessionData && (
                      <Card className="border-dashed">
                        <CardContent className="pt-6">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div className="text-sm text-muted-foreground">
                              Upload a dataset if you also want AI Chat, Data Preview, and Slides.
                            </div>
                            <Button onClick={() => navigate('/upload')}>
                              <Upload className="w-4 h-4 mr-2" />
                              Upload File
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
                <div className="mt-4">
                  <EnterpriseAgentsPanel />
                </div>
              </TabsContent>

              <TabsContent value="chat">
                {!sessionData ? (
                  <Card className="h-full">
                    <CardHeader>
                      <CardTitle className="flex items-center space-x-2"><Brain className="w-5 h-5 text-primary" /><span>AI Analysis Assistant</span></CardTitle>
                      <CardDescription>Upload a dataset to use AI chat and script execution with your data context.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => navigate('/upload')}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload File
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                <Card className="h-full flex flex-col min-h-[70vh]">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2"><Brain className="w-5 h-5 text-primary" /><span>AI Analysis Assistant</span></CardTitle>
                    <CardDescription>Ask questions about your data and get AI-powered insights</CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col min-h-[60vh]">
                    <ScrollArea className="mb-4 pr-2 flex-grow min-h-[45vh]">
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <AiResponseMessage
                            key={message.id}
                            message={message}
                            onAddToSlides={addChartToSlides}
                            onRunPython={async (code) => {
                              const controller = beginCancelableRequest('Python script');
                              try {
                                await handlePythonExecution(code, true, inferPersistChangesFromCode(code), controller.signal);
                              } finally {
                                endCancelableRequest(controller);
                              }
                            }}
                          />
                        ))}
                        {isAnalyzing && (
                          <div className="flex justify-start">
                            <div className="bg-muted rounded-lg p-4 mr-12">
                              <div className="flex items-center space-x-2 mb-2"><Brain className="w-4 h-4 text-primary animate-pulse" /><span className="text-sm font-medium">AI Assistant</span></div>
                              <div className="space-y-2"><div className="text-sm">Analyzing...</div><Progress value={analysisProgress} className="h-2" /></div>
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>
                    <div className="mt-4 flex-shrink-0">
                      <div className="mb-4 flex gap-2">
                        <Button onClick={handleInitialAnalysis} disabled={isAnalyzing || !sessionData} className="flex-1">
                          <Play className="w-4 h-4 mr-2" /> Run Initial AI Analysis
                        </Button>
                        <Button
                          variant="outline"
                          onClick={cancelActiveRequest}
                          disabled={!requestInFlight}
                        >
                          Cancel
                        </Button>
                      </div>
                      <div className="flex space-x-2">
                        <Textarea
                          placeholder="Ask me anything about your data..."
                          value={currentInput}
                          onChange={(e) => setCurrentInput(e.target.value)}
                          onKeyPress={handleKeyPress}
                          className="flex-1 min-h-[60px] max-h-32 resize-none"
                          disabled={isAnalyzing}
                        />
                        <Button onClick={handleSendMessage} disabled={isAnalyzing || !currentInput.trim()} size="lg">
                          <Send className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                )}
              </TabsContent>

              <TabsContent value="data">
                {!sessionData ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Data Preview</CardTitle>
                      <CardDescription>Upload a dataset to preview rows and columns.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => navigate('/upload')}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload File
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Data Preview</CardTitle>
                    <CardDescription>
                      Spreadsheet-style preview with paging across the full uploaded dataset.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-md border p-3 space-y-3">
                      <div className="text-sm font-medium">Spreadsheet Actions</div>
                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2">
                        <Input
                          placeholder="Formula (e.g., =Temperature*1.8+32)"
                          value={formulaInput}
                          onChange={(e) => setFormulaInput(e.target.value)}
                        />
                        <Select value={formulaTargetColumn || "__none__"} onValueChange={(value) => setFormulaTargetColumn(value === "__none__" ? "" : value)}>
                          <SelectTrigger>
                            <SelectValue placeholder="Target existing column" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No target column</SelectItem>
                            {sessionData.columns.map((col) => (
                              <SelectItem key={col} value={col}>{col}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Or new column name"
                          value={formulaNewColumn}
                          onChange={(e) => setFormulaNewColumn(e.target.value)}
                        />
                        <Button onClick={applyFormulaToDataset} disabled={applyingFormula}>
                          {applyingFormula ? 'Applying...' : 'Apply Formula'}
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedColumns(sessionData.columns)}
                        >
                          Select All Columns
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelectedColumns([])}
                        >
                          Clear Column Selection
                        </Button>
                        <div className="text-xs text-muted-foreground self-center">
                          Selected columns: {selectedColumns.length ? selectedColumns.join(', ') : 'None'}
                        </div>
                      </div>
                    </div>
                    {sessionData.rowCount > MAX_LINKED_ROWS && (
                      <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                        Large dataset detected. Showing paged rows in the grid; linked in-memory rows are capped for performance.
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="text-sm text-muted-foreground">
                        Linked workbench rows: {(allDataRows.length || dataRows.length).toLocaleString()} / {sessionData.rowCount.toLocaleString()}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            fetchDataPage(dataOffset, dataLimit);
                            if (sessionData.rowCount <= MAX_LINKED_ROWS) fetchAllDataRows();
                          }}
                          disabled={dataLoading || allDataLoading}
                        >
                          {allDataLoading ? "Refreshing..." : "Refresh Data"}
                        </Button>
                      </div>
                    </div>
                    {dataError && <div className="text-sm text-red-600">{dataError}</div>}
                    <LinkedDataWorkbench
                      rows={allDataRows.length ? allDataRows : dataRows}
                      columns={sessionData.columns}
                      openEditableChartRequest={openEditableChartRequest}
                    />
                    {(dataLoading || allDataLoading) && <div className="text-sm text-muted-foreground">Loading rows...</div>}
                  </CardContent>
                </Card>
                )}
              </TabsContent>

              <TabsContent value="highsize">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>High-Size Data Preview</CardTitle>
                    <CardDescription>
                      Session-level parquet conversion and DuckDB paging for large files, with optional resampling.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-md border p-3 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          ref={highUploadInputRef}
                          type="file"
                          accept=".csv,.xlsx,.xls"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0] || null;
                            handleHighSizeUpload(file);
                            e.currentTarget.value = '';
                          }}
                        />
                        <Button onClick={() => highUploadInputRef.current?.click()}>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Large Dataset
                        </Button>
                        <div className="text-xs text-muted-foreground">
                          {highSessionData
                            ? `${highSessionData.fileName} • ${highSessionData.rowCount.toLocaleString()} rows`
                            : 'Upload a large CSV/Excel file to start a high-size session.'}
                        </div>
                      </div>
                      <div className="grid md:grid-cols-4 gap-2">
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Resample Stride</label>
                          <Select
                            value={String(highStride)}
                            onValueChange={(v) => {
                              const next = Math.max(1, Number(v) || 1);
                              setHighStride(next);
                            }}
                            disabled={!highSessionData}
                          >
                            <SelectTrigger><SelectValue placeholder="Stride" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1">1 (No resample)</SelectItem>
                              <SelectItem value="2">2 (50%)</SelectItem>
                              <SelectItem value="5">5 (20%)</SelectItem>
                              <SelectItem value="10">10 (10%)</SelectItem>
                              <SelectItem value="20">20 (5%)</SelectItem>
                              <SelectItem value="50">50 (2%)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Page Size</label>
                          <Input
                            type="number"
                            min={50}
                            max={10000}
                            value={highDataLimit}
                            disabled={!highSessionData}
                            onChange={(e) => setHighDataLimit(Math.max(50, Math.min(10000, Number(e.target.value) || 250)))}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">Storage Engine</label>
                          <div className="h-10 rounded-md border px-3 flex items-center text-sm truncate">
                            {highEngine || '-'}
                          </div>
                        </div>
                        <div className="flex items-end">
                          <Button
                            variant="outline"
                            className="w-full"
                            disabled={!highSessionData || highDataLoading || highAllDataLoading}
                            onClick={() => {
                              fetchHighDataPage(0, highDataLimit, highStride);
                              fetchHighAllRows();
                            }}
                          >
                            {highDataLoading || highAllDataLoading ? 'Refreshing...' : 'Refresh High-Size Data'}
                          </Button>
                        </div>
                      </div>
                    </div>

                    {!highSessionData ? (
                      <div className="space-y-2">
                        <div className="text-sm text-muted-foreground">
                          Upload a file to enable high-size preview, AI copilot, Python runner, and editable charts.
                        </div>
                        {highDataError && <div className="text-sm text-red-600">{highDataError}</div>}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-sm text-muted-foreground">
                            Linked workbench rows: {(highAllRows.length || highDataRows.length).toLocaleString()} / {(highSessionData.rowCount || 0).toLocaleString()}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Resample stride: {highStride} ({highStride === 1 ? 'full data' : `1/${highStride} rows`})
                          </div>
                        </div>
                        {highDataError && <div className="text-sm text-red-600">{highDataError}</div>}
                        <LinkedDataWorkbench
                          rows={highAllRows.length ? highAllRows : highDataRows}
                          columns={highSessionData.columns}
                          openEditableChartRequest={openEditableChartRequest}
                        />
                        {(highDataLoading || highAllDataLoading) && (
                          <div className="text-sm text-muted-foreground">Loading high-size rows...</div>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="slides">
                 {!sessionData ? (
                  <Card>
                    <CardHeader>
                      <CardTitle>Presentation Slides</CardTitle>
                      <CardDescription>Slides are created from AI chat outputs after a dataset upload.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <Button onClick={() => navigate('/upload')}>
                        <Upload className="w-4 h-4 mr-2" />
                        Upload File
                      </Button>
                    </CardContent>
                  </Card>
                 ) : (
                 <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Presentation Slides</span>
                      <Button onClick={() => exportPresentation(slides)} disabled={slides.length === 0}>
                        <Download className="w-4 h-4 mr-2" />
                        Export
                      </Button>
                    </CardTitle>
                    <CardDescription>Build your presentation from AI insights</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {slides.length === 0 ? (
                      <div className="text-center py-12">
                        <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                        <p className="text-muted-foreground">No slides created yet. Add charts from the AI chat to your presentation.</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {slides.map((slide, index) => (
                          <Card key={slide.id} id={`slide-${index}`}>
                            <CardHeader><CardTitle className="text-lg">Slide {index + 1}: {slide.title}</CardTitle></CardHeader>
                            <CardContent>
                              {slide.chartPath && <img src={slide.chartPath} alt={slide.title} className="w-full rounded-lg border mb-4" />}
                              <p className="text-sm text-muted-foreground">{slide.content}</p>
                              {slide.findings && <p className="mt-2 text-sm"><strong>Findings:</strong> {slide.findings}</p>}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
                 )}
              </TabsContent>
              <TabsContent value="compare">
                <ComparePanel />
              </TabsContent>
              <TabsContent value="analyzer">
                <AnalyzerPanel />
              </TabsContent>
              <TabsContent value="doe">
                <DoeWizard />
              </TabsContent>
            </Tabs>
          </div>

          {!sidePanelCollapsed && isDesktopLayout && (
            <div
              role="separator"
              aria-label="Resize workspace panels"
              className="hidden lg:flex items-center justify-center cursor-col-resize select-none bg-primary/20 hover:bg-primary/40 transition-colors"
              onMouseDown={startMainPaneResize}
              title="Drag to resize panels"
            >
              <div className="h-10 w-1 rounded-full bg-primary/70" />
            </div>
          )}

          {!sidePanelCollapsed && (
          <div className={`space-y-6 self-start ${isDesktopLayout ? "lg:pl-4 lg:sticky lg:top-24" : ""}`}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{isHighSizeContext ? "High-Size AI Copilot" : "Data AI Copilot"}</CardTitle>
                <CardDescription>Ask for deterministic findings, data edits, what-if, charts, and auto-run Python when needed.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium mb-2 block">Ask Copilot</label>
                  <Textarea
                    placeholder="Ask findings, create chart, or request data edits (e.g., 'add new normalized column')."
                    value={isHighSizeContext ? highCopilotInput : slideCopilotInput}
                    onChange={(e) => {
                      if (isHighSizeContext) setHighCopilotInput(e.target.value);
                      else setSlideCopilotInput(e.target.value);
                    }}
                    className="min-h-[90px]"
                    disabled={isHighSizeContext ? highCopilotBusy : (!sessionData || slideCopilotBusy)}
                  />
                  <Button
                    className="w-full"
                    onClick={isHighSizeContext ? handleHighCopilotAsk : handleSlideCopilotAsk}
                    disabled={
                      isHighSizeContext
                        ? (!highSessionData || highCopilotBusy || !highCopilotInput.trim())
                        : (!sessionData || slideCopilotBusy || !slideCopilotInput.trim())
                    }
                  >
                    {(isHighSizeContext ? highCopilotBusy : slideCopilotBusy) ? "Analyzing..." : "Ask AI Copilot"}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={cancelActiveRequest}
                    disabled={!requestInFlight}
                  >
                    Cancel Current Request
                  </Button>
                </div>
                {requestInFlight && (
                  <div className="text-xs text-muted-foreground">
                    Running: {requestLabel || "Request in progress"}...
                  </div>
                )}
                <div className="rounded-md border p-2 max-h-48 overflow-y-auto space-y-2">
                  {messages
                    .filter((m) => m.role === "ai")
                    .slice(-4)
                    .map((m) => (
                      <div key={m.id} className="text-xs text-muted-foreground whitespace-pre-wrap">
                        {m.content}
                      </div>
                    ))}
                  {messages.filter((m) => m.role === "ai").length === 0 && (
                    <div className="text-xs text-muted-foreground">
                      AI replies for slide requests will appear here.
                    </div>
                  )}
                </div>
                {((isHighSizeContext ? highRunnerCode : slideRunnerCode)
                  || (isHighSizeContext ? highRunnerOutput : slideRunnerOutput)
                  || (isHighSizeContext ? highRunnerChart : slideRunnerChart)) && (
                  <div className="space-y-2 rounded-md border p-2">
                    <div className="text-sm font-medium">Python Runner Result</div>
                    {(isHighSizeContext ? highRunnerCode : slideRunnerCode) && (
                      <pre className="text-xs bg-muted p-2 rounded max-h-40 overflow-auto whitespace-pre-wrap">
                        {isHighSizeContext ? highRunnerCode : slideRunnerCode}
                      </pre>
                    )}
                    {(isHighSizeContext ? highRunnerOutput : slideRunnerOutput) && (
                      <pre className="text-xs bg-muted p-2 rounded max-h-28 overflow-auto whitespace-pre-wrap">
                        {isHighSizeContext ? highRunnerOutput : slideRunnerOutput}
                      </pre>
                    )}
                    {(isHighSizeContext ? highRunnerChart : slideRunnerChart) && (
                      <div className="space-y-2">
                        <img src={isHighSizeContext ? String(highRunnerChart) : String(slideRunnerChart)} alt="Runner chart" className="w-full rounded border" />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={isHighSizeContext ? handleOpenEditableChartTabFromHighSize : handleOpenEditableChartTab}
                          disabled={isHighSizeContext ? !highSessionData : !sessionData}
                        >
                          Open as Editable Chart Tab
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Grounded mode: responses are computed from uploaded data and deterministic statistics first; Python runner executes advanced tasks.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Slide Builder</CardTitle>
                <CardDescription>Manual slide title/findings editor. Expand only when needed.</CardDescription>
              </CardHeader>
              <CardContent>
                <Collapsible open={slideBuilderOpen} onOpenChange={setSlideBuilderOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" className="w-full justify-between">
                      <span>{slideBuilderOpen ? 'Hide Slide Builder' : 'Open Slide Builder'}</span>
                      {slideBuilderOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-4 pt-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Slide Title</label>
                      <Input
                        placeholder="Enter slide title..."
                        value={slideTitle}
                        onChange={(e) => setSlideTitle(e.target.value)}
                        disabled={!sessionData}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-2 block">Add Findings</label>
                      <Textarea
                        placeholder="Write key findings for this slide..."
                        value={slideFindings}
                        onChange={(e) => setSlideFindings(e.target.value)}
                        className="min-h-[80px]"
                        disabled={!sessionData}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Click "Add to Slides" on any generated chart in AI Chat to create a visual slide.
                    </p>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{displaySession ? displaySession.rowCount.toLocaleString() : "-"}</div>
                    <div className="text-sm text-muted-foreground">Total Rows</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{displaySession ? displaySession.columns.length : "-"}</div>
                    <div className="text-sm text-muted-foreground">Columns</div>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-sm font-medium mb-2">Column Headers</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {(displaySession?.columns || []).map((header, index) => (
                      <Badge key={index} variant="secondary" className="text-xs mr-1 mb-1">{header}</Badge>
                    ))}
                    {!displaySession && (
                      <div className="text-xs text-muted-foreground">Upload a dataset to view headers.</div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
          )}

          {sidePanelCollapsed && (
            <div className="hidden lg:flex lg:sticky lg:top-24 self-start">
              <Button
                variant="outline"
                className="h-40 w-12 p-2 text-xs"
                onClick={() => setSidePanelCollapsed(false)}
                title="Show Data AI Copilot sidebar"
              >
                <span className="[writing-mode:vertical-rl] rotate-180">Data AI Copilot</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
