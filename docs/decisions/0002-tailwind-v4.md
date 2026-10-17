# ADR 0002 — Web stili Tailwind CSS v4

- **Durum:** Kabul edildi (Ege, 2026-10-15).
- **Tarih:** 2026-10-15 (kayıt tarihi)
- **Önceki karar (geçersizleşti):** `implementation_plan.md` (mobil uyum planı, 2026-10-04) Tailwind'i değerlendirip **reddetti**: 391 `className`, 506 CSS kuralı, `@property` ile kayıtlı `--accent` geçişi, 65 token değişkeni ve kural sayfasının (şimdi `docs/rules/frontend.md`) o günkü Tailwind yasağı nedeniyle maliyet faydadan büyük bulunmuştu.
- **Güncel durum:** `web/package.json` `tailwindcss` ve `@tailwindcss/vite` `^4.3.3` kullanır. PMAP: "styled with Tailwind CSS v4"; stil yalnız `web/src/styles/` altında, tasarım jetonları `theme.css` içinde `@theme` ile. `docs/rules/frontend.md` Tailwind v4 kullanımını kural yapmıştır.
- **Sonuç:** Tailwind v4 geçerli yaklaşımdır; eski "reddedildi" notu tarihseldir (arşivde). Kalan borç: `responsive.css` utility varyantlarına taşınmalı.
- **Gerekçe:** CSS dosyalarını şişirmemek. Utility sınıfları ayrı kural yazma ihtiyacını azaltır.
