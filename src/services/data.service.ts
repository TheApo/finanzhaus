import { Injectable, inject, computed } from "@angular/core";
import { I18nService, Language } from "./i18n.service";

import finanzDataDe from "../data/finanzhaus-data.de.json";
import finanzDataEn from "../data/finanzhaus-data.en.json";

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

type FinanzData = typeof finanzDataDe;

const dataByLanguage: Record<Language, FinanzData> = {
  de: finanzDataDe,
  en: finanzDataEn
};

@Injectable({
  providedIn: "root",
})
export class DataService {
  private i18n = inject(I18nService);

  private getData(): FinanzData {
    return dataByLanguage[this.i18n.language()];
  }

  getCategories(): Category[] {
    return this.getData().categories as Category[];
  }

  getTreeData(): Node[] {
    return this.getData().topics.map((topic) => this.mapNode(topic));
  }

  private mapNode(data: any): Node {
    let categoryIds: CategoryId[];
    if (Array.isArray(data.finanzhaus)) {
      categoryIds = data.finanzhaus as CategoryId[];
    } else if (data.finanzhaus) {
      categoryIds = [data.finanzhaus as CategoryId];
    } else {
      categoryIds = ["strategie"];
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
