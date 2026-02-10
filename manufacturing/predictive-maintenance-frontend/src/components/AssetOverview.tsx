import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { RiskAssessment } from '../types/api';

const riskClasses: Record<string, string> = {
  LOW: 'bg-green-100 text-green-800',
  MEDIUM: 'bg-yellow-100 text-yellow-800',
  HIGH: 'bg-orange-100 text-orange-800',
  CRITICAL: 'bg-red-100 text-red-800',
};

interface AssetOverviewProps {
  assessment: RiskAssessment;
}

export function AssetOverview({ assessment }: AssetOverviewProps) {
  const riskLevel = assessment.risk_level?.toUpperCase() || 'LOW';
  const primary = assessment.primary_failure_mode || assessment.failure_mode || 'none';
  const secondary = assessment.secondary_failure_modes?.length
    ? assessment.secondary_failure_modes.join(', ')
    : 'none';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Asset Overview</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <div className="text-sm text-gray-500">Overall Risk Score</div>
          <div className="text-3xl font-semibold text-gray-900">{assessment.risk_score.toFixed(1)}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Risk Level</div>
          <span className={`inline-flex px-2 py-1 rounded text-xs font-semibold ${riskClasses[riskLevel] || riskClasses.LOW}`}>
            {riskLevel}
          </span>
        </div>
        <div>
          <div className="text-sm text-gray-500">Primary / Secondary Modes</div>
          <div className="text-sm font-medium text-gray-900">Primary: {primary}</div>
          <div className="text-sm text-gray-600">Secondary: {secondary}</div>
        </div>
      </CardContent>
    </Card>
  );
}
