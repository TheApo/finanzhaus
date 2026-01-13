import { Injectable } from "@angular/core";
import finanzData from "../data/finanzhaus-data.json";

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

@Injectable({
  providedIn: "root",
})
export class DataService {
  getCategories(): Category[] {
    return finanzData.categories as Category[];
  }

  getTreeData(): Node[] {
    return finanzData.topics.map((topic) => this.mapNode(topic));
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
