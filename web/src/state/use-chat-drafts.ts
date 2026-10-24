import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import type { ImageAttachment } from '../../../shared/images.ts';

const STORAGE_KEY = 'xeck.chat-drafts';

function readDrafts(): Record<string, string> {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    return value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string')) : {};
  } catch { return {}; }
}

export function useChatDrafts(key: string) {
  const [drafts, setDrafts] = useState(readDrafts);
  // Keep photo drafts per conversation, in memory rather than localStorage quotas.
  const [images, setImages] = useState<Record<string, ImageAttachment[]>>({});
  const keyRef = useRef(key);
  keyRef.current = key;
  const setDraft = useCallback((value: SetStateAction<string>) => {
    const target = keyRef.current;
    setDrafts((current) => {
      const next = { ...current };
      const text = typeof value === 'function' ? value(current[target] ?? '') : value;
      if (text) next[target] = text;
      else delete next[target];
      return next;
    });
  }, []);
  const removeDraft = useCallback((target: string) => {
    setDrafts((current) => { const next = { ...current }; delete next[target]; return next; });
    setImages((current) => { const next = { ...current }; delete next[target]; return next; });
  }, []);
  const setDraftImages = useCallback((value: SetStateAction<ImageAttachment[]>) => {
    const target = keyRef.current;
    setImages((current) => {
      const next = { ...current };
      const items = typeof value === 'function' ? value(current[target] ?? []) : value;
      if (items.length) next[target] = items;
      else delete next[target];
      return next;
    });
  }, []);
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)); } catch { /* Drafts remain available in this window when storage is full. */ }
  }, [drafts]);
  return [drafts[key] ?? '', setDraft, removeDraft, images[key] ?? [], setDraftImages] as const;
}
