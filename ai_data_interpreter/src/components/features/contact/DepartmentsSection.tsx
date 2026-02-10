
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { departments } from "@/lib/contact-data";
import { Mail } from "lucide-react";

export function DepartmentsSection() {
  return (
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
  );
}
