import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { FailureModeAssessment } from '../types/api';

interface AlertExplanationProps {
  failureModes: FailureModeAssessment[];
}

export function AlertExplanation({ failureModes }: AlertExplanationProps) {
  if (!failureModes.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Why This Alert?</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">No active failure modes detected.</CardContent>
      </Card>
    );
  }

  const topMode = [...failureModes].sort((a, b) => b.risk_score - a.risk_score)[0];
  const indicatorSummary = topMode.indicators
    .filter((ind) => ind.status !== 'normal')
    .map((ind) => `${ind.name}: ${ind.status} (${ind.evidence || 'indicator deviation'})`);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Why This Alert?</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm text-gray-700">
        <div className="font-medium text-gray-900">{topMode.failure_mode_id}</div>
        <div>{topMode.explanation}</div>
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Key indicator deviations</div>
          <ul className="list-disc ml-5 mt-1 space-y-1">
            {indicatorSummary.length ? indicatorSummary.map((item, idx) => (
              <li key={idx}>{item}</li>
            )) : <li>No deviations reported.</li>}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
