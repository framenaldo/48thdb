/* A light glTF viewer for 48thdb, built on Three.js (vendored under lib/three/, served
   same-origin so the site keeps no CDN dependency). It opens on a procedural stage that
   stands in for a model exported from Unreal Engine or Blender: pass a `.glb`/`.gltf` url
   as `model` and it loads that instead. Nothing here runs until the viewer is opened, so
   the home page's first paint is untouched. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createStageViewer(canvas, opts = {}){
  const accent = opts.accent || '#E4457E', teal = opts.teal || '#2E8C82';
  const night = opts.night !== false;
  const DPR = Math.min(2, window.devicePixelRatio || 1);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: DPR < 2, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(DPR);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = night ? 1.1 : 1.25;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  camera.position.set(0, 5.5, 11);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.target.set(0, 1.6, 0);
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.9;

  // lights: a warm key over the stage, two coloured washes in the house colours
  const key = new THREE.DirectionalLight(0xfff2e0, night ? 2.2 : 2.6);
  key.position.set(4, 10, 6); scene.add(key);
  scene.add(new THREE.AmbientLight(0xffffff, night ? 0.35 : 0.6));
  const washA = new THREE.SpotLight(new THREE.Color(accent), night ? 55 : 30, 40, 0.5, 0.5, 1.4);
  washA.position.set(-7, 9, 4); washA.target.position.set(-2, 1, 0); scene.add(washA); scene.add(washA.target);
  const washB = new THREE.SpotLight(new THREE.Color(teal), night ? 55 : 30, 40, 0.5, 0.5, 1.4);
  washB.position.set(7, 9, 4); washB.target.position.set(2, 1, 0); scene.add(washB); scene.add(washB.target);

  const content = new THREE.Group(); scene.add(content);
  const spin = new THREE.Group(); content.add(spin);  // what turns under the camera

  let mediaMesh = null;  // the UE5-rendered banner slot (a plane behind the stage)

  function buildStage(){
    const dark = new THREE.MeshStandardMaterial({ color: night ? 0x1a1016 : 0xece4ea, roughness: 0.85, metalness: 0.1 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 64), dark);
    floor.position.y = -0.2; spin.add(floor);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(7, 0.12, 12, 80),
      new THREE.MeshStandardMaterial({ color: accent, emissive: new THREE.Color(accent), emissiveIntensity: night ? 0.7 : 0.2, roughness: 0.4 }));
    lip.rotation.x = Math.PI / 2; lip.position.y = 0.02; spin.add(lip);
    // a back riser and two LED pillars in the two accents
    const riser = new THREE.Mesh(new THREE.BoxGeometry(8, 1, 1.4), dark);
    riser.position.set(0, 0.5, -3); spin.add(riser);
    for(const [x, c] of [[-4.2, accent], [4.2, teal]]){
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.5),
        new THREE.MeshStandardMaterial({ color: c, emissive: new THREE.Color(c), emissiveIntensity: night ? 0.9 : 0.25, roughness: 0.5 }));
      pillar.position.set(x, 3.5, -2.6); spin.add(pillar);
    }
    // six place-markers standing on the stage (swapped for member models from a glTF export)
    const who = new THREE.Group(); spin.add(who);
    for(let i = 0; i < 6; i++){
      const a = (i / 6) * Math.PI - Math.PI / 2, r = 3.6;
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 1.1, 6, 12),
        new THREE.MeshStandardMaterial({ color: i % 2 ? teal : accent, roughness: 0.6, metalness: 0.15 }));
      body.position.y = 1.1; g.add(body);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 20, 16),
        new THREE.MeshStandardMaterial({ color: 0xf2d9c4, roughness: 0.7 }));
      head.position.y = 2.1; g.add(head);
      g.position.set(Math.cos(a) * r, 0, Math.sin(a) * r + 0.5);
      g.lookAt(0, 1.4, 20); who.add(g);
    }
  }

  // the UE5 / rendered-media slot: a big plane behind the stage carrying an image or video
  function setMedia(url, isVideo){
    if(mediaMesh){ spin.remove(mediaMesh); mediaMesh.material.map?.dispose?.(); mediaMesh.geometry.dispose(); mediaMesh = null; }
    if(!url) return;
    let tex;
    if(isVideo){
      const v = document.createElement('video'); v.src = url; v.loop = true; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous'; v.play().catch(() => {});
      tex = new THREE.VideoTexture(v);
    } else tex = new THREE.TextureLoader().load(url);
    tex.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12, 6.75),
      new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    plane.position.set(0, 4.4, -4.2); spin.add(plane); mediaMesh = plane;
  }

  let model = null;
  function loadModel(url){
    return new Promise((res, rej) => {
      new GLTFLoader().load(url, gltf => {
        if(model) spin.remove(model);
        // drop the placeholders for a real export
        spin.clear(); buildFloorOnly();
        model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model), size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
        const s = 6 / Math.max(size.x, size.y, size.z); model.scale.setScalar(s);
        model.position.sub(mid.multiplyScalar(s)); model.position.y += size.y * s / 2;
        spin.add(model); res(gltf);
      }, undefined, rej);
    });
  }
  function buildFloorOnly(){
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 0.4, 64),
      new THREE.MeshStandardMaterial({ color: night ? 0x1a1016 : 0xece4ea, roughness: 0.85 }));
    floor.position.y = -0.2; spin.add(floor);
  }

  if(opts.model) loadModel(opts.model).catch(() => buildStage()); else buildStage();
  if(opts.media) setMedia(opts.media, opts.mediaVideo);

  let raf = 0, alive = true;
  function resize(){
    const w = canvas.clientWidth || canvas.parentElement.clientWidth, h = canvas.clientHeight || Math.round(w * 0.62);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function loop(){ if(!alive) return; raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); }
  resize(); loop();
  const ro = new ResizeObserver(resize); ro.observe(canvas.parentElement || canvas);

  return {
    setMedia, loadModel,
    setAutoRotate(on){ controls.autoRotate = on; },
    dispose(){ alive = false; cancelAnimationFrame(raf); ro.disconnect(); controls.dispose(); pmrem.dispose();
      renderer.dispose(); scene.traverse(o => { o.geometry?.dispose?.(); if(o.material){ (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.map?.dispose?.(); m.dispose?.(); }); } }); }
  };
}
