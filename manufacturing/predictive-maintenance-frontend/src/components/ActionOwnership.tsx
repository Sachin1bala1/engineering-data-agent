import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { RiskAssessment, FailureModeAssessment } from '../types/api';

interface ActionOwnershipProps {
  assessment: RiskAssessment;
  failureModes: FailureModeAssessment[];
  lastUpdated: string;
}

export function ActionOwnership({ assessment, failureModes, lastUpdated }: ActionOwnershipProps) {
  const primary = failureModes.length
    ? [...failureModes].sort((a, b) => b.risk_score - a.risk_score)[0]
    : null;

  const nextInspectionDate = assessment.inspection_interval_days
    ? new Date(new Date(lastUpdated).getTime() + assessment.inspection_interval_days * 86400000)
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Action Ownership</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-700">
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Recommended Action</div>
          <div className="font-medium text-gray-900">{primary?.recommended_action || assessment.recommended_action}</div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Skill Level</div>
            <div>{primary?.skill_level_required || 'operator'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Urgency Window</div>
            <div>{assessment.urgency_bucket || '7-30 days'}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wide">Next Inspection</div>
            <div>{nextInspectionDate ? nextInspectionDate.toLocaleDateString() : 'Not scheduled'}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
