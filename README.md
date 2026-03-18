# Nimble Selector

A [FoundryVTT](https://foundryvtt.com/) module that automates class feature, spell, and equipment selection for the **Nimble v2** game system.

Un module [FoundryVTT](https://foundryvtt.com/) qui automatise la selection des capacites de classe, sorts et equipements pour le systeme **Nimble v2**.

![Foundry v13](https://img.shields.io/badge/Foundry-v13-informational)
![Nimble v0.6+](https://img.shields.io/badge/Nimble-v0.6+-blueviolet)
![Version 0.22](https://img.shields.io/badge/Version-0.22-green)

---

## English

### Overview

Nimble Selector streamlines character progression by automatically detecting level-ups and presenting relevant choices for class features, spells, and equipment. No more manually browsing compendiums — the module knows what your character has access to and lets you grant items in just a few clicks.

### Features

#### Class Feature Selection
- Displays features available at each level based on class and subclass
- Groups features by class and level for easy browsing
- Auto-selects new features to prevent duplicates
- Shows compendium match status for each feature
- Supports features that unlock additional selectable options (class-selectables)
- Filters class-selectables by the feature that grants them
- Bulk select/deselect with one-click granting
- Tooltip descriptions on hover

#### Spell Selection
- Filters by spell school (fire, ice, lightning, necrotic, radiant, wind, secret, utility)
- Filters by tier (cantrip through tier 9)
- Respects class and subclass spell access rules
- Handles class-exclusive spells (e.g. Vicious Mockery for Songweaver with Wind access)
- Hides secret spells from player selection
- Detects already-owned spells to avoid duplicates
- Scroll position preserved when selecting spells
- Tooltip descriptions on hover

#### Equipment Selection
- Filters by category (weapons, armor, shields, consumables, misc)
- Respects class equipment proficiencies with toggle filter
- Quantity selection: left-click to add (+1), right-click to remove (-1)
- Quantity badge displayed on selected items
- **Pay the Bill** mode:
  - Displays current actor wealth (GP, SP, CP)
  - Shows total cost of selection by denomination
  - Highlights items the actor cannot afford
  - Deducts currency per denomination without converting between coin types
  - Cascades shortfalls to lower denominations (GP > SP > CP)
- Smart item stacking: stackable items already owned get their quantity incremented
- Tooltip descriptions on hover

#### Smart Integration
- **Auto-open on level-up** — the selector panel opens automatically when a character gains a level
- **Multiple access points** — character sheet header button, scene controls, actor directory context menu, keybinding, and macro API
- **Duplicate detection** — tracks compendium sources to prevent granting items a character already owns

### Supported Classes

Berserker, The Cheat, Commander, Hunter, Mage, Oathsworn, Shadowmancer, Shepherd, Songweaver, Stormshifter, Zephyr — each with their respective subclasses.

### Installation

#### From Foundry

1. Open the **Add-on Modules** tab in the Foundry setup screen
2. Click **Install Module**
3. Paste the following manifest URL:
   ```
   https://github.com/kenlimero/nimble-selector/releases/latest/download/module.json
   ```
4. Click **Install**

#### Manual

1. Download the latest `module.zip` from [Releases](https://github.com/kenlimero/nimble-selector/releases)
2. Extract it into your `Data/modules/` directory
3. Restart Foundry and enable the module in your world settings

### Usage

1. Enable **Nimble Selector** in your world's module settings
2. Open a character sheet — you'll see a new button in the header controls
3. Click it to open the **Selector Panel**, which shows a summary of available features, spells, and equipment
4. Click any section to open the corresponding selector and pick what to grant
5. On level-up, the panel opens automatically (configurable)

**Keybinding:** `Shift+L` opens the selector for your controlled token or default character.

### Settings

| Setting | Default | Description |
|---------|---------|-------------|
| Auto-open on level-up | `true` | Automatically opens the selector panel when a character levels up or gains a new class |
| Auto-select features | `true` | Pre-selects new features in the class feature selector |

### Compatibility

- **FoundryVTT:** v13
- **Nimble System:** v0.6.0+

---

## Francais

### Presentation

Nimble Selector simplifie la progression des personnages en detectant automatiquement les montees de niveau et en presentant les choix pertinents pour les capacites de classe, les sorts et l'equipement. Plus besoin de parcourir manuellement les compendiums — le module sait a quoi votre personnage a acces et vous permet d'octroyer des objets en quelques clics.

### Fonctionnalites

#### Selection des capacites de classe
- Affiche les capacites disponibles a chaque niveau selon la classe et la sous-classe
- Regroupe les capacites par classe et niveau pour faciliter la navigation
- Pre-selectionne automatiquement les nouvelles capacites pour eviter les doublons
- Affiche le statut de correspondance avec le compendium pour chaque capacite
- Supporte les capacites qui debloquent des options selectionnables supplementaires (class-selectables)
- Filtre les class-selectables par la capacite qui les octroie
- Selection/deselection groupee avec octroi en un clic
- Descriptions au survol de la souris

#### Selection des sorts
- Filtrage par ecole de magie (feu, glace, foudre, necrotique, radiant, vent, secret, utilitaire)
- Filtrage par tier (cantrip jusqu'au tier 9)
- Respecte les regles d'acces aux sorts par classe et sous-classe
- Gere les sorts exclusifs a une classe (ex: Vicious Mockery pour le Songweaver avec acces a l'ecole du vent)
- Masque les sorts secrets de la selection des joueurs
- Detecte les sorts deja possedes pour eviter les doublons
- Position de defilement conservee lors de la selection des sorts
- Descriptions au survol de la souris

#### Selection de l'equipement
- Filtrage par categorie (armes, armures, boucliers, consommables, divers)
- Respect des competences d'equipement de la classe avec filtre activable
- Selection de quantite : clic gauche pour ajouter (+1), clic droit pour retirer (-1)
- Badge de quantite affiche sur les objets selectionnes
- Mode **Pay the Bill** (payer l'addition) :
  - Affiche la richesse actuelle du personnage (PO, PA, PC)
  - Affiche le cout total de la selection par denomination
  - Met en evidence les objets que le personnage ne peut pas se permettre
  - Deduit la monnaie par denomination sans convertir entre les types de pieces
  - Cascade les deficits vers les denominations inferieures (PO > PA > PC)
- Empilement intelligent : les objets empilables deja possedes voient leur quantite incrementee
- Descriptions au survol de la souris

#### Integration intelligente
- **Ouverture automatique a la montee de niveau** — le panneau de selection s'ouvre automatiquement quand un personnage gagne un niveau
- **Points d'acces multiples** — bouton dans l'en-tete de la feuille de personnage, controles de scene, menu contextuel du repertoire d'acteurs, raccourci clavier et API macro
- **Detection des doublons** — suit les sources de compendium pour empecher l'octroi d'objets que le personnage possede deja

### Classes supportees

Berserker, The Cheat, Commander, Hunter, Mage, Oathsworn, Shadowmancer, Shepherd, Songweaver, Stormshifter, Zephyr — chacune avec ses sous-classes respectives.

### Installation

#### Depuis Foundry

1. Ouvrir l'onglet **Add-on Modules** dans l'ecran de configuration de Foundry
2. Cliquer sur **Install Module**
3. Coller l'URL du manifeste suivante :
   ```
   https://github.com/kenlimero/nimble-selector/releases/latest/download/module.json
   ```
4. Cliquer sur **Install**

#### Manuelle

1. Telecharger le dernier `module.zip` depuis les [Releases](https://github.com/kenlimero/nimble-selector/releases)
2. L'extraire dans votre repertoire `Data/modules/`
3. Redemarrer Foundry et activer le module dans les parametres de votre monde

### Utilisation

1. Activer **Nimble Selector** dans les parametres de modules de votre monde
2. Ouvrir une feuille de personnage — un nouveau bouton apparait dans les controles d'en-tete
3. Cliquer dessus pour ouvrir le **Panneau de Selection**, qui affiche un resume des capacites, sorts et equipements disponibles
4. Cliquer sur une section pour ouvrir le selecteur correspondant et choisir quoi octroyer
5. A la montee de niveau, le panneau s'ouvre automatiquement (configurable)

**Raccourci clavier :** `Shift+L` ouvre le selecteur pour votre token controle ou votre personnage par defaut.

### Parametres

| Parametre | Defaut | Description |
|-----------|--------|-------------|
| Ouverture auto a la montee de niveau | `true` | Ouvre automatiquement le panneau de selection quand un personnage monte de niveau ou obtient une nouvelle classe |
| Pre-selection des capacites | `true` | Pre-selectionne les nouvelles capacites dans le selecteur de capacites de classe |

### Compatibilite

- **FoundryVTT :** v13
- **Systeme Nimble :** v0.6.0+

---

## License

This project is licensed under the MIT License.
