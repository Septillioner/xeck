# ADR 0001 — Aynı hata devre kesicisi kapalı

- **Durum:** Kabul edildi, yürürlükte (kapalı).
- **Tarih:** 10.07.2026 (raporda yazıldığı gibi)
- **Karar:** `poyraz/` içindeki "aynı araç hatası üst üste N kez" devre kesicisi kapalıdır; host, politika bazında `errorBreaker: 'off'` verir.
- **Gerekçe:** Devre kesici, tetiklenince `tool_calls` kırpıyor ama `providerMeta.openai.outputItems` içindeki `function_call` öğeleri kalıyordu. Responses API'ye geri oynatılınca çıktısız çağrı nedeniyle `400 No tool output found for function call` hatası oluşuyordu.
- **Telafi:** İstek başına `sanitizeToolPairing()` eksik tool çıktısını sentetik mesajla tamamlar, öksüz tool mesajlarını atar.
- **Yeniden açma koşulları:** Bu belgenin §6 bölümü.
- **İlgili:** PMAP.md "Submodule" bölümü (satır 33-35).


---

# Devre Kesici Raporu — Aynı Hata Devre Kesiciyi Kapatıldı

- **Tarih:** 10.07.2026
- **Durum:** Kapalı (`ERROR_CIRCUIT_BREAKER_ENABLED = false`)
- **Etkilenen modül:** `poyraz/` (alt modül)

---

## 1. Özet

`decision-loop.ts` içindeki "aynı araç hatası üst üste N kez" devre kesicisi kapatıldı. Aynı işi
yapan iki eşlik eden değişiklik yapıldı: devre kesicinin tetiklendiği turda `providerMeta` artık
saklanmıyor, ve her istek çıkmadan önce araç/çağrı eşleşmesi onarılıyor.

Kapatma kararı tek başına alınmadı — devre kesici, kapalı hâliyle bile var olan bir 400 hatasının
**kaynağıydı**. Ayrıntı için [Kök neden](#3-kök-neden).

---

## 2. Semptom

Poyraz sohbetinde aynı turda iki şey görüldü:

```
NOTICE: 'mcp_poyraz__get_file_info' returned the same error twice in a row.
Stop retrying that tool call. Explain what you need from the user or describe the blocker in plain text.
```

ve hemen ardından:

```
400 No tool output found for function call call_u3Ba959PiIphnGBKpwNKOBdX
```

---

## 3. Kök neden

Hata **Responses API**'den geliyor (`400 No tool output found for function call`; Chat Completions
böyle bir metin döndürmez). Zincir:

| # | Adım | Konum |
|---|---|---|
| 1 | `policyForId()` üç modda da `hardBlockDeniedTools: true` döndürüyor | `host/src/agent/catalog/prompts/system-prompt.ts` |
| 2 | Aynı hata 2 kez tekrarlayınce sert NOTICE user mesajı olarak tarihe ekleniyor, `circuitBreakerNoticeSent = true` | `poyraz/application/chat/decision-loop.ts:367-387` |
| 3 | Sıradaki turda `toolCalls = isToolLoopBlocked() ? undefined : response.tool_calls` → `tool_calls` **siliniyor** | `decision-loop.ts:237` |
| 4 | Ama `providerMeta` aynen saklanıyor → `openai.outputItems` içinde `function_call` item'ları duruyor | `decision-loop.ts:239-246` (eski hâli) |
| 5 | `buildChatResponseFromResponsesOutput()` `outputItems`'ı `tool_calls`'tan bağımsız yazıyor | `poyraz/infrastructure/llm/openai-responses.ts:224-241` |
| 6 | Sonraki istekte `toResponsesInput()` assistant + `outputItems` varsa birebir replay ediyor | `openai-responses.ts:122-126` |
| 7 | O turda hiç `function_call_output` üretilmediği için çağrı cevapsız kalıyor → **400** | — |

`completePendingToolResponses()` (`decision-loop.ts:109-138`) bu durumu onaramıyor; çünkü sadece
`msg.tool_calls`'a bakıyor ve bu senaryoda `tool_calls` zaten `undefined`.

**Sonuç:** devre kesici "tool çağrısını engelle" derken geçerli bir tool çağrısını cevapsız bırakıyor,
bir sonraki istekte tarih geçersizleşiyor. Devre kesiciyi kapatmak hatayı hem semptomdan hem de
kaynağından kaldırıyor.

---

## 4. Yapılan değişiklikler

### 4.1 Devre kesiciyi kapat

**`poyraz/application/chat/decision-loop.ts`**

| Satır | Değişiklik |
|---|---|
| 39 | `export const ERROR_CIRCUIT_BREAKER_ENABLED: boolean = false;` — neden kapalı ve ne zaman açılacağı yorumla birlikte |
| 354 | Sayaç bloğu `ERROR_CIRCUIT_BREAKER_ENABLED &&` ile kapandı |
| 367 | Tetik bloğu `ERROR_CIRCUIT_BREAKER_ENABLED &&` ile kapandı |
| 245 | `providerMeta: toolCalls ? response.providerMeta : undefined` — `tool_calls` silinirse hammadde çıktı da silinir |

Bayrak `false` olduğu için: NOTICE hiç üretilmiyor → `circuitBreakerNoticeSent` hep `false` →
`isToolLoopBlocked()` hiç `true` olmuyor → `tool_calls` hiç strip edilmiyor → 400 zinciri kırılıyor.

### 4.2 Geçmişi silmeden 400 onarımı

**Yeni dosya: `poyraz/infrastructure/llm/tool-pairing.ts`**

```ts
sanitizeToolPairing(messages: ChatMessage[]): ChatMessage[]
```

- **Yeni array döner, gelen `messages`'e dokunulmaz.** Kayıtlı transcript, `libraryMessages` ve
  UI'daki mesajlar aynen kalır; sadece sağlayıcıya giden **istek payload'ı** onarılır.
- Cevapsız her `function_call`'ın hemen ardına sentetik `role: 'tool'` mesajı eklenir
  (`MISSING_TOOL_OUTPUT_NOTE`). Çağrı silinmiyor, eşleştirilmiş hâle getiriliyor — model kendi
  önceki çağrısını görmeye devam ediyor.
- Çağrısı olmayan (`tool_call_id` hiçbir çağrıya eşleşmeyen) `role: 'tool'` mesajı atlanır.
- `id`'si boş olan `tool_call` atlanır (eşleştirilemesin; `extractToolCallsFromOutput` `''`
  döndürebiliyor).

**Bağlama noktaları (sağlayıcı sınırı):**

| Dosya | Satır | Yol |
|---|---|---|
| `infrastructure/llm/providers.ts` | 35 | Ollama |
| `infrastructure/llm/providers.ts` | 203 | OpenAI **Responses API** |
| `infrastructure/llm/providers.ts` | 327 | OpenAI **Chat Completions** (fallback) |
| `infrastructure/llm/gemini-messages.ts` | 146 | Gemini (`buildGeminiRequest`) |

Tek helper, dört yol → Responses, CC fallback, Ollama ve Gemini aynı onarımdan geçiyor.

### 4.3 Mevcut testlerin yeni duruma uyarlanması

**`poyraz/tests/integration/decision-loop.test.ts`** — yeni test yazılmadı, iki mevcut assertion
güncellendi:

- `'injects NOTICE after same error twice and blocks further tool calls'` →
  `'does not inject a NOTICE when the same error repeats while the breaker is off'`
  (`ERROR_CIRCUIT_BREAKER_ENABLED === false` ve `CONSECUTIVE_SAME_ERROR_LIMIT === 2` doğrulanıyor).
- `'strips tool_calls from assistant message when circuit breaker is active'` →
  `'never strips tool_calls from an assistant round while the breaker is off'`.

---

## 5. Kapatınca ne kaldı, ne kalktı

### Kalkan koruma

| Koruma | Ne yapıyordu |
|---|---|
| `CONSECUTIVE_SAME_ERROR_LIMIT = 2` | Aynı `tool:code:mesaj-hash` 2 kez üst üste gelince NOTICE + tool çağrısını bloklama |

### Kalan korumalar (devre kesicisiz de çalışıyor)

| Mekanizma | Konum | Ne yapıyor |
|---|---|---|
| `repeatCallLimit` (varsayılan **2**) | `poyraz/application/chat/tool-execution.ts:110` | Aynı **tool + argüman** imzası tekrarlanınca `POLICY_BLOCKED` hatası döndürüyor. Pratikte asıl koruma bu. |
| `maxToolRounds` (host: agent 60, plan 40; kütüphane varsayılanı 10) | `poyraz/application/agent/tool-resolver.ts:21-27`, `host/src/agent/catalog/prompts/system-prompt.ts` | Bir turun toplam araç turu sınırı. |
| Mod politikası `deniedTools` | `poyraz/application/chat/tool-policy.ts:68-87` | Modun kullanıma açmadığı araçları reddediyor. |
| Response gate'ler | `decision-loop.ts:249-276` | Metin cevaplarını reddedip yeniden deniyor. |
| Tool hatasının kendisi | `tool-execution.ts` → `withRepair` | Hata modelin gördüğü bir `tool` mesajı olarak geri dönüyor; model durumu kendi gözüyor. |

Yani "aynı hata sonsuza kadar dönüyor" senaryosu hâlâ **`repeatCallLimit` + `maxToolRounds`** ile
sınır içinde. Devre kesici bu ikisinin üzerine binen üçüncü bir katmandı.

---

## 6. İleride açılması gerekir mi?

### Karar: şu an **açılması gerekmiyor**. Koşullar sağlanana kadar kapalı kalmalı.

**Açmamak için nedenler:**

1. **NOTICE modeli durdurmuyordu, turn'u öldürüyordu.** Sert yol (`buildErrorCircuitNotice`)
   user mesajı olarak tarih arasına giriyor ve sıradaki turda tüm tool çağrılarını strip ediyordu.
   Bu, 400'ün doğrudan kaynağıydı.
2. **Aynı koruma zaten var.** Pratikte döngü yapan şey çoğunlukla argümanları da değişen çağrılar;
   bunları `repeatCallLimit` yakalamıyor ama `maxToolRounds` yakalıyor. Ekstra katmanın getirisi düşük.
3. **Yan etkisi pahalı.** Tek bir geçici MCP hatası (sunucu henüz başlamamış olabilir) bile turn'u
   sonlandırabiliyor. `mcp_poyraz__get_file_info` tam olarak böyle bir durumdu.

**Açılabileceği koşul:** bir tool hatasının **kalıcı** olduğu ve modelin serbestçe denemeye devam
etmesinin anlamsız ya da pahalı olduğu durumlar. Örnek: kota dolmuş bir servis, izin verilmeyen bir
yol, sürdürülemeyen bir argüman kombinasyonu.

### Yeniden açmak için gerekenler (checklist)

- [ ] `sanitizeToolPairing` yerinde ve dört sağlayıcı yolunda bağlı. **(tamam)**
- [ ] `providerMeta` guard'ı yerinde. **(tamam)**
- [ ] Sert yol yerine **soft yol** kullanılacak: `buildAgentSoftCircuitNotice`
      (`decision-loop.ts:104-120`). O zaten yazılı ama `hardBlockDeniedTools` her modda `true`
      olduğu için hiç devreye girmiyor. Soft yol `tool_calls`'a dokunmaz, sadece
      `<system_reminder>` içinde uyarı ekler.
- [ ] `policyForId()` içindeki `hardBlockDeniedTools: true` gözden geçirilecek: neden üç modda da
      sert blok? (`host/src/agent/catalog/prompts/system-prompt.ts`) Bu, devre kesiciyi varsayılan olarak
      sert yola çekiyor.
- [ ] `CONSECUTIVE_SAME_ERROR_LIMIT` 2'den **3**'e çıkarılacak — 2, tek seferlik bir MCP gecikmesi
      için çok düşük.
- [ ] **Varsayılan karar: açmak yerine kapalı tutmak.** Yine de açılırsa `decision-loop.ts:237`
      ile `245` arasındaki bağ korunacak: `tool_calls` düşerse `providerMeta` de düşmeli.

> `sanitizeToolPairing` ikinci bir savunma hattı olarak her durumda yerinde kalacak; ama tek
> seferlik savunma olarak görülmemeli.

---

## 7. Doğrulama

Çalıştırılanlar:

```
poyraz/ : node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json
poyraz/ : node_modules\.bin\vitest.cmd run        → 8 dosya, 86 test geçti
root    : npm run build:lib                        → tsup ESM + DTS başarılı
root    : npm run typecheck --prefix host          → temiz
```

Elle kontrol edilmesi gerekenler:

1. Plan veya ask modunda tekrarlayan bir araç hatası üret → **NOTICE gelmemeli**.
2. Daha önce `400 No tool output found for function call` almış eski bir sohbeti aç, yeni mesaj
   gönder → **400 gelmemeli**, önceki mesajlar silinmemeli.
3. Debug kaydında (`chat-debug-log`) istek payload'ında cevapsız `function_call` kalmamalı; varsa
   hemen ardından `MISSING_TOOL_OUTPUT_NOTE` içeren `role: 'tool'` mesajı görünmeli.

### Bilinen önceden varan sorun

`poyraz/evals/scenarios/helpers.ts` içinde 5 tip hatası var (`AgentStreamEvent` üzerinde `ok`,
`error`, `content` erişimi). Bu dosya bu değişiklikle ilgili değil ve `tsconfig` `evals`'i dahil
ettiği için `tsc --noEmit` bunları raporluyor. Build (`tsup`) ve host typecheck etkilenmiyor.

---

## 8. İlgili dosyalar

```
poyraz/application/chat/decision-loop.ts        devre kesici + providerMeta guard
poyraz/infrastructure/llm/tool-pairing.ts       NEW — sanitizeToolPairing
poyraz/infrastructure/llm/providers.ts          Responses / CC / Ollama bağlama
poyraz/infrastructure/llm/gemini-messages.ts    Gemini bağlama
poyraz/tests/integration/decision-loop.test.ts  mevcut assertion güncellemeleri
host/src/agent/catalog/prompts/system-prompt.ts           policyForId() → hardBlockDeniedTools + errorBreaker: 'off'
```

---

## 9. Host-owned konfigürasyon (10.07.2026 güncellemesi)

Devre kesici artık kütüphane sabitinden değil, **poyraz-web tarafından** yönetiliyor:

- `poyraz/domain/agent-policy.ts` → `errorBreaker?: 'off' | 'soft' | 'hard'` (`ErrorBreakerMode`).
  Alan set edilmezse varsayılan `'off'`. Kütüphane `index.ts` üzerinden `ErrorBreakerMode` tipini
  export ediyor.
- `poyraz/application/chat/decision-loop.ts` → `resolveErrorBreakerMode(agentPolicy)`.
  `AgentPolicy.errorBreaker` set edildiyse onu kullanır; edilmediyse eski
  `ERROR_CIRCUIT_BREAKER_ENABLED` sabitine düşer (geriye dönük uyumluluk).
- `host/src/agent/catalog/prompts/system-prompt.ts` → `policyForId()` her üç modda da `errorBreaker: 'off'`
  döndürüyor. Davranışı değiştirmek için tek nokta burası.
- Anlamlar: `'off'` = sayaç yok, NOTICE yok, blok yok. `'soft'` = `<system_reminder>` NOTICE,
  `tool_calls`'a dokunulmaz. `'hard'` = eski sert yol (yalnızca `hardBlockDeniedTools` da
  açıksa sert NOTICE, yoksa soft NOTICE); `tool_calls` strip edilse bile `providerMeta`
  düşürüldüğü için 400 zinciri kurulmaz.
- Yeni/güncel testler: `poyraz/tests/integration/decision-loop.test.ts` (3 yeni case: mod çözümü,
  soft, hard).

`'soft'` veya `'hard'` istenirse yalnızca `policyForId()` değiştirilir; kütüphaneye dokunulmaz.


