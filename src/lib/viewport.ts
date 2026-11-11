interface SearchViewport {
  layoutHeight: number;
  height: number;
  offsetTop: number;
  scale: number;
  focused: boolean;
  landscape: boolean;
}

export function getSearchKeyboardViewport(viewport: SearchViewport) {
  if (!viewport.focused || !viewport.landscape || Math.abs(viewport.scale - 1) > 0.01
    || viewport.layoutHeight - viewport.height < 100) return null;
  return { height: viewport.height, top: viewport.offsetTop };
}
