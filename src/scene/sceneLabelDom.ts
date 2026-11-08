export interface SceneLabelContent {
  text: string;
  subtext?: string;
  color?: string;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

/** One owner for the DOM node and its event listener, including detached nodes. */
export function mountSceneLabel(parent: HTMLElement, { text, subtext, color, className = '', onClick, ariaLabel }: SceneLabelContent) {
  const node = parent.ownerDocument.createElement(onClick ? 'button' : 'div');
  node.className = `projected-label ${className}`;
  node.textContent = text;
  if (color) node.style.color = color;
  if (subtext) {
    const sub = parent.ownerDocument.createElement('small');
    sub.textContent = subtext;
    node.appendChild(sub);
  }
  if (onClick) {
    node.setAttribute('type', 'button');
    node.setAttribute('aria-label', ariaLabel || [text, subtext].filter(Boolean).join(' · '));
    node.addEventListener('click', onClick);
  }
  // Do not briefly expose a label at (0, 0) before its first projection.
  Object.assign(node.style, {
    display: 'none', visibility: 'hidden', position: 'absolute', left: '0', top: '0', zIndex: '2',
    pointerEvents: 'none', whiteSpace: 'nowrap',
  });
  node.setAttribute('aria-hidden', 'true'); node.tabIndex = -1;
  if (onClick) (node as HTMLButtonElement).disabled = true;
  parent.appendChild(node);
  return {
    node,
    dispose() {
      if (onClick) node.removeEventListener('click', onClick);
      node.remove();
    },
  };
}

/** Collision-hidden labels keep their measurement but leave pointer and keyboard navigation. */
export function setSceneLabelVisible(node: HTMLElement, visible: boolean, interactive: boolean) {
  const visibility = visible ? 'visible' : 'hidden';
  if (node.style.display === 'block' && node.style.visibility === visibility) return;
  node.style.display = 'block';
  node.style.visibility = visibility;
  node.style.pointerEvents = visible && interactive ? 'auto' : 'none';
  node.tabIndex = visible && interactive ? 0 : -1;
  if (interactive) (node as HTMLButtonElement).disabled = !visible;
  node.setAttribute('aria-hidden', visible ? 'false' : 'true');
}
