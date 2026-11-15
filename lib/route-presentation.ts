/** Current mounted DOM only, including the community's open shadow root. */
export function presentationRoots(root: HTMLElement): Array<HTMLElement | ShadowRoot> {
  const roots: Array<HTMLElement | ShadowRoot> = [root];
  for (let index = 0; index < roots.length; index++) {
    for (const element of roots[index].querySelectorAll("*")) if (element.shadowRoot) roots.push(element.shadowRoot);
  }
  return roots;
}

/** Ignore collapsed tabs/dialogs, but retain off-screen and entrance-hidden layout. */
export function participating(element: HTMLElement): boolean {
  if (element.closest('[hidden], .hidden, dialog:not([open])')) return false;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement && !parent.open && !parent.querySelector("summary")?.contains(element)) return false;
  }
  return element.getClientRects().length > 0 && getComputedStyle(element).display !== "none";
}

const boundaries = '[data-route-reveal], header, article, section:not(.home-hero):not(.home-features), aside, form:not(.auth-form), footer, nav, dl, li[data-knowledge-item], .gallery-row, .feature-card, .hero-brand > *, .hero-dots, .scroll-cue, .auth-card > :not(form), .auth-form > *';
const decorations = 'style, script, link, template, .hero-slides, .hero-shade, .back-to-top, [data-route-decoration]';

export function hasPreparingAncestor(element: HTMLElement): boolean {
  let parent: Element | null = element.parentElement;
  if (!parent && element.getRootNode() instanceof ShadowRoot) parent = (element.getRootNode() as ShadowRoot).host;
  while (parent) {
    if (parent.matches('[data-route-phase="preparing"], [data-route-phase="entering"], [data-content-phase="preparing"], [data-content-phase="entering"]')) return true;
    const scope = parent.getRootNode();
    parent = parent.parentElement || (scope instanceof ShadowRoot ? scope.host : null);
  }
  return false;
}

/** Partition into non-overlapping blocks and sort by actual visual rows. */
export function revealGroups(root: HTMLElement): HTMLElement[] {
  const groups: HTMLElement[] = [];
  const visit = (element: Element) => {
    if (!(element instanceof HTMLElement) || element.matches(decorations) || !participating(element)) return;
    if (element.shadowRoot) { Array.from(element.shadowRoot.children).forEach(visit); return; }
    const ownText = Array.from(element.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
    if (element.matches(boundaries) || ownText || !element.children.length) {
      const box = element.getBoundingClientRect();
      if (box.width && box.height) groups.push(element);
    } else Array.from(element.children).forEach(visit);
  };
  Array.from(root.children).forEach(visit);
  return groups.sort((a, b) => {
    const first = a.getBoundingClientRect(), second = b.getBoundingClientRect();
    return Math.abs(first.top - second.top) <= 8 ? first.left - second.left : first.top - second.top;
  });
}
