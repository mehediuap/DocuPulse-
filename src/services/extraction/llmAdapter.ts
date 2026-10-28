/**
 * Configurable LLM & Deterministic Extraction Adapters
 * Supports Gemini 3.8 Flash and deterministic offline mock/rule-based mode.
 */

import { GoogleGenAI } from '@google/genai';
import {
  InvoiceExtractionResult,
  LineItemExtraction,
  validateInvoiceExtraction,
  createEmptyExtractionResult,
} from './schemas.ts';
import {
  INVOICE_EXTRACTION_SYSTEM_INSTRUCTION,
  buildInvoiceExtractionPrompt,
} from './prompts.ts';

export interface ExtractionOptions {
  timeoutMs?: number;
  mockMode?: boolean;
  modelOverride?: string;
}

export interface ExtractionAdapter {
  extract(documentText: string, options?: ExtractionOptions): Promise<InvoiceExtractionResult>;
}

/**
 * Deterministic, offline, rule-based extractor.
 * Operates hermetically without any external network or paid API key.
 * Always returns null for missing fields and labels its mode clearly.
 */
export class MockRuleBasedAdapter implements ExtractionAdapter {
  public async extract(
    documentText: string,
    options: ExtractionOptions = {}
  ): Promise<InvoiceExtractionResult> {
    const startTime = performance.now();
    logSafe(`Executing MockRuleBasedAdapter on document (${documentText.length} chars)`);

    const warnings: string[] = [];
    const evidence: Record<string, any> = {};

    // Determine page reference if marked
    const pageMatch = documentText.match(/---\s*PAGE\s*(\d+)\s*---/i);
    const defaultPage = pageMatch ? parseInt(pageMatch[1], 10) : 1;

    // Strip processor banners from text before free-form regex matching
    const cleanContent = documentText
      .split('\n')
      .filter(l => !l.startsWith('--- CSV DATA:') && !l.startsWith('--- WORKSHEET:'))
      .join('\n');

    let invoice_number: string | null = null;
    let invoice_date: string | null = null;
    let supplier_name: string | null = null;
    let customer_name: string | null = null;
    let subtotal: number | null = null;
    let tax: number | null = null;
    let total: number | null = null;
    let currency: string | null = null;

    // A. Check for structured spreadsheet / CSV tables
    const docLines = documentText.split('\n').map(l => l.trim());
    for (let i = 0; i < docLines.length; i++) {
      const line = docLines[i];

      // Table Header row (e.g. "Invoice Number | Date | Supplier | Customer | Subtotal | Tax | Total | Currency")
      if (line.includes(' | ') && !line.startsWith('Row ') && !line.startsWith('---')) {
        const headers = line.split(' | ').map(h => h.trim().toLowerCase());
        const dataRow = docLines.slice(i + 1).find(l => l.startsWith('Row ') && l.includes(' | '));
        if (dataRow) {
          const cells = dataRow.replace(/^Row\s*\d+:\s*/, '').split(' | ').map(c => c.trim().replace(/^["']|["']$/g, ''));
          const getVal = (keywords: string[], exclude?: string[]) => {
            const idx = headers.findIndex(h => {
              if (exclude && exclude.some(ex => h.includes(ex))) return false;
              return keywords.some(k => h === k || h.includes(k));
            });
            return idx !== -1 && cells[idx] !== undefined && cells[idx] !== '' ? cells[idx] : null;
          };

          const inv = getVal(['invoice number', 'inv #', 'invoice']);
          if (inv && !invoice_number) invoice_number = inv;

          const dt = getVal(['date', 'issue date', 'dated']);
          if (dt && !invoice_date) invoice_date = dt;

          const sup = getVal(['supplier', 'vendor', 'billed by']);
          if (sup && !supplier_name) supplier_name = sup;

          const cus = getVal(['customer', 'client', 'billed to', 'sold to']);
          if (cus && !customer_name) customer_name = cus;

          const sub = getVal(['subtotal', 'sub-total', 'net amount']);
          if (sub && subtotal === null) {
            const num = parseFloat(sub.replace(/[^0-9.]/g, ''));
            if (!isNaN(num)) subtotal = num;
          }

          const tx = getVal(['tax', 'vat', 'gst']);
          if (tx && tax === null) {
            const num = parseFloat(tx.replace(/[^0-9.]/g, ''));
            if (!isNaN(num)) tax = num;
          }

          const tot = getVal(['total', 'grand total', 'balance due', 'amount due'], ['subtotal', 'sub-total']);
          if (tot && total === null) {
            const num = parseFloat(tot.replace(/[^0-9.]/g, ''));
            if (!isNaN(num)) total = num;
          }

          const cur = getVal(['currency']);
          if (cur && !currency) currency = cur.toUpperCase();
        }
      }

      // Key-Value rows (e.g. "Row 2: Invoice Number | INV-2026-004")
      if (line.startsWith('Row ') && line.includes(' | ')) {
        const parts = line.replace(/^Row\s*\d+:\s*/, '').split(' | ').map(p => p.trim());
        if (parts.length >= 2) {
          const k = parts[0].toLowerCase();
          const v = parts[1].replace(/^["']|["']$/g, '');
          if (v && v.length > 0) {
            if ((k === 'invoice number' || k === 'invoice' || k === 'inv #') && !invoice_number) invoice_number = v;
            if ((k === 'date' || k === 'issue date') && !invoice_date) invoice_date = v;
            if ((k === 'supplier' || k === 'vendor') && !supplier_name) supplier_name = v;
            if ((k === 'customer' || k === 'client') && !customer_name) customer_name = v;
            if (k.includes('subtotal') && subtotal === null) {
              const num = parseFloat(v.replace(/[^0-9.]/g, ''));
              if (!isNaN(num)) subtotal = num;
            }
            if ((k === 'tax' || k === 'vat') && tax === null) {
              const num = parseFloat(v.replace(/[^0-9.]/g, ''));
              if (!isNaN(num)) tax = num;
            }
            if (k.includes('total') && !k.includes('subtotal') && total === null) {
              const num = parseFloat(v.replace(/[^0-9.]/g, ''));
              if (!isNaN(num)) total = num;
            }
            if (k === 'currency' && !currency) currency = v.toUpperCase();
          }
        }
      }
    }

    // B. Fallback to free-form document regex patterns
    // 1. Invoice Number
    if (!invoice_number) {
      const invMatch = cleanContent.match(/(?:Invoice\s*(?:#|No\.?|Num|Number)?|INV-?)\s*[:\-]?\s*([A-Za-z0-9\-]+)/i);
      if (invMatch) {
        invoice_number = invMatch[1].trim();
        evidence.invoice_number = {
          snippet: invMatch[0],
          page_reference: defaultPage,
          confidence: 0.98,
        };
      }
    } else {
      evidence.invoice_number = { snippet: `Invoice Number: ${invoice_number}`, page_reference: defaultPage, confidence: 0.98 };
    }

    // 2. Invoice Date
    if (!invoice_date) {
      const dateMatch = cleanContent.match(
        /(?:Date|Issue\s*Date|Dated|Invoice\s*Date)\s*[:\-]?\s*([0-9]{4}[-/][0-9]{2}[-/][0-9]{2}|[0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{2,4}|[A-Za-z]+\s+[0-9]{1,2},?\s+[0-9]{4})/i
      );
      if (dateMatch) {
        invoice_date = dateMatch[1].trim();
        evidence.invoice_date = {
          snippet: dateMatch[0],
          page_reference: defaultPage,
          confidence: 0.95,
        };
      }
    } else {
      evidence.invoice_date = { snippet: `Date: ${invoice_date}`, page_reference: defaultPage, confidence: 0.95 };
    }

    // 3. Supplier Name
    if (!supplier_name) {
      const supplierMatch = cleanContent.match(
        /(?:Supplier|From|Vendor|Issuer|Billed\s*By)\s*[:\-]?\s*([^\n\r,]+(?:Ltd|Inc|LLC|Corp|Corporation|GmbH|Co\.?|Technologies|Logistics|Solutions)?)/i
      );
      if (supplierMatch) {
        supplier_name = supplierMatch[1].trim();
        evidence.supplier_name = {
          snippet: supplierMatch[0],
          page_reference: defaultPage,
          confidence: 0.92,
        };
      } else {
        const lines = cleanContent.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('---'));
        if (lines.length > 0 && /^[A-Z][A-Za-z0-9\s.,&-]{3,40}$/.test(lines[0])) {
          supplier_name = lines[0];
          evidence.supplier_name = {
            snippet: lines[0],
            page_reference: defaultPage,
            confidence: 0.85,
          };
        }
      }
    } else {
      evidence.supplier_name = { snippet: `Supplier: ${supplier_name}`, page_reference: defaultPage, confidence: 0.92 };
    }

    // 4. Customer Name
    if (!customer_name) {
      const customerMatch = cleanContent.match(
        /(?:Customer|Client|Billed\s*To|Bill\s*To|Invoice\s*To|Sold\s*To|Attn)\s*[:\-]?\s*([^\n\r]+)/i
      );
      if (customerMatch) {
        customer_name = customerMatch[1].trim();
        evidence.customer_name = {
          snippet: customerMatch[0],
          page_reference: defaultPage,
          confidence: 0.92,
        };
      }
    } else {
      evidence.customer_name = { snippet: `Customer: ${customer_name}`, page_reference: defaultPage, confidence: 0.92 };
    }

    // 5. Currency
    if (!currency) {
      if (/\bUSD\b|\$/i.test(cleanContent)) currency = 'USD';
      else if (/\bEUR\b|€/i.test(cleanContent)) currency = 'EUR';
      else if (/\bGBP\b|£/i.test(cleanContent)) currency = 'GBP';
      else if (/\bJPY\b|¥/i.test(cleanContent)) currency = 'JPY';
      else if (/\bCAD\b/i.test(cleanContent)) currency = 'CAD';
    }
    if (currency) {
      evidence.currency = {
        snippet: `Detected currency: ${currency}`,
        page_reference: defaultPage,
        confidence: 0.99,
      };
    }

    // 6. Subtotal, Tax, Total amounts
    if (subtotal === null) {
      const subtotalMatch = cleanContent.match(/(?:Subtotal|Sub-Total|Net\s*Amount)\s*[:\-]?\s*[$€£¥]?\s*([0-9,]+\.[0-9]{2})/i);
      if (subtotalMatch) {
        subtotal = parseFloat(subtotalMatch[1].replace(/,/g, ''));
        evidence.subtotal = {
          snippet: subtotalMatch[0],
          page_reference: defaultPage,
          confidence: 0.95,
        };
      }
    } else {
      evidence.subtotal = { snippet: `Subtotal: ${subtotal}`, page_reference: defaultPage, confidence: 0.95 };
    }

    if (tax === null) {
      const taxMatch = cleanContent.match(/(?:Tax|VAT|GST|Sales\s*Tax)\s*(?:\([^)]*\))?\s*[:\-]?\s*[$€£¥]?\s*([0-9,]+\.[0-9]{2})/i);
      if (taxMatch) {
        tax = parseFloat(taxMatch[1].replace(/,/g, ''));
        evidence.tax = {
          snippet: taxMatch[0],
          page_reference: defaultPage,
          confidence: 0.95,
        };
      }
    } else {
      evidence.tax = { snippet: `Tax: ${tax}`, page_reference: defaultPage, confidence: 0.95 };
    }

    if (total === null) {
      const totalMatch = cleanContent.match(/\b(?:Total\s*Balance(?:\s*Due)?|Amount\s*Due|Balance\s*Due|Grand\s*Total|Total)\s*[:\-]?\s*[$€£¥]?\s*([0-9,]+\.[0-9]{2})/i);
      if (totalMatch) {
        total = parseFloat(totalMatch[1].replace(/,/g, ''));
        evidence.total = {
          snippet: totalMatch[0],
          page_reference: defaultPage,
          confidence: 0.98,
        };
      }
    } else {
      evidence.total = { snippet: `Total: ${total}`, page_reference: defaultPage, confidence: 0.98 };
    }

    // 7. Line Items
    const line_items: LineItemExtraction[] = this.extractTabularLineItems(documentText, defaultPage);

    // Track missing required fields
    if (!invoice_number) warnings.push('invoice_number was not found in document text (null).');
    if (!invoice_date) warnings.push('invoice_date was not found in document text (null).');
    if (!supplier_name) warnings.push('supplier_name was not found in document text (null).');
    if (!customer_name) warnings.push('customer_name was not found in document text (null).');
    if (total === null) warnings.push('total amount was not found in document text (null).');
    if (line_items.length === 0) warnings.push('No itemized line items found in document structure.');

    const duration = Math.round(performance.now() - startTime);

    const rawPayload = {
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
        mode: 'mock_rule_based',
        model_used: 'deterministic_rule_parser',
        processing_time_ms: duration,
        warnings,
      },
    };

    const validation = validateInvoiceExtraction(rawPayload, 'mock_rule_based');
    return validation.data;
  }

  private extractTabularLineItems(text: string, defaultPage: number): LineItemExtraction[] {
    const items: LineItemExtraction[] = [];
    const lines = text.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('---') || trimmed.toLowerCase().includes('subtotal') || trimmed.toLowerCase().includes('total:')) {
        continue;
      }

      // Check pipe-delimited format: Description | Qty | Unit Price | Amount
      if (trimmed.includes('|')) {
        const parts = trimmed.split('|').map(p => p.trim());
        if (parts.length >= 3) {
          // Check if last element is a numeric price
          const lastNumMatch = parts[parts.length - 1].match(/[$€£¥]?\s*([0-9,]+\.[0-9]{2})/);
          if (lastNumMatch) {
            const amount = parseFloat(lastNumMatch[1].replace(/,/g, ''));
            const desc = parts[0].replace(/^Row\s*\d+:\s*/, '').trim();
            let qty: number | null = null;
            let unitPrice: number | null = null;

            if (parts.length >= 4) {
              const qtyMatch = parts[1].match(/([0-9]+(?:\.[0-9]+)?)/);
              if (qtyMatch) qty = parseFloat(qtyMatch[1]);
              const unitMatch = parts[2].match(/[$€£¥]?\s*([0-9,]+\.[0-9]{2})/);
              if (unitMatch) unitPrice = parseFloat(unitMatch[1].replace(/,/g, ''));
            }

            items.push({
              description: desc,
              quantity: qty,
              unit_price: unitPrice,
              amount,
              evidence: trimmed,
              page_reference: defaultPage,
            });
          }
        }
      } else {
        // Space-delimited format: "Description Words 2 250.00 500.00"
        const spaceMatch = trimmed.match(/^([A-Za-z0-9\s.,\-_]{4,50}?)\s+([0-9]+(?:\.[0-9]+)?)\s+([0-9,]+\.[0-9]{2})\s+([0-9,]+\.[0-9]{2})$/);
        if (spaceMatch) {
          const desc = spaceMatch[1].trim();
          if (!desc.toLowerCase().startsWith('invoice') && !desc.toLowerCase().startsWith('supplier')) {
            const qty = parseFloat(spaceMatch[2]);
            const unitPrice = parseFloat(spaceMatch[3].replace(/,/g, ''));
            const amount = parseFloat(spaceMatch[4].replace(/,/g, ''));
            items.push({
              description: desc,
              quantity: qty,
              unit_price: unitPrice,
              amount,
              evidence: trimmed,
              page_reference: defaultPage,
            });
          }
        }
      }
    }

    return items;
  }
}

/**
 * Gemini LLM Extraction Adapter using @google/genai TypeScript SDK.
 * Supports configurable model, strict schema validation, and defensive timeout handling.
 */
export class GeminiExtractionAdapter implements ExtractionAdapter {
  private ai: GoogleGenAI | null = null;
  private model: string;

  constructor(apiKey?: string, model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite') {
    const key = apiKey || process.env.GEMINI_API_KEY;
    this.model = model;

    if (key) {
      this.ai = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }

  public async extract(
    documentText: string,
    options: ExtractionOptions = {}
  ): Promise<InvoiceExtractionResult> {
    const startTime = performance.now();
    const timeoutMs = options.timeoutMs || parseInt(process.env.EXTRACTION_TIMEOUT_MS || '30000', 10);
    const modelName = options.modelOverride || this.model;

    logSafe(`Executing GeminiExtractionAdapter with model ${modelName} (${documentText.length} chars)`);

    if (!this.ai) {
      throw new Error('GEMINI_API_KEY is not configured. Enable mock mode or provide GEMINI_API_KEY.');
    }

    const prompt = buildInvoiceExtractionPrompt(documentText);

    // Helper for executing generateContent with timeout
    const executeCall = async (modelToUse: string, msLimit: number) => {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Extraction timed out after ${msLimit}ms`)), msLimit);
      });

      const callPromise = this.ai!.models.generateContent({
        model: modelToUse,
        contents: prompt,
        config: {
          systemInstruction: INVOICE_EXTRACTION_SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      });

      return await Promise.race([callPromise, timeoutPromise]);
    };

    try {
      let response: any;
      try {
        response = await executeCall(modelName, timeoutMs);
      } catch (primaryErr) {
        const primaryErrMsg = primaryErr instanceof Error ? primaryErr.message : String(primaryErr);
        // If primary model encountered a temporary spike (503), timeout, rate-limit, or quota exhaustion (429), attempt fast lite model fallback
        if (
          modelName !== 'gemini-3.1-flash-lite' &&
          (primaryErrMsg.includes('503') ||
            primaryErrMsg.includes('demand') ||
            primaryErrMsg.includes('timed out') ||
            primaryErrMsg.includes('429') ||
            primaryErrMsg.includes('Quota') ||
            primaryErrMsg.includes('RESOURCE_EXHAUSTED'))
        ) {
          logSafe(`Primary model ${modelName} unavailable (${primaryErrMsg.slice(0, 80)}). Retrying with gemini-3.1-flash-lite...`);
          response = await executeCall('gemini-3.1-flash-lite', Math.max(10000, timeoutMs));
        } else {
          throw primaryErr;
        }
      }

      const rawText = response.text || '{}';

      // Parse JSON safely
      let parsed: any;
      try {
        const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
        parsed = JSON.parse(cleaned);
      } catch (jsonErr) {
        throw new Error(`Model returned malformed JSON: ${String(jsonErr)}`);
      }

      const duration = Math.round(performance.now() - startTime);
      parsed.extraction_metadata = {
        mode: 'gemini_llm',
        model_used: modelName,
        processing_time_ms: duration,
        warnings: parsed.extraction_metadata?.warnings || [],
      };

      const validated = validateInvoiceExtraction(parsed, 'gemini_llm');
      return validated.data;
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      const errMsg = err instanceof Error ? err.message : String(err);
      logSafe(`Gemini extraction failed: ${errMsg}`);

      // Gracefully fall back to deterministic rule-based extractor so real invoice fields
      // are recovered without failing the document job
      try {
        const fallbackAdapter = new MockRuleBasedAdapter();
        const fallbackResult = await fallbackAdapter.extract(documentText, options);
        return {
          ...fallbackResult,
          extraction_metadata: {
            ...fallbackResult.extraction_metadata,
            mode: 'gemini_llm',
            model_used: `${modelName} (fallback: deterministic_rule_parser)`,
            processing_time_ms: duration,
            warnings: [
              `Provider failure: ${errMsg}`,
              'Gracefully fell back to deterministic rule-based extractor.',
              ...(fallbackResult.extraction_metadata?.warnings || [])
            ],
          },
        };
      } catch {
        return {
          ...createEmptyExtractionResult('gemini_llm', [`Provider failure: ${errMsg}`]),
          extraction_metadata: {
            mode: 'gemini_llm',
            model_used: modelName,
            processing_time_ms: duration,
            warnings: [`Provider failure: ${errMsg}`],
          },
        };
      }
    }
  }
}

/**
 * Factory to instantiate the appropriate adapter based on configuration and environment.
 */
export class ExtractionFactory {
  public static createAdapter(forceMock = false): ExtractionAdapter {
    const mode = process.env.EXTRACTION_MODE?.toLowerCase();
    const hasKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY');

    if (forceMock || mode === 'mock' || !hasKey) {
      return new MockRuleBasedAdapter();
    }

    const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
    return new GeminiExtractionAdapter(process.env.GEMINI_API_KEY, model);
  }
}

/**
 * Defensive logging utility that suppresses full invoice contents by default.
 */
function logSafe(message: string): void {
  const allowSensitive = process.env.ENABLE_SENSITIVE_LOGGING === 'true';
  if (allowSensitive) {
    console.log(`[ExtractionService] ${message}`);
  } else {
    // Redact any potentially sensitive token or payload details
    const sanitized = message.replace(/(?:Invoice|Amount|Total|Supplier|INV-?)\s*[:=]?\s*[^\s,]+/gi, '[REDACTED]');
    console.log(`[ExtractionService] ${sanitized}`);
  }
}
