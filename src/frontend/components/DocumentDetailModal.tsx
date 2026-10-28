import React, { useState } from 'react';
import {
  DocumentResultResponse,
  DocumentMetadataResponse,
  JobStatus,
  AuditEntry,
} from '../../services/api/types.ts';
import {
  X,
  RotateCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  Edit3,
  FileText,
  DollarSign,
  Calendar,
  Building,
  User,
  Hash,
  List,
  Save,
  ShieldAlert,
  History,
  Loader2,
  Info,
} from 'lucide-react';

interface DocumentDetailModalProps {
  metadata: DocumentMetadataResponse | null;
  result: DocumentResultResponse | null;
  isLoading: boolean;
  onClose: () => void;
  onRetry: (documentId: string) => Promise<void>;
  onApplyCorrection: (
    documentId: string,
    corrections: Record<string, any>,
    reason: string,
    revalidate: boolean
  ) => Promise<void>;
}

export const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({
  metadata,
  result,
  isLoading,
  onClose,
  onRetry,
  onApplyCorrection,
}) => {
  const [activeTab, setActiveTab] = useState<'extraction' | 'validation' | 'correction' | 'audit'>('extraction');
  const [selectedField, setSelectedField] = useState<string>('invoice_number');
  const [correctionValue, setCorrectionValue] = useState<string>('');
  const [correctionReason, setCorrectionReason] = useState<string>('');
  const [revalidateOnSave, setRevalidateOnSave] = useState<boolean>(true);
  const [isSavingCorrection, setIsSavingCorrection] = useState<boolean>(false);
  const [correctionSuccessMsg, setCorrectionSuccessMsg] = useState<string | null>(null);
  const [correctionErrorMsg, setCorrectionErrorMsg] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState<boolean>(false);

  if (!metadata) return null;

  const extraction = result?.extraction;
  const validation = result?.validation;
  const auditTrail = result?.auditTrail || [];
  const status = result?.status || metadata.status;

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      await onRetry(metadata.id);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleSaveCorrection = async (e: React.FormEvent) => {
    e.preventDefault();
    setCorrectionErrorMsg(null);
    setCorrectionSuccessMsg(null);

    if (!selectedField) {
      setCorrectionErrorMsg('Please select a field to correct.');
      return;
    }

    if (!correctionReason.trim()) {
      setCorrectionErrorMsg('An audit justification / reason is required for manual corrections.');
      return;
    }

    setIsSavingCorrection(true);
    try {
      // Parse numeric fields safely
      let parsedValue: any = correctionValue;
      if (['subtotal', 'tax', 'total'].includes(selectedField)) {
        const num = parseFloat(correctionValue);
        if (isNaN(num)) {
          throw new Error(`Field "${selectedField}" must be a valid number.`);
        }
        parsedValue = num;
      }

      await onApplyCorrection(
        metadata.id,
        { [selectedField]: parsedValue },
        correctionReason.trim(),
        revalidateOnSave
      );

      setCorrectionSuccessMsg(`Field "${selectedField}" updated successfully.`);
      setCorrectionValue('');
      setCorrectionReason('');
    } catch (err: any) {
      setCorrectionErrorMsg(err.message || 'Failed to apply manual correction.');
    } finally {
      setIsSavingCorrection(false);
    }
  };

  const getCurrentFieldValue = (field: string) => {
    if (!extraction) return '—';
    const val = (extraction as any)[field];
    return val !== undefined && val !== null ? String(val) : '—';
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in duration-150">
        {/* Header Bar */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-slate-900 text-white flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5 text-indigo-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 truncate">
                  {metadata.sanitizedFilename}
                </h3>
                {status === 'completed' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Completed
                  </span>
                )}
                {status === 'needs_review' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                    Needs Review
                  </span>
                )}
                {status === 'failed' && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
                    <XCircle className="w-3 h-3 text-rose-600" />
                    Failed
                  </span>
                )}
                {(status === 'queued' || status === 'processing') && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                    <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
                    {status === 'queued' ? 'Queued' : 'Processing'}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 font-mono mt-0.5 flex items-center gap-2">
                <span>ID: {metadata.id}</span>
                <span>·</span>
                <span className="uppercase">{metadata.fileType}</span>
                <span>·</span>
                <span>Attempts: {metadata.retryCount + 1}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {(status === 'failed' || status === 'needs_review') && (
              <button
                onClick={handleRetry}
                disabled={isRetrying}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                <span>{isRetrying ? 'Retrying...' : 'Retry Job'}</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Tabs */}
        <div className="px-6 border-b border-slate-200 bg-white flex items-center gap-6 text-xs font-medium text-slate-600">
          <button
            onClick={() => setActiveTab('extraction')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'extraction'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Extracted Information</span>
          </button>

          <button
            onClick={() => setActiveTab('validation')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'validation'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Validation & Rules ({validation?.issues.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('correction')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'correction'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Manual Correction</span>
          </button>

          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'audit'
                ? 'border-slate-900 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit Trail ({auditTrail.length})</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 p-6 overflow-y-auto">
          {isLoading && !result ? (
            <div className="py-20 text-center text-slate-500">
              <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600 mb-3" />
              <div className="font-semibold text-slate-800">Retrieving Document Intelligence...</div>
              <div className="text-xs text-slate-400 mt-1">Connecting to SQLite state and processing queue...</div>
            </div>
          ) : status === 'queued' || status === 'processing' ? (
            <div className="py-16 text-center text-slate-600 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-full bg-indigo-50 border border-indigo-200 flex items-center justify-center mx-auto mb-4 text-indigo-600">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
              <h4 className="font-semibold text-slate-900 text-sm">Processing Pipeline in Progress</h4>
              <p className="text-xs text-slate-500 mt-1">
                Document is currently progressing through layout segmentation, OCR, AI extraction, and financial reconciliation.
              </p>
              <div className="mt-4 p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-600 font-mono">
                Status: {status.toUpperCase()} · Auto-polling enabled
              </div>
            </div>
          ) : status === 'failed' ? (
            <div className="p-6 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900 flex flex-col gap-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-rose-800">
                <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Document Ingestion or Extraction Failed</span>
              </div>
              <p className="text-slate-700">
                The pipeline encountered a fatal error during stream decoding or parsing. Fault isolation prevented this failure from cascading to other files.
              </p>
              {result?.errors && result.errors.length > 0 && (
                <div className="bg-white/80 p-3 rounded border border-rose-200 font-mono text-[11px] text-rose-700">
                  {result.errors.map((err, i) => (
                    <div key={i}>• {err}</div>
                  ))}
                </div>
              )}
              <div className="pt-2">
                <button
                  onClick={handleRetry}
                  disabled={isRetrying}
                  className="px-4 py-2 bg-rose-600 text-white rounded font-medium hover:bg-rose-700 transition-colors flex items-center gap-2 cursor-pointer"
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                  <span>Retry Ingestion Job</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* TAB 1: Extracted Information */}
              {activeTab === 'extraction' && (
                <div className="flex flex-col gap-6">
                  {/* Key Financial Fields Grid */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                      Core Invoice Entities
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Hash className="w-3 h-3 text-slate-400" />
                          <span>Invoice Number</span>
                        </div>
                        <div className="font-mono font-semibold text-sm text-slate-900 mt-1">
                          {extraction?.invoice_number || <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Invoice Date</span>
                        </div>
                        <div className="font-mono font-semibold text-sm text-slate-900 mt-1">
                          {extraction?.invoice_date || <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-slate-400" />
                          <span>Currency</span>
                        </div>
                        <div className="font-mono font-semibold text-sm text-slate-900 mt-1">
                          {extraction?.currency || <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-indigo-50/60 rounded-lg border border-indigo-200">
                        <div className="text-[11px] text-indigo-700 flex items-center gap-1 font-medium">
                          <DollarSign className="w-3 h-3 text-indigo-600" />
                          <span>Total Amount</span>
                        </div>
                        <div className="font-mono font-bold text-base text-indigo-950 mt-1">
                          {extraction?.total !== null && extraction?.total !== undefined
                            ? `$${extraction.total.toFixed(2)}`
                            : <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <Building className="w-3 h-3 text-slate-400" />
                          <span>Supplier Name</span>
                        </div>
                        <div className="font-medium text-xs text-slate-900 mt-1 truncate">
                          {extraction?.supplier_name || <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>Customer Name</span>
                        </div>
                        <div className="font-medium text-xs text-slate-900 mt-1 truncate">
                          {extraction?.customer_name || <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-slate-400" />
                          <span>Subtotal</span>
                        </div>
                        <div className="font-mono font-semibold text-xs text-slate-900 mt-1">
                          {extraction?.subtotal !== null && extraction?.subtotal !== undefined
                            ? `$${extraction.subtotal.toFixed(2)}`
                            : <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                        <div className="text-[11px] text-slate-500 flex items-center gap-1">
                          <DollarSign className="w-3 h-3 text-slate-400" />
                          <span>Tax Amount</span>
                        </div>
                        <div className="font-mono font-semibold text-xs text-slate-900 mt-1">
                          {extraction?.tax !== null && extraction?.tax !== undefined
                            ? `$${extraction.tax.toFixed(2)}`
                            : <span className="text-slate-400 italic font-normal">null</span>}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Line Items Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center justify-between">
                      <span>Line Items ({extraction?.line_items?.length || 0})</span>
                      <span className="text-[11px] font-mono lowercase font-normal text-slate-400">
                        Decimal-safe integer cents reconciliation
                      </span>
                    </h4>

                    {extraction?.line_items && extraction.line_items.length > 0 ? (
                      <div className="border border-slate-200 rounded-lg overflow-hidden">
                        <table className="w-full text-xs text-left border-collapse">
                          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                            <tr>
                              <th className="py-2 px-3 font-medium">Description</th>
                              <th className="py-2 px-3 font-medium w-20 text-right">Quantity</th>
                              <th className="py-2 px-3 font-medium w-28 text-right">Unit Price</th>
                              <th className="py-2 px-3 font-medium w-28 text-right">Amount</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono text-[12px]">
                            {extraction.line_items.map((item, idx) => (
                              <tr key={idx} className="hover:bg-slate-50/50">
                                <td className="py-2 px-3 font-sans text-slate-900">{item.description}</td>
                                <td className="py-2 px-3 text-right text-slate-600">{item.quantity}</td>
                                <td className="py-2 px-3 text-right text-slate-600">
                                  {item.unit_price !== null && item.unit_price !== undefined ? `$${item.unit_price.toFixed(2)}` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-semibold text-slate-900">
                                  {item.amount !== null && item.amount !== undefined ? `$${item.amount.toFixed(2)}` : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-400 border border-slate-200 rounded-lg">
                        No itemized line items found in document stream.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: Validation & Rules */}
              {activeTab === 'validation' && (
                <div className="flex flex-col gap-4">
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-lg border flex items-start gap-3 ${
                      validation?.status === 'valid'
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50 border-amber-200 text-amber-900'
                    }`}
                  >
                    {validation?.status === 'valid' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-semibold text-xs uppercase tracking-wide">
                        Validation Verdict: {validation?.status === 'valid' ? 'Fully Validated' : 'Needs Auditor Review'}
                      </div>
                      <p className="text-xs mt-1">
                        {validation?.status === 'valid'
                          ? 'All mandatory fields are present, arithmetic consistency checks passed within rounding tolerance, and no duplicate candidates were detected.'
                          : 'One or more business validation rules failed. Document requires human verification or correction.'}
                      </p>
                    </div>
                  </div>

                  {/* Financial Balance Reconciliation */}
                  {validation?.reconciliation && (
                    <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
                      <h5 className="text-xs font-semibold text-slate-900 mb-2">Financial Balance Reconciliation</h5>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
                        <div>
                          <span className="text-slate-500 block text-[11px]">Stated Subtotal:</span>
                          <span className="text-slate-900 font-semibold">
                            {validation.reconciliation.statedSubtotal !== null ? `$${validation.reconciliation.statedSubtotal.toFixed(2)}` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Stated Tax:</span>
                          <span className="text-slate-900 font-semibold">
                            {validation.reconciliation.statedTax !== null ? `$${validation.reconciliation.statedTax.toFixed(2)}` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Expected Total:</span>
                          <span className="text-slate-900 font-semibold">
                            {validation.reconciliation.expectedTotal !== null ? `$${validation.reconciliation.expectedTotal.toFixed(2)}` : '—'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[11px]">Stated Total:</span>
                          <span className="text-slate-900 font-semibold">
                            {validation.reconciliation.statedTotal !== null ? `$${validation.reconciliation.statedTotal.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      </div>
                      {validation.reconciliation.totalDelta !== null && validation.reconciliation.totalDelta !== 0 && (
                        <div className="mt-2 pt-2 border-t border-slate-200 text-xs font-mono text-amber-800">
                          Discrepancy: <span className="font-bold">${validation.reconciliation.totalDelta.toFixed(2)}</span> (exceeds rounding tolerance)
                        </div>
                      )}
                    </div>
                  )}

                  {/* Issues List */}
                  <div>
                    <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                      Detected Issues ({validation?.issues.length || 0})
                    </h5>

                    {validation?.issues && validation.issues.length > 0 ? (
                      <div className="space-y-2">
                        {validation.issues.map((issue, idx) => (
                          <div
                            key={idx}
                            className={`p-3 rounded-lg border text-xs flex items-start gap-3 ${
                              issue.severity === 'error'
                                ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                                : 'bg-amber-50/70 border-amber-200 text-amber-900'
                            }`}
                          >
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase shrink-0 mt-0.5 ${
                                issue.severity === 'error' ? 'bg-rose-200 text-rose-800' : 'bg-amber-200 text-amber-800'
                              }`}
                            >
                              {issue.code}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold flex items-center gap-2">
                                <span>{issue.field ? `Field: ${issue.field}` : 'General Rule'}</span>
                              </div>
                              <p className="mt-0.5 text-slate-700">{issue.message}</p>
                              {issue.evidenceSnippet && (
                                <div className="mt-1 text-[11px] font-mono text-slate-500 bg-white/60 p-1.5 rounded">
                                  Evidence: {issue.evidenceSnippet}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 text-center text-xs text-slate-500 border border-slate-200 rounded-lg">
                        No validation issues detected. Document satisfies all criteria.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 3: Manual Correction Form */}
              {activeTab === 'correction' && (
                <div className="flex flex-col gap-4">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600">
                    <p className="font-semibold text-slate-800 mb-0.5">Auditor Field Overrides</p>
                    <p>
                      Manually correct OCR misrecognitions or extraction discrepancies. Every correction is validated, re-reconciled, and logged immutably into the audit trail.
                    </p>
                  </div>

                  {correctionSuccessMsg && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{correctionSuccessMsg}</span>
                    </div>
                  )}

                  {correctionErrorMsg && (
                    <div className="p-3 bg-rose-50 border border-rose-200 text-xs text-rose-800 rounded flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>{correctionErrorMsg}</span>
                    </div>
                  )}

                  <form onSubmit={handleSaveCorrection} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Field to Correct
                        </label>
                        <select
                          value={selectedField}
                          onChange={(e) => {
                            setSelectedField(e.target.value);
                            setCorrectionValue('');
                          }}
                          className="w-full text-xs bg-white border border-slate-300 rounded-md p-2 text-slate-900 focus:outline-none focus:border-slate-500"
                        >
                          <option value="invoice_number">Invoice Number</option>
                          <option value="invoice_date">Invoice Date (YYYY-MM-DD)</option>
                          <option value="supplier_name">Supplier Name</option>
                          <option value="customer_name">Customer Name</option>
                          <option value="subtotal">Subtotal (Numeric)</option>
                          <option value="tax">Tax Amount (Numeric)</option>
                          <option value="total">Total Amount (Numeric)</option>
                          <option value="currency">Currency Code</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">
                          Current Value in System
                        </label>
                        <div className="w-full text-xs bg-slate-100 border border-slate-200 rounded-md p-2 font-mono text-slate-700 truncate">
                          {getCurrentFieldValue(selectedField)}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        New Corrected Value
                      </label>
                      <input
                        type="text"
                        placeholder="Enter verified value..."
                        value={correctionValue}
                        onChange={(e) => setCorrectionValue(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-md p-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">
                        Correction Reason / Audit Justification <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. OCR misread digit 8 as 0, verified on scan page 1"
                        value={correctionReason}
                        onChange={(e) => setCorrectionReason(e.target.value)}
                        className="w-full text-xs bg-white border border-slate-300 rounded-md p-2 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-500"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="revalidateCheckbox"
                        checked={revalidateOnSave}
                        onChange={(e) => setRevalidateOnSave(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="revalidateCheckbox" className="text-xs text-slate-700 cursor-pointer">
                        Re-run mathematical reconciliation and validation rules upon saving
                      </label>
                    </div>

                    <div className="pt-2">
                      <button
                        type="submit"
                        disabled={isSavingCorrection || !correctionValue.trim() || !correctionReason.trim()}
                        className="px-4 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                      >
                        {isSavingCorrection ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Save className="w-3.5 h-3.5" />
                        )}
                        <span>{isSavingCorrection ? 'Applying Correction...' : 'Save Manual Correction'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* TAB 4: Audit Trail */}
              {activeTab === 'audit' && (
                <div className="flex flex-col gap-3">
                  <div className="text-xs text-slate-500 flex items-center justify-between">
                    <span>Immutable log of auditor interventions and value alterations</span>
                    <span className="font-mono">{auditTrail.length} entries</span>
                  </div>

                  {auditTrail.length > 0 ? (
                    <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 overflow-hidden">
                      {auditTrail.map((entry, idx) => (
                        <div key={idx} className="p-3 bg-white text-xs flex flex-col gap-1">
                          <div className="flex items-center justify-between font-mono text-[11px] text-slate-500">
                            <span className="font-semibold text-slate-900">Field: {entry.field}</span>
                            <span>{new Date(entry.updatedAt).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[12px] mt-1">
                            <span className="text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                              {entry.previousValue !== undefined ? String(entry.previousValue) : 'null'}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">
                              {entry.newValue !== undefined ? String(entry.newValue) : 'null'}
                            </span>
                          </div>
                          {entry.reason && (
                            <div className="text-slate-600 text-[11px] mt-1 bg-slate-50 p-1.5 rounded">
                              Reason: {entry.reason} · Author: <span className="font-medium text-slate-800">{entry.author}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-xs text-slate-400 border border-slate-200 rounded-lg">
                      No manual corrections recorded. All values match raw extracted facts.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
