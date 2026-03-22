import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, 
  FileSpreadsheet, 
  BarChart3, 
  TrendingUp, 
  FileText,
  CheckCircle,
  AlertCircle,
  Download
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalyticsUploadProps {
  className?: string;
}

export function AnalyticsUpload({ className }: AnalyticsUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, []);

  const processFile = async (file: File) => {
    setFileName(file.name);
    setUploadProgress(0);
    setIsAnalyzing(true);
    setIsComplete(false);

    // Simulate upload progress
    for (let i = 0; i <= 100; i += 10) {
      setUploadProgress(i);
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Store file info for Streamlit app access
    sessionStorage.setItem('uploadedFileName', file.name);
    sessionStorage.setItem('uploadedFileSize', file.size.toString());
    sessionStorage.setItem('uploadedFileType', file.type);

    // Complete upload simulation
    setIsAnalyzing(false);
    setIsComplete(true);

    // Auto-redirect to Streamlit app after 1 second
    setTimeout(() => {
      // Update this URL to match your Streamlit app location
      const streamlitUrl = 'http://localhost:8501';
      window.open(streamlitUrl, '_blank');
    }, 1000);
  };

  const reset = () => {
    setFileName(null);
    setUploadProgress(0);
    setIsAnalyzing(false);
    setIsComplete(false);
  };

  return (
    <div className={cn("space-y-6", className)}>
      {/* Upload Section */}
      <Card className="border-2 border-dashed border-border/40 bg-gradient-card">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            Upload Your Data
          </CardTitle>
          <CardDescription>
            Upload CSV or Excel files for comprehensive AI-powered analysis
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!fileName ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "relative rounded-lg border-2 border-dashed p-8 text-center transition-all duration-smooth",
                isDragOver 
                  ? "border-primary bg-primary/5 shadow-glow" 
                  : "border-border/40 hover:border-primary/50"
              )}
            >
              <div className="space-y-4">
                <div className="w-16 h-16 mx-auto bg-gradient-primary rounded-full flex items-center justify-center animate-pulse-soft">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <div>
                  <p className="text-lg font-medium">
                    Drop your files here, or{" "}
                    <label className="text-primary hover:text-primary-dark cursor-pointer underline">
                      browse
                      <input
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Supports CSV, Excel (.xlsx, .xls) • Max file size: 50MB
                  </p>
                </div>
                <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
                  <Badge variant="secondary">CSV</Badge>
                  <Badge variant="secondary">XLSX</Badge>
                  <Badge variant="secondary">XLS</Badge>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* File Info */}
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center">
                    <FileSpreadsheet className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium">{fileName}</p>
                    <p className="text-sm text-muted-foreground">
                      {isComplete ? "Analysis complete" : isAnalyzing ? "Analyzing..." : "Uploading..."}
                    </p>
                  </div>
                </div>
                {isComplete && (
                  <CheckCircle className="w-6 h-6 text-primary" />
                )}
              </div>

              {/* Progress */}
              {!isComplete && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{isAnalyzing ? "Running analysis..." : "Uploading..."}</span>
                    <span>{isAnalyzing ? "Processing" : `${uploadProgress}%`}</span>
                  </div>
                  <Progress 
                    value={isAnalyzing ? undefined : uploadProgress} 
                    className="h-2"
                  />
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3">
                {isComplete ? (
                  <>
                    <Button 
                      className="flex-1 bg-gradient-industrial text-white"
                      onClick={() => {
                        const streamlitUrl = 'http://localhost:8501';
                        window.open(streamlitUrl, '_blank');
                      }}
                    >
                      <BarChart3 className="w-4 h-4 mr-2" />
                      Open AI Analysis Tool
                    </Button>
                    <Button variant="outline" onClick={reset}>
                      Upload New File
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" onClick={reset} className="w-full">
                    Cancel
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Features */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card className="bg-gradient-card shadow-soft hover:shadow-medium transition-all duration-smooth group">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                <BarChart3 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Statistical Analysis</h3>
                <p className="text-xs text-muted-foreground">Descriptive stats & correlations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-soft hover:shadow-medium transition-all duration-smooth group">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Regression Models</h3>
                <p className="text-xs text-muted-foreground">Linear & multiple regression</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-card shadow-soft hover:shadow-medium transition-all duration-smooth group">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                <FileText className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">Auto Reports</h3>
                <p className="text-xs text-muted-foreground">PowerPoint & PDF export</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}