# Xeck dokümanları

Dil: kullanıcı belgeleri Türkçe; `PMAP.md` (ajan belleği) ve submodule belgeleri İngilizce kalır.
Son düzenleme: 2026-10-15.

## Dizin

| Konum | Ne var |
|---|---|
| [`../PMAP.md`](../PMAP.md) | Ajanın kalıcı proje belleği ve mimari indeks. **Kökte kalır, her zaman en doğru kaynak sayılır.** Yalnız sahibi günceller. |
| [`rules/frontend.md`](rules/frontend.md) | Arayüz tasarım kuralları. Tek kural sayfası (`.clinerules`, `.cursor/rules` ve PMAP bu yola bağlı). |
| [`architecture/`](architecture/README.md) | Yüzeysel mimari iskelet (ERTELENDİ) ve taslak mimari belgeler. |
| [`decisions/`](decisions/README.md) | Kısa karar kayıtları (ADR). |
| [`rules/`](rules/README.md) | Kurallar ve kural işaretçileri. |
| [`reports/`](reports/) | Denetim ve analiz raporları (`audits/`, envanter, reorg özeti). |
| [`archive/`](archive/) | Eski roadmap, ideas ve planlar. Silinmez. |
| `../poyraz/` | Git submodule ve kendi belgeleri. Bu yapıya **dahil değildir**, değiştirilmez. |

## Kategoriler

- **architecture**: sistemin şu an nasıl çalıştığı. Mimari oturmadığı için ayrıntılı yazılmaz.
- **decisions**: "neden böyle yaptık". Her kayıt durum taşır: `Önerilen`, `Kabul edildi`, `Geçersizleşti`.
- **rules**: uyulacak kurallar.
- **reports**: bir tarihteki fotoğraf. Düzenlenmez, yenisi yazılır.
- **archive**: tarihsel kaynak. Geçerli maddeler backlog'a çıkarıldıktan sonra buraya alınır.

Yapılacak işler (backlog) bu klasörde değil, projenin kökündeki `work/backlog/` klasöründedir.
