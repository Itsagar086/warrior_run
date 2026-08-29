# Regression suites

Each script boots the real game headless (Chrome + swiftshader) and asserts
against the live modules. Run any of them from the project root:

    node devtools/tests/collisiontest.mjs   # 20-case fairness matrix: every hazard x run/jump/slide
    node devtools/tests/stagetest.mjs       # difficulty stages: spawn gaps, paired hazards, power economy
    node devtools/tests/eternaltest.mjs     # the Eternal Ascent lifecycle, 17 checks end to end
    node devtools/tests/runtest.mjs         # live gameplay: boot, run, real slide trigger + recovery
    node devtools/tests/playertest.mjs      # character rig: parts contract, skinned-vertex deformation
    node devtools/tests/preview.mjs [asura] # renders the warrior (or demon) alone to .img2threejs/renders/

Notes:
- Chrome must be installed; scripts find it in Program Files.
- The headless renderer runs the game in slow motion (the 144Hz catch-up clamp
  turning lag into slow-mo), so timing-feel is verified numerically, not by eye.
- Each script serves the repo on its own port and cleans up after itself.
