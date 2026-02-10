
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { contactInfo } from "@/lib/contact-data";
import { MessageSquare, Globe, Briefcase } from "lucide-react";

export function ContactInfoSection() {
  return (
    <div className="space-y-6">
      <Card className="bg-gradient-card shadow-medium">
        <CardHeader>
          <CardTitle>Contact Information</CardTitle>
          <CardDescription>Multiple ways to reach our team</CardDescription>
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
  );
}
