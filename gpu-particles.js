(function () {
  "use strict";

  const MAX_POINTERS = 4;
  const STATIC_STRIDE_FLOATS = 24;
  const STATIC_STRIDE_BYTES = STATIC_STRIDE_FLOATS * 4;

  const PHYSICS_VERTEX = `#version 300 es
precision highp float;
precision highp int;
layout(location=0) in vec3 aDisplacement;
layout(location=1) in vec3 aVelocity;
layout(location=2) in vec4 aMeta;
layout(location=4) in vec4 aMotion;
uniform float uDt;
uniform float uTime;
uniform float uHeight;
uniform uint uStep;
out vec3 vDisplacement;
out vec3 vVelocity;

uint scramble(uint x) {
  x^=x>>16u; x*=0x7feb352du; x^=x>>15u;
  x*=0x846ca68bu; return x^(x>>16u);
}
float randomUnit(uint seed) {
  return (float(scramble(seed)>>8u)+.5)/16777216.;
}
vec3 gaussian(uint seed) {
  vec2 radii=sqrt(-2.*log(max(vec2(randomUnit(seed),randomUnit(seed+2u)),vec2(1e-7))));
  vec2 angles=6.28318530718*vec2(randomUnit(seed+1u),randomUnit(seed+3u));
  return vec3(radii.x*cos(angles.x),radii.x*sin(angles.x),radii.y*cos(angles.y));
}
void reflectAxis(inout float q,inout float v,float bound) {
  if(q>=-bound&&q<=bound)return;
  float travel=mod(q+bound,4.*bound);
  bool flipped=travel>2.*bound;
  q=-bound+(flipped?4.*bound-travel:travel);
  v*=flipped?-.82:.82;
}
void main() {
  // Temporary drag/burst particles do not need the membrane integrator.
  if(aMeta.w>.5) {
    vDisplacement=aDisplacement;
    vVelocity=aVelocity;
    gl_Position=vec4(0.);
    return;
  }
  uint id=uint(gl_VertexID);
  float mobility=mix(.75,1.30,randomUnit(id+81721u));
  vec3 omega=vec3(2.8,3.2,6.0);
  vec3 gamma=vec3(2.5,2.8,5.0);
  vec3 rms=vec3(2.8,2.3,1.5)*mobility;
  vec3 spring=omega*omega;
  vec3 q=aDisplacement;
  vec3 v=aVelocity;
  float h=uDt;
  float scale=max(160.,uHeight*.46);
  float a=2.2*aMeta.x+.20*uTime;
  float b=2.7*aMeta.y-.15*uTime;
  vec3 eddy=vec3(.0025*2.7*sin(a)*cos(b)*scale,-.0025*2.2*cos(a)*sin(b)*scale,0.);
  v-=.5*h*spring*q;
  q+=.5*h*v;
  vec3 damping=exp(-gamma*h);
  uint seed=id*747796405u+(uStep+1u)*2891336453u+uint(max(0.,aMotion.x)*104729.);
  v=damping*v+(1.-damping)*eddy
    +sqrt(max(vec3(0.),1.-damping*damping))*(omega*rms)*gaussian(seed);
  q+=.5*h*v;
  v-=.5*h*spring*q;
  vec3 bounds=4.5*rms;
  reflectAxis(q.x,v.x,bounds.x);
  reflectAxis(q.y,v.y,bounds.y);
  reflectAxis(q.z,v.z,bounds.z);
  vDisplacement=q;
  vVelocity=v;
  gl_Position=vec4(0.);
}`;

  const PHYSICS_FRAGMENT = `#version 300 es
precision lowp float;
out vec4 fragColor;
void main(){fragColor=vec4(0.);}`;

  const PARTICLE_VERTEX = `#version 300 es
precision highp float;
layout(location=0) in vec3 aDisplacement;
layout(location=1) in vec3 aPhysicsVelocity;
layout(location=2) in vec4 aMeta;
layout(location=3) in vec4 aColorSize;
layout(location=4) in vec4 aMotion;
layout(location=5) in vec3 aInitial;
layout(location=6) in vec3 aInitialVelocity;
layout(location=7) in vec4 aOrbit;
layout(location=8) in vec2 aRollLife;

uniform vec2 uViewport;
uniform float uDpr;
uniform float uTime;
uniform float uNow;
uniform int uMode;
uniform float uMixProgress;
uniform float uMixElapsed;
uniform float uResultAge;
uniform vec3 uFinalColor;
uniform vec4 uMixSettings;
uniform float uMixClusterRadius;
uniform float uSceneRoll;
uniform vec2 uDragPoint;
uniform float uHasDrag;
uniform vec4 uPointers[4];
uniform vec2 uVelocities[4];
uniform vec4 uWaves[4];
uniform vec4 uVisual;
uniform float uPointMax;

out vec3 vColor;
out float vAlpha;
out float vCore;
out float vSparkle;

float smooth01(float x){x=clamp(x,0.,1.);return x*x*(3.-2.*x);}
float smoothRange(float lo,float hi,float x){return smooth01((x-lo)/max(.0001,hi-lo));}

vec3 sheet(vec2 uv,float layer,float phaseSeed) {
  float s=mod(layer,3.)*.48*2.34;
  float ph=4.6*uv.x+2.3*sin(4.4*uv.y+.34*uTime+s)-.48*uTime+s;
  float w=.67+.18*sin(4.3*uv.y-.28*uTime+s);
  vec3 p=vec3(
    w*(uv.x+.90*sin(ph))+.35*sin(6.5*uv.y+.30*uTime+s),
    1.85*uv.y+.30*sin(ph+2.3*uv.y)+.42*sin(5.7*uv.y+2.3*uv.x-.35*uTime+s),
    .62*cos(ph)+.35*sin(5.3*uv.y-1.3*uv.x+.29*uTime+s)
  );
  p.x+=.24*sin(8.4*uv.y-1.5*uv.x+.23*uTime+s);
  p.y+=.18*sin(4.4*uv.y+2.5*uv.x-.24*uTime+s);
  p.z+=.12*sin(7.*uv.x+5.*uv.y+.19*uTime+s);
  p+=.012*vec3(sin(29.*uv.x+11.*uv.y+.4*uTime),sin(17.*uv.x-23.*uv.y-.3*uTime),sin(21.*uv.x+19.*uv.y+.2*uTime));
  float angle=.18*sin(.13*uTime)+mod(layer,3.)*.48*.37;
  p.xz=mat2(cos(angle),-sin(angle),sin(angle),cos(angle))*p.xz;
  // The carrier origin is the exact viewport centre. Avoid a fixed vertical
  // shift because the following scale makes it resolution-dependent.
  p.x+=mod(layer,3.)*.48*.28;
  p.z-=mod(layer,3.)*.48*.38;
  float depth=max(3.7,5.1-p.z);
  float scale=max(150.,uViewport.y*.44)*2.34/depth;
  float breathing=1.+sin(uTime*.19+phaseSeed)*.018;
  return vec3(p.x*scale*breathing,p.y*scale*breathing,p.z*scale*.72);
}

vec3 interaction(vec3 carrier,out float excitation) {
  vec2 pull=vec2(0.);
  float weightSum=0.;
  float rippleLight=0.;
  for(int i=0;i<4;i++) {
    vec4 pointer=uPointers[i];
    if(pointer.z<.001)continue;
    vec2 offset=carrier.xy-pointer.xy;
    float radius=285.*(.92+pointer.z*.46);
    float kernel=exp(-dot(offset,offset)/(radius*radius));
    float weight=pointer.z*kernel;
    vec2 velocity=uVelocities[i];
    velocity*=min(1.,1450./max(length(velocity),1.));
    float turn=clamp((velocity.x*offset.y-velocity.y*offset.x)/max(1.,radius*radius),-2.,2.);
    pull+=weight*(-offset+.034*velocity+turn*.075*vec2(-offset.y,offset.x));
    weightSum+=weight;
  }
  carrier.xy+=pull/max(1.,weightSum/.78);
  for(int i=0;i<4;i++) {
    vec4 wave=uWaves[i];
    if(wave.w<.001||wave.z<0.||wave.z>=1.5)continue;
    vec2 offset=carrier.xy-wave.xy;
    float distance=max(1.,length(offset));
    float front=(distance-42.-wave.z*520.)/82.;
    float ring=exp(-front*front)*exp(-wave.z*2.7)*wave.w;
    carrier.xy+=offset/distance*ring*46.;
    rippleLight+=ring;
  }
  excitation=min(1.,weightSum*.42+rippleLight*.55);
  carrier.z+=excitation*26.*sin(aMotion.y+uTime*2.);
  return carrier;
}

vec3 projectedOrbit(float angle,float radius,float roll,float tilt) {
  float x=cos(angle)*radius;
  float y=sin(angle)*radius*cos(tilt);
  float z=sin(angle)*radius*sin(tilt);
  float c=cos(roll),s=sin(roll);
  return vec3(x*c-y*s,x*s*.72+y*c*.72+z*.32,z+sin(angle+roll)*18.);
}

vec2 rotate2D(vec2 point,float angle) {
  float c=cos(angle),s=sin(angle);
  return vec2(point.x*c-point.y*s,point.x*s+point.y*c);
}

vec3 alchemyDroplet() {
  float vertical=clamp(aMeta.y,-.98,.98);
  float randomRadius=fract(aMotion.x*.754877666+aMotion.y*.159154943);
  float randomAngle=fract(aMotion.x*.569840296+aMotion.y*.438289);
  float radius=max(42.,uMixClusterRadius);
  float shell=sqrt(max(0.,1.-vertical*vertical));
  float fill=sqrt(randomRadius);
  // A slightly narrower top makes the final cluster read as a suspended drop,
  // not as another orbit. It is time-independent so result mode starts on the
  // exact final mixing frame.
  float taper=mix(1.08,.78,smooth01(vertical*.5+.5));
  float crossRadius=radius*shell*fill*taper;
  float angle=6.28318530718*randomAngle+aMeta.x*.72;
  return vec3(
    cos(angle)*crossRadius,
    vertical*radius*1.38,
    sin(angle)*crossRadius*.72
  );
}

vec3 mixingPosition(vec3 startPosition) {
  float progress=clamp(uMixProgress,0.,1.);
  float layer=floor(mod(aMeta.z,3.)+.5);
  float groupAngle=uSceneRoll+layer*2.09439510239;
  float along=clamp(aMeta.y*.5+.5,0.,1.);
  float scale=max(220.,min(uViewport.x,uViewport.y)*.45);

  // Act I: three ingredients gather into equal curved streams entering the
  // vessel 120 degrees apart. aMeta.x is the ribbon width, aMeta.y its length.
  float entryEnergy=smoothRange(.04,.27,progress);
  float entrySpin=uMixElapsed*(.18+.72*entryEnergy);
  float sinAlong=sin(along*3.14159265359);
  float entryAngle=groupAngle+entrySpin+.62*sinAlong;
  float entryRadius=mix(scale*1.12,scale*.24,along)*mix(1.,.82,entryEnergy);
  float ribbonWidth=aMeta.x*scale*.082*(.58+.42*sinAlong);
  vec2 entryDirection=vec2(cos(entryAngle),sin(entryAngle));
  vec2 entryTangent=vec2(-entryDirection.y,entryDirection.x);
  vec2 entryPlane=entryDirection*entryRadius+entryTangent*ribbonWidth;
  vec3 entry=vec3(
    entryPlane.x,
    entryPlane.y*.76,
    (aMeta.x*.40+sin(along*6.28318530718+groupAngle)*.22)*scale*.58
  );

  // Act II: a three-strand volumetric braid. The later double-gyre offset is a
  // divergence-free flow approximation: it exchanges layers without pairwise
  // particle collisions or another render pass.
  float braidEnergy=smoothRange(.18,.72,progress);
  float peakRate=clamp(uMixSettings.y*.32,1.55,2.65);
  float spinRate=mix(max(.38,uMixSettings.x),peakRate,smooth01(braidEnergy));
  float spin=uMixElapsed*spinRate+braidEnergy*braidEnergy*.34;
  float exchange=smoothRange(.56,.79,progress);
  float strandPhase=groupAngle+aMeta.y*2.55+spin;
  float strandRadius=scale*mix(.46,.27,exchange);
  float strandWidth=aMeta.x*scale*.072*(.76+.24*cos(strandPhase*2.+aMotion.y));
  float axial=aMeta.y*scale*.55*(1.-exchange*.34);
  float strandCos=cos(strandPhase);
  float strandSin=sin(strandPhase);
  vec3 braid=vec3(
    strandCos*(strandRadius+strandWidth),
    axial+strandSin*strandRadius*.38+strandCos*strandWidth*.44,
    strandSin*(strandRadius*.78+strandWidth)+strandCos*aMeta.x*scale*.034
  );
  braid.xy=rotate2D(braid.xy,.16*sin(uSceneRoll));
  float gyreA=braid.y/scale*3.2+spin*.34;
  float gyreB=braid.x/scale*2.7-spin*.21;
  vec2 gyre=vec2(sin(gyreA)*cos(gyreB),-cos(gyreA)*sin(gyreB));
  braid.xy+=gyre*(exchange*scale*.11);
  braid.z+=exchange*sin((braid.x+braid.y)/scale*4.+spin)*scale*.075;

  vec3 choreography=mix(entry,braid,smoothRange(.18,.36,progress));

  // Act III: damped radial collapse. A single pressure pulse replaces the old
  // high-frequency jitter and resolves into the deterministic result droplet.
  float collapseStart=clamp(uMixSettings.z,.64,.82);
  float collapse=smoothRange(collapseStart,.94,progress);
  float breathPhase=smoothRange(.90,1.,progress);
  float breath=1.+sin(breathPhase*3.14159265359)*.10;
  vec3 droplet=alchemyDroplet()*breath;
  choreography=mix(choreography,droplet,collapse);

  return mix(startPosition,choreography,smoothRange(.01,.14,progress));
}

float carrierAlpha(vec2 uv) {
  float edgeX=1.-smoothRange(.78,1.,abs(uv.x));
  float edgeY=1.-smoothRange(.82,1.,abs(uv.y));
  float holes=.24+.76*smoothRange(-.72,.52,sin(uv.y*6.8+uv.x*4.2+uTime*.15)+.35*sin(uv.x*11.-uv.y*3.));
  return clamp((.08+.84*edgeX*edgeY*holes)*aMotion.w,0.,.98);
}

void main() {
  float kind=aMeta.w;
  float age=max(0.,uNow-aMotion.z);
  vec3 position=aInitial;
  float alpha=aMotion.w;
  float excitation=0.;
  vec3 color=aColorSize.rgb;

  if(kind<.5) {
    vec2 uv=aMeta.xy;
    if(uMode==1) {
      float mixAlpha=clamp((aMotion.w*.94+.08)*1.28+.08,0.,1.);
      if(uMixProgress<.14) {
        // Begin at the actual GPU carrier rather than the stale CPU position.
        // After the shared .14 blend the expensive sheet is skipped entirely.
        vec3 startCarrier=sheet(uv,aMeta.z,aMotion.y)+aDisplacement;
        float startBlend=smoothRange(.01,.14,uMixProgress);
        position=mixingPosition(startCarrier);
        alpha=mix(carrierAlpha(uv),mixAlpha,startBlend);
      } else {
        position=mixingPosition(aInitial);
        alpha=mixAlpha;
      }
      color=mix(color,uFinalColor,smoothRange(.54,.92,uMixProgress));
    } else {
      vec3 carrier=sheet(uv,aMeta.z,aMotion.y)+aDisplacement;
      carrier=interaction(carrier,excitation);
      float entry=smooth01((age-1.8)/2.2);
      position=mix(aInitial,carrier,entry);
      alpha=carrierAlpha(uv);
      if(uMode==2) {
        float resultOpen=smooth01(uResultAge/1.75);
        vec3 cluster=alchemyDroplet();
        float mixAlpha=clamp((aMotion.w*.94+.08)*1.28+.08,0.,1.);
        position=mix(cluster,carrier,resultOpen);
        color=uFinalColor;
        alpha=mix(mixAlpha,min(.98,alpha*1.22+.06),resultOpen);
      }
    }
  } else if(kind<1.5) {
    if(uHasDrag<.5)alpha=0.;
    float angle=aOrbit.x+aOrbit.z*age*60.;
    position=vec3(uDragPoint,0.)+projectedOrbit(angle,aOrbit.y,aRollLife.x,aOrbit.w);
    alpha*=.86;
  } else {
    float frames=age*60.;
    float damping=pow(.965,frames);
    float travel=(1.-damping)/(1.-.965);
    position=aInitial+aInitialVelocity*travel;
    alpha*=pow(.988,frames);
    if(age>aRollLife.y)alpha=0.;
  }

  float depth=clamp(1.+position.z*.0008,.62,1.42);
  vec2 screen=vec2(uViewport.x*.5+position.x*(1.+position.z*.00016),uViewport.y*.5-position.y*(1.+position.z*.00016)+position.z*.035);
  vec2 clip=vec2(screen.x/uViewport.x*2.-1.,1.-screen.y/uViewport.y*2.);
  gl_Position=vec4(clip,0.,1.);
  float pulse=1.+sin(uTime*2.+aMotion.y)*.16;
  float radius=max(1.15,uVisual.y*uVisual.x*depth*(aColorSize.w/10.)*pulse*uVisual.w);
  gl_PointSize=clamp(radius*2.*uDpr,2.,uPointMax);
  float luminance=dot(color,vec3(.2126,.7152,.0722));
  vec3 saturated=clamp(mix(vec3(luminance),color,1.32),0.,1.);
  vec3 luminous=1.-(1.-saturated)*.90;
  vColor=mix(luminous,vec3(1.,.78,.36),excitation*.24);
  vAlpha=alpha*uVisual.z*(1.+excitation*.28)*mix(.90,1.14,clamp((depth-.62)/.80,0.,1.));
  vCore=max(.17,min(.48,uVisual.x*7.5));
  float sparkleMask=step(.86,fract(aMotion.x*.75487766));
  vSparkle=sparkleMask*(.68+.32*sin(uTime*2.6+aMotion.y*5.));
  if(alpha<=.001||screen.x<-40.||screen.x>uViewport.x+40.||screen.y<-40.||screen.y>uViewport.y+40.)gl_Position=vec4(2.,2.,0.,1.);
}`;

  const PARTICLE_FRAGMENT = `#version 300 es
precision mediump float;
in vec3 vColor;
in float vAlpha;
in float vCore;
in float vSparkle;
out vec4 fragColor;
void main(){
  vec2 q=(gl_PointCoord-.5)*2.;
  float r2=dot(q,q);
  if(r2>1.)discard;
  float glow=1.-r2;
  glow*=glow;
  float r=sqrt(r2);
  float core=1.-smoothstep(vCore,min(1.,vCore+.24),r);
  float pin=1.-smoothstep(0.,max(.08,vCore*.48),r);
  float rayX=max(0.,1.-abs(q.x)*8.);
  float rayY=max(0.,1.-abs(q.y)*8.);
  float sparkle=(rayX*rayX+rayY*rayY)*(1.-r)*vSparkle;
  float intensity=(glow*.58+core*.92+pin*.54+sparkle*.20)*vAlpha;
  float alpha=clamp(intensity,0.,1.);
  vec3 color=mix(vColor,vec3(1.,.96,.84),clamp(core*.34+pin*.28,0.,.62));
  fragColor=vec4(color*alpha,alpha);
}`;

  const AURA_VERTEX = `#version 300 es
precision lowp float;
out vec2 vUv;
void main(){
  vec2 p=vec2(float((gl_VertexID<<1)&2),float(gl_VertexID&2));
  vUv=p;
  gl_Position=vec4(p*2.-1.,0.,1.);
}`;

  const AURA_FRAGMENT = `#version 300 es
precision mediump float;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform float uTime;
uniform float uStrength;
in vec2 vUv;
out vec4 fragColor;
void main(){
  vec2 p=(vUv-.5)*vec2(uResolution.x/uResolution.y,1.);
  float radial=max(0.,1.-dot(p,p)*5.5225);
  float glow=radial*radial;
  glow=glow*glow*uStrength;
  float alpha=clamp(glow,0.,.30);
  vec3 tint=mix(uColor,vec3(1.,.78,.36),.08);
  fragColor=vec4(tint*alpha,alpha);
}`;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function compileShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
      gl.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  function createProgram(gl, vertex, fragment, varyings) {
    const program = gl.createProgram();
    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertex);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    if (varyings) gl.transformFeedbackVaryings(program, varyings, gl.INTERLEAVED_ATTRIBS);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const message = gl.getProgramInfoLog(program) || "Program link failed";
      gl.deleteProgram(program);
      throw new Error(message);
    }
    return program;
  }

  function rendererName(gl) {
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return extension
      ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) || gl.getParameter(gl.RENDERER) || "unknown")
      : String(gl.getParameter(gl.RENDERER) || "unknown");
  }

  function isSoftwareRenderer(name) {
    return /swiftshader|llvmpipe|software rasterizer|softpipe|microsoft basic render|\bwarp\b|gdi generic/i.test(name);
  }

  function isGenericRenderer(name) {
    return /^(?:unknown|webgl|webkit webgl)$/i.test(String(name || "").trim());
  }

  function isVeryLowRenderer(name) {
    // GT 730 exists in both 384-core Kepler and much slower 96-core Fermi
    // variants, and the WebGL renderer string does not identify which one is
    // installed. Start the whole GT 710-730 family in the guaranteed profile.
    return /geforce[^0-9]*gt\s*(?:710|720|730)\b/i.test(String(name || ""));
  }

  function isLegacyRenderer(name) {
    const nvidia = name.match(/(?:geforce|quadro)[^0-9]*(?:gtx|gt|k|m)?\s*(\d{3,4})/i);
    if (nvidia) {
      const model = Number(nvidia[1]);
      if (model >= 400 && model < 1000) return true;
    }
    return /intel(?:\(r\))?\s+(?:hd|uhd)\s+graphics\s+(?:[2-6]\d{2,3})|radeon\s+(?:hd|r[5-9])/i.test(name);
  }

  class AromaGpuParticles {
    static probe() {
      const probeCanvas = document.createElement("canvas");
      const gl = probeCanvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true
      });
      if (!gl) return { supported: false, reason: "WebGL2 unavailable" };
      const renderer = rendererName(gl);
      const software = isSoftwareRenderer(renderer);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      return {
        supported: !software,
        renderer,
        software,
        legacy: isLegacyRenderer(renderer),
        veryLow: isVeryLowRenderer(renderer),
        reason: software ? "software renderer" : ""
      };
    }

    constructor(canvas, config, probe = {}) {
      this.canvas = canvas;
      this.config = config;
      this.gl = canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: true
      });
      if (!this.gl) throw new Error("WebGL2 context unavailable");
      this.renderer = rendererName(this.gl);
      if (isSoftwareRenderer(this.renderer)) throw new Error(`Software WebGL renderer rejected: ${this.renderer}`);
      this.profile = probe.forcedProfile
        || (probe.veryLow || isVeryLowRenderer(this.renderer)
          ? "safe"
          : (probe.legacy || isLegacyRenderer(this.renderer) || isGenericRenderer(this.renderer) ? "low" : "balanced"));
      this.profileLocked = Boolean(probe.forcedProfile);
      this.targetFps = this.profile === "balanced" ? 60 : 30;
      this.renderScale = this.profile === "safe" ? .68 : (this.profile === "low" ? 1 : 1.15);
      this.pointScale = this.profile === "safe" ? .76 : (this.profile === "low" ? .96 : 1.05);
      this.count = 0;
      this.currentState = 0;
      this.accumulator = 0;
      this.step = 0;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.sampleCount = 0;
      this.slowCount = 0;
      this.frameMsTotal = 0;
      this.slowWindows = 0;
      this.performanceFailureTriggered = false;
      this.lastSimulationPasses = 0;
      this.lastVisualDrawCalls = 0;
      this.contextLost = false;
      this.onContextLost = null;
      this.onPerformanceFailure = null;
      this.onProfileChange = null;
      this.setup();
      this.maxPointSize = this.gl.getParameter(this.gl.ALIASED_POINT_SIZE_RANGE)[1];
      canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.contextLost = true;
        this.onContextLost?.();
      });
    }

    setup() {
      const gl = this.gl;
      this.physicsProgram = createProgram(gl, PHYSICS_VERTEX, PHYSICS_FRAGMENT, ["vDisplacement", "vVelocity"]);
      this.particleProgram = createProgram(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
      this.auraProgram = createProgram(gl, AURA_VERTEX, AURA_FRAGMENT);
      this.physicsUniforms = this.uniforms(this.physicsProgram, ["uDt", "uTime", "uHeight", "uStep"]);
      this.particleUniforms = this.uniforms(this.particleProgram, [
        "uViewport", "uDpr", "uTime", "uNow", "uMode", "uMixProgress", "uMixElapsed", "uResultAge",
        "uFinalColor", "uMixSettings", "uMixClusterRadius", "uSceneRoll", "uDragPoint", "uHasDrag",
        "uPointers[0]", "uVelocities[0]", "uWaves[0]", "uVisual", "uPointMax"
      ]);
      this.auraUniforms = this.uniforms(this.auraProgram, ["uResolution", "uColor", "uTime", "uStrength"]);
      this.staticBuffer = gl.createBuffer();
      this.stateBuffers = [gl.createBuffer(), gl.createBuffer()];
      this.physicsVaos = [gl.createVertexArray(), gl.createVertexArray()];
      this.renderVaos = [gl.createVertexArray(), gl.createVertexArray()];
      this.transformFeedback = gl.createTransformFeedback();
      this.emptyVao = gl.createVertexArray();
      this.configureVaos();
    }

    uniforms(program, names) {
      const result = {};
      names.forEach((name) => { result[name] = this.gl.getUniformLocation(program, name); });
      return result;
    }

    configureVaos() {
      const gl = this.gl;
      for (let index = 0; index < 2; index += 1) {
        gl.bindVertexArray(this.physicsVaos[index]);
        this.bindStateAttributes(this.stateBuffers[index]);
        this.bindStaticAttribute(2, 4, 0);
        this.bindStaticAttribute(4, 4, 8);

        gl.bindVertexArray(this.renderVaos[index]);
        this.bindStateAttributes(this.stateBuffers[index]);
        this.bindStaticAttribute(2, 4, 0);
        this.bindStaticAttribute(3, 4, 4);
        this.bindStaticAttribute(4, 4, 8);
        this.bindStaticAttribute(5, 3, 12);
        this.bindStaticAttribute(6, 3, 15);
        this.bindStaticAttribute(7, 4, 18);
        this.bindStaticAttribute(8, 2, 22);
      }
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
    }

    bindStateAttributes(buffer) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    }

    bindStaticAttribute(location, size, offsetFloats) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuffer);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, STATIC_STRIDE_BYTES, offsetFloats * 4);
    }

    setParticles(particles) {
      if (this.contextLost) return;
      const gl = this.gl;
      this.count = particles.length;
      const data = new Float32Array(this.count * STATIC_STRIDE_FLOATS);
      const state = new Float32Array(this.count * 6);
      const now = performance.now() * .001;
      particles.forEach((particle, index) => {
        const offset = index * STATIC_STRIDE_FLOATS;
        const flow = particle.flowU !== undefined;
        const kind = flow ? 0 : (particle.isDragPreview ? 1 : 2);
        const color = particle.baseColor || particle.color || { r: 247, g: 216, b: 141 };
        const position = particle.position || { x: 0, y: 0, z: 0 };
        const velocity = particle.velocity || { x: 0, y: 0, z: 0 };
        data.set([
          Number(particle.flowU || 0), Number(particle.flowV || 0), Number(particle.flowLayer || 0), kind,
          color.r / 255, color.g / 255, color.b / 255, Number(particle.size || 10),
          Number(particle.seed || 0), Number(particle.phase || 0), Number(particle.birthTime ? particle.birthTime * .001 : now), Number(particle.alpha ?? .8),
          Number(position.x || 0), Number(position.y || 0), Number(position.z || 0),
          Number(velocity.x || 0), Number(velocity.y || 0), Number(velocity.z || 0),
          Number(particle.orbitAngle || 0), Number(particle.orbitRadius || 1), Number(particle.orbitSpeed || 0), Number(particle.tilt || 0),
          Number(particle.roll || 0), Number.isFinite(particle.life) ? Math.max(0, particle.life / 60) : 1000000
        ], offset);
        const stateOffset = index * 6;
        const displacement = particle.flowDisplacement || { x: 0, y: 0, z: 0 };
        const physicsVelocity = particle.flowVelocity || { x: 0, y: 0, z: 0 };
        state.set([
          displacement.x || 0, displacement.y || 0, displacement.z || 0,
          physicsVelocity.x || 0, physicsVelocity.y || 0, physicsVelocity.z || 0
        ], stateOffset);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, this.staticBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      this.stateBuffers.forEach((buffer) => {
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, state, gl.DYNAMIC_COPY);
      });
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      this.currentState = 0;
      this.accumulator = 0;
      this.step = 0;
      if (!this.count) this.clear();
    }

    resize(cssWidth, cssHeight) {
      const gl = this.gl;
      const dprCap = this.profile === "balanced" ? 1.25 : 1;
      const maxSide = this.profile === "safe" ? 1440 : (this.profile === "low" ? 1920 : 2560);
      const requestedDpr = Math.min(window.devicePixelRatio || 1, dprCap) * this.renderScale;
      const scale = Math.min(1, maxSide / Math.max(1, cssWidth * requestedDpr, cssHeight * requestedDpr));
      const dpr = Math.max(.25, requestedDpr * scale);
      const width = Math.max(1, Math.round(cssWidth * dpr));
      const height = Math.max(1, Math.round(cssHeight * dpr));
      if (width === this.width && height === this.height && Math.abs(dpr - this.dpr) < .001) return;
      this.width = width;
      this.height = height;
      this.dpr = dpr;
      this.canvas.width = width;
      this.canvas.height = height;
      this.canvas.style.width = `${cssWidth}px`;
      this.canvas.style.height = `${cssHeight}px`;
      gl.viewport(0, 0, width, height);
    }

    advancePhysics(deltaSeconds, time) {
      this.lastSimulationPasses = 0;
      if (!this.count || deltaSeconds <= 0) return;
      const gl = this.gl;
      const fixedStep = this.profile === "balanced" ? 1 / 60 : 1 / 30;
      this.accumulator = Math.min(this.accumulator + deltaSeconds, fixedStep * 3);
      if (this.accumulator + 1e-8 < fixedStep) return;
      gl.useProgram(this.physicsProgram);
      gl.uniform1f(this.physicsUniforms.uDt, fixedStep);
      gl.uniform1f(this.physicsUniforms.uHeight, this.height / this.dpr);
      gl.enable(gl.RASTERIZER_DISCARD);
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, this.transformFeedback);
      while (this.accumulator + 1e-8 >= fixedStep) {
        const next = 1 - this.currentState;
        gl.uniform1f(this.physicsUniforms.uTime, time - this.accumulator);
        gl.uniform1ui(this.physicsUniforms.uStep, this.step++);
        gl.bindVertexArray(this.physicsVaos[this.currentState]);
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, this.stateBuffers[next]);
        gl.beginTransformFeedback(gl.POINTS);
        gl.drawArrays(gl.POINTS, 0, this.count);
        this.lastSimulationPasses += 1;
        gl.endTransformFeedback();
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
        this.currentState = next;
        this.accumulator = Math.max(0, this.accumulator - fixedStep);
      }
      gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, null);
      gl.disable(gl.RASTERIZER_DISCARD);
    }

    draw(state) {
      if (this.contextLost) return;
      const gl = this.gl;
      const time = state.time || 0;
      if (state.mode === 1) {
        // The alchemical braid is an analytic flow field, so the Brownian
        // membrane pass would do work whose output is not visible.
        this.accumulator = 0;
        this.lastSimulationPasses = 0;
      } else {
        this.advancePhysics(state.deltaSeconds || 0, time);
      }
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.disable(gl.DEPTH_TEST);
      this.lastVisualDrawCalls = 0;

      if (state.auraVisible || state.mode !== 0) {
        this.drawAura(state);
        this.lastVisualDrawCalls += 1;
      }
      if (!this.count) return;

      const uniforms = this.particleUniforms;
      gl.useProgram(this.particleProgram);
      gl.bindVertexArray(this.renderVaos[this.currentState]);
      gl.uniform2f(uniforms.uViewport, state.width, state.height);
      gl.uniform1f(uniforms.uDpr, this.dpr);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform1f(uniforms.uNow, state.nowSeconds);
      gl.uniform1i(uniforms.uMode, state.mode);
      gl.uniform1f(uniforms.uMixProgress, state.mixProgress);
      gl.uniform1f(uniforms.uMixElapsed, state.mixElapsed);
      gl.uniform1f(uniforms.uResultAge, state.resultAge);
      gl.uniform3f(uniforms.uFinalColor, state.finalColor.r / 255, state.finalColor.g / 255, state.finalColor.b / 255);
      gl.uniform4f(uniforms.uMixSettings, state.mix.speedStart, state.mix.speedPeak, state.mix.collapseStart, state.mixDuration);
      gl.uniform1f(uniforms.uMixClusterRadius, state.mix.clusterRadius);
      gl.uniform1f(uniforms.uSceneRoll, state.sceneRoll);
      gl.uniform2f(uniforms.uDragPoint, state.dragPoint.x, state.dragPoint.y);
      gl.uniform1f(uniforms.uHasDrag, state.hasDrag ? 1 : 0);
      gl.uniform4fv(uniforms["uPointers[0]"], state.pointers);
      gl.uniform2fv(uniforms["uVelocities[0]"], state.velocities);
      gl.uniform4fv(uniforms["uWaves[0]"], state.waves);
      gl.uniform4f(
        uniforms.uVisual,
        state.visual.particleSizeScale,
        state.mode ? state.visual.mixGlowSize : state.visual.baseGlowSize,
        state.mode ? 1.48 : state.visual.brightness,
        this.pointScale
      );
      const profilePointCap = this.profile === "safe" ? 12 : (this.profile === "low" ? 16 : 24);
      gl.uniform1f(uniforms.uPointMax, Math.min(this.maxPointSize, profilePointCap));
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArrays(gl.POINTS, 0, this.count);
      this.lastVisualDrawCalls += 1;
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    drawAura(state) {
      const gl = this.gl;
      const uniforms = this.auraUniforms;
      const resultT = clamp(state.resultAge / 1.75, 0, 1);
      const resultFade = resultT * resultT * (3 - 2 * resultT);
      const phaseStrength = state.mode === 1
        ? .38 + state.mixProgress * .52
        : (state.mode === 2 ? .90 + (.34 - .90) * resultFade : .34);
      const breathing = .42 + .05 * Math.sin(state.time * 1.6);
      gl.bindVertexArray(this.emptyVao);
      gl.useProgram(this.auraProgram);
      gl.uniform2f(uniforms.uResolution, this.width, this.height);
      gl.uniform3f(uniforms.uColor, state.finalColor.r / 255, state.finalColor.g / 255, state.finalColor.b / 255);
      gl.uniform1f(uniforms.uTime, state.time);
      gl.uniform1f(uniforms.uStrength, phaseStrength * breathing);
      gl.enable(gl.BLEND);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    sampleFrame(frameMs) {
      if (this.profileLocked || !Number.isFinite(frameMs) || frameMs <= 0 || frameMs > 160) return;
      this.sampleCount += 1;
      this.frameMsTotal += frameMs;
      if (frameMs > (this.profile === "balanced" ? 27 : 38)) this.slowCount += 1;
      const windowSize = this.profile === "balanced" ? 90 : 60;
      if (this.sampleCount < windowSize) return;
      const averageFrameMs = this.frameMsTotal / this.sampleCount;
      const slowWindow = this.profile === "balanced"
        ? this.slowCount >= 24
        : (averageFrameMs > 34 || this.slowCount >= 12);
      if (this.profile === "balanced" && slowWindow) {
        this.setLegacyProfile("automatic frame-time fallback");
      } else if (this.profile === "low" && slowWindow) {
        this.setSafeProfile("30 FPS protection");
      } else if (this.profile === "safe") {
        this.slowWindows = slowWindow ? this.slowWindows + 1 : 0;
        if (this.slowWindows >= 2 && !this.performanceFailureTriggered) {
          this.performanceFailureTriggered = true;
          this.onPerformanceFailure?.("GPU remained below 30 FPS in safe profile");
        }
      }
      this.sampleCount = 0;
      this.slowCount = 0;
      this.frameMsTotal = 0;
    }

    setLegacyProfile(reason) {
      if (this.profile === "low" || this.profile === "safe") return;
      this.profile = "low";
      this.targetFps = 30;
      this.renderScale = 1;
      this.pointScale = .96;
      this.resize(window.innerWidth, window.innerHeight);
      this.onProfileChange?.(this.profile, reason);
      console.info("Aroma GPU renderer switched to legacy profile:", reason);
    }

    setSafeProfile(reason) {
      if (this.profile === "safe") return;
      this.profile = "safe";
      this.targetFps = 30;
      this.renderScale = .68;
      this.pointScale = .76;
      this.resize(window.innerWidth, window.innerHeight);
      this.slowWindows = 0;
      this.onProfileChange?.(this.profile, reason);
      console.info("Aroma GPU renderer switched to safe profile:", reason);
    }

    clear() {
      if (this.contextLost) return;
      const gl = this.gl;
      gl.viewport(0, 0, this.width, this.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }

    getStats() {
      return {
        backend: "webgl2",
        renderer: this.renderer,
        profile: this.profile,
        targetFps: this.targetFps,
        particles: this.count,
        visualDrawCalls: this.lastVisualDrawCalls,
        simulationPasses: this.lastSimulationPasses,
        internalSize: `${this.width}x${this.height}`,
        dpr: Number(this.dpr.toFixed(2))
      };
    }
  }

  window.AromaGpuParticles = AromaGpuParticles;
})();
