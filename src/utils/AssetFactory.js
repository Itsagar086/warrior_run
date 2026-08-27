// Single access point for every makeXxx mesh generator in the game.
//
// Each builder lives beside the code that gives it behaviour - the player with
// his animation, the hazards with their movement - so this module imports them
// and re-exports them together. The collectibles have no behaviour of their
// own beyond being picked up, so their builders live here.

import { makePlayer } from '../entities/Player.js';
import { makeAsuraDemon } from '../entities/AsuraDemon.js';
import { makeEvilSoul } from '../entities/EvilSoul.js';
import { makeRivalNaga } from '../entities/NagaChaser.js';
import { makeTempleArch, makeFirePit, makeBoulder, makeBrokenRoad } from '../entities/Obstacles.js';
import { makeCobra } from '../entities/CobraSnake.js';
import {
  makeOmGlyph, makeRudrakshaBead,
  makeChakraPickup, makeTrishulPickup, makeShieldPickup
} from '../entities/Collectibles.js';
import { makeGroundSegment } from '../environment/Track.js';
import { makeTrishulProjectile } from '../systems/PowerSystem.js';
import {
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
  makeStonePedestal,
} from '../environment/Environment.js';
import { makeInscription } from '../environment/Track.js';

export {
  makePlayer,
  makeTrishulProjectile,
  makeGroundSegment,
  makeTempleArch,
  makeFirePit,
  makeBoulder,
  makeAsuraDemon,
  makeBrokenRoad,
  makeEvilSoul,
  makeCobra,
  makeRudrakshaBead,
  makeOmGlyph,
  makeChakraPickup,
  makeTrishulPickup,
  makeShieldPickup,
  makeRivalNaga,
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
  makeStonePedestal,
  makeInscription,
};

// Legacy global registry, kept so tooling that pokes at window.__game still works.
window.__game = window.__game || {};
window.__game.factories = Object.assign(window.__game.factories || {}, {
  makePlayer,
  makeTrishulProjectile,
  makeGroundSegment,
  makeTempleArch,
  makeFirePit,
  makeBoulder,
  makeAsuraDemon,
  makeBrokenRoad,
  makeEvilSoul,
  makeCobra,
  makeRudrakshaBead,
  makeOmGlyph,
  makeChakraPickup,
  makeTrishulPickup,
  makeShieldPickup,
  makeRivalNaga,
  makeMountKailash,
  makeSkyDome,
  makeTemplePillar,
  makeTree,
  makeVineCurtain,
  makeTorchBrazier,
  makeStonePedestal,
  makeInscription,
});
