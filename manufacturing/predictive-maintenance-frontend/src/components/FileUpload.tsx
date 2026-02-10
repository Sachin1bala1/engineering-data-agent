import React, { useState, useRef } from 'react';
import { Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { apiClient, getErrorMessage } from '../lib/api';
import type { UploadResponse, BatchUploadResponse } from '../types/api';

interface FileUploadProps {
  onUploadSuccess?: () => void;
}

export function FileUpload({ onUploadSuccess }: FileUploadProps) {
  const [sensorFiles, setSensorFiles] = useState<File[]>([]);
  const [maintenanceFile, setMaintenanceFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResponse | BatchUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensorInputRef = useRef<HTMLInputElement>(null);
  const maintenanceInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): string | null => {
    const name = file.name.toLowerCase();
    const isAllowed = name.endsWith('.csv') || name.endsWith('.xls') || name.endsWith('.xlsx');
    if (!isAllowed) {
      return 'Only CSV or Excel files are allowed';
    }
    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      return 'File size must be less than 10MB';
    }
    return null;
  };

  const handleFileSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
    fileType: 'sensor' | 'maintenance'
  ) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    if (fileType === 'sensor') {
      const selectedFiles = Array.from(files);
      for (const file of selectedFiles) {
        const validationError = validateFile(file);
        if (validationError) {
          setError(validationError);
          return;
        }
      }
      setError(null);
      setSensorFiles(selectedFiles);
      if (selectedFiles.length > 1) {
        setMaintenanceFile(null);
      }
    } else {
      const file = files[0];
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setMaintenanceFile(file);
    }
  };

  const handleUpload = async () => {
    if (sensorFiles.length === 0) {
      setError('At least one sensor data file is required');
      return;
    }

    setIsUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      if (sensorFiles.length > 1) {
        const result = await apiClient.uploadBatch(sensorFiles);
        setUploadResult(result);
        if (result.success) {
          onUploadSuccess?.();
        }
      } else {
        const result = await apiClient.uploadData(sensorFiles[0], maintenanceFile || undefined);
        setUploadResult(result);
        if (result.success) {
          onUploadSuccess?.();
        }
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err, 'Upload failed'));
    } finally {
      setIsUploading(false);
    }
  };

  const clearFiles = () => {
    setSensorFiles([]);
    setMaintenanceFile(null);
    setUploadResult(null);
    setError(null);
    if (sensorInputRef.current) sensorInputRef.current.value = '';
    if (maintenanceInputRef.current) maintenanceInputRef.current.value = '';
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Data Upload
        </CardTitle>
        <CardDescription>
          Upload sensor data and maintenance logs to update the predictive maintenance system.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Sensor Data Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Sensor Data (Required)</label>
          <div className="flex items-center gap-4">
            <input
              ref={sensorInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              multiple
              onChange={(e) => handleFileSelect(e, 'sensor')}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => sensorInputRef.current?.click()}
              className="flex items-center gap-2"
            >
              <FileText className="h-4 w-4" />
              {sensorFiles.length > 0 ? `${sensorFiles.length} file(s) selected` : 'Select Sensor CSV/Excel'}
            </Button>
            {sensorFiles.length > 0 && (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}
          </div>
          {sensorFiles.length > 0 && (
            <div className="text-xs text-muted-foreground">
              {sensorFiles.map((file) => file.name).join(', ')}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            CSV or Excel file(s) containing timestamp, asset_id, temperature, vibration, run_hours
          </p>
        </div>

        {/* Maintenance Logs Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Maintenance Logs (Optional)</label>
          <div className="flex items-center gap-4">
            <input
              ref={maintenanceInputRef}
              type="file"
              accept=".csv,.xls,.xlsx"
              onChange={(e) => handleFileSelect(e, 'maintenance')}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => maintenanceInputRef.current?.click()}
              className="flex items-center gap-2"
              disabled={sensorFiles.length > 1}
            >
              <FileText className="h-4 w-4" />
              {maintenanceFile ? maintenanceFile.name : 'Select Maintenance CSV/Excel'}
            </Button>
            {maintenanceFile && (
              <CheckCircle className="h-5 w-5 text-green-600" />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            CSV or Excel file containing asset_id, failure_type, failure_date
          </p>
          {sensorFiles.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Maintenance logs are disabled for batch uploads. Use a single sensor file to attach logs.
            </p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button
            onClick={handleUpload}
            disabled={sensorFiles.length === 0 || isUploading}
            className="flex items-center gap-2"
          >
            {isUploading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" />
                Upload Data
              </>
            )}
          </Button>

          {(sensorFiles.length > 0 || maintenanceFile) && (
            <Button variant="outline" onClick={clearFiles}>
              Clear Files
            </Button>
          )}
        </div>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-4 border border-red-200 bg-red-50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <div className="text-sm text-red-800">{error}</div>
          </div>
        )}

        {/* Success Display */}
        {uploadResult && uploadResult.success && 'file_results' in uploadResult && (
          <div className="flex items-start gap-2 p-4 border border-green-200 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
            <div className="text-sm text-green-800">
              <div className="font-medium">Batch upload successful!</div>
              <div className="mt-1">
                Processed {uploadResult.files_processed} files and {uploadResult.total_records_processed} records.
              </div>
              <div className="mt-2 space-y-2">
                {uploadResult.file_results.map((result) => (
                  <div key={result.file_name} className="text-xs text-green-900">
                    {result.file_name}: {result.records_processed} records, assets: {result.assets_updated.join(', ') || 'none'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {uploadResult && uploadResult.success && !('file_results' in uploadResult) && (
          <div className="flex items-center gap-2 p-4 border border-green-200 bg-green-50 rounded-lg">
            <CheckCircle className="h-5 w-5 text-green-600" />
            <div className="text-sm text-green-800">
              <div className="font-medium">Upload successful!</div>
              <div className="mt-1">
                Processed {uploadResult.records_processed} records for assets: {uploadResult.assets_updated.join(', ')}
              </div>
            </div>
          </div>
        )}

        {/* Upload Errors */}
        {uploadResult && 'errors' in uploadResult && uploadResult.errors.length > 0 && (
          <div className="flex items-start gap-2 p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <div className="font-medium">Upload completed with warnings:</div>
              <ul className="mt-1 ml-4 list-disc">
                {uploadResult.errors.map((err, index) => (
                  <li key={index}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Ingestion Warnings */}
        {uploadResult && 'warnings' in uploadResult && uploadResult.warnings && uploadResult.warnings.length > 0 && (
          <div className="flex items-start gap-2 p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <div className="font-medium">Ingestion adjustments:</div>
              <ul className="mt-1 ml-4 list-disc">
                {uploadResult.warnings.map((warn, index) => (
                  <li key={index}>{warn}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {uploadResult && 'file_results' in uploadResult && uploadResult.file_results.some((result) => result.errors.length > 0) && (
          <div className="flex items-start gap-2 p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <div className="font-medium">Batch file warnings:</div>
              <ul className="mt-1 ml-4 list-disc">
                {uploadResult.file_results.flatMap((result) =>
                  result.errors.map((err, index) => (
                    <li key={`${result.file_name}-${index}`}>
                      {result.file_name}: {err}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
