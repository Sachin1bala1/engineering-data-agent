import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Search,
  Calendar,
  User,
  ArrowRight,
  TrendingUp,
  BarChart3,
  Settings,
  Brain,
  FileText,
  Clock
} from "lucide-react";

export default function Blog() {
  const featuredPost = {
    title: "The Future of Manufacturing Analytics: AI-Powered Process Optimization",
    excerpt: "Discover how artificial intelligence is revolutionizing manufacturing processes and enabling unprecedented levels of optimization and quality control.",
    author: "Dr. Sarah Chen",
    date: "2024-01-15",
    readTime: "8 min read",
    category: "AI & Analytics",
    image: "/api/placeholder/800/400"
  };

  const blogPosts = [
    {
      title: "Statistical Process Control in Modern Manufacturing",
      excerpt: "Learn how to implement effective SPC using automated data analysis and real-time monitoring systems.",
      author: "Michael Rodriguez",
      date: "2024-01-12",
      readTime: "6 min read",
      category: "Process Control",
      icon: TrendingUp
    },
    {
      title: "Correlation vs Causation: A Data Scientist's Guide",
      excerpt: "Understanding the critical difference between correlation and causation in industrial data analysis.",
      author: "Dr. Lisa Wang",
      date: "2024-01-10",
      readTime: "5 min read",
      category: "Statistics",
      icon: BarChart3
    },
    {
      title: "Implementing Design of Experiments in Production",
      excerpt: "Practical approaches to DOE methodology for process improvement and optimization.",
      author: "Dr. Sarah Chen",
      date: "2024-01-08",
      readTime: "7 min read",
      category: "Process Engineering",
      icon: Settings
    },
    {
      title: "Machine Learning for Predictive Maintenance",
      excerpt: "How to leverage ML algorithms to predict equipment failures and optimize maintenance schedules.",
      author: "Michael Rodriguez",
      date: "2024-01-05",
      readTime: "9 min read",
      category: "Machine Learning",
      icon: Brain
    },
    {
      title: "Creating Professional Data Reports with AI",
      excerpt: "Best practices for automated report generation and data visualization in manufacturing contexts.",
      author: "Dr. Lisa Wang",
      date: "2024-01-03",
      readTime: "4 min read",
      category: "Reporting",
      icon: FileText
    },
    {
      title: "Hypothesis Testing in Quality Control",
      excerpt: "Comprehensive guide to using t-tests, ANOVA, and other statistical tests for quality assurance.",
      author: "Dr. Sarah Chen",
      date: "2024-01-01",
      readTime: "6 min read",
      category: "Quality Control",
      icon: BarChart3
    }
  ];

  const categories = [
    "All Posts",
    "AI & Analytics", 
    "Process Control",
    "Statistics",
    "Process Engineering",
    "Machine Learning",
    "Quality Control",
    "Reporting"
  ];

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
            Knowledge Hub
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            Expert <span className="text-gradient">Insights</span> & Tutorials
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Learn from industry experts about advanced analytics, statistical methods, 
            and AI-powered process optimization in manufacturing.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col lg:flex-row gap-6 mb-12">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search articles, tutorials, and insights..." 
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((category, index) => (
              <Button
                key={index}
                variant={index === 0 ? "default" : "outline"}
                size="sm"
                className={index === 0 ? "bg-gradient-primary text-white" : ""}
              >
                {category}
              </Button>
            ))}
          </div>
        </div>

        {/* Featured Post */}
        <Card className="mb-12 bg-gradient-card shadow-strong overflow-hidden group">
          <div className="grid lg:grid-cols-2 gap-0">
            <div className="aspect-video lg:aspect-auto bg-gradient-industrial flex items-center justify-center">
              <div className="text-white text-center p-8">
                <Brain className="w-16 h-16 mx-auto mb-4 animate-pulse-soft" />
                <p className="text-lg font-medium">Featured Article</p>
              </div>
            </div>
            <div className="p-8">
              <Badge variant="secondary" className="bg-primary/10 text-primary mb-4">
                {featuredPost.category}
              </Badge>
              <h2 className="text-2xl font-bold mb-4 group-hover:text-primary transition-colors duration-smooth">
                {featuredPost.title}
              </h2>
              <p className="text-muted-foreground mb-6 leading-relaxed">
                {featuredPost.excerpt}
              </p>
              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-1">
                  <User className="w-4 h-4" />
                  {featuredPost.author}
                </div>
                <div className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {featuredPost.date}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {featuredPost.readTime}
                </div>
              </div>
              <Button className="bg-gradient-industrial text-white group">
                Read Full Article
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-fast" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Blog Posts Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
          {blogPosts.map((post, index) => (
            <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <CardHeader>
                <div className="flex items-center justify-between mb-4">
                  <Badge variant="secondary" className="bg-primary/10 text-primary">
                    {post.category}
                  </Badge>
                  <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform duration-smooth">
                    <post.icon className="w-5 h-5 text-white" />
                  </div>
                </div>
                <CardTitle className="text-lg leading-tight group-hover:text-primary transition-colors duration-smooth">
                  {post.title}
                </CardTitle>
                <CardDescription className="text-base">
                  {post.excerpt}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-1">
                    <User className="w-3 h-3" />
                    {post.author}
                  </div>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {post.date}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{post.readTime}</span>
                  <Button variant="ghost" size="sm" className="text-primary hover:bg-primary/10 group">
                    Read More
                    <ArrowRight className="w-3 h-3 ml-1 group-hover:translate-x-1 transition-transform duration-fast" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Newsletter Signup */}
        <Card className="bg-gradient-industrial p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
          <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
            Get the latest insights on data analytics, process optimization, and AI in manufacturing 
            delivered directly to your inbox.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <Input 
              placeholder="Enter your email" 
              className="bg-white/10 border-white/20 text-white placeholder:text-white/70"
            />
            <Button 
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
            >
              Subscribe
            </Button>
          </div>
          <p className="text-sm opacity-70 mt-4">
            No spam, unsubscribe anytime. Join 5,000+ manufacturing professionals.
          </p>
        </Card>

        {/* Related Resources */}
        <div className="mt-16">
          <h2 className="text-3xl font-bold text-center mb-8">
            More <span className="text-gradient">Learning Resources</span>
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="text-center bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-smooth">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold mb-2">Documentation</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Comprehensive guides and API documentation
                </p>
                <Button variant="outline" size="sm">
                  Browse Docs
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-smooth">
                  <Brain className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold mb-2">Tutorials</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Step-by-step tutorials for common use cases
                </p>
                <Button variant="outline" size="sm">
                  Start Learning
                </Button>
              </CardContent>
            </Card>

            <Card className="text-center bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-smooth">
                  <Settings className="w-6 h-6 text-white" />
                </div>
                <h3 className="font-semibold mb-2">Case Studies</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Real-world examples and success stories
                </p>
                <Button variant="outline" size="sm">
                  View Cases
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}