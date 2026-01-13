import { Injectable } from "@angular/core";

export type CategoryId =
  | "zahlungsverkehr"
  | "finanzierung"
  | "vermoegen"
  | "absicherung"
  | "ausland"
  | "vorsorge"
  | "gruendung"
  | "strategie"
  | "privat_finanz";

export interface Category {
  id: CategoryId;
  label: string;
  color: string; // Tailwind class for background
  textColor: string;
}

export interface Node {
  id: string;
  label: string;
  categoryIds: CategoryId[];
  icon?: string; // Optional: Icon für L1 Knoten
  tooltip?: string; // Optional: HTML-Tooltip für L3 Knoten
  children?: Node[];
}

// --- JSON structure: finanzhaus kann String oder Array sein ---
const RAW_DATA = {
  topics: [
    {
      id: "unternehmer_privat",
      name: "Unternehmer Privat",
      finanzhaus: "privat_finanz",
      icon: "person",
      blaetter: [
        { name: "Altersvorsorge", finanzhaus: ["strategie", "privat_finanz"] },
        {
          name: "Private Kontoverbindung",
          finanzhaus: ["strategie", "privat_finanz"],
        },
        {
          name: "Vermögen ansparen und anlegen",
          finanzhaus: ["strategie", "privat_finanz"],
        },
        { name: "Finanzierung", finanzhaus: ["strategie", "privat_finanz"] },
        {
          name: "Vermögenswerte absichern",
          finanzhaus: ["strategie", "privat_finanz"],
        },
        {
          name: "Familie und Gesundheit",
          finanzhaus: ["strategie", "privat_finanz"],
        },
      ],
    },
    {
      id: "lieferanten",
      name: "Lieferanten",
      finanzhaus: "strategie",
      icon: "truck",
      blaetter: [
        {
          name: "Zahlungsziele und Skonto",
          finanzhaus: ["strategie", "vermoegen"],
        },
        {
          name: "Transporte absichern",
          finanzhaus: ["strategie", "absicherung"],
        },
        {
          name: "Nachhaltige Faktoren berücksichtigen",
          finanzhaus: ["strategie", "gruendung"],
        },
        {
          name: "Auslandsgeschäfte abwickeln",
          finanzhaus: ["strategie", "ausland"],
          blaetter: [
            {
              name: "AZV",
              finanzhaus: "zahlungsverkehr",
              tooltip:
                "<b>Auslandszahlungsverkehr (AZV)</b><br><br>Effiziente Abwicklung Ihrer internationalen Zahlungen mit <b>optimierten Konditionen</b> und schnellen Laufzeiten.<br><br>• SEPA & SWIFT-Überweisungen<br>• Währungsmanagement<br>• Dokumenteninkasso",
            },
          ],
        },
      ],
    },
    {
      id: "kunden",
      name: "Kunden",
      finanzhaus: "strategie",
      icon: "users",
      blaetter: [
        {
          name: "Forderungen schützen",
          finanzhaus: ["strategie", "absicherung"],
        },
        {
          name: "Bürgschaften und Liquidität optimieren",
          finanzhaus: ["strategie", "zahlungsverkehr"],
        },
        {
          name: "Moderne Zahlungsmöglichk. anbieten",
          finanzhaus: ["strategie", "zahlungsverkehr"],
        },
        {
          name: "Zahlungsziele und Liquidität steuern",
          finanzhaus: ["strategie", "zahlungsverkehr"],
        },
        {
          name: "Transporte absichern",
          finanzhaus: ["strategie", "absicherung"],
        },
        {
          name: "Auslandsgeschäfte abwickeln",
          finanzhaus: ["strategie", "ausland"],
        },
      ],
    },
    {
      id: "muster_gmbh",
      name: "Muster GmbH",
      finanzhaus: "strategie",
      icon: "building",
      blaetter: [
        {
          name: "Liquide bleiben",
          finanzhaus: ["strategie", "zahlungsverkehr"],
          blaetter: [
            {
              name: "Kontokorrent",
              finanzhaus: "zahlungsverkehr",
              tooltip:
                "<b>Kontokorrentkredit</b><br><br>Flexible Liquiditätsreserve für Ihr Unternehmen mit <b>sofortiger Verfügbarkeit</b>.<br><br>• Individueller Kreditrahmen<br>• Zinsen nur bei Inanspruchnahme<br>• Schnelle Anpassung an Ihren Bedarf",
            },
            {
              name: "Tagesgeld",
              finanzhaus: "vermoegen",
              tooltip:
                "<b>Tagesgeldanlage</b><br><br>Parken Sie überschüssige Liquidität <b>flexibel und sicher</b> mit täglicher Verfügbarkeit.<br><br>• Attraktive Verzinsung<br>• Keine Kündigungsfristen<br>• Einlagensicherung",
            },
          ],
        },
        { name: "Gründen & Nachfolge", finanzhaus: ["strategie", "gruendung"] },
        {
          name: "Investitionen planen",
          finanzhaus: ["strategie", "finanzierung"],
          blaetter: [
            {
              name: "Liquide bleiben",
              finanzhaus: "zahlungsverkehr",
              tooltip:
                "<b>Liquiditätsplanung bei Investitionen</b><br><br>Sichern Sie Ihre <b>Zahlungsfähigkeit</b> auch während großer Investitionsphasen.<br><br>• Cashflow-Analyse<br>• Liquiditätsreserven planen<br>• Working Capital optimieren",
            },
            {
              name: "Mitarbeiter halten und gewinnen",
              finanzhaus: "vorsorge",
              tooltip:
                "<b>Betriebliche Vorsorge</b><br><br>Stärken Sie Ihre <b>Arbeitgeberattraktivität</b> durch moderne Vorsorgekonzepte.<br><br>• Betriebliche Altersvorsorge (bAV)<br>• Zeitwertkonten<br>• Gruppen-Unfallversicherung",
            },
            {
              name: "Vermögenswerte absichern",
              finanzhaus: "absicherung",
              tooltip:
                "<b>Investitionsschutz</b><br><br>Schützen Sie Ihre <b>Neuinvestitionen</b> von Anfang an umfassend ab.<br><br>• Maschinenversicherung<br>• Elektronikversicherung<br>• Montageversicherung",
            },
          ],
        },
        {
          name: "Vermögen und Eigenkapital bilden/anlegen",
          finanzhaus: ["strategie", "vermoegen"],
          blaetter: [
            {
              name: "Anlagemanagement",
              finanzhaus: "vermoegen",
              tooltip:
                "<b>Professionelles Anlagemanagement</b><br><br>Strategische Vermögensanlage für <b>nachhaltigen Unternehmenserfolg</b>.<br><br>• Individuelle Anlagestrategie<br>• Risikodiversifikation<br>• Regelmäßiges Reporting<br>• ESG-konforme Investments",
            },
          ],
        },
        {
          name: "Vermögenswerte absichern",
          finanzhaus: ["strategie", "absicherung"],
          blaetter: [
            {
              name: "Sachwerte",
              finanzhaus: "absicherung",
              tooltip:
                "<b>Sachwertversicherung</b><br><br>Umfassender Schutz für Ihre <b>betrieblichen Vermögenswerte</b>.<br><br>• Gebäudeversicherung<br>• Inhaltsversicherung<br>• Technische Versicherungen<br>• All-Risk-Deckungen",
            },
            {
              name: "Ertragsausfall",
              finanzhaus: "absicherung",
              tooltip:
                "<b>Ertragsausfallversicherung</b><br><br>Sichern Sie Ihre <b>Ertragskraft</b> auch bei Betriebsunterbrechungen.<br><br>• Betriebsunterbrechung<br>• Mehrkostenversicherung<br>• Supply-Chain-Absicherung<br>• Cyber-Ertragsausfall",
            },
          ],
        },
        {
          name: "Mitarbeiter halten und gewinnen",
          finanzhaus: ["strategie", "vorsorge"],
        },
        {
          name: "Zahlungen abwickeln",
          finanzhaus: ["strategie", "zahlungsverkehr"],
        },
      ],
    },
  ],
};

@Injectable({
  providedIn: "root",
})
export class DataService {
  getCategories(): Category[] {
    return [
      {
        id: "strategie",
        label: "Genossenschaftliche Idee",
        color: "bg-slate-200",
        textColor: "text-slate-800",
      },
      {
        id: "privat_finanz",
        label: "Private FinanzPlanung",
        color: "bg-[#0f172a]",
        textColor: "text-white",
      },
      {
        id: "gruendung",
        label: "Gründung und Nachfolge",
        color: "bg-[#1e40af]",
        textColor: "text-white",
      },
      {
        id: "absicherung",
        label: "Versicherung",
        color: "bg-[#ea580c]",
        textColor: "text-white",
      },
      {
        id: "vorsorge",
        label: "Vorsorge & Mitarbeiter",
        color: "bg-[#be123c]",
        textColor: "text-white",
      },
      {
        id: "vermoegen",
        label: "Vermögen & Eigenkapital",
        color: "bg-[#4d7c0f]",
        textColor: "text-white",
      },
      {
        id: "ausland",
        label: "Auslandsgeschäft",
        color: "bg-[#eab308]",
        textColor: "text-slate-900",
      },
      {
        id: "finanzierung",
        label: "Finanzierung",
        color: "bg-[#4c1d95]",
        textColor: "text-white",
      },
      {
        id: "zahlungsverkehr",
        label: "Zahlungsverkehr",
        color: "bg-[#0ea5e9]",
        textColor: "text-white",
      },
    ];
  }

  getTreeData(): Node[] {
    return RAW_DATA.topics.map((topic) => this.mapNode(topic));
  }

  private mapNode(data: any): Node {
    // finanzhaus kann String oder Array sein
    let categoryIds: CategoryId[];
    if (Array.isArray(data.finanzhaus)) {
      categoryIds = data.finanzhaus as CategoryId[];
    } else if (data.finanzhaus) {
      categoryIds = [data.finanzhaus as CategoryId];
    } else {
      categoryIds = ["strategie"]; // Default: Genossenschaftliche Idee
    }

    return {
      id: data.id || this.generateId(data.name),
      label: data.name,
      categoryIds,
      icon: data.icon,
      tooltip: data.tooltip,
      children: data.blaetter
        ? data.blaetter.map((child: any) => this.mapNode(child))
        : undefined,
    };
  }

  private generateId(name: string): string {
    return (
      name.toLowerCase().replace(/[^a-z0-9]/g, "_") +
      "_" +
      Math.random().toString(36).substr(2, 4)
    );
  }
}
