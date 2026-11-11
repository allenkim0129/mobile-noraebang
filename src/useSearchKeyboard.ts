import { useEffect, useState, type RefObject } from 'react';
import { getSearchKeyboardViewport } from './lib/viewport.js';

export default function useSearchKeyboard(input: RefObject<HTMLInputElement | null>) {
  const [viewport, setViewport] = useState<ReturnType<typeof getSearchKeyboardViewport>>(null);

  useEffect(() => {
    const visual = window.visualViewport;
    if (!visual) return;
    const update = () => {
      const next = getSearchKeyboardViewport({
        layoutHeight: Math.max(window.innerHeight, document.documentElement.clientHeight),
        height: visual.height,
        offsetTop: visual.offsetTop,
        scale: visual.scale,
        focused: document.activeElement === input.current,
        landscape: window.matchMedia('(orientation: landscape) and (min-width: 560px)').matches,
      });
      setViewport((previous) => previous?.height === next?.height && previous?.top === next?.top ? previous : next);
    };
    update();
    visual.addEventListener('resize', update);
    visual.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      visual.removeEventListener('resize', update);
      visual.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, [input]);

  return viewport;
}
