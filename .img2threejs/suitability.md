# Reference suitability verdict — references/player.png

Rubric: `grimoire/intake/validation_rubric.md`.

## Verdict: **character-conditional → stylized** (proceed)

Not a plain `pass`, because the rubric routes any humanoid subject through the character track
rather than the generic object track. Not a `reject` — none of the reject conditions hold.

### Why it qualifies

| Rubric criterion | Evidence in this sheet |
|---|---|
| one obvious target | a single male figure, repeated across panels |
| enough of the frame | figure panels occupy the majority; admission measured foreground coverage **0.826** |
| strong silhouette | A-pose turnaround gives a clean outline on a flat grey field |
| major materials visible | skin, hair, saffron cloth, cream cord, rudraksha bead — each with a dedicated crop |
| hidden side inferable | **front, back and side are all supplied** — this is better than the usual single view |
| approximable with primitives | body = tapered capsules/lofts, garment = wrapped cloth, beads = furrowed spheres |

Deterministic admission gate: **admitted**, no reasons against, largest connected component
0.987 of the foreground, no duplicate-angle collision.

### Stylization level — flagged, not assumed

The rubric explicitly forbids assuming a realism tier. Recorded position:

- The sheet's own anatomy panel draws an **8-head canon**; the rendered turnaround measures
  **~7.5 heads**. "Keep the proportions" therefore targets **realistic ~7.5 heads**.
- This differs from the character currently in the game, which is **3.6 heads**.
- **Not silently applied to the game.** This pipeline produces a standalone model; whether it
  replaces the in-game devotee is a separate decision for the user, who reverted an earlier
  re-proportioning.

### Not maximum-likeness

Routing as `stylized`, not `maximum likeness`: the subject is an original stylised character,
not a specific real person, and the target is a real-time game model. Projection/de-lighting of
the reference's pixels is therefore **not** the fidelity route here — the finish is flat cel
colour, which the rubric's own rule of thumb ("solid albedo for flat paint, real reference crop
for patterned finishes") routes to procedural material.

### Known limits carried forward

- dhoti hem length is inconsistent between turnaround and hero pose (`uncertain`)
- embroidered hem border is below geometry scale — material-only (`uncertain`)
- sole of foot, underside of bun (`hidden`)
- printed anatomy labels are garbled and unusable as measurements (`undetermined`)
