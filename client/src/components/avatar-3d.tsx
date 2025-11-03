
import { Canvas, useFrame } from '@react-three/fiber';
import { useGLTF, OrbitControls, useAnimations, Loader } from '@react-three/drei';
import { Suspense, useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import { useLocation } from 'wouter';
import * as THREE from 'three';

interface ModelHandle {
  playAnimation: (name: string) => void;
}

interface ModelProps {
  currentAnimation?: string;
  currentMorphTargets?: { [key: string]: number };
  visemes?: { id: number; offset: number }[];
  visemeStartTime?: number | null;
}

const Model = forwardRef<ModelHandle, ModelProps>(({ currentAnimation, currentMorphTargets, visemes, visemeStartTime: visemeStartTimeProp, ...props }, ref) => {
  const group = useRef<THREE.Group>(null);
  const headMesh = useRef<THREE.SkinnedMesh | null>(null);
  const visemeStartTimeRef = useRef<number | null>(null);
  const { scene, animations } = useGLTF('/src/assets/my-avatar-.glb');

    const visemeMappings: { [key: number]: { [key: string]: number } } = {
    0: { sil: 1.0 }, // silence
    1: { aa: 1.0 }, // æ, ə, ʌ - ah sounds
    2: { ih: 1.0 }, // aɪ - eye sound
    3: { ou: 1.0 }, // aʊ - ow sound
    4: { oh: 1.0 }, // ɔ - aw sound
    5: { E: 1.0 }, // ɛ - eh sound
    6: { RR: 1.0 }, // ɝ - er sound
    7: { ih: 1.0 }, // i - ee sound
    8: { oh: 1.0 }, // oʊ - oh sound
    9: { ou: 1.0 }, // u - oo sound
    10: { aa: 1.0 }, // ɑ - ah sound
    11: { E: 1.0 }, // eɪ - ay sound
    12: { PP: 1.0 }, // b, m, p - p sound
    13: { DD: 1.0 }, // d, n, t - d/t sounds (using DD as primary)
    14: { FF: 1.0 }, // f, v - f sound
    15: { kk: 1.0 }, // g, k, ŋ - k/g sounds
    16: { sil: 1.0 }, // h - breathy, use silence
    17: { CH: 1.0 }, // dʒ, ʃ, tʃ, ʒ - ch/sh sounds
    18: { RR: 1.0 }, // l - l sound (similar to r)
    19: { RR: 1.0 }, // r - r sound
    20: { SS: 1.0 }, // s, z - s sound
    21: { TH: 1.0 }, // θ, ð - th sound
  };
  const { actions, mixer } = useAnimations(animations, group);
  const clock = new THREE.Clock();

  // Debug: Log available animation names
  useEffect(() => {
    if (actions) {
      console.log('Available animation names:', Object.keys(actions));
    }
  }, [actions]);

  // Debug: Log available morph target names
  useEffect(() => {
    if (headMesh.current && headMesh.current.morphTargetDictionary) {
      console.log('Available morph target names:', Object.keys(headMesh.current.morphTargetDictionary));
    }
  }, [headMesh]);

  // Debug: Log currentAnimation and actions
  useEffect(() => {
    console.log('currentAnimation:', currentAnimation);
    if (actions) {
      console.log('Available actions:', Object.keys(actions));
    }
  }, [currentAnimation, actions]);

  // Effect to play idle animation by default and handle transitions
  useEffect(() => {
    // Start with the idle animation if present
    if (actions?.idle) {
      actions.idle.reset().play();
    }
  }, [actions]);

  // Keep viseme start time in a ref driven by prop so we align with audio start
  useEffect(() => {
    visemeStartTimeRef.current = visemeStartTimeProp ?? null;
  }, [visemeStartTimeProp]);

  // Effect to play animation when currentAnimation prop changes
  useEffect(() => {
    const animationName = currentAnimation;
    if (!animationName || !actions[animationName] || animationName === 'idle') {
      return; // Do nothing if the animation is idle, not found, or not provided
    }

  // Fix null checks for fromAction and toAction
  const fromAction = actions?.idle || null;
  const toAction = actions?.[animationName] || null;
  if (!toAction || !fromAction) return;

  // Ensure the target starts playing, then crossfade from idle to target
  toAction.reset().play();
  fromAction.crossFadeTo(toAction, 0.3, true);
  toAction.clampWhenFinished = true;
  toAction.loop = THREE.LoopOnce;

    const onFinished = (e: THREE.Event) => {
      if ((e as any).action === toAction) {
        mixer.removeEventListener('finished', onFinished);
        // Return to idle
        fromAction.reset().play();
        toAction.crossFadeTo(fromAction, 0.3, true);
      }
    };

    mixer.addEventListener('finished', onFinished);

    return () => {
      mixer.removeEventListener('finished', onFinished);
    };
  }, [currentAnimation, actions, mixer]);

  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && obj.name === 'mesh_3') {
        headMesh.current = obj as THREE.SkinnedMesh;
      }
    });
  }, [scene]);

  // Effect to apply morph targets when currentMorphTargets prop changes
  useFrame(() => {
    if (headMesh.current) {
      const time = clock.getElapsedTime();
      // 1. Clear all morph targets first (no overlap)
      if (headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
        for (const key in headMesh.current.morphTargetDictionary) {
          const index = headMesh.current.morphTargetDictionary[key];
          if (index !== undefined) {
            headMesh.current.morphTargetInfluences[index] = 0;
          }
        }
      }

      // 2. Handle viseme-based lip sync if visemes are provided
      let visemeApplied = false;
      if (visemes && visemes.length > 0 && visemeStartTimeRef.current) {
        const elapsed = (Date.now() - visemeStartTimeRef.current);
        // Find current viseme
        let currentViseme = visemes[0];
        for (let i = 0; i < visemes.length; i++) {
          if (elapsed >= visemes[i].offset) {
            currentViseme = visemes[i];
          } else {
            break;
          }
        }
        // Apply viseme morphs
        if (headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
          const morphs = visemeMappings[currentViseme.id] || {};
          for (const [morph, value] of Object.entries(morphs)) {
            const index = headMesh.current.morphTargetDictionary[morph];
            if (index !== undefined) {
              headMesh.current.morphTargetInfluences[index] = value;
            }
          }
        }
        visemeApplied = true;
      }

      // 3. Default expression: slight smile and regular blinks (always apply for natural look)
      // Blinking
      if (headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
        const blinkCycle = time % 3;
        let blinkValue = 0;
        if (blinkCycle > 2.8) {
          blinkValue = Math.sin((blinkCycle - 2.8) / 0.2 * Math.PI);
        }
        headMesh.current.morphTargetInfluences[headMesh.current.morphTargetDictionary['eyeBlinkLeft']] = blinkValue;
        headMesh.current.morphTargetInfluences[headMesh.current.morphTargetDictionary['eyeBlinkRight']] = blinkValue;
      }

      // Dynamic idle expression: smoothly animate smile, frown, grin, brow, and subtle mouth/nose movements
      if (!currentMorphTargets || Object.keys(currentMorphTargets).length === 0) {
        // Use time and some randomness for natural movement
        const t = time;
        // Smile and frown alternate gently
        const smile = 0.12 + 0.08 * Math.sin(t * 0.5 + Math.sin(t * 0.13));
        const frown = 0.07 * Math.max(0, Math.sin(t * 0.23 + 1.5));
        // Grin and sneer occasionally
        const grin = 0.06 * Math.max(0, Math.sin(t * 0.17 + 2.1));
        const sneer = 0.04 * Math.max(0, Math.sin(t * 0.19 + 3.2));
        // Brow movement
        const browUp = 0.12 + 0.10 * Math.sin(t * 0.21 + 0.7);
        const browDownL = 0.07 * Math.max(0, Math.sin(t * 0.18 + 1.2));
        const browDownR = 0.07 * Math.max(0, Math.sin(t * 0.18 + 2.2));
        // Subtle nose movement
        const noseSneerL = 0.02 * Math.max(0, Math.sin(t * 0.14 + 1.9));
        const noseSneerR = 0.02 * Math.max(0, Math.sin(t * 0.14 + 2.9));

        // Apply to morph targets
        if (headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
          const dict = headMesh.current.morphTargetDictionary;
          headMesh.current.morphTargetInfluences[dict['mouthSmileLeft']] = smile + grin;
          headMesh.current.morphTargetInfluences[dict['mouthSmileRight']] = smile + grin;
          headMesh.current.morphTargetInfluences[dict['mouthFrownLeft']] = frown;
          headMesh.current.morphTargetInfluences[dict['mouthFrownRight']] = frown;
          headMesh.current.morphTargetInfluences[dict['browInnerUp']] = browUp;
          headMesh.current.morphTargetInfluences[dict['browDownLeft']] = browDownL;
          headMesh.current.morphTargetInfluences[dict['browDownRight']] = browDownR;
          headMesh.current.morphTargetInfluences[dict['noseSneerLeft']] = sneer + noseSneerL;
          headMesh.current.morphTargetInfluences[dict['noseSneerRight']] = sneer + noseSneerR;
          // Force all mouth/jaw morphs to 0 in idle state (but not during visemes)
          if (!visemeApplied) {
            const mouthMorphs = [
              'jawOpen', 'mouthOpen', 'mouthA', 'mouthO', 'mouthU', 'mouthSmileOpen', 'mouthFunnel', 'mouthPucker', 'mouthWide', 'mouthNarrow', 'mouthRound', 'mouthUpperUp', 'mouthLowerDown'
            ];
            for (const morph of mouthMorphs) {
              if (dict[morph] !== undefined) {
                headMesh.current.morphTargetInfluences[dict[morph]] = 0;
              }
            }
          }
      }

      // Force jaw closed always (but not during visemes)
      if (!visemeApplied && headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
        const dict = headMesh.current.morphTargetDictionary;
        if (dict['mouthOpen'] !== undefined) {
          headMesh.current.morphTargetInfluences[dict['mouthOpen']] = 0;
        }
      }

      // 4. Apply backend-driven morph targets (if any)
      if (currentMorphTargets && headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
        for (const key in currentMorphTargets) {
          const index = headMesh.current.morphTargetDictionary[key];
          if (index !== undefined) {
            headMesh.current.morphTargetInfluences[index] = currentMorphTargets[key];
          }
        }
      }
              // Always force all likely mouth/jaw morph targets to 0 unless explicitly set or visemes active
        if (!visemeApplied && headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
          const mouthMorphs = [
            'jawOpen', 'mouthOpen', 'mouthA', 'mouthO', 'mouthU', 'mouthSmileOpen', 'mouthFunnel', 'mouthPucker', 'mouthWide', 'mouthNarrow', 'mouthRound', 'mouthUpperUp', 'mouthLowerDown'
          ];
          for (const morph of mouthMorphs) {
            const idx = headMesh.current.morphTargetDictionary[morph];
            if (idx !== undefined) {
              if (!currentMorphTargets || typeof currentMorphTargets[morph] === 'undefined') {
                headMesh.current.morphTargetInfluences[idx] = 0;
              }
            }
          }
        }

        // Force mouth closed unless talking animation is active or visemes active
        if (currentAnimation !== 'talking' && !visemeApplied && headMesh.current.morphTargetDictionary && headMesh.current.morphTargetInfluences) {
          const mouthMorphs = [
            'jawOpen', 'mouthOpen', 'mouthA', 'mouthO', 'mouthU', 'mouthSmileOpen', 'mouthFunnel', 'mouthPucker', 'mouthWide', 'mouthNarrow', 'mouthRound', 'mouthUpperUp', 'mouthLowerDown'
          ];
          for (const morph of mouthMorphs) {
            const idx = headMesh.current.morphTargetDictionary[morph];
            if (idx !== undefined) {
              headMesh.current.morphTargetInfluences[idx] = 0;
            }
          }
        }
      }
    }
  });

  useImperativeHandle(ref, () => ({
    playAnimation: (name: string) => {
      if (!actions[name] || !actions.idle) return;
      const from = actions.idle;
      const to = actions[name];
      to.reset().play();
      from.crossFadeTo(to, 0.3, true);
      if (name !== 'idle') {
        to.clampWhenFinished = true;
        to.loop = THREE.LoopOnce;
        const onFinished = () => {
          from.reset().play();
          to.crossFadeTo(from, 0.3, true);
          mixer.removeEventListener('finished', onFinished);
        };
        mixer.addEventListener('finished', onFinished);
      }
    }
  }));

  // We only need an effect to ensure all meshes in the model can cast shadows.
  // The positioning and scaling is now handled declaratively in the JSX below.
  useEffect(() => {
    scene.traverse((obj: THREE.Object3D) => {
      if ((obj as THREE.Mesh).isMesh) {
        (obj as THREE.Mesh).castShadow = true;
      }
    });
  }, [scene]);

  // By wrapping the model in a group and applying transformations here,
  // we ensure the position is fixed and doesn't shift on page navigation.
  // The y-position is negative to move the model down, creating the waist-up cutoff.
  // You may need to tweak `position` and `scale` to perfectly frame your avatar.
  return (
    <group {...props} position={[0, -1.8, 0]} scale={1.2}>
      <primitive object={scene} ref={group} />
    </group>
  );
});

interface Avatar3DProps {
  currentAnimation?: string;
  currentMorphTargets?: { [key: string]: number };
  visemes?: { id: number; offset: number }[];
  visemeStartTime?: number | null;
}

export default function Avatar3D({ currentAnimation, currentMorphTargets, visemes, visemeStartTime }: Avatar3DProps) {
  const modelRef = useRef<ModelHandle>(null);
  const [location] = useLocation();
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile screen size
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 640); // Tailwind's 'sm' breakpoint
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // On mount and whenever the chat page is navigated to, trigger waving
  useEffect(() => {
    if (location && location.includes('/chat') && modelRef.current) {
      modelRef.current.playAnimation('waving');
    }
  }, [location]);

  // Camera settings: zoom in more on mobile for bigger appearance
  const cameraPosition: [number, number, number] = isMobile ? [0, -0.1, 2.2] : [0, 0.2, 2.8];
  const cameraFov = isMobile ? 26 : 30;

  return (
    <>
      {/*
        By setting a fixed camera position and FOV, we ensure the framing is always consistent.
        - On mobile: closer position (z=2.0) and narrower FOV (25) to zoom in
        - On desktop: farther position (z=2.8) and wider FOV (30) for normal view
        - `position` is [x, y, z]. A `y` of 0.2 looks slightly down at the model.
        - `fov` (field of view) acts like zoom. A smaller `fov` is more zoomed in.
      */}
      <Canvas dpr={[1, 1.5]} camera={{ position: cameraPosition, fov: cameraFov }} shadows gl={{ antialias: true }}>
        <Suspense fallback={null}>
          <ambientLight intensity={1.2} />
          <directionalLight
            position={[3, 3, 3]}
            intensity={3.5}
            color="#FFDDBB"
            castShadow
            shadow-mapSize-width={1024}
            shadow-mapSize-height={1024}
            shadow-camera-far={15}
          />
          <directionalLight
            position={[-3, 3, 3]}
            intensity={2.5}
            color="#BBDDFF"
            castShadow
          />
          <hemisphereLight groundColor="#000000" color="#ffffff" intensity={1.5} />
          <OrbitControls
            target={[0, 0.2, 0]}
            enableZoom={false}
            enablePan={false}
            enabled={false}
            makeDefault
          />
          <Model ref={modelRef} currentAnimation={currentAnimation} currentMorphTargets={currentMorphTargets} visemes={visemes} visemeStartTime={visemeStartTime} />
        </Suspense>
      </Canvas>
      <Loader />
    </>
  );
}


useGLTF.preload('/src/assets/my-avatar-.glb')