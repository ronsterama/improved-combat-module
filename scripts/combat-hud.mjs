/**
 * Combat HUD — floating panel that fuses targeting + weapon rolls.
 *
 * Weapon rolls are NOT reimplemented here. Instead the actor's own sheet is
 * rendered off-screen and we forward a real click to its weapon-name link,
 * so CoC7's own combat logic (difficulty dialog, ammo, thrown/auto-fire,
 * chat card) runs unchanged. This keeps the HUD compatible with CoC7
 * updates without tracking its internal roll API.
 *
 * Sheets that don't use CoC7's Combat-tab rows (Ginzzzu's CoC7 Sheets, or any
 * other replacement sheet) get their weapon list from the actor's items, and
 * the roll goes through the sheet's own Attack button when it is drawn, else
 * through CoC7's actor.weaponCheck() — the same call those sheets make.
 */

const MODULE_ID = "improved-combat-module";

/** Buttons that start an attack, per sheet: CoC7 investigator/NPC sheets,
 *  then Ginzzzu's investigator and Keeper NPC sheets. */
const ATTACK_SELECTORS = [
  ".weapon-name.combat.rollable",
  "[data-action=\"gci-weapon-roll\"]",
  "[data-action=\"gcks-weapon-roll\"]"
];

/** Ginzzzu's sheets only draw their active tab; this is where they keep it
 *  (investigator sheet, Keeper NPC sheet). */
const TAB_PROPERTIES = ["gciActiveTab", "gcksActiveTab"];

function tabPropertyOf(sheet) {
  return TAB_PROPERTIES.find(prop => typeof sheet?.[prop] === "string") ?? null;
}

function isMine(actor) {
  return !!actor?.isOwner && !game.user.isGM;
}

/** Pick the actor this HUD should act for: current turn's actor if it's
 *  mine, else any of my owned combatants, else whichever token I have
 *  selected on the canvas, else my assigned character. The selected-token
 *  fallback also lets a GM preview the HUD as a given actor for testing,
 *  since isMine() otherwise excludes the GM on purpose. */
function getMyActor() {
  const combat = game.combat;
  const turnActor = combat?.combatant?.actor;
  if (isMine(turnActor)) return turnActor;

  const owned = combat?.combatants?.find(c => isMine(c.actor));
  if (owned) return owned.actor;

  const controlled = canvas.tokens?.controlled?.[0]?.actor;
  if (controlled?.isOwner) return controlled;

  return game.user.character ?? null;
}

function sheetElement(sheet) {
  return sheet?.element instanceof HTMLElement ? sheet.element : sheet?.element?.[0] ?? null;
}

/** Render the actor's sheet if it isn't already open, keeping it invisible
 *  and out of the way. Returns whether *we* opened it (vs. it already
 *  being open for the player), so callers know whether to close it later.
 *  A tabbed sheet that only draws its active tab (Ginzzzu's) is opened on
 *  its Combat tab; restoreTab says what to put back on close. */
async function ensureHiddenSheet(actor) {
  const sheet = actor.sheet;
  const wasRendered = sheet.rendered;
  let restoreTab = null;

  if (!wasRendered) {
    const tabProp = tabPropertyOf(sheet);
    if (tabProp && sheet[tabProp] !== "combat") {
      restoreTab = { prop: tabProp, value: sheet[tabProp] };
      sheet[tabProp] = "combat";
    }
    await sheet.render(true);
    const el = sheetElement(sheet);
    if (el) {
      el.style.visibility = "hidden";
      el.style.pointerEvents = "none";
      el.style.position = "fixed";
      el.style.left = "-9999px";
      el.style.top = "-9999px";
    }
    // Let CoC7's own render/activateListeners finish before we read the DOM.
    await new Promise(resolve => setTimeout(resolve, 120));
  }

  return { sheet, weOpenedIt: !wasRendered, restoreTab };
}

/** CoC7's newer sheets identify item rows with a full document UUID
 *  ("Actor.<id>.Item.<id>", or a longer path via an unlinked token) rather
 *  than a bare item id. Pull just the item id off the end so it still works
 *  with actor.items.get(). */
function itemIdFromUuid(uuid) {
  const match = /Item\.([A-Za-z0-9]+)$/.exec(uuid ?? "");
  return match ? match[1] : uuid ?? null;
}

/** CoC7 uses two different combat-tab layouts depending on actor type:
 *  - Investigator (PC) sheets: <li class="weapon-row" data-item-uuid="...">
 *    inside <section class="weapon-list melee|range">.
 *  - NPC sheets: a flat <div class="combat-row item" data-item-uuid="...">
 *    table with no melee/range split.
 *  Both expose the clickable roll target as .weapon-name.combat(.rollable)
 *  inside the row, which is what actually gets clicked. */
function readWeaponRows(sheet, actor) {
  const el = sheetElement(sheet);
  if (!el) return { melee: [], range: [] };

  const melee = [];
  const range = [];

  const rows = el.querySelectorAll(
    ".weapon-row[data-item-uuid], .combat-row.item[data-item-uuid]"
  );

  for (const row of rows) {
    const itemId = itemIdFromUuid(row.dataset.itemUuid);
    const item = actor.items.get(itemId);
    const nameEl = row.querySelector(".weapon-name.combat");

    const entry = {
      id: itemId,
      name: nameEl?.textContent?.trim() || item?.name || "?",
      img: item?.img || "icons/svg/sword.svg",
      rollable: !!nameEl?.classList.contains("rollable")
    };

    const list = row.closest(".weapon-list");
    if (list?.classList.contains("range")) range.push(entry);
    else melee.push(entry); // also catches NPC rows, which have no melee/range split
  }

  return { melee, range };
}

/** Weapon list straight from the actor, for sheets without CoC7's
 *  Combat-tab rows. Same melee/ranged split and "skill set" rule the CoC7
 *  sheet uses (system.properties.rngd, system.isSkillSet). */
function readWeaponItems(actor) {
  const melee = [];
  const range = [];
  const weapons = actor.items
    .filter(item => item.type === "weapon")
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

  for (const item of weapons) {
    const entry = {
      id: item.id,
      name: item.name,
      img: item.img || "icons/svg/sword.svg",
      rollable: item.system?.isSkillSet !== false
    };
    if (item.system?.properties?.rngd) range.push(entry);
    else melee.push(entry);
  }

  return { melee, range };
}

/** The sheet's own Attack control for this weapon, if the sheet has drawn it. */
function findAttackControl(sheet, itemId) {
  const el = sheetElement(sheet);
  if (!el) return null;
  for (const row of el.querySelectorAll(`[data-item-uuid$=".Item.${itemId}"]`)) {
    for (const selector of ATTACK_SELECTORS) {
      const control = row.querySelector(selector);
      if (control) return control;
    }
  }
  return null;
}

export class CombatHUD extends foundry.applications.api.HandlebarsApplicationMixin(
  foundry.applications.api.ApplicationV2
) {
  static DEFAULT_OPTIONS = {
    id: "improved-combat-hud",
    classes: ["improved-combat-module", "combat-hud"],
    window: {
      title: "COMBATHUD.Title",
      icon: "fa-solid fa-swords",
      minimizable: true,
      resizable: false
    },
    position: {
      width: 300,
      top: 120,
      left: 120
    },
    actions: {
      toggleTarget: CombatHUD.#onToggleTarget,
      rollWeapon: CombatHUD.#onRollWeapon
    }
  };

  static PARTS = {
    body: {
      template: `modules/${MODULE_ID}/templates/combat-hud.hbs`
    }
  };

  #hiddenSheet = null;
  #weOpenedHiddenSheet = false;
  #restoreTab = null;

  async _prepareContext(_options) {
    const combat = game.combat;
    const actor = getMyActor();

    const currentTarget = [...game.user.targets][0] ?? null;

    const combatants = (combat?.combatants ?? [])
      .map(c => {
        const token = c.token?.object ?? (c.tokenId ? canvas.tokens?.get(c.tokenId) : null);
        return {
          id: c.id,
          tokenId: token?.id ?? c.tokenId,
          name: c.name,
          img: c.img,
          isTargeted: token ? game.user.targets.has(token) : false,
          // Compare by document uuid, not isMine(): isMine() is about
          // real-player ownership (and always false for a GM), whereas
          // "am I looking at myself" has to match whichever actor
          // getMyActor() actually resolved to (turn order, an owned
          // combatant, or a GM's selected token during testing).
          isSelf: !!actor && c.actor?.uuid === actor.uuid
        };
      })
      .filter(c => !c.isSelf);

    let melee = [];
    let range = [];

    if (actor) {
      // The HUD re-renders often; a sheet we opened on an earlier pass is
      // still ours to close, and a different actor's hidden sheet is closed.
      if (this.#hiddenSheet && this.#hiddenSheet !== actor.sheet) this.#closeHiddenSheet();
      const { sheet, weOpenedIt, restoreTab } = await ensureHiddenSheet(actor);
      if (weOpenedIt) {
        this.#weOpenedHiddenSheet = true;
        this.#restoreTab = restoreTab;
      } else if (this.#hiddenSheet !== sheet) {
        this.#weOpenedHiddenSheet = false;
        this.#restoreTab = null;
      }
      this.#hiddenSheet = sheet;
      ({ melee, range } = readWeaponRows(sheet, actor));
      if (!melee.length && !range.length) ({ melee, range } = readWeaponItems(actor));
    } else {
      this.#closeHiddenSheet();
    }

    return {
      actorName: actor?.name ?? null,
      target: currentTarget
        ? { name: currentTarget.name, img: currentTarget.document?.texture?.src ?? currentTarget.document?.img }
        : null,
      combatants,
      melee,
      range,
      hasWeapons: melee.length + range.length > 0
    };
  }

  static async #onToggleTarget(_event, target) {
    const token = canvas.tokens?.get(target.dataset.tokenId);
    if (!token) return;

    const alreadyTargeted = game.user.targets.has(token);
    for (const t of [...game.user.targets]) {
      t.setTarget(false, { releaseOthers: false, groupSelection: false });
    }
    if (!alreadyTargeted) {
      token.setTarget(true, { releaseOthers: false, groupSelection: false });
    }

    this.render();
    ui.combat?.render(false);
  }

  static async #onRollWeapon(event, target) {
    const itemId = target.dataset.itemId;
    const actor = getMyActor();
    if (!actor || !itemId) return;

    const flash = () => {
      target.classList.add("is-rolling");
      setTimeout(() => target.classList.remove("is-rolling"), 550);
    };

    // Preferred: click the sheet's own control, so the sheet's logic runs
    const control = findAttackControl(actor.sheet, itemId);
    if (control) {
      flash();
      control.click();
      return;
    }

    // Sheet hasn't drawn it (other tab, unknown sheet): CoC7's own entry point
    const item = actor.items.get(itemId);
    if (item?.type === "weapon" && item.system?.isSkillSet !== false && typeof actor.weaponCheck === "function") {
      flash();
      await actor.weaponCheck({ uuid: item.uuid }, !!event?.shiftKey);
      return;
    }

    ui.notifications.warn(game.i18n.localize("COMBATHUD.NoRoll"));
  }

  /** Close the off-screen sheet if we opened it, putting its tab back. */
  #closeHiddenSheet() {
    const sheet = this.#hiddenSheet;
    if (sheet && this.#weOpenedHiddenSheet) {
      if (this.#restoreTab) sheet[this.#restoreTab.prop] = this.#restoreTab.value;
      sheet.close?.({ animate: false });
    }
    this.#hiddenSheet = null;
    this.#weOpenedHiddenSheet = false;
    this.#restoreTab = null;
  }

  async close(options) {
    this.#closeHiddenSheet();
    return super.close(options);
  }
}
