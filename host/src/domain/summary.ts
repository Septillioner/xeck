/**
 * The host keeps its own summary wording. poyraz 1.0 defaults to a neutral English
 * prefix and prompt, but history stored by earlier versions starts with the Turkish
 * prefix, so the host passes both to `Summarization` explicitly. Without the prefix
 * those stored summaries would be read as plain conversation and summarized again.
 */
export const HOST_SUMMARY_PREFIX = 'Önceki konuşmaların özeti:';

/** Same text the library used before 1.0; `{{conversation}}` takes the compacted history. */
export const HOST_SUMMARY_PROMPT =
  'Aşağıdaki konuşma geçmişini özetle. Şu formatta yaz:\n\n' +
  'TAMAMLANAN GÖREVLER: (ne yapıldı, sonucu ne oldu)\n' +
  'ÖNEMLİ KARARLAR: (kullanıcının verdiği kararlar, tercihler)\n' +
  'DEVAM EDEN İŞLER: (yarım kalan veya takip gereken şeyler)\n\n' +
  'Gereksiz detay, hata mesajı tekrarı ve sohbet selamlaşması ekleme.\n\n' +
  'Konuşma:\n{{conversation}}';
