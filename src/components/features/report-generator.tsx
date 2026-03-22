import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { 
  FileText, 
  Download, 
  Presentation,
  BarChart3,
  TrendingUp,
  PieChart,
  FileSpreadsheet,
  Settings,
  Eye,
  CheckCircle,
  Clock,
  Zap
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportSection {
  id: string;
  name: string;
  description: string;
  icon: any;
  included: boolean;
  required?: boolean;
}

interface ReportGeneratorProps {
  className?: string;
}

export function ReportGenerator({ className }: ReportGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [reportTitle, setReportTitle] = useState("Data Analysis Report");
  const [reportDescription, setReportDescription] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"pptx" | "pdf" | "both">("both");

  const [sections, setSections] = useState<ReportSection[]>([
    {
      id: "executive-summary",
      name: "Executive Summary",
      description: "High-level overview and key findings",
      icon: FileText,
      included: true,
      required: true
    },
    {
      id: "descriptive-stats",
      name: "Descriptive Statistics", 
      description: "Mean, median, standard deviation, quartiles",
      icon: BarChart3,
      included: true
    },
    {
      id: "correlation-analysis",
      name: "Correlation Analysis",
      description: "Pearson correlation matrix with p-values",
      icon: TrendingUp,
      included: true
    },
    {
      id: "regression-models",
      name: "Regression Analysis",
      description: "Linear regression models and coefficients",
      icon: PieChart,
      included: true
    },
    {
      id: "hypothesis-tests",
      name: "Hypothesis Testing",
      description: "T-tests, ANOVA, and significance testing",
      icon: FileSpreadsheet,
      included: false
    },
    {
      id: "visualizations",
      name: "Data Visualizations",
      description: "Charts, graphs, and plots",
      icon: BarChart3,
      included: true
    },
    {
      id: "recommendations",
      name: "Recommendations",
      description: "AI-generated insights and next steps",
      icon: Zap,
      included: true
    }
  ]);

  const toggleSection = (id: string) => {
    setSections(sections.map(section => 
      section.id === id && !section.required
        ? { ...section, included: !section.included }
        : section
    ));
  };

  const generateReport = async () => {
    setIsGenerating(true);
    setProgress(0);

    // Simulate report generation progress
    const steps = [
      "Preparing data...",
      "Running statistical analysis...", 
      "Generating visualizations...",
      "Creating presentation slides...",
      "Formatting PDF report...",
      "Finalizing documents..."
    ];

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      setProgress(((i + 1) / steps.length) * 100);
    }

    // Simulate file generation and download
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Create mock files
    if (selectedFormat === "pptx" || selectedFormat === "both") {
      const pptxData = {
        title: reportTitle,
        description: reportDescription,
        sections: sections.filter(s => s.included),
        generated: new Date().toISOString()
      };
      
      const pptxBlob = new Blob([JSON.stringify(pptxData, null, 2)], { 
        type: 'application/json' 
      });
      const pptxUrl = URL.createObjectURL(pptxBlob);
      
      const pptxLink = document.createElement('a');
      pptxLink.href = pptxUrl;
      pptxLink.download = `${reportTitle.replace(/\s+/g, '_')}.json`; // Would be .pptx
      pptxLink.click();
      
      URL.revokeObjectURL(pptxUrl);
    }

    if (selectedFormat === "pdf" || selectedFormat === "both") {
      const pdfData = {
        title: reportTitle,
        description: reportDescription,
        sections: sections.filter(s => s.included),
        format: "PDF",
        generated: new Date().toISOString()
      };
      
      const pdfBlob = new Blob([JSON.stringify(pdfData, null, 2)], { 
        type: 'application/json' 
      });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      
      const pdfLink = document.createElement('a');
      pdfLink.href = pdfUrl;
      pdfLink.download = `${reportTitle.replace(/\s+/g, '_')}_report.json`; // Would be .pdf
      pdfLink.click();
      
      URL.revokeObjectURL(pdfUrl);
    }

    setIsGenerating(false);
    setProgress(0);
  };

  const formats = [
    { id: "pptx", name: "PowerPoint", icon: Presentation, description: "Interactive slides" },
    { id: "pdf", name: "PDF Report", icon: FileText, description: "Static document" },
    { id: "both", name: "Both Formats", icon: Download, description: "PPTX + PDF" }
  ];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card className="bg-gradient-card shadow-medium">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Report Generator
          </CardTitle>
          <CardDescription>
            Generate professional PowerPoint presentations and PDF reports from your analysis
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Report Details */}
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <CardTitle>Report Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">Report Title</label>
                <Input
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="Enter report title..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Description (Optional)</label>
                <Textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="Brief description of the analysis..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Format Selection */}
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <CardTitle>Output Format</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-3 gap-3">
                {formats.map((format) => (
                  <div
                    key={format.id}
                    className={cn(
                      "p-4 rounded-lg border-2 cursor-pointer transition-all duration-smooth",
                      selectedFormat === format.id
                        ? "border-primary bg-primary/5 shadow-glow"
                        : "border-border/40 hover:border-primary/50"
                    )}
                    onClick={() => setSelectedFormat(format.id as "pptx" | "pdf" | "both")}
                  >
                    <format.icon className={cn(
                      "w-8 h-8 mx-auto mb-3",
                      selectedFormat === format.id ? "text-primary" : "text-muted-foreground"
                    )} />
                    <h3 className="font-semibold text-center mb-1">{format.name}</h3>
                    <p className="text-xs text-center text-muted-foreground">{format.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Section Selection */}
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <CardTitle>Report Sections</CardTitle>
              <CardDescription>
                Select which sections to include in your report
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sections.map((section) => (
                  <div
                    key={section.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border transition-all duration-smooth",
                      section.included 
                        ? "bg-primary/5 border-primary/20" 
                        : "bg-muted/30 border-border/40"
                    )}
                  >
                    <Checkbox
                      checked={section.included}
                      onCheckedChange={() => toggleSection(section.id)}
                      disabled={section.required}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <section.icon className="w-4 h-4 text-primary" />
                        <h4 className="font-medium text-sm">{section.name}</h4>
                        {section.required && (
                          <Badge variant="secondary" className="text-xs">Required</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{section.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Generation Controls */}
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <CardTitle className="text-lg">Generate Report</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isGenerating ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary animate-spin" />
                    <span className="text-sm">Generating report...</span>
                  </div>
                  <Progress value={progress} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    {progress.toFixed(0)}% complete
                  </p>
                </div>
              ) : (
                <Button 
                  onClick={generateReport}
                  className="w-full bg-gradient-industrial text-white"
                  disabled={sections.filter(s => s.included).length === 0}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate Report
                </Button>
              )}
              
              <div className="space-y-2 pt-3 border-t border-border/40">
                <div className="flex items-center justify-between text-sm">
                  <span>Sections included:</span>
                  <span className="font-medium">{sections.filter(s => s.included).length}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Estimated time:</span>
                  <span className="font-medium">2-3 minutes</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Output format:</span>
                  <span className="font-medium capitalize">{selectedFormat}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Preview Options */}
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <CardTitle className="text-lg">Preview Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full">
                <Eye className="w-4 h-4 mr-2" />
                Preview Slides
              </Button>
              <Button variant="outline" className="w-full">
                <Settings className="w-4 h-4 mr-2" />
                Advanced Settings
              </Button>
              <Button variant="outline" className="w-full">
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                Export Data Only
              </Button>
            </CardContent>
          </Card>

          {/* Recent Reports */}
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <CardTitle className="text-lg">Recent Reports</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { name: "Quality Analysis Q1", date: "2024-01-15", format: "PPTX" },
                { name: "Process Optimization", date: "2024-01-14", format: "PDF" },
                { name: "Equipment Study", date: "2024-01-13", format: "Both" }
              ].map((report, index) => (
                <div key={index} className="p-3 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <h4 className="font-medium text-sm">{report.name}</h4>
                    <Badge variant="secondary" className="text-xs">{report.format}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{report.date}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}