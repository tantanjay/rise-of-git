import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { useHd } from "@/utils/graphics";

/*
 * The HD graphics layer for a whole view (graphics quality "hd"):
 *  - reflections: a studio environment that only shiny surfaces see (metal, gilding, glazed roofs, water), so matte
 *    ground, stone and wood look exactly as in normal quality;
 *  - bloom: everything bright enough (glows, auras, beams, windows) blooms, at half resolution and below.
 * In "normal" quality neither exists and the view renders exactly as before.
 */

/*
 * Shiny-only reflections. With `scene.environment` set, three.js gives every standard material the scene's
 * `environmentIntensity` (a material's own `envMapIntensity` is ignored), and the environment's diffuse light washes
 * matte surfaces out. So the view passes a *negative* intensity as a flag, and the patched chunk below then drops the
 * environment's diffuse light and keeps its reflection only in proportion to the surface's own shine (metalness, or
 * half for a smooth glaze; a clear coat follows the same mask), per pixel, so castle parts with per-vertex metalness
 * work too. Matte pixels skip the reflection lookup entirely (no GPU cost there). Kept subtle on purpose (docs/RENDERING.md
 * *HD reflections stay subtle*). A positive intensity (the Codex showcases) keeps three's own behaviour.
 */
const SHINY_ONLY = `
#if defined( USE_ENVMAP ) && defined( STANDARD )
  float iblGain = envMapIntensity >= 0.0 ? 1.0 : -max( smoothstep( 0.15, 0.7, metalnessFactor ), 0.5 - 0.5 * smoothstep( 0.15, 0.4, roughnessFactor ) );
#elif defined( USE_ENVMAP )
  float iblGain = envMapIntensity >= 0.0 ? 1.0 : 0.0;
#endif
`;
const IRRADIANCE = "iblIrradiance += getIBLIrradiance( geometryNormal );";
const SPECULAR = "#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )\n";
function patchShinyOnly() {
  const chunk = THREE.ShaderChunk.lights_fragment_maps;
  if (chunk.includes("iblGain") || !chunk.includes(IRRADIANCE) || !chunk.includes(SPECULAR)) return;
  // The chunk ends with the reflection block's #endif: the skip round that block closes just before it
  const end = chunk.lastIndexOf("#endif");
  const body = chunk
    .slice(0, end)
    .replace(IRRADIANCE, `if ( envMapIntensity >= 0.0 ) ${IRRADIANCE}`)
    .replace(SPECULAR, `${SPECULAR}if ( iblGain != 0.0 ) {\n`)
    .replace("radiance += iblRadiance;", "radiance += iblRadiance * iblGain;")
    .replace("clearcoatRadiance += getIBLRadiance(", "clearcoatRadiance += iblGain * getIBLRadiance(");
  THREE.ShaderChunk.lights_fragment_maps = `${SHINY_ONLY}${body}}\n${chunk.slice(end)}`;
}
patchShinyOnly();

/** Studio reflections for the shiny surfaces of the scene (restored when HD goes off); the Codex's HD stage uses it too */
export function Reflections({ intensity }: { intensity: number }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    // Its render target is what holds the map: disposing only the texture left the target behind on every HD switch
    const envTarget = pm.fromScene(room, 0.04);
    const env = envTarget.texture;
    room.dispose();
    // The map is made: the generator's own buffers and geometries aren't needed while it is in use
    pm.dispose();
    const prev = scene.environment;
    const prevIntensity = scene.environmentIntensity;
    scene.environment = env;
    // Negative: shiny surfaces only (see SHINY_ONLY)
    scene.environmentIntensity = -intensity;
    return () => {
      scene.environment = prev;
      scene.environmentIntensity = prevIntensity;
      envTarget.dispose();
    };
  }, [gl, scene, intensity]);
  return null;
}

/**
 * Keeps a colour finite: min / max return the other operand for NaN on D3D (ANGLE), where the black frames were met.
 * Cheaper than `isnan`, which ANGLE can compile away; 65504 is the largest half float
 */
const finite = (colour: string) => `min(vec4(65504.0), max(vec4(0.0), ${colour}))`;
/** UnrealBloomPass's blur directions (its statics, missing from the types) */
const ACROSS = new THREE.Vector2(1, 0);
const DOWN = new THREE.Vector2(0, 1);

/*
 * Bloom without the work nobody sees (docs/RENDERING.md *Post costs bandwidth*). three's UnrealBloomPass clears each of
 * its targets before a full-screen draw that overwrites every pixel anyway, and ends by blending the bloom over the whole
 * scene buffer at full resolution, which the output pass then reads straight back. Here the clears are dropped and the
 * bloom is added inside the output pass instead (scene + bloom, then tone mapping), saving a full-resolution read and
 * write of the half-float buffer: the same picture, give or take one step of 255 where the old blend rounded the sum to
 * half float.
 */
class LeanBloomPass extends UnrealBloomPass {
  private quad = new FullScreenQuad();

  constructor(resolution: THREE.Vector2, strength: number, radius: number, threshold: number) {
    super(resolution, strength, radius, threshold);
    // One NaN pixel blurred by the bloom blacks out the whole frame (docs/RENDERING.md *Shader math*): drop it here
    const high = this.materialHighPassFilter;
    high.fragmentShader = high.fragmentShader.replace("vec4 texel = texture2D( tDiffuse, vUv );", `vec4 texel = ${finite("texture2D( tDiffuse, vUv )")};`);
    high.needsUpdate = true;
  }

  /** The finished bloom (half resolution), for BloomOutputPass to add */
  get bloomTexture(): THREE.Texture {
    return this.renderTargetsHorizontal[0].texture;
  }

  render(renderer: THREE.WebGLRenderer, _writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    // The quad draws must not clear what they overwrite anyway
    const autoClear = renderer.autoClear;
    renderer.autoClear = false;
    const quad = this.quad;
    const high = this.highPassUniforms as Record<string, THREE.IUniform>;
    high.tDiffuse.value = readBuffer.texture;
    high.luminosityThreshold.value = this.threshold;
    quad.material = this.materialHighPassFilter;
    renderer.setRenderTarget(this.renderTargetBright);
    quad.render(renderer);
    // Blur every mip, each from the one above
    let input = this.renderTargetBright;
    for (let i = 0; i < this.nMips; i++) {
      const blur = this.separableBlurMaterials[i];
      quad.material = blur;
      blur.uniforms.colorTexture.value = input.texture;
      blur.uniforms.direction.value = ACROSS;
      renderer.setRenderTarget(this.renderTargetsHorizontal[i]);
      quad.render(renderer);
      blur.uniforms.colorTexture.value = this.renderTargetsHorizontal[i].texture;
      blur.uniforms.direction.value = DOWN;
      renderer.setRenderTarget(this.renderTargetsVertical[i]);
      quad.render(renderer);
      input = this.renderTargetsVertical[i];
    }
    // Composite the mips (into bloomTexture)
    const composite = this.compositeMaterial.uniforms;
    composite.bloomStrength.value = this.strength;
    composite.bloomRadius.value = this.radius;
    composite.bloomTintColors.value = this.bloomTintColors;
    quad.material = this.compositeMaterial;
    renderer.setRenderTarget(this.renderTargetsHorizontal[0]);
    quad.render(renderer);
    renderer.autoClear = autoClear;
  }

  dispose() {
    super.dispose();
    this.quad.dispose();
  }
}

/** The output pass (tone mapping, colour space) with the bloom added to the scene first, as the old blend did */
class BloomOutputPass extends OutputPass {
  constructor(bloom: LeanBloomPass) {
    super();
    this.uniforms.tBloom = { value: bloom.bloomTexture };
    this.material.fragmentShader = this.material.fragmentShader
      .replace("uniform sampler2D tDiffuse;", "uniform sampler2D tDiffuse;\nuniform sampler2D tBloom;")
      .replace("gl_FragColor = texture2D( tDiffuse, vUv );", `gl_FragColor = ${finite("texture2D( tDiffuse, vUv )")} + texture2D( tBloom, vUv );`);
  }
}

/** Where the scene is drawn while bloom is on (the composer's buffer), for compiling ahead with matching programs */
let sceneTarget: THREE.WebGLRenderTarget | null = null;
/** The render target the view's scene is drawn into: null (the screen) unless bloom is on */
export const hdSceneTarget = () => sceneTarget;

/**
 * Takes over the view's rendering: scene → bloom → tone mapping and colour output. `antialias`: 2× MSAA on the composer's
 * buffers, which the canvas's own antialiasing doesn't reach (~5.6 ms a frame on an integrated GPU at 1400×1050; 4× was
 * +9.3 ms), so it is the player's choice in Game Settings
 */
function Bloom({ antialias }: { antialias: boolean }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const composer = useMemo(() => {
    const c = new EffectComposer(gl);
    c.addPass(new RenderPass(scene, camera));
    // strength, radius, threshold (linear HDR, before tone mapping): only real glows bloom (windows, gold glow, auras),
    // never sunlit white stone, and softly: a strong wide bloom hazes whole castles over (no glare, see docs/RENDERING.md)
    const bloom = new LeanBloomPass(new THREE.Vector2(256, 256), 0.25, 0.2, 1.3);
    c.addPass(bloom);
    c.addPass(new BloomOutputPass(bloom));
    return c;
  }, [gl, scene, camera]);
  useEffect(() => {
    for (const target of [composer.renderTarget1, composer.renderTarget2]) {
      if (target.samples === (antialias ? 2 : 0)) continue;
      target.samples = antialias ? 2 : 0;
      target.dispose(); // made again with the new sample count on its next use
    }
  }, [composer, antialias]);
  useEffect(() => {
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
  }, [composer, gl, size]);
  useEffect(() => {
    // Dev handle for render benchmarks
    const w = window as unknown as { __hdComposer?: EffectComposer };
    if (import.meta.env.DEV) w.__hdComposer = composer;
    sceneTarget = composer.readBuffer;
    return () => {
      if (sceneTarget === composer.readBuffer) sceneTarget = null;
      if (w.__hdComposer === composer) delete w.__hdComposer;
      // The composer frees only its own two buffers: the passes' targets (bloom's 11) leaked on every HD switch
      for (const pass of composer.passes) pass.dispose();
      composer.dispose();
    };
  }, [composer]);
  // Priority 1: R3F stops its own render and this one draws the frame
  useFrame((_, delta) => composer.render(delta), 1);
  return null;
}

export function HdPost() {
  const bloom = useHd("bloom");
  const reflections = useHd("reflections");
  const antialias = useHd("antialias");
  return (
    <>
      {reflections && <Reflections intensity={0.4} />}
      {bloom && <Bloom antialias={antialias} />}
    </>
  );
}
