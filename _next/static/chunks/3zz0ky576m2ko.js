(()=>{"use strict";(globalThis.TURBOPACK||(globalThis.TURBOPACK=[])).push(["object"==typeof document?document.currentScript:void 0,26845,t=>{var e=t.i(23637);function r(t,a,o,n=0){let i=(0,e.rng)(o),l=t.map(t=>{let e=0;for(let r=1;r<t.pts.length;r++)e+=Math.hypot(t.pts[r][0]-t.pts[r-1][0],t.pts[r][1]-t.pts[r-1][1]);return e}),s=[],u=0;t.forEach((t,e)=>s.push(u+=l[e]*t.w));let h=new Float32Array(4*a),f=Math.round(a*n);for(let e=0;e<a;e++){if(e<f){let t=i()*Math.PI*2,r=.2+.85*Math.sqrt(i());h.set([Math.cos(t)*r,Math.sin(t)*r,(i()-.5)*.3,.18],4*e);continue}let r=i()*u,a=0;for(;a<s.length-1&&s[a]<r;)a++;let o=t[a],n=i()*l[a],c=1;for(;c<o.pts.length-1;c++){let t=Math.hypot(o.pts[c][0]-o.pts[c-1][0],o.pts[c][1]-o.pts[c-1][1]);if(n<=t)break;n-=t}let[m,p]=o.pts[c-1],[d,M]=o.pts[c],_=Math.min(1,n/(Math.hypot(d-m,M-p)||1)),x=i()*Math.PI*2,w=Math.sqrt(i())*o.t;h.set([m+(d-m)*_+Math.cos(x)*w,p+(M-p)*_+Math.sin(x)*w,(o.z??0)+(i()-.5)*o.t*1.6,o.a],4*e)}for(let t=a-1;t>0;t--){let e=i()*(t+1)|0;for(let r=0;r<4;r++){let a=h[4*t+r];h[4*t+r]=h[4*e+r],h[4*e+r]=a}}return h}let a=(t,e,r,a,o,n=96)=>Array.from({length:n+1},(i,l)=>{let s=a+(o-a)*l/n;return[t+Math.cos(s)*r,e+Math.sin(s)*r]});function o(t,e,r=0){let a=new Float32Array(4*e);for(let o=0;o<e;o++)a.set([t[3*o],t[3*o+1]+r,t[3*o+2],1],4*o);return a}let n=["globe","coin","target","chart","question","bulb"],i={globe:0,coin:0,target:1,chart:0,question:0,bulb:0},l={globe:0,coin:1,target:1,chart:1,question:1,bulb:1},s=`
attribute vec4 a_p0;
attribute vec4 a_p1;
attribute vec4 a_rnd;
uniform vec2 u_res;
uniform vec2 u_view;
uniform float u_dpr;
uniform float u_scroll;
uniform float u_t;
uniform vec3 u_ka;
uniform vec3 u_kb;
uniform float u_bend;
uniform mat3 u_rot;
uniform float u_time;
uniform float u_breath;
uniform float u_intro;
uniform float u_alpha;
uniform float u_size;
// r50: размер точки фигуры B: у каждой точки свой (по её прогрессу), а не общий для всей фигуры
uniform float u_sizeB;
uniform float u_halo;
uniform vec4 u_clipA;
uniform vec4 u_clipB;
uniform vec4 u_txt[48];
uniform float u_ntxt;
uniform vec2 u_avoid;
uniform float u_mask;
uniform vec4 u_keep;
uniform vec4 u_fix[16];
uniform float u_nfix;
uniform float u_sy;
// r47: телефон: мерцание точек на месте (0: выкл.) и запас маски у текста сверх зазора прямоугольника, px
uniform float u_tw;
uniform float u_mgap;
// r49: компьютер и планшет (не телефон): поток поверх всего: без масок у текста, шапки и рамок блоков
uniform float u_over;
uniform vec2 u_spawn;
varying float v_shade;
varying float v_alpha;

float eio(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0;
}

void main() {
  // r22: переход A > B: сгусток частиц летит по мягкой дуге от места фигуры A к месту фигуры B
  // и по пути перетекает из формы A в форму B (r28: захват всей фигуры, поток из всего объёма, равномерная сборка)
  vec2 D = u_kb.xy - u_ka.xy;
  float L = length(D);
  vec2 dn = L > 0.5 ? D / L : vec2(0.0, 1.0);
  // r50: без захвата и сжатия: фигура A не уменьшается и не стягивается к точке выхода (было r28: gA до ~49 %
  // и сдвиг к выходу); с первого движения прокрутки (u_t > 0) точки уходят в поток из всего объёма сразу
  vec2 M = (u_ka.xy + u_kb.xy) * 0.5 + vec2(-dn.y, dn.x) * u_bend;
  vec2 A0 = u_ka.xy;
  // очередь случайная: тело тает целиком (из всего объёма), а не с края; первые точки уходят сразу
  float order = fract(a_rnd.y * 7.31 + a_rnd.z * 3.17);
  float q = clamp((u_t - order * 0.42) / 0.58, 0.0, 1.0);
  float qs = q * q * (3.0 - 2.0 * q);
  float fi = eio(q);
  // фаза 3: новая фигура собирается из чуть большего ореола равномерно со всех направлений (как r27)
  // r42: ореол сборки на телефоне и планшете меньше (u_halo), чтобы не выходить за край блока
  float gB = 1.0 + u_halo * (1.0 - smoothstep(0.55, 1.0, u_t));
  vec3 p = mix(a_p0.xyz, a_p1.xyz * gB, fi);
  float bright = mix(a_p0.w, a_p1.w, fi);
  float br = 1.0 + u_breath * (0.03 * sin(u_time * 0.9) + 0.02 * sin(u_time * 1.7 + a_rnd.y * 6.2832));
  // в пути сгусток чуть собирается плотнее
  p *= 1.0 - 0.18 * sin(3.14159 * qs);
  p = u_rot * (p * br);
  float persp = 3.2 / (3.2 - p.z);
  float depth = clamp(p.z * 0.5 + 0.5, 0.0, 1.0);
  vec2 kc = mix(mix(A0, M, qs), mix(M, u_kb.xy, qs), qs);
  float kr = mix(u_ka.z, u_kb.z, qs);
  vec2 off = p.xy * kr * persp;
  // r25: в пути поток волной, как пересыпающийся песок: у головы (где он отрывается от фигуры) шире,
  // к концу сужается; мягкая синусоида вдоль дуги, лёгкое \xabоседание\xbb вниз, редкие крупинки по краям
  // сжатие наступает быстро после отрыва от фигуры и снимается только у самой цели
  float sm = smoothstep(0.0, 0.1, qs) * (1.0 - smoothstep(0.9, 1.0, qs));
  vec2 tg = 2.0 * (1.0 - qs) * (M - A0) + 2.0 * qs * (u_kb.xy - M);
  float tl = length(tg);
  if (sm > 0.0 && tl > 0.5) {
    vec2 T = tg / tl;
    vec2 Nn = vec2(-T.y, T.x);
    float gs = (a_rnd.x + a_rnd.z + a_rnd.w - 1.5) * 2.0;
    float loose = step(0.93, fract(a_rnd.z * 13.7 + a_rnd.x * 3.1));
    // r26: голова потока заметно толще (около 80 px по 90% частиц на 1440), к цели сужение до ~3 px;
    // на узком экране всё пропорционально мельче (не меньше половины)
    float sc = clamp(u_view.x / 1440.0, 0.5, 1.0);
    float wid = (1.0 + 27.0 * pow(1.0 - qs, 1.1)) * sc * (1.0 + 1.6 * loose);
    float wave = sin(qs * 9.4248 - u_t * 4.0) * 32.0 * sc * sin(3.14159 * qs);
    float along = dot(off, T) * mix(1.0, 0.06, sm);
    float across = dot(off, Nn) * mix(1.0, 0.0, sm) + (gs * wid + wave) * sm;
    off = T * along + Nn * across;
    // оседание крупинок: отстающие частицы чуть \xabсыплются\xbb вниз
    float fall = (0.35 + a_rnd.w * a_rnd.w) * (10.0 + 18.0 * loose) * sin(3.14159 * qs) * (1.0 - qs) * 1.6 * sc;
    off.y += fall * sm;
  }
  vec2 P = kc + off;

  // слёт на загрузке: из случайной точки экрана по спирали к своему месту в фигуре
  float h1 = fract(sin(a_rnd.x * 91.7 + 3.1) * 43758.5453);
  float h2 = fract(sin(a_rnd.z * 57.3 + 1.7) * 24634.6345);
  vec2 S = vec2(h1 * u_view.x, h2 * u_spawn.y + u_spawn.x);
  float ei = eio(clamp((u_intro - a_rnd.w * 0.45) / 0.55, 0.0, 1.0));
  P = mix(S, P, ei);
  float ang = (1.0 - ei) * (1.2 + a_rnd.y);
  vec2 d = P - kc;
  P = kc + mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;

  float ph = u_time * 1.047 + a_rnd.x * 40.0;
  P += vec2(sin(ph), cos(ph * 0.83 + a_rnd.z * 9.0)) * 1.2 * u_breath;

  // r44: монета (сбор, покой, уход и поток): точка, попавшая в строку текста с зазором, выходит к ближайшей
  // кромке прямоугольника; если там соседняя строка, дальше не назад, а в сторону (три прохода);
  // глубоко сдвинутые тусклее. u_avoid: x: тело A (монета), y: тело B (монета); поток между ними всегда.
  // Тело другой фигуры (глобус, мишень) и сборка мишени в своей плитке (u_keep) не трогаются
  float pushed = 0.0;
  bool keep = fi > 0.5 && P.x > u_keep.x && P.x < u_keep.z && P.y > u_keep.y && P.y < u_keep.w;
  // уход монеты в мишень: точки, уже долетевшие, но вне плитки мишени (u_keep), тоже обтекают текст
  float av = fi < 0.02 ? u_avoid.x : fi > 0.98 ? max(u_avoid.y, u_keep.z > u_keep.x ? u_avoid.x : 0.0) : max(u_avoid.x, u_avoid.y);
  // r50b: поверх всего (u_over): обтекания нет совсем: точки, прижатые к краям строк (и невидимых строк),
  // оставляли в потоке и в монете пустые тёмные прямоугольники с яркой кромкой
  if (av > 0.5 && !keep && u_over < 0.5) {
    vec2 dir = vec2(0.0);
    // поток в пути: запас 24 px сверху и снизу строки (блок ещё доезжает при появлении, data-rv: 24 px)
    float slk = fi > 0.02 && fi < 0.98 ? 24.0 : 0.0;
    for (int pass = 0; pass < 3; pass++) {
      for (int i = 0; i < 48; i++) {
        if (float(i) >= u_ntxt) break;
        vec4 r = u_txt[i] + vec4(0.0, -slk, 0.0, slk);
        if (P.x > r.x - 1.0 && P.x < r.z + 1.0 && P.y > r.y - 1.0 && P.y < r.w + 1.0) {
          float dl = dir.x > 0.0 ? 1e5 : P.x - r.x + 1.0;
          float dr = dir.x < 0.0 ? 1e5 : r.z + 1.0 - P.x;
          float du = dir.y > 0.0 ? 1e5 : P.y - r.y + 1.0;
          float dd = dir.y < 0.0 ? 1e5 : r.w + 1.0 - P.y;
          float m = min(min(dl, dr), min(du, dd));
          if (m == dl) { P.x = r.x - 1.0; dir = vec2(-1.0, 0.0); }
          else if (m == dr) { P.x = r.z + 1.0; dir = vec2(1.0, 0.0); }
          else if (m == du) { P.y = r.y - 1.0; dir = vec2(0.0, -1.0); }
          else { P.y = r.w + 1.0; dir = vec2(0.0, 1.0); }
          pushed = max(pushed, m);
        }
      }
    }
  }
  vec2 vp = vec2(P.x, P.y - u_scroll) * u_dpr;
  vec2 clip = vp / u_res * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float a = (0.4 + 0.6 * depth) * bright;
  a *= mix(0.3, 1.0, ei);
  a *= 1.0 - (1.0 - u_over) * 0.9 * smoothstep(0.0, 12.0, pushed);
  // r42: точки собранной фигуры не выходят за рамку своего блока (z < x: рамки нет)
  vec4 cb = fi < 0.5 ? u_clipA : u_clipB;
  if (cb.z > cb.x && (fi < 0.02 || fi > 0.98) && (P.x < cb.x || P.x > cb.z || P.y < cb.y || P.y > cb.w)) a = 0.0;
  // r42: частицы (и поток в пути) не касаются текста: у строки и её зазора гаснут, мягкий край 4 px
  // r44: на компьютере (u_mask = 0) только у точек монеты, остальные фигуры как были
  for (int i = 0; i < 48; i++) {
    if (u_over > 0.5 || float(i) >= u_ntxt || (u_mask < 0.5 && (av < 0.5 || keep))) break;
    vec4 r = u_txt[i];
    vec2 o = max(max(r.xy - P, P - r.zw), vec2(0.0));
    a *= smoothstep(u_mgap, u_mgap + 4.0, length(o));
  }
  // r47: телефон: тихое мерцание на месте: каждая точка медленно и неглубоко тускнеет и возвращается (только яркость)
  a *= 1.0 - u_tw * (0.5 + 0.5 * sin(u_time * (0.5 + 0.9 * a_rnd.y) + a_rnd.x * 60.0));
  // r46: холст выше шапки и виджета: у их строк (по окну, сдвиг u_sy) гаснут точки всех фигур, мягкий край 4 px
  vec2 Q = vec2(P.x, P.y - u_sy);
  for (int i = 0; i < 16; i++) {
    if (float(i) >= u_nfix) break;
    vec4 r = u_fix[i];
    vec2 o = max(max(r.xy - Q, Q - r.zw), vec2(0.0));
    a *= smoothstep(0.0, 4.0, length(o));
  }
  v_alpha = a * u_alpha;
  v_shade = mix(0.4, 1.0, depth);
  gl_PointSize = max(1.0, (1.1 + 1.5 * a_rnd.w) * persp * mix(u_size, u_sizeB, fi) * u_dpr);
}
`,u=`
precision mediump float;
varying float v_shade;
varying float v_alpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.3, 0.5, length(c))) * v_alpha;
  if (a <= 0.003) discard;
  gl_FragColor = vec4(vec3(v_shade) * a, a);
}
`,h=["u_res","u_view","u_dpr","u_scroll","u_t","u_ka","u_kb","u_bend","u_rot","u_time","u_breath","u_intro","u_alpha","u_size","u_sizeB","u_halo","u_clipA","u_clipB","u_txt","u_ntxt","u_spawn","u_avoid","u_keep","u_mask","u_fix","u_nfix","u_sy","u_tw","u_mgap","u_over"];function f(t,e){let r=Math.cos(t),a=Math.sin(t),o=Math.cos(e),n=Math.sin(e);return new Float32Array([r,n*a,-o*a,0,o,n,a,-n*r,o*r])}let c=t=>t*t*(3-2*t),m=t=>Math.min(1,Math.max(0,t)),p=(t,e,r)=>{let a=m(.5+.5*(e-t)/r);return e+(t-e)*a-r*a*(1-a)},d=(t,e,r)=>-p(-t,-e,r);t.s(["createMorphField",0,function(t,M){let _,x=null;try{x=t.getContext("webgl",{alpha:!0,premultipliedAlpha:!0,antialias:!1,depth:!1,stencil:!1,powerPreference:"low-power"})}catch{x=null}if(!x)return null;let w=x,y=M.count,{rnd:v}=(0,e.knotPoints)(y),b=(_=function(t){let[n,i,l]=(0,e.heroFigures)(t);return{globe:o(n,t),coin:function(t,n){let i=o(n,t),l=(0,e.rng)(37),s=r([{pts:[...a(0,-.16,.16,-.25,-(1.5*Math.PI),40)],w:1,t:.03,a:1,z:.1},{pts:[...a(0,.16,.16,-(.5*Math.PI),.75*Math.PI,40)],w:1,t:.03,a:1,z:.1},{pts:[[0,-.44],[0,.44]],w:.7,t:.022,a:1,z:.1}],t,39);for(let e=0;e<t;e++){let t=i[4*e],r=i[4*e+1],a=i[4*e+2];.66>Math.hypot(t,r)&&a>0&&.85>l()&&i.set([s[4*e],s[4*e+1],s[4*e+2],1],4*e)}for(let e=0;e<t;e++).1>l()&&i.set([s[4*e],s[4*e+1],s[4*e+2],1],4*e);return i}(t,i),target:function(t){let r=([t,e,r])=>{let a=.17902957342582418*e+.9838436927881214*r;return[.3+.8138784566625339*t+-.5810351605373051*a,.04+(.9838436927881214*e-.17902957342582418*r),-.05- -.5810351605373051*t+.8138784566625339*a]},a=(t,e,a=120)=>Array.from({length:a+1},(o,n)=>r([Math.cos(n/a*Math.PI*2)*t,Math.sin(n/a*Math.PI*2)*t,e])),o=[];for(let t=0;t<6;t++){let e=.82*(1-t/6),r=.028*t;o.push({pts:a(e,r),w:1,t:.007,a:.95-t%2*.3}),o.push({pts:a(e,r-.028),w:.35,t:.006,a:.45})}o.push({pts:a(.05,.168,24),w:4,t:.03,a:1}),o.push({pts:a(.82,-.16),w:.8,t:.007,a:.5});for(let t=0;t<48;t++){let e=t/48*Math.PI*2,a=.82*Math.cos(e),n=.82*Math.sin(e);o.push({pts:[r([a,n,-.028]),r([a,n,-.16])],w:1,t:.005,a:.55})}let n=r([0,0,.168]),i=[-.86,-.22,.46],l=Math.hypot(...i),s=[i[0]/l,i[1]/l,i[2]/l],u=(t,e=[0,0,0])=>[n[0]+s[0]*t+e[0],n[1]+s[1]*t+e[1],n[2]+s[2]*t+e[2]];o.push({pts:[u(.02),u(1.08)],w:2.4,t:.011,a:1});let h=[0,1,0],f=[s[2],0,-s[0]];for(let t of[h,f])for(let e of[1,-1])o.push({pts:[u(.03),u(.11,[.035*t[0]*e,.035*t[1]*e,.035*t[2]*e])],w:1.6,t:.006,a:.95});for(let t=0;t<3;t++){let e=t/3*Math.PI*2+.4,r=[(h[0]*Math.cos(e)+f[0]*Math.sin(e))*.075,(h[1]*Math.cos(e)+f[1]*Math.sin(e))*.075,(h[2]*Math.cos(e)+f[2]*Math.sin(e))*.075];o.push({pts:[u(1.08-.2),u(1.04,r),u(1.1,r),u(1.06)],w:1.4,t:.006,a:.85})}for(let t=0;t<5;t++){let e=[0,(t-2)*.045,(t%2?1:-1)*.02];o.push({pts:[u(1.08+.08,e),u(1.08+.08+.12+t%3*.05,e)],w:.6,t:.004,a:.3})}return function(t,r){let a=(0,e.rng)(31),o=(t,e)=>Math.hypot(e[0]-t[0],e[1]-t[1],e[2]-t[2]),n=t.map(t=>t.pts.slice(1).reduce((e,r,a)=>e+o(t.pts[a],r),0)),i=[],l=0;t.forEach((t,e)=>i.push(l+=n[e]*t.w));let s=new Float32Array(4*r);for(let e=0;e<r;e++){let r=a()*l,u=0;for(;u<i.length-1&&i[u]<r;)u++;let h=t[u],f=a()*n[u],c=1;for(;c<h.pts.length-1;c++){let t=o(h.pts[c-1],h.pts[c]);if(f<=t)break;f-=t}let m=h.pts[c-1],p=h.pts[c],d=Math.min(1,f/(o(m,p)||1)),M=()=>(a()-.5)*2*h.t;s.set([m[0]+(p[0]-m[0])*d+M(),m[1]+(p[1]-m[1])*d+M(),m[2]+(p[2]-m[2])*d+M(),h.a],4*e)}return s}(o,t)}(t),chart:o(l,t,-.06),question:function(t){let e=a(0,-.2,.24,1.02*Math.PI,2.37*Math.PI,80),o=e[e.length-1],n=[0,o[1]+.02],i=[];for(let t=0;t<=24;t++){let e=t/24;i.push([(1-e)*(1-e)*o[0]+2*e*(1-e)*n[0]+e*e*0,(1-e)*(1-e)*o[1]+2*e*(1-e)*n[1]+e*e*.13])}i.push([0,.2]);let l=t=>t.map(([t,e])=>[2.1*t,(e-0)*2.1]),s=[{pts:[[0,.355*2.1],[0,.355*2.1+1e-4]],w:6e3,t:.19635,a:.95}],u=r([{pts:l(e),w:1,t:.085,a:.92},{pts:l(i),w:1,t:.085,a:.92},...s],t,33,.04),h=10*Math.PI/180,f=Math.cos(h),c=Math.sin(h);for(let e=0;e<t;e++){let t=u[4*e],r=u[4*e+1]-.1575;u[4*e]=t*f-r*c,u[4*e+1]=t*c+r*f+.1575}return u}(t),bulb:function(t){let e=a(0,-.22,.56,.5*Math.PI+.78,2.5*Math.PI-.78,140),o=e[0],n=e[e.length-1],i=[{pts:e,w:1,t:.012,a:.95},{pts:[o,[-.26,.42],[-.25,.5]],w:1,t:.012,a:.95},{pts:[n,[.26,.42],[.25,.5]],w:1,t:.012,a:.95}];[.55,.65,.75].forEach((t,e)=>i.push({pts:[[-.26+.015*e,t],[.26-.015*e,t]],w:1.4,t:.018,a:.85})),i.push({pts:[[-.14,.86],[.14,.86]],w:1.2,t:.02,a:.8}),i.push({pts:[[-.1,.5],[-.1,0]],w:.8,t:.008,a:.7}),i.push({pts:[[.1,.5],[.1,0]],w:.8,t:.008,a:.7}),i.push({pts:Array.from({length:121},(t,e)=>{let r=e/120,a=r*Math.PI*8;return[-.1+.2*r-.035*Math.sin(a),-.04-.035*Math.cos(a)]}),w:1.4,t:.008,a:1}),i.push({pts:a(0,-.04,.03,0,2*Math.PI,12),w:4,t:.12,a:.35});for(let t=0;t<7;t++){let e=Math.PI+t/6*Math.PI;i.push({pts:[[.7*Math.cos(e),-.22+.7*Math.sin(e)],[.88*Math.cos(e),-.22+.88*Math.sin(e)]],w:1.4,t:.012,a:.8})}return r(i,t,35)}(t)}}(y),n.map(t=>_[t])),g=n.map(t=>l[t]),P=n.map(t=>i[t]),A=b.length-1,k=!!M.texts&&!1!==M.mask,E=null,I=null,q=null,B=[],F=null,j=null,z={},S="",L=(t,e)=>{let r=w.createShader(t);return r?(w.shaderSource(r,e),w.compileShader(r),w.getShaderParameter(r,w.COMPILE_STATUS))?r:(w.deleteShader(r),null):null},R=()=>{if(I=L(w.VERTEX_SHADER,s),q=L(w.FRAGMENT_SHADER,u),E=w.createProgram(),!I||!q||!E||(w.attachShader(E,I),w.attachShader(E,q),w.linkProgram(E),!w.getProgramParameter(E,w.LINK_STATUS)))return!1;w.useProgram(E),B=[];let t=(t,e,r,a)=>{let o=w.createBuffer();B.push(o),w.bindBuffer(w.ARRAY_BUFFER,o),w.bufferData(w.ARRAY_BUFFER,e,a);let n=w.getAttribLocation(E,t);return n>=0&&(w.enableVertexAttribArray(n),w.vertexAttribPointer(n,r,w.FLOAT,!1,0,0)),o};for(let e of(t("a_rnd",v,4,w.STATIC_DRAW),F=t("a_p0",b[0],4,w.DYNAMIC_DRAW),j=t("a_p1",b[1],4,w.DYNAMIC_DRAW),h))z[e]=w.getUniformLocation(E,e);return w.enable(w.BLEND),w.blendFunc(w.ONE,w.ONE_MINUS_SRC_ALPHA),S="0:1",!0};if(!R())return null;let T=(t,e)=>{let r=`${t}:${e}`;r!==S&&(w.bindBuffer(w.ARRAY_BUFFER,F),w.bufferSubData(w.ARRAY_BUFFER,0,b[t]),w.bindBuffer(w.ARRAY_BUFFER,j),w.bufferSubData(w.ARRAY_BUFFER,0,b[e]),S=r)},O=null,C=0,D=!1,H=!1,U=0,N=0,Y=!1,W=1,$=-1,K=0,Q=0,G=0,V=0,X=0,J=-1,Z=0,tt=0,te=!!M.statics,tr=te&&!!M.still,ta=b.map(()=>-1),to=-1,tn=1,ti=0,tl=!!M.anchored,ts=0,tu=0,th=0,tf=0,tc=0;tl&&Object.assign(t.style,{position:"absolute",inset:"auto",top:"0",left:"0",width:"100%",height:"0px",willChange:"transform"});let tm=()=>{if(W=Math.min(window.devicePixelRatio||1,M.mobile?1.25:1.5),tl){let e,r,a=document.documentElement.clientWidth,o=((e=document.createElement("div")).style.cssText="position:absolute;top:0;left:0;width:1px;height:100lvh;visibility:hidden;pointer-events:none",document.body.append(e),r=e.offsetHeight,e.remove(),Math.max(r||0,window.innerHeight));(a!==ts||o+2*Math.round(.4*o)>tu)&&(th=Math.round(.4*o),ts=a,tu=o+2*th,t.style.height=`${tu}px`)}let e=Math.max(1,Math.round((tl?ts:t.clientWidth||document.documentElement.clientWidth)*W)),r=Math.max(1,Math.round((tl?tu:t.clientHeight||window.innerHeight)*W));(e!==t.width||r!==t.height)&&(t.width=e,t.height=r,w.viewport(0,0,e,r))},tp=(t,e)=>{let r=O.anchors[t];if(void 0===r.top||void 0===r.bottom)return e;let a=Math.min(r.cy,r.top+r.r);return d(p(e,Math.max(r.cy,r.bottom-r.r),60),a,60)},td=(t,e)=>{let r=O.anchors[t],a=r.cy;if(r.pin&&(a+=(O.trans[t]?p(e,O.trans[t].start,160):e)*r.pin),r.stick){let e=r.stick();if(a=tp(t,a+e),void 0!==r.floor){let o=tE[t],n=r.floor+e,i=void 0!==r.bottom?(r.bottom-n)/(o[1]+o[3]):r.r,l=Math.max(4,Math.min(r.r,Math.max((a-n)/o[1],i)));return{cx:r.cx,cy:Math.max(a,n+o[1]*r.r),r:r.r,lo:n+o[1]*r.r,sq:1-l/r.r}}}return{cx:r.cx,cy:a,r:r.r}},tM=t=>{let e=O.trans,r=0;for(;r<e.length&&t>e[r].end;)r++;if(r>=e.length){let e=td(A,t);return{a:A-1,f:1,A:e,B:e}}let a=e[r],o=m((t-a.start)/Math.max(1,a.end-a.start));if(a.lead){let e=t-a.start,r=a.end-a.start-2*a.lead;o=e<a.lead?.3*m(e/a.lead):e<a.lead+r?.3+.4*(e-a.lead)/r:.7+.3*m((e-a.lead-r)/a.lead)}let n=td(r,t);if(n.sq&&n.sq>.001&&(o=1-(1-o)*(1-.45*n.sq)),o<=0)return{a:r,f:0,A:n,B:n};let i=td(r+1,t),l=O.vh??window.innerHeight;return n.cy=d(n.cy,t-1.1*n.r,120),i.cy=p(i.cy,t+l+1.1*i.r,120),n.cy=tp(r,n.cy),void 0!==n.lo&&(n.cy=Math.max(n.cy,n.lo)),i.cy=tp(r+1,i.cy),{a:r,f:o,A:n,B:i}},t_=new Float32Array(0),tx=new Float32Array(192),tw="",ty=0,tv=[0,0,-1,0],tb=new Float32Array(64),tg=(e,r,a=e)=>{if(!O)return;if(tl){let r=Math.max(-th,Math.min(Math.round(e)-th,tc-tu));r!==tf&&(tf=r,t.style.transform=`translate3d(0,${r}px,0)`)}let o=tl?tf:e;if(M.statics){let a,n=o+t.height/W;w.uniform2f(z.u_res,t.width,t.height),w.uniform2f(z.u_view,t.width/W,t.height/W),w.uniform1f(z.u_dpr,W),w.uniform1f(z.u_scroll,o),w.uniform2f(z.u_spawn,e,window.innerHeight),w.uniform1f(z.u_halo,k?.12:.35),M.texts&&((t,e)=>{let r=`${Math.round(t/32)}:${Math.round(e/32)}:${t_.length}`;if(r===tw)return;tw=r;let a=[];for(let r=0;r<t_.length&&!(t_[r+1]>e+64);r+=4)t_[r+3]<t-64||a.push([t_[r],t_[r+1],t_[r+2],t_[r+3]]);let o=t=>(t[2]-t[0])*(t[3]-t[1]);for(;a.length>48;){let t=0,e=1,r=1/0;for(let n=0;n+1<a.length;n++)for(let i=n+1;i<Math.min(a.length,n+10);i++){let l=a[n],s=a[i],u=(Math.max(l[2],s[2])-Math.min(l[0],s[0]))*(Math.max(l[3],s[3])-Math.min(l[1],s[1]))-o(l)-o(s);u<r&&(r=u,t=n,e=i)}let n=a[t],i=a[e];a[t]=[Math.min(n[0],i[0]),Math.min(n[1],i[1]),Math.max(n[2],i[2]),Math.max(n[3],i[3])],a.splice(e,1)}tx.fill(0),a.forEach((t,e)=>tx.set(t,4*e)),ty=a.length})(o,n),w.uniform4fv(z.u_txt,tx),w.uniform1f(z.u_ntxt,k?ty:0),w.uniform2f(z.u_avoid,0,0),w.uniform1f(z.u_mask,+!!k),w.uniform4f(z.u_keep,tv[0],tv[1],tv[2],tv[3]),tb.fill(0),(a=M.fixedTexts?M.fixedTexts().slice(0,16):[]).forEach((t,e)=>tb.set(t,4*e)),w.uniform4fv(z.u_fix,tb),w.uniform1f(z.u_nfix,a.length),w.uniform1f(z.u_sy,window.scrollY),w.uniform1f(z.u_t,0),w.uniform1f(z.u_bend,0),w.uniform1f(z.u_time,te?N+3:3),w.uniform1f(z.u_intro,1),w.uniform1f(z.u_tw,te?tr?.4:.5:0),w.uniform1f(z.u_mgap,2*!!k),w.clearColor(0,0,0,0),w.clear(w.COLOR_BUFFER_BIT);let i=window.scrollY,l=i+window.innerHeight,s=!1;return O.anchors.forEach((t,e)=>{let a=tE[e];if(t.cy+a[3]*t.r<o-16||t.cy-a[1]*t.r>n+16)return;t.cy+a[3]*t.r>i&&t.cy-a[1]*t.r<l&&(s=!0,ta[e]<0&&(ta[e]=r));let u=te?ta[e]<0?0:c(m((r-ta[e])/1100)):1;if(u<=0)return;u<1&&(s=!0),T(e,e),w.uniform1f(z.u_alpha,u),w.uniform1f(z.u_breath,te&&!P[e]?tr?.95:1.2:0);let h=t.clip??tv;w.uniform4f(z.u_clipA,h[0],h[1],h[2],h[3]),w.uniform4f(z.u_clipB,h[0],h[1],h[2],h[3]);let p=t.r*(P[e]?1:.97+.03*u);w.uniform3f(z.u_ka,t.cx,t.cy,p),w.uniform3f(z.u_kb,t.cx,t.cy,p);let d=te&&!P[e]?(tr?.07:.1)*Math.sin(.48*N+1.7*e):0;w.uniformMatrix3fv(z.u_rot,!1,f((.35+d)*(1-P[e]),(-.35+.25*g[e]+.5*d*Math.cos(.31*N+e))*(1-P[e]))),w.uniform1f(z.u_size,Math.min(1,Math.max(.6,Math.sqrt(t.r/260)))),w.uniform1f(z.u_sizeB,Math.min(1,Math.max(.6,Math.sqrt(t.r/260)))),w.drawArrays(w.POINTS,0,y)}),{fr:g[0],f:0,vis:s}}let n=tM(a),i=1,l=n.f,s=n.a,u=Math.min(A,s+1);if(M.still){let t=l<.5?s:u;to<0?to=t:t!==to&&0===ti&&(ti=-1);let r=td(to,e);n={...n,A:r,B:r},s=to,u=to,l=0,i=tn}T(s,u);let h=g[s]+(g[u]-g[s])*c(l);w.uniform2f(z.u_res,t.width,t.height),w.uniform2f(z.u_view,t.width/W,t.height/W),w.uniform1f(z.u_dpr,W),w.uniform1f(z.u_scroll,o),w.uniform2f(z.u_spawn,e,window.innerHeight),w.uniform1f(z.u_halo,k?.12:.35);let p=O.anchors[s].corner&&O.anchors[s].clip||tv,d=O.anchors[u].corner&&O.anchors[u].clip||tv;w.uniform4f(z.u_clipA,p[0],p[1],p[2],p[3]),w.uniform4f(z.u_clipB,d[0],d[1],d[2],d[3]),w.uniform4fv(z.u_txt,tx);let _=!!M.texts&&!!M.avoid&&(M.avoid.includes(s)||M.avoid.includes(u));w.uniform1f(z.u_ntxt,0),w.uniform2f(z.u_avoid,_&&M.avoid.includes(s)?1:0,_&&M.avoid.includes(u)?1:0);let x=_&&!M.avoid.includes(u)?O.anchors[u].keep??d:tv;w.uniform1f(z.u_mask,0),w.uniform4f(z.u_keep,x[0],x[1],x[2],x[3]),w.uniform1f(z.u_nfix,0),w.uniform1f(z.u_over,1),w.uniform1f(z.u_tw,0),w.uniform1f(z.u_mgap,0),w.uniform1f(z.u_t,l),w.uniform3f(z.u_ka,n.A.cx,n.A.cy,n.A.r),w.uniform3f(z.u_kb,n.B.cx,n.B.cy,n.B.r);let v=Math.hypot(n.B.cx-n.A.cx,n.B.cy-n.A.cy);w.uniform1f(z.u_bend,(s%2?-1:1)*Math.min(160,.16*v));let b=s===u?P[s]:P[s]+(P[u]-P[s])*c(l);w.uniformMatrix3fv(z.u_rot,!1,f((K+.35+X)*(1-b),(Q+(-.35+.25*h))*(1-b))),w.uniform1f(z.u_time,N+3),w.uniform1f(z.u_breath,+!M.still),w.uniform1f(z.u_intro,M.still||$<0?1:m((r-$)/2600)),w.uniform1f(z.u_alpha,i);let E=t=>Math.min(1,Math.max(.6,Math.sqrt(t/260)));return w.uniform1f(z.u_size,E(O.anchors[s].r)),w.uniform1f(z.u_sizeB,E(O.anchors[u].r)),w.clearColor(0,0,0,0),w.clear(w.COLOR_BUFFER_BIT),w.drawArrays(w.POINTS,0,y),{fr:h,f:l}},tP=t=>{if(C=0,D||H||!O)return;let e=Math.min(.05,Math.max(0,(t-U)/1e3));if(U=t,"hidden"===document.visibilityState)return;$<0&&($=t);let r=window.scrollY,a=!1;if(M.still||M.statics){if(0!==ti){if((tn+=ti*e*10)<=0){tn=0;let t=tM(r);to=t.f<.5?t.a:Math.min(A,t.a+1),ti=1}else tn>=1&&(tn=1,ti=0);a=!0}X=0,K=G,Q=V,te&&(N=(N+e)%1800);let o=tg(r,t);0!==ti&&(a=!0),te&&o?.vis&&(a=!0)}else{N+=e;let o=t=>1-Math.exp(-e*t);K+=(G-K)*o(3),Q+=(V-Q)*o(3),J<0||Math.abs(r-J)>2*window.innerHeight?J=r:J+=(r-J)*o(14),.05>Math.abs(r-J)&&(J=r);let n=tM(J),i=Math.min(A,n.a+1),l=g[n.a]+(g[i]-g[n.a])*c(n.f),s=-.35+.22*Math.sin(.55*N),u=s+2*Math.PI*Math.round((X-s)/(2*Math.PI));X+=.12*e*(1-l)+(u-X)*o(2.2)*l;let h=t-$<2700,f=!h&&t-Z>2e3&&.001>Math.abs(G-K);tt++;let m=tl&&Math.max(-th,Math.min(Math.round(r)-th,tc-tu))!==tf;f&&tt%2!=0&&Y&&J===r&&!m||tg(r,t,J),a=!0}Y||(Y=!0,M.onFrame?.()),a&&(C=requestAnimationFrame(tP))},tA=()=>{C||D||H||(U=performance.now(),C=requestAnimationFrame(tP))},tk=()=>{Z=performance.now(),tA()},tE=b.map((t,e)=>{let r=0,a=0,o=0,n=0;for(let i=0;i<y;i++){let l=t[4*i+2],s=P[e]?t[4*i]*(3.2/(3.2-l)):1.12*Math.max(Math.abs(t[4*i]),Math.abs(l)),u=t[4*i+1]*(P[e]?3.2/(3.2-l):1.12);r=Math.max(r,P[e]?-s:s),o=Math.max(o,s),a=Math.max(a,-u),n=Math.max(n,u)}return[1.05*r,1.05*a,1.05*o,1.05*n]}),tI=0,tq=()=>{let t=M.layout();t&&(O=t,M.texts&&(t_=M.texts(),k&&t.anchors.forEach((t,e)=>{let r=tE[e],a=[],o=t.cy-2.5*t.r-120,n=t.cy+2.5*t.r+120;for(let t=0;t<t_.length&&!(t_[t+1]>n);t+=4)t_[t+3]>=o&&a.push([t_[t],t_[t+1],t_[t+2],t_[t+3]]);let i=t.clip,l=(t,e,o)=>{let n=t-r[0]*o,l=e-r[1]*o,s=t+r[2]*o,u=e+r[3]*o;return(!i||!(n<i[0])&&!(s>i[2])&&!(l<i[1])&&!(u>i[3]))&&!a.some(t=>n<t[2]&&s>t[0]&&l<t[3]&&u>t[1])};if(l(t.cx,t.cy,t.r))return;let s=null,u=1/0;for(let e=1;e>=.6;e-=.04){let r=t.r*e;if(t.corner){let e=t.corner.x-t.corner.r*r,a=t.corner.y+t.corner.t*r;if(l(e,a,r)){s=[e,a,r];break}continue}for(let a=-64;a<=64;a+=8)for(let o=-80;o<=80;o+=8){let n=(1-e)*500+Math.abs(o)+Math.abs(a);n<u&&l(t.cx+o,t.cy+a,r)&&(u=n,s=[t.cx+o,t.cy+a,r])}}s&&([t.cx,t.cy,t.r]=s)})),tc=document.documentElement.scrollHeight,tw="",tk())},tB=0,tF=()=>{M.texts&&(window.clearTimeout(tB),tB=window.setTimeout(()=>{t_=M.texts(),tw="",tk()},250))},tj=()=>{window.clearTimeout(tI),tI=window.setTimeout(tq,150)},tz=window.innerWidth,tS=()=>{tm(),tl&&window.innerWidth===tz||tj(),tz=window.innerWidth,tk()},tL=()=>tk(),tR=t=>{if("mouse"!==t.pointerType||!O)return;let e=window.scrollY;if(e>O.heroBottom)return G=0,V=0,tk();let r=td(0,e);G=Math.max(-.9,Math.min(.9,(t.clientX-r.cx)/window.innerWidth*1.6)),V=Math.max(-.6,Math.min(.6,(t.clientY-(r.cy-e))/window.innerHeight*1.2)),tk()};window.addEventListener("resize",tS),window.addEventListener("scroll",tk,{passive:!0}),M.texts&&window.addEventListener("scroll",tF,{passive:!0});let tT=!k&&M.texts?document.querySelector("main"):null;tT?.addEventListener("transitionend",tF),tT?.addEventListener("animationend",tF),document.addEventListener("visibilitychange",tL);let tO=M.fixedTexts?[...document.querySelectorAll(".header, .soc")]:[];tO.forEach(t=>{t.addEventListener("transitionend",tk),t.addEventListener("transitionrun",tk)});let tC=tO.length&&"u">typeof MutationObserver?new MutationObserver(tk):null;tO.forEach(t=>tC?.observe(t,{subtree:!0,attributes:!0,attributeFilter:["class","hidden"]}));let tD=M.texts&&"u">typeof MutationObserver?new MutationObserver(tF):null;tD?.observe(document.querySelector("main")??document.body,{subtree:!0,childList:!0,characterData:!0,attributes:!0,attributeFilter:["class","hidden","aria-hidden"]}),!M.follow||M.still||M.statics||window.addEventListener("pointermove",tR,{passive:!0});let tH="u"<typeof ResizeObserver?null:new ResizeObserver(tj);M.observe().forEach(t=>tH?.observe(t));let tU=t=>{t.preventDefault(),H=!0,cancelAnimationFrame(C),C=0},tN=()=>{!D&&R()&&(H=!1,tm(),tk())};return t.addEventListener("webglcontextlost",tU),t.addEventListener("webglcontextrestored",tN),tm(),tq(),tA(),{relayout:tj,destroy(){D=!0,cancelAnimationFrame(C),window.clearTimeout(tI),window.clearTimeout(tB),tH?.disconnect(),tD?.disconnect(),window.removeEventListener("scroll",tF),tT?.removeEventListener("transitionend",tF),tT?.removeEventListener("animationend",tF),window.removeEventListener("resize",tS),window.removeEventListener("scroll",tk),document.removeEventListener("visibilitychange",tL),tC?.disconnect(),tO.forEach(t=>{t.removeEventListener("transitionend",tk),t.removeEventListener("transitionrun",tk)}),window.removeEventListener("pointermove",tR),t.removeEventListener("webglcontextlost",tU),t.removeEventListener("webglcontextrestored",tN),w.deleteProgram(E),w.deleteShader(I),w.deleteShader(q),B.forEach(t=>w.deleteBuffer(t));let e=w.getExtension("WEBGL_lose_context");queueMicrotask(()=>{t.isConnected||w.isContextLost()||e?.loseContext()})}}}],26845)},23637,t=>{var e=t.i(28534);function r(t){let e=t>>>0;return()=>{let t=e=e+0x6d2b79f5>>>0;return t=Math.imul(t^t>>>15,1|t),(((t^=t+Math.imul(t^t>>>7,61|t))^t>>>14)>>>0)/0x100000000}}let a=t=>Math.max(1.2,2.4*t);function o(t,e,o){let n=r(o),i=new Float64Array(t.length),l=0;t.forEach((t,e)=>{l+=t.w??1,i[e]=l});let s=new Float32Array(4*e);for(let r=0;r<e;r++){let e=n()*l,o=0,u=i.length-1;for(;o<u;){let t=o+u>>1;i[t]<e?o=t+1:u=t}let h=t[o],f=n()*Math.PI*2,c=Math.sqrt(n())*(h.j??.6);s[4*r]=h.x+Math.cos(f)*c,s[4*r+1]=h.y+Math.sin(f)*c,s[4*r+2]=a((h.r??.8)*(.7+.6*n())),s[4*r+3]=h.a??.85}for(let t=e-1;t>0;t--){let e=n()*(t+1)|0;for(let r=0;r<4;r++){let a=s[4*t+r];s[4*t+r]=s[4*e+r],s[4*e+r]=a}}return s}t.s(["barsShape",0,function(t,e){let r=[],a=t.step;return t.cols.forEach(e=>{let o=e.x+e.w/2,n=Math.max(1,Math.floor(e.w/a)),i=e.y+e.h;for(let t=i-a/2;t>e.y;t-=a){let l=(i-t)/e.h<=e.fill+.001;for(let i=0;i<n;i++){let s=o+(i-(n-1)/2)*a;r.push(l?{x:s,y:t,j:.15,w:1,r:e.now?1.1:1.3,a:e.now?.75:.9}:{x:s,y:t,j:.15,w:1,r:.55,a:.07})}}let l=i-e.h*t.lvl;for(let t=0;t<2*Math.PI;t+=.1)r.push({x:o+16*Math.cos(t),y:l+16*Math.sin(t),j:.3,w:.5,r:.6,a:.6*!!e.now});for(let t=0;t<24;t++)r.push({x:o,y:l,j:3,w:1,r:1,a:.6*!!e.now})}),r.length||r.push({x:0,y:0}),o(r,e,61)},"convergeShape",0,function(t,e){let a=[],n=t.k??1,{cx:i,cy:l}=t,s=r(25),u=t.span??150*n,h=[[1,0],[6,3],[1.2,3.2],[8,2,1.5,2]],f=(e,r,o)=>{t.vertical?a.push({x:i-r,y:l+e,...o}):a.push({x:i+e,y:l+r,...o})},c=t.x0-i;for(let[t,e]of([-1.5,-.5,.5,1.5].forEach((t,e)=>{let r=t*u*2/3,a=14*t*n,o=h[e],i=o.reduce((t,e)=>t+e,0),l=-200*n,s=t=>{if(t<.62)return[c+t/.62*(l-c),r];let e=(t-.62)/.38;return[l+(-40*n-l)*e,r+e*e*(3-2*e)*(a-r)]};for(let t=0;t<1;t+=.0016){let r=-(t*c*1.05)%i,a=!0,n=0;for(let t=0;t<o.length;t++)if(r<(n+=o[t])){a=t%2==0;break}if(!a)continue;let[l,u]=s(t);f(l,u,{j:.4,w:1,r:.6,a:[1,.85,.7,.6][e]})}}),[[120*n,.3],[80*n,.55]]))for(let r=0;r<2*Math.PI;r+=1.4/t)f(Math.cos(r)*t,Math.sin(r)*t,{j:.4,w:1,r:.6,a:e});for(let t=0;t<900;t++){let t=s()*Math.PI*2,e=40*Math.sqrt(s())*n;f(Math.cos(t)*e,Math.sin(t)*e,{j:.8,w:2.4,r:1,a:1})}let m=12*n,p=150*n,d=340*n;for(let t=-d;t<=d;t+=m)for(let e=-d;e<=d+80*n;e+=m){let r=Math.hypot(e,t);if(r<p||r>d)continue;let a=Math.pow(1-(r-p)/(d-p),1.6);a<.06||f(e,t,{j:a*m*.36,w:2.6*a,r:.6,a:.25+.55*a})}return o(a,e,15)},"forkShape",0,function(t,e){let a=[],n=r(65),{ox:i,oy:l,jy:s}=t,u=(t,e,r,o,n,i)=>{for(let l=0;l<=n;l++){let s=l/n,u=1-s;a.push({x:u*u*u*t[0]+3*u*u*s*e[0]+3*u*s*s*r[0]+s*s*s*o[0],y:u*u*u*t[1]+3*u*u*s*e[1]+3*u*s*s*r[1]+s*s*s*o[1],...i(l)})}},h=(t,e)=>"sel"===t?{j:.6,w:1,r:.9,a:.55}:"hov"===t?{j:.6,w:1,r:.7,a:.3}:e%5<2?{j:.4,w:1,r:.6,a:.4}:{j:.5,w:1,r:.5,a:0},f=t.comb?Math.max(s,...t.ends.map(t=>t.y)):s;for(let t=l+2;t<=f;t+=1)a.push({x:i,y:t,j:.6,w:2,r:.8,a:.5});if(!t.comb){for(let t=0;t<90;t++)a.push({x:i,y:s,j:5,w:1.4,r:1,a:.8});for(let t=0;t<2*Math.PI;t+=1.6/14)a.push({x:i+14*Math.cos(t),y:s+14*Math.sin(t),j:.5,w:.6,r:.6,a:.35})}for(let t=0;t<160;t++)a.push({x:i+(n()-.5)*36,y:l+n()*(f-l+20),j:4,w:.3,r:.5,a:.12});return t.ends.forEach(e=>{if(t.comb){let t=e.x-4;for(let r=i;r<=t;r+=1)a.push({x:r,y:e.y,...h(e.state,Math.round((r-i)/1.2))});for(let t=0;t<16;t++)a.push({x:i,y:e.y,j:2.5,w:1,r:.9,a:"sel"===e.state?.8:.3});return}let r="l"===e.side,o="r"===e.side,n=r?e.x+6:o?e.x-6:e.x,l=r||o?e.y:e.y-6,f=[i,s+30],c=r||o?[i+(n-i)*.35,l]:[n,l-20];u([i,s],f,c,[n,l],420,t=>h(e.state,t));let m="sel"===e.state;u([i+3,s],f,c,[n,l+3],300,()=>({j:.6,w:1,r:.6,a:.4*!!m}));for(let t=0;t<50;t++)a.push({x:n,y:l,j:4,w:1,r:.9,a:.8*!!m})}),o(a,e,65)},"frameShape",0,function(t,e){let{x:a,y:n,w:i,h:l}=t,s=t.rad,u=r(23),h=[i-2*s,Math.PI*s/2,l-2*s,Math.PI*s/2,i-2*s,Math.PI*s/2,l-2*s,Math.PI*s/2],f=h.reduce((t,e)=>t+e,0),c=[[a+s,n],[a+i-s,n+s],[a+i,n+s],[a+i-s,n+l-s],[a+i-s,n+l],[a+s,n+l-s],[a,n+l-s],[a+s,n+s]],m=[[1,0],[0,1],[-1,0],[0,-1]],p=t=>{let e=t*f,r=0;for(;r<7&&e>h[r];)e-=h[r],r++;if(r%2==0){let[t,a]=c[r],o=m[r/2];return[t+o[0]*e,a+o[1]*e]}let[a,o]=c[r],n=[-Math.PI/2,0,Math.PI/2,Math.PI][(r-1)/2]+e/s;return[a+Math.cos(n)*s,o+Math.sin(n)*s]},d=[];for(let t=0;t<2400;t++){let[e,r]=p(t/2400);d.push({x:e,y:r,j:.7,w:1,r:.6,a:.8})}if(t.axis){let{x0:e,y0:r,x1:a,y1:o,dots:n}=t.axis,i=Math.hypot(a-e,o-r);for(let t=0;t<=i;t+=4){let n=t/i;d.push({x:e+(a-e)*n,y:r+(o-r)*n,j:.4,w:.9,r:.55,a:.55})}n.forEach(([t,e],r)=>{for(let a=0;a<60+40*r;a++)d.push({x:t,y:e,j:3+2*r,w:1.2,r:.8,a:.9});if(r===n.length-1)for(let r=0;r<160;r++){let a=r/160*Math.PI*2;d.push({x:t+20*Math.cos(a),y:e+20*Math.sin(a),j:.5,w:.6,r:.5,a:.5})}})}else for(let t=0;t<500;t++)d.push({x:a+24+u()*(i-48),y:n+.55*l+u()*l*.4,j:2,w:.5,r:1.3,a:.35});return o(d,e,13)},"gridShape",0,function(t,e){let r=[],a=t.step,n=t.x+t.w,i=t.y+t.h;for(let e=t.y+a/2;e<t.y+t.h;e+=a)for(let o=t.x+a/2;o<t.x+t.w;o+=a){let a=Math.max(0,1-1.15*Math.hypot((o-n)/t.w,(e-i)/t.h)),l=.12+.88*a*a;r.push({x:o,y:e,j:.4+1.6*l,w:.2+2.2*l,r:.6,a:.3+.7*l})}return r.length||r.push({x:t.x,y:t.y}),o(r,e,14)},"heroFigures",0,function(t,e=21){let a=r(e),o=new Float32Array(3*t),n=new Float32Array(3*t),i=new Float32Array(3*t),l=(t,e,r,a,o)=>{t[3*e]=r,t[3*e+1]=a,t[3*e+2]=o},s=t=>(a()-.5)*2*t,u=[.3,.5,.72,.96,1.22].map((t,e)=>({x:-.72+.36*e,h:t})),h=[[-.86,.36],[-.36,.12],[0,0],[.36,-.3],[.82,-.72]],f=t=>{let e=t.slice(1).map((e,r)=>Math.hypot(e[0]-t[r][0],e[1]-t[r][1])),r=a()*e.reduce((t,e)=>t+e,0),o=0;for(;o<e.length-1&&r>e[o];)r-=e[o++];let n=r/e[o];return[t[o][0]+(t[o+1][0]-t[o][0])*n,t[o][1]+(t[o+1][1]-t[o][1])*n]};for(let e=0;e<t;e++){{let t=a();if(t<.42){let t=Math.floor(10*a())/10*Math.PI,r=a()*Math.PI*2;l(o,e,.92*Math.cos(r)*Math.cos(t)+s(.01),.92*Math.sin(r)+s(.01),.92*Math.cos(r)*Math.sin(t)+s(.01))}else if(t<.8){let t=(Math.floor(5*a())-2)/3*(Math.PI/2)*.95,r=a()*Math.PI*2,n=.92*Math.cos(t);l(o,e,n*Math.cos(r)+s(.01),.92*Math.sin(t)+s(.01),n*Math.sin(r)+s(.01))}else{let t=2*a()-1,r=a()*Math.PI*2,n=.92*Math.sqrt(1-t*t);l(o,e,n*Math.cos(r),.92*t,n*Math.sin(r))}}{let t=a(),r=a()*Math.PI*2;if(t<.36){let t=.6>a()?.1:-.1,o=.9-Math.abs(s(.035));l(n,e,o*Math.cos(r),o*Math.sin(r),t)}else if(t<.58){let t=Math.round(r/(2*Math.PI)*96)/96*Math.PI*2;l(n,e,.9*Math.cos(t),.9*Math.sin(t),s(.1))}else if(t<.8){let t=.7+s(.012);l(n,e,t*Math.cos(r),t*Math.sin(r),.1)}else{let t=.66*Math.sqrt(a());l(n,e,t*Math.cos(r),t*Math.sin(r),.1*(.75>a()?1:-1))}}{let t=a();if(t<.5){let t,r,o=u[Math.floor(a()*u.length)],n=.82-o.h,h=.6>a()?.08:-.08,f=2*(.2+o.h),c=a()*f;c<.2?[t,r]=[o.x-.1+c,n]:(c-=.2)<o.h?[t,r]=[o.x+.1,n+c]:(c-=o.h)<.2?[t,r]=[o.x+.1-c,.82]:[t,r]=[o.x-.1,.82-(c-.2)],l(i,e,t+s(.006),r+s(.006),h)}else if(t<.62){let t=u[Math.floor(a()*u.length)];l(i,e,t.x+s(.1),.82-a()*t.h,.08)}else if(t<.86){let[t,r]=f(h);l(i,e,t+s(.008),r+s(.008),.16+s(.01))}else if(t<.94){let t=.2*a(),r=.5>a()?1:-1,o=Math.atan2(h[4][1]-h[3][1],h[4][0]-h[3][0])+Math.PI+.5*r;l(i,e,.82+Math.cos(o)*t+s(.006),-.72+Math.sin(o)*t+s(.006),.16)}else l(i,e,-.94+1.88*a(),.84+s(.004),s(.08))}}return[o,n,i]},"knotPoints",0,function(t,e=7){let a=r(e),o=new Float32Array(3*t),n=new Float32Array(4*t),i=()=>(a()+a()+a()-1.5)/1.5;for(let e=0;e<t;e++){let t,r,l;if(e%11==0){let e=2*a()-1,o=a()*Math.PI*2,n=1.05+.15*a(),i=Math.sqrt(1-e*e);t=i*Math.cos(o)*n,r=e*n,l=i*Math.sin(o)*n}else{let e=a()*Math.PI*2,o=Math.cos(3*e)+2,n=.13*Math.abs(i())+.015,s=a()*Math.PI*2,u=2*a()-1,h=Math.sqrt(1-u*u);t=o*Math.cos(2*e)/3.1+h*Math.cos(s)*n,r=o*Math.sin(2*e)/3.1+u*n,l=-Math.sin(3*e)/3.1*1.4+h*Math.sin(s)*n}o[3*e]=t,o[3*e+1]=r,o[3*e+2]=l,n[4*e]=a(),n[4*e+1]=a(),n[4*e+2]=a(),n[4*e+3]=a()}return{pos:o,rnd:n}},"questionShape",0,function(t,e){let a=[],n=Math.min(.92*t.h,1.3*t.w)/.9*(t.scale??1),i=t.x+t.w/2,l=t.y+t.h/2-.01*n,s=t.step/3,u=.042*n,h=[],f=1.35*Math.PI*.24;for(let t=0;t<=f*n;t+=s){let e=1.02*Math.PI+t/(.24*n);h.push([0+.24*Math.cos(e),-.2+.24*Math.sin(e)])}let c=[0+.24*Math.cos(2.37*Math.PI),-.2+.24*Math.sin(2.37*Math.PI)],m=[0,c[1]+.02],p=Math.ceil(.16*n/s);for(let t=1;t<=p;t++){let e=t/p;h.push([(1-e)*(1-e)*c[0]+2*e*(1-e)*m[0]+e*e*0,(1-e)*(1-e)*c[1]+2*e*(1-e)*m[1]+e*e*.13])}for(let t=.13;t<=.2;t+=s/n)h.push([0,t]);for(let[t,e]of h){let r=i+t*n,o=l+e*n;a.push({x:r,y:o,j:u,w:1,r:.7,a:.9})}let d=l+.355*n,M=.055*n;for(let t=-M;t<=M;t+=s)for(let e=-M;e<=M;e+=s)e*e+t*t<=M*M&&a.push({x:i+e,y:d+t,j:s,w:.3,r:.7,a:.9});if(null!=t.top&&null!=t.bottom){let e=1/0,r=-1/0;for(let t of a)e=Math.min(e,t.y-(t.j??0)),r=Math.max(r,t.y+(t.j??0));let o=(t.top+t.bottom)/2-(e+r)/2;for(let t of a)t.y+=o}let _=r(41);for(let e=0;e<60;e++)a.push({x:t.x+_()*t.w,y:t.y+_()*t.h,j:2,w:.25,r:.5,a:.25});return o(a,e,15)},"railShape",0,function(t,e){let a=[],n=r(21);for(let e=t.y0;e<=t.y1;e+=1.5){let r=e>=t.ay0&&e<=t.ay1;a.push({x:t.x,y:e,j:r?1.6:.5,w:r?3:1,r:r?.9:.6,a:r?1:.55})}for(let e=0;e<260;e++)a.push({x:t.x+(e%2?14:-14)*n(),y:t.y0+n()*(t.y1-t.y0),j:6,w:.25,r:.5,a:.25});return o(a,e,11)},"ringsShape",0,function(t,r){let a=[],n=t.k??1,i=t.n??7;for(let e=0;e<i;e++){let r=(40+26*e)*n;for(let o=0;o<2*Math.PI*r;o+=1.6){if(e%2&&o%8>2.2)continue;let n=o/r;a.push({x:t.cx+Math.cos(n)*r,y:t.cy+Math.sin(n)*r,j:.5,w:1,r:.65,a:.95-.09*e})}}for(let e=0;e<120;e++)a.push({x:t.cx,y:t.cy,j:6*n,w:3,r:.9,a:1});for(let[r,o,i,l,s]of e.f){let e=Math.hypot(i-r,l-o)*n;for(let u=0;u<=e;u+=1.6){let h=u/e;a.push({x:t.cx+(r+(i-r)*h)*n,y:t.cy+(o+(l-o)*h)*n,j:.5,w:1,r:.65,a:s})}}let l=(40+(i-1)*26+18)*n;for(let e=-l;e<=l;e+=2)a.push({x:t.cx+e,y:t.cy,j:.3,w:.35,r:.5,a:.3}),a.push({x:t.cx,y:t.cy+e,j:.3,w:.35,r:.5,a:.3});return o(a,r,12)},"rng",0,r])}])})();