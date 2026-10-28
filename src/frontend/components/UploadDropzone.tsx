import React, { useState, useRef } from 'react';
import { Upload, FileUp, Sparkles, AlertCircle, FileCheck, Loader2 } from 'lucide-react';
import { DEMO_FIXTURES, DemoFixture } from '../sampleFixtures.ts';

interface UploadDropzoneProps {
  isUploading: boolean;
  onUpload: (files: Array<{ name: string; size: number; type: string; data: string }>) => Promise<void>;
}

const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff', '.xlsx', '.xls', '.csv'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

export const UploadDropzone: React.FC<UploadDropzoneProps> = ({
  isUploading,
  onUpload,
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [loadingFixtureId, setLoadingFixtureId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error(`Failed to read file ${file.name}`));
      reader.readAsDataURL(file);
    });
  };

  const processAndUploadFiles = async (fileList: FileList | File[]) => {
    setUploadError(null);
    const filesArray = Array.from(fileList);

    if (filesArray.length === 0) return;

    // Validate size and extensions
    const validPayloads: Array<{ name: string; size: number; type: string; data: string }> = [];

    for (const file of filesArray) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setUploadError(`File "${file.name}" exceeds the 25 MB size limit (${(file.size / (1024 * 1024)).toFixed(2)} MB).`);
        return;
      }

      const lowerName = file.name.toLowerCase();
      const hasValidExt = ALLOWED_EXTENSIONS.some(ext => lowerName.endsWith(ext));
      if (!hasValidExt) {
        setUploadError(`File "${file.name}" has an unsupported format. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        return;
      }

      try {
        const dataUrl = await readFileAsDataUrl(file);
        validPayloads.push({
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          data: dataUrl,
        });
      } catch (err: any) {
        setUploadError(`Error reading file "${file.name}": ${err.message}`);
        return;
      }
    }

    try {
      await onUpload(validPayloads);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err: any) {
      setUploadError(err.message || 'Upload failed.');
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    if (isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processAndUploadFiles(e.dataTransfer.files);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processAndUploadFiles(e.target.files);
    }
  };

  const handleLoadFixture = async (fixture: DemoFixture) => {
    setLoadingFixtureId(fixture.id);
    setUploadError(null);
    try {
      const generated = fixture.generate();
      await onUpload([generated]);
    } catch (err: any) {
      setUploadError(err.message || 'Failed to ingest demo fixture.');
    } finally {
      setLoadingFixtureId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Upload Zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ${
          isDragOver
            ? 'border-indigo-500 bg-indigo-50/50 scale-[0.99]'
            : 'border-slate-300 hover:border-slate-400 bg-white'
        } ${isUploading ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.xlsx,.xls,.csv"
          onChange={handleFileInputChange}
          disabled={isUploading}
          className="hidden"
        />

        <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3 text-slate-700">
          {isUploading ? (
            <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
          ) : (
            <FileUp className="w-6 h-6 text-slate-600" />
          )}
        </div>

        <div className="text-sm font-semibold text-slate-900">
          {isUploading ? 'Uploading & Enqueueing Documents...' : 'Drop Documents Here or Click to Browse'}
        </div>
        <div className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
          Support for PDF (digital & scanned), PNG, JPG, TIFF, XLSX (multi-sheet), legacy XLS, and CSV.
        </div>
        <div className="text-[11px] text-slate-400 mt-2 font-mono">
          Max file size: 25 MB per file · Multi-file batch upload enabled
        </div>
      </div>

      {/* Upload Feedback Error Banner */}
      {uploadError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-800 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold">Upload Validation Warning: </span>
            {uploadError}
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="text-xs text-rose-500 hover:text-rose-800"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Demo Fixtures Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-xs font-semibold text-slate-900">
              Verified Test Fixtures (Demo Pipeline)
            </span>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            Direct REST Injection
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {DEMO_FIXTURES.map((fixture) => {
            const isLoadingThis = loadingFixtureId === fixture.id;
            return (
              <button
                key={fixture.id}
                onClick={() => handleLoadFixture(fixture)}
                disabled={isUploading || isLoadingThis}
                className="p-2.5 text-left border border-slate-200 rounded-md hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50 cursor-pointer flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-xs font-medium text-slate-900 truncate">
                      {fixture.label}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                      {fixture.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2">
                    {fixture.description}
                  </p>
                </div>
                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-indigo-600 font-medium">
                  <span>{isLoadingThis ? 'Enqueueing...' : 'Ingest Sample'}</span>
                  {isLoadingThis ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Upload className="w-3 h-3" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
