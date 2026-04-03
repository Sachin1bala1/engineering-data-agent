import React from "react";
import ProjectDashboard from "@/components/enterprise/ProjectDashboard";
import DOEProjectManager from "@/components/enterprise/DOEValidation/DOEProjectManager";
import DOEUploadResults from "@/components/enterprise/DOEValidation/DOEUploadResults";
import DOEAnalysisView from "@/components/enterprise/DOEValidation/DOEAnalysisView";
import DOEConfidencePanel from "@/components/enterprise/DOEValidation/DOEConfidencePanel";
import DOEReportViewer from "@/components/enterprise/DOEValidation/DOEReportViewer";
import DatasetUpload from "@/components/enterprise/DataAnalyzer/DatasetUpload";
import AnalysisPlanner from "@/components/enterprise/DataAnalyzer/AnalysisPlanner";
import ExecutionMonitor from "@/components/enterprise/DataAnalyzer/ExecutionMonitor";
import ValidationResults from "@/components/enterprise/DataAnalyzer/ValidationResults";
import EngineeringSummary from "@/components/enterprise/DataAnalyzer/EngineeringSummary";
import ControlCharts from "@/components/enterprise/SPCDashboard/ControlCharts";
import CapabilityAnalysis from "@/components/enterprise/SPCDashboard/CapabilityAnalysis";
import TrendMonitoring from "@/components/enterprise/SPCDashboard/TrendMonitoring";
import FailureRiskDashboard from "@/components/enterprise/FailurePrediction/FailureRiskDashboard";
import KnowledgeTransferChat from "@/components/enterprise/FailurePrediction/KnowledgeTransferChat";

export default function Enterprise() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold text-slate-900">Enterprise Engineering Console</h1>
        <p className="text-slate-600">
          Industrial-grade workflow for DOE validation, analytics planning, SPC, and failure prediction.
        </p>

        <ProjectDashboard />

        <div className="grid lg:grid-cols-2 gap-6">
          <DOEProjectManager />
          <DOEUploadResults />
          <DOEAnalysisView />
          <DOEConfidencePanel />
          <DOEReportViewer />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <DatasetUpload />
          <AnalysisPlanner />
          <ExecutionMonitor />
          <ValidationResults />
          <EngineeringSummary />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <ControlCharts />
          <CapabilityAnalysis />
          <TrendMonitoring />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <FailureRiskDashboard />
          <KnowledgeTransferChat />
        </div>
      </div>
    </div>
  );
}
