# Roadmap (context only: build Phase 1 now)

1. **Phase 1:** controls + Void Jungle (see `phase1-spec.md`).
2. **Phase 2:** all five biomes from the poster, each its own map, connected
   by portals:
   - Plains: open fields, rivers, windmills, villages. Butterflies, wind.
   - Forest: giant trees, treehouses, hidden ruins. Fireflies.
   - Ice: snowy peaks, crystal caves, frozen lakes. Falling snow.
   - Volcano: lava rivers, ash canyons, magma caverns. Embers.
   - Void: floating islands, black-hole rift. Stars, purple motes.
3. **Phase 3:** things to do: collect crystals, fire breaks rocks / melts ice,
   portals unlock with crystals, progress saved.
4. **Phase 4:** polish: music, more sounds, title art, other dragons from the
   poster (made in Meshy, compressed with `tools/repack_glb.py`).

Design the code so a biome is a self-contained module (terrain, props,
lighting, particles, ambience) and adding one is easy.
