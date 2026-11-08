import { describe, expect, it, vi } from 'vitest';
import { mountSceneLabel, setSceneLabelVisible } from '../src/scene/sceneLabelDom';

// A small DOM stand-in keeps these lifecycle assertions independent of WebGL.
class LabelNode extends EventTarget {
  ownerDocument: { createElement: (tag: string) => LabelNode };
  parent: LabelNode | null = null;
  children: LabelNode[] = [];
  style: Record<string, string> = {};
  attributes: Record<string, string> = {};
  className = '';
  textContent = '';
  tabIndex = -1;
  disabled = false;
  constructor(readonly tagName: string) {
    super();
    this.ownerDocument = { createElement: tag => new LabelNode(tag) };
  }
  appendChild(node: LabelNode) { node.parent = this; this.children.push(node); }
  setAttribute(key: string, value: string) { this.attributes[key] = value; }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
    this.parent = null;
  }
}

describe('projected label DOM lifetime', () => {
  it('removes the clickable node and listener together, and recreates one working label', () => {
    const parent = new LabelNode('div');
    const select = vi.fn();
    const first = mountSceneLabel(parent as unknown as HTMLElement, { text: '太阳核心', onClick: select });
    first.node.dispatchEvent(new Event('click'));
    expect(select).toHaveBeenCalledTimes(1);
    first.dispose();
    expect(parent.children).toHaveLength(0);
    first.node.dispatchEvent(new Event('click'));
    expect(select).toHaveBeenCalledTimes(1);
    const second = mountSceneLabel(parent as unknown as HTMLElement, { text: '太阳核心', onClick: select });
    expect(parent.children).toHaveLength(1);
    second.node.dispatchEvent(new Event('click'));
    expect(select).toHaveBeenCalledTimes(2);
    second.dispose();
  });

  it('starts hidden until projected and keeps passive feature labels non-interactive', () => {
    const parent = new LabelNode('div');
    const label = mountSceneLabel(parent as unknown as HTMLElement, { text: '大红斑', subtext: '示意位置', color: '#f00' });
    const node = parent.children[0];
    expect(node.tagName).toBe('div');
    expect(node.style).toMatchObject({ display: 'none', pointerEvents: 'none', color: '#f00' });
    expect(node.children[0].textContent).toBe('示意位置');
    label.dispose();
    label.dispose();
    expect(parent.children).toHaveLength(0);
  });

  it('removes collision-hidden buttons from pointer, keyboard and accessibility navigation', () => {
    const parent = new LabelNode('div');
    const label = mountSceneLabel(parent as unknown as HTMLElement, { text: '地球', subtext: '辅助定位 · 标记大小非天体直径', onClick: vi.fn() });
    const node = parent.children[0];
    expect(node.attributes['aria-label']).toContain('标记大小非天体直径');
    setSceneLabelVisible(label.node, true, true);
    expect(node.style).toMatchObject({ display: 'block', visibility: 'visible', pointerEvents: 'auto' });
    expect(node.tabIndex).toBe(0); expect(node.attributes['aria-hidden']).toBe('false');
    expect(node.disabled).toBe(false);
    setSceneLabelVisible(label.node, false, true);
    expect(node.style).toMatchObject({ display: 'block', visibility: 'hidden', pointerEvents: 'none' });
    expect(node.tabIndex).toBe(-1); expect(node.attributes['aria-hidden']).toBe('true');
    expect(node.disabled).toBe(true);
    label.dispose(); expect(parent.children).toHaveLength(0);
  });
});
