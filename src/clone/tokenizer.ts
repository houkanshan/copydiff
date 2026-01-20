/**
 * Tokenizer module for validating clone detection results.
 * Provides token-based comparison to double-check jscpd's similarity reports.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ClonePair, CloneRegion } from "./jscpd";

type Token = {
  text: string;
  type: "word" | "operator" | "whitespace" | "string" | "number";
};

// Pattern to extract tokens: words, numbers, operators/punctuation, whitespace
const tokenPattern = /\w+|\d+(?:\.\d+)?|[^\w\s]+|\s+/g;

const classifyToken = (text: string): Token["type"] => {
  if (/^\s+$/.test(text)) {
    return "whitespace";
  }
  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return "number";
  }
  if (/^\w+$/.test(text)) {
    return "word";
  }
  return "operator";
};

const tokenize = (code: string): Token[] => {
  const tokens: Token[] = [];
  for (const match of code.matchAll(tokenPattern)) {
    const text = match[0];
    tokens.push({
      text,
      type: classifyToken(text)
    });
  }
  return tokens;
};

const getNonWhitespaceTokens = (tokens: Token[]): Token[] =>
  tokens.filter((t) => t.type !== "whitespace");

/**
 * Calculate similarity between two token sequences using LCS.
 * Returns a value between 0 and 1.
 */
const calculateTokenSimilarity = (tokensA: Token[], tokensB: Token[]): number => {
  const a = getNonWhitespaceTokens(tokensA);
  const b = getNonWhitespaceTokens(tokensB);

  if (a.length === 0 && b.length === 0) {
    return 1;
  }
  if (a.length === 0 || b.length === 0) {
    return 0;
  }

  // Build LCS matrix
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    Array.from({ length: b.length + 1 }, () => 0)
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      if (a[i].text === b[j].text) {
        matrix[i][j] = matrix[i + 1][j + 1] + 1;
      } else {
        matrix[i][j] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
      }
    }
  }

  const lcsLength = matrix[0][0];
  const maxLength = Math.max(a.length, b.length);
  return lcsLength / maxLength;
};

/**
 * Extract lines from a file for a given region.
 */
const extractRegionCode = async (
  repoRoot: string,
  region: CloneRegion
): Promise<string> => {
  const filePath = path.isAbsolute(region.file)
    ? region.file
    : path.join(repoRoot, region.file);

  const content = await readFile(filePath, "utf8");
  const lines = content.split("\n");

  // Lines are 1-indexed in CloneRegion
  const startIdx = Math.max(0, region.startLine - 1);
  const endIdx = Math.min(lines.length, region.endLine);

  return lines.slice(startIdx, endIdx).join("\n");
};

type ValidationResult = {
  pair: ClonePair;
  calculatedSimilarity: number;
  tokenCountA: number;
  tokenCountB: number;
  isValid: boolean;
  reason?: string;
};

type ValidateOptions = {
  repoRoot: string;
  minSimilarity?: number; // Default 0.5
  minTokens?: number; // Default 4
  verbose?: boolean;
};

/**
 * Validate a single clone pair by comparing actual token content.
 */
const validateClonePair = async (
  pair: ClonePair,
  options: ValidateOptions
): Promise<ValidationResult> => {
  const minSimilarity = options.minSimilarity ?? 0.5;
  const minTokens = options.minTokens ?? 4;

  try {
    const [codeA, codeB] = await Promise.all([
      extractRegionCode(options.repoRoot, pair.a),
      extractRegionCode(options.repoRoot, pair.b)
    ]);

    const tokensA = tokenize(codeA);
    const tokensB = tokenize(codeB);

    const nonWsA = getNonWhitespaceTokens(tokensA);
    const nonWsB = getNonWhitespaceTokens(tokensB);

    // Check minimum token count
    if (nonWsA.length < minTokens || nonWsB.length < minTokens) {
      return {
        pair,
        calculatedSimilarity: 0,
        tokenCountA: nonWsA.length,
        tokenCountB: nonWsB.length,
        isValid: false,
        reason: `insufficient tokens (A: ${nonWsA.length}, B: ${nonWsB.length}, min: ${minTokens})`
      };
    }

    const calculatedSimilarity = calculateTokenSimilarity(tokensA, tokensB);

    // Check token count balance
    const tokenCountRatio = Math.min(nonWsA.length, nonWsB.length) / Math.max(nonWsA.length, nonWsB.length);
    if (tokenCountRatio < 0.5) {
      return {
        pair,
        calculatedSimilarity,
        tokenCountA: nonWsA.length,
        tokenCountB: nonWsB.length,
        isValid: false,
        reason: `token count imbalance (A: ${nonWsA.length}, B: ${nonWsB.length}, ratio: ${tokenCountRatio.toFixed(2)})`
      };
    }

    // Check similarity threshold
    if (calculatedSimilarity < minSimilarity) {
      return {
        pair,
        calculatedSimilarity,
        tokenCountA: nonWsA.length,
        tokenCountB: nonWsB.length,
        isValid: false,
        reason: `low similarity (${(calculatedSimilarity * 100).toFixed(1)}% < ${(minSimilarity * 100).toFixed(1)}%)`
      };
    }

    return {
      pair,
      calculatedSimilarity,
      tokenCountA: nonWsA.length,
      tokenCountB: nonWsB.length,
      isValid: true
    };
  } catch (error) {
    return {
      pair,
      calculatedSimilarity: 0,
      tokenCountA: 0,
      tokenCountB: 0,
      isValid: false,
      reason: `error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
};

/**
 * Validate multiple clone pairs, filtering out false positives.
 */
const validateClonePairs = async (
  pairs: ClonePair[],
  options: ValidateOptions
): Promise<{ valid: ClonePair[]; results: ValidationResult[] }> => {
  const results = await Promise.all(pairs.map((pair) => validateClonePair(pair, options)));

  if (options.verbose) {
    results
      .filter((r) => !r.isValid)
      .forEach((r) => {
        process.stderr.write(
          `[copydiff] filtered clone: ${r.pair.a.file}:${r.pair.a.startLine}-${r.pair.a.endLine} vs ` +
            `${r.pair.b.file}:${r.pair.b.startLine}-${r.pair.b.endLine} - ${r.reason}\n`
        );
      });
  }

  return {
    valid: results.filter((r) => r.isValid).map((r) => r.pair),
    results
  };
};

export {
  calculateTokenSimilarity,
  extractRegionCode,
  getNonWhitespaceTokens,
  tokenize,
  validateClonePair,
  validateClonePairs
};
export type { Token, ValidateOptions, ValidationResult };
