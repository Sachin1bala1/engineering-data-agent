import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { FailureModeTimelineEvent } from '../types/api';

const stageColors: Record<string, string> = {
  early: 'bg-blue-100 text-blue-800',
  mid: 'bg-yellow-100 text-yellow-800',
  late: 'bg-red-100 text-red-800',
};

interface FailureModeTimelineProps {
  events: FailureModeTimelineEvent[];
}

export function FailureModeTimeline({ events }: FailureModeTimelineProps) {
  if (!events.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Failure Mode Timeline</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">No failure mode progression detected.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Failure Mode Timeline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {events.map((event, idx) => (
          <div key={`${event.failure_mode_id}-${idx}`} className="flex items-start gap-3">
            <span className={`mt-1 inline-flex px-2 py-1 rounded text-xs font-semibold ${stageColors[event.stage] || stageColors.early}`}>
              {event.stage.toUpperCase()}
            </span>
            <div className="flex-1">
              <div className="text-sm font-medium text-gray-900">{event.failure_mode_id}</div>
              <div className="text-xs text-gray-500">{new Date(event.timestamp).toLocaleString()}</div>
              <div className="text-sm text-gray-600">{event.description}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
