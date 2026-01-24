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
- **Hierarchie**: Level 0 (Root) → Level 1 (4 Hauptbereiche) → Level 2 (Themen) → Level 3+ (Details)
- Nodes können mehrere Kategorien haben (`categoryIds: CategoryId[]`)
- Nodes können `tooltip` haben (HTML-String für Detail-Info)

## Zentrale Signals

```typescript
// State
activeCategories: Set<CategoryId>  // Aktive Kategorie-Filter
expandedNodes: Set<string>         // Expandierte Node-IDs (welche Kinder zeigen)
focusedNode: { node, parent, root, level } | null  // Fokus-Modus
hoveredNode: Node | null           // Aktuell gehoverter Node (für Tooltip)
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
| L3+ | Öffnet Info-Tooltip, Node wird highlighted. Click woanders schließt es. |

### Info-Tooltip (L3+)

- Öffnet bei **Click** auf L3+ Node (nicht Hover)
- Node mit offenem Tooltip ist **highlighted** (nicht geblurrt)
- Nur ein Tooltip gleichzeitig offen
- Schließt bei Click auf Hintergrund oder anderen Node
- Signal: `selectedInfoNode: Node | null`

### Hover-Verhalten

- L0-L2: Pfad-Highlighting (Linie + Vorfahren scharf)
- L3+: Nur Pfad-Highlighting, **kein Tooltip** bei Hover

### Navigation

- **Pan**: Mouse drag / Touch 1-finger
- **Zoom**: Mouse wheel / Touch pinch
- **Node Drag**: L1+ können verschoben werden (5px Threshold)

## CSS-Klassen (BEM)

- `.node--level-{0-3}`: Level-spezifisches Styling
- `.node--blurred`: Weichgezeichnet (filter: blur)
- `.node--focused`: Fokussierter Node
- `.node-wrapper--collapsing`: Collapse-Animation läuft
- `.category-{id}`: Kategorie-Farbe

## Persistenz (localStorage)

- `finanzhaus-view-state-{mode}`: expandedNodes, activeCategories, pan, zoom, userPositions
- `finanzhaus-datamode`: Aktueller Modus
- `finanzhaus-debug-sizes`: Debug-Panel Einstellungen

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
