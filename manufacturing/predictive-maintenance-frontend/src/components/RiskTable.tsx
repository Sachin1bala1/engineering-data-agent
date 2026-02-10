import React from 'react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { getRiskColor } from '../lib/api';
import type { RiskAssessment } from '../types/api';

interface RiskTableProps {
  assessments: RiskAssessment[];
  isLoading?: boolean;
}

export function RiskTable({ assessments, isLoading = false }: RiskTableProps) {
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">Loading risk assessments...</div>
        </CardContent>
      </Card>
    );
  }

  if (assessments.length === 0) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-32">
          <div className="text-muted-foreground">No assets to display</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block">
        <Card>
          <CardHeader>
            <CardTitle>Asset Risk Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Asset ID</TableHead>
                  <TableHead>Risk Score</TableHead>
                  <TableHead>Risk Level</TableHead>
                  <TableHead>Failure Mode</TableHead>
                  <TableHead>Recommended Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assessments.map((assessment) => (
                  <TableRow key={assessment.asset_id}>
                    <TableCell className="font-medium">
                      {assessment.asset_id}
                    </TableCell>
                    <TableCell>
                      <Badge variant={getRiskColor(assessment.risk_score)}>
                        {assessment.risk_score}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        assessment.risk_level.toUpperCase() === 'LOW' ? 'bg-green-100 text-green-800' :
                        assessment.risk_level.toUpperCase() === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                        assessment.risk_level.toUpperCase() === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {assessment.risk_level.toUpperCase()}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {assessment.failure_mode || 'None detected'}
                    </TableCell>
                    <TableCell className="max-w-xs">
                      {assessment.recommended_action}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-4">
        {assessments.map((assessment) => (
          <Card key={assessment.asset_id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{assessment.asset_id}</CardTitle>
                <Badge variant={getRiskColor(assessment.risk_score)}>
                  {assessment.risk_score}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Risk Level</div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${
                  assessment.risk_level.toUpperCase() === 'LOW' ? 'bg-green-100 text-green-800' :
                  assessment.risk_level.toUpperCase() === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                  assessment.risk_level.toUpperCase() === 'HIGH' ? 'bg-orange-100 text-orange-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {assessment.risk_level.toUpperCase()}
                </span>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Failure Mode</div>
                <div className="text-sm">{assessment.failure_mode || 'None detected'}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-muted-foreground mb-1">Recommended Action</div>
                <div className="text-sm">{assessment.recommended_action}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
