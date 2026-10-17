# ADR 0003 — Ekleyici ve tek başına yayınlanabilir aşamalar

- **Durum:** Önerilen. Eski `ROADMAP.md` "İlkeler" bölümünden çıkarıldı; hâlâ geçerli olup olmadığı Ege'ye sorulacak.
- **Tarih:** 2026-10-15 (kayıt tarihi; ilkeler 2026-10-05 ROADMAP'inden)
- **İlkeler:**
  - Ekleyici ilerle: her aşama yeni şey ekler, mevcut araçlar kaldırılmaz.
  - Her aşama tek başına yayınlanabilir; bitince uygulama eskisi gibi açılır, yeni özellik opsiyoneldir.
  - Yeni araçlar yerleşik `poyraz` MCP sunucusuna eklenir; köprü adı kuralı `mcp_poyraz__<tool>` değişmez.
  - Güvenlik varsayılanı kapalıdır: `fullFileAccess` kapalıyken mevcut kısıtlar geçerli kalır.
  - Araç `description` metinleri İngilizce yazılır.
