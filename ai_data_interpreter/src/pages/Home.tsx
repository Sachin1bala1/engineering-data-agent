import { HeroSection } from "@/components/ui/hero-section";
import { AnalyticsUpload } from "@/components/features/analytics-upload";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  TrendingUp, 
  FileText, 
  Zap,
  Users,
  Shield,
  Clock,
  ArrowRight,
  Star,
  Quote
} from "lucide-react";
import analyticsImage from "@/assets/analytics-dashboard.jpg";
import processImage from "@/assets/process-optimization.jpg";

export default function Home() {
  const capabilities = [
    {
      icon: BarChart3,
      title: "Advanced Statistics",
      description: "Comprehensive descriptive statistics, correlation matrices with p-values, and hypothesis testing including t-tests, ANOVA, and Levene's tests.",
      features: ["Pearson Correlations", "Hypothesis Testing", "Descriptive Analytics"]
    },
    {
      icon: TrendingUp,
      title: "Regression Analysis", 
      description: "Multiple linear regression with automatic dependent variable selection, R² values, coefficients, and detailed model diagnostics.",
      features: ["Linear Regression", "Model Diagnostics", "Predictive Analytics"]
    },
    {
      icon: FileText,
      title: "Automated Reporting",
      description: "Generate professional PowerPoint presentations and PDF reports with statistical results, visualizations, and actionable insights.",
      features: ["PowerPoint Export", "PDF Reports", "Custom Visualizations"]
    },
    {
      icon: Zap,
      title: "AI-Powered Insights",
      description: "Leverage Gemini AI for intelligent data interpretation, pattern recognition, and recommendations for process optimization.",
      features: ["AI Interpretation", "Pattern Recognition", "Smart Recommendations"]
    }
  ];

  const benefits = [
    {
      icon: Clock,
      title: "10x Faster Analysis",
      description: "Reduce analysis time from hours to minutes with automated statistical computing and AI-powered insights."
    },
    {
      icon: Shield,
      title: "Enterprise Security",
      description: "Your data remains secure with local processing and enterprise-grade security protocols."
    },
    {
      icon: Users,
      title: "Team Collaboration",
      description: "Share reports and insights seamlessly across your organization with professional formatting."
    }
  ];

  const testimonials = [
    {
      name: "Dr. Sarah Chen",
      role: "Process Engineer",
      company: "Manufacturing Corp",
      content: "This tool transformed our quality control process. The automated statistical analysis saves us 80% of our time.",
      rating: 5
    },
    {
      name: "Mike Rodriguez",
      role: "Data Analyst", 
      company: "Industrial Solutions",
      content: "The AI-powered insights helped us identify process improvements we never would have found manually.",
      rating: 5
    },
    {
      name: "Lisa Wang",
      role: "Operations Manager",
      company: "Tech Manufacturing",
      content: "Professional PowerPoint reports make it easy to present findings to stakeholders. Game-changer for our team.",
      rating: 5
    }
  ];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <HeroSection />

      {/* Analytics Demo Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
              Try It Now
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Start Your Analysis in <span className="text-gradient">Seconds</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Upload your CSV or Excel file and get comprehensive statistical analysis, 
              regression modeling, and professional reports instantly.
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <AnalyticsUpload />
          </div>
        </div>
      </section>

      {/* Capabilities Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Powerful <span className="text-gradient">Analytical Capabilities</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Our AI-powered platform combines advanced statistical methods with intelligent automation 
              to deliver insights that drive process optimization and data-driven decisions.
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center mb-16">
            <div className="space-y-8">
              {capabilities.slice(0, 2).map((capability, index) => (
                <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                        <capability.icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{capability.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base mb-4">
                      {capability.description}
                    </CardDescription>
                    <div className="flex flex-wrap gap-2">
                      {capability.features.map((feature, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-primary/10 text-primary">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="relative">
              <img 
                src={analyticsImage}
                alt="Analytics Dashboard"
                className="rounded-lg shadow-strong"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-lg" />
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="order-2 lg:order-1 relative">
              <img 
                src={processImage}
                alt="Process Optimization"
                className="rounded-lg shadow-strong"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-accent/20 to-transparent rounded-lg" />
            </div>

            <div className="order-1 lg:order-2 space-y-8">
              {capabilities.slice(2, 4).map((capability, index) => (
                <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                        <capability.icon className="w-6 h-6 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">{capability.title}</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="text-base mb-4">
                      {capability.description}
                    </CardDescription>
                    <div className="flex flex-wrap gap-2">
                      {capability.features.map((feature, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-primary/10 text-primary">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Why Choose <span className="text-gradient">AI CSV Interpreter</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Experience the power of professional-grade data analysis with enterprise features 
              designed for modern manufacturing and process optimization.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <Card key={index} className="text-center bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-smooth">
                    <benefit.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-4">{benefit.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{benefit.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Trusted by <span className="text-gradient">Industry Leaders</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              See how manufacturing and process engineers are transforming their data analysis workflows.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth">
                <CardContent className="p-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <Quote className="w-6 h-6 text-primary mb-4" />
                  <p className="text-muted-foreground mb-6 leading-relaxed">
                    "{testimonial.content}"
                  </p>
                  <div>
                    <p className="font-semibold">{testimonial.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {testimonial.role} at {testimonial.company}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-industrial">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-3xl mx-auto text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-6">
              Ready to Transform Your Data Analysis?
            </h2>
            <p className="text-xl mb-8 opacity-90">
              Start analyzing your CSV data with AI-powered insights and professional reporting. 
              No setup required - upload and analyze in seconds.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button 
                size="lg"
                variant="secondary"
                className="bg-white text-primary hover:bg-white/90 shadow-strong group"
              >
                Start Free Analysis
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-fast" />
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
      </section>
    </div>
  );
}