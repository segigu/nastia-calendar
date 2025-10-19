export function stripJsonMarkdown(text: string): string {
  return text.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
}

export function fixSmartNewlines(jsonText: string): string {
  let result = '';
  let insideString = false;
  let prevChar = '';

  for (let i = 0; i < jsonText.length; i++) {
    const char = jsonText[i];

    if (char === '"' && prevChar !== '\\') {
      insideString = !insideString;
      result += char;
    } else if (insideString && (char === '\n' || char === '\r')) {
      result += ' ';
    } else {
      result += char;
    }

    prevChar = char;
  }

  return result;
}

function aggressiveJsonCleanup(jsonText: string): string {
  return jsonText
    .replace(/\\n/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+"/g, '"')
    .replace(/\s+}/g, '}')
    .replace(/\s+]/g, ']')
    .replace(/"\s+/g, '"')
    .replace(/{\s+/g, '{')
    .replace(/\[\s+/g, '[');
}

export interface JsonRecoveryResult<T = any> {
  parsed: T;
  cleanText: string;
}

export function parseJsonWithRecovery<T = any>(rawText: string, label: string): JsonRecoveryResult<T> {
  const cleanText = stripJsonMarkdown(rawText);

  try {
    return { parsed: JSON.parse(cleanText) as T, cleanText };
  } catch (parseError) {
    console.error(`[PromptRecovery] JSON parse error (${label}):`, parseError);
    console.error(`[PromptRecovery] Raw text (first 500 chars):`, cleanText.slice(0, 500));

    try {
      const fixedText = fixSmartNewlines(cleanText);
      return { parsed: JSON.parse(fixedText) as T, cleanText: fixedText };
    } catch (fixError) {
      console.error(`[PromptRecovery] Smart newline fix failed (${label}):`, fixError);
    }

    try {
      const aggressiveText = aggressiveJsonCleanup(cleanText);
      return { parsed: JSON.parse(aggressiveText) as T, cleanText: aggressiveText };
    } catch (aggressiveError) {
      console.error(`[PromptRecovery] Aggressive cleanup failed (${label}):`, aggressiveError);
    }

    try {
      const lastBrace = cleanText.lastIndexOf('}');
      if (lastBrace > 0) {
        const truncated = cleanText.substring(0, lastBrace + 1);
        const fixedTruncated = aggressiveJsonCleanup(truncated);
        return { parsed: JSON.parse(fixedTruncated) as T, cleanText: fixedTruncated };
      }
    } catch (truncatedError) {
      console.error(`[PromptRecovery] Truncated recovery failed (${label}):`, truncatedError);
    }

    throw parseError;
  }
}

export function enforceSingleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function clampString(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength).trimEnd();
}
