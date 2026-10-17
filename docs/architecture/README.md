# Mimari (yüzeysel iskelet)

> **Durum: ERTELENDİ.** Mimari henüz oturmadı. Bu sayfa ayrıntılı değil, 2-3 cümlelik "şu an böyle çalışıyor" notlarıdır. **belirsiz** işaretli yerler kesinleşmemiştir. Kod ile eş güncellenen asıl kaynak kökteki [PMAP.md](../../PMAP.md) dosyasıdır; çelişkide PMAP esas alınır.
> Son güncelleme: 2026-10-15.

## Belgeler

| Belge | Durum |
|---|---|
| [poyraz-library-boundary.md](poyraz-library-boundary.md) | Güncel. Kütüphane ile Xeck arasındaki iş bölümü ve kurallar. Başka bir ajana iş vermeden önce okunur. |
| [host-overview.md](host-overview.md) | Kısmen eski. Host servisi, API, SSE akışı, kalıcılık. |
| [../archive/cwap.md](../archive/cwap.md) | Arşiv. Eski CWAP taslağı, güncel mimari değildir. |
| [../archive/architecture-report-2026-06.md](../archive/architecture-report-2026-06.md) | Arşiv. Eski mimari analiz. |

## Genel yerleşim

`poyraz/` git submodule'üdür (LLM sağlayıcıları ve sohbet çekirdeği), `host/` Node HTTP süreci (Hono, `127.0.0.1:8787`), `web/` Vite + React + Tailwind v4 arayüzü, `electron/` aynı host ve veri dizinini saran masaüstü kabuğu, `shared/` iki tarafın ortak sözleşmeleri. `poyraz/` içine bu repodan yazılıp yazılmayacağı **belirsiz**.

## Host

`host/src` sorumluluğa göre gruplanmıştır: `http/` (rotalar, SSE turu), `agent/` (core, runtime, catalog, tools), `stores/` (kalıcılık), `plans/` (plan servisi), `tools/` (dosya ve terminal gövdeleri). Katmanlar arası bazı importlar açıktır ve kalmıştır. `AppState.tsx` ve `chat-turn.ts` gibi büyük dosyaların bölünmesi **belirsiz**.

## Ajan modeli

Workspace, agent ve policy dört katalogtan (araç, agent, policy, workspace) birleşir; oturumun kanonik alanı `policyId`'dir. Policy metni prompt'a değil geçmişin sonuna `entryLine` olarak girer ki prompt cache korunsun. Expert sistemi bunun yerini aldı mı **belirsiz**.

## Web

`web/src` katmanlıdır (`shell|chat|settings → ui → state → api|lib → shared`). Stil yalnız `web/src/styles/` altındadır, tasarım kuralları [docs/rules/frontend.md](../rules/frontend.md) içindedir. `responsive.css` geçiş borcu olarak durur.

## Oturum, plan ve hafıza

Oturumlar ve planlar `%APPDATA%/Xeck` altında diskte tutulur; plan tek bir `.plan.md` dosyasıdır ([ADR 0004](../decisions/0004-plan-single-file.md)). Hafıza-proje bağı **belirsiz**.

## Araçlar ve izin

Yerleşik araçlar builtin MCP sunucusu olarak sunulur ve policy `allow`/`deny` ile süzülür. Terminal yalnız `run_command` ile sınırlıdır; kalıcı terminal oturumu **belirsiz**.

## Hata dayanıklılığı

Aynı-hata devre kesicisi bilerek kapalıdır ([ADR 0001](../decisions/0001-error-circuit-breaker-off.md)); araç/çağrı eşleşmesi her istekte onarılır.
