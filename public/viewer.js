// Loaded only when an explicitly licensed, weapon-specific glTF asset is registered.
export async function createModelViewer(container, asset) {
  if (
    !asset?.model ||
    !asset.license ||
    !asset.sourceUrl ||
    !/\.glb$|\.gltf$/.test(asset.model)
  )
    return null;
  const THREE = await import("three");
  const { OrbitControls } = await import(
    "three/addons/controls/OrbitControls.js"
  );
  const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
  camera.position.set(0, 0.2, 3);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 0.7;
  controls.maxDistance = 6;
  scene.add(new THREE.HemisphereLight(0xdce8e8, 0x29211a, 3));
  const key = new THREE.DirectionalLight(0xffffff, 4);
  key.position.set(3, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff8b45, 2);
  rim.position.set(-3, 1, -2);
  scene.add(rim);
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    renderer.setAnimationLoop(null);
    controls.dispose();
    scene.traverse((object) => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material)
        ? object.material
        : object.material
          ? [object.material]
          : [];
      for (const m of materials) {
        for (const v of Object.values(m))
          if (v?.isTexture) {
            v.source?.data?.close?.();
            v.dispose();
          }
        m.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
  const observer = new ResizeObserver(() => {
    const r = container.getBoundingClientRect();
    if (r.width && r.height) {
      camera.aspect = r.width / r.height;
      camera.updateProjectionMatrix();
      renderer.setSize(r.width, r.height, false);
    }
  });
  observer.observe(container);
  try {
    const gltf = await new GLTFLoader().loadAsync(asset.model);
    if (disposed) return null;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    gltf.scene.position.sub(center);
    const group = new THREE.Group();
    group.add(gltf.scene);
    group.scale.setScalar(1.8 / Math.max(size.x, size.y, size.z));
    scene.add(group);
    controls.saveState();
    renderer.setAnimationLoop(() => {
      controls.update();
      renderer.render(scene, camera);
    });
    return { dispose, reset: () => controls.reset() };
  } catch (error) {
    dispose();
    throw error;
  }
}
