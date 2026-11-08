import { useMemo, useEffect } from 'react';
import * as THREE from 'three';
export function Space({ quality }: {quality: 'high' | 'low'}) {
  const {geometry, material} = useMemo(() => {
    let seed = 7231;
    const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const count = quality === 'high' ? 3500 : 1200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const theta = random() * Math.PI * 2, y = random() * 2 - 1, r = 1300 + random() * 500;
      const s = Math.sqrt(1 - y * y);
      positions.set([Math.cos(theta) * s * r, y * r, Math.sin(theta) * s * r], i * 3);
      const b = .35 + random() * .55;
      colors.set([b * (.8 + random() * .2), b * (.85 + random() * .15), b], i * 3);
      sizes[i] = random() > .98 ? 2.7 : .65 + random() * 1.2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions,3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors,3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes,1));
    const material = new THREE.ShaderMaterial({vertexShader:`attribute float size;varying vec3 c;void main(){c=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=size;}`,fragmentShader:`varying vec3 c;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;gl_FragColor=vec4(c,pow(1.-d*2.,.8));}`,vertexColors:true,transparent:true,depthWrite:false});
    return {geometry,material};
  }, [quality]);
  useEffect(() => () => {geometry.dispose();material.dispose();}, [geometry,material]);
  return <points name="background-stars" geometry={geometry} material={material} frustumCulled={false}/>;
}
