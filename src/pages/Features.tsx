import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Brain,
  Zap,
  Shield,
  Clock,
  Users,
  Download,
  Settings,
  ArrowRight,
  CheckCircle,
  Play
} from "lucide-react";
import analyticsImage from "@/assets/analytics-dashboard.jpg";
import processImage from "@/assets/process-optimization.jpg";

export default function Features() {
  const mainFeatures = [
    {
      icon: BarChart3,
      title: "Advanced Statistical Analysis",
      description: "Comprehensive descriptive statistics, correlation analysis, and data distribution insights",
      details: [
        "Descriptive statistics (mean, median, mode, standard deviation)",
        "Pearson correlation matrices with p-values",
        "Data distribution analysis and outlier detection",
        "Quartile analysis and percentile calculations"
      ],
      category: "Statistics"
    },
    {
      icon: TrendingUp,
      title: "Regression Modeling",
      description: "Multiple linear regression with automatic model selection and diagnostics",
      details: [
        "Automatic dependent variable selection",
        "Multiple linear regression analysis",
        "R² values and model significance testing",
        "Coefficient analysis and interpretation"
      ],
      category: "Modeling"
    },
    {
      icon: Brain,
      title: "AI-Powered Insights",
      description: "Leverage Gemini AI for intelligent pattern recognition and recommendations",
      details: [
        "Automated pattern recognition",
        "Intelligent data interpretation",
        "Process optimization suggestions",
        "Anomaly detection and alerts"
      ],
      category: "AI"
    },
    {
      icon: FileText,
      title: "Professional Reporting",
      description: "Generate publication-ready PowerPoint and PDF reports automatically",
      details: [
        "Automated PowerPoint generation",
        "PDF report exports",
        "Custom slide layouts and formatting",
        "Professional visualizations included"
      ],
      category: "Reporting"
    }
  ];

  const technicalFeatures = [
    {
      title: "Hypothesis Testing",
      description: "Comprehensive statistical testing suite",
      features: ["T-tests (paired and unpaired)", "ANOVA (one-way and two-way)", "Levene's test for variance", "Chi-square tests"]
    },
    {
      title: "Data Visualization",
      description: "Interactive charts and plots",
      features: ["Correlation heatmaps", "Scatter plots with regression lines", "Distribution histograms", "Box plots and violin plots"]
    },
    {
      title: "Process Optimization",
      description: "DOE and improvement suggestions",
      features: ["Design of Experiments guidance", "Factor importance ranking", "Optimization recommendations", "Next experiment suggestions"]
    },
    {
      title: "Enterprise Integration",
      description: "Built for professional workflows",
      features: ["Batch processing capabilities", "API integration ready", "Custom analysis templates", "Multi-user collaboration"]
    }
  ];

  const industryApplications = [
    {
      industry: "Manufacturing",
      applications: ["Quality control analysis", "Process optimization", "Defect rate analysis", "Equipment performance"],
      icon: Settings
    },
    {
      industry: "Research & Development", 
      applications: ["Experimental design", "Statistical validation", "Hypothesis testing", "Publication-ready reports"],
      icon: Brain
    },
    {
      industry: "Operations",
      applications: ["Performance monitoring", "Efficiency analysis", "Cost optimization", "Predictive maintenance"],
      icon: TrendingUp
    }
  ];

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
            Comprehensive Features
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Everything You Need for <span className="text-gradient">Professional Analysis</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            From basic statistics to advanced AI-powered insights, our platform provides 
            all the tools you need for comprehensive data analysis and professional reporting.
          </p>
        </div>

        {/* Feature Tabs */}
        <Tabs defaultValue="overview" className="space-y-8">
          <TabsList className="grid w-full grid-cols-4 mb-8">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="technical">Technical</TabsTrigger>
            <TabsTrigger value="industries">Industries</TabsTrigger>
            <TabsTrigger value="integration">Integration</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-12">
            <div className="grid md:grid-cols-2 gap-8">
              {mainFeatures.map((feature, index) => (
                <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                        <feature.icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <Badge variant="secondary" className="bg-primary/10 text-primary mb-2">
                          {feature.category}
                        </Badge>
                        <CardTitle className="text-xl">{feature.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base mb-6">
                      {feature.description}
                    </CardDescription>
                    <div className="space-y-2">
                      {feature.details.map((detail, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-sm">{detail}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Feature Showcase */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <div>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
                    Live Demo
                  </Badge>
                  <h3 className="text-3xl font-bold mb-4">
                    See It in <span className="text-gradient">Action</span>
                  </h3>
                  <p className="text-lg text-muted-foreground">
                    Watch how our platform transforms raw CSV data into comprehensive 
                    statistical analysis and professional reports in seconds.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-primary font-bold text-sm">1</span>
                    </div>
                    <span>Upload your CSV or Excel file</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-primary font-bold text-sm">2</span>
                    </div>
                    <span>Select analysis type and parameters</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                      <span className="text-primary font-bold text-sm">3</span>
                    </div>
                    <span>Get comprehensive results and reports</span>
                  </div>
                </div>
                <Button className="bg-gradient-industrial text-white group">
                  <Play className="w-4 h-4 mr-2" />
                  Try Interactive Demo
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-fast" />
                </Button>
              </div>
              <div className="relative">
                <img 
                  src={analyticsImage}
                  alt="Analytics Dashboard Demo"
                  className="rounded-lg shadow-strong"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-lg" />
              </div>
            </div>
          </TabsContent>

          {/* Technical Tab */}
          <TabsContent value="technical" className="space-y-8">
            <div className="grid md:grid-cols-2 gap-8">
              {technicalFeatures.map((feature, index) => (
                <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth">
                  <CardHeader>
                    <CardTitle className="text-xl">{feature.title}</CardTitle>
                    <CardDescription className="text-base">
                      {feature.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {feature.features.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-sm">{item}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Technical Specifications */}
            <Card className="bg-gradient-card shadow-medium">
              <CardHeader>
                <CardTitle className="text-2xl">Technical Specifications</CardTitle>
                <CardDescription>
                  Built with enterprise-grade technology for reliability and performance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-3 gap-8">
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      Performance
                    </h4>
                    <ul className="space-y-2 text-sm">
                      <li>• Process files up to 50MB</li>
                      <li>• Handle 1M+ data points</li>
                      <li>• Sub-second response times</li>
                      <li>• Parallel processing support</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4 text-primary" />
                      Security
                    </h4>
                    <ul className="space-y-2 text-sm">
                      <li>• Local data processing</li>
                      <li>• Encrypted data transmission</li>
                      <li>• No data retention</li>
                      <li>• GDPR compliant</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Download className="w-4 h-4 text-primary" />
                      Export Formats
                    </h4>
                    <ul className="space-y-2 text-sm">
                      <li>• PowerPoint (.pptx)</li>
                      <li>• PDF reports</li>
                      <li>• CSV results</li>
                      <li>• PNG/JPG charts</li>
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Industries Tab */}
          <TabsContent value="industries" className="space-y-8">
            <div className="grid md:grid-cols-3 gap-8">
              {industryApplications.map((industry, index) => (
                <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                  <CardHeader className="text-center">
                    <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-smooth">
                      <industry.icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{industry.industry}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {industry.applications.map((app, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-primary flex-shrink-0" />
                          <span className="text-sm">{app}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Industry Showcase */}
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="relative">
                <img 
                  src={processImage}
                  alt="Process Optimization"
                  className="rounded-lg shadow-strong"
                />
                <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent rounded-lg" />
              </div>
              <div className="space-y-6">
                <div>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
                    Industry Applications
                  </Badge>
                  <h3 className="text-3xl font-bold mb-4">
                    Trusted by <span className="text-gradient">Industry Leaders</span>
                  </h3>
                  <p className="text-lg text-muted-foreground">
                    From manufacturing floors to research laboratories, our platform 
                    powers data-driven decisions across industries.
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <Clock className="w-5 h-5 text-primary" />
                    <span>Save 80% of analysis time</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5 text-primary" />
                    <span>Enable team collaboration</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <Shield className="w-5 h-5 text-primary" />
                    <span>Enterprise-grade security</span>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Integration Tab */}
          <TabsContent value="integration" className="space-y-8">
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold mb-4">Seamless Integration</h3>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Integrate our powerful analytics engine into your existing workflows 
                and systems with ease.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <Card className="bg-gradient-card shadow-medium">
                <CardHeader>
                  <CardTitle className="text-xl">API Access</CardTitle>
                  <CardDescription>
                    Programmatic access to all analysis capabilities
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">RESTful API endpoints</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Real-time data processing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Webhook notifications</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Comprehensive documentation</span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">
                    View API Docs
                  </Button>
                </CardContent>
              </Card>

              <Card className="bg-gradient-card shadow-medium">
                <CardHeader>
                  <CardTitle className="text-xl">Enterprise Features</CardTitle>
                  <CardDescription>
                    Advanced capabilities for large organizations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Single Sign-On (SSO)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Role-based access control</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Audit logs and compliance</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-primary" />
                      <span className="text-sm">Dedicated support</span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full">
                    Contact Sales
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* CTA Section */}
        <div className="text-center mt-16 p-8 bg-gradient-industrial rounded-lg">
          <h3 className="text-2xl font-bold text-white mb-4">
            Ready to Experience These Features?
          </h3>
          <p className="text-lg text-white/90 mb-6">
            Start your free analysis today and see how our platform can transform your data workflow.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
            >
              Start Free Trial
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Schedule Demo
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}