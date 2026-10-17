# Poyraz kütüphanesi ve Xeck sınırı

> Bu sayfa iki repo arasındaki iş bölümünü anlatır. Yeni bir ajan ya da geliştirici işe başlamadan önce okur. Kütüphane tarafındaki ayrıntılar `poyraz/docs/` altındadır. 0.3'ten 1.0'a geçiş için `poyraz/docs/migration-1.0.md` dosyasına bakın.

## Ana fikir

Xeck, `poyraz` kütüphanesi kullanılarak kurulan bir uygulamadır. Kütüphane agent oluşturma ve yönetimini, context yönetimini ve ölçümünü, tool setlerini, policy'leri, özetlemeyi, continuation'ı, MCP bağlantısını, sağlayıcı ve model seçimini, rules ve skills desteğini arayüz olarak sunar. Xeck bu arayüzleri kullanır ve yalnız uygulamaya özgü parçaları kendi tutar. Kütüphane Xeck'i tanımaz. Başka bir proje aynı `AgentBuilder` ile agent kurup yönetebilmelidir.

## Kütüphane kuralları

- Temiz bir `AgentBuilder()` saf bir metin tamamlama bağlamı verir: rule, skill, sistem talimatı, araç, özetleme ve MCP yoktur. Her özellik varsayılan olarak kapalıdır ve yalnız açıkça istenince açılır.
- Her özellik builder üzerinden ayarlanır (`Summarization`, `Reasoning`, `Logging`, `Repair`, `SameToolBreaker`, `RateLimit`, `Mcp`, `Continuation`, `Policy` vb.). Genel bir davranışı host'ta elle yapmak yerine builder seçeneği olarak istenir.
- Kütüphanede poyraz-cli, Xeck ya da uygulama yolu (`os.homedir` gibi) bilgisi bulunmaz.
- Kütüphane eksiğini host'ta çözmeyin. Host'ta elle yapılan ve her Poyraz kullanıcısının ihtiyaç duyacağı genel bir şey kütüphanede yoksa eksik kütüphanededir ve oraya eklenir.

## Kütüphanenin sağladıkları (poyraz 1.0.0 ve b11eb99)

- `AgentBuilder` varsayılanları kapalı. Context ölçümü: `getContextMeterReal()` ve `getContextMeterEstimate()` on kategori verir (`system`, `tools`, `rules`, `skills`, `mcp`, `summary`, `conversation`, `toolCalls`, `toolResults`, `providerMeta`); `compileRequest()` ve `estimateContext()` de buradadır.
- `ContinuationPolicy`, `Summarization({ prefix, onSummarized, ... })`, MCP için `Mcp({ toolPrefix })`, `createMcpClientManager` ve `agent.syncMcp(servers)`.
- Çalışma anı ayarları: `setReasoning`, `setServiceTier`, `setContextWindow`, `setMaxToolRounds` (sonraki turdan itibaren etkili). `resolveContextWindow` pencereyi catalog, sağlayıcı önbelleği ve statik tablo sırasıyla çözer.
- Policy: `allowedTools` içinde `*` desenleri, `deniedTools` ve `maxToolRounds`.
- `toolResultMaxChars` ve `toolResultMaxBytes` (varsayılan kapalı), `ToolUseUnsupportedError` ve `isToolUseUnsupportedError`, rate limit ve logging (ikisi de isteğe bağlı).

## Host'ta kalanlar

Aşağıdakiler uygulamaya özgüdür ve host'ta kalır, kütüphaneye taşınmaz:

- HTTP, SSE ve UI, depolama konumu (`%APPDATA%/Xeck`), oturum deposu ve geçmişi yeniden oynatma, tur orkestrasyonu, ajan havuzu.
- Kendi araçları: dosya, terminal, grep, plan ve todo, memory, rules ve skills CRUD. Bunlar MCP sunucusu ya da host aracı olarak sunulur.
- İçerik: skill kataloğu, `SKILL.md` ayrıştırıcısı ve `/skill-adı` komutu, yerleşik talimat metinleri, agent ve workspace kataloğu, policy vitrini, sağlayıcı ve model kataloğu (context window için kullanıcı override'ı, sağlayıcı önbelleği ve statik OpenAI tablosu; bunlar `resolveContextWindow`'a kaynak olarak verilir), MCP yapılandırma deposu, ayarlar ve projeler.
- Dosya erişim güvenliği ve alan sınırları.

Araçlar, skill kataloğu ve içerik MCP üzerinden ya da host tarafında yazılır. Kütüphane yalnız bunları taşıyacak genel mekanizmayı (toolset, MCP bağlantısı, rules ve skills enjeksiyonu, policy) sağlar.

## Yeni bir şey nereye gider

1. Her Poyraz kullanıcısının ihtiyaç duyacağı genel bir davranış mı (policy, context, özet, devam, MCP, sağlayıcı)? Kütüphaneye, builder seçeneği olarak, varsayılanı kapalı.
2. Yalnız Xeck'in ürünü, içeriği ya da altyapısı mı? Host'a.
3. Emin değilseniz yazmadan önce Ege'ye sorun. Kütüphaneye eklenen her şey için test yazılır.

## Host'un kütüphane ile bağlanma noktaları

- Agent kurulumu `host/src/agent/runtime/agents/setup.ts` içinde yapılır; builder seçenekleri orada verilir: `Summarization` (host öneki, istemi ve `onSummarized`), `MaxToolRounds`, `Mcp({ toolPrefix })`, `Logging`, `ContextWindow`, `Reasoning`, `ServiceTier`, `Rules`, `AddSkills`, `Continuation` ve `Policy`. Rate limit açılmaz.
- Reasoning, service tier, context window ve tur sınırı agent'ın profil anahtarında değildir. Havuzdaki agent bunları sonraki turdan önce `setReasoning`, `setServiceTier`, `setContextWindow` ve `setMaxToolRounds` ile alır; geçmiş ve sağlayıcı önbelleği korunur.
- Context ölçümü kütüphanenin `getContextMeterReal()` ve `getContextMeterEstimate()` çağrılarından gelir (`contextPartsOf` on kategoriyi döner). Debug ağacı `compileRequest()` çıktısından kurulur (`context/tree.ts`). Host kendi karakter oranı hesabını yapmaz; eski `context-parts.ts` yoktur.
- Pencere `resolveContextWindow` ile çözülür: host kataloğundaki `contextLength` (kullanıcı override'ı), sağlayıcı önbelleği ve statik OpenAI tablosu kaynak olarak verilir. Pencere bilinmiyorsa token tabanlı özet kapalı kalır.
- Devam kararı kütüphanenin `ContinuationPolicy` arayüzündedir (`plans/open-steps-policy.ts`). Host yalnız plan gibi uygulama verisini sağlar ve sadece `loop: continue-open-steps` olan policy için kaydeder.
- Özet öneki ve istemi host'tan `Summarization`'a verilir. `onSummarized` plan satırını (`Plan 2/5, next t3`) özet mesajının sonuna ekler.
- Policy: `policyForId` allow listesini, `mcp_<sunucu>__*` desenlerini, `deniedTools` ve `maxToolRounds` değerini kütüphane policy'sine yazar. Araç seçimi (boş seçim araç yok demektir) ve araç öneki host'tan builder'a verilir.
- MCP bağlantısı host'un kendi `createMcpClientManager({ toolPrefix })` yöneticisinde `sync(defs)` ile yapılır (`stores/mcp-store.ts`); araçlar `mergeExternalTools` ile agent'a eklenir. `agent.syncMcp` kullanılmaz, çünkü her oturum agent'ı için ayrı bağlantı açardı.

Kütüphanede hazır olup host'ta kullanılmayanlar: `toolResultMaxChars` / `toolResultMaxBytes` (host'un kendi yapıya duyarlı `boundedJson` sınırı sonuçları geçerli JSON tutar) ve `agent.syncMcp` (yerine host yöneticisinin `sync(defs)` çağrısı kullanılır; `agent.syncMcp` her oturum agent'ı için ayrı bağlantı açardı). `isToolUseUnsupportedError` kullanılır: `agents/execution.ts` aracı desteklemeyen model hatasını (OpenRouter, OpenAI, Groq, llama.cpp, Ollama, vLLM) bununla tanır ve turu araçsız bir kez yeniden dener.

Wiring işleminin güncel yapılacaklar listesi ve kütüphanede eksik olduğu belirlenen özellikler `work/backlog/` altındaki wiring maddesindedir.

## Çalışma kuralları (ajanlar için)

- Başka bir ajana iş verirken bu sayfayı ve `PMAP.md` dosyasını okutun.
- `poyraz/` alt modülünde değişiklik kütüphane çalışmasıdır. Host işi yapan ajan `poyraz/` içine dokunmaz, eksik bulursa backlog'a yazar.
- Mevcut testler korunur. Kütüphane değişikliğinde `tsc`, build ve testler yeşil olmalıdır.

Host çalışma akışında HTTP ve delegation aynı `sessions/turn.ts` yaşam döngüsüne girer. `agents/pool.ts` agent örneklerini ve session başına tek aktif turu yönetir; `agents/setup.ts` uygulama kataloglarını çözüp AgentBuilder kurulumunu yapar; `agents/execution.ts` kütüphanenin çalıştırma API’lerini kullanır. Model, araç ve continuation döngüleri kütüphanede kalır.
