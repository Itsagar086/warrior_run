# Image analysis — references/player.png

Reference: `d:/GAMES/warrior_run/references/player.png` (2808×1536 character reference sheet).
Panels: 360° turnaround (front/back/side), detailed head studies, accessory & texture
breakdown, dhoti draping guide, anatomy & proportions guide, plus a hero running shot.

Observation is separated from inference; inferences are marked **[inf]**.

## Layer 1 — Identification & classification

- Work type: **adult male humanoid character**, bare-chested, wearing a wrapped saffron dhoti.
- Broad classification: biped character, heroic-realistic stylisation (clean cel-shaded
  rendering, no photographic texture noise).
- `objectClass.primaryDomain`: **character**
- Confidence: **0.95** — the sheet is explicitly a character turnaround with an anatomy panel.

## Layer 2 — Overall form & silhouette

- Bounding volume: upright biped, arms in A-pose in the turnaround, mid-stride in the hero shot.
- Proportion: the anatomy panel draws a standard **8-head canon** figure; the rendered
  turnaround reads slightly shorter, ~**7.5 head-units**. **[inf]** the intended build is
  heroic-athletic rather than stocky.
- Hip line sits at ≈ **0.50** of standing height; shoulder span ≈ **2.0 head-widths**;
  waist ≈ **0.62 × shoulder span** (measured across the back panel).
- Symmetry: **bilateral** for the body; the garment and sash break it — a single sash over one
  shoulder, and a dhoti tail hanging on one side only.
- Shape language: **organic**. Torso is a tapered lofted volume (V-taper), limbs are tapered
  capsules, head is an ovoid, the dhoti is a wrapped cloth volume — not a cuboid.

## Layer 3 — Macro → meso → micro decomposition

- **Macro:** head · torso · pelvis+dhoti · arm-l · arm-r · leg-l · leg-r
- **Meso:**
  - head → cranium, face, hair mass, topknot bun, ears, neck
  - torso → pectoral pair, abdominal wall, latissimus pair, deltoid pair, spine channel
  - arm → upper arm, forearm, hand
  - leg → thigh, shin (with calf belly), foot
  - dhoti → waist sash, wrap body, front pleat panel, side tail
- **Micro:** rudraksha necklace · rudraksha armband (both upper arms) · rudraksha wristband
  (both forearms) · rudraksha wrap at the bun base · forehead tilak · janeu sash cord ·
  dhoti hem border · fabric fold ridges

## Layer 4 — Spatial relationships

| subject | predicate | object | contact |
|---|---|---|---|
| head | attached-to | neck | socket |
| hair mass | flush-with | cranium | overlap |
| bun | attached-to | hair mass, crown-rear | embed |
| necklace | encircles | neck base | overlap |
| armband | encircles | upper-arm mid-shaft (**both**) | overlap |
| wristband | encircles | distal forearm (**both**) | overlap |
| janeu sash | spans | shoulder → opposite hip, front **and** back | overlap |
| waist sash | encircles | pelvis, above dhoti | overlap |
| dhoti | wraps | pelvis | overlap |
| dhoti tail | hangs-from | front waist, one side | butt |
| foot | attached-to | shin | socket |

## Layer 5 — Materials & surface (PBR)

| surface | albedo | metalness | roughness | relief / notes |
|---|---|---|---|---|
| skin | warm tan `#c47948`; lit `#d99a6c`, shadow `#a9673c` | 0.0 | ~0.60 | satin sheen on deltoid and lat crests |
| hair | near-black `#1a1216`–`#2c1810` | 0.0 | ~0.35 | banded specular highlight |
| dhoti cloth | saffron `#e8951c`–`#f59e0b` | 0.0 | ~0.85 | woven; texture panel shows a fine damask motif and a gold hem border |
| janeu cord | cream `#efe6d5` | 0.0 | ~0.80 | thin round cross-section |
| rudraksha bead | `#5c2b0c`–`#7a3a10` | 0.0 | ~0.85 | strongly furrowed/knobbly seed relief |

Observation: the highlight along the spine and deltoids is a **lighting** response, not a
lighter albedo — it must not be baked into base colour.

## Layer 6 — Colour & finish

- Skin: warm hue, mid value, mid saturation. Finish **satin**.
- Dhoti: orange hue, mid-high value, **high saturation**. Finish **matte** with sheen at fold
  crests. Fold gradient stops: crest `#f5a92e` (0.0) → mid `#e8951c` (0.5) → trough `#b96a08` (1.0).
- Hair: very low value, **satin**.
- Beads: warm brown, mid-low value, **matte**.

## Layer 7 — Identity-defining features

1. Topknot bun **with a rudraksha wrap at its base** (called out in the head-studies panel)
2. Rudraksha necklace at the throat
3. Rudraksha armbands on **both** upper arms (labelled "Rudraksha" in the front panel)
4. Rudraksha wristbands on both forearms
5. Cream **janeu** sash crossing chest and back diagonally (labelled "Single sash")
6. Red vertical **tilak** on the forehead
7. Saffron dhoti: single waist sash, asymmetric drape, side tail
8. **Bare feet**
9. Bare athletic torso with readable lat/abdominal separation

## Layer 8 — Uncertainty & single-image limits

- The sheet supplies front, back and side, so very little is *hidden* — unusually complete.
- **uncertain:** dhoti hem length. Turnaround reads mid-calf; the hero shot rides higher on the
  lifted leg. **[inf]** the garment is above the knee at the sides and lower at the tail.
- **uncertain:** the embroidered hem border is below the resolution at which geometry could
  carry it; it is a material-scale detail, not geometry.
- **hidden:** sole of the foot; underside of the bun.
- **undetermined:** the anatomy panel's printed labels are garbled ("Flioiny", "=3''",
  "2.5 cm") and are **not** usable as numeric measurements. Proportion is therefore taken from
  the drawn 8-head canon and the measured turnaround, not from those labels.

## Layer → assessment mapping

| Layer | Feeds |
|---|---|
| 1 | `objectClass.primaryType` = humanoid-character, `primaryDomain` = character |
| 2 | complexity tier, `referenceCamera` framing, head-unit proportion lock |
| 3 | `componentTree` macro/meso/micro, `minimumSpecDepth` |
| 4 | `attachment` sockets and contact types |
| 5 | `materials` PBR channels |
| 6 | `colorMaterialRecipe`, fold gradient stops |
| 7 | `detailInventory` + `featureReviewTargets` |
| 8 | `unknownsToResolveBeforeImplementation` |
