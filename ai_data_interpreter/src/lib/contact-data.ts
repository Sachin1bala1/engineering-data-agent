
import {
  Mail,
  Phone,
  MapPin,
  Clock,
  Briefcase,
  MessageSquare,
  Users,
} from "lucide-react";

export const contactInfo = [
  {
    icon: Mail,
    title: "Email Support",
    content: "support@aicsv-interpreter.com",
    description: "24/7 technical support for all users",
  },
  {
    icon: Phone,
    title: "Phone Support",
    content: "+1 (555) 123-4567",
    description: "Business hours: Mon-Fri 9AM-6PM EST",
  },
  {
    icon: MapPin,
    title: "Headquarters",
    content: "San Francisco, CA",
    description: "123 Innovation Drive, Suite 100",
  },
  {
    icon: Clock,
    title: "Response Time",
    content: "< 2 hours",
    description: "Average response time for support tickets",
  },
];

export const departments = [
  {
    title: "Sales & Demo",
    description: "Product demonstrations and pricing information",
    icon: Briefcase,
    email: "sales@aicsv-interpreter.com",
  },
  {
    title: "Technical Support",
    description: "Help with platform usage and troubleshooting",
    icon: MessageSquare,
    email: "support@aicsv-interpreter.com",
  },
  {
    title: "Partnerships",
    description: "Integration opportunities and strategic partnerships",
    icon: Users,
    email: "partnerships@aicsv-interpreter.com",
  },
];

export const faqs = [
  {
    question: "How quickly can I get started?",
    answer:
      "You can start analyzing your data immediately after uploading your CSV file. No setup or configuration required.",
  },
  {
    question: "What file formats do you support?",
    answer:
      "We support CSV and Excel (.xlsx, .xls) files with automatic encoding detection.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes, all data is processed locally with encrypted transmission. We don't store your data and are GDPR compliant.",
  },
  {
    question: "Do you offer enterprise pricing?",
    answer:
      "Yes, we offer custom enterprise plans with volume discounts, dedicated support, and additional features.",
  },
];
