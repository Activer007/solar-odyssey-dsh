import { createRoot } from 'react-dom/client';
import App from './App';
import styles from './styles.css?inline';

export function mountGame(host: HTMLElement): () => void {
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: 'open' });
  const style = host.ownerDocument.createElement('style');
  style.textContent = styles;
  const container = host.ownerDocument.createElement('div');
  container.style.height = '100%';
  shadow.replaceChildren(style, container);
  const root = createRoot(container);
  root.render(<App />);
  return () => {
    // A DSH React root can be committing the panel removal at this point.
    // Dispose the separate game root after the host commit has returned.
    queueMicrotask(() => {
      root.unmount();
      style.remove();
      container.remove();
    });
  };
}
