interface VendorClassification {
  vendorName: string;
  extractionMethod: 'programmatic' | 'claude_vision';
}

const VENDOR_PATTERNS: Array<{ pattern: RegExp; vendor: string; method: 'programmatic' | 'claude_vision' }> = [
  { pattern: /^(Copy of )?(Asiri|ASiri)/i, vendor: 'Asiri Blooms', method: 'programmatic' },
  { pattern: /^(Copy of )?(Doran|DORAN|DBH)/i, vendor: 'Bill Doran', method: 'claude_vision' },
  { pattern: /^(Copy of )?CPF/i, vendor: 'CPF (Cleveland Plant & Flower)', method: 'claude_vision' },
  { pattern: /^(Copy of )?(Dreisbach|Dresibach)/i, vendor: 'Dreisbach', method: 'claude_vision' },
  { pattern: /^(Copy of )?Sams Club/i, vendor: "Sam's Club", method: 'claude_vision' },
  { pattern: /^(Copy of )?Budzi/i, vendor: 'Budzi', method: 'claude_vision' },
  { pattern: /^(Copy of )?Claprood/i, vendor: 'Claprood', method: 'claude_vision' },
  { pattern: /^(Copy of )?Virgin Direct/i, vendor: 'Virgin Direct', method: 'claude_vision' },
  { pattern: /^(Copy of )?(Xerox|Pages from Xerox)/i, vendor: 'Xerox Scan (Unknown Vendor)', method: 'claude_vision' },
  { pattern: /^(Copy of )?Receipt_/i, vendor: 'Unknown', method: 'claude_vision' },
  { pattern: /^(Copy of )?(Flowers|2\d{3}\s*-)/i, vendor: 'Unknown', method: 'claude_vision' },
];

export function classifyVendor(filename: string): VendorClassification {
  for (const { pattern, vendor, method } of VENDOR_PATTERNS) {
    if (pattern.test(filename)) {
      return { vendorName: vendor, extractionMethod: method };
    }
  }
  return { vendorName: 'Unknown', extractionMethod: 'claude_vision' };
}

/**
 * Check if a filename is a duplicate (Google Drive creates "(1)" copies).
 * Returns true if this is a duplicate that should be skipped.
 */
export function isDuplicate(filename: string): boolean {
  return /\(\d+\)\.pdf$/i.test(filename);
}
