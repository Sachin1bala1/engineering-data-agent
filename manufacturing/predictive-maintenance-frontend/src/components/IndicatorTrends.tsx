import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { SensorHistoryPoint, BaselineBand } from '../types/api';

interface IndicatorTrendsProps {
  sensorHistory: SensorHistoryPoint[];
  baselineBands: Record<string, BaselineBand>;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString();
}

function TrendChart({
  title,
  dataKey,
  color,
  data,
  baseline,
}: {
  title: string;
  dataKey: keyof SensorHistoryPoint;
  color: string;
  data: SensorHistoryPoint[];
  baseline?: BaselineBand;
}) {
  const bandMin = baseline ? baseline.mean - baseline.std : undefined;
  const bandMax = baseline ? baseline.mean + baseline.std : undefined;
  const bandMin2 = baseline ? baseline.mean - 2 * baseline.std : undefined;
  const bandMax2 = baseline ? baseline.mean + 2 * baseline.std : undefined;
  const values = data
    .map((point) => point[dataKey])
    .filter((value): value is number => typeof value === 'number');
  const dataMin = values.length ? Math.min(...values) : undefined;
  const dataMax = values.length ? Math.max(...values) : undefined;

  return (
    <div className="h-64">
      <div className="flex items-center justify-between text-sm font-medium text-gray-700 mb-2">
        <span>{title}</span>
        {baseline && bandMin !== undefined && bandMax !== undefined && bandMin2 !== undefined && bandMax2 !== undefined && (
          <span className="text-xs text-gray-500">
            <span className="inline-flex items-center mr-2">
              <span className="inline-block h-2 w-2 rounded-full bg-green-500 mr-1" />
              ±1σ
            </span>
            <span className="inline-flex items-center mr-2">
              <span className="inline-block h-2 w-2 rounded-full bg-yellow-400 mr-1" />
              ±2σ
            </span>
            <span className="inline-flex items-center">
              <span className="inline-block h-2 w-2 rounded-full bg-red-400 mr-1" />
              &gt;2σ
            </span>
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <XAxis dataKey="timestamp" tickFormatter={formatTime} />
          <YAxis />
          <Tooltip labelFormatter={(value) => new Date(value as string).toLocaleString()} />
          {baseline && bandMin !== undefined && bandMax !== undefined && bandMin2 !== undefined && bandMax2 !== undefined && (
            <>
              {dataMin !== undefined && dataMin < bandMin2 && (
                <ReferenceArea y1={dataMin} y2={bandMin2} fill="#FCA5A5" fillOpacity={0.25} />
              )}
              <ReferenceArea y1={bandMin2} y2={bandMin} fill="#FDE68A" fillOpacity={0.35} />
              <ReferenceArea y1={bandMin} y2={bandMax} fill="#BBF7D0" fillOpacity={0.35} />
              <ReferenceArea y1={bandMax} y2={bandMax2} fill="#FDE68A" fillOpacity={0.35} />
              {dataMax !== undefined && dataMax > bandMax2 && (
                <ReferenceArea y1={bandMax2} y2={dataMax} fill="#FCA5A5" fillOpacity={0.25} />
              )}
            </>
          )}
          <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function IndicatorTrends({ sensorHistory, baselineBands }: IndicatorTrendsProps) {
  if (!sensorHistory.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Indicator Trends</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-gray-500">No sensor history available.</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Indicator Trends</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <TrendChart
          title="Temperature (C)"
          dataKey="temperature"
          color="#DC2626"
          data={sensorHistory}
          baseline={baselineBands.temperature}
        />
        <TrendChart
          title="Vibration (mm/s)"
          dataKey="vibration"
          color="#2563EB"
          data={sensorHistory}
          baseline={baselineBands.vibration}
        />
        <TrendChart
          title="Alarm Frequency (count/hr)"
          dataKey="alarm_frequency"
          color="#059669"
          data={sensorHistory}
          baseline={baselineBands.alarm_frequency}
        />
      </CardContent>
    </Card>
  );
}
