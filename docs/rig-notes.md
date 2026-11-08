# Gloomjaw rig notes

## Model
- Meshy Smart Rig. Root node `SmartRigArmature`, skinned mesh `output_unwrapped`,
  58 bones named `Bone_000` … `Bone_057` (names say nothing; the map below is
  from bone positions and skin weights).
- Model space: **+Z = forward (head)**, +Y = up, X = sideways. Height 1.7,
  wingspan ±1.77 in X, length ±1.67 in Z. The prototype scales the model so
  the largest dimension is 7 world units.
- One material `BakedMaterial`: baseColor, normal, metallicRoughness, plus the
  added emissive map (pulse `emissiveIntensity` ~1.1, flare on roar/fire).

## Bone map
| Part | Bones (parent > child) |
|---|---|
| Spine | `000` (root) > `001` > `003` > `002` (chest) |
| Neck | `022` > `021` > `020` (head base) |
| Upper head / skull + snout | `035` > `034` (most head vertices) |
| Lower jaw | `033` > `032` (jaw tip; fire comes from here) |
| Chin/throat | `031` > `030` > `029` (few vertices) |
| Front right leg | `041` (shoulder) > `040` > `039` (upper) > `038` (lower) > `037` (ankle) > `036` (toe) |
| Front left leg | `047` > `046` > `045` > `044` > `043` > `042` |
| Back right leg | `013` (thigh) > `012` (knee) > `011` > `010` (ankle) > `009` (toe) |
| Back left leg | `008` > `007` > `006` > `005` (ankle) > `004` (toe) |
| Right wing | `025` (root) > `024` > `023` (wrist) > fingers `049`>`048`, `052`>`051`>`050` |
| Left wing | `028` > `027` > `026` (wrist) > fingers `054`>`053`, `057`>`056`>`055` |
| Tail | `019` > `018` > `017` > `016` > `015` > `014` (tip) |

**Gotcha:** the front legs are children of the head base `020`. When the neck
or head rotates, counter-rotate the shoulders `041`/`047` by the same amount
or the front feet swing with the head.

## Posing convention (from the prototype)
At load, for each bone store its rest quaternion and the **world X/Y/Z axes
expressed in the bone's local frame** (using the inverse of its rest world
quaternion, model unrotated). Then:

```
pose(bone, ax, ay, az): q = rest * rot(localX, ax) * rot(localY, ay) * rot(localZ, az)
```

So angles are about model axes as they were at rest:
- +X rotation: leg swings **backward**, head/jaw tips **down**, tail tips **up**.
- Wings: rotation about Z lifts the wing; right wing (+x) uses `+a`, left uses `-a`.
  Rotation about Y sweeps the wingtip back (right `+`, left `-`).

## Legs
- Knee fold direction is measured at load (rotate knee ±0.5, see which raises
  the toe) → `L.ks`.
- Ground IK: two-bone solve in the leg's side (Y-Z) plane in model space,
  hip `039/045/013/008`, knee `038/044/012/007`, end = ankle `037/043/010/005`.
  Ankle counter-rotates to keep the sole flat; toes curl during swing.
- Gait phase offsets: walk (lateral sequence) BL 0, FL .25, BR .5, FR .75;
  run (rotary gallop) BL 0, BR .1, FR .5, FL .6. Duty: walk .66, run .40.
- Air: legs hang soles-down, slight sway, ankles droop. Blend IK→air by altitude.

## Known limits
- Leg IK ignores sideways (X) offset and assumes small body roll.
- Fingers are not animated yet (Phase 1 adds a small flight twitch).
