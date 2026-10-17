> Düzeltmeler: dört katalog yolları `workspaces/` → `catalog/`; "host/src/tools yok" satırı kaldırıldı (dizin var ve PMAP ile uyumlu: `file-access.ts`, `terminal-run.ts`).

# Dosya sahipliği

Kütüphane ile host arasındaki iş bölümü [docs/architecture/poyraz-library-boundary.md](../architecture/poyraz-library-boundary.md) içindedir. Bu belge yalnız hangi dosyanın hangi işi taşıdığını kilitler. Yeni bir workspace, araç veya policy bu listenin dışına id veya ikinci katalog koymaz.

## Dört katalog

- Araç tanımı `host/src/agent/tools/builtin` içindedir. Ad sabiti o modülün kendisindedir.
- Agent yalnız `host/src/agent/catalog/agents.ts`. Kimlik, talimat, vitrin. İzin ve araç listesi yok.
- Policy yalnız `host/src/agent/catalog/policies.ts`. `allow`, `deny`, tur limiti, `entryLine`, `loop`, `deniedReason`.
- Workspace yalnız `host/src/agent/catalog/workspaces.ts`. Ajan, policy ve tool seçimi.

Yeni bir alan bu üç satırdan fazlasına id yazmaz: ajan satırı, policy satırı, workspace bloğu. `chat.ts`, session store, CSS ve React state'e id eklenmez.

## Bağ ve kimlik

- `host/src/agent/workspaces/definitions.ts` kayıt tutmaz ve katalogları yeniden export etmez. Doğrulama, `selectedBuiltinNames`, `workspaceOffersPlan`, `policyIdFor`.
- `host/src/agent/workspaces/resolve.ts` kimlik okur.
- `host/src/agent/core/chat.ts` yalnız Chat şemasıdır.
- Varsayılan ajan ve workspace, coding satırından gelir. Yazılı bir id çevrilmez.

## Araç yüzeyi

- `host/src/agent/tools/builtin/identity.ts` yalnız MCP önekidir: sunucu id, önek, `serverSideName`, `isBuiltinHostTool`. İkinci ad listesi yok.
- Büyük gövde şema dosyasına yapışmaz. Dosya gövdesi `host/src/tools/file-access.ts`, terminal gövdesi `host/src/tools/terminal-run.ts`. İkisi de `agent/` dışındaki `host/src/tools/` içindedir.
- `host/src/agent/tools/builtin/bridge.ts` MCP sunumudur.
- Ret `host/src/agent/tools/policy-context.ts` içindedir. Metin policy satırının `deniedReason` değeridir.
- `host/src/agent/tools/tool-labels.ts` etiket, `requires` ve `availableWhen` tutar. İzin tutmaz.

## Oturum ve HTTP

- Kanonik oturum alanı `policyId`. `mode`, `legacyMode` ve takma ad haritası yok.
- Eksik `policyId`, o workspace'in `defaultPolicy` değeridir.
- Policy değişimi `PUT /api/sessions/:id/policy`. Sahibi `host/src/http/routes/sessions.ts`.
- Plan rotası plan okur ve todo işler. Policy değiştirmez.

## Sınır

- Test, kilitlediği modülün yanındadır.
- `poyraz/` ayrı bir repodur (GitHub). Kütüphane geliştirmesi orada yapılır ve orada commit'lenir; bu repoda yalnız pointer güncellenir. Host kütüphanenin içine uzanmaz, yalnız paketin dışa açtığı yüzeyi kullanır.

## Agent çalışma akışı

- `agent/runtime/sessions/turn.ts` bütün session'ların tek tur yaşam döngüsüdür. HTTP ve delegation yalnız burayı başlatıp gözlemler; ayrı agent döngüsü yazılmaz.
- `agent/runtime/agents/pool.ts` agent örneklerinin ve aktif tur sahipliğinin deposudur. Hazırlık dahil aynı session'da tek tur çalışır; iptal ve bırakma burada yönetilir.
- `agent/runtime/agents/setup.ts` workspace, uzman agent, policy, talimat, model ve araç grant'inden aynı AgentBuilder kurulumunu üretir.
- `agent/runtime/agents/execution.ts` kütüphanenin chat, summary ve context API'lerini çağırır. Model/araç/continuation döngüsü host'ta tekrarlanmaz.
- `agent/runtime/events/live-chat.ts` yalnız olay yayını, tamponlama ve abonelik taşır; iptal controller'ı tutmaz.
