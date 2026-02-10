import React, { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { AnalyzerCopilotPanel } from '../components/AnalyzerCopilotPanel';
import { apiClient, getErrorMessage } from '../lib/api';
import type {
  AnalyzerPlanResponse,
  AnalyzerReport,
  AnalyzerRunResponse,
} from '../types/api';

type TabKey = 'upload' | 'results';

export function Analyzer() {
  const [datasetFile, setDatasetFile] = useState<File | null>(null);
  const [columnMapping, setColumnMapping] = useState('{}');
  const [defaultDate, setDefaultDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [planResponse, setPlanResponse] = useState<AnalyzerPlanResponse | null>(null);
  const [planDraft, setPlanDraft] = useState('');
  const [report, setReport] = useState<AnalyzerReport | null>(null);
  const [runResponse, setRunResponse] = useState<AnalyzerRunResponse | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('upload');
  const [planApproved, setPlanApproved] = useState(false);

  const signalRows = useMemo(() => {
    if (!planResponse) return [];
    return Object.entries(planResponse.profile.signals).map(([name, profile]) => ({
      name,
      ...profile,
    }));
  }, [planResponse]);

  const handleGeneratePlan = async () => {
    if (!datasetFile) {
      setError('Dataset file is required.');
      return;
    }
    setError(null);
    setIsPlanning(true);
    try {
      const formData = new FormData();
      formData.append('dataset_file', datasetFile, datasetFile.name);
      if (columnMapping.trim()) {
        formData.append('column_mapping', columnMapping);
      }
      if (defaultDate.trim()) {
        formData.append('default_date', defaultDate);
      }
      if (startDate.trim()) {
        formData.append('start_date', startDate);
      }
      const response = await apiClient.getAnalyzerPlan(formData);
      setPlanResponse(response);
      setPlanDraft(JSON.stringify(response.plan, null, 2));
      setPlanApproved(false);
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Plan generation failed'));
    } finally {
      setIsPlanning(false);
    }
  };

  const handleRun = async () => {
    if (!datasetFile || !planDraft.trim()) {
      setError('Dataset file and approved plan are required.');
      return;
    }
    if (!planApproved) {
      setError('Approve the plan before running.');
      return;
    }
    setError(null);
    setIsRunning(true);
    try {
      const formData = new FormData();
      formData.append('dataset_file', datasetFile, datasetFile.name);
      formData.append('plan_json', planDraft);
      if (columnMapping.trim()) {
        formData.append('column_mapping', columnMapping);
      }
      if (defaultDate.trim()) {
        formData.append('default_date', defaultDate);
      }
      if (startDate.trim()) {
        formData.append('start_date', startDate);
      }
      const response = await apiClient.runAnalyzer(formData);
      setRunResponse(response);
      if (response.report_id) {
        const reportData = await apiClient.getAnalyzerReport(response.report_id);
        setReport(reportData);
        setActiveTab('results');
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Execution failed'));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-2 text-sm">
          <Button
            variant={activeTab === 'upload' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('upload')}
          >
            Dataset Upload
          </Button>
          <Button
            variant={activeTab === 'results' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('results')}
            disabled={!report}
          >
            Results Panel
          </Button>
        </div>

        {activeTab === 'upload' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Dataset Upload</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  onChange={(event) => setDatasetFile(event.target.files?.[0] ?? null)}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">Column mapping (JSON)</div>
                    <textarea
                      value={columnMapping}
                      onChange={(event) => setColumnMapping(event.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-xs font-mono min-h-[120px]"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-gray-500">Time normalization</div>
                    <input
                      type="date"
                      value={defaultDate}
                      onChange={(event) => setDefaultDate(event.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
                      placeholder="Default date"
                    />
                    <input
                      type="date"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value)}
                      className="border border-gray-300 rounded-md px-3 py-2 text-sm w-full"
                      placeholder="Start date"
                    />
                    <div className="text-xs text-gray-500">
                      Use for time-only or relative timestamps.
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Button onClick={handleGeneratePlan} disabled={isPlanning}>
                    {isPlanning ? 'Profiling...' : 'Generate Analysis Plan'}
                  </Button>
                </div>

                {error && <div className="text-sm text-red-600">{error}</div>}
                {runResponse?.message && <div className="text-xs text-gray-500">{runResponse.message}</div>}
              </CardContent>
            </Card>

            {planResponse && (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Dataset Preview</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-left text-gray-500">
                        <tr>
                          {Object.keys(planResponse.profile.preview_rows[0] || {}).map((key) => (
                            <th key={key} className="p-2">{key}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {planResponse.profile.preview_rows.map((row, idx) => (
                          <tr key={idx} className="border-t">
                            {Object.values(row).map((value, colIdx) => (
                              <td key={colIdx} className="p-2">{String(value)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Column Typing</CardTitle>
                  </CardHeader>
                  <CardContent className="overflow-auto">
                    <table className="min-w-full text-xs">
                      <thead className="text-left text-gray-500">
                        <tr>
                          <th className="p-2">Signal</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Rows</th>
                          <th className="p-2">Missing %</th>
                          <th className="p-2">Distribution</th>
                          <th className="p-2">Stationarity</th>
                          <th className="p-2">Units</th>
                        </tr>
                      </thead>
                      <tbody>
                        {signalRows.map((row) => (
                          <tr key={row.name} className="border-t">
                            <td className="p-2 font-medium">{row.name}</td>
                            <td className="p-2">{row.type}</td>
                            <td className="p-2">{row.rows}</td>
                            <td className="p-2">{row.missing_pct.toFixed(1)}%</td>
                            <td className="p-2">{row.distribution}</td>
                            <td className="p-2">{row.stationarity ?? 'N/A'}</td>
                            <td className="p-2">{row.units ?? 'N/A'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>AI Suggested Analysis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <textarea
                      value={planDraft}
                      onChange={(event) => setPlanDraft(event.target.value)}
                      className="w-full min-h-[220px] text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-3"
                    />
                    <label className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={planApproved}
                        onChange={(event) => setPlanApproved(event.target.checked)}
                      />
                      Approve plan for execution
                    </label>
                    <Button onClick={handleRun} disabled={isRunning}>
                      {isRunning ? 'Running...' : 'Run Analysis'}
                    </Button>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        )}

        {activeTab === 'results' && report && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Results Panel</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="p-2">Signal</th>
                      <th className="p-2">Mean</th>
                      <th className="p-2">Std</th>
                      <th className="p-2">Median</th>
                      <th className="p-2">Min</th>
                      <th className="p-2">Max</th>
                      <th className="p-2">p-values</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(report.results.statistics).map(([signal, stats]) => (
                      <tr key={signal} className="border-t">
                        <td className="p-2 font-medium">{signal}</td>
                        <td className="p-2">{stats.mean?.toFixed(3) ?? 'N/A'}</td>
                        <td className="p-2">{stats.std?.toFixed(3) ?? 'N/A'}</td>
                        <td className="p-2">{stats.median?.toFixed(3) ?? 'N/A'}</td>
                        <td className="p-2">{stats.min?.toFixed(3) ?? 'N/A'}</td>
                        <td className="p-2">{stats.max?.toFixed(3) ?? 'N/A'}</td>
                        <td className="p-2 text-xs">
                          {Object.entries(stats.p_values || {}).map(([key, value]) => (
                            <div key={key}>{key}: {value?.toFixed(4) ?? 'N/A'}</div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Confidence & Warnings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>Confidence score: {(report.confidence.score * 100).toFixed(0)}%</div>
                {report.validation.warnings.length > 0 && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                    {report.validation.warnings.join('; ')}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Engineering Interpretation</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>{report.explanation.summary}</div>
                {report.explanation.conclusions.length > 0 && (
                  <ul className="list-disc ml-5 text-xs text-gray-600">
                    {report.explanation.conclusions.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
                {report.explanation.limitations.length > 0 && (
                  <div className="text-xs text-gray-500">
                    Limitations: {report.explanation.limitations.join('; ')}
                  </div>
                )}
              </CardContent>
            </Card>

            {report.results.plots.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Plots</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.results.plots.map((plot, idx) => (
                    <div key={idx} className="space-y-2">
                      <div className="text-xs text-gray-500">{plot.title}</div>
                      <img src={plot.data_uri} alt={plot.title} className="border rounded" />
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <AnalyzerCopilotPanel report={report} />
          </div>
        )}
      </div>
    </div>
  );
}
