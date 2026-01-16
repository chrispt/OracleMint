/**
 * Card name normalization utilities for consistent matching
 */

/**
 * Normalize a card name for consistent database lookups
 * Handles accents, apostrophes, special characters, and whitespace
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')                    // Decompose accents (é → e + combining accent)
    .replace(/[\u0300-\u036f]/g, '')     // Remove combining accent marks
    .replace(/['']/g, "'")               // Normalize curly apostrophes to straight
    .replace(/[^\w\s'/-]/g, '')          // Remove special chars except ' / -
    .replace(/\s+/g, ' ')                // Collapse multiple whitespace
    .trim();
}

/**
 * Parse a card name input into all possible matching variants
 * Handles split cards (Fire // Ice), DFCs, and adventure cards
 */
export function parseCardNameVariants(input: string): string[] {
  const normalized = normalizeName(input);
  const variants = [normalized];

  // Handle split/DFC naming: "Fire // Ice" → ["fire // ice", "fire", "ice"]
  if (normalized.includes('//')) {
    const parts = normalized.split('//').map(p => p.trim());
    variants.push(...parts);
  }

  return [...new Set(variants)]; // Remove duplicates
}

/**
 * Extract individual face names from a full DFC/split card name
 */
export function extractFaceNames(fullName: string): string[] {
  if (!fullName.includes('//')) {
    return [fullName];
  }
  return fullName.split('//').map(part => part.trim());
}

/**
 * Check if a name looks like a DFC/split card (contains //)
 */
export function isMultiFaceCardName(name: string): boolean {
  return name.includes('//');
}

/**
 * Combine two face names into the standard DFC/split format
 */
export function combineFaceNames(frontFace: string, backFace: string): string {
  return `${frontFace} // ${backFace}`;
}
