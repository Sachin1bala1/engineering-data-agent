import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle, AlertCircle, BarChart3, Brain, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiUrl, getApiBase } from '@/lib/api-base';
import { demoScenarios } from '@/lib/demoScenarios';

interface ExcelUploadProps {
  className?: string;
}

// NEW: This interface matches the backend's session response
interface SessionData {
  sessionId: string;
  fileName: string;
  rowCount: number;
  columns: string[];
  preview: any[];
}

const ExcelUpload: React.FC<ExcelUploadProps> = ({ className }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // NEW: State now holds session data
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'processing' | 'preview' | 'complete'>('upload');
  const autoLoadedDemoRef = useRef<string | null>(null);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const loadDemoScenario = useCallback(async (scenarioId: string) => {
    const scenario = demoScenarios.find((item) => item.id === scenarioId);
    if (!scenario?.datasetPath || !scenario.datasetLabel) return;
    try {
      const response = await fetch(scenario.datasetPath);
      if (!response.ok) {
        throw new Error(`Failed to fetch bundled demo asset (${response.status}).`);
      }
      const blob = await response.blob();
      const file = new File([blob], scenario.datasetLabel, { type: blob.type || 'text/csv' });
      await handleFile(file);
    } catch (err) {
      console.error('Demo asset load failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to load bundled demo dataset.');
    }
  }, []);

  // REWRITTEN: This function now sends the file to the backend
  const handleFile = async (file: File) => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv'
    ];
    if (!validTypes.includes(file.type) && !file.name.match(/\.(xlsx|xls|csv)$/i)) {
      setError('Please upload a valid Excel (.xlsx, .xls) or CSV file');
      return;
    }
    setError(null);
    setUploading(true);
    setStep('processing');
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // Use XMLHttpRequest to get upload progress
      const xhr = new XMLHttpRequest();
      xhr.open('POST', apiUrl('/api/upload'), true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          try {
            const response: SessionData = JSON.parse(xhr.responseText);
            setSessionData(response);
            sessionStorage.setItem('analysisSessionData', JSON.stringify(response));
            setStep('preview');
            setTimeout(() => setStep('complete'), 1000);
          } catch (parseErr) {
            console.error('Upload response parse error:', parseErr, xhr.responseText);
            setError('Upload succeeded but the response was invalid. Please retry.');
            setStep('upload');
          }
        } else {
          let errorMessage = 'An unknown error occurred during upload.';
          try {
            const errorResponse = JSON.parse(xhr.responseText);
            errorMessage = errorResponse.error || errorResponse.detail || errorMessage;
          } catch {
            errorMessage = xhr.responseText || `Upload failed (${xhr.status}).`;
          }
          setError(errorMessage);
          setStep('upload');
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        const base = getApiBase() || window.location.origin;
        setError(`Upload failed. The local upload API at ${base}/api/upload is not reachable.`);
        setStep('upload');
      };

      xhr.send(formData);

    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Error uploading file. See console for details.');
      setUploading(false);
      setStep('upload');
    }
  };

  const proceedToAnalysis = () => {
    navigate('/analytics');
  };

  useEffect(() => {
    const demoId = (location.state as { demoScenarioId?: string } | null)?.demoScenarioId;
    if (!demoId || autoLoadedDemoRef.current === demoId || uploading || sessionData) return;
    autoLoadedDemoRef.current = demoId;
    void loadDemoScenario(demoId);
  }, [location.state, loadDemoScenario, sessionData, uploading]);

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className={cn("min-h-screen bg-gradient-to-br from-background via-muted/30 to-background", className)}>
      <div className="container mx-auto px-4 py-12">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-6">
            <FileSpreadsheet className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-4 text-gradient">Upload Your Data</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Transform your spreadsheet data into powerful insights with AI-driven analysis.
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-center mb-8">
            <div className="flex items-center space-x-4">
              <div className={cn("flex items-center space-x-2 px-4 py-2 rounded-full transition-all", step === 'upload' || step === 'processing' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Upload className="w-4 h-4" /><span>Upload</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className={cn("flex items-center space-x-2 px-4 py-2 rounded-full transition-all", step === 'preview' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <BarChart3 className="w-4 h-4" /><span>Preview</span>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
              <div className={cn("flex items-center space-x-2 px-4 py-2 rounded-full transition-all", step === 'complete' ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                <Brain className="w-4 h-4" /><span>Analysis</span>
              </div>
            </div>
          </div>

          {step === 'upload' && (
            <div className="space-y-6">
              <Card>
                <CardContent className="p-8">
                  <div
                    className={cn("relative border-2 border-dashed rounded-lg p-12 text-center transition-all hover:bg-muted/50", dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/25")}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                  >
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleInputChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={uploading} />
                    <div className="space-y-4">
                      <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full"><FileSpreadsheet className="w-8 h-8 text-primary" /></div>
                      <div>
                        <h3 className="text-xl font-semibold mb-2">Drop your file here</h3>
                        <p className="text-muted-foreground mb-4">or click to browse</p>
                        <Button size="lg" className="mb-4"><Upload className="w-4 h-4 mr-2" />Select File</Button>
                      </div>
                      <div className="text-sm text-muted-foreground">Supports .xlsx, .xls, and .csv files</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Manufacturing Demo Starter Pack</CardTitle>
                  <CardDescription>Load a bundled scenario and move directly into a manufacturing workflow.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                  {demoScenarios.map((scenario) => (
                    <div key={scenario.id} className="rounded-xl border bg-background p-4 space-y-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-medium">{scenario.title}</div>
                        <div className="text-xs rounded-full border px-2 py-1 text-muted-foreground">{scenario.module}</div>
                      </div>
                      <div className="text-sm text-muted-foreground">{scenario.businessGoal}</div>
                      <div className="text-xs text-muted-foreground">{scenario.notes}</div>
                      <div className="text-xs text-muted-foreground">
                        {scenario.datasetLabel ? `Bundled asset: ${scenario.datasetLabel}` : 'Bundled maintenance asset pack lives in Knowledge Twin.'}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {scenario.datasetPath ? (
                          <Button variant="outline" onClick={() => void loadDemoScenario(scenario.id)}>
                            Load Demo Dataset
                          </Button>
                        ) : (
                          <Button variant="outline" onClick={() => navigate('/knowledge-twin')}>
                            Open Knowledge Twin
                          </Button>
                        )}
                        <Button onClick={() => navigate(scenario.module === 'knowledge-twin' ? '/knowledge-twin' : `/analytics?tab=${scenario.module}`)}>
                          Open Scenario
                        </Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}

          {step === 'processing' && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full"><FileSpreadsheet className="w-8 h-8 text-primary animate-pulse" /></div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Uploading & Processing...</h3>
                    <p className="text-muted-foreground mb-6">Sending file to the server for secure processing.</p>
                    <div className="max-w-md mx-auto space-y-2">
                      <Progress value={uploadProgress} className="h-2" />
                      <p className="text-sm text-muted-foreground">{Math.round(uploadProgress)}% complete</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'preview' && sessionData && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2"><CheckCircle className="w-5 h-5 text-green-500" /><span>Data Preview</span></CardTitle>
                <CardDescription>Review your uploaded data before proceeding to analysis.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">File Name</p>
                      <p className="font-semibold">{sessionData.fileName}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Rows Found</p>
                      <p className="font-semibold">{sessionData.rowCount.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto max-h-96">
                      <table className="w-full text-sm">
                        <thead className="bg-muted">
                          <tr>
                            {sessionData.columns.slice(0, 8).map((header, index) => (
                              <th key={index} className="px-4 py-3 text-left font-medium">{header}</th>
                            ))}
                            {sessionData.columns.length > 8 && <th className="px-4 py-3 text-left font-medium text-muted-foreground">+{sessionData.columns.length - 8} more...</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {sessionData.preview.map((row, rowIndex) => (
                            <tr key={rowIndex} className="border-t">
                              {sessionData.columns.slice(0, 8).map((header, colIndex) => (
                                <td key={colIndex} className="px-4 py-3">{String(row[header] || '').substring(0, 50)}{String(row[header] || '').length > 50 && '...'}</td>
                              ))}
                              {sessionData.columns.length > 8 && <td className="px-4 py-3 text-muted-foreground">...</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 'complete' && sessionData && (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="space-y-6">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/10 rounded-full"><CheckCircle className="w-8 h-8 text-green-500" /></div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">Ready for Analysis!</h3>
                    <p className="text-muted-foreground mb-6">Your data has been processed. Click below to start generating insights.</p>
                    <Button size="lg" onClick={proceedToAnalysis} className="mb-4">
                      <Brain className="w-4 h-4 mr-2" />Start AI Analysis<ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {error && (
            <Alert className="mb-8" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
};

export default ExcelUpload;
