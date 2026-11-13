/*
 * DRAGONS: everything that makes one dragon different from another lives here.
 * To add a dragon: repack its Meshy GLB (tools/repack_glb.py), put it in public/models/,
 * and add an entry below. `bones` maps the game's body parts to the names in that model's skeleton.
 *
 * Meshy "Smart Rig" skeletons number bones differently for every dragon, so look at the bone
 * hierarchy (python tools/inspect_bones.py model.glb) and match the body parts by position.
 */

export const DRAGONS = {
  gloomjaw: {
    name: 'Gloomjaw', tag: 'Void dragon',
    model: 'models/gloomjaw.glb',
    world: 'void',                              // which biome it lives in (themes in world.js)
    size: 7,                                   // longest side of the model in world units
    voice: 1,                                   // roar pitch (1 = normal, higher = squeakier)
    breath: { colors: [0xeccbff, 0xb14dff, 0x5e18c8], star: [0xffffff, 0xd9b3ff], light: 0xa040ff },
    wing: { offset: 0, scale: 1, fold: 0 },     // flap tweaks if the model's wings rest differently (fold = extra tuck on the ground)
    tune: {},                                   // overrides for TUNE in motion.js
    bones: {
      spine: 'Bone_003', chest: 'Bone_002', neck: 'Bone_021', head: 'Bone_020',
      jaw: 'Bone_033', skull: 'Bone_035', mouth: 'Bone_032',
      shoulders: ['Bone_041', 'Bone_047'],      // front-leg roots that ride on the head bone (counter-rotated)
      wr: ['Bone_025', 'Bone_024', 'Bone_023'], wl: ['Bone_028', 'Bone_027', 'Bone_026'],
      frF: [['Bone_049', 'Bone_048'], ['Bone_052', 'Bone_051', 'Bone_050']],
      flF: [['Bone_054', 'Bone_053'], ['Bone_057', 'Bone_056', 'Bone_055']],
      tail: ['Bone_019', 'Bone_018', 'Bone_017', 'Bone_016', 'Bone_015', 'Bone_014'],
      legs: [
        { hip: 'Bone_039', knee: 'Bone_038', ankle: 'Bone_037', toe: 'Bone_036', front: 1, side: 1, walk: 0.75, run: 0.5 },
        { hip: 'Bone_045', knee: 'Bone_044', ankle: 'Bone_043', toe: 'Bone_042', front: 1, side: -1, walk: 0.25, run: 0.6 },
        { hip: 'Bone_013', knee: 'Bone_012', ankle: 'Bone_010', toe: 'Bone_009', front: 0, side: 1, walk: 0.5, run: 0.1 },
        { hip: 'Bone_008', knee: 'Bone_007', ankle: 'Bone_005', toe: 'Bone_004', front: 0, side: -1, walk: 0, run: 0 },
      ],
    },
  },

  emberclaw: {
    name: 'Emberclaw', tag: 'Inferno dragon',
    model: 'models/emberclaw.glb',
    world: 'lava',
    size: 7,
    voice: 1.25,
    breath: { colors: [0xfff1b0, 0xff8a1e, 0xb02a08], star: [0xffffff, 0xffd27a], light: 0xff7a20 },
    // this model's wings rest raised: flap lower in the air, and on the ground sweep them back along the body
    // (foldSweep = swing back, foldWrist = bend the tip, riderFold = how much of that fold stays with a rider on)
    wing: { offset: -0.5, scale: 1, fold: 0, foldSweep: 0.75, foldWrist: 0.3, riderFold: 0.5 },
    rider: { forward: -0.9, scale: 1 },            // seat behind the wing roots (world units along the back)
    tune: {},
    bones: {
      spine: 'Bone_003', chest: 'Bone_002', neck: 'Bone_027', head: 'Bone_025',
      jaw: null, skull: null, mouth: 'Bone_023',   // no jaw bone: the head bows into the breath instead
      shoulders: [],                              // front legs hang off the chest here, nothing to counter-rotate
      wr: ['Bone_044', 'Bone_043', 'Bone_042'], wl: ['Bone_048', 'Bone_047', 'Bone_046'],
      frF: [['Bone_041']], flF: [['Bone_045']],   // wing tips act as the "fingers"
      tail: ['Bone_022', 'Bone_021', 'Bone_020', 'Bone_019', 'Bone_018', 'Bone_017', 'Bone_016'],
      legs: [
        { hip: 'Bone_032', knee: 'Bone_031', ankle: 'Bone_030', toe: 'Bone_029', front: 1, side: 1, walk: 0.75, run: 0.5 },
        { hip: 'Bone_038', knee: 'Bone_037', ankle: 'Bone_036', toe: 'Bone_035', front: 1, side: -1, walk: 0.25, run: 0.6 },
        { hip: 'Bone_010', knee: 'Bone_009', ankle: 'Bone_007', toe: 'Bone_006', front: 0, side: 1, walk: 0.5, run: 0.1 },
        { hip: 'Bone_015', knee: 'Bone_014', ankle: 'Bone_012', toe: 'Bone_011', front: 0, side: -1, walk: 0, run: 0 },
      ],
    },
  },
};

export const DRAGON_IDS = Object.keys(DRAGONS);
export const DEFAULT_DRAGON = 'gloomjaw';
