import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Zap,
  ArrowRight,
  Play,
  CheckCircle
} from "lucide-react";
import heroImage from "@/assets/hero-industrial.jpg";

export function HeroSection() {
  const features = [
    "Advanced Statistical Analysis",
    "AI-Powered Insights", 
    "Automated Reporting",
    "Real-time Processing"
  ];

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img 
          src={heroImage}
          alt="Industrial AI Data Analysis"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-background/95 via-background/85 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Hero Content */}
          <div className="space-y-8">
            {/* Badge */}
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 hover:bg-primary/20 transition-colors duration-smooth">
              <Zap className="w-3 h-3 mr-1" />
              AI-Powered Data Analysis
            </Badge>

            {/* Headline */}
            <div className="space-y-4">
              <h1 className="text-4xl lg:text-6xl font-bold leading-tight">
                <span className="text-gradient">AI Engineers</span>
                <br />
                for Your Data
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl">
                Transform your CSV data into actionable insights with advanced statistical analysis, 
                AI-powered pattern recognition, and automated PowerPoint reporting.
              </p>
            </div>

            {/* Features List */}
            <div className="grid grid-cols-2 gap-3">
              {features.map((feature, index) => (
                <div key={index} className="flex items-center space-x-2">
                  <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                  <span className="text-sm font-medium">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                size="lg"
                className="bg-gradient-industrial text-white shadow-strong hover:shadow-glow transition-all duration-smooth group"
              >
                Start Analysis
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-fast" />
              </Button>
              <Button 
                variant="outline" 
                size="lg"
                className="border-primary/20 hover:bg-primary/5 group"
              >
                <Play className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform duration-fast" />
                Watch Demo
              </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-6 pt-8 border-t border-border/40">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">1M+</div>
                <div className="text-sm text-muted-foreground">Rows Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">99.9%</div>
                <div className="text-sm text-muted-foreground">Accuracy</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">10x</div>
                <div className="text-sm text-muted-foreground">Faster Analysis</div>
              </div>
            </div>
          </div>

          {/* Right Column - Feature Cards */}
          <div className="grid gap-6">
            <Card className="p-6 bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                  <BarChart3 className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Statistical Analysis</h3>
                  <p className="text-muted-foreground">Comprehensive descriptive statistics, correlation analysis, and hypothesis testing</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                  <TrendingUp className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Regression Modeling</h3>
                  <p className="text-muted-foreground">Multiple linear regression with R², p-values, and model diagnostics</p>
                </div>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">Automated Reports</h3>
                  <p className="text-muted-foreground">Generate professional PowerPoint presentations with insights and visualizations</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* Floating Elements */}
      <div className="absolute top-20 right-10 w-20 h-20 bg-primary/10 rounded-full animate-float hidden lg:block" />
      <div className="absolute bottom-32 left-16 w-16 h-16 bg-accent/10 rounded-full animate-float animation-delay-2s hidden lg:block" />
    </section>
  );
}