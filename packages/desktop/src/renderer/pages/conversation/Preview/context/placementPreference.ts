/**
 * @license
 * Copyright 2026 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

export type PreviewPlacement = 'main' | 'sidebar';

const STORAGE_KEY = 'conversation.preview.default-placement';
const CHANGE_EVENT = 'catfish-preview-placement-change';

export const getDefaultPreviewPlacement = (): PreviewPlacement => {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'sidebar' ? 'sidebar' : 'main';
  } catch {
    return 'main';
  }
};

export const setDefaultPreviewPlacement = (placement: PreviewPlacement): void => {
  try {
    localStorage.setItem(STORAGE_KEY, placement);
  } catch {
    // The in-memory event still updates open controls when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent<PreviewPlacement>(CHANGE_EVENT, { detail: placement }));
};

export const useDefaultPreviewPlacement = (): [PreviewPlacement, (placement: PreviewPlacement) => void] => {
  const [placement, setPlacement] = useState<PreviewPlacement>(getDefaultPreviewPlacement);
  useEffect(() => {
    const handleChange = (event: Event): void => {
      const next = (event as CustomEvent<PreviewPlacement>).detail;
      if (next === 'main' || next === 'sidebar') setPlacement(next);
    };
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);
  return [placement, setDefaultPreviewPlacement];
};

export const placementOf = (value: unknown): PreviewPlacement | undefined =>
  value === 'main' || value === 'sidebar' ? value : undefined;
