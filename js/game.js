'use strict';
/* ============================================================
   VICE BLOCKS — mini open-world latihan (Three.js, prosedural)
   ============================================================ */

// ---------- Konstanta dunia ----------
const PITCH = 64;              // jarak antar pusat blok
const BLOCKS = [-3,-2,-1,0,1,2,3];
const ROAD_CENTERS = [-224,-160,-96,-32,32,96,160,224];
const WORLD_EDGE = 384;
const MOTEL_POS = { x: 128, z: -128 };            // blok Pink Motel
const CHECK1 = { x: 128, z: -90 };                // checkpoint misi 1 (depan motel)
const CHECK2 = { x: -96, z: 336 };                // checkpoint misi 2 (ujung dermaga)
const rand = (a,b)=>a+Math.random()*(b-a);
const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
function lerpAngle(a,b,t){ let d=(b-a)%(Math.PI*2); if(d>Math.PI)d-=Math.PI*2; if(d<-Math.PI)d+=Math.PI*2; return a+d*t; }

// ---------- Renderer / Scene ----------
// Init WebGL dibungkus try/catch: kegagalan (mis. WebGL tidak tersedia di
// WebView HP) dilaporkan ke kotak error di overlay awal, bukan mati diam-diam.
const renderer = (() => {
  try {
    const r = new THREE.WebGLRenderer({ antialias:true });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.setSize(innerWidth, innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.3;
    r.domElement.className = 'webgl';
    document.getElementById('game').appendChild(r.domElement);
    return r;
  } catch (err) {
    if (window.__vbShowError) window.__vbShowError('Gagal memulai WebGL: ' + (err && err.message ? err.message : err));
    throw err;
  }
})();

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe08a5a, 240, 840);
const camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.1, 2000);

// Langit gradasi sunset (dome shader)
{
  const skyGeo = new THREE.SphereGeometry(950, 24, 14);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite:false, fog:false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP;
      void main(){
        float h = normalize(vP).y;
        vec3 top = vec3(0.22,0.13,0.38);
        vec3 mid = vec3(0.66,0.27,0.44);
        vec3 hor = vec3(1.05,0.68,0.40);
        vec3 col = h > 0.28 ? mix(mid, top, smoothstep(0.28,0.85,h))
                            : mix(hor, mid, smoothstep(-0.02,0.28,h));
        gl_FragColor = vec4(col,1.0);
      }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  // Matahari rendah (cakram terang)
  const sun = new THREE.Mesh(new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color:0xffd9a0, fog:false }));
  sun.position.set(-620, 105, -430); sun.lookAt(0,40,0); scene.add(sun);
}

// Cahaya
const hemi = new THREE.HemisphereLight(0xb59ae0, 0x6a4230, 0.95);
scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffa050, 1.5);
sunLight.position.set(-260, 150, -180);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -340; sunLight.shadow.camera.right = 340;
sunLight.shadow.camera.top = 340; sunLight.shadow.camera.bottom = -340;
sunLight.shadow.camera.far = 900; sunLight.shadow.bias = -0.0006;
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x8a6f9a, 0.5));

// ---------- Tekstur tanah (satu kanvas besar: jalan, trotoar, air) ----------
function makeGroundTexture(){
  const S = 2048, W = WORLD_EDGE*2, sc = S/W;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const px = v => (v + WORLD_EDGE) * sc;
  g.fillStyle = '#413f4a'; g.fillRect(0,0,S,S);                       // tanah luar
  // Laut di selatan (z > 296) + pasir
  const seaGrad = g.createLinearGradient(0, px(296), 0, px(384));
  seaGrad.addColorStop(0,'#1d5064'); seaGrad.addColorStop(1,'#0d2a3d');
  g.fillStyle = seaGrad; g.fillRect(0, px(296), S, px(384)-px(296));
  g.fillStyle = '#8a6a48'; g.fillRect(0, px(286), S, px(296)-px(286)); // pasir
  // Aspal utama area kota
  g.fillStyle = '#3b3b44'; g.fillRect(px(-256), px(-256), 512*sc, 512*sc);
  // Perpanjangan jalan ke dermaga (x=-96 ke selatan)
  g.fillRect(px(-104), px(224), 16*sc, (292-224)*sc);
  // Marka garis tengah jalan (kuning putus-putus)
  g.fillStyle = '#d9c25a';
  for (const c of ROAD_CENTERS){
    for (let z=-252; z<252; z+=18){ g.fillRect(px(c)-1.5, px(z), 3, 8*sc*0.55); }
    for (let x=-252; x<252; x+=18){ g.fillRect(px(x), px(c)-1.5, 8*sc*0.55, 3); }
  }
  // Blok: trotoar + bidang dalam
  for (const i of BLOCKS) for (const j of BLOCKS){
    const cx = i*PITCH, cz = j*PITCH;
    g.fillStyle = '#71757f'; g.fillRect(px(cx-26), px(cz-26), 52*sc, 52*sc);
    const isMotel = (cx===MOTEL_POS.x && cz===MOTEL_POS.z);
    g.fillStyle = isMotel ? '#4c3543' : '#4a4e59';
    g.fillRect(px(cx-22), px(cz-22), 44*sc, 44*sc);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  return tex;
}
{
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_EDGE*2, WORLD_EDGE*2),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() }));
  ground.rotation.x = -Math.PI/2; ground.receiveShadow = true;
  scene.add(ground);
}

// ---------- Kolisi ----------
const boxColliders = [];   // {minX,maxX,minZ,maxZ}
const circleColliders = []; // {x,z,r,obj,tipped,kind}
function addBoxCollider(cx, cz, w, d){ boxColliders.push({ minX:cx-w/2, maxX:cx+w/2, minZ:cz-d/2, maxZ:cz+d/2 }); }
function resolveCollisions(pos, r){
  let hit = false;
  for (const b of boxColliders){
    if (b.off) continue;
    const nx = clamp(pos.x, b.minX, b.maxX), nz = clamp(pos.z, b.minZ, b.maxZ);
    let dx = pos.x-nx, dz = pos.z-nz; const d2 = dx*dx+dz*dz;
    if (d2 < r*r){
      hit = true;
      if (d2 > 1e-6){ const d = Math.sqrt(d2); pos.x = nx + dx/d*r; pos.z = nz + dz/d*r; }
      else { // pusat di dalam kotak: dorong lewat sisi terdekat
        const pl = pos.x-b.minX, pr = b.maxX-pos.x, pt = pos.z-b.minZ, pb = b.maxZ-pos.z;
        const m = Math.min(pl,pr,pt,pb);
        if (m===pl) pos.x = b.minX-r; else if (m===pr) pos.x = b.maxX+r;
        else if (m===pt) pos.z = b.minZ-r; else pos.z = b.maxZ+r;
      }
    }
  }
  for (const c of circleColliders){
    if (c.tipped) continue;
    const dx = pos.x-c.x, dz = pos.z-c.z, rr = r + c.r, d2 = dx*dx+dz*dz;
    if (d2 < rr*rr && d2 > 1e-6){ const d = Math.sqrt(d2); pos.x = c.x + dx/d*rr; pos.z = c.z + dz/d*rr; hit = true; }
  }
  pos.x = clamp(pos.x, -WORLD_EDGE+4, WORLD_EDGE-4);
  pos.z = clamp(pos.z, -WORLD_EDGE+4, WORLD_EDGE-4);
  return hit;
}

// ---------- Fasad gedung (tekstur kanvas + emissive jendela menyala) ----------
function makeFacade(base, litRatio){
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const ev = document.createElement('canvas'); ev.width = 128; ev.height = 256;
  const g = cv.getContext('2d'), e = ev.getContext('2d');
  g.fillStyle = base; g.fillRect(0,0,128,256);
  e.fillStyle = '#000'; e.fillRect(0,0,128,256);
  for (let y=0; y<13; y++) for (let x=0; x<6; x++){
    const wx = 8 + x*20, wy = 10 + y*19, lit = Math.random() < litRatio;
    g.fillStyle = lit ? '#ffd98f' : '#1c2432'; g.fillRect(wx, wy, 12, 11);
    if (lit){ e.fillStyle = Math.random()<0.25 ? '#ff9ecb' : '#ffc46b'; e.fillRect(wx, wy, 12, 11); }
  }
  const map = new THREE.CanvasTexture(cv), emis = new THREE.CanvasTexture(ev);
  return new THREE.MeshLambertMaterial({ map, emissive: 0xffffff, emissiveMap: emis, emissiveIntensity: 0.9 });
}
const roofMat = new THREE.MeshLambertMaterial({ color: 0x2e2a33 });
const facadeMats = ['#a08ba0','#b3a284','#8fa3b8','#c7ae8a','#bd93a8','#93b8ad','#ab97b8','#c2b49a'].map((c,i)=>makeFacade(c, 0.30 + (i%4)*0.07));
function buildingMaterialSet(m){ return [m, m, roofMat, roofMat, m, m]; }

const buildingGeoCache = new THREE.BoxGeometry(1,1,1);
const slabMat = new THREE.MeshLambertMaterial({ color: 0x3a3642 });
const roofPropMat = new THREE.MeshLambertMaterial({ color: 0x554f5e });
const SIGN_WORDS = ['HOTEL','CASINO','BAR','DINER','CLUB','CAFE','BANK','MALL'];
function addBuilding(cx, cz, w, d, h, mat){
  const m = mat || facadeMats[(Math.random()*facadeMats.length)|0];
  const grp = new THREE.Group(); grp.position.set(cx, 0, cz);
  const v = Math.random();
  let topY = h;
  if (v < 0.34 && h > 20){
    // Siluet bertingkat: badan lebar + menara lebih ramping di atasnya
    const baseH = h * rand(0.45, 0.6);
    const base = new THREE.Mesh(buildingGeoCache, buildingMaterialSet(m));
    base.scale.set(w, baseH, d); base.position.y = baseH/2;
    base.castShadow = true; base.receiveShadow = true; grp.add(base);
    const tower = new THREE.Mesh(buildingGeoCache, buildingMaterialSet(m));
    const tw = w * rand(0.6, 0.75), td = d * rand(0.6, 0.75);
    tower.scale.set(tw, h - baseH, td); tower.position.y = baseH + (h - baseH)/2;
    tower.castShadow = true; tower.receiveShadow = true; grp.add(tower);
  } else {
    const body = new THREE.Mesh(buildingGeoCache, buildingMaterialSet(m));
    body.scale.set(w, h, d); body.position.y = h/2;
    body.castShadow = true; body.receiveShadow = true; grp.add(body);
    if (v < 0.62){
      // Pelat atap menjorok + properti atap (kotak AC / tangki) supaya atap tidak polos
      const slab = new THREE.Mesh(buildingGeoCache, slabMat);
      slab.scale.set(w + 1.7, 0.55, d + 1.7); slab.position.y = h + 0.27; slab.castShadow = true; grp.add(slab);
      const pw = rand(2, 4.5), pd = rand(2, 4.5), ph = rand(1, 2.4);
      const prop = new THREE.Mesh(buildingGeoCache, roofPropMat);
      prop.scale.set(pw, ph, pd);
      prop.position.set(rand(-w/4, w/4), h + 0.55 + ph/2, rand(-d/4, d/4));
      prop.castShadow = true; grp.add(prop);
      topY = h + 0.55;
    }
  }
  // Papan nama di atap untuk sebagian gedung tinggi
  if (h > 30 && Math.random() < 0.4){
    const word = SIGN_WORDS[(Math.random()*SIGN_WORDS.length)|0];
    const tex = makeSignTexture([word], '#ffd83d', '#1c1030');
    const face = new THREE.MeshBasicMaterial({ map: tex });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(Math.min(w*0.8, 13), 2.6, 0.5),
      [slabMat, slabMat, slabMat, slabMat, face, face]);
    sign.position.set(0, topY + 1.6, 0); grp.add(sign);
  }
  scene.add(grp); addBoxCollider(cx, cz, w, d);
  return grp;
}

// ---------- Pohon palem & lampu jalan (geometri dibagi) ----------
const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 5.4, 6);
const crownGeo = new THREE.ConeGeometry(3.0, 1.7, 7);
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a48 });
const crownMat = new THREE.MeshLambertMaterial({ color: 0x3f9e4d });
function addPalm(x, z){
  const grp = new THREE.Group();
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 2.7; trunk.rotation.z = rand(-0.07, 0.07); trunk.castShadow = true;
  const crown = new THREE.Mesh(crownGeo, crownMat);
  crown.position.y = 5.6; crown.rotation.x = Math.PI; crown.castShadow = true;
  grp.add(trunk, crown); grp.position.set(x, 0, z);
  grp.rotation.y = Math.random()*Math.PI*2;
  scene.add(grp);
  circleColliders.push({ x, z, r:0.42, obj:grp, tipped:false, kind:'palm', tipDir: Math.random()<0.5?1:-1 });
}
const poleGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.6, 6);
const lampHeadGeo = new THREE.SphereGeometry(0.34, 10, 8);
const poleMat = new THREE.MeshLambertMaterial({ color: 0x3c4048 });
const lampHeadMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
function addLamp(x, z){
  const grp = new THREE.Group();
  const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.y = 2.8; pole.castShadow = true;
  const head = new THREE.Mesh(lampHeadGeo, lampHeadMat); head.position.y = 5.7;
  grp.add(pole, head); grp.position.set(x, 0, z);
  scene.add(grp);
  circleColliders.push({ x, z, r:0.3, obj:grp, tipped:false, kind:'lamp', tipDir: Math.random()<0.5?1:-1 });
}

// ---------- Mobil (dibangun dari primitif) ----------
const cars = [];   // semua mobil di kota — semuanya bisa dinaiki & dikendarai
const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12);
const wheelMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1b2a3a });
const lightMatF = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
const lightMatR = new THREE.MeshBasicMaterial({ color: 0xff3040 });
function makeCar(color, isPlayer){
  const grp = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.55, 4.3), paint);
  body.position.y = 0.55; body.castShadow = true; grp.add(body);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 0.9), paint);
  nose.position.set(0, 0.48, 2.35); grp.add(nose);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 2.0), glassMat);
  cabin.position.set(0, 1.05, -0.25); cabin.castShadow = true; grp.add(cabin);
  if (isPlayer){
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.09, 0.5), paint);
    spoiler.position.set(0, 1.02, -2.05); grp.add(spoiler);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.28, 0.3), paint);
    legL.position.set(-0.85, 0.85, -2.05); grp.add(legL);
    const legR = legL.clone(); legR.position.x = 0.85; grp.add(legR);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 4.3),
      new THREE.MeshLambertMaterial({ color: 0xffffff }));
    stripe.position.y = 0.86; grp.add(stripe);
  }
  const wheels = [];
  for (const [wx, wz] of [[-0.95, 1.45],[0.95, 1.45],[-0.95, -1.45],[0.95, -1.45]]){
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI/2; w.position.set(wx, 0.42, wz);
    grp.add(w); wheels.push(w);
  }
  for (const s of [-1, 1]){
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, 0.06), lightMatF);
    hl.position.set(0.62*s, 0.62, 2.82); grp.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.06), lightMatR);
    tl.position.set(0.62*s, 0.68, -2.16); grp.add(tl);
  }
  grp.userData.wheels = wheels;
  grp.userData.heading = 0;
  cars.push(grp);
  scene.add(grp);
  return grp;
}

// ---------- Isi kota: gedung, palem, lampu, mobil parkir ----------
const PARKED_COLORS = [0x3a7bd5, 0xf2f2f2, 0x27ae60, 0xf39c12, 0x8e44ad, 0x95a5a6, 0x16a085];
function populateCity(){
  for (const i of BLOCKS) for (const j of BLOCKS){
    const cx = i*PITCH, cz = j*PITCH;
    if (cx === MOTEL_POS.x && cz === MOTEL_POS.z) continue;      // blok motel khusus
    const r = Math.random();
    if (r < 0.20){ // lahan parkir: mobil parkir + palem
      const n = 2 + (Math.random()*2|0);
      for (let k=0; k<n; k++){
        const car = makeCar(PARKED_COLORS[(Math.random()*PARKED_COLORS.length)|0], false);
        car.position.set(cx + rand(-13,13), 0, cz + rand(-13,13));
        car.rotation.y = (Math.random()*4|0) * Math.PI/2 + rand(-0.06,0.06);
        car.userData.heading = car.rotation.y;
        addBoxCollider(car.position.x, car.position.z, 3.4, 3.4);
        car.userData.collider = boxColliders[boxColliders.length-1];
      }
    } else if (r < 0.42){ // dua gedung kecil
      addBuilding(cx-11, cz, rand(15,19), rand(24,34), rand(14,38));
      addBuilding(cx+11, cz, rand(15,19), rand(24,34), rand(14,44));
    } else { // satu gedung besar
      addBuilding(cx, cz, rand(26,38), rand(26,38), rand(18,68));
    }
    // palem di sudut-sudut blok
    for (const [ox, oz] of [[-24,-24],[24,-24],[-24,24],[24,24]])
      if (Math.random() < 0.55) addPalm(cx+ox+rand(-2,2), cz+oz+rand(-2,2));
  }
  // lampu jalan di tepi jalan (jangan taruh di tengah persimpangan: lewati posisi yang jatuh di sabuk jalan melintang)
  const inRoadBand = v => ROAD_CENTERS.some(rc => Math.abs(v - rc) < 8);
  const tryLampV = (x, z) => { if (!inRoadBand(z)) addLamp(x, z); };   // lampu untuk jalan vertikal (x ~ konstan)
  const tryLampH = (x, z) => { if (!inRoadBand(x)) addLamp(x, z); };   // lampu untuk jalan horizontal (z ~ konstan)
  for (const c of ROAD_CENTERS) for (let t=-224; t<=224; t+=64){
    tryLampV(c-9, t + (Math.random()<0.5?0:32)); if (Math.random()<0.7) tryLampV(c+9, t+16);
    tryLampH(t + (Math.random()<0.5?0:32), c-9); if (Math.random()<0.7) tryLampH(t+16, c+9);
  }
  // mobil parkir di pinggir jalan
  for (let k=0; k<10; k++){
    const car = makeCar(PARKED_COLORS[(Math.random()*PARKED_COLORS.length)|0], false);
    const onX = Math.random()<0.5, c = ROAD_CENTERS[(Math.random()*ROAD_CENTERS.length)|0];
    const t = rand(-230, 230);
    if (onX){ car.position.set(c-6.2, 0, t); car.rotation.y = 0; }
    else { car.position.set(t, 0, c-6.2); car.rotation.y = Math.PI/2; }
    car.userData.heading = car.rotation.y;
    addBoxCollider(car.position.x, car.position.z, 3.4, 3.4);
    car.userData.collider = boxColliders[boxColliders.length-1];
  }
}

// ---------- Pink Motel (landmark misi 1) ----------
function makeSignTexture(lines, fg, bg){
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0,0,512,128);
  g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8,8,496,112);
  g.font = '900 62px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = fg; g.shadowBlur = 22; g.fillStyle = fg;
  g.fillText(lines, 256, 66);
  return new THREE.CanvasTexture(cv);
}
function buildMotel(){
  const { x, z } = MOTEL_POS;
  const pink = new THREE.MeshLambertMaterial({ color: 0xe56b9a });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf6e3d0 });
  const main = new THREE.Mesh(new THREE.BoxGeometry(34, 13, 16), pink);
  main.position.set(x, 6.5, z-8); main.castShadow = true; scene.add(main);
  addBoxCollider(x, z-8, 34, 16);
  const trim = new THREE.Mesh(new THREE.BoxGeometry(35, 1.4, 17), cream);
  trim.position.set(x, 13.4, z-8); scene.add(trim);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 22), pink);
  wing.position.set(x-24, 4, z+2); wing.castShadow = true; scene.add(wing);
  addBoxCollider(x-24, z+2, 14, 22);
  // kolam renang di depan
  const pool = new THREE.Mesh(new THREE.BoxGeometry(16, 0.5, 9),
    new THREE.MeshLambertMaterial({ color: 0x35b6d9 }));
  pool.position.set(x+6, 0.25, z+13); scene.add(pool);
  // papan nama di atap + di tiang dekat jalan
  const signTex = makeSignTexture('PINK MOTEL', '#ff5da2', '#1c0f22');
  const signMat = new THREE.MeshBasicMaterial({ map: signTex });
  const roofSign = new THREE.Mesh(new THREE.PlaneGeometry(22, 5.5), signMat);
  roofSign.position.set(x, 17.5, z-8); roofSign.rotation.y = Math.PI; scene.add(roofSign);
  const roofSign2 = roofSign.clone(); roofSign2.rotation.y = 0; roofSign2.position.z = z-8; scene.add(roofSign2);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 11, 8), poleMat);
  pole.position.set(x+19, 5.5, z+26); scene.add(pole);
  const poleSign = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.8),
    new THREE.MeshBasicMaterial({ map: signTex, side: THREE.DoubleSide }));
  poleSign.position.set(x+19, 10.5, z+26); scene.add(poleSign);
  for (const [ox, oz] of [[-16,20],[16,20],[-19,-16],[19,-16]]) addPalm(x+ox, z+oz);
}

// ---------- Dermaga (misi 2) ----------
function buildDock(){
  const wood = new THREE.MeshLambertMaterial({ color: 0x7a5a38 });
  const woodDark = new THREE.MeshLambertMaterial({ color: 0x5f452b });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(14, 0.6, 62), wood);
  pier.position.set(-96, 0.3, 326); pier.receiveShadow = true; scene.add(pier);
  for (let z=300; z<=352; z+=13) for (const s of [-1,1]){
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,3.4,8), woodDark);
    post.position.set(-96 + 6.6*s, -0.6, z); scene.add(post);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.0, 12), woodDark);
    rail.position.set(-96 + 6.8*s, 1.1, z); scene.add(rail);
  }
  // penghalang tak terlihat di sisi dermaga + ujung (air)
  addBoxCollider(-103.4, 326, 0.8, 62); addBoxCollider(-88.6, 326, 0.8, 62);
  addBoxCollider(-96, 358, 16, 1.2);
  // air di kiri & kanan dermaga tidak bisa dimasuki
  addBoxCollider(-243.5, 339, 281, 90); addBoxCollider(147.5, 339, 473, 90);
  // peti-peti kargo
  const crateMats = [0x9a7b4f, 0x5f7a4a, 0x707a8a].map(c=>new THREE.MeshLambertMaterial({ color:c }));
  const crateGeo = new THREE.BoxGeometry(2.4, 2.4, 2.4);
  const crateSpots = [[-101,306],[-98.6,306],[-99.8,308.4],[-90,318],[-101,344],[-91,346],[-99,346.5]];
  for (const [cx, cz] of crateSpots){
    const c = new THREE.Mesh(crateGeo, crateMats[(Math.random()*3)|0]);
    c.position.set(cx, 1.5, cz); c.rotation.y = rand(-0.2,0.2); c.castShadow = true;
    scene.add(c); addBoxCollider(cx, cz, 2.6, 2.6);
  }
  addLamp(-102.5, 304); addLamp(-102, 350); addLamp(-90, 350);
}

// ---------- Karakter pemain (orang-orangan primitif + topi) ----------
function makeCharacter(){
  const grp = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xc98a5e });
  const shirt = new THREE.MeshLambertMaterial({ color: 0x14b8a6 });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2c3e70 });
  const capM = new THREE.MeshLambertMaterial({ color: 0xff5da2 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.85, 0.4), shirt);
  torso.position.y = 1.12; torso.castShadow = true; grp.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.48, 0.44), skin);
  head.position.y = 1.85; head.castShadow = true; grp.add(head);
  const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.32, 0.16, 10), capM);
  capTop.position.y = 2.14; grp.add(capTop);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.06, 0.34), capM);
  brim.position.set(0, 2.06, 0.34); grp.add(brim);
  function limb(mat, w, len, x, y){
    const pivot = new THREE.Group(); pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
    m.position.y = -len/2; m.castShadow = true; pivot.add(m); grp.add(pivot);
    return pivot;
  }
  const armL = limb(skin, 0.2, 0.78, -0.48, 1.5), armR = limb(skin, 0.2, 0.78, 0.48, 1.5);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.16, 0.52),
    new THREE.MeshLambertMaterial({ color: 0x17181d }));
  gun.position.set(0, -0.8, 0.16); gun.castShadow = true; armR.add(gun);   // pistol di tangan kanan
  const legL = limb(pants, 0.26, 0.72, -0.2, 0.72), legR = limb(pants, 0.26, 0.72, 0.2, 0.72);
  grp.userData.parts = { armL, armR, legL, legR };
  scene.add(grp);
  return grp;
}

// ---------- Pilar cahaya checkpoint ----------
function makeCheckpoint(color){
  const grp = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.30,
    side: THREE.DoubleSide, depthWrite:false, blending: THREE.AdditiveBlending });
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(3.0, 3.0, 70, 20, 1, true), mat);
  outer.position.y = 35; grp.add(outer);
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 70, 14, 1, true),
    mat.clone()); inner.material.opacity = 0.5; inner.position.y = 35; grp.add(inner);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(3.0, 0.16, 8, 32),
    new THREE.MeshBasicMaterial({ color }));
  ring.rotation.x = Math.PI/2; ring.position.y = 0.25; grp.add(ring);
  grp.userData = { outer, inner, ring };
  scene.add(grp);
  return grp;
}

populateCity();
buildMotel();
buildDock();

// ---------- State permainan ----------
const car = makeCar(0xd92323, true);
car.position.set(38, 0, 30);
car.userData.heading = 0;
addBoxCollider(38, 30, 3.4, 3.4);
car.userData.collider = boxColliders[boxColliders.length-1];
let activeCar = car;   // mobil yang sedang dikendarai (bisa berganti ke mobil mana pun)
const character = makeCharacter();
character.position.set(34, 0, 20);

const S = {
  started:false, paused:false, mode:'foot',   // 'foot' | 'car'
  carHeading: 0, carSpeed: 0, steer: 0,
  charHeading: Math.PI, walkPhase: 0,
  camYaw: Math.PI, camPitch: 0.34, dragTimer: 0,
  money: 0, health: 100, lastCrashAt: -9,
  ammo: 12, reserve: 120, shotCd: 0, reloadT: 0, heat: 0, aimUntil: 0,
  wanted: 0, wantedTimer: 0,
  missionIdx: 0, freeRoam: false,
  time: 0,
};
const MISSIONS = [
  { title:'MISI 1 — Menuju Pink Motel', sub:'Capai pilar cahaya pink di Pink Motel', target: CHECK1, color: 0xff5da2, reward: 500 },
  { title:'MISI 2 — Ambil Paket di Dermaga', sub:'Capai pilar cahaya biru di ujung dermaga selatan', target: CHECK2, color: 0x39d5ff, reward: 750 },
];
let checkpoint = makeCheckpoint(MISSIONS[0].color);
checkpoint.position.set(CHECK1.x, 0, CHECK1.z);

// ---------- DOM HUD ----------
const el = id => document.getElementById(id);
const hud = { mission: el('missionText'), banner: el('banner'), money: el('money'), stars: el('stars'),
  health: el('healthFill'), prompt: el('prompt'), speedo: el('speedo'), ammo: el('ammo'),
  start: el('startOverlay'), pause: el('pauseOverlay') };
const mm = el('minimap').getContext('2d');
function setMissionText(){
  if (S.freeRoam) hud.mission.innerHTML = 'FREE ROAM<small>Jelajahi Vice Blocks sesukamu — nabrak lampu nambah bintang!</small>';
  else { const m = MISSIONS[S.missionIdx]; hud.mission.innerHTML = m.title + '<small>' + m.sub + '</small>'; }
}
function showBanner(main, sub){
  hud.banner.innerHTML = main + '<small>' + sub + '</small>';
  hud.banner.classList.add('show');
  setTimeout(()=>hud.banner.classList.remove('show'), 2600);
}
function renderStars(){
  let h = '';
  for (let i=0;i<5;i++) h += '<span class="'+(i<S.wanted?'':'off')+'">★</span>';
  hud.stars.innerHTML = h;
}
function renderMoney(){ hud.money.textContent = '$' + S.money.toLocaleString('en-US'); }
function renderAmmo(){
  if (!hud.ammo) return;
  hud.ammo.innerHTML = S.reloadT > 0 ? '&middot;&middot;&middot; <small>/ ' + S.reserve + '</small>'
    : S.ammo + ' <small>/ ' + S.reserve + '</small>';
}
setMissionText(); renderStars(); renderMoney(); renderAmmo();

// ---------- Simpan / lanjutkan (localStorage) ----------
const SAVE_KEY = 'vbSaveV1';
function saveGame(){
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ money: S.money, missionIdx: S.missionIdx, freeRoam: S.freeRoam })); } catch(e){}
}
function loadSave(){
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    return (s && typeof s.money === 'number' && typeof s.missionIdx === 'number') ? s : null;
  } catch(e){ return null; }
}
function beginGame(mode){
  if (S.started) return;
  const sv = mode === 'continue' ? loadSave() : null;
  if (sv){
    S.money = sv.money | 0;
    S.missionIdx = Math.min(Math.max(sv.missionIdx | 0, 0), MISSIONS.length);
    S.freeRoam = !!sv.freeRoam || S.missionIdx >= MISSIONS.length;
  } else {
    S.money = 0; S.missionIdx = 0; S.freeRoam = false;
    if (mode === 'new') saveGame();
  }
  if (S.freeRoam){ checkpoint.visible = false; }
  else {
    const t = MISSIONS[S.missionIdx].target;
    checkpoint.position.set(t.x, 0, t.z); checkpoint.visible = true;
  }
  setMissionText(); renderMoney();
  S.started = true; hud.start.style.display = 'none';
}

// ---------- Input ----------
const keys = {};
let fireHeld = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyF') tryToggleCar();
  if (e.code === 'KeyJ') fireHeld = true;
  if (e.code === 'KeyR') startReload();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
addEventListener('keyup', e => { keys[e.code] = false; if (e.code === 'KeyJ') fireHeld = false; });
const key = c => !!keys[c];
let dragging = false, lastMX = 0, lastMY = 0;
renderer.domElement.addEventListener('pointerdown', e => { dragging = true; lastMX = e.clientX; lastMY = e.clientY; });
addEventListener('pointerup', () => dragging = false);
addEventListener('pointermove', e => {
  if (!dragging) return;
  S.camYaw -= (e.clientX - lastMX) * 0.0052;
  S.camPitch = clamp(S.camPitch + (e.clientY - lastMY) * 0.003, 0.08, 1.05);
  lastMX = e.clientX; lastMY = e.clientY; S.dragTimer = 1.6;
});
el('menuNew').addEventListener('click', () => beginGame('new'));
el('menuContinue').addEventListener('click', () => beginGame('continue'));
if (loadSave()){
  const mc = el('menuContinue'); mc.style.display = '';
  el('menuNew').classList.remove('sel'); mc.classList.add('sel');
}
el('btnResume').addEventListener('click', togglePause);
el('btnRestart').addEventListener('click', () => location.reload());

// ---------- Kontrol sentuh (HP) ----------
// Tombol-tombol DOM di index.html menggerakkan objek `keys` yang sama dengan
// keyboard fisik: ▲=KeyW ▼=KeyS ◀=KeyA ▶=KeyD, F=KeyF (+toggle mobil), LARI=ShiftLeft.
(function(){
  const bindHold = (id, code) => {
    const b = el(id); if (!b) return;
    const on = e => { e.preventDefault(); e.stopPropagation(); keys[code] = true; b.classList.add('on'); };
    const off = e => { if (e){ e.preventDefault(); e.stopPropagation(); } keys[code] = false; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerup', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  };
  bindHold('tcUp', 'KeyW');
  bindHold('tcDown', 'KeyS');
  bindHold('tcLeft', 'KeyA');
  bindHold('tcRight', 'KeyD');
  // Tombol F: tekan = toggle mobil; keys.KeyF ditahan >=150ms supaya tap cepat tidak hilang.
  const bf = el('tcF');
  if (bf){
    let fTimer = null;
    bf.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      keys.KeyF = true; bf.classList.add('on');
      tryToggleCar();
      if (fTimer){ clearTimeout(fTimer); fTimer = null; }
    });
    const fOff = e => {
      if (e){ e.preventDefault(); e.stopPropagation(); }
      bf.classList.remove('on');
      if (fTimer) clearTimeout(fTimer);
      fTimer = setTimeout(() => { keys.KeyF = false; fTimer = null; }, 150);
    };
    bf.addEventListener('pointerup', fOff);
    bf.addEventListener('pointercancel', fOff);
    bf.addEventListener('pointerleave', fOff);
    bf.addEventListener('contextmenu', e => e.preventDefault());
  }
  // Tombol LARI: toggle (latch) ShiftLeft.
  const br = el('tcRun');
  if (br){
    let runOn = false;
    br.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      runOn = !runOn;
      keys.ShiftLeft = runOn;
      br.classList.toggle('on', runOn);
    });
    br.addEventListener('contextmenu', e => e.preventDefault());
  }
})();
// Tombol TEMBAK: tahan = menembak terus (menggerakkan fireHeld, sama seperti tombol J).
(function(){
  const bfire = el('tcFire');
  if (!bfire) return;
  bfire.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); fireHeld = true; bfire.classList.add('on'); fire(); });
  const fOff = e => { if (e){ e.preventDefault(); e.stopPropagation(); } fireHeld = false; bfire.classList.remove('on'); };
  bfire.addEventListener('pointerup', fOff);
  bfire.addEventListener('pointercancel', fOff);
  bfire.addEventListener('pointerleave', fOff);
  bfire.addEventListener('contextmenu', e => e.preventDefault());
})();

function togglePause(){
  if (!S.started) return;
  S.paused = !S.paused;
  hud.pause.style.display = S.paused ? 'flex' : 'none';
}
function playerPos(){ return S.mode === 'car' ? activeCar.position : character.position; }
function nearestCar(maxD){
  let best = null, bd = maxD;
  for (const c of cars){
    const d = character.position.distanceTo(c.position);
    if (d < bd){ bd = d; best = c; }
  }
  return best;
}
function tryToggleCar(){
  if (!S.started || S.paused) return;
  if (S.mode === 'foot'){
    const c = nearestCar(6.5);
    if (c){
      activeCar = c;
      S.carHeading = c.userData.heading || 0; S.carSpeed = 0; S.steer = 0;
      if (c.userData.collider) c.userData.collider.off = true;
      S.mode = 'car'; character.visible = false; hud.prompt.style.display = 'none';
    }
  } else {
    S.mode = 'foot';
    activeCar.userData.heading = S.carHeading;
    if (activeCar.userData.collider){
      const col = activeCar.userData.collider;
      col.minX = activeCar.position.x - 1.7; col.maxX = activeCar.position.x + 1.7;
      col.minZ = activeCar.position.z - 1.7; col.maxZ = activeCar.position.z + 1.7;
      col.off = false;
    }
    const side = new THREE.Vector3(Math.cos(S.carHeading), 0, -Math.sin(S.carHeading));
    character.position.copy(activeCar.position).addScaledVector(side, 2.4);
    character.position.y = 0;
    resolveCollisions(character.position, 0.45);
    character.visible = true;
    S.charHeading = S.carHeading;
  }
}

// ---------- Menembak ----------
function rayBox(ox, oz, dx, dz, b){
  let tmin = 0, tmax = Infinity;
  if (Math.abs(dx) < 1e-8){ if (ox < b.minX || ox > b.maxX) return null; }
  else { let t1 = (b.minX - ox) / dx, t2 = (b.maxX - ox) / dx; if (t1 > t2){ const q = t1; t1 = t2; t2 = q; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null; }
  if (Math.abs(dz) < 1e-8){ if (oz < b.minZ || oz > b.maxZ) return null; }
  else { let t1 = (b.minZ - oz) / dz, t2 = (b.maxZ - oz) / dz; if (t1 > t2){ const q = t1; t1 = t2; t2 = q; } tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2); if (tmin > tmax) return null; }
  return tmin;
}
function rayCircle(ox, oz, dx, dz, cx, cz, r){
  const lx = cx - ox, lz = cz - oz;
  const tca = lx * dx + lz * dz; if (tca < 0) return null;
  const d2 = lx * lx + lz * lz - tca * tca, r2 = r * r; if (d2 > r2) return null;
  return tca - Math.sqrt(r2 - d2);
}
const fx = [];
const tracerGeo = new THREE.BoxGeometry(0.06, 0.06, 1);
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe27a });
const sparkGeo = new THREE.SphereGeometry(0.22, 8, 6);
const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffa63d });
function spawnFx(geo, mat, x, y, z, life, lookX, lookZ, len){
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  if (len){ m.scale.z = len; m.lookAt(lookX, y, lookZ); }
  scene.add(m); fx.push({ m, until: S.time + life });
}
function startReload(){
  if (S.reloadT > 0 || S.reserve <= 0 || S.ammo >= 12) return;
  S.reloadT = 1.15; renderAmmo();
}
function fire(){
  if (!S.started || S.paused || S.reloadT > 0 || S.time < S.shotCd) return;
  if (S.ammo <= 0){ startReload(); return; }
  S.ammo--; S.shotCd = S.time + 0.17; S.aimUntil = S.time + 0.28; renderAmmo();
  const h = S.mode === 'car' ? S.carHeading : S.charHeading;
  const p = playerPos();
  const dx = Math.sin(h), dz = Math.cos(h);
  const ox = p.x + dx * 1.0, oz = p.z + dz * 1.0;
  let bestT = 70, hitC = null;
  for (const b of boxColliders){ if (b.off) continue; const t = rayBox(ox, oz, dx, dz, b); if (t !== null && t > 0.2 && t < bestT){ bestT = t; hitC = null; } }
  for (const c of circleColliders){ if (c.tipped) continue; const t = rayCircle(ox, oz, dx, dz, c.x, c.z, c.r + 0.3); if (t !== null && t > 0.2 && t < bestT){ bestT = t; hitC = c; } }
  const ex = ox + dx * bestT, ez = oz + dz * bestT;
  spawnFx(tracerGeo, tracerMat, (ox + ex) / 2, 1.3, (oz + ez) / 2, 0.07, ex, ez, bestT);
  spawnFx(sparkGeo, sparkMat, ox + dx * 0.7, 1.35, oz + dz * 0.7, 0.05);          // kilat moncong
  if (bestT < 70){ spawnFx(sparkGeo, sparkMat, ex, 1.1, ez, 0.13); if (hitC && Math.random() < 0.5) tipOver(hitC); }
  S.heat++;
  if (S.heat >= 5){ S.heat = 0; S.wanted = Math.min(3, S.wanted + 1); S.wantedTimer = 9; renderStars(); }
  if (S.ammo === 0) startReload();
}

// ---------- Update: mobil ----------
function tipOver(c){
  c.tipped = true; S.wanted = Math.min(3, S.wanted + 1); S.wantedTimer = 9; renderStars();
}
function updateCar(dt){
  const fwdIn = (key('KeyW') || key('ArrowUp')) ? 1 : 0;
  const revIn = (key('KeyS') || key('ArrowDown')) ? 1 : 0;
  const steerIn = ((key('KeyA') || key('ArrowLeft')) ? 1 : 0) - ((key('KeyD') || key('ArrowRight')) ? 1 : 0);
  if (fwdIn) S.carSpeed += 26 * dt;
  if (revIn) S.carSpeed += (S.carSpeed > 0.5 ? -34 : -13) * dt;
  if (!fwdIn && !revIn) S.carSpeed -= S.carSpeed * 1.4 * dt;
  S.carSpeed -= S.carSpeed * 0.35 * dt;                       // drag konstan
  if (Math.abs(S.carSpeed) < 0.04 && !fwdIn && !revIn) S.carSpeed = 0;
  S.carSpeed = clamp(S.carSpeed, -13, 40);
  S.steer += ((steerIn * 0.55) - S.steer) * Math.min(1, dt * 9);
  const sf = clamp(Math.abs(S.carSpeed) / 9, 0, 1) * Math.sign(S.carSpeed);
  S.carHeading += S.steer * 2.1 * sf * dt / 0.55 * 0.55;      // laju belok proporsional
  const prevSpeed = S.carSpeed;
  activeCar.position.x += Math.sin(S.carHeading) * S.carSpeed * dt;
  activeCar.position.z += Math.cos(S.carHeading) * S.carSpeed * dt;
  // nabrak benda kecil (lampu/palem): robohkan kalau kencang
  for (const c of circleColliders){
    if (c.tipped) continue;
    const dx = activeCar.position.x - c.x, dz = activeCar.position.z - c.z;
    if (dx*dx + dz*dz < 2.2*2.2 && Math.abs(S.carSpeed) > 7){ tipOver(c); S.carSpeed *= 0.72; }
  }
  if (resolveCollisions(activeCar.position, 1.75)){
    if (Math.abs(prevSpeed) > 20 && S.time - S.lastCrashAt > 0.7){
      S.health = Math.max(30, S.health - 5); S.lastCrashAt = S.time;
    }
    S.carSpeed *= -0.18;
  }
  activeCar.position.y = 0;
  activeCar.rotation.y = S.carHeading;
  const spin = S.carSpeed * dt / 0.42;
  for (const w of activeCar.userData.wheels) w.rotation.x += spin;
  hud.speedo.style.display = 'block';
  hud.speedo.innerHTML = '<b>' + Math.round(Math.abs(S.carSpeed) * 3.2) + '</b> km/h';
}

// ---------- Update: jalan kaki ----------
function updateFoot(dt){
  hud.speedo.style.display = 'none';
  let ix = ((key('KeyD') || key('ArrowRight')) ? 1 : 0) - ((key('KeyA') || key('ArrowLeft')) ? 1 : 0);
  let iz = ((key('KeyS') || key('ArrowDown')) ? 1 : 0) - ((key('KeyW') || key('ArrowUp')) ? 1 : 0);
  const moving = (ix !== 0 || iz !== 0);
  const run = key('ShiftLeft') || key('ShiftRight');
  if (moving){
    // arah relatif kamera: W = menjauhi kamera
    const sin = Math.sin(S.camYaw), cos = Math.cos(S.camYaw);
    let mx = (-sin) * (-iz) + cos * ix;
    let mz = (-cos) * (-iz) - sin * ix;
    const len = Math.hypot(mx, mz); mx /= len; mz /= len;
    const spd = run ? 10.5 : 5.6;
    character.position.x += mx * spd * dt;
    character.position.z += mz * spd * dt;
    S.charHeading = lerpAngle(S.charHeading, Math.atan2(mx, mz), Math.min(1, dt * 12));
    S.walkPhase += dt * (run ? 11 : 8);
  }
  resolveCollisions(character.position, 0.45);
  // jangan menembus mobil mana pun
  for (const c of cars){
    const dx = character.position.x - c.position.x, dz = character.position.z - c.position.z;
    const d2 = dx*dx + dz*dz, rr = 2.15;
    if (d2 < rr*rr && d2 > 1e-6){ const d = Math.sqrt(d2); character.position.x = c.position.x + dx/d*rr; character.position.z = c.position.z + dz/d*rr; }
  }
  character.position.y = 0;
  character.rotation.y = S.charHeading;
  const p = character.userData.parts, sw = moving ? Math.sin(S.walkPhase) * 0.62 : 0;
  p.legL.rotation.x = sw; p.legR.rotation.x = -sw;
  p.armL.rotation.x = -sw * 0.8; p.armR.rotation.x = sw * 0.8;
  if (S.time < S.aimUntil) p.armR.rotation.x = -1.35;   // lengan mengacungkan pistol sesaat setelah menembak
  // prompt interaksi
  const near = !!nearestCar(6.5);
  hud.prompt.style.display = near ? 'block' : 'none';
}

// ---------- Misi ----------
function updateMission(){
  if (S.freeRoam) return;
  const m = MISSIONS[S.missionIdx];
  const p = playerPos();
  const dx = p.x - m.target.x, dz = p.z - m.target.z;
  if (dx*dx + dz*dz < 5.2 * 5.2){
    S.money += m.reward; renderMoney(); saveGame();
    showBanner('MISSION PASSED', '+$' + m.reward);
    S.missionIdx++;
    if (S.missionIdx >= MISSIONS.length){
      S.freeRoam = true; checkpoint.visible = false; setMissionText();
    } else {
      const nm = MISSIONS[S.missionIdx];
      scene.remove(checkpoint);
      checkpoint = makeCheckpoint(nm.color);
      checkpoint.position.set(nm.target.x, 0, nm.target.z);
      setMissionText();
    }
  }
}

// ---------- Kamera ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt){
  if (!S.started){ // kamera orbit sinematik di balik overlay awal
    S.camYaw += dt * 0.045;
    const cx = MOTEL_POS.x + Math.sin(S.camYaw) * 105, cz = MOTEL_POS.z + Math.cos(S.camYaw) * 105;
    camera.position.set(cx, 55, cz);
    camera.lookAt(MOTEL_POS.x, 8, MOTEL_POS.z);
    return;
  }
  const target = playerPos();
  const targetYaw = S.mode === 'car' ? S.carHeading + Math.PI : S.charHeading + Math.PI;
  S.dragTimer -= dt;
  if (S.dragTimer <= 0) S.camYaw = lerpAngle(S.camYaw, targetYaw, Math.min(1, dt * (S.mode === 'car' ? 2.6 : 3.4)));
  const dist = S.mode === 'car' ? 11.5 : 7.5;
  const cp = S.camPitch;
  camTarget.set(
    target.x + Math.sin(S.camYaw) * Math.cos(cp) * dist,
    target.y + Math.sin(cp) * dist + 1.2,
    target.z + Math.cos(S.camYaw) * Math.cos(cp) * dist);
  camera.position.lerp(camTarget, Math.min(1, dt * 7));
  camera.lookAt(target.x, target.y + 1.6, target.z);
}

// ---------- Minimap ----------
function drawMinimap(){
  const W = 184, C = W/2, range = 380, sc = W / (range * 2);
  const w2m = (x, z) => [C + x * sc, C + z * sc];
  mm.clearRect(0, 0, W, W);
  mm.fillStyle = '#26262e'; mm.fillRect(0, 0, W, W);
  mm.fillStyle = '#17404f'; mm.fillRect(0, C + 296 * sc, W, W);        // laut
  mm.fillStyle = '#3d414c';
  for (const i of BLOCKS) for (const j of BLOCKS){
    const [bx, by] = w2m(i * PITCH - 22, j * PITCH - 22);
    mm.fillRect(bx, by, 44 * sc, 44 * sc);
  }
  const [mx, my] = w2m(MOTEL_POS.x, MOTEL_POS.z);                       // blok motel pink
  mm.fillStyle = '#e56b9a'; mm.fillRect(mx - 22 * sc, my - 22 * sc, 44 * sc, 44 * sc);
  if (!S.freeRoam){                                                      // blip misi berdenyut
    const m = MISSIONS[S.missionIdx], [tx, ty] = w2m(m.target.x, m.target.z);
    mm.fillStyle = S.missionIdx === 0 ? '#ff5da2' : '#39d5ff';
    mm.beginPath(); mm.arc(tx, ty, 4 + Math.sin(S.time * 5) * 1.4, 0, Math.PI * 2); mm.fill();
    mm.strokeStyle = 'rgba(255,255,255,.8)'; mm.stroke();
  }
  for (const c of cars){                                                  // titik semua mobil (aktif = merah)
    const [cx2, cy2] = w2m(c.position.x, c.position.z);
    mm.fillStyle = c === activeCar ? '#ff4040' : '#aeb4bd';
    mm.beginPath(); mm.arc(cx2, cy2, c === activeCar ? 3 : 2, 0, Math.PI * 2); mm.fill();
  }
  const p = playerPos(), [pxx, pyy] = w2m(p.x, p.z);                     // panah pemain
  const h = S.mode === 'car' ? S.carHeading : S.charHeading;
  mm.save(); mm.translate(pxx, pyy); mm.rotate(Math.atan2(Math.sin(h), -Math.cos(h)));
  mm.fillStyle = '#fff'; mm.beginPath(); mm.moveTo(0, -7); mm.lineTo(4.6, 5); mm.lineTo(0, 2.4); mm.lineTo(-4.6, 5);
  mm.closePath(); mm.fill(); mm.restore();
}

// ---------- Loop utama ----------
const clock = new THREE.Clock();
function animate(){
  requestAnimationFrame(animate);
  // Bootstrap inline (index.html) bisa memulai game lewat window.__vbStarted,
  // mis. saat tap di HP terjadi sebelum listener di atas terpasang.
  if (window.__vbStarted && !S.started){ beginGame(window.__vbStartMode || 'new'); }
  const dt = Math.min(clock.getDelta(), 0.05);
  if (S.started && !S.paused){
    S.time += dt;
    if (S.mode === 'car') updateCar(dt); else updateFoot(dt);
    updateMission();
    // simpan progres berkala (untuk menu LANJUTKAN)
    if (S.time - (S.lastSave || 0) > 5){ S.lastSave = S.time; saveGame(); }
    // efek tembakan + isi ulang + tembak tahan
    for (let i = fx.length - 1; i >= 0; i--){ if (S.time > fx[i].until){ scene.remove(fx[i].m); fx.splice(i, 1); } }
    if (S.reloadT > 0){ S.reloadT -= dt; if (S.reloadT <= 0){ const take = Math.min(12 - S.ammo, S.reserve); S.ammo += take; S.reserve -= take; renderAmmo(); } }
    if (fireHeld) fire();
    // wanted decay
    if (S.wanted > 0){ S.wantedTimer -= dt; if (S.wantedTimer <= 0){ S.wanted--; S.wantedTimer = 4; renderStars(); } }
    // regen health
    if (S.health < 100 && S.time - S.lastCrashAt > 3) S.health = Math.min(100, S.health + 3 * dt);
    hud.health.style.width = S.health + '%';
    // animasi benda roboh (miring ke target sesuai arah acak)
    for (const c of circleColliders){
      if (!c.tipped) continue;
      const target = c.tipDir * 1.45, step = dt * 4.5;
      c.obj.rotation.z += clamp(target - c.obj.rotation.z, -step, step);
    }
    // pilar checkpoint berdenyut
    if (checkpoint.visible){
      checkpoint.rotation.y += dt * 0.7;
      const pulse = 0.28 + Math.sin(S.time * 3.2) * 0.08;
      checkpoint.userData.outer.material.opacity = pulse;
    }
    drawMinimap();
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}
animate();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Hook untuk pengujian/screenshot ----------
window.PG = {
  state: S, car, cars, character, THREE, circleColliders, boxColliders,
  get activeCar(){ return activeCar; },
  start(mode){ beginGame(mode || 'new'); },
  fire(){ fire(); },
  enterCar(){ if (S.mode === 'foot') tryToggleCar(); },
  exitCar(){ if (S.mode === 'car') tryToggleCar(); },
  teleportCar(x, z, heading){ activeCar.position.set(x, 0, z); if (heading !== undefined){ S.carHeading = heading; } S.carSpeed = 0; },
  teleportChar(x, z){ character.position.set(x, 0, z); },
  setCam(yaw, pitch){ S.camYaw = yaw; if (pitch !== undefined) S.camPitch = pitch; S.dragTimer = 2.5; },
};
