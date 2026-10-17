# Frontend kuralları

Tek frontend kural sayfası. Kökteki eski `design-rules.md` kaldırıldı (git geçmişinde durur). Stil: Grok Bot tarzı, sade ve yumuşak (soft UI): düz yüzey, kenarlıksız, açık temada ılık-nötr, koyu temada siyah/nötr yüzeyler, tek ve ölçülü vurgu rengi, açık ve koyu tema. Varsayılan vurgu Deep blue; büyük yüzeylere mavi tonu karıştırılmaz.

## 1. Yalnız token

- Renk, yarıçap, aralık ve yazı boyutu `web/src/styles/theme.css` içindeki `@theme` bloğundan gelir. Başka dosya renk icat etmez; `#hex` ve `rgb()` yalnız `theme.css` içinde yazılır.
- Yazı: `text-nano` 10, `text-micro` 11, `text-small` 12, `text-ui` 13, `text-body` 14, `text-lead` 15, `text-brand` 16, `text-large` 17 (büyük metin boyutu), `text-heading` 22. CSS'te de `font-size: 10px` değil `var(--text-nano)` yazılır. `text-[13px]` yazılmaz.
- Yarıçap: `rounded-tile` 8, `rounded-control` 10, `rounded-row` 12, `rounded-card` 14 (küçük etiketler hap: `rounded-full`). `rounded-[8px]` yazılmaz.
- Ölçü: `h-control` 34, `size-control-sm` 28, `px-control-pad` 12, `min-h-row` 40. Sayfa ritmi: `px-gutter` 24 (yan boşluk), `mb-section` 32 (gruplar arası), satırlar arası 8 (`gap-2`).
- Yeni token eklenince `web/src/lib/cn.ts` içindeki twMerge listesine de eklenir; yoksa `text-ui` ile `text-ink` birbirini siler.
- Koyu tema aynı değişken adlarını `.dark` bloğunda yeniden tanımlar. Bileşen temaya bakmaz. Yeni renk token'ı hem açık hem koyu değer taşır.
- İkonlar `lucide-react`tan gelir (adlı import, tree-shake). Elle SVG çizilmez; `web/src/ui/icons.tsx` yalnız ince sarmalayıcıdır: tek boyut (18px) ve tek çizgi kalınlığı (1.75). İstisnalar: Xeck logosu, bağlam ölçerin halka grafiği ve sağlayıcı markaları (`ui/provider-icons.tsx`).
- Çok satırlı alan: composer `react-textarea-autosize` (`minRows` 1, `maxRows` 8), ayar ve modal alanları `web/src/ui/Textarea.tsx` (`field field-area`, 3-12 satır). Kendi `scrollHeight` kodu yazılmaz. Hiçbir textarea'da yeniden boyutlandırma tutamacı olmaz (`base.css`: `textarea { resize: none }`); kaydırma çubuğu `scrollbar-width: thin` ve şeffaf ray ile köşe çizgisi göstermez. Enter gönderir, Shift+Enter satır ekler, IME yazımı sırasında Enter gönderilmez.

## 2. Düz, kenarlıksız yüzey

- Kenarlık, çerçeve, `ring`, `divide-*`, ayırıcı çizgi, gölge, blur, `backdrop-filter`, yarı saydam panel, parıltı (glow) ve gradient yoktur. Gölge token'ı da yoktur.
- Alanlar arkaplan tonu, boşluk ve yazı ağırlığıyla ayrılır. Ton basamakları 2b bölümündedir: komşu yüzeyler arasında yumuşak, yaklaşık 1.05-1.10 fark.
- Paneller pencereye kenardan kenara oturur: dış boşluk yok, yuvarlak çerçeve yok, paneller arasında aralık yok. Kenar çubuğu ve ana panel yalnız ton farkıyla ayrılır.
- Girdiler (`.field`) `field` tonuyla doludur. Seçili satır ve kart `chat-active` (vurgunun %12 tonu) alır; seçili segment ve sekme vurgu dolgusudur (`bg-accent` + `text-on-accent`), seçili tema karosu yumuşak tondur (`chat-active` + vurgu renkli ikon + 600 yazı).
- Odak göstergesi tek istisnadır: klavye odağında `outline` (2px, `ink`). Gölgeyle yapılmaz. Kapsayıcı yüzeylerde (yazı kutusu, arama alanları, kartlar) aynı 2px `ink` çerçeve kapsayıcıya `:has(...:focus-visible)` / `focus-within` ile verilir; kenarı kesilen panellerde ofset içe (-2px) alınır.
- Diğer istisnalar: onay kutusu, ok ve yükleniyor dönen halkası gibi çizilen semboller, renk örneğinin seçili işareti (`.swatch`).
- Yarı saydam değerler yalnız `bg-scrim` perdesi ile hover/seçili dolgularıdır (`--color-hover` = ink %5, `--color-chat-active` = vurgu %12, `color-mix`). Panel, cam ve blur yoktur.
- `--color-track` çizgi değil, yumuşak dolgu tonudur (ölçer ve ilerleme rayı, devre dışı gönder düğmesi). Anahtarın kapalı rayı `--color-control` (orta ton, yüzeye karşı en az 3:1) ve topuzu `--color-knob`.

## 2b. Yumuşak ton skalası

- Saf siyah ve saf beyaz yok. Yazı rengi yumuşak kömür: `ink` açıkta `#34383f`, koyuda `#d6d8db`; ana yazı yaklaşık 10-12:1, `muted` 4.5-6.5:1.
- Yüzeyler ılık-nötr ve komşular arasında yaklaşık 1.05-1.10 farklıdır. Açık: `main` #f6f5f1, `sidebar`/`code`/`user` #eeece6, `chip` (kart, menü, modal) #fdfcfa, `field` #e9e6e0. Koyu: `sidebar` #0b0b0b, `main` #101010, `chip` #191919, `field` #202020. Kart `main` üstünde bir tık yükselir.
- Hover düşük oranlı ink dolgusudur, seçili satır vurgunun %12 tonudur; koyu gri dolgu yoktur. Kenar çubuğu satırındaki ikon düğmesi hover'da `bg-track` alır, satır hover'ından ayrışır.
- Yazı olarak kullanılan danger ve pressure renkleri her yüzeyde (hover dahil) en az 4.5:1 olmalıdır. Kontroller (anahtar rayı, seçili segment/sekme/karo) yüzeye karşı en az 3:1, odak halkası 2px `ink`.
- Geçişler 160-180ms `ease`: `base.css` düğme, girdi ve özet için `background-color` ve `color` geçişi verir; `transition-*` yardımcıları bunu ezer.
- Koyu temada `user` (mesaj balonu) `chip`ten ayrışır (#2e2d2b, `chip` #232322'ye 1.14). Vurgu rengi yazı olarak da kullanılabilir: beş vurgunun hepsi açık temada `main`, `sidebar`, `chip`, `field`, hover ve seçili tonu üstünde en az 4.5:1 (açık: coral #9e3f23, amber #815006, green #246a3f, blue #3556b0, violet #6446ba).
- Ayarlar: gruplar `setting-card` (hafif yükselmiş `chip`), grup başlığı `.setting-label` (600, `muted`), gruplar arası 24px (`gap-gutter`), satır başlığı 500, açıklama `muted`.

## 3. Vurgu rengi ve ad-hoc renk

- Tek vurgu rengi `accent` (kullanıcı beş tondan seçer). Ölçülü ve hafif doygunluksuzdur. Yalnız şurada görünür: gönder düğmesi, açık anahtar, logo rozeti, proje simgesi, seçili satırın %12 tonu ve seçili segment/sekme/tema karosu.
- Birincil eylem vurgu değil `bg-primary`. Mesaj balonu vurgu değil `bg-user`. Tehlike: `bg-danger`. Vurgu üstündeki yazı `text-on-accent`, tehlike üstündeki `text-on-danger`: her vurgu seçeneği ve iki tema için kontrast en az 4.5:1 olmalıdır (`theme.css` içindeki `data-accent` kuralları seçeneğe göre ayarlar).
- Sabit paletler (terminal, ANSI, diff, sözdizimi, bağlam ölçer, pencere kapat) `theme.css` içinde adlı token'dır. JSX'te ve diğer CSS'te hex yazılmaz.
- Tek satırlık girdi: JSX'te çıplak `<input>` yazılmaz; `web/src/ui/TextField.tsx` kullanılır (`width="wide"` 16rem, `width="block"` doluluk; arama satırı gibi kapsayıcısı zemini boyayan yerlerde `bare`). Yükseklik `--spacing-field` (36px, dokunmatikte 40px), `field` zemini, kenarlıksız, odakta 2px `ink`. Çok satırlı alan için `ui/Textarea.tsx`.
- Değer düzenleme: sağlayıcı ve model ayarlarında değerler varsayılan olarak okuma satırıdır (`web/src/ui/EditableField.tsx`): `<button>` etiketi veya kalem ikonu tıklanınca `TextField`e döner, Enter/blur kaydeder, Esc iptal eder; gizli değerler (API key) `display` ile maskelenir. Bu alanlar için ayrı Save/onay düğmesi konmaz.
- Ayar satırı düzeni: etiket + alan satırları iki sütunlu grid (`.setting-row:has(...)`, etiket 11rem | alan en çok 28rem), telefonda alt alta; anahtar ve düğme satırları etiket solda, kontrol sağda kalır. Satır dolgusu 10px 16px, grup aralığı `--spacing-group` (16px), model listesi satırları 40px.
- Ayarlar ekranları tek vurgu ve nötr yumuşak skala kullanır: gezinti ve sekme ikonları `muted`, seçili durum vurgu tonu, açık anahtar vurgu; kategori başına renkli çip yoktur. Danger/warn yalnız hata ve yıkıcı eylemde. Vurgu örnekleri yalnız vurgu seçicidedir.
- Sağlayıcı marka istisnası: OpenAI, Groq, Ollama, Gemini, OpenRouter logoları kendi marka renginde gösterilir (ayarlar listesi, sağlayıcı başlığı, model seçici). Renkler yalnız `--color-brand-*` token'larıdır (`theme.css`; açık ve koyu varyant, her yüzeyde işaret >= 3:1; siyah/beyaz markalar `ink` farkında). Marka rengi başka hiçbir yerde kullanılmaz; yeni sağlayıcı eklenirse token ve `ui/provider-icons.tsx` birlikte güncellenir.

## 4. Düğmeler

- JSX: `web/src/ui/button-styles.ts` içindeki `BUTTON.secondary | ghost | primary | danger` ve `ICON_BUTTON*`. Düğmeler ton dolgulu, kenarlıksızdır.
- Sınıf adıyla stillenen düğmelerin ölçüsü yalnız `styles/components.css` içindeki tek kuraldadır.
- Bir görünümde tek dolu (primary) düğme olur.

## 5. Mobil ve dokunmatik

- `max-lg:` ve `hover-none:` davranışı korunur. `hover-none` varyantı `(hover: none), (pointer: coarse)` demektir (`styles/index.css`).
- Satır eylemleri: proje satırında (cihazdan bağımsız) her zaman görünen tek "more" düğmesi vardır; hover ile açılan gizli düğme grubu yoktur, ad satırı daralmaz. Düğme menü açar (yeni sohbet, yeniden adlandır, sil). Sohbet satırı menüsü de aynı kalıptır. Menüler tetikleyicinin altında açılır; altta yer yoksa yukarı çevrilir ve yükseklikleri görünür alanla sınırlanır (`Sidebar.tsx`, `menuUp`). Kabuk kökü `group/shell` adlıdır; adsız `group` kullanan satırlar kabuğun hover/odağına takılmaz. Tailwind `group-hover` yalnız `(hover: hover)` altında çalıştığı için kritik eylemler hover'a bağlanmaz.
- Dokunmatikte (`hover-none`): `ICON_BUTTON*` 36px (`hover-none:size-9`), `BUTTON.*` en az 36px, satırlar en az 44px (proje kartları 56px). Sınıfla stillenen küçük ikon düğmeler (`.icon-button`) 28px görünür, `responsive.css` onlara 44px'lik görünmez dokunma alanı ekler.