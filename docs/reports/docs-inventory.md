> **Not (2026-10-15, reorg sonrası):** Bu rapor taşımalardan önceki durumu anlatır; yollar eski düzene aittir. Düzeltmeler: host'ta `grep` aracı vardır (`host/src/agent/tools/builtin/grep.ts`), `find_files` yoktur; `AppState.tsx` 1162 satırdır. Yapılan işler için [reorg-summary.md](reorg-summary.md).

# poyraz-web — Doküman Envanteri ve Sınıflandırma Raporu

- **Tarih:** 2026-10-15 (TSİ)
- **Kaynak:** `C:\Users\Ege\Desktop\Ege\Sources\poyraz-web` (IT01PC, `main`, HEAD `66637a1`, çalışma ağacı temiz)
- **Yöntem:** Sadece okuma. Hiçbir dosya taşınmadı, silinmedi, değiştirilmedi. Commit/push yapılmadı.
- **Tarih sütunu:** `git log -1 --date=short -- <dosya>` değeridir (commit tarihi). Dosya sistemi tarihi bazı dosyalarda 1-2 gün farklıdır.
- **Doğrulama:** "kodla doğrulandı" notları, dosya/arama kontrolleri (`Test-Path`, `Select-String`) ve git geçmişiyle yapıldı. Kod çalıştırılmadı, testler koşturulmadı.

---

## 0. Özet

**Toplam 28 doküman** (node_modules, build, release-build, dist hariç).

| Birincil kategori | Adet | Dosyalar |
|---|---|---|
| Kök / AI belleği (taşınmaz) | 1 | PMAP.md |
| architecture (ERTELENDİ / yüzeysel iskelet) | 2 | docs/arch-cwap.md, docs/backend/README.md |
| decisions | 1 | docs/circuit-breaker-report.md |
| backlog (maddeler çıkarılacak, sonra arşiv) | 3 | ROADMAP.md, IDEAS.md, docs/roadmap.md |
| rules | 3 | design-rules.md, docs/srp.md, .clinerules/general.md |
| archive | 2 | implementation_plan.md, docs/architecture-report.md |
| reports (yeni kategori) | 1 | docs/feedbacks/2026-10-09.md |
| araç yapılandırması (yerinde kalır) | 2 | .clinerules/design-rules.mdc, .cursor/rules/design-rules.mdc |
| reference (submodule, taşınmaz) | 13 | poyraz/README.md + poyraz/docs/*.md (12) |
| **Toplam** | **28** | |

Güncellik dağılımı (28 dosya): güncel 5 (#3, #6, #7, #8, #11), kısmen eski 8 (#1, #5, #9, #12, #14, #16, #22, #24), eski 4 (#2, #4, #10, #13), belirsiz 11 (#15 ve poyraz/docs'tan 10 dosya). Numaralar §1 tablolarındaki sıra numaralarıdır.

**Önemli not (en kritik bulgu):** `docs/srp.md`, `docs/arch-cwap.md` ve `docs/roadmap.md` içindeki dosya yolları commit `25d8340` (2026-10-12) öncesi düzene ait. O commit `host/src/agent/workspaces/{agents,policies,workspaces}.ts` dosyalarını `host/src/agent/catalog/` altına taşıdı. PMAP.md güncellendi, bu üç doküman güncellenmedi.

---

## 1. Doküman envanteri (satır satır)

Güncellik: **güncel / kısmen eski / eski / belirsiz**.

### 1.1 Kök dizin

| # | Yol | Boyut | Son değişiklik | Özet | Güncellik | Önerilen kategori → hedef |
|---|---|---|---|---|---|---|
| 1 | `PMAP.md` | 54.458 B (120 satır, çok uzun satırlar) | 2026-10-12 (git) / 10-14 (dosya) | Ajanın kalıcı proje belleği: yerleşim, host/web/electron/plan/policy/başlık yazımı ayrıntıları. İngilizce, makine okunur. | **Kısmen eski.** Çoğu bölüm güncel. Yanlışlar: (a) satır 31 pinned submodule commit `0ddf1a7`, gerçek gitlink `169cc90`; (b) satır 111 "oturum `mode` saklar", kanonik alan `policyId` (docs/roadmap.md de bunu söylüyor); (c) satır 84 mood renkleri "`styles.css` içinde", dosya artık `styles/mood.css`; (d) satır 46/59 `host/src/tools/` anlatıyor ama `docs/srp.md` "yok" diyor (PMAP doğru). | **Kökte kalır** (general.md kuralı PMAP.md'yi kökte zorunlu kılıyor). Kategori yok. Sadece 4 düzeltme önerilir. |
| 2 | `ROADMAP.md` | 10.919 B | 2026-10-05 | 3 aşamalı yol haritası: sanal terminal, grep/find_files, expert sistemi (+ plan/todo MCP durum notu). Türkçe. | **Eski / kısmen eski.** Aşama 1-2 hiç yapılmadı (kodda `terminal_open`, `grep`, `find_files` yok). Aşama 3 expert sistemi yerine CWAP (workspace/agent/policy) geldi, `ExpertProfile` kodda yok. Plan/todo bölümü commit `38f0156` ile uygulandı, kendi içinde "farklı uygulandı" notu var. | **backlog** → maddeler `docs/backlog/` altına, dosya `docs/archive/ROADMAP.md` |
| 3 | `IDEAS.md` | 153 B | 2026-10-03 | Tek fikir: "Self improving agent (Toggle)": görev bitince rapor, kuralları iyileştirsin. İngilizce. | **Güncel (fikir hâlâ açık).** Kodda `self.improv` yok. Ama PMAP satır 104/108: `add_rule` ve hafıza sınıflandırma kuralları var, yani yapı taşları kısmen mevcut. | **backlog** → `docs/backlog/self-improving-agent.md`, dosya arşive |
| 4 | `implementation_plan.md` | 13.948 B | 2026-10-04 | İki ayrı plan birleşik: (1) web/ dosya hiyerarşisi düzenleme, (2) mobil uyum (responsive). | **Eski (uygulanmış).** Plan 1: `ui/`, `lib/`, `styles/`, `settings/mcp/` var, `constants.ts` silinmiş; ancak önerilen `use-send.ts` yok, gerçekte `stream-events/stream-blocks/session-summary` ayrımı yapılmış. Plan 2: `responsive.css` ve commit `038d0f2` var. İçindeki "Tailwind reddedildi" kararı ile bugünkü durum çelişiyor (web artık Tailwind v4). | **archive** → `docs/archive/implementation_plan-web-refactor-and-mobile.md`. İstenirse iki plana bölünür. |
| 5 | `design-rules.md` | 16.605 B | 2026-10-10 | Arayüz "anayasası": Tailwind v4 kullanımı, cascade borcu yasağı, renk sistemi, bileşen standartları, ayarlar hiyerarşisi. Türkçe. | **Kısmen eski.** Satır 27: renkler "`styles.css` kurallarındadır", dosya yok (`styles/` altında). `responsive.css` "geçiş tamamlanınca silinir" der, dosya hâlâ duruyor (açık borç). Metin çok uzun, bazı bölümler davranış spesifikasyonu (kural değil). | **rules** → `docs/rules/design-rules.md`. DİKKAT: `.mdc` işaretçileri, `general.md`, `PMAP.md` ve `implementation_plan.md` kök yolu `design-rules.md`'ye atıf yapıyor. Taşınırsa hepsi güncellenmeli (bkz. §4 soru 3). |

### 1.2 Araç yapılandırma dosyaları

| # | Yol | Boyut | Son değişiklik | Özet | Güncellik | Kategori → hedef |
|---|---|---|---|---|---|---|
| 6 | `.clinerules/general.md` | 3.897 B | 2026-10-07 | "MASTER RULESET": önce sor, dalkavukluk yok, basit çöz, **test yazma**, kod kalitesi, PMAP.md kuralı, **commit'i kullanıcıya attır**. İngilizce. | **Güncel**, ama kodla/diğer dokümanlarla çelişen noktalar var: "NO TESTS — EVER" oysa repo'da çok sayıda test var ve PMAP `npm test`'i kapı sayar; "Documentation: PMAP.md" önceliği. | **rules** (içerik olarak). Araç `.clinerules/` dizininden okuduğu için **yerinde kalır**. İstenirse `docs/rules/` altına kopya/işaretçi. |
| 7 | `.clinerules/design-rules.mdc` | 233 B | 2026-10-07 | İşaretçi: "UI işinden önce kökteki design-rules.md'yi oku". | **Güncel** (kök yol değişmezse). | **Araç yapılandırması, yerinde kalır.** Taşıma kararına göre tek satır yol güncellemesi. |
| 8 | `.cursor/rules/design-rules.mdc` | 233 B | 2026-09-30 | Bire bir aynı işaretçi (Cursor). | **Güncel.** #7 ile **birebir kopya**. | **Araç yapılandırması, yerinde kalır.** |

### 1.3 docs/

| # | Yol | Boyut | Son değişiklik | Özet | Güncellik | Kategori → hedef |
|---|---|---|---|---|---|---|
| 9 | `docs/arch-cwap.md` | 4.768 B | 2026-10-12 | CWAP mimarisi: Chat→Workspace→Agent→Policy, dosya listesi, explain sırası, cache, kimlik, vitrin, "yapılmayacaklar". | **Kısmen eski.** Mantık ve kavramlar güncel (PMAP ile uyumlu: coding/general/poyraz-agent). **Dosya yolları eski:** `workspaces/{policies,agents,workspaces}.ts` ve `core/policy-resolve.ts` diskte yok (artık `catalog/*.ts`). | **architecture (ERTELENDİ/iskelet)** → `docs/architecture/cwap.md`, olduğu gibi + "taslak, mimari oturmadı" bandı. Yeniden yazılmaz. |
| 10 | `docs/architecture-report.md` | 15.170 B | 2026-10-12 (git); içeride **Tarih: 2026-06-03** | Dosya yapısı ve mimari analiz raporu: iki `shared/`, God barrel `poyraz/index.ts`, AppState 44 KB, route→store bağı, vitest kırık referans, 12 maddelik yeniden yapılandırma önceliği. | **Eski / belirsiz.** İçerideki tarih Haziran; git tarihi 12 Ekim (içerik 06-03 anının fotoğrafı gibi). AppState artık 1082 satır (rapor ~1200, hâlâ büyük). `stores/` ve `plans/` rapor yazıldığında PMAP'te yoktu, şimdi var. Bazı bulgular geçerli olabilir (God barrel, `file:../poyraz`, vitest config), doğrulanmadı. | **archive** → `docs/archive/architecture-report-2026-06.md`. Açık bulgular (12 madde) backlog'a aday, ama mimari oturmadığı için **çıkarma ertelenebilir**. |
| 11 | `docs/circuit-breaker-report.md` | 12.348 B | 2026-10-09 | Hata devre kesicisinin neden kapatıldığı (400 "No tool output…" zinciri), `sanitizeToolPairing`, kalan korumalar, yeniden açma koşulları, 10.07 host-owned `errorBreaker` güncellemesi. | **Güncel.** PMAP satır 33-35 ile tutarlı. Not: rapor `host/src/infra/system-prompt.ts` der, güncel yol `host/src/agent/catalog/prompts/system-prompt.ts`. | **decisions** → `docs/decisions/0001-error-circuit-breaker-off.md` (özet + tam rapor ek olarak). |
| 12 | `docs/roadmap.md` | 6.604 B | 2026-10-08 | "Kod temeli yol haritası": mevcut durum (ölü kanca yolu, izin, küçük artık, bayat belge) + 7 başlıklı temizlik/bölme listesi. Türkçe. | **Güncel (hiçbir madde yapılmamış), yollar kısmen eski.** Doğrulama: `loop-hooks.ts` duruyor, `ensureLoopHook`/`choosablePolicies`/`policyPermitsBuiltin`/`failedLabel`/`TODOS_START` hâlâ kodda. Yol hatası: `workspaces/agents.ts`, `builtin/file-access.ts` (gerçek yer `host/src/tools/file-access.ts`). | **backlog** → her `- [ ]` maddesi ayrı dosya (bkz. §2). "Mevcut durum" kısmı `docs/architecture/` altına borç notu olabilir. Dosya sonra arşive. |
| 13 | `docs/srp.md` | 2.310 B | 2026-10-08 | Dosya sahipliği kilidi: dört katalog, bağ/kimlik, araç yüzeyi, oturum/HTTP, "poyraz/ salt okunur". | **Eski.** (a) Yollar `workspaces/*.ts` (şimdi `catalog/`). (b) "`host/src/tools` yok" diyor, ama `host/src/tools/file-access.ts` ve `terminal-run.ts` var. (c) Son satır "poyraz/ salt okunur" ile docs/roadmap.md çelişiyor (roadmap: submodule salt okunur değil). | **rules** → `docs/rules/file-ownership.md` (içerik düzeltilerek). Yedek öneri: `docs/architecture/` altında. |
| 14 | `docs/backend/README.md` | 16.094 B | 2026-10-05 | Host servisi mimari/teknik özeti (İngilizce): API tablosu, chat turu/SSE akışı, kalıcılık, güvenlik notları, test. | **Kısmen eski.** `src/runtime/…` ağacı diskte yok (artık `agent/runtime/`); `PUT /api/sessions/:id/mode` yok, yerine `PUT …/policy`; kod haritasında `catalog/`, `workspaces/` yok. docs/roadmap.md bunu zaten "bayat" diyor. API/kalıcılık/güvenlik kısımları çoğunlukla geçerli. | **architecture (ERTELENDİ/iskelet)** → `docs/architecture/host-overview.md` + "kısmen eski" bandı. Roadmap önerisi (kısa işaretçiye indirme) kullanıcı tercihiyle uyumlu mu sorulmalı. |
| 15 | `docs/feedbacks/2026-10-09.md` | 4.435 B | 2026-10-09 | Ajan davranış denetimi: 8 oturum incelendi, 1 yüksek + 2 orta + 2 düşük bulgu. Türkçe. | **Belirsiz.** Bulgular tarihli; sonradan düzeltilip düzeltilmediği doğrulanamadı (bkz. §2.6). | **reports (yeni kategori)** → `docs/reports/audits/2026-10-09-agent-behavior-audit.md`. Bulgular backlog'a. |

### 1.4 poyraz/ submodule (github.com/Septillioner/poyraz, HEAD `169cc90`, paket v0.3.0)

Submodule kendi reposu. Ana repodan taşınırsa submodule kirlenir ve pointer bozulur. **Hepsi yerinde kalır**, ana repo yalnızca `docs/reference/` altında bir **işaretçi** (README) tutabilir.

| # | Yol | Boyut | Son değişiklik (submodule git) | Özet | Güncellik |
|---|---|---|---|---|---|
| 16 | `poyraz/README.md` | 1.797 B | 2026-10-05 | Kütüphane tanıtımı, hızlı başlangıç (`WithPresets`), sağlayıcılar. | Kısmen eski: sağlayıcı listesi llama.cpp'yi anmıyor (host'ta var); `poyraz-cli` atfı. |
| 17 | `poyraz/docs/agent-api.md` | 6.728 B | 2026-10-04 | `Agent`/`AgentBuilder` API referansı. | Belirsiz (API ile karşılaştırılmadı). |
| 18 | `poyraz/docs/auth-and-providers.md` | 2.654 B | 2026-09-29 | Anahtar geçirme, sağlayıcı profilleri. | Belirsiz, muhtemelen güncel. |
| 19 | `poyraz/docs/custom-tools.md` | 2.029 B | 2026-10-04 | `defineTool` ile özel araç. | Belirsiz, muhtemelen güncel. |
| 20 | `poyraz/docs/evals.md` | 1.525 B | 2026-09-29 | Eval harness (pakete dahil değil). | Belirsiz. Mimari raporu `evals/scenarios/helpers.ts` içinde 5 tip hatasından söz ediyor. |
| 21 | `poyraz/docs/getting-started.md` | 1.116 B | 2026-10-04 | Minimal ajan örneği. | Belirsiz, muhtemelen güncel. |
| 22 | `poyraz/docs/how-it-works.md` | 1.216 B | 2026-10-04 | Katmanlar tablosu (domain/application/infra/tools/presentation). | Kısmen eski olabilir: presentation katmanı core'da olması mimari raporda sorun olarak işaretli. |
| 23 | `poyraz/docs/mcp.md` | 1.402 B | 2026-09-30 | MCP bağlantı tipleri. | Belirsiz. Dosya sistemi tarihi 10-14 (git'te 09-30), yerel değişiklik olabilir ama `git status` temiz. |
| 24 | `poyraz/docs/modes.md` | 2.162 B | 2026-10-04 | `AgentPolicy` açıklaması (mod yok). | Kısmen eski olabilir: `errorBreaker` alanı (10.07) belgede yoksa eksik; örnekteki araç adları (`list_dir`, `glob_file_search`) host'taki adlardan farklı. Doğrulanmadı. |
| 25 | `poyraz/docs/streaming.md` | 3.254 B | 2026-10-03 | `ChatHandlers`, olay türleri. | Belirsiz. |
| 26 | `poyraz/docs/templates.md` | 705 B | 2026-09-29 | `AgentTemplate` JSON. | Belirsiz. |
| 27 | `poyraz/docs/tools.md` | 2.910 B | 2026-10-04 | Yerleşik araç presetleri (`filesystem`, `shell`, `search`). | Belirsiz. Preset araç adları host'taki builtin MCP adlarından farklı olabilir. |
| 28 | `poyraz/docs/workspace.md` | 641 B | 2026-09-29 | Workspace trust/log dizini host işi. | Belirsiz. |

---

## 2. Önemli ve hâlâ geçerli maddelerin çıkarılmış listesi

Durum sütunu: **AÇIK** (kodda yok / kanıtlı), **KISMEN**, **YAPILDI**, **DOĞRULANAMADI**. Yöntem: dosya varlığı ve `Select-String` taraması (host, web, shared, electron; node_modules/dist hariç) + git log.

Önerilen backlog başlık bloğu (her madde ayrı dosya, `docs/backlog/<slug>.md`):
```
durum: idea | ready | in-progress | review | done
öncelik: P0..P3
alan: host | web | poyraz-lib | docs | process
bitti-kriteri: <tek cümle, doğrulanabilir>
kaynak: <eski dosya>
```

### 2.1 ROADMAP.md

| Madde | Kaynak | Açıklama | Durum / doğrulama |
|---|---|---|---|
| Sanal terminal (kalıcı oturum, 6 tool) | ROADMAP Aşama 1 | `terminal_open/send/read/read_last/list/close`, ring buffer, süreç ağacı temizliği, xterm.js paneli. Karar bekliyor: pipe mi PTY mi, varsayılan shell. | **AÇIK.** `terminal_*`, `xterm`, `node-pty` 0 sonuç. Yalnız `run_command` var (PMAP: "output-only, stdin yok"). |
| `grep` ve `find_files` tool'ları | ROADMAP Aşama 2 | Sert kurallar (.env, anahtar, symlink), sınırlar, deterministik sıra. | **AÇIK (host).** Host'ta yok, mevcut `search_files` var. Not: kütüphanede (`poyraz/`) `grep` aracı var ama host preset kullanmıyor (PMAP: "No DefaultSystemTools, no presets"). |
| Selectivity / expert altyapısı (`ExpertProfile`) | ROADMAP Aşama 3 | Tool allow list, `expertId`, debug'da expert görünümü, Experts sekmesi. | **KISMEN / yeniden tanımlı.** Fikir CWAP ile karşılandı (workspace + agent + policy; `coding`, `general`, `poyraz-agent`). `ExpertProfile` kodda yok. Experts sekmesi ve Debug'da aktif expert: doğrulanamadı. ROADMAP bu haliyle **yanıltıcı**. |
| `general` → `coding` yönlendirme talimatı | ROADMAP Aşama 3 | Uzun işlerde kullanıcıyı coding'e yönlendirme. | **DOĞRULANAMADI** (instruction metinleri okunmadı). |
| Proje talimat dosyası (`AGENTS.md`) okuma | ROADMAP Aşama 3 | Açılışta okunup sistem talimatına eklensin. | **AÇIK.** `AGENTS.md` 0 sonuç, kökte de yok. |
| Hafızaya `project` alanı | ROADMAP Aşama 3 | Coding yalnız aktif projenin hafızasını görsün. | **DOĞRULANAMADI.** Projeler var (`projects.json`), hafıza-proje bağı doğrulanmadı. |
| `run_command`/terminal için yıkıcı komut onayı | ROADMAP Aşama 3 | Yıkıcı kalıp için dialog onayı. | **KISMEN.** `delete_file` ve `enable_mcp` onaylı (arch-cwap); komut kalıbı onayı doğrulanmadı. |
| Plan onayı (`plan_write` sonrası `ask_question`) | ROADMAP (plan/todo) | 3 adımdan kısa işte plan açma. | **AÇIK.** Yerine plan/agent policy ayrımı + `Build` düğmesi var (PMAP). Belki "karar" olarak kapatılabilir. |
| `plan_list`, `plan_export` | ROADMAP (plan/todo) | Planları listele, `PLAN.md` olarak dışa aktar. | **AÇIK.** 0 sonuç. |
| "Sonraya bırakılanlar": subagent, kullanıcı tanımlı expert, `node-pty`, `git_diff`, LSP/semantik arama, expert başına model/effort | ROADMAP | Uzun vadeli fikirler. | **AÇIK.** Subagent: submodule'de `POYRAZ_SUBAGENT_BUILTIN_INSTRUCTIONS` var, host'ta üretim yok (arch-cwap: "grant/subagent ertelendi"). |
| Plan/todo MCP (4 tool, UI kartı, PlanPanel, mood) | ROADMAP | — | **YAPILDI** (commit `38f0156`; PMAP ile uyumlu). |

### 2.2 IDEAS.md

| Madde | Açıklama | Durum |
|---|---|---|
| Self-improving agent (toggle) | Görev bitince rapor → kuralları iyileştir. | **AÇIK.** Yapı taşları var: Poyraz `add_rule` (`source: poyraz`), hafıza, geri bildirim sınıflandırma talimatı (PMAP 104-108). Eksik: toggle ve görev sonu rapor/değerlendirme akışı. **Kullanıcının "sürdürülebilir döngü" hedefiyle doğrudan ilişkili.** |

### 2.3 implementation_plan.md

| Madde | Açıklama | Durum |
|---|---|---|
| Web dosya hiyerarşisi (ui/, lib/, styles/, mcp/) | Katman kuralı `shell|chat|settings → ui → state → api|lib → shared`. | **YAPILDI** (kanıt: `web/src/ui/icons.tsx`, `styles/`, `constants.ts` yok; ayrıntıda plandan farklı). Katman kuralı PMAP'te yaşıyor. |
| Mobil uyum | Breakpoint'ler, drawer, `responsive.css`. | **YAPILDI** (commit `038d0f2`). |
| Karar: Tailwind reddedildi | 391 className, `@property --accent` vb. gerekçeler. | **ÇELİŞKİLİ.** Bugün web Tailwind v4 kullanıyor (`web/package.json`) ve design-rules.md bunu kural yapmış. Bu karar kaydı açıkça "geçersizleşti" olarak işaretlenmeli. |
| `responsive.css` silinip utility varyantlarına geçiş | design-rules §1 sonucu. | **AÇIK** (dosya duruyor). Backlog adayı: P2, alan web. |

### 2.4 docs/roadmap.md (kod temeli) — hepsi AÇIK, grep ile doğrulandı

| Madde | Açıklama | Doğrulama |
|---|---|---|
| Ölü kanca yolunu sil | `loop-hooks.ts`, `loop-hook.test.ts`, `ensureLoopHook`, `continuationViaHook`, `loopHookContextFor`, `choosablePolicies`, `canBeStartedBy` | `loop-hooks.ts` ve `loop-hook.test.ts` mevcut; `ensureLoopHook` 6, `choosablePolicies` 5, `getLoopHook` 1 sonuç. **AÇIK.** |
| `policyPermitsBuiltin` kalksın, plan servisi `isToolAllowedInPolicy` kullansın | — | `resolve.ts:69`, `plan-service.ts:15,59`. **AÇIK.** |
| Derleme tek fonksiyon (`system-prompt.ts` yalnız talimat) | — | Yol değişmiş (`catalog/prompts/system-prompt.ts`). **AÇIK, yol güncellenmeli.** |
| Canlı `explain` bağlamı gerçek availability/toolset/`fullFileAccess` taşısın | — | `explain.ts` başlığı kontrol edilmedi. **DOĞRULANAMADI/AÇIK.** |
| Küçük artık sil (`failedLabel`, `TODOS_START/END` kopyası, okunmayan `mode` tipi) | — | `chat-turn.ts:172,177`, `plan-store.ts:25,401,410` sonuçları var. **AÇIK.** |
| Belge düzeltmeleri | `docs/backend/README.md` işaretçiye iner; PMAP `mode`→`policyId`; `srp.md` son satır | PMAP satır 111 hâlâ `mode`; srp.md son satır hâlâ "salt okunur". **AÇIK.** (Bu envanter görevinin parçasıyla örtüşüyor.) |
| Gövde ayrımı: `file-access.ts` (yol sınırı/diff/dizin yürüme), `changedFiles`, `chat-turn.ts`, `agent-pool.ts`, `plan-store.ts`, `sessions.ts`, `AppState.tsx` | — | `AppState.tsx` 1082 satır. Diğerleri doğrulanmadı. **AÇIK/DOĞRULANAMADI.** Not: bu madde `file-access.ts`'i `builtin/` altında varsayıyor, gerçek yer `host/src/tools/`. |

### 2.5 PMAP.md

Backlog maddesi içermiyor (olgusal bellek). Sadece "henüz yok" notları aday madde:
- Mesaj kuyruğu kalıcı değil, sıralanamıyor (PMAP satır 16).
- Terminal kartı yalnız çıktı, stdin yok (satır 67) — ROADMAP Aşama 1 ile bağlantılı.
- Hata devre kesici kapalı (`'off'`), yeniden açma koşulları circuit-breaker raporunda.
- Düzeltilmesi gereken 4 PMAP satırı (pinned commit, `mode`, `styles.css` mood, `host/src/tools` tutarlılığı): **docs işi**, backlog'a "docs" alanı ile.

### 2.6 docs/feedbacks/2026-10-09.md

| Bulgu | Önem | Durum |
|---|---|---|
| Tool loop sınırında kesilip "tamamlandı" demek; build hatası sonrası yeniden doğrulamama | Yüksek | **DOĞRULANAMADI.** Sonraki commit'ler (`58dd2fa`, `fbd30bf`, `66637a1`) talimatları değiştirmiş, etkisi ölçülmedi. Davranış sorunu, yeniden denetimle doğrulanmalı. |
| `Tool loop limit reached (60)` dahili mesajının kullanıcıya sızması | Orta | **AÇIK olabilir.** Metin hâlâ `poyraz/application/chat/decision-loop.ts:424`'te. Kullanıcıya yansıtılıp yansıtılmadığı doğrulanmadı. |
| Aşırı tekrarlı araç çağrısı (74 `search_code`, 48 terminal) | Orta | **DOĞRULANAMADI.** `search_code` aracı ana host listesinde yok (başka araç adı olabilir). |
| Chat satırı eylem menüsü: klavye odağı/ok tuşu | Orta | **KISMEN.** Ortak `Menu` bileşeninde ok tuşu desteği var (`web/src/ui/Menu.tsx:110,114`). Chat-row özel menüsü için doğrulanmadı. |
| Hafıza yeteneği hakkında tutarsız ajan açıklaması | Düşük | **DOĞRULANAMADI** (davranış). |
| `AppState.tsx` yinelenen `streaming` bildirimi (build hatası) | Yüksek | Büyük olasılıkla çözüldü (sonradan birçok commit), **doğrulanmadı** (build çalıştırılmadı). |

### 2.7 docs/architecture-report.md ve circuit-breaker-report.md (kısa)

- Mimari raporun 12 maddesi (God barrel, `shared/` adı, `file:../poyraz`, vitest kırık referans, route→service katmanı vb.): **mimari oturmadığı için kullanıcı kararını bekler**. Backlog'a şimdilik tek özet madde, ayrıntı arşivde ("mimari raporu açık bulgular, ertelendi").
- Circuit-breaker: açma koşulu kontrol listesi (soft yol, `CONSECUTIVE_SAME_ERROR_LIMIT` 3 vb.): **bilinçli kapalı**, madde değil karar kaydı. Gelecekte açılırsa backlog.

---

## 3. Tekrar eden / çelişen dokümanlar

| # | Konu | Dosyalar | Sorun | Öneri |
|---|---|---|---|---|
| 1 | Aynı içerik iki yerde | `.clinerules/design-rules.mdc` ↔ `.cursor/rules/design-rules.mdc` | Birebir aynı işaretçi (233 B). Farklı araçlar için gerekli. | Tekrar bilinçli. Taşıma yok. Ortak yol değişirse ikisi birlikte güncellenir. |
| 2 | Dosya sahipliği ve katalog yolları | `docs/srp.md`, `docs/arch-cwap.md`, `docs/roadmap.md` ↔ **gerçek kod + PMAP** | `workspaces/{agents,policies,workspaces}.ts` ve `policy-resolve.ts` diskte yok (`catalog/` altında). `host/src/tools` srp'de "yok", PMAP ve disk "var". | PMAP/disk esas alınmalı. Üç dosya taşınırken yol düzeltilmeli. |
| 3 | `poyraz/` salt okunur mu? | `docs/srp.md` + `docs/arch-cwap.md` ("salt-okunur, dokunulmaz") ↔ `docs/roadmap.md` ("salt okunur değildir") | Doğrudan çelişki. docs/roadmap.md kendisi çelişkiyi işaretliyor. | Kullanıcı karar vermeli (§4 soru 5). |
| 4 | Oturum alanı `mode` mı `policyId` mi? | `PMAP.md` satır 111, `docs/backend/README.md` (`PUT …/mode`, "mode") ↔ `docs/srp.md`, `docs/arch-cwap.md`, kod | Kanonik alan `policyId`. | PMAP satır 111 ve backend README düzeltilmeli. |
| 5 | Mimari özet 4 yerde | `PMAP.md` (Host/Layout), `docs/backend/README.md`, `docs/arch-cwap.md`, `docs/architecture-report.md` | Katmanlar ve dosya haritası dört yerde farklı ayrıntı/tarihte anlatılıyor. | Kaynak-of-truth: PMAP (kod ile eş güncelleniyor). Diğerleri iskelet/arşiv. |
| 6 | Tailwind kararı | `implementation_plan.md` ("reddedildi") ↔ `design-rules.md`, `PMAP.md`, `web/package.json` (Tailwind v4 kullanımda) | Eski karar geçersiz. | Plan arşivlenirken karar kaydı "geçersizleşti" notuyla (ADR). |
| 7 | Test yazma kuralı | `.clinerules/general.md` ("NO TESTS — EVER", "validation manual") ↔ repo (çok `*.test.ts`), PMAP ("`npm test` kapı"), `docs/roadmap.md` ("yeni test yazılmaz"), ROADMAP ("`node:test` testleri her aşamada") | Kural ve uygulama çelişiyor. ROADMAP "her aşamada test" derken general.md "asla test" diyor. | Kullanıcı netleştirmeli (§4 soru 6). |
| 8 | Roadmap iki tane | `ROADMAP.md` (özellik) ↔ `docs/roadmap.md` (temizlik) | Aynı isimde iki ayrı kapsam, kafa karıştırır. | İkisi de `docs/backlog/` maddelerine dönüşür ve `docs/archive/` altında farklı adlarla tutulur (`roadmap-features-2026-10.md`, `roadmap-codebase-cleanup-2026-10.md`). |
| 9 | Plan/todo tasarım ≠ uygulama | `ROADMAP.md` (`plans/<id>.json`, `plan_list`, `plan_export`) ↔ PMAP (tek `.plan.md`) | ROADMAP içinde bu farkı not düşülmüş ama maddeler tarihsel. | Plan/todo bölümü "YAPILDI" olarak arşivlenir. |
| 10 | Proje dili | design-rules/roadmap/srp/arch Türkçe ↔ PMAP/backend README/poyraz docs İngilizce | Tutarsız. | Kural: kullanıcı belgeleri Türkçe, AI belleği (PMAP) İngilizce, submodule İngilizce (bkz. §4 soru 8). |
| 11 | Mimari raporu tarihi | `docs/architecture-report.md` içi "2026-06-03", git 2026-10-12 | Tarih belirsiz. | Arşivde adı `...-2026-06` olarak etiketlenir, tarih netleştirilince düzeltilir. |
| 12 | poyraz docs ↔ host | `poyraz/README.md` (5 sağlayıcı) ↔ PMAP (llama.cpp dahil, 6) | Sağlayıcı listesi tutarsız. | Submodule içi iş, kullanıcı notu. |

---

## 4. Önerilen taşıma planı (kaynak → hedef)

Uygulanmadı. Onay bekliyor. `git mv` ile taşınırsa geçmiş korunur.

### 4.1 Hedef klasör yapısı

```
docs/
  architecture/     (ERTELENDİ — yalnız yüzeysel iskelet; ayrıntılı yazılmayacak)
  decisions/        (karar kayıtları, ADR tarzı kısa)
  backlog/          (bir madde = bir dosya; başlık bloğu: durum, öncelik, alan, bitti-kriteri)
  rules/            (kurallar)
  archive/          (eski; silinmez)
  reports/          (YENİ: denetim raporları, analizler)  
  reference/        (YENİ, isteğe bağlı: poyraz/ submodule docs için tek sayfalık işaretçi)
```

### 4.2 Taşıma tablosu

| Kaynak | Hedef | Eylem | Not |
|---|---|---|---|
| `PMAP.md` | `PMAP.md` (kökte kalır) | Taşıma yok; 4 satır düzeltmesi | general.md kuralı kökte ister |
| `docs/arch-cwap.md` | `docs/architecture/cwap.md` | Taşı, başına "taslak" bandı, yollar `catalog/`'a düzeltilir (isteğe bağlı) | Yeniden yazılmaz |
| `docs/backend/README.md` | `docs/architecture/host-overview.md` | Taşı + "kısmen eski" bandı | docs/roadmap.md'nin "kısa işaretçiye indir" önerisi kullanıcıya sorulur |
| `docs/circuit-breaker-report.md` | `docs/decisions/0001-error-circuit-breaker-off.md` | Taşı, başına 5-8 satır karar özeti | Tam rapor korunur |
| (yeni) Karar: Tailwind v4 | `docs/decisions/0002-tailwind-v4.md` | `implementation_plan.md` "reddedildi" + design-rules + PMAP'ten türetilir | "Eski karar geçersiz" notu |
| (yeni) Karar: ekleyici ilerle ilkeleri | `docs/decisions/0003-additive-phases.md` | ROADMAP "İlkeler" bölümünden | Geçerliliği kullanıcıya sorulur |
| (yeni) Karar: plan/todo tek `.plan.md` modeli | `docs/decisions/0004-plan-single-file.md` | ROADMAP/PMAP'ten | Opsiyonel |
| `ROADMAP.md` | `docs/archive/roadmap-features-2026-10.md` | Maddeler önce backlog'a çıkarılır, sonra taşı | §2.1 |
| `IDEAS.md` | `docs/archive/IDEAS-2026-10.md` | Madde backlog'a, sonra taşı | §2.2 |
| `docs/roadmap.md` | `docs/archive/roadmap-codebase-cleanup-2026-10.md` | Maddeler backlog'a, "Mevcut durum" borç notu architecture'a, sonra taşı | §2.4 |
| `implementation_plan.md` | `docs/archive/implementation_plan-web-refactor-and-mobile.md` | Taşı (uygulandı) | |
| `docs/architecture-report.md` | `docs/archive/architecture-report-2026-06.md` | Taşı; tek özet backlog maddesi | Tarih netleşince ad düzeltilir |
| `design-rules.md` | `docs/rules/design-rules.md` | Taşı + 2 `.mdc` işaretçi + PMAP + general.md yol güncellemesi | **Opsiyonel; yol bağımlılıkları nedeniyle riskli** (§5 soru 3) |
| `docs/srp.md` | `docs/rules/file-ownership.md` | Taşı, yollar ve çelişkiler düzeltilir | veya architecture/ |
| `.clinerules/general.md` | yerinde | Taşıma yok | İsteğe bağlı: `docs/rules/README.md` içinde işaretçi |
| `.clinerules/design-rules.mdc`, `.cursor/rules/design-rules.mdc` | yerinde | Taşıma yok | Yol değişirse güncellenir |
| `docs/feedbacks/2026-10-09.md` | `docs/reports/audits/2026-10-09-agent-behavior-audit.md` | Taşı; bulgular backlog'a | §2.6 |
| `poyraz/README.md`, `poyraz/docs/*.md` (13) | yerinde | Taşıma yok | Submodule; isteğe bağlı `docs/reference/poyraz.md` işaretçisi |

### 4.3 Önerilen ilk backlog dosyaları (taslak: 18 madde)

| Slug | Öncelik (öneri) | Alan | Kaynak | Durum (öneri) |
|---|---|---|---|---|
| `self-improving-agent` | P1 | host/poyraz-lib | IDEAS | idea |
| `virtual-terminal` | P1 | host/web | ROADMAP Aşama 1 | idea (karar bekliyor: pipe/PTY) |
| `grep-find-files-tools` | P2 | host | ROADMAP Aşama 2 | idea |
| `agents-md-loading` | P2 | host | ROADMAP | idea |
| `memory-project-scope` | P3 | host | ROADMAP | idea (doğrulanmalı) |
| `plan-list-export-tools` | P3 | host | ROADMAP | idea |
| `command-destructive-approval` | P2 | host | ROADMAP | idea (doğrulanmalı) |
| `cleanup-dead-loop-hook` | P2 | host | docs/roadmap | ready |
| `cleanup-policy-permits-builtin` | P2 | host | docs/roadmap | ready |
| `consolidate-compile-fn` | P3 | host | docs/roadmap | idea |
| `explain-context-real-values` | P3 | host | docs/roadmap | idea |
| `cleanup-small-residues` | P3 | host | docs/roadmap | ready |
| `split-large-files` (alt görevler) | P3 | host/web | docs/roadmap | idea |
| `remove-responsive-css-to-utilities` | P3 | web | design-rules | idea |
| `docs-fix-stale-references` | P1 | docs | PMAP/srp/backend/roadmap | ready |
| `agent-behavior-audit-followups` | P1 | process/host | feedbacks | idea (doğrulanmalı) |
| `architecture-open-findings` | P3 | process | architecture-report | idea (ertelendi) |
| `message-queue-persist-reorder` | P3 | web | PMAP | idea |

(Nihai sayı onaydan sonra belirlenir; `split-large-files` alt görevlere bölünebilir.)

---

## 5. Kullanıcıya sorulması gereken belirsiz noktalar

1. **`poyraz/` salt okunur mu?** srp.md/arch-cwap.md "dokunulmaz" diyor, docs/roadmap.md "değildir" diyor. Hangisi geçerli? (Son durumda kendin Poyraz'ı geliştirtiyorsun, submodule'de aktif iş var.)
2. **`docs/architecture/` içeriği:** Mimari oturmadığı için `arch-cwap.md`'yi olduğu gibi "taslak" bandıyla mı taşıyalım, yoksa sıfırdan 1 sayfalık iskelet mi yazalım? `docs/backend/README.md` (16 KB, kısmen eski) iskelete mi indirilsin, arşive mi?
3. **`design-rules.md` kökten taşınsın mı?** `.clinerules`, `.cursor/rules`, `general.md`, PMAP bu yola bağlı. Kökte bırakmak daha az risklidir. Taşırsak 4 yer güncellenir.
4. **Tailwind kararı:** "Tailwind reddedildi" (implementation_plan) artık geçersiz mi, yani bilinçli olarak v4'e geçildi mi? Karar kaydına bu şekilde mi yazalım?
5. **`ROADMAP.md` expert sistemi:** CWAP bunun yerini aldı mı? `ExpertProfile`, Experts sekmesi, Debug'da aktif expert gibi maddeler iptal mi, backlog'a mı?
6. **Test kuralı:** `.clinerules/general.md` "asla test yazma" diyor ama repo testli ve PMAP `npm test`'i kapı sayıyor. Kural ne olmalı? (ROADMAP "her aşamada test" ile de çelişiyor.)
7. **Sanal terminal ve grep/find_files** hâlâ hedef mi? Pipe mı PTY mi karar verildi mi? Öncelikleri?
8. **Doküman dili:** Kullanıcı dokümanları Türkçe, PMAP/backend README İngilizce. Standart bu şekilde mi kalsın? Backlog maddeleri hangi dilde?
9. **`docs/architecture-report.md` tarihi:** İçeride 2026-06-03, git'te 10-12. Doğru tarih hangisi? 12 maddelik yeniden yapılandırma önerisi hâlâ gündemde mi (God barrel, `shared/` yeniden adlandırma, workspace dependency)?
10. **Feedback denetimi:** 2026-10-09 bulguları (özellikle "tool loop kesilince tamamlandı demek") giderildi mi? Yeniden denetim yapılsın mı? Bu denetim haftalık denetçi ajanın ilk çıktısı mı sayılsın?
11. **Backlog öncelik/alan şeması:** P0-P3 ve alan listesi (`host|web|poyraz-lib|docs|process`) uygun mu? Madde dosyaları tek klasörde mi, duruma göre alt klasörlerde mi?
12. **`docs/feedbacks/`** → `docs/reports/audits/` yeni kategorisini onaylıyor musun, yoksa `archive`/`backlog` içine mi?
13. **PMAP.md** düzeltmeleri (pinned commit, `mode`, mood `styles.css`) yapılsın mı? Bunlar kod değil doküman değişikliği. Onay gerekir.
14. **`poyraz.code-workspace`** (kök, md değil): mimari rapor "yanlış path referansları" diyor. Kapsam dışı, ama istenirse bakılır.

---

## 6. Ek gözlemler

- Kökte `README.md` yok (yalnızca `poyraz/README.md` var). Yeni `docs/README.md` (indeks + kategori açıklaması + backlog başlık bloğu şablonu) önerilir.
- `build/` ve `release-build/` dizinleri kapsam dışı bırakıldı (içerik doküman değil).
- `scripts/setup-tunnel.ps1` dokümantasyonsuz; kapsam dışı.
- Git: `main`, `master`, `test` dalları var; submodule `poyraz` ve ana repo ayrı remote'larda (ana repo `git.lysep.com`, submodule GitHub `Septillioner/poyraz`).
- İki devam eden süreç kuralı (general.md): "commit'i manuel olarak kullanıcıya attır" ve "PMAP'i her zaman oku/güncelle". Taşıma uygulaması bunlara uymalı: commit'i Ege atar, ben/ajan yazmaz.
