# Doküman yeniden düzenleme özeti

- **Tarih:** 2026-10-15 (TSİ)
- **Yapan:** Grok Bot (Ege'nin onayıyla)
- **Kapsam:** Yalnız dokümanlar. Kod, `poyraz/` submodule'ü, `PMAP.md`, `design-rules.md`, `.clinerules/`, `.cursor/` değiştirilmedi. **Commit ve push yapılmadı** (değişiklikler `git add` ile aşamalandı, Ege atar). Hiçbir dosya silinmedi; eskiler `docs/archive/` altında.
- **Başlangıç durumu:** `main`, HEAD `66637a1`, çalışma ağacında yalnız `docs/docs-inventory.md` (yeni dosya). Submodule gitlink `169cc90`.
- **Temel alınan rapor:** [docs-inventory.md](docs-inventory.md)

## 1. Taşımalar (`git mv`)

| Kaynak | Hedef |
|---|---|
| `docs/arch-cwap.md` | `docs/architecture/cwap.md` (taslak/ertelendi bandı, yollar düzeltildi) |
| `docs/backend/README.md` | `docs/architecture/host-overview.md` (kısmen eski/ertelendi bandı) |
| `docs/circuit-breaker-report.md` | `docs/decisions/0001-error-circuit-breaker-off.md` (başına karar özeti) |
| `docs/srp.md` | `docs/rules/file-ownership.md` (yollar düzeltildi) |
| `docs/feedbacks/2026-10-09.md` | `docs/reports/audits/2026-10-09-agent-behavior-audit.md` |
| `docs/architecture-report.md` | `docs/archive/architecture-report-2026-06.md` |
| `ROADMAP.md` | `docs/archive/roadmap-features-2026-10.md` |
| `IDEAS.md` | `docs/archive/IDEAS-2026-10.md` |
| `docs/roadmap.md` | `docs/archive/roadmap-codebase-cleanup-2026-10.md` (bağlantılar ve yollar düzeltildi) |
| `implementation_plan.md` | `docs/archive/implementation_plan-web-refactor-and-mobile.md` |
| `docs/docs-inventory.md` (izlenmiyordu) | `docs/reports/docs-inventory.md` |

Boşalan `docs/backend/` ve `docs/feedbacks/` klasörleri kaldırıldı. Taşınmayanlar: `PMAP.md`, `design-rules.md`, `.clinerules/*`, `.cursor/rules/*`, `poyraz/**`.

**İşaretçi dosyalar:** `PMAP.md` eski yollara atıf yaptığı ve PMAP değiştirilemediği için `docs/srp.md` ve `docs/circuit-breaker-report.md` yollarında kısa "Taşındı" işaretçileri bırakıldı. Bu yüzden git bu ikisini rename yerine "değişti + yeni dosya" gösterebilir. PMAP güncellenince işaretçiler silinebilir.

## 2. Yeni dosyalar

`docs/README.md` (dizin, kategoriler, backlog şeması, durum akışı, öncelik), `docs/architecture/README.md` (iskelet), `docs/rules/README.md`, `docs/decisions/README.md`, `docs/decisions/0002-tailwind-v4.md`, `0003-additive-phases.md`, `0004-plan-single-file.md`, `docs/backlog/README.md` ve aşağıdaki backlog dosyaları. Karar kayıtları 0002 ve 0003 "Önerilen" durumunda; Ege onayı bekler.

## 3. Backlog (32 dosya, `docs/backlog/NNN-slug.md`)

| ID | Başlık | Durum | Öncelik |
|---|---|---|---|
| 001 | Self-improving agent (toggle) | idea | P1 |
| 002 | Sanal terminal (kalıcı oturum, 6 tool) | idea | P1 |
| 003 | grep tool'u (host) | done | P2 |
| 004 | find_files tool'u | silindi, 033'e birleştirildi | - |
| 005 | Arama araçlarında sert hariç tutma kuralları | silindi, 033'e birleştirildi | - |
| 006 | Proje talimat dosyası (AGENTS.md) okuma | idea | P2 |
| 007 | Hafızaya project alanı (proje bazlı hafıza) | idea | P3 |
| 008 | plan_list ve plan_export araçları | idea | P3 |
| 009 | run_command / terminal için yıkıcı komut onayı | idea | P2 |
| 010 | Expert sistemi (ExpertProfile, Experts sekmesi, expert seçici) | idea | P3 |
| 011 | general ajanından coding'e yönlendirme talimatı | idea | P3 |
| 012 | Plan onayı (plan_write sonrası ask_question) | idea | P3 |
| 013 | Ölü kanca yolunu sil | ready | P2 |
| 014 | policyPermitsBuiltin kalksın, plan servisi isToolAllowedInPolicy kullansın | ready | P2 |
| 015 | Derlemeyi tek fonksiyona indir | idea | P3 |
| 016 | Canlı explain bağlamı gerçek değerler taşısın | idea | P3 |
| 017 | Küçük artıkları sil | ready | P3 |
| 018 | Büyük dosyaları sorumluluğa göre böl | idea | P3 |
| 019 | responsive.css'i utility varyantlarına taşı | idea | P3 |
| 020 | Dokümanlardaki eski yol referanslarını düzelt | review | P1 |
| 021 | Agent davranış denetimi bulgularının takibi | idea | P1 |
| 022 | Mimari raporunun açık bulguları (ertelendi) | idea | P3 |
| 023 | Mesaj kuyruğunu kalıcı ve sıralanabilir yap | idea | P3 |
| 024 | Terminal kartında stdin / etkileşimli komut | idea | P3 |
| 025 | Subagent üretim desteği | idea | P3 |
| 026 | Ertelenen fikirler (git_diff, LSP/semantik arama, node-pty, expert başına model) | idea | P3 |
| 027 | Test yazma kuralı çelişkisi | idea | P1 |
| 028 | Doküman yapısı için açık sorular | idea | P2 |
| 029 | PMAP.md ile kod/doküman arasındaki çelişkiler | ready | P1 |
| 030 | Plan/todo MCP (plan_write, plan_read, todo_update, todo_add) | done | P2 |
| 031 | Web dosya hiyerarşisi (ui/, lib/, styles/, settings/mcp/) | done | P2 |
| 032 | Mobil uyum (responsive) | done | P2 |

Belirsiz olanlar (expert sistemi 010, sanal terminal 002, find_files 004, genel→coding yönlendirme 011, plan onayı 012) `idea` ve gövdede "karar bekliyor" notuyla yazıldı. Self-improving agent (001) `idea`.

## 4. Düzeltilen referanslar

- `cwap.md`: `workspaces/{policies,agents,workspaces}.ts` → `catalog/*.ts`; var olmayan `core/policy-resolve.ts` → `core/definitions/`; `builtin/file-access.ts`, `builtin/terminal-run.ts` → `host/src/tools/`.
- `file-ownership.md`: aynı katalog yolları, `docs/arch-cwap.md` bağlantısı yeni yola, "`host/src/tools` yok" satırı kaldırıldı (dizin var; PMAP ile uyumlu).
- `roadmap-codebase-cleanup`: `../` bağlantıları `../../` yapıldı, `backend/README.md`, `srp.md`, `arch-cwap.md` bağlantıları yeni yerlere, `workspaces/agents.ts` → `catalog/agents.ts`, `builtin/file-access.ts` → `host/src/tools/file-access.ts`, `host/src/agent/prompts/system-prompt.ts` → `host/src/agent/catalog/prompts/system-prompt.ts`.
- `0001` kararında `host/src/infra/system-prompt.ts` için güncel yol notu (satır numaraları doğrulanmadı).
- Tarama (`git grep`, `docs/**/*.md` bağlantı denetimi): kırık göreli bağlantı yok; kodda, `.clinerules`, `.cursor`, `poyraz.code-workspace`, `package.json` içinde taşınan dosyalara atıf yok. Atıf yapan tek dosya `PMAP.md` (aşağıda).

## 5. PMAP.md (DEĞİŞTİRİLMEDİ) ile çelişkiler

PMAP agent mimari indeksi olduğu için dokunulmadı; çelişkiler backlog backlog 029 olarak kayıtlı:

1. Satır 31 pinned commit `0ddf1a7…`; `git submodule status` gerçek değer `169cc907c25e2f30c2a48e42dd27fd839d144e88` (doğrulandı).
2. Satır 111 "session stores `mode`"; `shared/types.ts` yalnız `policyId` içerir (doğrulandı). Yeni belgelerde `policyId` yazıldı.
3. Satır 84 mood renkleri `styles.css`; gerçek dosya `web/src/styles/mood.css` (doğrulandı).
4. Satır 8 `docs/srp.md`, satır 33 ve 35 `docs/circuit-breaker-report.md` eski yollar (işaretçilerle çalışır durumda).

## 6. Envanter raporundaki düzeltmeler

Yeniden kontrolde envanterin iki iddiası yanlış çıktı (rapora not düşüldü, backlog'a yansıdı): host'ta `grep` aracı **var** (`host/src/agent/tools/builtin/grep.ts`, commit `fbd30bf`; `find_files` yok); `AppState.tsx` şu an 1162 satır.

## 7. Doğrulanamayıp bırakılanlar

- `design-rules.md` satır ~27 "renkler `styles.css` içinde" (dosya yok): kökte kalan dosyaya dokunulmadı (backlog 028).
- `host-overview.md` içindeki bayat ağaç/uç noktalar: yalnız bantla işaretlendi, yeniden yazılmadı.
- `cwap.md` içindeki `from 'poyraz'` yalnız adaptörde kuralı ve diğer kod iddiaları.
- `0001` içindeki satır numaraları; `0002` Tailwind geçişinin gerekçesi/commit'i.
- Backlog 005, 007, 009, 011, 016, 021: kodda ayrıntılı doğrulama yapılmadı, gövdede **doğrulanmalı** yazar.
- `poyraz/` içi belgeler (13 dosya), `poyraz.code-workspace` yolları, `.clinerules` test kuralı çelişkisi (backlog 027): dokunulmadı.

## 8. Açık sorular

Backlog backlog 028 ve backlog 027.

## 9. Test

Kod dosyası değişmedi, `npm test` çalıştırılmadı.
