import { retryFailedTextureResources, useTextureResourceStatus } from '../scene/textureResources';

const names: Record<string, string> = {
  '2k_earth_nightmap.jpg': '地球夜间灯光',
  '2k_earth_daymap.jpg': '地球地表',
  '2k_earth_clouds.jpg': '地球云层',
  '2k_saturn_ring_alpha.png': '土星环',
};

export function ResourceStatus() {
  const resources = useTextureResourceStatus();
  const failures = resources.filter(item => item.status === 'error');
  if (!failures.length) return null;
  return <aside className="resource-status" role="status" aria-live="polite">
    <strong>部分纹理暂时未能加载</strong>
    <p>已使用基础材质继续探索；缺失的夜间灯光已关闭。</p>
    <p>{failures.map(({ url }) => {
      if (url.startsWith('data:')) return '天体纹理';
      const filename = url.split('/').pop() ?? '';
      return names[filename.replace(/-[a-f0-9]{12}(?=\.)/, '')] ?? filename;
    }).join('、')}</p>
    <button type="button" onClick={() => { void retryFailedTextureResources(); }}>重试纹理</button>
  </aside>;
}
