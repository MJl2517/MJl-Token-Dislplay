const MODULE = "mjl-token-display";
const ARGON = "enhancedcombathud";
const HP = "attributes.hp";
const HAND = "held";
const DEFAULT_ICON = "icons/svg/sword.svg";
const views = new WeakMap();
const pendingHealth = new WeakSet();
let healthEditor;

function isWeapon(item) {
  return item.type === "weapon" && !["natural", "siege"].includes(item.system.type?.value)
    && item.system.attackClassification !== "unarmed";
}

function isShield(item) {
  return item.type === "equipment" && item.system.type?.value === "shield";
}

function hasGrip(item, property) {
  return item?.type === "weapon" && item.system.properties.has(property);
}

function expandGrip(right, left) {
  if (hasGrip(right, "two")) return [right, right];
  if (hasGrip(left, "two")) return [left, left];
  if (!left && hasGrip(right, "ver")) return [right, right];
  if (!right && hasGrip(left, "ver")) return [left, left];
  return [right, left];
}

export function getHands(items) {
  const equipped = [...items].filter(item => item.system.equipped)
    .sort((a, b) => a.sort - b.sort || a.id.localeCompare(b.id));
  const weapons = equipped.filter(isWeapon);
  const twoHanded = weapons.find(item => hasGrip(item, "two"));
  if (twoHanded) return [twoHanded, twoHanded];

  const shield = equipped.find(isShield);
  const held = equipped.filter(item => item.type !== "weapon" && !isShield(item) && item.getFlag(MODULE, HAND));
  const right = weapons[0] ?? held.shift();
  const left = shield ?? weapons[1] ?? held[0];
  return expandGrip(right, left);
}

export function getArgonHands(actor) {
  const selected = actor.getFlag(ARGON, "activeWeaponSet");
  const sets = actor.getFlag(ARGON, "weaponSets");
  if (!selected && !Object.keys(sets ?? {}).length) return undefined;

  const index = Number(selected || 1) - 1;
  const transformed = actor.flags?.dnd5e?.isPolymorphed;
  const set = transformed ? undefined : sets?.[index + 1];
  const automatic = actor.type === "npc" || transformed;
  const items = [...actor.items];
  const baseUuid = actor.token?.baseActor?.uuid;

  function resolve(slot, activation) {
    if (set && Object.hasOwn(set, slot)) {
      const uuid = set[slot];
      return items.find(item => uuid && (item.uuid === uuid
        || (baseUuid && uuid === `${baseUuid}.Item.${item.id}`)));
    }
    if (!automatic) return undefined;
    // Argon assigns NPC slots from the first activity of each weapon.
    const item = items.filter(item => item.type === "weapon"
      && item.system.activities?.values().next().value?.activation?.type === activation)[index];
    return item && isWeapon(item) ? item : undefined;
  }

  return expandGrip(resolve("primary", "action"), resolve("secondary", "bonus"));
}

function band(graphics, rx, ry, start, end, inner, outer, color, alpha = 1) {
  const steps = Math.ceil((end - start) * 60);
  if (steps < 1) return;
  const outside = [];
  const inside = [];
  for (let i = 0; i <= steps; i++) {
    const angle = Math.PI * (start + (end - start) * i / steps);
    const x = Math.cos(angle);
    const y = Math.sin(angle);
    outside.push(x * (rx + outer), y * (ry + outer));
    inside.unshift(x * (rx + inner), y * (ry + inner));
  }
  graphics.beginFill(color, alpha).drawPolygon([...outside, ...inside]).endFill();
}

function mix(a, b, amount) {
  return [16, 8, 0].reduce((color, shift) => {
    const from = (a >> shift) & 255;
    const to = (b >> shift) & 255;
    return color | (Math.round(from + (to - from) * amount) << shift);
  }, 0);
}

export function getHealthArcSegments(hp) {
  const base = Math.max(0, hp.max ?? 0);
  const maximum = Math.max(0, hp.effectiveMax ?? base);
  const capacity = maximum + Math.max(0, hp.temp ?? 0);
  const value = Math.min(maximum, Math.max(0, hp.value ?? 0));
  const ratio = maximum > 0 ? value / maximum : 0;
  const baseEnd = Math.min(base, maximum) / capacity;
  const maxEnd = maximum / capacity;
  const filledEnd = value / capacity;
  return {ratio, baseEnd, maxEnd, filledEnd};
}

function drawArc(graphics, width, height, hp) {
  const {ratio, baseEnd, maxEnd, filledEnd} = getHealthArcSegments(hp);
  const unit = Math.min(width, height);
  const rx = width / 2 + unit * 0.022;
  const ry = height / 2 + unit * 0.065;
  const half = unit * 0.038;
  const edge = unit * 0.016;
  const shadow = unit * 0.007;
  const sheen = unit * 0.009;
  const cap = edge / (Math.PI * ry);
  const outline = ratio < 0.5 ? mix(0xf26654, 0xf5cb5c, ratio * 2)
    : mix(0xf5cb5c, 0x84de89, ratio * 2 - 1);
  graphics.clear();
  graphics.position.set(width / 2, height / 2);
  band(graphics, rx, ry, -cap * 1.4, 1 + cap * 1.4, -half - edge - shadow, half + edge + shadow, 0x170f13);
  band(graphics, rx, ry, -cap, 1 + cap, -half - edge, half + edge, outline);
  band(graphics, rx, ry, 0, baseEnd, -half, half, 0x55343a);
  band(graphics, rx, ry, 0, baseEnd, -half, -half + sheen, 0xc48465, 0.6);

  const baseFilledEnd = Math.min(filledEnd, baseEnd);
  const steps = Math.ceil(baseFilledEnd * 40);
  const startColor = mix(0xf86a48, 0xffde66, ratio);
  for (let i = 0; i < steps; i++) {
    const start = i * baseFilledEnd / steps;
    const end = Math.min(baseFilledEnd, (i + 1.035) * baseFilledEnd / steps);
    const color = mix(startColor, 0xe64936, i / steps);
    band(graphics, rx, ry, start, end, -half, half, color);
  }
  band(graphics, rx, ry, 0, baseFilledEnd, -half, -half + sheen, 0xfff1bd, 0.53);
  band(graphics, rx, ry, 0, baseFilledEnd, half - sheen, half, 0x6c2719, 0.45);

  // The bonus capacity and temporary HP each occupy their own part of the track.
  band(graphics, rx, ry, baseEnd, maxEnd, -half, half, 0x56366e);
  band(graphics, rx, ry, baseEnd, filledEnd, -half, half, 0xa873de);
  band(graphics, rx, ry, baseEnd, maxEnd, -half, -half + sheen, 0xe2b4ff, 0.62);
  band(graphics, rx, ry, maxEnd, 1, -half, half, 0x348be4);
  band(graphics, rx, ry, maxEnd, 1, -half, -half + sheen, 0x9ce2ff, 0.86);

  return {
    hoverArea: new PIXI.Ellipse(width / 2, height / 2, rx + half + edge + shadow, ry + half + edge + shadow),
    hoverTop: height / 2 - edge - shadow,
    editorY: ry - half - edge - shadow
  };
}

export function parseHealthDelta(value) {
  const text = value.trim();
  if (!/^[+-]?\d+$/.test(text)) return null;
  const delta = Number(text);
  return Number.isSafeInteger(delta) ? delta : null;
}

function closeHealthEditor() {
  const editor = healthEditor;
  healthEditor = undefined;
  editor?.input.remove();
}

function positionHealthEditor() {
  if (!healthEditor) return;
  const {token, arc, input, actor} = healthEditor;
  if (!arc.visible || !token.visible || !token.renderable || token.actor !== actor
    || !actor.canUserModify(game.user, "update")) return closeHealthEditor();
  const {view, screen} = canvas.app.renderer;
  const rect = view.getBoundingClientRect();
  const point = arc.toGlobal({x: 0, y: views.get(token).layout.editorY});
  input.style.left = `${rect.left + point.x * rect.width / screen.width}px`;
  input.style.top = `${rect.top + point.y * rect.height / screen.height - 4}px`;
}

function openHealthEditor(token, arc) {
  const actor = token.actor;
  if (!arc.worldVisible || !actor?.canUserModify(game.user, "update") || pendingHealth.has(actor)) return;
  closeHealthEditor();

  const input = document.createElement("input");
  input.type = "text";
  input.className = "mjl-token-health-input";
  input.autocomplete = "off";
  input.value = "0";
  input.setAttribute("aria-label", "Изменение ОЗ. Плюс лечит, минус наносит урон.");
  healthEditor = {input, token, arc, actor};
  input.addEventListener("blur", closeHealthEditor, {once: true});
  input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
  input.addEventListener("wheel", event => {
    event.preventDefault();
    event.stopPropagation();
    const next = (parseHealthDelta(input.value) ?? 0) - Math.sign(event.deltaY);
    if (Number.isSafeInteger(next)) input.value = String(next);
    input.removeAttribute("aria-invalid");
  }, {passive: false});
  input.addEventListener("keydown", async event => {
    event.stopPropagation();
    if (event.isComposing || (event.key !== "Enter" && event.key !== "Escape")) return;
    event.preventDefault();
    if (event.key === "Escape") return closeHealthEditor();
    const delta = parseHealthDelta(input.value);
    if (delta === null) {
      input.setAttribute("aria-invalid", "true");
      input.select();
      return;
    }
    closeHealthEditor();
    if (!delta || token.actor !== actor || !actor.canUserModify(game.user, "update")) return;
    pendingHealth.add(actor);
    try {
      await actor.modifyTokenAttribute(HP, delta, true, true);
    } catch (error) {
      ui.notifications.error("Не удалось изменить ОЗ.");
      console.error(MODULE, error);
    } finally {
      pendingHealth.delete(actor);
    }
  });

  document.body.append(input);
  positionHealthEditor();
  input.focus({preventScroll: true});
  input.select();
}

function createBadge(parent) {
  const container = parent.addChild(new PIXI.Container());
  const frame = container.addChild(new PIXI.Graphics());
  const sprite = container.addChild(new PIXI.Sprite(PIXI.Texture.EMPTY));
  const mask = container.addChild(new PIXI.Graphics());
  sprite.anchor.set(0.5);
  sprite.mask = mask;
  return {container, frame, sprite, mask};
}

function refreshBadge(badge, item, x, y, radius) {
  const {container, frame, sprite, mask} = badge;
  container.visible = Boolean(item);
  if (!item) return;
  container.position.set(x, y);
  if (badge.radius !== radius) {
    badge.radius = radius;
    frame.clear()
      .beginFill(0x1a1016).drawCircle(0, 0, radius * 1.10).endFill()
      .beginFill(0xc18b4d).drawCircle(0, 0, radius).endFill()
      .beginFill(0x3b2523).drawCircle(0, 0, radius * 0.89).endFill();
    mask.clear().beginFill(0xffffff).drawCircle(0, 0, radius * 0.81).endFill();
    sprite.width = sprite.height = radius * 1.62;
  }

  const src = item.img || DEFAULT_ICON;
  if (badge.src === src) return;
  badge.src = src;
  sprite.texture = PIXI.Texture.EMPTY;
  foundry.canvas.loadTexture(src, {fallback: DEFAULT_ICON}).then(texture => {
    if (!texture || sprite.destroyed || badge.src !== src) return;
    sprite.texture = texture;
    sprite.width = sprite.height = badge.radius * 1.62;
  });
}

function refreshToken(token, flags) {
  if (!token.bars || token.isPreview || !token.actor) return;
  if (!(flags.refreshBars || flags.refreshSize || flags.refreshShape || flags.refreshState || flags.refreshVisibility)) {
    if (healthEditor?.token === token && flags.refreshPosition) positionHealthEditor();
    return;
  }
  const hp = token.actor.system.attributes?.hp;
  const maximum = hp?.effectiveMax ?? hp?.max;
  const {width, height} = token.document.getSize();
  const unit = Math.min(width, height);
  const healthBars = ["bar1", "bar2"].filter(key => token.document[key]?.attribute === HP);
  const otherBars = ["bar1", "bar2"].some(key => token.document[key]?.attribute && !healthBars.includes(key));
  const showHealth = (maximum > 0 || hp?.temp > 0) && (healthBars.length > 0 || !otherBars)
    && token.document.displayBars !== CONST.TOKEN_DISPLAY_MODES.NONE;
  const canSeeDetails = !token.document.isSecret && !token.detectionFilter;
  const hands = canSeeDetails && token.visible && token.renderable
    ? (argonSyncEnabled() ? getArgonHands(token.actor) : undefined) ?? getHands(token.actor.items)
    : [];
  let view = views.get(token);
  if (!view && (showHealth || hands.some(Boolean))) {
    const arc = token.bars.addChild(new PIXI.Graphics());
    const gear = token.addChild(new PIXI.Container());
    arc.name = `${MODULE}:arc`;
    gear.name = `${MODULE}:hands`;
    arc.eventMode = gear.eventMode = "none";
    arc.cursor = "pointer";
    const stopLeft = event => { if (event.button === 0) event.stopPropagation(); };
    arc.on("pointerdown", stopLeft).on("pointerup", stopLeft).on("pointertap", event => {
      if (event.button !== 0) return;
      event.stopPropagation();
      openHealthEditor(token, arc);
    });
    view = {arc, gear, badges: [createBadge(gear), createBadge(gear)]};
    views.set(token, view);
  }
  if (!view) return;

  view.arc.visible = showHealth && canSeeDetails;
  const canEditHealth = view.arc.visible && token.actor.canUserModify(game.user, "update");
  view.arc.eventMode = canEditHealth ? "static" : "none";
  if (showHealth) {
    for (const key of healthBars) token.bars[key].visible = false;
    if (flags.refreshBars || flags.refreshSize || !view.drawn) {
      view.layout = drawArc(view.arc, width, height, hp);
      view.drawn = true;
    }
  } else view.drawn = false;

  // PIXI clips child hit tests to the token's shape. Bridge the gap from the token to the arc.
  if (canEditHealth && token.hitArea && token.hitArea !== view.hitArea) {
    const original = token.hitArea;
    view.hitArea = token.hitArea = {contains: (x, y) => {
      const {hoverArea, hoverTop} = view.layout;
      return original.contains(x, y)
        || (view.arc.eventMode === "static" && y >= hoverTop && hoverArea.contains(x, y));
    }};
  }
  if (healthEditor?.token === token) positionHealthEditor();

  // Foundry resets the nameplate position on size refreshes.
  const nameplate = token.nameplate;
  if (!flags.refreshSize && nameplate.y === view.adjustedY) nameplate.y = view.baseY;
  view.baseY = nameplate.y;
  if (view.arc.visible && token.bars.visible) nameplate.y = Math.max(nameplate.y, height + unit * 0.145);
  view.adjustedY = nameplate.y;

  view.gear.visible = hands.some(Boolean);
  refreshBadge(view.badges[0], hands[0], width + unit * 0.07, height - unit * 0.08, unit * 0.102);
  refreshBadge(view.badges[1], hands[1], -unit * 0.07, height - unit * 0.08, unit * 0.102);
}

function refreshActor(actor) {
  if (!canvas.ready || actor?.documentName !== "Actor") return;
  for (const token of actor.getActiveTokens()) token.renderFlags.set({refreshBars: true});
}

function argonSyncEnabled() {
  return game.modules.get(ARGON)?.active && game.modules.get(`${ARGON}-dnd5e`)?.active
    && game.settings.get(MODULE, "syncArgon");
}

globalThis.Hooks?.once("init", () => {
  if (game.system.id !== "dnd5e") return;
  game.settings.register(MODULE, "syncArgon", {
    name: "Синхронизация рук с Argon",
    hint: "Использовать активный комплект оружия Argon для иконок на токене, если оба модуля Argon включены.",
    scope: "world",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => {
      if (!canvas.ready) return;
      for (const token of canvas.tokens.placeables) token.renderFlags.set({refreshBars: true});
    }
  });
  Hooks.on("refreshToken", refreshToken);
  Hooks.on("canvasPan", positionHealthEditor);
  Hooks.on("canvasTearDown", closeHealthEditor);
  Hooks.on("destroyToken", token => {
    if (healthEditor?.token === token) closeHealthEditor();
  });
  Hooks.on("updateActor", refreshActor);
  for (const event of ["createItem", "updateItem", "deleteItem"]) {
    Hooks.on(event, item => refreshActor(item.parent));
  }
  Hooks.on("getHeaderControlsItemSheet5e", (sheet, controls) => {
    const item = sheet.document;
    if (!sheet.isEditable || !item.isEmbedded || typeof item.system.equipped !== "boolean"
      || item.type === "weapon" || isShield(item)) return;
    const held = item.getFlag(MODULE, HAND);
    controls.push({
      action: "mjlToggleHeld",
      icon: held ? "fa-solid fa-hand" : "fa-regular fa-hand",
      label: held ? "Освободить руку от предмета" : "Предмет занимает руку",
      onClick: () => held ? item.unsetFlag(MODULE, HAND) : item.setFlag(MODULE, HAND, true)
    });
  });
});
