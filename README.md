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
    └── services/
        └── data.service.ts # Datenservice mit Baumstruktur
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

## Finanzhaus-Kategorien

| Kategorie | Farbe | Beschreibung |
|-----------|-------|--------------|
| Genossenschaftliche Idee | Grau | Strategische Ausrichtung |
| Private FinanzPlanung | Dunkelblau | Privatkundenberatung |
| Gründung und Nachfolge | Blau | Unternehmensgründung |
| Versicherung | Orange | Absicherung |
| Vorsorge & Mitarbeiter | Rot | Altersvorsorge, bAV |
| Vermögen & EigenKapital | Grün | Vermögensaufbau |
| Auslandsgeschäft | Gelb | Internationale Geschäfte |
| Finanzierung | Violett | Kredite, Darlehen |
| Zahlungsverkehr | Hellblau | Konten, Transaktionen |

## Bedienung

1. **L1-Knoten klicken**: Öffnet/schließt die Unterebenen
2. **L2-Knoten klicken**: Öffnet/schließt die L3-Detailebene
3. **Finanzhaus klicken**: Filtert nach Kategorie
4. **Maus über Knoten**: Zeigt Tooltip (falls vorhanden)

## Scripts

| Befehl | Beschreibung |
|--------|--------------|
| `npm run dev` | Startet Entwicklungsserver |
| `npm run build` | Erstellt Produktions-Build |
| `npm run preview` | Startet Produktions-Preview |

## Lizenz

Proprietär - VR Bank
