import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Mail, 
  Phone, 
  MapPin, 
  MessageSquare,
  Clock,
  Globe,
  Users,
  Briefcase,
  ArrowRight,
  CheckCircle
} from "lucide-react";

export default function Contact() {
  const contactInfo = [
    {
      icon: Mail,
      title: "Email Support",
      content: "support@aicsv-interpreter.com",
      description: "24/7 technical support for all users"
    },
    {
      icon: Phone,
      title: "Phone Support",
      content: "+1 (555) 123-4567",
      description: "Business hours: Mon-Fri 9AM-6PM EST"
    },
    {
      icon: MapPin,
      title: "Headquarters",
      content: "San Francisco, CA",
      description: "123 Innovation Drive, Suite 100"
    },
    {
      icon: Clock,
      title: "Response Time",
      content: "< 2 hours",
      description: "Average response time for support tickets"
    }
  ];

  const departments = [
    {
      title: "Sales & Demo",
      description: "Product demonstrations and pricing information",
      icon: Briefcase,
      email: "sales@aicsv-interpreter.com"
    },
    {
      title: "Technical Support",
      description: "Help with platform usage and troubleshooting",
      icon: MessageSquare,
      email: "support@aicsv-interpreter.com"
    },
    {
      title: "Partnerships",
      description: "Integration opportunities and strategic partnerships",
      icon: Users,
      email: "partnerships@aicsv-interpreter.com"
    }
  ];

  const faqs = [
    {
      question: "How quickly can I get started?",
      answer: "You can start analyzing your data immediately after uploading your CSV file. No setup or configuration required."
    },
    {
      question: "What file formats do you support?",
      answer: "We support CSV, Excel (.xlsx, .xls) files up to 50MB in size with automatic encoding detection."
    },
    {
      question: "Is my data secure?",
      answer: "Yes, all data is processed locally with encrypted transmission. We don't store your data and are GDPR compliant."
    },
    {
      question: "Do you offer enterprise pricing?",
      answer: "Yes, we offer custom enterprise plans with volume discounts, dedicated support, and additional features."
    }
  ];

  return (
    <div className="min-h-screen pt-20">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 mb-4">
            Get in Touch
          </Badge>
          <h1 className="text-4xl lg:text-5xl font-bold mb-4">
            We're Here to <span className="text-gradient">Help</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Have questions about our platform? Need technical support? Want to schedule a demo? 
            Our team of experts is ready to assist you.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-8 mb-16">
          {/* Contact Form */}
          <div className="lg:col-span-2">
            <Card className="bg-gradient-card shadow-medium">
              <CardHeader>
                <CardTitle className="text-2xl">Send Us a Message</CardTitle>
                <CardDescription>
                  Fill out the form below and we'll get back to you within 2 hours during business hours.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name *</Label>
                    <Input id="firstName" placeholder="John" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name *</Label>
                    <Input id="lastName" placeholder="Doe" />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address *</Label>
                    <Input id="email" type="email" placeholder="john@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone Number</Label>
                    <Input id="phone" type="tel" placeholder="+1 (555) 123-4567" />
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="company">Company</Label>
                    <Input id="company" placeholder="Your Company Name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="industry">Industry</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select your industry" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="manufacturing">Manufacturing</SelectItem>
                        <SelectItem value="automotive">Automotive</SelectItem>
                        <SelectItem value="aerospace">Aerospace</SelectItem>
                        <SelectItem value="pharmaceuticals">Pharmaceuticals</SelectItem>
                        <SelectItem value="chemicals">Chemicals</SelectItem>
                        <SelectItem value="food">Food & Beverage</SelectItem>
                        <SelectItem value="research">Research & Academia</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="subject">Subject *</Label>
                  <Select>
                    <SelectTrigger>
                      <SelectValue placeholder="What can we help you with?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="demo">Schedule a Demo</SelectItem>
                      <SelectItem value="pricing">Pricing Information</SelectItem>
                      <SelectItem value="technical">Technical Support</SelectItem>
                      <SelectItem value="partnership">Partnership Inquiry</SelectItem>
                      <SelectItem value="enterprise">Enterprise Sales</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea 
                    id="message" 
                    placeholder="Tell us more about your requirements, challenges, or questions..."
                    className="min-h-[120px]"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="newsletter" className="rounded" />
                  <Label htmlFor="newsletter" className="text-sm">
                    I'd like to receive updates about new features and industry insights
                  </Label>
                </div>

                <Button size="lg" className="w-full bg-gradient-industrial text-white group">
                  Send Message
                  <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform duration-fast" />
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Contact Information */}
          <div className="space-y-6">
            <Card className="bg-gradient-card shadow-medium">
              <CardHeader>
                <CardTitle>Contact Information</CardTitle>
                <CardDescription>
                  Multiple ways to reach our team
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {contactInfo.map((info, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <div className="w-10 h-10 bg-gradient-primary rounded-lg flex items-center justify-center flex-shrink-0">
                      <info.icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold">{info.title}</h3>
                      <p className="text-primary font-medium">{info.content}</p>
                      <p className="text-sm text-muted-foreground">{info.description}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-gradient-card shadow-medium">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" className="w-full justify-start">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Live Chat Support
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Globe className="w-4 h-4 mr-2" />
                  Knowledge Base
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Briefcase className="w-4 h-4 mr-2" />
                  Schedule Demo
                </Button>
              </CardContent>
            </Card>

            {/* Office Hours */}
            <Card className="bg-gradient-card shadow-medium">
              <CardHeader>
                <CardTitle>Support Hours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm">Monday - Friday</span>
                  <span className="text-sm font-medium">9:00 AM - 6:00 PM EST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Saturday</span>
                  <span className="text-sm font-medium">10:00 AM - 2:00 PM EST</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Sunday</span>
                  <span className="text-sm font-medium">Email Support Only</span>
                </div>
                <div className="pt-2 border-t border-border/40">
                  <p className="text-xs text-muted-foreground">
                    Emergency technical support available 24/7 for enterprise customers
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Departments */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">
              Get in Touch with the <span className="text-gradient">Right Team</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Connect directly with the appropriate department for faster assistance
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {departments.map((dept, index) => (
              <Card key={index} className="bg-gradient-card shadow-medium hover:shadow-strong transition-all duration-smooth group">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-primary rounded-lg flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform duration-smooth">
                    <dept.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold mb-2">{dept.title}</h3>
                  <p className="text-sm text-muted-foreground mb-4">{dept.description}</p>
                  <Button variant="outline" size="sm" className="w-full">
                    <Mail className="w-3 h-3 mr-2" />
                    {dept.email}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* FAQ Section */}
        <div className="mb-16">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold mb-4">
              Frequently Asked <span className="text-gradient">Questions</span>
            </h2>
            <p className="text-lg text-muted-foreground">
              Quick answers to common questions about our platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {faqs.map((faq, index) => (
              <Card key={index} className="bg-gradient-card shadow-medium">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-primary flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold mb-2">{faq.question}</h3>
                      <p className="text-muted-foreground text-sm">{faq.answer}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="text-center mt-8">
            <Button variant="outline">
              View All FAQs
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </div>

        {/* Enterprise CTA */}
        <Card className="bg-gradient-industrial p-8 text-white text-center">
          <h2 className="text-3xl font-bold mb-4">Enterprise Solutions</h2>
          <p className="text-lg opacity-90 mb-6 max-w-2xl mx-auto">
            Need custom analytics solutions, dedicated support, or volume pricing? 
            Our enterprise team is ready to discuss your specific requirements.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button 
              size="lg"
              variant="secondary"
              className="bg-white text-primary hover:bg-white/90"
            >
              Contact Enterprise Sales
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              className="border-white/20 text-white hover:bg-white/10"
            >
              Request Custom Quote
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}