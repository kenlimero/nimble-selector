# Nimble Selector

A [FoundryVTT](https://foundryvtt.com/) module that automates class feature, spell, and equipment selection for the **Nimble v2** game system.

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![Nimble v0.6+](https://img.shields.io/badge/Nimble-v0.6+-blueviolet)
![Version 0.6](https://img.shields.io/badge/Version-0.6-green)

## Overview

Nimble Selector streamlines character progression by automatically detecting level-ups and presenting relevant choices for class features, spells, and equipment. No more manually browsing compendiums — the module knows what your character has access to and lets you grant items in just a few clicks.

## Features

### Class Feature Selection
- Displays features available at each level based on class and subclass
- Auto-selects new features to prevent duplicates
- Shows compendium match status for each feature
- Bulk select/deselect with one-click granting

### Spell Selection
- Filters by spell school (fire, ice, lightning, necrotic, radiant, wind, secret, utility)
- Filters by tier (cantrip through tier 9)
- Respects class and subclass spell access rules
- Detects already-owned spells to avoid duplicates

### Equipment Selection
- Filters by category (weapons, armor, shields, consumables, misc)
- Respects class equipment proficiencies
- Displays armor and weapon type summaries

### Smart Integration
- **Auto-open on level-up** — the selector panel opens automatically when a character gains a level
- **Multiple access points** — character sheet header button, scene controls, actor directory context menu, keybinding, and macro API
- **Duplicate detection** — tracks compendium sources to prevent granting items a character already owns

## Supported Classes

Berserker, The Cheat, Commander, Hunter, Mage, Oathsworn, Shadowmancer, Shepherd, Songweaver, Stormshifter, Zephyr — each with their respective subclasses.

## Installation

### From Foundry

1. Open the **Add-on Modules** tab in the Foundry setup screen
2. Click **Install Module**
3. Paste the following manifest URL:
   ```
   https://github.com/kenlimero/nimble-selector/releases/latest/download/module.json
   ```
4. Click **Install**

### Manual

1. Download the latest `module.zip` from [Releases](https://github.com/kenlimero/nimble-selector/releases)
2. Extract it into your `Data/modules/` directory
3. Restart Foundry and enable the module in your world settings

## Usage

1. Enable **Nimble Selector** in your world's module settings
2. Open a character sheet — you'll see a new button in the header controls
3. Click it to open the **Selector Panel**, which shows a summary of available features, spells, and equipment
4. Click any section to open the corresponding selector and pick what to grant
5. On level-up, the panel opens automatically (configurable)

**Keybinding:** `Shift+L` opens the selector for your controlled token or default character.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-open on level-up | `true` | Automatically opens the selector panel when a character levels up or gains a new class |
| Auto-select features | `true` | Pre-selects new features in the class feature selector |

## Compatibility

- **FoundryVTT:** v13
- **Nimble System:** v0.6.0+

## License

This project is licensed under the MIT License.
