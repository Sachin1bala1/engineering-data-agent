import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Target, 
  Eye, 
  Heart, 
  Users,
  Briefcase,
  GraduationCap,
  Award,
  TrendingUp,
  BarChart3,
  Brain
} from "lucide-react";

export default function About() {
  const team = [
    {
      name: "Dr. Sarah Chen",
      role: "Chief Data Scientist",
      background: "Former Principal Engineer at Tesla, PhD in Industrial Engineering from MIT",
      icon: Brain,
      specialties: ["Statistical Modeling", "Process Optimization", "AI/ML Systems"]
    },
    {
      name: "Michael Rodriguez",
      role: "Lead Software Engineer",
      background: "Ex-Google Senior Engineer, MS Computer Science from Stanford",
      icon: BarChart3,
      specialties: ["Full-Stack Development", "Data Visualization", "System Architecture"]
    },
    {
      name: "Dr. Lisa Wang",
      role: "Head of Product",
      background: "Former McKinsey Principal, PhD in Operations Research from Stanford",
      icon: TrendingUp,
      specialties: ["Product Strategy", "User Experience", "Business Intelligence"]
    }
  ];

  const values = [
    {
      icon: Target,
      title: "Data-Driven Excellence",
      description: "We believe every decision should be backed by solid statistical evidence and comprehensive analysis."
    },
    {
      icon: Users,
      title: "Democratizing Analytics",
      description: "Making advanced statistical analysis accessible to engineers and researchers regardless of their statistical background."
    },
    {
      icon: Heart,
      title: "Industrial Impact",
      description: "Focused on solving real manufacturing and process engineering challenges with practical, actionable insights."
    }
  ];

  const milestones = [
    {
      year: "2023",
      title: "Company Founded",
      description: "Started with a mission to democratize advanced data analysis for industrial applications"
    },
    {
      year: "2023",
      title: "AI Integration",
      description: "Integrated Gemini AI for intelligent pattern recognition and automated insights generation"
    },
    {
      year: "2024",
      title: "Enterprise Launch",
      description: "Launched enterprise features with API access and advanced security capabilities"
    },
    {
      year: "2024",
      title: "Industry Adoption",
      description: "Adopted by leading manufacturing companies for process optimization and quality control"
    }
  ];

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
            Our Story
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-6">
            Empowering <span className="text-gradient">Data-Driven Decisions</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            We're on a mission to democratize advanced statistical analysis and AI-powered insights 
            for manufacturing and process engineering professionals worldwide.
          </p>
        </div>

        {/* Mission & Vision */}
        <div className="grid lg:grid-cols-2 gap-12 mb-20">
          <Card className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center">
                  <Target className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-2xl">Our Mission</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg text-muted-foreground leading-relaxed">
                To transform how industrial professionals analyze and interpret data by providing 
                enterprise-grade statistical analysis tools that are both powerful and accessible. 
                We believe that every engineer should have access to advanced analytics without 
                needing a PhD in statistics.
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth">
            <CardHeader>
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center">
                  <Eye className="w-6 h-6 text-white" />
                </div>
                <CardTitle className="text-2xl">Our Vision</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-lg text-muted-foreground leading-relaxed">
                A world where data-driven decision making is the standard in manufacturing and 
                process engineering. Where insights are instant, reports are automated, and 
                every process optimization is backed by robust statistical evidence and AI-powered 
                recommendations.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Values */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Our <span className="text-gradient">Core Values</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              The principles that guide everything we do and every decision we make.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <Card key={index} className="text-center bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                <CardContent className="p-8">
                  <div className="w-16 h-16 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-6 group-hover:scale-110 transition-transform duration-smooth">
                    <value.icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-bold mb-4">{value.title}</h3>
                  <p className="text-muted-foreground leading-relaxed">{value.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Meet Our <span className="text-gradient">Expert Team</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Industry veterans with deep expertise in data science, software engineering, 
              and industrial process optimization.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {team.map((member, index) => (
              <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                <CardHeader className="text-center">
                  <div className="w-20 h-20 bg-gradient-primary rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-smooth">
                    <member.icon className="w-10 h-10 text-white" />
                  </div>
                  <CardTitle className="text-xl">{member.name}</CardTitle>
                  <CardDescription className="text-primary font-medium">
                    {member.role}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                    {member.background}
                  </p>
                  <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Specialties:</h4>
                    <div className="flex flex-wrap gap-2">
                      {member.specialties.map((specialty, idx) => (
                        <Badge key={idx} variant="secondary" className="bg-primary/10 text-primary text-xs">
                          {specialty}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Company Timeline */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Our <span className="text-gradient">Journey</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Key milestones in our mission to transform industrial data analysis.
            </p>
          </div>

          <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-1/2 transform -translate-x-px h-full w-0.5 bg-gradient-primary hidden lg:block"></div>
            
            <div className="space-y-8">
              {milestones.map((milestone, index) => (
                <div key={index} className={`flex items-center gap-8 ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'}`}>
                  <div className={`flex-1 ${index % 2 === 0 ? 'lg:text-right' : 'lg:text-left'}`}>
                    <Card className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth">
                      <CardContent className="p-6">
                        <Badge variant="secondary" className="bg-primary/10 text-primary mb-2">
                          {milestone.year}
                        </Badge>
                        <h3 className="text-xl font-bold mb-2">{milestone.title}</h3>
                        <p className="text-muted-foreground">{milestone.description}</p>
                      </CardContent>
                    </Card>
                  </div>
                  
                  {/* Timeline dot */}
                  <div className="hidden lg:flex w-4 h-4 bg-gradient-primary rounded-full flex-shrink-0 z-10"></div>
                  
                  <div className="flex-1 hidden lg:block"></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-20">
          <Card className="bg-gradient-industrial p-8 text-white">
            <div className="text-center mb-8">
              <h2 className="text-3xl font-bold mb-4">Impact by the Numbers</h2>
              <p className="text-lg opacity-90">
                The difference we're making in industrial data analysis
              </p>
            </div>
            
            <div className="grid md:grid-cols-4 gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">1M+</div>
                <div className="text-sm opacity-90">Data Points Analyzed</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">500+</div>
                <div className="text-sm opacity-90">Manufacturing Companies</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">80%</div>
                <div className="text-sm opacity-90">Time Savings Achieved</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold mb-2">99.9%</div>
                <div className="text-sm opacity-90">Analysis Accuracy</div>
              </div>
            </div>
          </Card>
        </div>

        {/* Recognition */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Industry <span className="text-gradient">Recognition</span>
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="text-center bg-gradient-card shadow-medium p-6">
              <Award className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Best Analytics Platform</h3>
              <p className="text-sm text-muted-foreground">Manufacturing Tech Awards 2024</p>
            </Card>
            
            <Card className="text-center bg-gradient-card shadow-medium p-6">
              <GraduationCap className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Innovation Excellence</h3>
              <p className="text-sm text-muted-foreground">Industrial AI Summit 2024</p>
            </Card>
            
            <Card className="text-center bg-gradient-card shadow-medium p-6">
              <Briefcase className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Top B2B Solution</h3>
              <p className="text-sm text-muted-foreground">SaaS Awards 2024</p>
            </Card>
            
            <Card className="text-center bg-gradient-card shadow-medium p-6">
              <Users className="w-12 h-12 text-primary mx-auto mb-4" />
              <h3 className="font-semibold mb-2">Customer Choice</h3>
              <p className="text-sm text-muted-foreground">Process Engineering Review</p>
            </Card>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Card className="bg-gradient-card shadow-medium p-8">
            <h2 className="text-3xl font-bold mb-4">
              Join Our <span className="text-gradient">Mission</span>
            </h2>
            <p className="text-lg text-muted-foreground mb-6 max-w-2xl mx-auto">
              Whether you're a data scientist, process engineer, or manufacturing professional, 
              we'd love to hear from you and explore how we can work together.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="bg-gradient-industrial text-white">
                Get Started Today
              </Button>
              <Button variant="outline" size="lg">
                Contact Our Team
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}