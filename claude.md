# VR Finanzhaus Navigator

Interaktives MindMap-Tool zur Visualisierung von Finanzberatungsthemen einer Genossenschaftsbank.

## Tech Stack

- **Angular 21** (Standalone Components, Zoneless Change Detection, Signals)
- **D3 Force Simulation** für physikbasiertes Layout
- **TypeScript 5.9**, reines CSS mit BEM-Naming

## Projektstruktur

```
src/
├── app.component.ts/html    # Hauptkomponente (State, Interaktionen, Rendering)
├── components/
│   └── finanzhaus.component.*   # Kategorie-Legende (Hausform)
├── services/
│   ├── data.service.ts          # Daten-Transformation JSON → Node-Baum
│   ├── force-layout.service.ts  # D3 Sektor-Layout & Kollisionsvermeidung
│   └── i18n.service.ts          # DE/EN Übersetzungen
├── data/
│   ├── finanzhaus-data.de.json       # Beratung-Modus (DE)
│   ├── finanzhaus-data.en.json       # Beratung-Modus (EN)
│   ├── finanzhaus-data-new.de.json   # Produkte-Modus (DE)
│   ├── finanzhaus-data-new.en.json   # Produkte-Modus (EN)
│   └── product_default.json          # Default-Positionen für Produkte
└── i18n/*.json                       # UI-Texte
```

## Datenmodell

- **9 Kategorien**: strategie, privat_finanz, gruendung, absicherung, vorsorge, vermoegen, ausland, finanzierung, zahlungsverkehr
- **Node**: `{ id, label, categoryIds: CategoryId[], icon?, tooltip?, children? }`
- **Hierarchie**: Level 0 (Root) → Level 1 (Hauptbereiche) → Level 2 (Themen) → Level 3+ (Details mit Tooltips)
- **2 Modi**: `beratung` (4 L1: Privat/Lieferanten/Kunden/Organisation) + `produkte` (8 L1: eine pro Finanzhaus-Bereich)
- Nodes können mehrere Kategorien haben (`categoryIds: CategoryId[]`)
- Nodes können `tooltip` haben (HTML-String für Detail-Info)

## Zentrale Signals

```typescript
// State
activeCategories: Set<CategoryId>  // Aktive Kategorie-Filter
expandedNodes: Set<string>         // Expandierte Node-IDs (welche Kinder zeigen)
selectedL2NodeIds: Set<string>     // L2-spezifische Filter aus Finanzhaus-Legende
selectedInfoNode: Node | null      // L3+ Node mit offenem Info-Panel
focusedNodes: Array<{ node, parent, root, level }>  // Multi-Fokus (Strg+Doppelklick)
hoveredNode: Node | null           // Aktuell gehoverter Node (für Hover-Tooltip)
hoveredPathNode: Node | null       // Für Pfad-Highlighting und Unblur

// View
panOffset: { x, y }                // Pan-Position
zoomLevel: number (0.1 - 2.0)      // Zoom-Level
collapsingNodes: Set<string>       // Nodes in Collapse-Animation

// Drag & Drop
draggingNode: Node | null          // Aktuell gezogener Node
isActivelyDragging: boolean        // Erst true nach 5px Bewegung

// Modi
dataMode: 'beratung' | 'produkte'  // Datenmodus
```

## Interaktionsmodell

### Click-Verhalten

| Level | Click-Aktion |
|-------|--------------|
| L0 (Root) | Alles expandiert → collapse all. Nichts expandiert → expand all L1 |
| L1 | Toggle expand: zeigt/versteckt L2 Kinder |
| L2 | Toggle expand: zeigt/versteckt L3 Kinder |
| L3+ | Öffnet Info-Panel rechts, Node wird highlighted. Click woanders schließt es. |

### Doppelklick-Verhalten

- **L1/L2**: Fokus-Modus (nur dieser Branch sichtbar)
- **Strg+Doppelklick**: Multi-Fokus (mehrere Branches gleichzeitig)

### Info-Panel (L3+ Detail-Ansicht)

- **Position**: Fixed rechts am Viewport (`right: var(--spacing-lg); top: 50%`)
- **Banner**: Farbiger Kategorie-Hintergrund mit rundem Piktogramm-Bild (90px, `border-radius: 50%`)
- **Bildauswahl**: `getInfoPanelImagePath()` - Fallback-Kette: L2-Parent → L1-Ancestor → L0-Root
- **Rahmen**: `border: 1.5px solid rgba(0,0,0,0.2)` + box-shadow auf `.info-panel`
- **Pfad-Highlighting persistent**: `isOnHoveredPath()` und `isLineOnHoveredPath()` nutzen `hoveredPathNode() || selectedInfoNode()` als Fallback — Pfad bleibt hervorgehoben solange Panel offen
- **Touch-kompatibel**: Funktioniert ohne Hover (rein Click-basiert, iPad etc.)
- Nur ein Panel gleichzeitig offen
- Schließt bei Click auf Hintergrund oder anderen Node

### Hover-Verhalten

- L0-L2: Pfad-Highlighting (Linie + Vorfahren scharf) + Hover-Tooltip
- L3+: Nur Pfad-Highlighting, **kein Tooltip** bei Hover

### Navigation

- **Pan**: Mouse drag / Touch 1-finger
- **Zoom**: Mouse wheel / Touch pinch
- **Node Drag**: L1+ können verschoben werden (5px Threshold)
- **Rechtsklick / Arrange-Button**: Kinder kreisförmig anordnen

## CSS-Klassen (BEM)

- `.node--level-{0-3}`: Level-spezifisches Styling
- `.node--blurred`: Weichgezeichnet (filter: blur)
- `.node--focused`: Fokussierter Node
- `.node-wrapper--collapsing`: Collapse-Animation läuft
- `.category-{id}`: Kategorie-Farbe

## Layout-System (ForceLayoutService)

- 5 Phasen: `buildLayoutTree` → `analyzeSubtrees` → `assignSectors` → `calculateIdealPositions` → Simulation/Statisch
- Sektor-basiert: L1 gleichmäßig verteilt, L2+ gewichtet nach Anzahl Nachkommen
- `userPositions` Map persistiert Drag-Positionen (überlebt `updateNodes`)
- `product_default.json` enthält Default-Positionen für Produkte-Modus

## Rendering

- Rekursives `ng-template #nodeTemplate` rendert alle Hierarchie-Level
- `app.component.ts` (~3250 Zeilen) enthält gesamten State + Interaktionslogik
- Piktogramm-Bild-Mappings: `l0ImageMap`, `l1ImageMap`, `l2ImageMap` (Node-ID → PNG-Pfad)

## Persistenz (localStorage)

- `finanzhaus-view-state-{mode}`: expandedNodes, activeCategories, pan, zoom, userPositions
- `finanzhaus-datamode`: Aktueller Modus
- `finanzhaus-debug-sizes`: Debug-Panel Einstellungen
- `finanzhaus-background-color`: Hintergrundfarbe

## Entwicklungsprinzipien

**DRY** (Don't Repeat Yourself) und **KISS** (Keep It Simple, Stupid) **STRIKT** anwenden:

### DRY - Vor jeder Änderung prüfen:
1. Gibt es bereits eine ähnliche Funktion/Logik? → Wiederverwenden
2. Wird derselbe Code mehrfach geschrieben? → Extrahieren
3. Kann ich bestehende Patterns nutzen? → Anpassen statt neu schreiben

### KISS - Einfachste Lösung wählen:
1. Weniger Code ist besser als mehr Code
2. Keine "cleveren" Lösungen, lieber lesbar
3. Keine Abstraktion ohne konkreten Mehrwert
4. Keine Over-Engineering oder unnötige Komplexität

### Vor jeder Implementierung:
- [ ] Existierenden Code lesen und verstehen
- [ ] Prüfen ob ähnliche Lösung bereits existiert
- [ ] Einfachste mögliche Lösung wählen
- [ ] Bestehende Patterns und Strukturen wiederverwenden

## WICHTIG: Verbotene Aktionen

- **NIEMALS** `npm run dev` oder Dev-Server starten
- **NIEMALS** Build-Commands ausführen ohne explizite Aufforderung
- Der Benutzer startet den Dev-Server selbst

## Commands (nur zur Referenz)

```bash
npm run dev      # Dev-Server (localhost:3000) - NICHT AUSFÜHREN
npm run build    # Production Build
```
