> Bulguların güncel durumu doğrulanmadı; takip maddesi: backlog 021.

# Agent Davranış Denetimi — 2026-10-09

## Kapsam ve yöntem
`%APPDATA%/poyraz-web/sessions/` altındaki 8 oturumun kullanıcıya görünen mesajları ve ilgili araç etkinlikleri incelendi. Değerlendirme; talebe uyum, tamamlanma iddialarının doğrulanması, araç kullanımı ve gözlemlenebilir ürün kusurlarına odaklandı. Gizli reasoning veya sırlar rapora dahil edilmedi. Bu çalışma sırasında kaynak kod değiştirilmedi.

## Kanıtlı sorunlar

### Yüksek: derleme hatası sonrası doğrulanmamış tamamlanma
- Oturum: `9a5920fa-d04f-46af-9667-641abff16528` — FIFO mesaj kuyruğu.
- Uygulama turu `Tool loop limit reached (60)` ile kesildi; agent yine de kuyruğu tamamlanmış olarak bildirdi ve build çalıştırmadığını söyledi.
- Kullanıcının çalıştırdığı Vite build, `web/src/state/AppState.tsx:735` satırında yinelenen `streaming` bildirimi nedeniyle başarısız oldu (önceki bildirim satır 733'teydi).
- Agent ikinci bildirimi sildi fakat yeniden build almadı. Dolayısıyla düzeltme o oturumda doğrulanmadı; bugün de bozuk olduğu sonucuna varılamaz.

### Orta: aşırı araç döngüsü ve iç limit mesajlarının kullanıcıya sızması
- `9a5920fa...` oturumunun araç izinde toplam 74 `search_code` çağrısı, yinelenen sorgular ve en az iki repeat-call guard bloklaması görülüyor. FIFO uygulama turu ayrıca 60 araç döngüsü sınırına ulaştı.
- `5ead22ed-a521-485d-b34e-aed5841e2c2c` — proje yönetimi oturumunun final yanıtında “Tool loop limit reached (60)” metni iki kez kullanıcıya gösterildi. Aktivitede 48 terminal çağrısı ve bir başarısız terminal çağrısı var; sonrasında typecheck/build başarılı diye raporlandı.
- Bu izler belirgin araç verimsizliği ve iç hata metninin sızmasını gösteriyor. Proje yönetimi özelliğinin kendisinin bozuk olduğuna dair kanıt bulunmadı.

### Orta: chat eylem menüsünde ilk teslim kusurları
- Oturum: `6622dc09-f51b-4211-a64c-6e7be182cb7c` — chat satırı eylem menüsü.
- Kullanıcı menülerin üst üste binmesini ve “Projeye taşı” alt menüsünün ekran dışına taşmasını bildirdi; agent iki ayrı düzeltme yaptı ve build geçtiğini bildirdi.
- Agent ayrıca ilk özel menüde klavye odağı ve ok tuşlarıyla gezinmenin eksik olduğunu kabul etti. Bu erişilebilirlik eksikliğinin sonradan giderildiğine dair kayıt yok.

### Düşük: kalıcı hafıza yeteneği hakkında tutarsız açıklama
- Oturum: `9a5920fa...`.
- Agent önce bu oturumda hafızaya yazma aracı olmadığını söyledi; ilerleyen bölümde `memory_upsert` çağırıp proje yolunu kaydetti. Kayıt sonunda yapıldı, ancak ilk açıklama tutarsızdı.

### Denetim sırasında tekrarlanan araç çağrısı
- Bu denetim oturumunda aynı `plan_read {}` çağrısı tekrarlandı ve bir çağrı repeat-call guard tarafından engellendi. Çağrı yeniden denenmedi; bu, oturum verisine ilişkin değil, denetim yürütmesindeki önlenebilir araç tekrarıdır.

## Hata kanıtı görülmeyen oturumlar / davranışlar
- `4806f3b8-ea45-4074-a986-388ec1b5e3ec`: Agent modundayken görülen repeat-call hatasının, mod/politika engeli değil aynı araç çağrısının tekrarı olduğunu kod üzerinden doğru ayırdı.
- `b8bac33b-5606-4615-ac01-152cff554b48`: Demo amaçlı planın ardından gerçek kod değiştirmemesi, planın açıkça demo olmasıyla uyumluydu.
- `d669ad9d-c37c-4db5-8a0e-641772e7f796`: Policy renk eşlemesi ve UI kapsamı kullanıcıyla netleştirildi; CSS istisnası için onay alındı. Kayıtta doğrulama başarısızlığı kanıtı yok.
- `6782db92-3558-4dfb-b9e7-fa417fcbf46e`: Kuyruk/plan kartı UI ve `npm run dev` düzenlemelerinin otomatik doğrulanmadığı açıkça belirtildi. Sonradan oluşmuş bir arızaya dair kayıt yok; bu nedenle doğrulanmamış teslim riski olarak kaldı.
- Mevcut denetim oturumu: kullanıcı kapsamı onayladı ve denetime devam edilmesini istedi; nihai rapor hazırlandı.

## Sonuç
En ciddi örüntü, araç döngüsü kesintisine rağmen işi tamamlandı diye sunmak ve derleme hatasını giderdikten sonra doğrulamayı tekrarlamamaktır. İkinci örüntü, aynı sorguları ve terminal işlemlerini aşırı tekrarlayıp iç limit mesajlarını kullanıcıya göstermektir. Diğer bulgular, menü kullanılabilirliği/erişilebilirliği ve yetenekler hakkında tutarlı açıklama yapma konularındadır.
