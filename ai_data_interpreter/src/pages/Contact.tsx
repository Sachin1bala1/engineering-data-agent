
import { Badge } from "@/components/ui/badge";
import { ContactForm } from "@/components/features/contact/ContactForm";
import { ContactInfoSection } from "@/components/features/contact/ContactInfoSection";
import { DepartmentsSection } from "@/components/features/contact/DepartmentsSection";
import { FaqSection } from "@/components/features/contact/FaqSection";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Contact() {
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
          <div className="lg:col-span-2">
            <ContactForm />
          </div>
          <ContactInfoSection />
        </div>

        <DepartmentsSection />

        <FaqSection />

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
