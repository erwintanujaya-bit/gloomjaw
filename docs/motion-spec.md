You are an expert creature animator and three.js developer.

GOAL
Rewrite the procedural Walk, Run, and Fly motions of my dragon "Gloomjaw"
so they look natural and realistic, like a heavy four-legged dragon in a
modern game. Keep everything else on the page working (Flap Wings,
Breathe Fire, Roar, camera follow, sounds, buttons).

TECH SETUP (do not change)
- Single HTML file, three.js r128 UMD from cdnjs, OrbitControls and
  GLTFLoader r128 from jsdelivr.
- Model: Meshy Smart Rig GLB, no built-in animations. Bones are posed by
  code with pose(bone, angleX, angleY, angleZ), which rotates a bone around
  WORLD axes measured at rest pose (X = sideways, Y = up, Z = forward).
  Positive X rotation swings a leg backward and tips the head down.
- Model faces +Z. Wingspan is scaled to 7 units, body height ~3.4 units.

BONE MAP
- Spine: Bone_000 (root) > Bone_001 > Bone_003 > Bone_002 (chest)
- Neck: Bone_022 > Bone_021 > Bone_020 (head base; front legs are its
  children, so counter-rotate Bone_041/Bone_047 when the head moves)
- Head: Bone_035 > Bone_034 (skull/snout), Bone_033 > Bone_032 (lower jaw)
- Front right leg: Bone_041 > 040 > 039 (upper) > 038 (lower) > 037 (ankle) > 036 (toe)
- Front left leg: Bone_047 > 046 > 045 > 044 > 043 > 042
- Back right leg: Bone_013 (thigh) > 012 (knee) > 011 > 010 (ankle) > 009 (toe)
- Back left leg: Bone_008 > 007 > 006 > 005 > 004
- Right wing: Bone_025 (root) > 024 > 023 (wrist) > fingers 049/048, 052/051/050
- Left wing: Bone_028 > 027 > 026 > fingers 054/053, 057/056/055
- Tail: Bone_019 > 018 > 017 > 016 > 015 > 014 (tip)

WALK (heavy, deliberate)
- Lateral-sequence gait: back-left, front-left, back-right, front-right.
- At least 3 feet on the ground at all times (duty factor ~0.65).
- No foot sliding: plant feet in world space while in stance, using simple
  two-bone IK (hip + knee) so the foot stays put as the body moves over it.
  Match forward speed to stride length x step rate.
- Lift feet with a clear arc, soles facing down, toes curling slightly on lift.
- Weight shift: hips and shoulders rise and fall with each step, body rolls
  slightly toward the planted side, shoulder blades visibly roll.
- Head stays stable (counter-bob the neck), slight look-around.
- Wings folded tight against the body with a small sway.
- Tail follows the hips with a delay along each segment (secondary motion,
  use a spring/damper per segment, not a plain sine wave).

RUN (powerful gallop)
- Rotary gallop with a short airborne (suspension) phase.
- Spine flexes when legs gather under the body, extends when they reach out.
- Bigger head and neck pump, head lower and forward.
- Wings half-open for balance, fluttering slightly.
- Tail held straighter and higher as a counterbalance.
- Lean into turns (roll toward the circle's center).
- Feet plant hard, no sliding, small dust-like body impact on landing.

FLY
- Takeoff: crouch for 0.4 s, push off with back legs, 2 to 3 big fast
  flaps while climbing nose-up.
- Flap cycle: fast powerful downstroke (~40% of the cycle), slower upstroke
  with the wings folding at the wrist (Bone_023/Bone_026) to reduce drag.
- Body rises slightly on each downstroke and dips on the upstroke.
- Mix flapping with gliding: wings spread and still for 1 to 2 s, small
  wingtip adjustments.
- Bank into turns, roll proportional to turn rate; pitch follows climb/dive.
- Tail acts as a rudder (curves into turns), slight wave.
- Legs hang loose and straight down, soles facing the ground, toes drooping,
  swaying gently with the air. NOT tucked palm-up.
- Landing: flare (nose up, wings forward and back-flapping to brake),
  legs reach down first, then absorb the impact with a crouch and settle.

GENERAL RULES
- Use ease-in/ease-out curves, never linear motion.
- Overlapping action: neck, tail, wingtips lag behind the body.
- Blend between idle, walk, run, fly over 0.3 to 0.5 s; no snapping.
- Add tiny procedural noise so loops don't look robotic.
- Keep frame time light enough for phones (no heavy physics libraries).
- Explain briefly which bones you changed and any value I can tweak
  (step speed, stride length, flap speed, glide length).

Return the complete updated HTML file.