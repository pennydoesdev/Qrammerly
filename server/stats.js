// Cheap text-quality stats — readability, word/sentence counts, vocabulary
// diversity. No ML needed; this complements the LLM suggestions with the kind
// of editorial-dashboard numbers users expect from a writing assistant.

const VOWELS = /[aeiouy]+/g;

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  const m = w.match(VOWELS);
  let count = m ? m.length : 1;
  if (w.endsWith("e") && count > 1) count -= 1;
  return Math.max(1, count);
}

export function textStats(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      words: 0, sentences: 0, characters: 0,
      avg_word_length: 0, vocabulary_diversity: 0,
      flesch_reading_ease: null, flesch_kincaid_grade: null,
      reading_time_minutes: 0,
    };
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  const sentences = trimmed.split(/[.!?]+/).map((s) => s.trim()).filter(Boolean);
  const characters = trimmed.length;
  const wordCount = words.length;
  const sentenceCount = Math.max(1, sentences.length);
  const totalSyllables = words.reduce((acc, w) => acc + syllables(w), 0);
  const wordsPerSentence = wordCount / sentenceCount;
  const syllablesPerWord = totalSyllables / Math.max(1, wordCount);

  // Flesch Reading Ease & Flesch–Kincaid Grade Level
  const ease = 206.835 - 1.015 * wordsPerSentence - 84.6 * syllablesPerWord;
  const grade = 0.39 * wordsPerSentence + 11.8 * syllablesPerWord - 15.59;

  const unique = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")));

  return {
    words: wordCount,
    sentences: sentenceCount,
    characters,
    avg_word_length: +(characters / Math.max(1, wordCount)).toFixed(2),
    vocabulary_diversity: +(unique.size / Math.max(1, wordCount)).toFixed(3),
    flesch_reading_ease: +ease.toFixed(1),
    flesch_kincaid_grade: +grade.toFixed(1),
    // ~225 wpm average reading speed.
    reading_time_minutes: +(wordCount / 225).toFixed(1),
  };
}
