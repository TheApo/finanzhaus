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
│   └── finanzhaus-data.*.json   # MindMap-Daten (de/en)
└── i18n/*.json                  # UI-Texte
```

## Datenmodell

- **9 Kategorien**: strategie, privat_finanz, gruendung, absicherung, vorsorge, vermoegen, ausland, finanzierung, zahlungsverkehr
- **Hierarchie**: Level 0 (Root) → Level 1 (4 Hauptbereiche) → Level 2+ (Unterthemen)
- Nodes können mehrere Kategorien haben (`categoryIds: CategoryId[]`)

## Zentrale Signals

```typescript
activeCategories: Set<CategoryId>  // Aktive Kategorie-Filter
expandedNodes: Set<string>         // Expandierte Node-IDs
focusedNode: { node, parent, root, level } | null
panOffset: { x, y }
zoomLevel: number (0.4 - 2.0)
```

## Entwicklungsprinzipien

**DRY** (Don't Repeat Yourself) und **KISS** (Keep It Simple, Stupid) anwenden:

- Keine Code-Duplikation, gemeinsame Logik in Services auslagern
- Einfache, verständliche Lösungen bevorzugen
- Bestehende Patterns und Strukturen wiederverwenden
- Keine Over-Engineering oder unnötige Abstraktionen

## Commands

```bash
npm run dev      # Dev-Server (localhost:3000)
npm run build    # Production Build
```
