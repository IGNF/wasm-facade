// Made by apigen (react) from the Rust declarations: not to edit

import { useEffect, useMemo } from 'react';
import { Blur, type BlurEvents, type BlurOptionsInit } from './api.ts';

/** A Blur kept while its options are the same, freed after */
export const useBlur = (options: BlurOptionsInit = {}): Blur => {
  const { radius, edge } = options;
  const blur = useMemo(() => new Blur({ radius, edge }), [radius, edge]);

  useEffect(() => () => blur.free(), [blur]);

  return blur;
};

/** Listens to `blur`'s event `type` while mounted */
export const useBlurEvent = <K extends keyof BlurEvents>(
  blur: Blur,
  type: K,
  listener: (payload: BlurEvents[K]) => void,
): void => {
  useEffect(() => blur.on(type, listener), [blur, type, listener]);
};
