(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,40437,t=>{var e=t.i(23637);let a=`
attribute vec3 a_knot;
attribute vec4 a_rnd;
attribute vec4 a_from;
attribute vec4 a_to;
attribute vec3 a_s1;
attribute vec3 a_s2;
attribute vec3 a_s3;
uniform vec2 u_res;
// фигуры hero: 0 — глобус (на загрузке), 1 — глобус, 2 — монета, 3 — график роста
uniform float u_m;
uniform float u_dpr;
uniform float u_scroll;
uniform float u_t;
uniform float u_lag;
uniform float u_trail;
uniform float u_knot;
uniform vec2 u_kc;
uniform float u_kr;
uniform mat3 u_rot;
uniform float u_time;
uniform vec2 u_c1;
uniform vec2 u_c2;
uniform float u_sigma;
uniform float u_alpha;
uniform float u_breath;
uniform float u_lin;
// сдвиг по y формы-источника и формы-цели: форма блока с position: sticky (рейка вкладок) едет вместе с ним
uniform float u_offA;
uniform float u_offB;
varying float v_shade;
varying float v_alpha;

float eio(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}
vec2 bez(vec2 a, vec2 b, vec2 c, vec2 d, float u) {
  float v = 1.0 - u;
  return v * v * v * a + 3.0 * v * v * u * b + 3.0 * v * u * u * c + u * u * u * d;
}

void main() {
  float seed = a_rnd.x;
  float d = seed * 0.35;
  float u = eio(clamp((u_t - u_lag - d) / 0.65, 0.0, 1.0));

  vec4 A = a_from;
  float shadeA = 1.0;
  if (u_knot > 0.5) {
    // узел hero: дыхание, поворот, перспектива (как в прежнем облаке)
    // смена фигуры: у частицы своя задержка, на середине пути — разлёт и закрутка (как облако между фигурами)
    float seg = clamp(floor(u_m), 0.0, 2.0);
    float f = clamp(u_m - seg, 0.0, 1.0);
    vec3 P0 = seg < 0.5 ? a_knot : seg < 1.5 ? a_s1 : a_s2;
    vec3 P1 = seg < 0.5 ? a_s1 : seg < 1.5 ? a_s2 : a_s3;
    float fi = eio(clamp((f - a_rnd.y * 0.3) / 0.7, 0.0, 1.0));
    vec3 p = mix(P0, P1, fi);
    // первый отрезок: глобус → глобус, без разлёта (форма стоит на месте)
    float bump = seg < 0.5 ? 0.0 : sin(3.14159 * fi);
    vec3 dir = normalize(vec3(a_rnd.z - 0.5, a_rnd.w - 0.5, a_rnd.x - 0.5) + vec3(0.001));
    p += dir * bump * (0.12 + 0.22 * a_rnd.w);
    float sw = bump * (a_rnd.y - 0.5) * 1.6;
    p.xz = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * p.xz;
    float br = 1.0 + 0.035 * sin(u_time * 0.9) + 0.025 * sin(u_time * 1.7 + a_rnd.y * 6.2832);
    p = u_rot * (p * br);
    float persp = 3.2 / (3.2 - p.z);
    float depth = clamp(p.z * 0.5 + 0.5, 0.0, 1.0);
    A = vec4(u_kc + p.xy * u_kr * persp, (1.1 + 1.5 * a_rnd.w) * persp, 0.35 + 0.65 * depth);
    shadeA = mix(0.3, 1.0, depth * depth);
  }
  A.y += u_offA;
  vec4 B = a_to;
  B.y += u_offB;
  vec2 j = (vec2(a_rnd.y, a_rnd.z) - 0.5) * 2.0 * u_sigma;
  // u_lin: смена формы на месте (morph) — по прямой, без опорных точек перелёта
  vec2 P = u_lin > 0.5 ? mix(A.xy, B.xy, u) : bez(A.xy, u_c1 + j, u_c2 + j, B.xy, u);
  float fly = step(0.0001, u) * step(u, 0.9999);
  // дыхание на месте: шум \xb11.5px, период около 6 с
  float ph = u_time * 1.047 + seed * 40.0;
  P += vec2(sin(ph), cos(ph * 0.83 + a_rnd.z * 9.0)) * 1.5 * u_breath * (1.0 - fly);

  vec2 vp = vec2(P.x, P.y - u_scroll) * u_dpr;
  vec2 clip = vp / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float a = mix(A.w, B.w, u);
  a *= mix(1.0, 0.75, fly);
  // проход \xabследа\xbb: только частицы в полёте, тусклые
  a *= mix(1.0, fly * u_trail, step(0.0001, u_lag));
  v_alpha = a * u_alpha;
  v_shade = mix(shadeA, 1.0, u);
  gl_PointSize = max(1.0, mix(A.z, B.z, u) * u_dpr);
}
`,r=`
precision mediump float;
varying float v_shade;
varying float v_alpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = (1.0 - smoothstep(0.3, 0.5, d)) * v_alpha;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vec3(v_shade) * a, a);
}
`,o=["u_res","u_dpr","u_scroll","u_t","u_lag","u_trail","u_knot","u_kc","u_kr","u_rot","u_time","u_c1","u_c2","u_sigma","u_alpha","u_breath","u_lin","u_offA","u_offB","u_m"];t.s(["createParticleField",0,function(t,l){let n=null;try{n=t.getContext("webgl",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:"low-power"})}catch{n=null}if(!n)return null;let i=n,u=l.count,{pos:f,rnd:h}=(0,e.knotPoints)(u),s=(0,e.heroFigures)(u),c=new Float32Array(4*u),m=(t,e)=>{let a=i.createShader(t);return a?(i.shaderSource(a,e),i.compileShader(a),i.getShaderParameter(a,i.COMPILE_STATUS))?a:(i.deleteShader(a),null):null},_=null,p=null,M=null,d=[],w=null,x=null,y={},v=()=>{if(p=m(i.VERTEX_SHADER,a),M=m(i.FRAGMENT_SHADER,r),_=i.createProgram(),!p||!M||!_||(i.attachShader(_,p),i.attachShader(_,M),i.linkProgram(_),!i.getProgramParameter(_,i.LINK_STATUS)))return!1;i.useProgram(_),d=[];let t=(t,e,a,r)=>{let o=i.createBuffer();d.push(o),i.bindBuffer(i.ARRAY_BUFFER,o),i.bufferData(i.ARRAY_BUFFER,e,r);let l=i.getAttribLocation(_,t);return l>=0&&(i.enableVertexAttribArray(l),i.vertexAttribPointer(l,a,i.FLOAT,!1,0,0)),o};for(let e of(t("a_knot",s[0],3,i.STATIC_DRAW),t("a_rnd",h,4,i.STATIC_DRAW),t("a_s1",s[0],3,i.STATIC_DRAW),t("a_s2",s[1],3,i.STATIC_DRAW),t("a_s3",s[2],3,i.STATIC_DRAW),w=t("a_from",c,4,i.DYNAMIC_DRAW),x=t("a_to",c,4,i.DYNAMIC_DRAW),o))y[e]=i.getUniformLocation(_,e);return i.enable(i.BLEND),i.blendFunc(i.ONE,i.ONE_MINUS_SRC_ALPHA),g=-1,!0},A=null,g=-1,b=0,P=!1,R=!1,I=0,F=0,E=!1,j=1,S=0,k=0,B=0,T=0,L=-1,C=0,D=0,U=-1,z=0,O=0,Y=[-1,0],N=1,W=0,q=null,H=-1,K=0;if(!v())return null;let G=()=>{j=Math.min(window.devicePixelRatio||1,l.mobile?1.25:1.5);let e=Math.max(1,Math.round((t.clientWidth||document.documentElement.clientWidth)*j)),a=Math.max(1,Math.round((t.clientHeight||window.innerHeight)*j));(e!==t.width||a!==t.height)&&(t.width=e,t.height=a,i.viewport(0,0,e,a))},V=t=>{let e=A?.hero;if(!e||e.end<=0)return 0;let a=.08*e.end;return 3*Math.min(1,Math.max(0,(t-a)/Math.max(1,.9*e.end-a)))},X=t=>A?.hero?Math.min(t,A.hero.end)*A.hero.pin:0,J=(t,e,a)=>{let r=Math.min(1,Math.max(0,(a-t)/(e-t)));return r*r*(3-2*r)},Q=()=>Math.abs(B-S)>.001||Math.abs(T-k)>.001,Z=(e,a,r,o)=>{var n,f;let h,s,m,_,p,M;if(!A)return;g!==e&&(t=>{if(!A)return;let e=0===t?c:A.shapes[t]??c,a=A.shapes[t+1]??c;i.bindBuffer(i.ARRAY_BUFFER,w),i.bufferSubData(i.ARRAY_BUFFER,0,e),i.bindBuffer(i.ARRAY_BUFFER,x),i.bufferSubData(i.ARRAY_BUFFER,0,a),g=t})(e);let d=A.ctrl[e];i.uniform2f(y.u_res,t.width,t.height),i.uniform1f(y.u_dpr,j),i.uniform1f(y.u_scroll,r),i.uniform1f(y.u_t,a),i.uniform1f(y.u_knot,+(0===e)),i.uniform2f(y.u_kc,A.knot.cx,A.knot.cy+X(r)),i.uniform1f(y.u_kr,A.knot.radius);let v=L<0?V(r):L,b=(h=J(1.3,2,v),s=-.35+.23*J(1.3,2.4,v),{yaw:S+.35+C,pitch:k+s,front:h});i.uniformMatrix3fv(y.u_rot,!1,(n=b.yaw,f=b.pitch,m=Math.cos(n),_=Math.sin(n),p=Math.cos(f),new Float32Array([m,(M=Math.sin(f))*_,-p*_,0,p,M,_,-M*m,p*m]))),i.uniform1f(y.u_m,v),i.uniform1f(y.u_time,F+3),i.uniform2f(y.u_c1,d.c1[0],d.c1[1]),i.uniform2f(y.u_c2,d.c2[0],d.c2[1]),i.uniform1f(y.u_sigma,A.sigma),i.uniform1f(y.u_alpha,o),i.uniform1f(y.u_breath,+!l.still),i.uniform1f(y.u_lin,0);let P=A.stick?A.stick.delta():0;i.uniform1f(y.u_offA,A.stick&&e===A.stick.shape?P:0),i.uniform1f(y.u_offB,A.stick&&e+1===A.stick.shape?P:0),i.clearColor(0,0,0,0),i.clear(i.COLOR_BUFFER_BIT),i.uniform1f(y.u_lag,0),i.uniform1f(y.u_trail,1),i.drawArrays(i.POINTS,0,u),!l.still&&a>0&&a<1&&(i.uniform1f(y.u_lag,.04),i.uniform1f(y.u_trail,.15),i.drawArrays(i.POINTS,0,u))},$=e=>{if(b=0,P||R||!A)return;let a=Math.min(.05,Math.max(0,(e-I)/1e3));if(I=e,"hidden"===document.visibilityState)return;let r=window.scrollY,[o,n]=(t=>{if(!A)return[0,0];let e=0;for(let a=0;a<A.ranges.length;a++)t>=A.ranges[a].start&&(e=a);let a=A.ranges[e];return[e,Math.min(1,Math.max(0,(t-a.start)/Math.max(1,a.end-a.start)))]})(r),f=!1;if(l.still){let t=0===o&&n<.5?Math.round(V(r)):3,e=[o,n<.5?0:1],l=(t,e)=>(0===t[1]?t[0]:t[0]+1)*10+(0===t[0]&&0===t[1]?e:3);if(Y[0]<0)Y=e,L=t,N=1;else l(Y,L<0?t:L)!==l(e,t)&&0===W&&(W=-1);0!==W&&((N+=W*a*10)<=0?(N=0,Y=e,L=t,W=1):N>=1&&(N=1,W=0),f=!0),S+=(B-S)*1,k+=(T-k)*1,C=-.35*J(1.3,2,L),Z(Y[0],Y[1],r,N)}else{F+=a;let l=t=>1-Math.exp(-a*t);S+=(B-S)*l(3),k+=(T-k)*l(3);let h=V(r);L<0?L=h:L+=(h-L)*l(9),.001>Math.abs(h-L)&&(L=h);let s=J(1.3,2,L),m=-.35+.32*Math.sin(.55*F),_=m+2*Math.PI*Math.round((C-m)/(2*Math.PI));C+=.12*a*(1-s)+(_-C)*l(2.2)*s,o!==U?(U=o,D=n):D+=(n-D)*l(11),1e-4>Math.abs(n-D)&&(D=n);let p=e-z>2e3&&!Q()&&D===n&&L===h;O++;let M=D>=1?U+1:D<=0?U:-1,d=q?(e-K)/650:1;q&&d<1&&M===H?((e,a)=>{if(!A||!q)return;i.bindBuffer(i.ARRAY_BUFFER,w),i.bufferSubData(i.ARRAY_BUFFER,0,q),i.bindBuffer(i.ARRAY_BUFFER,x),i.bufferSubData(i.ARRAY_BUFFER,0,A.shapes[H]??c),g=-1,i.uniform2f(y.u_res,t.width,t.height),i.uniform1f(y.u_dpr,j),i.uniform1f(y.u_scroll,a),i.uniform1f(y.u_t,e),i.uniform1f(y.u_knot,0),i.uniform1f(y.u_time,F+3),i.uniform1f(y.u_sigma,0),i.uniform1f(y.u_alpha,1),i.uniform1f(y.u_breath,1),i.uniform1f(y.u_lin,1);let r=A.stick&&H===A.stick.shape?A.stick.delta():0;i.uniform1f(y.u_offA,r),i.uniform1f(y.u_offB,r),i.uniform1f(y.u_lag,0),i.uniform1f(y.u_trail,1),i.clearColor(0,0,0,0),i.clear(i.COLOR_BUFFER_BIT),i.drawArrays(i.POINTS,0,u)})(d,r):(q&&(q=null),p&&O%2!=0&&E||Z(U,D,r,1)),f=!0}E||(E=!0,l.onFrame?.()),(f||Q())&&(b=requestAnimationFrame($))},tt=()=>{b||P||R||(I=performance.now(),b=requestAnimationFrame($))},te=()=>{z=performance.now(),tt()},ta=0,tr=()=>{let t=l.layout();t&&(A=t,q=null,g=-1,te())},to=()=>{window.clearTimeout(ta),ta=window.setTimeout(tr,150)},tl=()=>{G(),to(),te()},tn=()=>te(),ti=t=>{if("mouse"!==t.pointerType||!A)return;let e=window.scrollY;if(e>A.heroBottom)return te();let a=(t.clientX-A.knot.cx)/window.innerWidth,r=(t.clientY-(A.knot.cy+X(e)-e))/window.innerHeight;B=Math.max(-.9,Math.min(.9,1.6*a)),T=Math.max(-.6,Math.min(.6,1.2*r)),te()};window.addEventListener("resize",tl),window.addEventListener("scroll",te,{passive:!0}),document.addEventListener("visibilitychange",tn),l.follow&&!l.still&&window.addEventListener("pointermove",ti,{passive:!0});let tu="u"<typeof ResizeObserver?null:new ResizeObserver(to);l.observe().forEach(t=>tu?.observe(t));let tf=t=>{t.preventDefault(),R=!0,cancelAnimationFrame(b),b=0},th=()=>{!P&&v()&&(R=!1,G(),te())};return t.addEventListener("webglcontextlost",tf),t.addEventListener("webglcontextrestored",th),G(),tr(),tt(),{relayout:to,morph:(t,e)=>{if(!A)return;let a=A.shapes[t];A.shapes[t]=e,g=-1,!l.still&&a&&(q=a,H=t,K=performance.now()),te()},destroy(){P=!0,cancelAnimationFrame(b),window.clearTimeout(ta),tu?.disconnect(),window.removeEventListener("resize",tl),window.removeEventListener("scroll",te),document.removeEventListener("visibilitychange",tn),window.removeEventListener("pointermove",ti),t.removeEventListener("webglcontextlost",tf),t.removeEventListener("webglcontextrestored",th),i.deleteProgram(_),i.deleteShader(p),i.deleteShader(M),d.forEach(t=>i.deleteBuffer(t));let e=i.getExtension("WEBGL_lose_context");queueMicrotask(()=>{t.isConnected||i.isContextLost()||e?.loseContext()})}}}])},23637,t=>{var e=t.i(28534);function a(t){let e=t>>>0;return()=>{let t=e=e+0x6d2b79f5>>>0;return t=Math.imul(t^t>>>15,1|t),(((t^=t+Math.imul(t^t>>>7,61|t))^t>>>14)>>>0)/0x100000000}}let r=t=>Math.max(1.2,2.4*t);function o(t,e,o){let l=a(o),n=new Float64Array(t.length),i=0;t.forEach((t,e)=>{i+=t.w??1,n[e]=i});let u=new Float32Array(4*e);for(let a=0;a<e;a++){let e=l()*i,o=0,f=n.length-1;for(;o<f;){let t=o+f>>1;n[t]<e?o=t+1:f=t}let h=t[o],s=l()*Math.PI*2,c=Math.sqrt(l())*(h.j??.6);u[4*a]=h.x+Math.cos(s)*c,u[4*a+1]=h.y+Math.sin(s)*c,u[4*a+2]=r((h.r??.8)*(.7+.6*l())),u[4*a+3]=h.a??.85}for(let t=e-1;t>0;t--){let e=l()*(t+1)|0;for(let a=0;a<4;a++){let r=u[4*t+a];u[4*t+a]=u[4*e+a],u[4*e+a]=r}}return u}t.s(["barsShape",0,function(t,e){let a=[],r=t.step;return t.cols.forEach(e=>{let o=e.x+e.w/2,l=Math.max(1,Math.floor(e.w/r)),n=e.y+e.h;for(let t=n-r/2;t>e.y;t-=r){let i=(n-t)/e.h<=e.fill+.001;for(let n=0;n<l;n++){let u=o+(n-(l-1)/2)*r;a.push(i?{x:u,y:t,j:.15,w:1,r:e.now?1.1:1.3,a:e.now?.75:.9}:{x:u,y:t,j:.15,w:1,r:.55,a:.07})}}let i=n-e.h*t.lvl;for(let t=0;t<2*Math.PI;t+=.1)a.push({x:o+16*Math.cos(t),y:i+16*Math.sin(t),j:.3,w:.5,r:.6,a:.6*!!e.now});for(let t=0;t<24;t++)a.push({x:o,y:i,j:3,w:1,r:1,a:.6*!!e.now})}),a.length||a.push({x:0,y:0}),o(a,e,61)},"convergeShape",0,function(t,e){let r=[],l=t.k??1,{cx:n,cy:i}=t,u=a(25),f=t.span??150*l,h=[[1,0],[6,3],[1.2,3.2],[8,2,1.5,2]],s=(e,a,o)=>{t.vertical?r.push({x:n-a,y:i+e,...o}):r.push({x:n+e,y:i+a,...o})},c=t.x0-n;for(let[t,e]of([-1.5,-.5,.5,1.5].forEach((t,e)=>{let a=t*f*2/3,r=14*t*l,o=h[e],n=o.reduce((t,e)=>t+e,0),i=-200*l,u=t=>{if(t<.62)return[c+t/.62*(i-c),a];let e=(t-.62)/.38;return[i+(-40*l-i)*e,a+e*e*(3-2*e)*(r-a)]};for(let t=0;t<1;t+=.0016){let a=-(t*c*1.05)%n,r=!0,l=0;for(let t=0;t<o.length;t++)if(a<(l+=o[t])){r=t%2==0;break}if(!r)continue;let[i,f]=u(t);s(i,f,{j:.4,w:1,r:.6,a:[1,.85,.7,.6][e]})}}),[[120*l,.3],[80*l,.55]]))for(let a=0;a<2*Math.PI;a+=1.4/t)s(Math.cos(a)*t,Math.sin(a)*t,{j:.4,w:1,r:.6,a:e});for(let t=0;t<900;t++){let t=u()*Math.PI*2,e=40*Math.sqrt(u())*l;s(Math.cos(t)*e,Math.sin(t)*e,{j:.8,w:2.4,r:1,a:1})}let m=12*l,_=150*l,p=340*l;for(let t=-p;t<=p;t+=m)for(let e=-p;e<=p+80*l;e+=m){let a=Math.hypot(e,t);if(a<_||a>p)continue;let r=Math.pow(1-(a-_)/(p-_),1.6);r<.06||s(e,t,{j:r*m*.36,w:2.6*r,r:.6,a:.25+.55*r})}return o(r,e,15)},"forkShape",0,function(t,e){let r=[],l=a(65),{ox:n,oy:i,jy:u}=t,f=(t,e,a,o,l,n)=>{for(let i=0;i<=l;i++){let u=i/l,f=1-u;r.push({x:f*f*f*t[0]+3*f*f*u*e[0]+3*f*u*u*a[0]+u*u*u*o[0],y:f*f*f*t[1]+3*f*f*u*e[1]+3*f*u*u*a[1]+u*u*u*o[1],...n(i)})}},h=(t,e)=>"sel"===t?{j:.6,w:1,r:.9,a:.55}:"hov"===t?{j:.6,w:1,r:.7,a:.3}:e%5<2?{j:.4,w:1,r:.6,a:.4}:{j:.5,w:1,r:.5,a:0},s=t.comb?Math.max(u,...t.ends.map(t=>t.y)):u;for(let t=i+2;t<=s;t+=1)r.push({x:n,y:t,j:.6,w:2,r:.8,a:.5});if(!t.comb){for(let t=0;t<90;t++)r.push({x:n,y:u,j:5,w:1.4,r:1,a:.8});for(let t=0;t<2*Math.PI;t+=1.6/14)r.push({x:n+14*Math.cos(t),y:u+14*Math.sin(t),j:.5,w:.6,r:.6,a:.35})}for(let t=0;t<160;t++)r.push({x:n+(l()-.5)*36,y:i+l()*(s-i+20),j:4,w:.3,r:.5,a:.12});return t.ends.forEach(e=>{if(t.comb){let t=e.x-4;for(let a=n;a<=t;a+=1)r.push({x:a,y:e.y,...h(e.state,Math.round((a-n)/1.2))});for(let t=0;t<16;t++)r.push({x:n,y:e.y,j:2.5,w:1,r:.9,a:"sel"===e.state?.8:.3});return}let a="l"===e.side,o="r"===e.side,l=a?e.x+6:o?e.x-6:e.x,i=a||o?e.y:e.y-6,s=[n,u+30],c=a||o?[n+(l-n)*.35,i]:[l,i-20];f([n,u],s,c,[l,i],420,t=>h(e.state,t));let m="sel"===e.state;f([n+3,u],s,c,[l,i+3],300,()=>({j:.6,w:1,r:.6,a:.4*!!m}));for(let t=0;t<50;t++)r.push({x:l,y:i,j:4,w:1,r:.9,a:.8*!!m})}),o(r,e,65)},"frameShape",0,function(t,e){let{x:r,y:l,w:n,h:i}=t,u=t.rad,f=a(23),h=[n-2*u,Math.PI*u/2,i-2*u,Math.PI*u/2,n-2*u,Math.PI*u/2,i-2*u,Math.PI*u/2],s=h.reduce((t,e)=>t+e,0),c=[[r+u,l],[r+n-u,l+u],[r+n,l+u],[r+n-u,l+i-u],[r+n-u,l+i],[r+u,l+i-u],[r,l+i-u],[r+u,l+u]],m=[[1,0],[0,1],[-1,0],[0,-1]],_=t=>{let e=t*s,a=0;for(;a<7&&e>h[a];)e-=h[a],a++;if(a%2==0){let[t,r]=c[a],o=m[a/2];return[t+o[0]*e,r+o[1]*e]}let[r,o]=c[a],l=[-Math.PI/2,0,Math.PI/2,Math.PI][(a-1)/2]+e/u;return[r+Math.cos(l)*u,o+Math.sin(l)*u]},p=[];for(let t=0;t<2400;t++){let[e,a]=_(t/2400);p.push({x:e,y:a,j:.7,w:1,r:.6,a:.8})}if(t.axis){let{x0:e,y0:a,x1:r,y1:o,dots:l}=t.axis,n=Math.hypot(r-e,o-a);for(let t=0;t<=n;t+=4){let l=t/n;p.push({x:e+(r-e)*l,y:a+(o-a)*l,j:.4,w:.9,r:.55,a:.55})}l.forEach(([t,e],a)=>{for(let r=0;r<60+40*a;r++)p.push({x:t,y:e,j:3+2*a,w:1.2,r:.8,a:.9});if(a===l.length-1)for(let a=0;a<160;a++){let r=a/160*Math.PI*2;p.push({x:t+20*Math.cos(r),y:e+20*Math.sin(r),j:.5,w:.6,r:.5,a:.5})}})}else for(let t=0;t<500;t++)p.push({x:r+24+f()*(n-48),y:l+.55*i+f()*i*.4,j:2,w:.5,r:1.3,a:.35});return o(p,e,13)},"gridShape",0,function(t,e){let a=[],r=t.step,l=t.x+t.w,n=t.y+t.h;for(let e=t.y+r/2;e<t.y+t.h;e+=r)for(let o=t.x+r/2;o<t.x+t.w;o+=r){let r=Math.max(0,1-1.15*Math.hypot((o-l)/t.w,(e-n)/t.h)),i=.12+.88*r*r;a.push({x:o,y:e,j:.4+1.6*i,w:.2+2.2*i,r:.6,a:.3+.7*i})}return a.length||a.push({x:t.x,y:t.y}),o(a,e,14)},"heroFigures",0,function(t,e=21){let r=a(e),o=new Float32Array(3*t),l=new Float32Array(3*t),n=new Float32Array(3*t),i=(t,e,a,r,o)=>{t[3*e]=a,t[3*e+1]=r,t[3*e+2]=o},u=t=>(r()-.5)*2*t,f=[.3,.5,.72,.96,1.22].map((t,e)=>({x:-.72+.36*e,h:t})),h=[[-.86,.36],[-.36,.12],[0,0],[.36,-.3],[.82,-.72]],s=t=>{let e=t.slice(1).map((e,a)=>Math.hypot(e[0]-t[a][0],e[1]-t[a][1])),a=r()*e.reduce((t,e)=>t+e,0),o=0;for(;o<e.length-1&&a>e[o];)a-=e[o++];let l=a/e[o];return[t[o][0]+(t[o+1][0]-t[o][0])*l,t[o][1]+(t[o+1][1]-t[o][1])*l]};for(let e=0;e<t;e++){{let t=r();if(t<.42){let t=Math.floor(10*r())/10*Math.PI,a=r()*Math.PI*2;i(o,e,.92*Math.cos(a)*Math.cos(t)+u(.01),.92*Math.sin(a)+u(.01),.92*Math.cos(a)*Math.sin(t)+u(.01))}else if(t<.8){let t=(Math.floor(5*r())-2)/3*(Math.PI/2)*.95,a=r()*Math.PI*2,l=.92*Math.cos(t);i(o,e,l*Math.cos(a)+u(.01),.92*Math.sin(t)+u(.01),l*Math.sin(a)+u(.01))}else{let t=2*r()-1,a=r()*Math.PI*2,l=.92*Math.sqrt(1-t*t);i(o,e,l*Math.cos(a),.92*t,l*Math.sin(a))}}{let t=r(),a=r()*Math.PI*2;if(t<.36){let t=.6>r()?.1:-.1,o=.9-Math.abs(u(.035));i(l,e,o*Math.cos(a),o*Math.sin(a),t)}else if(t<.58){let t=Math.round(a/(2*Math.PI)*96)/96*Math.PI*2;i(l,e,.9*Math.cos(t),.9*Math.sin(t),u(.1))}else if(t<.8){let t=.7+u(.012);i(l,e,t*Math.cos(a),t*Math.sin(a),.1)}else{let t=.66*Math.sqrt(r());i(l,e,t*Math.cos(a),t*Math.sin(a),.1*(.75>r()?1:-1))}}{let t=r();if(t<.5){let t,a,o=f[Math.floor(r()*f.length)],l=.82-o.h,h=.6>r()?.08:-.08,s=2*(.2+o.h),c=r()*s;c<.2?[t,a]=[o.x-.1+c,l]:(c-=.2)<o.h?[t,a]=[o.x+.1,l+c]:(c-=o.h)<.2?[t,a]=[o.x+.1-c,.82]:[t,a]=[o.x-.1,.82-(c-.2)],i(n,e,t+u(.006),a+u(.006),h)}else if(t<.62){let t=f[Math.floor(r()*f.length)];i(n,e,t.x+u(.1),.82-r()*t.h,.08)}else if(t<.86){let[t,a]=s(h);i(n,e,t+u(.008),a+u(.008),.16+u(.01))}else if(t<.94){let t=.2*r(),a=.5>r()?1:-1,o=Math.atan2(h[4][1]-h[3][1],h[4][0]-h[3][0])+Math.PI+.5*a;i(n,e,.82+Math.cos(o)*t+u(.006),-.72+Math.sin(o)*t+u(.006),.16)}else i(n,e,-.94+1.88*r(),.84+u(.004),u(.08))}}return[o,l,n]},"knotPoints",0,function(t,e=7){let r=a(e),o=new Float32Array(3*t),l=new Float32Array(4*t),n=()=>(r()+r()+r()-1.5)/1.5;for(let e=0;e<t;e++){let t,a,i;if(e%11==0){let e=2*r()-1,o=r()*Math.PI*2,l=1.05+.15*r(),n=Math.sqrt(1-e*e);t=n*Math.cos(o)*l,a=e*l,i=n*Math.sin(o)*l}else{let e=r()*Math.PI*2,o=Math.cos(3*e)+2,l=.13*Math.abs(n())+.015,u=r()*Math.PI*2,f=2*r()-1,h=Math.sqrt(1-f*f);t=o*Math.cos(2*e)/3.1+h*Math.cos(u)*l,a=o*Math.sin(2*e)/3.1+f*l,i=-Math.sin(3*e)/3.1*1.4+h*Math.sin(u)*l}o[3*e]=t,o[3*e+1]=a,o[3*e+2]=i,l[4*e]=r(),l[4*e+1]=r(),l[4*e+2]=r(),l[4*e+3]=r()}return{pos:o,rnd:l}},"questionShape",0,function(t,e){let r=[],l=Math.min(.92*t.h,1.3*t.w)/.9*(t.scale??1),n=t.x+t.w/2,i=t.y+t.h/2-.01*l,u=t.step/3,f=.042*l,h=[],s=1.35*Math.PI*.24;for(let t=0;t<=s*l;t+=u){let e=1.02*Math.PI+t/(.24*l);h.push([0+.24*Math.cos(e),-.2+.24*Math.sin(e)])}let c=[0+.24*Math.cos(2.37*Math.PI),-.2+.24*Math.sin(2.37*Math.PI)],m=[0,c[1]+.02],_=Math.ceil(.16*l/u);for(let t=1;t<=_;t++){let e=t/_;h.push([(1-e)*(1-e)*c[0]+2*e*(1-e)*m[0]+e*e*0,(1-e)*(1-e)*c[1]+2*e*(1-e)*m[1]+e*e*.13])}for(let t=.13;t<=.2;t+=u/l)h.push([0,t]);for(let[t,e]of h){let a=n+t*l,o=i+e*l;r.push({x:a,y:o,j:f,w:1,r:.7,a:.9})}let p=i+.355*l,M=.055*l;for(let t=-M;t<=M;t+=u)for(let e=-M;e<=M;e+=u)e*e+t*t<=M*M&&r.push({x:n+e,y:p+t,j:u,w:.3,r:.7,a:.9});if(null!=t.top&&null!=t.bottom){let e=1/0,a=-1/0;for(let t of r)e=Math.min(e,t.y-(t.j??0)),a=Math.max(a,t.y+(t.j??0));let o=(t.top+t.bottom)/2-(e+a)/2;for(let t of r)t.y+=o}let d=a(41);for(let e=0;e<60;e++)r.push({x:t.x+d()*t.w,y:t.y+d()*t.h,j:2,w:.25,r:.5,a:.25});return o(r,e,15)},"railShape",0,function(t,e){let r=[],l=a(21);for(let e=t.y0;e<=t.y1;e+=1.5){let a=e>=t.ay0&&e<=t.ay1;r.push({x:t.x,y:e,j:a?1.6:.5,w:a?3:1,r:a?.9:.6,a:a?1:.55})}for(let e=0;e<260;e++)r.push({x:t.x+(e%2?14:-14)*l(),y:t.y0+l()*(t.y1-t.y0),j:6,w:.25,r:.5,a:.25});return o(r,e,11)},"ringsShape",0,function(t,a){let r=[],l=t.k??1,n=t.n??7;for(let e=0;e<n;e++){let a=(40+26*e)*l;for(let o=0;o<2*Math.PI*a;o+=1.6){if(e%2&&o%8>2.2)continue;let l=o/a;r.push({x:t.cx+Math.cos(l)*a,y:t.cy+Math.sin(l)*a,j:.5,w:1,r:.65,a:.95-.09*e})}}for(let e=0;e<120;e++)r.push({x:t.cx,y:t.cy,j:6*l,w:3,r:.9,a:1});for(let[a,o,n,i,u]of e.f){let e=Math.hypot(n-a,i-o)*l;for(let f=0;f<=e;f+=1.6){let h=f/e;r.push({x:t.cx+(a+(n-a)*h)*l,y:t.cy+(o+(i-o)*h)*l,j:.5,w:1,r:.65,a:u})}}let i=(40+(n-1)*26+18)*l;for(let e=-i;e<=i;e+=2)r.push({x:t.cx+e,y:t.cy,j:.3,w:.35,r:.5,a:.3}),r.push({x:t.cx,y:t.cy+e,j:.3,w:.35,r:.5,a:.3});return o(r,a,12)},"rng",0,a])}])})();