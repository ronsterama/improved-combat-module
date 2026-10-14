# Improved Combat Module

A floating **Combat HUD** for Foundry VTT V13/V14 + **Call of Cthulhu 7th
Edition** that merges targeting and weapon rolls into one panel, so players
don't have to bounce between the Combat Tracker, their character sheet, and
chat.

v0.2 — verified working against a live Molten-hosted Foundry V13 + CoC7 world:
target selection, the weapon list, and the click-forwarded roll (confirmed by
a real CoC7 combat card landing in chat) all check out. See "Known
limitations / next steps" below for what's still deliberately unfinished.

v0.3 — `module.json` now declares V14 as verified. The module already used
the namespaced `foundry.applications.api.ApplicationV2` /
`HandlebarsApplicationMixin` API and plain DOM (no jQuery), which V14 keeps
unchanged, and none of the Combat/Combatant/targeting hooks this module
relies on (`combatStart`, `combatTurn`, `combatRound`, `updateCombat`,
`targetToken`, `controlToken`) were removed or had their signatures change in
a way this code reads. This has been checked against V14's documented API
changes but **not yet live-tested against a running V14 world** — see
"Compatibility" below.

v0.4 — works with **Ginzzzu's CoC7 Sheets** (`ginzzzu-coc7-sheets`) as
well as CoC7's own sheets. With that module's investigator or Keeper NPC
sheet the HUD lists weapons from the actor's items, opens its hidden copy of
the sheet on the Combat tab (and puts the tab back when it closes), and
attacks through that sheet's own **Attack** button. Without Ginzzzu nothing
changes. Also fixed: a hidden sheet the HUD opened is now closed when the HUD
closes, even after the HUD has re-rendered.

---

## What it does

- A sword-icon toggle button appears (bottom-right of the screen) whenever a
  combat is active.
- The HUD auto-opens for a player when it becomes their combatant's turn.
- The panel shows:
  - **Target** — your current target, plus a row of portraits for every
    other combatant in the fight. Click one to target it; click it again to
    clear.
  - **Weapons** — your character's melee and ranged weapons, pulled live
    from their sheet. Click one to roll it.

## How the weapon roll works

The HUD does **not** reimplement CoC7's combat-roll logic. Instead, when it
needs your weapon list it renders your actor sheet off-screen (invisible,
never shown to you) and reads the item rows CoC7 already puts on the Combat
tab (`.weapon-row` on investigator sheets, `.combat-row.item` on NPC sheets,
matched by their `data-item-uuid`). Clicking a weapon in the HUD forwards a
real click to that hidden sheet's weapon-name link — so CoC7's own difficulty
dialog, target-confirmation prompt, and chat card fire exactly as if you'd
clicked it on your sheet. This has been confirmed end-to-end: forwarding a
click produced CoC7's real "no target selected" dialog, and confirming it
posted an actual combat card to chat.

This is deliberate: it means the HUD doesn't need to track CoC7's internal
roll API and should keep working across CoC7 updates, as long as this
Combat-tab markup doesn't change shape again. It already changed once between
when this was written and when it was tested (older CoC7 builds used
`.weapon-row[data-item-id]` only; the tested version uses
`data-item-uuid` and adds the separate NPC-sheet shape) — if weapons stop
showing up after a future CoC7 update, this markup is the first place to
check.

If you already have your own character sheet open when the HUD reads it, the
HUD reuses that open sheet instead of hiding it — it only opens (and later
closes) a hidden copy when your sheet wasn't already open.

### Other character sheets

When the sheet has no CoC7 Combat-tab rows (Ginzzzu's CoC7 Sheets, or any
other replacement sheet), the weapon list comes from the actor's own weapon
items instead: ranged if the weapon is marked Ranged, melee otherwise, and
greyed out if no skill is assigned — the same rules CoC7's sheet uses.
Clicking a weapon then:

1. clicks the sheet's own Attack button if the sheet has drawn it
   (`gci-weapon-roll` on Ginzzzu's investigator sheet, `gcks-weapon-roll` on
   its Keeper NPC sheet), so that sheet's ammo check and bookkeeping run; or
2. if the button isn't on screen (for example you have your sheet open on
   another tab), calls CoC7's `actor.weaponCheck()` directly — the same call
   Ginzzzu's Attack button makes, so CoC7's dialog, combat card and ammo use
   are unchanged.

Ginzzzu's sheets only draw the active tab, so when the HUD opens its hidden
copy it switches that copy to the Combat tab first and restores your tab
when the HUD closes. A sheet you already have open is never switched.

## Installation

In Foundry's **Add-on Modules → Install Module**, paste this manifest URL:

```
https://github.com/ronsterama/improved-combat-module/releases/latest/download/module.json
```

Then enable **Improved Combat Module** and start or join a combat as a player
who owns a CoC7 investigator. Future versions show up under **Check for
Update** on the module list.

(Manual install also works: copy this folder into
`Data/modules/improved-combat-module/`.)

## Moving the toggle button

The sword button can be dragged anywhere on screen; its position is
remembered per browser. If it ends up off-screen after a window resize it is
pulled back into view automatically.

## Releasing a new version

1. Bump nothing by hand — just create a GitHub release tagged `vX.Y.Z`.
2. The workflow in `.github/workflows/release.yml` stamps that version and
   the manifest/download URLs into `module.json`, builds `module.zip`, and
   attaches both to the release.

## Known limitations / next steps

This covers the core flow (target + roll a weapon) but intentionally leaves
out some things to keep the first version simple:

- **GM testing needs a token selected.** The HUD deliberately doesn't treat
  "the GM owns this actor" as "this is my character" (the GM owns
  everything), so when testing as GM it falls back to whichever token you
  have selected on the canvas. Real players don't hit this — their own
  combatant is detected automatically.
- **No thrown / auto-fire alt-skill button.** CoC7 shows a secondary icon on
  some weapons (thrown melee, automatic fire) for an alternate skill. The HUD
  only forwards clicks on the primary weapon name for now.
- **No ammo / reload control.** Ranged weapons' reload button isn't
  surfaced in the HUD yet.
- **Single-actor assumption.** If a player controls more than one
  investigator in the same fight, the HUD picks the current turn's actor (or
  falls back to your assigned character) rather than offering a switcher.
- **No remembered position.** The HUD opens at a fixed default position each
  time rather than remembering where you last dragged it.
- **Overlaps with `target-selector`.** The existing `target-selector` module
  already offers target buttons in the Combat Tracker and a sheet-opening
  button. You can run both during testing, but consider retiring
  `target-selector` once this HUD covers your table's needs.

## Compatibility

| Foundry | System | Status |
|---------|--------|--------|
| V13 | CoC7 (investigator-v2 / npc-v2 sheets) | Verified live on a Molten-hosted world |
| V14 | CoC7 (investigator-v2 / npc-v2 sheets) | Code-level compatible (no breaking APIs used); not yet live-tested |
| V14 | CoC7 8.15 + Ginzzzu's CoC7 Sheets 1.0 | v0.4: tested against a mock of that sheet's markup; not yet live-tested |

## License

MIT
