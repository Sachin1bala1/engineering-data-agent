
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { faqs } from "@/lib/contact-data";
import { ArrowRight, CheckCircle } from "lucide-react";

export function FaqSection() {
  return (
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
  );
}
