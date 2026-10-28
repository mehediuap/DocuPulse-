/**
 * Express REST API Routes for DocuPulse
 * Endpoints: /api/v1/documents, /api/v1/documents/:id, /api/v1/openapi.json, /health
 */

import express, { Request, Response, NextFunction } from 'express';
import { documentController, HttpError } from './documentController.ts';
import { JobStatus } from './types.ts';

export const apiRouter = express.Router();

// 1. POST /api/v1/documents: Upload one or multiple files
apiRouter.post('/api/v1/documents', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rawFiles = req.body?.files;
    let fileInputs: Array<{ name: string; size: number; type?: string; buffer: Uint8Array }> = [];

    if (Array.isArray(rawFiles) && rawFiles.length > 0) {
      for (const f of rawFiles) {
        let buffer: Uint8Array;
        if (typeof f.data === 'string') {
          // If base64 or plain string
          if (f.data.startsWith('data:')) {
            const base64Data = f.data.split(',')[1] || '';
            buffer = Buffer.from(base64Data, 'base64');
          } else {
            buffer = Buffer.from(f.data, 'utf-8');
          }
        } else if (f.data instanceof Uint8Array || Array.isArray(f.data)) {
          buffer = new Uint8Array(f.data);
        } else {
          buffer = new Uint8Array(0);
        }

        fileInputs.push({
          name: f.name || 'unnamed_document',
          size: f.size !== undefined ? f.size : buffer.length,
          type: f.type,
          buffer,
        });
      }
    } else if (req.body?.name && req.body?.data) {
      // Single file JSON payload
      const f = req.body;
      const buffer = typeof f.data === 'string'
        ? (f.data.startsWith('data:') ? Buffer.from(f.data.split(',')[1], 'base64') : Buffer.from(f.data, 'utf-8'))
        : new Uint8Array(f.data);

      fileInputs.push({
        name: f.name,
        size: f.size !== undefined ? f.size : buffer.length,
        type: f.type,
        buffer,
      });
    } else {
      throw new HttpError(400, 'NO_FILES_PROVIDED', 'Request body must contain "files" array or single file payload.');
    }

    const result = await documentController.uploadDocuments(fileInputs);
    res.status(202).json(result);
  } catch (err) {
    next(err);
  }
});

// 2. GET /api/v1/documents/search/semantic: Genuine vector semantic search
apiRouter.get('/api/v1/documents/search/semantic', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = String(req.query.q || req.query.query || '');
    const minSim = req.query.min_similarity ? parseFloat(String(req.query.min_similarity)) : 0.2;
    const result = await documentController.semanticSearchDocuments(q, minSim);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 3. POST /api/v1/documents/cross-verify: Cross-verification of PDF/Excel documents
apiRouter.post('/api/v1/documents/cross-verify', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sourceId, targetId } = req.body || {};
    if (!sourceId || !targetId) {
      throw new HttpError(400, 'MISSING_DOCUMENTS', 'Both sourceId and targetId must be provided in request body.');
    }
    const result = documentController.crossVerifyDocuments(sourceId, targetId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4. GET /api/v1/documents/:document_id: Metadata and status
apiRouter.get('/api/v1/documents/:document_id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const metadata = documentController.getDocumentMetadata(req.params.document_id);
    res.json(metadata);
  } catch (err) {
    next(err);
  }
});

// 3. GET /api/v1/documents/:document_id/result: Extraction and validation result
apiRouter.get('/api/v1/documents/:document_id/result', (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = documentController.getDocumentResult(req.params.document_id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// 4. GET /api/v1/documents: Paginated list, filter by status, search
apiRouter.get('/api/v1/documents', (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;
    const status = req.query.status as JobStatus | undefined;
    const search = req.query.search as string | undefined;

    const list = documentController.listDocuments({ page, limit, status, search });
    res.json(list);
  } catch (err) {
    next(err);
  }
});

// 5. PATCH /api/v1/documents/:document_id/corrections: Validated manual correction
apiRouter.patch('/api/v1/documents/:document_id/corrections', (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = documentController.applyCorrections(req.params.document_id, req.body);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// 6. POST /api/v1/documents/:document_id/retry: Safely retry failed job
apiRouter.post('/api/v1/documents/:document_id/retry', (req: Request, res: Response, next: NextFunction) => {
  try {
    const response = documentController.retryJob(req.params.document_id);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// 7. GET /health
apiRouter.get('/health', (_req: Request, res: Response) => {
  const health = documentController.getHealth();
  res.json(health);
});

// 8. GET /api/v1/openapi.json: OpenAPI Specification reflecting all schemas and endpoints
apiRouter.get('/api/v1/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiSpecification);
});

/**
 * Defensive error handling middleware.
 * Never leaks server paths, stack traces, or internal secrets.
 */
export function safeErrorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  const statusCode = err instanceof HttpError ? err.statusCode : 500;
  const errorCode = err instanceof HttpError ? err.errorCode : 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'An unexpected server error occurred.';

  // Suppress stack trace in production and assessment environments
  res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      field: err.field || undefined,
    },
  });
}

const openApiSpecification = {
  openapi: '3.0.3',
  info: {
    title: 'DocuPulse Backend REST API',
    version: '1.0.0',
    description: 'Document intelligence ingestion, status, extraction, validation, and correction REST API.',
  },
  paths: {
    '/health': {
      get: {
        summary: 'System health check',
        responses: { '200': { description: 'Health status' } },
      },
    },
    '/api/v1/documents': {
      post: {
        summary: 'Upload documents and enqueue processing jobs',
        responses: { '202': { description: 'Jobs queued successfully' } },
      },
      get: {
        summary: 'List documents with pagination, status filtering, and keyword search',
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['queued', 'processing', 'completed', 'needs_review', 'failed'] } },
          { name: 'search', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'Paginated document metadata list' } },
      },
    },
    '/api/v1/documents/{document_id}': {
      get: {
        summary: 'Retrieve document processing status and metadata',
        parameters: [{ name: 'document_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Document metadata' }, '404': { description: 'Document not found' } },
      },
    },
    '/api/v1/documents/{document_id}/result': {
      get: {
        summary: 'Retrieve structured extraction and validation results',
        parameters: [{ name: 'document_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Extraction and validation result' }, '404': { description: 'Document not found' } },
      },
    },
    '/api/v1/documents/{document_id}/corrections': {
      patch: {
        summary: 'Apply validated manual field corrections with audit trail',
        parameters: [{ name: 'document_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Corrections applied' } },
      },
    },
    '/api/v1/documents/{document_id}/retry': {
      post: {
        summary: 'Retry failed or flagged processing job',
        parameters: [{ name: 'document_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { '200': { description: 'Job requeued' }, '409': { description: 'Concurrency conflict' } },
      },
    },
    '/api/v1/documents/search/semantic': {
      get: {
        summary: 'Perform vector semantic search over stored documents using dense embeddings',
        parameters: [
          { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'min_similarity', in: 'query', schema: { type: 'number', default: 0.2 } },
        ],
        responses: { '200': { description: 'Ranked semantic search results' } },
      },
    },
    '/api/v1/documents/cross-verify': {
      post: {
        summary: 'Cross-verify two documents (PDF vs Excel or PDF vs PDF) for line items, PO numbers, and amounts',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['sourceId', 'targetId'],
                properties: {
                  sourceId: { type: 'string' },
                  targetId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Detailed cross-reconciliation report' } },
      },
    },
  },
};
