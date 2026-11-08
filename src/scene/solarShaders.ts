/** Procedural scientific visualization; these shaders do not represent live SDO data. */
export const noiseGLSL = /* glsl */ `
float hash31(vec3 p) {
  p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash31(i),hash31(i+vec3(1,0,0)),f.x),
                 mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x),
                 mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float fbm(vec3 p) {
  float n=0.; float a=.5;
  for(int i=0;i<4;i++){n+=a*noise3(p);p=p*2.03+vec3(1.3,2.8,.4);a*=.5;}
  return n;
}
`;

export const sunVertexShader = /* glsl */ `
varying vec3 vObject;
varying vec3 vWorld;
varying vec3 vWorldNormal;
void main() {
  vObject = normalize(position);
  vec4 world = modelMatrix * vec4(position,1.);
  vWorld = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

export const interiorVertexShader = /* glsl */ `
attribute float cutFace;
varying float vCutFace;
${sunVertexShader.replace('vObject = normalize(position);', 'vObject = position; vCutFace = cutFace;')}
`;

export const sunFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uFlare;
varying vec3 vObject;
varying vec3 vWorld;
varying vec3 vWorldNormal;
${noiseGLSL}
void main() {
  vec3 p = normalize(vObject);
  float t=uTime*.025;
  vec3 drift=vec3(sin(p.y*7.+t),cos(p.z*8.-t),sin(p.x*9.+t*.6))*.12;
  float broad=fbm(p*8.+drift+vec3(t*.1,t*.2,0.));
  float flow=fbm(p*24.+drift*2.+vec3(0.,t*.6,0.));
  float granule=noise3(p*155.+vec3(0.,t*1.5,0.));
  float tiny=noise3(p*330.+drift+vec3(t,0.,0.));
  float cells=pow(smoothstep(.18,.8,granule),.75);
  float n=clamp(broad*.36+flow*.28+cells*.31+tiny*.08,0.,1.);
  vec3 color=mix(vec3(.34,.035,.003),vec3(1.16,.38,.025),smoothstep(.17,.65,n));
  color=mix(color,vec3(1.58,.83,.22),pow(smoothstep(.48,.83,n),2.));
  float spot=0.;
  spot+=smoothstep(.99748,.99964,dot(p,normalize(vec3(.42,.23,.91)))+noise3(p*80.)*.00072);
  spot+=smoothstep(.99856,.99982,dot(p,normalize(vec3(-.32,-.22,.95)))+noise3(p*60.)*.000648);
  spot+=smoothstep(.99892,.999928,dot(p,normalize(vec3(.51,.3,.82)))+noise3(p*80.)*.00036);
  color*=1.-min(spot,.95)*.91;
  float mu=max(0.,dot(normalize(vWorldNormal),normalize(cameraPosition-vWorld)));
  color*=.58+.42*pow(mu,.35);
  float activeMask=pow(max(0.,dot(p,normalize(vec3(-.8,.38,.45)))),80.);
  color+=uFlare*activeMask*vec3(2.,.65,.14);
  gl_FragColor=vec4(color,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const coronaFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uFlare;
uniform float uScale;
uniform float uOpacity;
varying vec3 vObject;
varying vec3 vWorld;
varying vec3 vWorldNormal;
${noiseGLSL}
void main() {
  float mu=abs(dot(normalize(vWorldNormal),normalize(cameraPosition-vWorld)));
  float r=sqrt(max(0.,1.-mu*mu))*uScale;
  float fall=exp(-max(0.,r-1.)*10.5);
  float edge=1.-smoothstep(uScale*.86,uScale,r);
  float a=atan(vObject.y,vObject.x);
  float streamer=.55+.45*fbm(vec3(a*16.,r*7.-uTime*.1,uTime*.04));
  float outside=smoothstep(.95,1.015,r);
  float alpha=fall*edge*outside*streamer*uOpacity;
  vec3 col=mix(vec3(1.,.12,.015),vec3(1.2,.5,.12),fall);
  col+=uFlare*.2;
  gl_FragColor=vec4(col,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const interiorFragmentShader = /* glsl */ `
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
uniform float uBrightness;
uniform float uKind;
varying float vCutFace;
varying vec3 vObject;
varying vec3 vWorld;
varying vec3 vWorldNormal;
${noiseGLSL}
void main(){
  float grain=fbm(vObject*34.+vec3(uTime*.025,0.,0.));
  float rad=length(vObject);
  float rings=.5+.5*sin(rad*82.-uTime*.35);
  float cell=noise3(vObject*24.+vec3(0.,uTime*.06,0.));
  float texture=mix(grain,.65*grain+.35*rings,step(.5,uKind)* (1.-step(1.5,uKind)));
  texture=mix(texture,.5*grain+.5*cell,step(1.5,uKind));
  float facing=.75+.25*abs(dot(normalize(vWorldNormal),normalize(cameraPosition-vWorld)));
  vec3 c=uColor*(.58+texture*.78)*facing*uBrightness;
  // Keep thin atmospheric bands distinct at the cut and allow a glimpse of
  // the underlying photosphere through their curved surfaces.
  float airBand=step(3.5,uKind);
  float surfaceAlpha=mix(1.,.29,airBand);
  float alpha=uOpacity*mix(surfaceAlpha,1.,vCutFace);
  gl_FragColor=vec4(c,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const cutawayCoronaVertexShader = /* glsl */ `
varying vec3 vViewOffset;
${sunVertexShader.replace('vObject = normalize(position);', 'vViewOffset = mat3(modelViewMatrix) * position;')}
`;

export const cutawayCoronaFragmentShader = /* glsl */ `
uniform float uTime;
uniform float uOpacity;
uniform float uInnerRadius;
uniform float uOuterRadius;
varying vec3 vWorld;
varying vec3 vWorldNormal;
varying vec3 vViewOffset;
void main() {
  float mu=abs(dot(normalize(vWorldNormal),normalize(cameraPosition-vWorld)));
  float projectedRadius=sqrt(max(0.,1.-mu*mu))*uOuterRadius;
  float height=(projectedRadius-uInnerRadius)/(uOuterRadius-uInnerRadius);
  if(height<=0.) discard;
  float angle=atan(vViewOffset.y,vViewOffset.x);
  float sweep=angle+height*(.18*sin(angle*3.+.4)+.10*cos(angle*5.));
  float plume=pow(.5+.5*cos(sweep*7.+sin(sweep*3.)*.8),7.);
  float filaments=pow(.5+.5*cos(sweep*41.+sin(sweep*9.)*1.1+height*3.-uTime*.15),3.);
  float root=smoothstep(0.,.055,height);
  float tips=1.-smoothstep(.44,.98,height);
  float fade=exp(-height*3.6)*root*tips;
  float alpha=uOpacity*fade*(.11+plume*(.52+.55*filaments));
  gl_FragColor=vec4(.94,.96,1.,alpha);
  #include <colorspace_fragment>
}
`;
