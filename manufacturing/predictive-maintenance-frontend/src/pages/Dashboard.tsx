import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { FileUpload } from '../components/FileUpload';
import { RiskTable } from '../components/RiskTable';
import { AssetSelector } from '../components/AssetSelector';
import { AssetOverview } from '../components/AssetOverview';
import { FailureModeTimeline } from '../components/FailureModeTimeline';
import { IndicatorTrends } from '../components/IndicatorTrends';
import { AlertExplanation } from '../components/AlertExplanation';
import { ActionOwnership } from '../components/ActionOwnership';
import { CopilotPanel } from '../components/CopilotPanel';
import { apiClient, getErrorMessage } from '../lib/api';
import type { RiskSummaryResponse, HealthResponse, AssetDetails } from '../types/api';

export function Dashboard() {
  const [riskSummary, setRiskSummary] = useState<RiskSummaryResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [assetDetails, setAssetDetails] = useState<AssetDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dataVersion, setDataVersion] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [riskData, healthData] = await Promise.all([
        apiClient.getRiskSummary(),
        apiClient.getHealth()
      ]);

      setRiskSummary(riskData);
      setHealth(healthData);

      if (riskData.assessments.length === 0) {
        setSelectedAssetId(null);
        setAssetDetails(null);
      } else if (
        !selectedAssetId ||
        !riskData.assessments.some((assessment) => assessment.asset_id === selectedAssetId)
      ) {
        setSelectedAssetId(riskData.assessments[0].asset_id);
      }

      setDataVersion((version) => version + 1);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Failed to load data'));
      console.error('Dashboard error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAssetId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const loadAssetDetails = async () => {
      if (!selectedAssetId) return;
      try {
        const details = await apiClient.getAssetDetails(selectedAssetId);
        setAssetDetails(details);
      } catch (err: unknown) {
        setError(getErrorMessage(err, 'Failed to load asset details'));
      }
    };

    loadAssetDetails();
  }, [selectedAssetId, dataVersion]);

  const handleUploadSuccess = () => {
    // Refresh data after successful upload
    fetchData();
  };

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-7xl mx-auto">
          <Card className="border-red-200">
            <CardContent className="flex items-center justify-center h-64">
              <div className="text-center">
                <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-red-800 mb-2">Connection Error</h3>
                <p className="text-red-600 mb-4">{error}</p>
                <p className="text-sm text-gray-600 mb-4">
                  Make sure the backend server is running at http://localhost:8000
                </p>
                <Button onClick={fetchData}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Predictive Maintenance Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Monitor asset health and maintenance recommendations
            </p>
          </div>
          <div className="flex items-center gap-3">
            {riskSummary && riskSummary.assessments.length > 0 && (
              <AssetSelector
                assetIds={riskSummary.assessments.map((a) => a.asset_id)}
                selectedAssetId={selectedAssetId}
                onSelect={setSelectedAssetId}
              />
            )}
            <Button onClick={fetchData} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Health Status */}
        {health && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <CheckCircle className="h-8 w-8 text-green-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">System Status</p>
                    <p className="text-2xl font-bold text-gray-900">Healthy</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <TrendingUp className="h-8 w-8 text-blue-600" />
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Assets Monitored</p>
                    <p className="text-2xl font-bold text-gray-900">{health.assets_monitored}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-yellow-100 flex items-center justify-center">
                    <span className="text-yellow-600 font-bold text-sm">
                      {riskSummary?.high_risk_assets || 0}
                    </span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">High Risk Assets</p>
                    <p className="text-2xl font-bold text-gray-900">{riskSummary?.high_risk_assets || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="h-8 w-8 rounded-full bg-red-100 flex items-center justify-center">
                    <span className="text-red-600 font-bold text-sm">
                      {riskSummary?.critical_assets || 0}
                    </span>
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Critical Assets</p>
                    <p className="text-2xl font-bold text-gray-900">{riskSummary?.critical_assets || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* File Upload Section */}
        <div className="max-w-2xl">
          <FileUpload onUploadSuccess={handleUploadSuccess} />
        </div>

        {assetDetails && (
          <>
            <AssetOverview assessment={assetDetails.risk_assessment} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <FailureModeTimeline events={assetDetails.failure_mode_timeline} />
              <AlertExplanation failureModes={assetDetails.failure_mode_breakdown} />
            </div>

            <IndicatorTrends
              sensorHistory={assetDetails.sensor_history}
              baselineBands={assetDetails.baseline_bands}
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ActionOwnership
                assessment={assetDetails.risk_assessment}
                failureModes={assetDetails.failure_mode_breakdown}
                lastUpdated={assetDetails.last_updated}
              />
              <CopilotPanel assetId={assetDetails.asset_id} />
            </div>
          </>
        )}

        {/* Risk Assessment Table */}
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Asset Risk Assessment</h2>
            <p className="text-gray-600">
              Real-time risk scores and maintenance recommendations based on sensor data
            </p>
          </div>

          <RiskTable
            assessments={riskSummary?.assessments || []}
            isLoading={isLoading && !riskSummary}
          />
        </div>

        {/* Footer */}
        <div className="text-center text-sm text-gray-500 py-8 border-t">
          <p>Predictive Maintenance System - Powered by deterministic engineering logic</p>
          <p className="mt-1">No AI/ML required - based on established industrial standards</p>
        </div>
      </div>
    </div>
  );
}
