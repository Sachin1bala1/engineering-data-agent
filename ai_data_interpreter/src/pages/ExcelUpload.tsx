import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileSpreadsheet, ArrowRight, CheckCircle, AlertCircle, BarChart3, Brain, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

// NEW: API base URL
const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

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
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  // NEW: State now holds session data
  const [sessionData, setSessionData] = useState<SessionData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'upload' | 'processing' | 'preview' | 'complete'>('upload');

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
    if (file.size > 50 * 1024 * 1024) { // Increased limit to 50MB
      setError('File size must be less than 50MB');
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
      xhr.open('POST', `${API_BASE}/api/upload`, true);

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = (event.loaded / event.total) * 100;
          setUploadProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          const response: SessionData = JSON.parse(xhr.responseText);
          setSessionData(response);
          
          // NEW: Save the new session data structure to the correct key
          sessionStorage.setItem('analysisSessionData', JSON.stringify(response));
          
          setStep('preview');
          setTimeout(() => setStep('complete'), 1000);
        } else {
          const errorResponse = JSON.parse(xhr.responseText);
          setError(errorResponse.error || 'An unknown error occurred during upload.');
          setStep('upload');
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setError('Upload failed. Please check your network connection.');
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
                    <div className="text-sm text-muted-foreground">Supports .xlsx, .xls, and .csv files up to 50MB</div>
                  </div>
                </div>
              </CardContent>
            </Card>
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
