import { useState } from 'react';
import { imageDataUrl, type ImageAttachment } from '../../../shared/images.ts';
import { t } from '../i18n/index.ts';
import { Dialog } from '../ui/Dialog.tsx';
import { IconClose } from '../ui/icons.tsx';

export function PhotoAttachments({ images, onRemove }: { images: ImageAttachment[]; onRemove?: (id: string) => void }) {
  const [selected, setSelected] = useState<ImageAttachment | null>(null);
  if (!images.length) return null;
  return <>
    <div className="photo-attachments">
      {images.map((image) => <div className="photo-attachment" key={image.id}>
        <button type="button" className="photo-preview" aria-label={t('Open photo {0}', { 0: image.name })} title={image.name} onClick={() => setSelected(image)}>
          <img src={imageDataUrl(image)} alt={image.name} loading="lazy" />
        </button>
        {onRemove && <button type="button" className="photo-remove" aria-label={t('Remove photo {0}', { 0: image.name })} onClick={() => onRemove(image.id)}><IconClose /></button>}
      </div>)}
    </div>
    {selected && <Dialog title={selected.name} onClose={() => setSelected(null)}><div className="photo-viewer"><img src={imageDataUrl(selected)} alt={selected.name} /></div></Dialog>}
  </>;
}
