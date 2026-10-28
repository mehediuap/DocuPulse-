/**
 * TypeScript Schema Definitions & Runtime Validation for AI Information Extraction
 */

export interface LineItemExtraction {
  description: string | null;
  quantity: number | null;
  unit_price: number | null;
  amount: number | null;
  evidence?: string | null;
  page_reference?: number | null;
}

export type InvoiceLineItem = LineItemExtraction;

export interface FieldEvidenceItem {
  snippet: string | null;
  page_reference: number | null;
  confidence: number;
}

export interface ExtractionMetadataInfo {
  mode: 'mock_rule_based' | 'gemini_llm';
  model_used?: string;
  processing_time_ms: number;
  warnings: string[];
}

export interface InvoiceExtractionResult {
  invoice_number: string | null;
  invoice_date: string | null;
  supplier_name: string | null;
  customer_name: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  currency: string | null;
  line_items: LineItemExtraction[];
  evidence: Record<string, FieldEvidenceItem>;
  extraction_metadata: ExtractionMetadataInfo;
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface SchemaValidationResult {
  isValid: boolean;
  data: InvoiceExtractionResult;
  issues: ValidationIssue[];
}

/**
 * Validates and normalizes raw model or rule-based output against the invoice extraction schema.
 * Handles missing fields, invalid types, and malformed structures safely.
 */
export function validateInvoiceExtraction(raw: any, mode: 'mock_rule_based' | 'gemini_llm' = 'mock_rule_based'): SchemaValidationResult {
  const issues: ValidationIssue[] = [];

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {
      isValid: false,
      issues: [{ field: 'root', message: 'Extraction payload must be a non-null JSON object.', severity: 'error' }],
      data: createEmptyExtractionResult(mode, ['Payload was not a valid object.']),
    };
  }

  // 1. Text Fields
  const invoice_number = parseStringOrNull(raw.invoice_number);
  const invoice_date = parseStringOrNull(raw.invoice_date);
  const supplier_name = parseStringOrNull(raw.supplier_name);
  const customer_name = parseStringOrNull(raw.customer_name);
  const currency = normalizeCurrency(raw.currency);

  // 2. Financial Amount Fields (decimal-safe numeric parsing)
  const subtotal = parseDecimalOrNull(raw.subtotal);
  const tax = parseDecimalOrNull(raw.tax);
  const total = parseDecimalOrNull(raw.total);

  // 3. Line Items Validation
  const line_items: LineItemExtraction[] = [];
  if (Array.isArray(raw.line_items)) {
    for (let i = 0; i < raw.line_items.length; i++) {
      const item = raw.line_items[i];
      if (typeof item === 'object' && item !== null) {
        line_items.push({
          description: parseStringOrNull(item.description),
          quantity: parseDecimalOrNull(item.quantity),
          unit_price: parseDecimalOrNull(item.unit_price),
          amount: parseDecimalOrNull(item.amount),
          evidence: parseStringOrNull(item.evidence),
          page_reference: parseIntegerOrNull(item.page_reference),
        });
      } else {
        issues.push({
          field: `line_items[${i}]`,
          message: 'Malformed line item entry; expected object.',
          severity: 'warning',
        });
      }
    }
  }

  // 4. Evidence Validation
  const evidence: Record<string, FieldEvidenceItem> = {};
  if (raw.evidence && typeof raw.evidence === 'object') {
    for (const [key, val] of Object.entries(raw.evidence)) {
      if (typeof val === 'object' && val !== null) {
        const v = val as any;
        evidence[key] = {
          snippet: parseStringOrNull(v.snippet),
          page_reference: parseIntegerOrNull(v.page_reference),
          confidence: typeof v.confidence === 'number' && !isNaN(v.confidence) ? Math.max(0, Math.min(1, v.confidence)) : 0.9,
        };
      }
    }
  }

  // 5. Warnings and notices
  const warnings: string[] = [];
  if (Array.isArray(raw.extraction_metadata?.warnings)) {
    warnings.push(...raw.extraction_metadata.warnings);
  }

  const resultData: InvoiceExtractionResult = {
    invoice_number,
    invoice_date,
    supplier_name,
    customer_name,
    subtotal,
    tax,
    total,
    currency,
    line_items,
    evidence,
    extraction_metadata: {
      mode: raw.extraction_metadata?.mode || mode,
      model_used: raw.extraction_metadata?.model_used || 'default',
      processing_time_ms: raw.extraction_metadata?.processing_time_ms || 0,
      warnings,
    },
  };

  const hasCriticalErrors = issues.some(i => i.severity === 'error');

  return {
    isValid: !hasCriticalErrors,
    data: resultData,
    issues,
  };
}

export function createEmptyExtractionResult(
  mode: 'mock_rule_based' | 'gemini_llm',
  warnings: string[] = []
): InvoiceExtractionResult {
  return {
    invoice_number: null,
    invoice_date: null,
    supplier_name: null,
    customer_name: null,
    subtotal: null,
    tax: null,
    total: null,
    currency: null,
    line_items: [],
    evidence: {},
    extraction_metadata: {
      mode,
      processing_time_ms: 0,
      warnings,
    },
  };
}

function parseStringOrNull(val: any): string | null {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'unknown' || str.toLowerCase() === 'n/a') {
    return null;
  }
  return str;
}

function parseDecimalOrNull(val: any): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return isNaN(val) ? null : roundToCents(val);
  }
  const str = String(val).replace(/[$€£¥,]/g, '').trim();
  if (!str || str.toLowerCase() === 'null' || str.toLowerCase() === 'unknown') {
    return null;
  }
  const parsed = parseFloat(str);
  return isNaN(parsed) ? null : roundToCents(parsed);
}

function parseIntegerOrNull(val: any): number | null {
  if (val === null || val === undefined) return null;
  const num = parseInt(String(val), 10);
  return isNaN(num) ? null : num;
}

function roundToCents(val: number): number {
  return Math.round(val * 100) / 100;
}

function normalizeCurrency(raw: any): string | null {
  if (!raw) return null;
  const str = String(raw).trim().toUpperCase();
  const map: Record<string, string> = {
    '$': 'USD',
    '€': 'EUR',
    '£': 'GBP',
    '¥': 'JPY',
    '₹': 'INR',
  };
  return map[str] || str || null;
}
