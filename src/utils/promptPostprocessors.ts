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

/**
 * Попытка исправить незакрытые кавычки и обрезанный JSON
 */
function fixTruncatedJson(jsonText: string): string {
  let result = jsonText.trim();

  // Подсчитываем кавычки вне escape-последовательностей
  let quoteCount = 0;
  let inEscape = false;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === '\\' && !inEscape) {
      inEscape = true;
    } else if (result[i] === '"' && !inEscape) {
      quoteCount++;
    } else {
      inEscape = false;
    }
  }

  // Если нечетное количество кавычек - закрываем последнюю строку
  if (quoteCount % 2 !== 0) {
    result += '"';
  }

  // Закрываем незакрытые объекты и массивы
  let openBraces = 0;
  let openBrackets = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === '{') openBraces++;
    if (result[i] === '}') openBraces--;
    if (result[i] === '[') openBrackets++;
    if (result[i] === ']') openBrackets--;
  }

  // Закрываем все открытые структуры
  while (openBraces > 0) {
    result += '}';
    openBraces--;
  }
  while (openBrackets > 0) {
    result += ']';
    openBrackets--;
  }

  return result;
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

    // Стратегия 1: Исправить переносы строк внутри строковых значений
    try {
      const fixedText = fixSmartNewlines(cleanText);
      return { parsed: JSON.parse(fixedText) as T, cleanText: fixedText };
    } catch (fixError) {
      console.error(`[PromptRecovery] Smart newline fix failed (${label}):`, fixError);
    }

    // Стратегия 2: Агрессивная очистка пробелов
    try {
      const aggressiveText = aggressiveJsonCleanup(cleanText);
      return { parsed: JSON.parse(aggressiveText) as T, cleanText: aggressiveText };
    } catch (aggressiveError) {
      console.error(`[PromptRecovery] Aggressive cleanup failed (${label}):`, aggressiveError);
    }

    // Стратегия 3: Исправление незакрытых кавычек и скобок
    try {
      const truncatedFixed = fixTruncatedJson(cleanText);
      return { parsed: JSON.parse(truncatedFixed) as T, cleanText: truncatedFixed };
    } catch (truncFixError) {
      console.error(`[PromptRecovery] Truncated JSON fix failed (${label}):`, truncFixError);
    }

    // Стратегия 4: Комбинация агрессивной очистки + исправление обрезанного JSON
    try {
      const combinedFix = fixTruncatedJson(aggressiveJsonCleanup(cleanText));
      return { parsed: JSON.parse(combinedFix) as T, cleanText: combinedFix };
    } catch (combinedError) {
      console.error(`[PromptRecovery] Combined fix failed (${label}):`, combinedError);
    }

    // Стратегия 5: Обрезать до последней закрывающей скобки
    try {
      const lastBrace = cleanText.lastIndexOf('}');
      if (lastBrace > 0) {
        const truncated = cleanText.substring(0, lastBrace + 1);
        const fixedTruncated = fixTruncatedJson(aggressiveJsonCleanup(truncated));
        return { parsed: JSON.parse(fixedTruncated) as T, cleanText: fixedTruncated };
      }
    } catch (truncatedError) {
      console.error(`[PromptRecovery] Final truncated recovery failed (${label}):`, truncatedError);
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
