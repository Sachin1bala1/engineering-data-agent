// Analytics.tsx
import React, { useState, useEffect, useRef } from 'react';
import { toast } from '@/components/ui/use-toast';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { AiResponseMessage } from '@/components/features/analytics/AiResponseMessage';
import { ComparePanel } from '@/components/engineering/ComparePanel';
import { AnalyzerPanel } from '@/components/engineering/AnalyzerPanel';
import { DoeWizard } from '@/components/engineering/DoeWizard';
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
  Plus,
  GitCompare,
  FlaskConical,
  BarChart3,
} from 'lucide-react';

interface SessionData {
  sessionId: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  preview: any[];
}

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
const placeholderChartBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const Analytics: React.FC = () => {
  const navigate = useNavigate();
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentInput, setCurrentInput] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [slides, setSlides] = useState<SlideContent[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [slideTitle, setSlideTitle] = useState('');
  const [slideFindings, setSlideFindings] = useState('');
  const [activeTab, setActiveTab] = useState<'chat'|'data'|'slides'|'compare'|'analyzer'|'doe'>('chat');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const callAnalyze = async (prompt: string, sessionId: string, requestType: 'initial' | 'user' = 'user', history: SerializedHistoryMessage[] = []) => {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: prompt, sessionId: sessionId, requestType, history })
    });
    if (!res.ok) {
      const txt = await res.text();
      console.warn('analyze returned non-OK:', res.status, txt);
      throw new Error(txt || `Analysis failed with status ${res.status}`);
    }
    return await res.json();
  };
    
  const callExecPython = async (code: string, sessionId: string) => {
    try {
      const res = await fetch(`${API_BASE}/script/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, session_id: sessionId, timeout_sec: 30 })
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => "");
        return { success: false, error: txt || `Execution failed: ${res.status}` };
      }
      const payload = await res.json();
      return { success: true, ...payload };
    } catch (err) {
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

  const handlePythonExecution = async (pythonCode: string, allowAutoRetry: boolean = true) => {
    if (!sessionData) return;

    const execResult = await callExecPython(pythonCode, sessionData.sessionId);

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
    } else {
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
      const { answer: textAnswer } = await callAnalyze(textPrompt, sessionData.sessionId, 'user', historyPayload);
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
      const { answer: vizAnswer } = await callAnalyze(vizPrompt, sessionData.sessionId, 'user', vizHistoryPayload);
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
        await handlePythonExecution(vizCode);
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

    } catch (err) {
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
    }
  };

  const handleSendMessage = async () => {
    if (!currentInput.trim() || !sessionData) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: currentInput,
      timestamp: new Date(),
      type: 'text'
    };
    setMessages(prev => [...prev, userMessage]);
    const question = currentInput;
    setCurrentInput('');
    setIsAnalyzing(true);
    setAnalysisProgress(0);

    const t = setInterval(() => {
      setAnalysisProgress(p => Math.min(95, p + Math.random()*8));
    }, 250);

    try {
      const wantsExplanationOnly = /\b(explain|describe|interpret)\b/i.test(question) && /\b(chart|plot|graph|visual)/i.test(question);
      const historyPayload = buildHistoryPayload([...messages, userMessage]);
      const { answer } = await callAnalyze(question, sessionData.sessionId, 'user', historyPayload);
      clearInterval(t);
      setAnalysisProgress(100);

      const aiContent = answer || "No answer from AI";
      const { code: pythonCode, codeOnly } = parsePythonResponse(aiContent);

      // If the user asked to explain/describe a chart, prefer text over re-running code
      if (wantsExplanationOnly) {
        const aiMessage: ChatMessage = {
          id: (Date.now()+1).toString(),
          role: 'ai',
          content: String(aiContent),
          timestamp: new Date(),
          type: 'analysis'
        };
        setMessages(prev => [...prev, aiMessage]);
      } else if (pythonCode) {
        if (aiContent) {
          const aiMessage: ChatMessage = {
              id: (Date.now()+1).toString(),
              role: 'ai',
              content: String(aiContent),
              timestamp: new Date(),
              type: 'analysis'
          };
          setMessages(prev => [...prev, aiMessage]);
        }
        await handlePythonExecution(pythonCode);
      } else {
        const aiMessage: ChatMessage = {
            id: (Date.now()+1).toString(),
            role: 'ai',
            content: String(aiContent),
            timestamp: new Date(),
            type: 'analysis'
        };
        setMessages(prev => [...prev, aiMessage]);
      }

    } catch (err) {
      console.error('handleSendMessage error', err);
      const errMessage: ChatMessage = {
        id: (Date.now()+1).toString(),
        role: 'ai',
        content: `Sorry, I couldn't get a response. Error: ${err.message}`,
        timestamp: new Date(),
        type: 'text'
      };
      setMessages(prev => [...prev, errMessage]);
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgress(0);
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

  if (!sessionData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
        <div className="container mx-auto px-4 py-12">
          <div className="max-w-2xl mx-auto text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
              <FileSpreadsheet className="w-8 h-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold mb-4">No Data Session Found</h1>
            <p className="text-muted-foreground mb-8">
              Upload an Excel/CSV file to start a new analysis session.
            </p>
            <Button onClick={() => navigate('/upload')} size="lg">
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-muted/30 to-background">
      <div className="container mx-auto px-4 py-6">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2 text-gradient">AI Data Analytics</h1>
              <div className="flex items-center space-x-4 text-sm text-muted-foreground">
                <Badge variant="secondary">{sessionData.fileName}</Badge>
                <span>{sessionData.rowCount.toLocaleString()} rows</span>
                <span>{sessionData.columns.length} columns</span>
              </div>
            </div>
            <Button onClick={() => navigate('/upload')} variant="outline">
              <Upload className="w-4 h-4 mr-2" />
              Upload New File
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Tabs value={activeTab} onValueChange={(v:any)=>setActiveTab(v)} className="h-full">
              <TabsList className="grid w-full grid-cols-3 md:grid-cols-6">
                <TabsTrigger value="chat" className="flex items-center space-x-2"><MessageSquare className="w-4 h-4" /><span>AI Chat</span></TabsTrigger>
                <TabsTrigger value="data" className="flex items-center space-x-2"><Table className="w-4 h-4" /><span>Data Preview</span></TabsTrigger>
                <TabsTrigger value="slides" className="flex items-center space-x-2"><FileText className="w-4 h-4" /><span>Slides ({slides.length})</span></TabsTrigger>
                <TabsTrigger value="compare" className="flex items-center space-x-2"><GitCompare className="w-4 h-4" /><span>Compare</span></TabsTrigger>
                <TabsTrigger value="analyzer" className="flex items-center space-x-2"><FlaskConical className="w-4 h-4" /><span>Analyzer</span></TabsTrigger>
                <TabsTrigger value="doe" className="flex items-center space-x-2"><BarChart3 className="w-4 h-4" /><span>DOE</span></TabsTrigger>
              </TabsList>

              <TabsContent value="chat">
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
                            onRunPython={(code) => handlePythonExecution(code)}
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
                      <div className="mb-4">
                        <Button onClick={handleInitialAnalysis} disabled={isAnalyzing || !sessionData} className="w-full">
                          <Play className="w-4 h-4 mr-2" /> Run Initial AI Analysis
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
              </TabsContent>

              <TabsContent value="data">
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle>Data Preview</CardTitle>
                    <CardDescription>Showing the first 5 rows of your uploaded data</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="border rounded-lg overflow-hidden">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-muted sticky top-0">
                            <tr>
                              {sessionData.columns.map((header, index) => (
                                <th key={index} className="px-4 py-3 text-left font-medium whitespace-nowrap">{header}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {sessionData.preview.map((row, rowIndex) => (
                              <tr key={rowIndex} className="border-t hover:bg-muted/50">
                                {sessionData.columns.map((header, colIndex) => (
                                  <td key={colIndex} className="px-4 py-3 whitespace-nowrap">
                                    {String(row[header] ?? '').substring(0, 100)}
                                    {String(row[header] ?? '').length > 100 && '...'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="slides">
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

          <div className="space-y-6 lg:sticky lg:top-24 self-start">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Slide Builder</CardTitle>
                <CardDescription>Create slides from generated charts</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">Slide Title</label>
                  <Input placeholder="Enter slide title..." value={slideTitle} onChange={(e) => setSlideTitle(e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium mb-2 block">Add Findings</label>
                  <Textarea placeholder="Write key findings for this slide..." value={slideFindings} onChange={(e) => setSlideFindings(e.target.value)} className="min-h-[80px]" />
                </div>
                <p className="text-sm text-muted-foreground">Click the "Add to Slides" button on a chart in the chat to create a slide.</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Data Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{sessionData.rowCount.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Total Rows</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-primary">{sessionData.columns.length}</div>
                    <div className="text-sm text-muted-foreground">Columns</div>
                  </div>
                </div>
                <Separator />
                <div>
                  <div className="text-sm font-medium mb-2">Column Headers</div>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {sessionData.columns.map((header, index) => (
                      <Badge key={index} variant="secondary" className="text-xs mr-1 mb-1">{header}</Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
