/**
 * Document API Controller
 * Encapsulates core business logic for all /api/v1/documents endpoints.
 */

import {
  DocumentRecord,
  DocumentUploadResponse,
  DocumentMetadataResponse,
  DocumentResultResponse,
  DocumentListResponse,
  CorrectionRequest,
  CorrectionResponse,
  RetryResponse,
  HealthResponse,
  JobStatus,
  AuditEntry,
} from './types.ts';
import { BackgroundJobQueue } from '../queue/jobQueue.ts';
import { sanitizeFilename, validateFileBounds, detectFileType } from '../document/security.ts';
import { ValidationService } from '../validation/validationService.ts';
import { CrossVerificationService, CrossVerificationResult } from '../validation/crossVerification.ts';
import { semanticSearchService, SemanticSearchResponse } from '../search/semanticSearch.ts';
import { documentRepository, DocumentRepository } from '../../db/repository.ts';

export class DocumentController {
  private documentStore = new Map<string, DocumentRecord>();
  private jobQueue: BackgroundJobQueue;
  private repository: DocumentRepository;

  constructor(customRepo?: DocumentRepository) {
    this.repository = customRepo || documentRepository;
    this.jobQueue = new BackgroundJobQueue(this.documentStore);
    this.hydrateFromDb();
  }

  /**
   * Hydrates in-memory cache with persisted SQLite documents on startup.
   */
  private hydrateFromDb(): void {
    try {
      const persisted = this.repository.searchDocuments({ limit: 500 });
      for (const doc of persisted.items) {
        this.documentStore.set(doc.id, doc);
      }
    } catch {
      // Clean start if database tables are in process of initializing
    }
  }

  public getRepository(): DocumentRepository {
    return this.repository;
  }

  public getQueue(): BackgroundJobQueue {
    return this.jobQueue;
  }

  public getStore(): Map<string, DocumentRecord> {
    return this.documentStore;
  }

  /**
   * POST /api/v1/documents
   * Ingests one or multiple files, performs bounds checking, creates jobs, and enqueues them.
   */
  public async uploadDocuments(
    files: Array<{ name: string; size: number; type?: string; buffer: Uint8Array }>
  ): Promise<DocumentUploadResponse> {
    if (!files || files.length === 0) {
      throw new HttpError(400, 'NO_FILES_PROVIDED', 'At least one file must be uploaded.');
    }

    const items: DocumentUploadResponse['documents'] = [];

    for (const file of files) {
      const sanitizedName = sanitizeFilename(file.name);
      const bounds = validateFileBounds(file.size);

      if (!bounds.valid) {
        throw new HttpError(400, 'INVALID_FILE_BOUNDS', bounds.error || 'File bounds invalid.', 'size');
      }

      const fileType = detectFileType(sanitizedName, file.buffer.slice(0, 16));
      if (fileType === 'unsupported') {
        throw new HttpError(
          415,
          'UNSUPPORTED_MEDIA_TYPE',
          `Format not supported for file "${file.name}". Supported: PDF, JPG, PNG, TIFF, XLSX, XLS, CSV.`,
          'file'
        );
      }

      const docId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
      const now = new Date().toISOString();

      const record: DocumentRecord = {
        id: docId,
        originalFilename: file.name,
        sanitizedFilename: sanitizedName,
        fileType,
        mimeType: file.type || 'application/octet-stream',
        fileSizeBytes: file.size,
        rawBuffer: file.buffer,
        status: 'queued',
        createdAt: now,
        updatedAt: now,
        retryCount: 0,
        auditTrail: [],
        errors: [],
        warnings: [],
      };

      this.documentStore.set(docId, record);
      this.repository.saveDocument(record);
      this.repository.recordProcessingHistory(docId, 1, 'queued');
      this.jobQueue.enqueue(docId);

      items.push({
        documentId: docId,
        filename: sanitizedName,
        status: 'queued',
        message: 'File accepted and processing job queued.',
      });
    }

    return {
      success: true,
      documents: items,
      totalQueued: items.length,
    };
  }

  /**
   * GET /api/v1/documents/:document_id
   */
  public getDocumentMetadata(documentId: string): DocumentMetadataResponse {
    const doc = this.documentStore.get(documentId);
    if (!doc) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document with ID "${documentId}" was not found.`);
    }

    return {
      id: doc.id,
      originalFilename: doc.originalFilename,
      sanitizedFilename: doc.sanitizedFilename,
      fileType: doc.fileType,
      mimeType: doc.mimeType,
      fileSizeBytes: doc.fileSizeBytes,
      status: doc.status,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      processingDurationMs: doc.processingDurationMs,
      retryCount: doc.retryCount,
    };
  }

  /**
   * GET /api/v1/documents/:document_id/result
   */
  public getDocumentResult(documentId: string): DocumentResultResponse {
    const doc = this.documentStore.get(documentId);
    if (!doc) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document with ID "${documentId}" was not found.`);
    }

    return {
      documentId: doc.id,
      status: doc.status,
      extraction: doc.extraction || null,
      validation: doc.validation || null,
      auditTrail: doc.auditTrail,
      errors: doc.errors,
      warnings: doc.warnings,
    };
  }

  /**
   * GET /api/v1/documents (paginated list, filter by status, search by keyword)
   */
  public listDocuments(options: {
    page?: number;
    limit?: number;
    status?: JobStatus;
    search?: string;
  }): DocumentListResponse {
    const page = Math.max(1, options.page || 1);
    const limit = Math.max(1, Math.min(100, options.limit || 10));
    const statusFilter = options.status;
    const searchFilter = options.search?.toLowerCase().trim();

    let all = Array.from(this.documentStore.values());

    // Filter by status
    if (statusFilter) {
      all = all.filter(d => d.status === statusFilter);
    }

    // Filter by search keyword across filename, supplier, invoice number, or ID
    if (searchFilter) {
      all = all.filter(d => {
        const inName = d.originalFilename.toLowerCase().includes(searchFilter) || d.sanitizedFilename.toLowerCase().includes(searchFilter);
        const inId = d.id.toLowerCase().includes(searchFilter);
        const inSupplier = d.extraction?.supplier_name?.toLowerCase().includes(searchFilter);
        const inInvNum = d.extraction?.invoice_number?.toLowerCase().includes(searchFilter);
        return inName || inId || inSupplier || inInvNum;
      });
    }

    // Sort newest first
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = all.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const offset = (page - 1) * limit;
    const paginatedItems = all.slice(offset, offset + limit).map(d => ({
      id: d.id,
      originalFilename: d.originalFilename,
      sanitizedFilename: d.sanitizedFilename,
      fileType: d.fileType,
      mimeType: d.mimeType,
      fileSizeBytes: d.fileSizeBytes,
      status: d.status,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      processingDurationMs: d.processingDurationMs,
      retryCount: d.retryCount,
    }));

    return {
      items: paginatedItems,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * PATCH /api/v1/documents/:document_id/corrections
   * Applies validated manual corrections with audit logging.
   */
  public applyCorrections(
    documentId: string,
    req: CorrectionRequest
  ): CorrectionResponse {
    const doc = this.documentStore.get(documentId);
    if (!doc) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document with ID "${documentId}" was not found.`);
    }

    if (!doc.extraction) {
      throw new HttpError(400, 'NO_EXTRACTION_DATA', 'Cannot apply corrections to a document without extracted data.');
    }

    if (!req.corrections || typeof req.corrections !== 'object' || Object.keys(req.corrections).length === 0) {
      throw new HttpError(400, 'INVALID_CORRECTIONS_PAYLOAD', 'Corrections mapping must contain at least one field.', 'corrections');
    }

    const updatedFields: string[] = [];
    const now = new Date().toISOString();

    for (const [field, newVal] of Object.entries(req.corrections)) {
      if (!(field in doc.extraction)) {
        throw new HttpError(422, 'UNRECOGNIZED_FIELD', `Field "${field}" is not a valid schema property.`);
      }

      const prevVal = (doc.extraction as any)[field];
      (doc.extraction as any)[field] = newVal;

      const auditEntry: AuditEntry = {
        field,
        previousValue: prevVal,
        newValue: newVal,
        updatedAt: now,
        reason: req.reason || 'Manual auditor correction',
        author: 'auditor',
      };

      doc.auditTrail.push(auditEntry);
      this.repository.addAuditEntry(doc.id, auditEntry);
      updatedFields.push(field);
    }

    // Re-run validation if requested
    let validationStatus = doc.status;
    if (req.revalidate !== false) {
      const existingInvoices = Array.from(this.documentStore.values())
        .filter(d => d.id !== doc.id && d.extraction)
        .map(d => d.extraction!);

      const validation = ValidationService.validateInvoice(doc.extraction, existingInvoices);
      doc.validation = validation;

      if (validation.status === 'valid') {
        doc.status = 'completed';
      } else {
        doc.status = 'needs_review';
      }
      validationStatus = doc.status;
    }

    doc.updatedAt = now;
    this.repository.saveDocument(doc);

    return {
      success: true,
      documentId: doc.id,
      status: doc.status,
      updatedFields,
      auditTrail: doc.auditTrail,
      validationStatus,
    };
  }

  /**
   * POST /api/v1/documents/:document_id/retry
   */
  public retryJob(documentId: string): RetryResponse {
    const doc = this.documentStore.get(documentId);
    if (!doc) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Document with ID "${documentId}" was not found.`);
    }

    const result = this.jobQueue.retry(documentId);
    if (!result.success) {
      throw new HttpError(409, 'CONCURRENT_RETRY_CONFLICT', result.message);
    }

    return {
      success: true,
      documentId: doc.id,
      status: result.status,
      message: result.message,
    };
  }

  /**
   * POST /api/v1/documents/cross-verify
   * Reconciles two documents (e.g. PDF Invoice vs Excel PO / Delivery Log).
   */
  public crossVerifyDocuments(sourceId: string, targetId: string): CrossVerificationResult {
    const docA = this.documentStore.get(sourceId);
    if (!docA) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Source document with ID "${sourceId}" was not found.`, 'sourceId');
    }
    const docB = this.documentStore.get(targetId);
    if (!docB) {
      throw new HttpError(404, 'DOCUMENT_NOT_FOUND', `Target document with ID "${targetId}" was not found.`, 'targetId');
    }

    if (!docA.extraction) {
      throw new HttpError(400, 'NO_EXTRACTION_DATA', `Source document "${sourceId}" has not completed extraction yet.`);
    }
    if (!docB.extraction) {
      throw new HttpError(400, 'NO_EXTRACTION_DATA', `Target document "${targetId}" has not completed extraction yet.`);
    }

    return CrossVerificationService.crossVerify(docA.extraction, docB.extraction, {
      sourceId,
      targetId,
    });
  }

  /**
   * GET /api/v1/documents/search/semantic
   * Executes genuine vector semantic search over stored documents.
   */
  public async semanticSearchDocuments(query: string, minSimilarity = 0.2): Promise<SemanticSearchResponse> {
    if (!query || !query.trim()) {
      throw new HttpError(400, 'EMPTY_QUERY', 'Search query parameter cannot be empty.', 'q');
    }

    const allDocs = Array.from(this.documentStore.values());
    return await semanticSearchService.search(query, allDocs, minSimilarity);
  }

  /**
   * GET /health
   */
  public getHealth(): HealthResponse {
    const queueStatus = this.jobQueue.getStatusMetrics();
    return {
      status: 'ok',
      version: '1.0.0',
      service: 'DocuPulse Backend REST API',
      environment: 'local_assessment_demo',
      queueStatus,
      authWarning: 'Local assessment demo - authentication disabled. Not suitable for public deployment without RBAC/OAuth.',
    };
  }
}

export class HttpError extends Error {
  public statusCode: number;
  public errorCode: string;
  public field?: string;

  constructor(statusCode: number, errorCode: string, message: string, field?: string) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.field = field;
  }
}

export const documentController = new DocumentController();
