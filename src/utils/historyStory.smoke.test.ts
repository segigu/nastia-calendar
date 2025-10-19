import { parseJsonWithRecovery, enforceSingleLine } from './promptPostprocessors';
import { normalizeResponse } from './historyStory';

describe('historyStory prompt pipeline', () => {
  it('normalizes arc responses with formatting noise', () => {
    const longDescription = Array(6)
      .fill('Очень длинное описание выбора, которое проверяет усечение текста')
      .join(' ');
    const moonSummary = `Настя, привет! ${'Напоминание держать в уме контракт. '.repeat(12)}`;

    const sampleResponse = `\`\`\`json
{
  "meta": {
    "author": "Test Author",
    "title": "  Тестовая дуга  ",
    "contract": "Arc contract",
    "moon_summary": "${moonSummary}"
  },
  "node": {
    "arc": 1,
    "stage": "Завязка ",
    "scene": "Первая строка дуги.\\nВторая строка сразу после неё."
  },
  "choices": [
    {
      "id": "option-a",
      "title": "  Очень длинный заголовок выбора, который придётся обрезать до допустимой длины  ",
      "description": "${longDescription}"
    },
    {
      "id": "option-b",
      "title": "Короткий вариант",
      "description": "Компактное описание"
    }
  ]
}
\`\`\``;

    const { parsed } = parseJsonWithRecovery(sampleResponse, 'test-arc');
    const response = normalizeResponse(parsed, {
      mode: 'arc',
      authorName: 'Fallback Author',
      genre: 'реализм',
      arcLimit: 5,
      currentArc: 1,
      contract: 'Fallback contract',
    });

    if (!response.meta) {
      throw new Error('meta is required for arc responses');
    }
    expect(response.meta.contract).toBe('Arc contract');
    expect(response.meta.moonSummary.length).toBeLessThanOrEqual(300);
    expect(response.meta.moonSummary.includes('\n')).toBe(false);

    if (!response.node) {
      throw new Error('node is required for arc responses');
    }
    expect(response.node.scene.includes('\n')).toBe(false);

    expect(response.options).toHaveLength(2);
    expect(response.options[0].title.length).toBeLessThanOrEqual(48);
    expect(response.options[0].description.length).toBeLessThanOrEqual(140);
    expect(enforceSingleLine(response.options[0].description)).toBe(response.options[0].description);
  });
});
