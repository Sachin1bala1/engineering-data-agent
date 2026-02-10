import React, { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { apiClient, getErrorMessage } from '../lib/api';
import type { DOEReport, DOEUploadResponse, ScriptRunResponse } from '../types/api';

type TabKey = 'upload' | 'analysis' | 'report';

export function Doe() {
  const [baselineFile, setBaselineFile] = useState<File | null>(null);
  const [experimentFile, setExperimentFile] = useState<File | null>(null);
  const [processName, setProcessName] = useState('');
  const [engineer, setEngineer] = useState('');
  const [baselineDescription, setBaselineDescription] = useState('');
  const [experimentDescription, setExperimentDescription] = useState('');
  const [doeFactors, setDoeFactors] = useState('{}');
  const [columnMapping, setColumnMapping] = useState('{}');
  const [defaultDate, setDefaultDate] = useState('');
  const [startDate, setStartDate] = useState('');
  const [report, setReport] = useState<DOEReport | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('upload');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<DOEUploadResponse | null>(null);
  const [showDeltaChart, setShowDeltaChart] = useState(false);
  const [activeScript, setActiveScript] = useState<string>('');
  const [runResult, setRunResult] = useState<ScriptRunResponse | null>(null);
  const [isRunningScript, setIsRunningScript] = useState(false);

  const comparisonRows = useMemo(() => report?.comparison_table ?? [], [report]);

  const handleSubmit = async () => {
    if (!baselineFile || !experimentFile || !processName.trim() || !engineer.trim()) {
      setError('Baseline, experiment, process name, and engineer are required.');
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('baseline_file', baselineFile, baselineFile.name);
      formData.append('experiment_file', experimentFile, experimentFile.name);
      formData.append('process_name', processName);
      formData.append('engineer', engineer);
      if (baselineDescription.trim()) {
        formData.append('baseline_description', baselineDescription);
      }
      if (experimentDescription.trim()) {
        formData.append('experiment_description', experimentDescription);
      }
      if (doeFactors.trim()) {
        formData.append('doe_factors', doeFactors);
      }
      if (columnMapping.trim()) {
        formData.append('column_mapping', columnMapping);
      }
      if (defaultDate.trim()) {
        formData.append('default_date', defaultDate);
      }
      if (startDate.trim()) {
        formData.append('start_date', startDate);
      }
      const upload = await apiClient.uploadDoeComparison(formData);
      setResponse(upload);
      if (upload.report_id) {
        const reportData = await apiClient.getDoeReport(upload.report_id);
        setReport(reportData);
        setActiveTab('analysis');
        if (reportData.plot_scripts?.length) {
          setActiveScript(reportData.plot_scripts[0].code);
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'DOE comparison failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {(['upload', 'analysis', 'report'] as TabKey[]).map((tab) => (
            <Button
              key={tab}
              variant={activeTab === tab ? 'default' : 'outline'}
              size="sm"
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'upload' && 'Upload & Mapping'}
              {tab === 'analysis' && 'Analysis Dashboard'}
              {tab === 'report' && 'DOE Validation Report'}
            </Button>
          ))}
        </div>

        {activeTab === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle>Upload & Mapping</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Baseline Excel/CSV</div>
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={(event) => setBaselineFile(event.target.files?.[0] ?? null)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-xs text-gray-500">Experiment Excel/CSV</div>
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    onChange={(event) => setExperimentFile(event.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Process name"
                  value={processName}
                  onChange={(event) => setProcessName(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
                <input
                  type="text"
                  placeholder="Engineer"
                  value={engineer}
                  onChange={(event) => setEngineer(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <textarea
                  placeholder="Baseline description"
                  value={baselineDescription}
                  onChange={(event) => setBaselineDescription(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[90px]"
                />
                <textarea
                  placeholder="Experiment description"
                  value={experimentDescription}
                  onChange={(event) => setExperimentDescription(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm min-h-[90px]"
                />
              </div>

              <div className="space-y-2">
                <div className="text-xs text-gray-500">DOE factors (JSON)</div>
                <textarea
                  value={doeFactors}
                  onChange={(event) => setDoeFactors(event.target.value)}
                  className="border border-gray-300 rounded-md px-3 py-2 text-xs font-mono min-h-[120px]"
                />
              </div>

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
                <Button onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? 'Running...' : 'Run DOE Comparison'}
                </Button>
                {response?.message && <div className="text-xs text-gray-500">{response.message}</div>}
              </div>

              {error && <div className="text-sm text-red-600">{error}</div>}
              {response?.errors?.length ? (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                  Errors: {response.errors.join('; ')}
                </div>
              ) : null}
              {response?.warnings?.length ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Warnings: {response.warnings.join('; ')}
                </div>
              ) : null}
              {report?.context?.time_assumptions?.length ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  Time assumptions: {report.context.time_assumptions.join(', ')}
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}

        {activeTab === 'analysis' && report && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Quantitative Comparison Table</CardTitle>
              </CardHeader>
              <CardContent className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-gray-500">
                    <tr>
                      <th className="p-2">Parameter</th>
                      <th className="p-2">Baseline Mean</th>
                      <th className="p-2">Experiment Mean</th>
                      <th className="p-2">Δ (%)</th>
                      <th className="p-2">Variance Δ</th>
                      <th className="p-2">Test Used</th>
                      <th className="p-2">p-value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonRows.map((row) => (
                      <tr key={row.parameter} className="border-t">
                        <td className="p-2 font-medium">{row.parameter}</td>
                        <td className="p-2">{row.baseline_mean.toFixed(3)}</td>
                        <td className="p-2">{row.experiment_mean.toFixed(3)}</td>
                        <td className="p-2">{row.delta_percent?.toFixed(2) ?? 'N/A'}%</td>
                        <td className="p-2">{row.variance_change?.toFixed(2) ?? 'N/A'}</td>
                        <td className="p-2">{row.test_used ?? 'N/A'}</td>
                        <td className="p-2">
                          {row.p_value !== null && row.p_value !== undefined
                            ? row.p_value.toFixed(4)
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Chart on Demand</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="outline" size="sm" onClick={() => setShowDeltaChart((v) => !v)}>
                  {showDeltaChart ? 'Hide Δ% Chart' : 'Show Δ% Chart'}
                </Button>
                {showDeltaChart && (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={comparisonRows.map((row) => ({
                        parameter: row.parameter,
                        delta: row.delta_percent ?? 0,
                      }))}>
                        <XAxis dataKey="parameter" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="delta" fill="#1F2937" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {report.plot_scripts?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>AI-Requested Plots</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <select
                    value={activeScript}
                    onChange={(event) => setActiveScript(event.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm bg-white"
                  >
                    {report.plot_scripts.map((script, idx) => (
                      <option key={idx} value={script.code}>{script.title}</option>
                    ))}
                  </select>

                  <textarea
                    value={activeScript}
                    onChange={(event) => setActiveScript(event.target.value)}
                    className="w-full min-h-[220px] text-xs font-mono whitespace-pre-wrap bg-gray-50 border rounded p-3"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        if (!activeScript.trim()) return;
                        setIsRunningScript(true);
                        setError(null);
                        try {
                          const result = await apiClient.runScript({ code: activeScript, timeout_sec: 40 });
                          setRunResult(result);
                        } catch (err: unknown) {
                          setError(getErrorMessage(err, 'Script execution failed'));
                        } finally {
                          setIsRunningScript(false);
                        }
                      }}
                      disabled={isRunningScript || !activeScript.trim()}
                    >
                      {isRunningScript ? 'Running...' : 'Run Plot Script'}
                    </Button>
                  </div>

                  {runResult && (
                    <div className="space-y-2 text-xs text-gray-700">
                      {runResult.stdout && (
                        <pre className="whitespace-pre-wrap bg-gray-50 border rounded p-3">{runResult.stdout}</pre>
                      )}
                      {runResult.stderr && (
                        <pre className="whitespace-pre-wrap bg-red-50 border border-red-200 rounded p-3">
                          {runResult.stderr}
                        </pre>
                      )}
                      {runResult.images.length > 0 && (
                        <div className="space-y-2">
                          {runResult.images.map((image) => (
                            <div key={image.filename} className="space-y-1">
                              <div className="text-[11px] text-gray-500">{image.filename}</div>
                              <img src={image.data_uri} alt={image.filename} className="border rounded" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Stability & Process Risk</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>Drift detected: {report.stability_risk.drift_detected ? 'Yes' : 'No'}</div>
                <div>Noise amplification: {report.stability_risk.noise_amplification ? 'Yes' : 'No'}</div>
                <div>Transient behavior: {report.stability_risk.transient_behavior ? 'Yes' : 'No'}</div>
                <div>Control-limit proximity: {report.stability_risk.control_limit_proximity}</div>
                {report.stability_risk.details.length > 0 && (
                  <ul className="list-disc ml-5 text-xs text-gray-600">
                    {report.stability_risk.details.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === 'report' && report && (
          <div className="space-y-6">
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => window.print()}>Print / Save PDF</Button>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>DOE Validation Report</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div>
                  <div className="text-xs text-gray-500">Experiment Context</div>
                  <div>Process: {report.context.process_name}</div>
                  <div>Engineer: {report.context.engineer}</div>
                  <div>Alignment: {report.context.alignment_method}</div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">AI-Selected Analysis Plan</div>
                  <div className="text-xs text-gray-600">{report.analysis_plan.rationale}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    Tests: {report.analysis_plan.tests.join(', ') || 'N/A'}
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Engineering Interpretation</div>
                  <div>{report.engineering_interpretation.summary}</div>
                  {report.engineering_interpretation.recommended_actions.length > 0 && (
                    <ul className="list-disc ml-5 text-xs text-gray-600 mt-1">
                      {report.engineering_interpretation.recommended_actions.map((item, idx) => (
                        <li key={idx}>{item}</li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-gray-500">Confidence Score</div>
                    <div className="text-2xl font-semibold">{(report.confidence.score * 100).toFixed(0)}%</div>
                    <div className="text-xs text-gray-500">Verdict: {report.verdict}</div>
                  </div>
                  <div className="text-xs text-gray-600">
                    <div>Data completeness: {(report.confidence.components.data_completeness * 100).toFixed(0)}%</div>
                    <div>Sample adequacy: {(report.confidence.components.sample_adequacy * 100).toFixed(0)}%</div>
                    <div>Noise ratio: {(report.confidence.components.noise_ratio * 100).toFixed(0)}%</div>
                    <div>Significance robustness: {(report.confidence.components.significance_robustness * 100).toFixed(0)}%</div>
                    <div>Assumption risk: {(report.confidence.components.assumption_risk * 100).toFixed(0)}%</div>
                  </div>
                </div>

                <div>
                  <div className="text-xs text-gray-500">Sign-off</div>
                  <div className="border border-dashed border-gray-300 h-12 rounded" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
