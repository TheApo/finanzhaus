import { Injectable, inject, signal, Signal } from "@angular/core";
import { I18nService, Language } from "./i18n.service";

// Beratung (alte JSON)
import beratungDataDe from "../data/finanzhaus-data.de.json";
import beratungDataEn from "../data/finanzhaus-data.en.json";

// Produkte (neue JSON)
import produkteDataDe from "../data/finanzhaus-data-new.de.json";
import produkteDataEn from "../data/finanzhaus-data-new.en.json";

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
}

export interface Node {
  id: string;
  label: string;
  categoryIds: CategoryId[];
  icon?: string;
  tooltip?: string;
  children?: Node[];
}

export type DataMode = 'beratung' | 'produkte';

type FinanzData = typeof produkteDataDe;

const dataByModeAndLanguage: Record<DataMode, Record<Language, FinanzData>> = {
  beratung: {
    de: beratungDataDe as unknown as FinanzData,
    en: beratungDataEn as unknown as FinanzData
  },
  produkte: {
    de: produkteDataDe,
    en: produkteDataEn
  }
};

@Injectable({
  providedIn: "root",
})
export class DataService {
  private i18n = inject(I18nService);

  // Datenmodus: beratung oder produkte
  private _dataMode = signal<DataMode>('beratung');
  dataMode: Signal<DataMode> = this._dataMode.asReadonly();

  setDataMode(mode: DataMode): void {
    this._dataMode.set(mode);
  }

  toggleDataMode(): void {
    this._dataMode.set(this._dataMode() === 'beratung' ? 'produkte' : 'beratung');
  }

  private getData(): FinanzData {
    return dataByModeAndLanguage[this._dataMode()][this.i18n.language()];
  }

  getCategories(): Category[] {
    return this.getData().categories as Category[];
  }

  getTreeData(): Node[] {
    return this.getData().topics.map((topic) => this.mapNode(topic));
  }

  getRootNode(): Node {
    const data = this.getData();
    const rootData = data.root as { id: string; name: string; finanzhaus: string; icon: string };
    return {
      id: rootData.id,
      label: rootData.name,
      categoryIds: [rootData.finanzhaus as CategoryId],
      icon: rootData.icon,
      children: data.topics.map((topic) => this.mapNode(topic, rootData.id))
    };
  }

  private mapNode(data: any, parentId?: string): Node {
    let categoryIds: CategoryId[];
    if (Array.isArray(data.finanzhaus)) {
      categoryIds = data.finanzhaus as CategoryId[];
    } else if (data.finanzhaus) {
      categoryIds = [data.finanzhaus as CategoryId];
    } else {
      categoryIds = ["strategie"];
    }

    const nodeId = data.id || this.generateId(data.name, parentId);

    return {
      id: nodeId,
      label: data.name,
      categoryIds,
      icon: data.icon,
      tooltip: data.tooltip,
      children: data.blaetter
        ? data.blaetter.map((child: any) => this.mapNode(child, nodeId))
        : undefined,
    };
  }

  private generateId(name: string, parentId?: string): string {
    // Deterministisch: basiert auf Name und Parent-Pfad, kein Random
    const baseName = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (parentId) {
      return `${parentId}_${baseName}`;
    }
    return baseName;
  }
}
