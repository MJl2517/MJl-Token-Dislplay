import assert from "node:assert/strict";
import test from "node:test";
import {getArgonHands, getHands, getHealthArcSegments, parseHealthDelta} from "./token-display.mjs";

test("reserves distinct arc segments for a maximum bonus and temporary hit points", () => {
  assert.deepEqual(getHealthArcSegments({value: 12, max: 24, effectiveMax: 40, temp: 8}), {
    ratio: 0.3, baseEnd: 0.5, maxEnd: 40 / 48, filledEnd: 0.25
  });
  assert.deepEqual(getHealthArcSegments({value: 40, max: 24, effectiveMax: 40, temp: 8}), {
    ratio: 1, baseEnd: 0.5, maxEnd: 40 / 48, filledEnd: 40 / 48
  });
  assert.deepEqual(getHealthArcSegments({value: 0, max: 40, effectiveMax: 20, temp: 0}), {
    ratio: 0, baseEnd: 1, maxEnd: 1, filledEnd: 0
  });
  assert.deepEqual(getHealthArcSegments({value: 0, max: 0, effectiveMax: 0, temp: 5}), {
    ratio: 0, baseEnd: 0, maxEnd: 0, filledEnd: 0
  });
});

test("accepts signed whole hit points and rejects malformed or unsafe input", () => {
  assert.equal(parseHealthDelta(" +7 "), 7);
  assert.equal(parseHealthDelta("-12"), -12);
  assert.equal(parseHealthDelta("0"), 0);
  for (const value of ["", "-", "1.5", "1e2", "2abc", "9007199254740992"]) {
    assert.equal(parseHealthDelta(value), null);
  }
});

test("places equipped items in the right and left hands", () => {
  function item(id, {type = "weapon", category = "martialM", properties = [], equipped = true,
    held = false, sort = 0} = {}) {
    return {id, type, sort, system: {equipped, type: {value: category}, properties: new Set(properties)},
      getFlag: () => held};
  }
  const sword = item("sword", {properties: ["ver"], sort: 1});
  const dagger = item("dagger", {sort: 2});
  const greatsword = item("greatsword", {properties: ["two"]});
  const shield = item("shield", {type: "equipment", category: "shield"});
  const torch = item("torch", {type: "consumable", held: true});
  const claws = item("claws", {category: "natural"});
  const armor = item("armor", {type: "equipment", category: "heavy"});
  const unequipped = item("unequipped", {properties: ["two"], equipped: false});

  assert.deepEqual(getHands([claws, armor, unequipped]), [undefined, undefined]);
  assert.deepEqual(getHands([dagger]), [dagger, undefined]);
  assert.deepEqual(getHands([shield]), [undefined, shield]);
  assert.deepEqual(getHands([sword, unequipped, armor]), [sword, sword]);
  assert.deepEqual(getHands([sword, shield]), [sword, shield]);
  assert.deepEqual(getHands([dagger, sword]), [sword, dagger]);
  assert.deepEqual(getHands([sword, torch]), [sword, torch]);
  assert.deepEqual(getHands([sword, shield, greatsword]), [greatsword, greatsword]);
});

test("mirrors Argon slots and handles empty sets and unlinked tokens", () => {
  const sword = {id: "sword", uuid: "Scene.s.Token.t.Actor.a.Item.sword", type: "weapon",
    system: {properties: new Set(["ver"]), activities: [{activation: {type: "action"}}]}};
  const shield = {id: "shield", uuid: "Scene.s.Token.t.Actor.a.Item.shield", type: "equipment"};
  const bow = {id: "bow", uuid: "Scene.s.Token.t.Actor.a.Item.bow", type: "weapon",
    system: {properties: new Set(["two"]), activities: [{activation: {type: "action"}}]}};
  const flags = {};
  const actor = {items: [sword, shield, bow], token: {baseActor: {uuid: "Actor.a"}},
    getFlag: (_scope, key) => flags[key]};
  assert.equal(getArgonHands(actor), undefined);

  flags.weaponSets = {
    1: {primary: "Actor.a.Item.sword", secondary: shield.uuid},
    2: {secondary: bow.uuid},
    3: {primary: "Actor.foreign.Item.sword", secondary: null}
  };
  assert.deepEqual(getArgonHands(actor), [sword, shield]);
  flags.activeWeaponSet = "2";
  assert.deepEqual(getArgonHands(actor), [bow, bow]);
  flags.activeWeaponSet = "3";
  assert.deepEqual(getArgonHands(actor), [undefined, undefined]);
  flags.weaponSets[3].primary = sword.uuid;
  assert.deepEqual(getArgonHands(actor), [sword, sword]);
  flags.activeWeaponSet = "1";
  flags.weaponSets[1].primary = null;
  actor.type = "npc";
  assert.deepEqual(getArgonHands(actor), [undefined, shield]);
  actor.flags = {dnd5e: {isPolymorphed: true}};
  assert.deepEqual(getArgonHands(actor), [sword, sword]);
});
