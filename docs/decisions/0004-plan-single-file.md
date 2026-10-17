# ADR 0004 — Plan tek `.plan.md` dosyasıdır

- **Durum:** Kabul edildi (uygulanmış, commit `38f0156`).
- **Tarih:** 2026-10-15 (kayıt tarihi)
- **Karar:** Plan, `sessions/<id>/plans/<slug>.plan.md` tek dosyasıdır. Front matter (`name`, `revision`, `todos`) tek doğruluk kaynağıdır; ayrı `.json` yoktur. Todo bloğu üretilen `<!-- todos:start -->` işaretleri arasındadır.
- **Durumlar:** `pending`, `in_progress`, `completed`, `blocked`, `cancelled`. Kurallar araç seviyesindedir: aynı anda tek `in_progress`, `completed` için kanıt notu, `blocked` için gerekçe, tamamlanmış todo silinemez, en çok 30 todo, başlık en çok 120 karakter.
- **Araçlar:** `plan_write`, `plan_read`, `todo_update`, `todo_add`. `plan_list` ve `plan_export` yok.
- **Eski tasarımdan farklar:** `plans/<id>.md` + `.json` çifti ve plan sonrası `ask_question` onayı yapılmadı; onay yerine plan modu/agent modu (policy) ayrımı var.
- **Kaynak:** ROADMAP (arşiv) "Plan ve todo MCP" notu ve PMAP.md. PMAP: oturum planı `sessions/<id>/plans/<slug>.plan.md`.
