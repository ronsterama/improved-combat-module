import { CombatHUD } from "./combat-hud.mjs";

const MODULE_ID = "improved-combat-module";

let hud = null;

function getHUD() {
  if (!hud) hud = new CombatHUD();
  return hud;
}

function toggleHUD() {
  const app = getHUD();
  if (app.rendered) app.close();
  else app.render(true);
}

function refreshHUD() {
  if (hud?.rendered) hud.render();
}

function toggleButton() {
  return document.getElementById("ich-hud-toggle");
}

const TOGGLE_SIZE = 50;
const DRAG_THRESHOLD = 5;

function placeToggle(btn, left, top) {
  const x = Math.min(Math.max(0, left), window.innerWidth - TOGGLE_SIZE);
  const y = Math.min(Math.max(0, top), window.innerHeight - TOGGLE_SIZE);
  btn.style.left = `${x}px`;
  btn.style.top = `${y}px`;
  btn.style.right = "auto";
  btn.style.bottom = "auto";
  return { left: x, top: y };
}

function restoreTogglePosition(btn) {
  const pos = game.settings.get(MODULE_ID, "togglePosition");
  if (pos) placeToggle(btn, pos.left, pos.top);
}

function makeDraggable(btn) {
  let start = null;
  let moved = false;

  btn.addEventListener("pointerdown", (ev) => {
    if (ev.button !== 0) return;
    const rect = btn.getBoundingClientRect();
    start = { x: ev.clientX, y: ev.clientY, left: rect.left, top: rect.top };
    moved = false;
    btn.setPointerCapture(ev.pointerId);
  });

  btn.addEventListener("pointermove", (ev) => {
    if (!start) return;
    const dx = ev.clientX - start.x;
    const dy = ev.clientY - start.y;
    if (!moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    moved = true;
    placeToggle(btn, start.left + dx, start.top + dy);
  });

  btn.addEventListener("pointerup", (ev) => {
    if (!start) return;
    btn.releasePointerCapture(ev.pointerId);
    if (moved) {
      const rect = btn.getBoundingClientRect();
      game.settings.set(MODULE_ID, "togglePosition", { left: rect.left, top: rect.top });
    }
    start = null;
  });

  // A drag ends in a click event too; swallow it so dragging doesn't toggle the HUD.
  btn.addEventListener("click", (ev) => {
    if (moved) {
      moved = false;
      ev.preventDefault();
      return;
    }
    toggleHUD();
  });

  window.addEventListener("resize", () => restoreTogglePosition(btn));
}

function createToggleButton() {
  if (toggleButton()) return;

  const btn = document.createElement("button");
  btn.id = "ich-hud-toggle";
  btn.type = "button";
  btn.title = game.i18n.localize("COMBATHUD.ToggleTitle");
  btn.innerHTML = `<i class="fa-solid fa-swords"></i>`;
  document.body.appendChild(btn);

  restoreTogglePosition(btn);
  makeDraggable(btn);
  updateToggleVisibility();
}

function updateToggleVisibility() {
  const btn = toggleButton();
  if (!btn) return;
  btn.style.display = game.combat ? "flex" : "none";
  btn.classList.toggle("active", !!hud?.rendered);
}

/** Auto-open the HUD for a player when it becomes their combatant's turn. */
function maybeAutoOpen(combat) {
  if (!combat || game.user.isGM) return;
  const actor = combat.combatant?.actor;
  if (actor?.isOwner) getHUD().render(true);
}

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "togglePosition", {
    scope: "client",
    config: false,
    type: Object,
    default: null
  });
  console.log(`${MODULE_ID} | Initialised`);
});

Hooks.on("ready", createToggleButton);

Hooks.on("createCombat", updateToggleVisibility);
Hooks.on("deleteCombat", () => {
  updateToggleVisibility();
  hud?.close();
});

Hooks.on("combatStart", updateToggleVisibility);
Hooks.on("combatTurn", (combat) => {
  updateToggleVisibility();
  maybeAutoOpen(combat);
  refreshHUD();
});
Hooks.on("combatRound", refreshHUD);
Hooks.on("updateCombat", () => {
  updateToggleVisibility();
  refreshHUD();
});
Hooks.on("targetToken", refreshHUD);
Hooks.on("controlToken", refreshHUD);
