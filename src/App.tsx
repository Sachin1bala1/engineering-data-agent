import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Navigation } from "@/components/ui/navigation";
import { RenderErrorBoundary } from "@/components/common/RenderErrorBoundary";
import Home from "./pages/Home";
import Analytics from "./pages/Analytics";
import { UploadAndAnalyze } from "./pages/uploadandanalyze";
import Features from "./pages/Features";
import About from "./pages/About";
import Blog from "./pages/Blog";
import Contact from "./pages/Contact";
import ExcelUpload from "./pages/ExcelUpload";
import KnowledgeTwin from "./pages/KnowledgeTwin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Navigation />
        {/* [FE #11] Route-level error boundary — catches page-level crashes */}
        <RenderErrorBoundary title="Page failed to load. Try refreshing or navigating to another section.">
          <Routes>
            <Route path="/index.html" element={<Navigate to="/" replace />} />
            <Route path="/index" element={<Navigate to="/" replace />} />
            <Route path="/" element={<Home />} />
            <Route path="/upload" element={<ExcelUpload />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/features" element={<Features />} />
            <Route path="/about" element={<About />} />
            <Route path="/blog" element={<Blog />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/knowledge-twin" element={<KnowledgeTwin />} />
            <Route path="/uploadandanalyze" element={<UploadAndAnalyze />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </RenderErrorBoundary>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
