import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Plus, 
  FileImage, 
  Download, 
  Presentation,
  Eye,
  Edit3,
  Copy,
  Trash2,
  FileText,
  Settings,
  Play
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Slide {
  id: string;
  title: string;
  content: string;
  image?: string;
  layout: "text-only" | "image-only" | "text-image-side" | "text-image-top" | "grid";
}

interface SlideEditorProps {
  className?: string;
}

export function SlideEditor({ className }: SlideEditorProps) {
  const [slides, setSlides] = useState<Slide[]>([
    {
      id: "1",
      title: "Statistical Analysis Results",
      content: "This presentation contains comprehensive analysis of your data including descriptive statistics, correlation analysis, and regression modeling results.",
      layout: "text-only"
    }
  ]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const layouts = [
    { id: "text-only", name: "Text Only", icon: FileText },
    { id: "image-only", name: "Image Only", icon: FileImage },
    { id: "text-image-side", name: "Text + Image (Side)", icon: Copy },
    { id: "text-image-top", name: "Text + Image (Top)", icon: Copy },
    { id: "grid", name: "2x2 Grid", icon: Copy }
  ];

  const addSlide = () => {
    const newSlide: Slide = {
      id: Date.now().toString(),
      title: "New Slide",
      content: "",
      layout: "text-only"
    };
    setSlides([...slides, newSlide]);
    setCurrentSlide(slides.length);
  };

  const updateSlide = (field: keyof Slide, value: string) => {
    const updated = [...slides];
    updated[currentSlide] = { ...updated[currentSlide], [field]: value };
    setSlides(updated);
  };

  const deleteSlide = (index: number) => {
    if (slides.length > 1) {
      const updated = slides.filter((_, i) => i !== index);
      setSlides(updated);
      if (currentSlide >= updated.length) {
        setCurrentSlide(updated.length - 1);
      }
    }
  };

  const exportToPPTX = () => {
    // Create PPTX data structure and trigger download
    const pptxData = {
      slides: slides.map(slide => ({
        title: slide.title,
        content: slide.content,
        layout: slide.layout,
        image: slide.image
      }))
    };
    
    // In a real implementation, this would use a library like PptxGenJS
    const dataStr = JSON.stringify(pptxData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'analysis_presentation.json'; // Would be .pptx in real implementation
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const currentSlideData = slides[currentSlide];

  return (
    <div className={cn("space-y-6", className)}>
      {/* Header */}
      <Card className="bg-gradient-card shadow-medium">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Presentation className="w-5 h-5 text-primary" />
                Slide Editor
              </CardTitle>
              <CardDescription>
                Create professional presentations from your analysis results
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => setIsPreviewMode(!isPreviewMode)}
              >
                <Eye className="w-4 h-4 mr-2" />
                {isPreviewMode ? "Edit" : "Preview"}
              </Button>
              <Button 
                size="sm"
                onClick={exportToPPTX}
                className="bg-gradient-industrial text-white"
              >
                <Download className="w-4 h-4 mr-2" />
                Export PPTX
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Slide Navigation */}
        <div className="lg:col-span-1">
          <Card className="bg-gradient-card shadow-medium">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Slides</CardTitle>
                <Button size="sm" variant="outline" onClick={addSlide}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {slides.map((slide, index) => (
                <div
                  key={slide.id}
                  className={cn(
                    "p-3 rounded-lg cursor-pointer transition-all duration-smooth border",
                    currentSlide === index
                      ? "bg-primary/10 border-primary shadow-glow"
                      : "bg-muted/30 border-border/40 hover:bg-muted/50"
                  )}
                  onClick={() => setCurrentSlide(index)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-sm truncate">{slide.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">
                        Slide {index + 1}
                      </p>
                    </div>
                    {slides.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSlide(index);
                        }}
                        className="w-6 h-6 p-0"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs mt-2">
                    {layouts.find(l => l.id === slide.layout)?.name}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Main Editor */}
        <div className="lg:col-span-3">
          {isPreviewMode ? (
            /* Preview Mode */
            <Card className="bg-gradient-card shadow-medium">
              <CardHeader>
                <CardTitle>Preview: {currentSlideData?.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="aspect-[16/9] bg-white rounded-lg border-2 border-border/40 p-8 shadow-inner">
                  <div className="h-full flex flex-col">
                    <h1 className="text-2xl font-bold text-gray-900 mb-6">
                      {currentSlideData?.title}
                    </h1>
                    <div className="flex-1 overflow-auto">
                      <div className="prose prose-sm max-w-none text-gray-700">
                        {currentSlideData?.content.split('\n').map((line, i) => (
                          <p key={i} className="mb-3">{line}</p>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between items-center mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                    disabled={currentSlide === 0}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Slide {currentSlide + 1} of {slides.length}
                  </span>
                  <Button
                    variant="outline"
                    onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                    disabled={currentSlide === slides.length - 1}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            /* Edit Mode */
            <div className="space-y-6">
              {/* Slide Content */}
              <Card className="bg-gradient-card shadow-medium">
                <CardHeader>
                  <CardTitle>Edit Slide {currentSlide + 1}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Title</label>
                    <Input
                      value={currentSlideData?.title || ""}
                      onChange={(e) => updateSlide("title", e.target.value)}
                      placeholder="Enter slide title..."
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      value={currentSlideData?.content || ""}
                      onChange={(e) => updateSlide("content", e.target.value)}
                      placeholder="Enter slide content..."
                      rows={8}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Layout Options */}
              <Card className="bg-gradient-card shadow-medium">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-primary" />
                    Layout Options
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {layouts.map((layout) => (
                      <div
                        key={layout.id}
                        className={cn(
                          "p-3 rounded-lg border-2 cursor-pointer transition-all duration-smooth",
                          currentSlideData?.layout === layout.id
                            ? "border-primary bg-primary/5 shadow-glow"
                            : "border-border/40 hover:border-primary/50"
                        )}
                        onClick={() => updateSlide("layout", layout.id)}
                      >
                        <layout.icon className={cn(
                          "w-6 h-6 mx-auto mb-2",
                          currentSlideData?.layout === layout.id ? "text-primary" : "text-muted-foreground"
                        )} />
                        <p className="text-xs text-center font-medium">{layout.name}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card className="bg-gradient-card shadow-medium">
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-3 gap-3">
                    <Button variant="outline" className="w-full">
                      <FileImage className="w-4 h-4 mr-2" />
                      Add Chart
                    </Button>
                    <Button variant="outline" className="w-full">
                      <Copy className="w-4 h-4 mr-2" />
                      Copy From Analysis
                    </Button>
                    <Button variant="outline" className="w-full">
                      <Edit3 className="w-4 h-4 mr-2" />
                      AI Enhance
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}