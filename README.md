# VR Finanzhaus Navigator

Eine interaktive Angular-Anwendung zur Visualisierung von Finanzberatungsthemen als MindMap. Die Anwendung stellt die verschiedenen Beratungsfelder einer Genossenschaftsbank in einer übersichtlichen, klickbaren Struktur dar.

## Features

- **Interaktive MindMap**: 4 Hauptknoten (L1) mit expandierbaren Unterebenen (L2, L3)
- **Finanzhaus-Legende**: Klickbare Filterkomponente zur Kategorieauswahl
- **Kategorie-Filter**: Hervorhebung und Filterung nach Finanzhaus-Kategorien
- **Tooltips**: Informative Tooltips für detaillierte Beschreibungen
- **Responsive Design**: Automatische Skalierung für verschiedene Bildschirmgrößen
- **Animationen**: Sanfte Bloom-Animationen beim Öffnen von Knoten

## Technologie-Stack

- **Framework**: Angular 21 (Standalone Components)
- **Styling**: Reines CSS mit CSS-Variablen (BEM-Namenskonvention)
- **State Management**: Angular Signals
- **Build**: Angular CLI mit @angular/build

## Projektstruktur

```
finanzhaus/
├── index.html              # Haupt-HTML-Datei
├── index.tsx               # Angular Bootstrap
├── styles.css              # Globale Styles (CSS-Variablen, Komponenten-Styles)
├── angular.json            # Angular CLI Konfiguration
├── package.json            # NPM Dependencies
├── tsconfig.json           # TypeScript Konfiguration
└── src/
    ├── app.component.ts    # Haupt-App-Komponente
    ├── app.component.html  # App-Template mit MindMap
    ├── components/
    │   └── finanzhaus.component.ts  # Finanzhaus-Legende
    ├── data/
    │   └── finanzhaus-data.json     # Datenquelle (Kategorien & Topics)
    └── services/
        └── data.service.ts          # Datenservice mit Baumstruktur
```

## Installation

**Voraussetzungen:** Node.js (Version 18+)

```bash
# Dependencies installieren
npm install

# Entwicklungsserver starten
npm run dev

# Produktions-Build erstellen
npm run build
```

Die Anwendung läuft unter `http://localhost:3000`

## Daten anpassen

Die MindMap-Daten werden in `src/data/finanzhaus-data.json` verwaltet. Diese Datei enthält:

- **categories**: Liste aller Finanzhaus-Kategorien mit ID und Label
- **topics**: Hierarchische Struktur der MindMap-Knoten

### Struktur der Topics (3 Ebenen)

Die MindMap unterstützt 3 Hierarchieebenen: **L1** (Hauptknoten) → **L2** (Unterthemen) → **L3** (Details)

```json
{
  "id": "muster_gmbh",
  "name": "Muster GmbH",
  "finanzhaus": "strategie",
  "icon": "building",
  "blaetter": [
    {
      "name": "Investitionen planen",
      "finanzhaus": ["strategie", "finanzierung"],
      "blaetter": [
        {
          "name": "Liquide bleiben",
          "finanzhaus": "zahlungsverkehr",
          "tooltip": "<b>Liquiditätsplanung</b><br>Details..."
        }
      ]
    }
  ]
}
```

| Ebene | Felder | Beschreibung |
|-------|--------|--------------|
| **L1** | `id`, `name`, `finanzhaus`, `icon`, `blaetter` | Hauptknoten mit Icon |
| **L2** | `name`, `finanzhaus`, `blaetter` | Unterthemen, können L3-Knoten enthalten |
| **L3** | `name`, `finanzhaus`, `tooltip` | Detailknoten mit optionalem Tooltip |

| Feld | Beschreibung |
|------|--------------|
| `id` | Eindeutige Kennung (nur bei L1-Knoten erforderlich) |
| `name` | Anzeigename des Knotens |
| `finanzhaus` | Kategorie-ID als String oder Array von IDs |
| `icon` | Icon-Name für L1-Knoten (`person`, `truck`, `users`, `building`) |
| `blaetter` | Array von Unterknoten (L1 → L2, L2 → L3) |
| `tooltip` | HTML-Tooltip für L3-Knoten (optional) |

## Finanzhaus-Kategorien

| ID | Label | Farbe |
|----|-------|-------|
| `strategie` | Genossenschaftliche Idee | Grau |
| `privat_finanz` | Private FinanzPlanung | Dunkelblau |
| `gruendung` | Gründung und Nachfolge | Blau |
| `absicherung` | Versicherung | Orange |
| `vorsorge` | Vorsorge & Mitarbeiter | Rot |
| `vermoegen` | Vermögen & Eigenkapital | Grün |
| `ausland` | Auslandsgeschäft | Gelb |
| `finanzierung` | Finanzierung | Violett |
| `zahlungsverkehr` | Zahlungsverkehr | Hellblau |

## Bedienung

1. **L1-Knoten klicken**: Öffnet/schließt die Unterebenen
2. **L2-Knoten klicken**: Öffnet/schließt die L3-Detailebene
3. **Finanzhaus klicken**: Filtert nach Kategorie
4. **Maus über Knoten**: Zeigt Tooltip (falls vorhanden)

## Scripts

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Startet Entwicklungsserver (Port 3000) |
| `npm run build` | Erstellt Produktions-Build in `/dist` |

## Lizenz

Proprietär - VR Bank
