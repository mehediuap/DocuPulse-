import React from 'react';
import {
  DocumentMetadataResponse,
  JobStatus,
} from '../../services/api/types.ts';
import {
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Table as TableIcon,
  FileWarning,
  RotateCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Eye,
  Loader2,
} from 'lucide-react';

interface DocumentTableProps {
  documents: DocumentMetadataResponse[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  selectedStatus?: JobStatus;
  searchQuery: string;
  isLoading: boolean;
  onPageChange: (newPage: number) => void;
  onStatusChange: (status?: JobStatus) => void;
  onSearchChange: (query: string) => void;
  onSelectDocument: (docId: string) => void;
  onRetryDocument: (docId: string) => void;
}

export const DocumentTable: React.FC<DocumentTableProps> = ({
  documents,
  total,
  page,
  limit,
  totalPages,
  selectedStatus,
  searchQuery,
  isLoading,
  onPageChange,
  onStatusChange,
  onSearchChange,
  onSelectDocument,
  onRetryDocument,
}) => {
  const getFormatIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'pdf':
        return <FileText className="w-4 h-4 text-rose-600" />;
      case 'xlsx':
      case 'xls':
        return <FileSpreadsheet className="w-4 h-4 text-emerald-600" />;
      case 'csv':
        return <TableIcon className="w-4 h-4 text-sky-600" />;
      case 'image':
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'tiff':
        return <ImageIcon className="w-4 h-4 text-amber-600" />;
      default:
        return <FileWarning className="w-4 h-4 text-slate-400" />;
    }
  };

  const getStatusBadge = (status: JobStatus) => {
    switch (status) {
      case 'queued':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
            <Clock className="w-3 h-3 text-slate-500" />
            Queued
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
            <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'needs_review':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3 text-amber-600" />
            Needs Review
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3 text-rose-600" />
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const formatTimestamp = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-xs overflow-hidden flex flex-col">
      {/* Search and Filters Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50/50">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by filename, document ID, supplier, or invoice #..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-400"
          />
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-500 whitespace-nowrap">Status:</label>
          <select
            value={selectedStatus || ''}
            onChange={(e) => onStatusChange(e.target.value ? (e.target.value as JobStatus) : undefined)}
            className="text-xs bg-white border border-slate-200 rounded-md px-2.5 py-1.5 text-slate-700 focus:outline-none focus:border-slate-400"
          >
            <option value="">All Statuses ({total})</option>
            <option value="completed">Completed</option>
            <option value="needs_review">Needs Review</option>
            <option value="processing">Processing</option>
            <option value="queued">Queued</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium select-none">
              <th className="py-2.5 px-4 w-10">Type</th>
              <th className="py-2.5 px-4">Document Filename</th>
              <th className="py-2.5 px-4">Document ID</th>
              <th className="py-2.5 px-4">Size</th>
              <th className="py-2.5 px-4">Status</th>
              <th className="py-2.5 px-4">Time</th>
              <th className="py-2.5 px-4">Latency</th>
              <th className="py-2.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && documents.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400 mb-2" />
                  <span>Loading ingestion queue...</span>
                </td>
              </tr>
            ) : documents.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-500">
                  <div className="max-w-sm mx-auto">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <div className="font-semibold text-slate-700">No documents found</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      {searchQuery || selectedStatus
                        ? 'Try clearing the search or status filter.'
                        : 'Upload files above or load a sample fixture to begin processing.'}
                    </div>
                  </div>
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const canRetry = doc.status === 'failed' || doc.status === 'needs_review';
                return (
                  <tr
                    key={doc.id}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                    onClick={() => onSelectDocument(doc.id)}
                  >
                    <td className="py-3 px-4">
                      {getFormatIcon(doc.fileType)}
                    </td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900 truncate max-w-xs">
                        {doc.sanitizedFilename}
                      </div>
                      {doc.originalFilename !== doc.sanitizedFilename && (
                        <div className="text-[10px] text-slate-400 font-mono truncate max-w-xs">
                          orig: {doc.originalFilename}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {doc.id}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-[11px]">
                      {formatFileSize(doc.fileSizeBytes)}
                    </td>
                    <td className="py-3 px-4">
                      {getStatusBadge(doc.status)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {formatTimestamp(doc.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                      {doc.processingDurationMs !== undefined ? `${doc.processingDurationMs}ms` : '—'}
                    </td>
                    <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSelectDocument(doc.id)}
                          title="Inspect extracted fields and validation report"
                          className="px-2.5 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-slate-100 hover:text-slate-900 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Eye className="w-3 h-3 text-slate-500" />
                          <span>Inspect</span>
                        </button>

                        {canRetry && (
                          <button
                            onClick={() => onRetryDocument(doc.id)}
                            title="Re-run processing pipeline"
                            className="px-2 py-1 text-[11px] font-medium text-slate-700 bg-white border border-slate-200 rounded hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 bg-slate-50/50">
        <div>
          Showing <span className="font-medium text-slate-800">{documents.length > 0 ? (page - 1) * limit + 1 : 0}</span> to{' '}
          <span className="font-medium text-slate-800">{Math.min(page * limit, total)}</span> of{' '}
          <span className="font-medium text-slate-800">{total}</span> documents
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600" />
          </button>
          <span className="font-mono text-[11px]">
            Page {page} of {totalPages || 1}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="p-1.5 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4 text-slate-600" />
          </button>
        </div>
      </div>
    </div>
  );
};
