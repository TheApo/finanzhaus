import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, Node, CategoryId, Category } from './services/data.service';
import { FinanzhausComponent } from './components/finanzhaus.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FinanzhausComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  private dataService = inject(DataService);

  // Data
  mainNodes = signal<Node[]>(this.dataService.getTreeData());
  categories = signal<Category[]>(this.dataService.getCategories());

  // State
  activeCategory = signal<CategoryId | null>(null);
  hoveredNode = signal<Node | null>(null);

  // Expanded Nodes IDs (Manual interaction)
  // Set für L1 - mehrere können gleichzeitig offen sein
  expandedL1Set = signal<Set<string>>(new Set());
  // Map für L2 - pro L1 kann ein L2 offen sein
  expandedL2Map = signal<Map<string, string>>(new Map()); 

  getCategoryColor(catId: CategoryId): string {
    const cat = this.categories().find(c => c.id === catId);
    return cat ? cat.color : 'bg-gray-400';
  }

  getCategoryTextColor(catId: CategoryId): string {
    const cat = this.categories().find(c => c.id === catId);
    return cat ? cat.textColor : 'text-slate-800';
  }

  getCategoryLabel(catId: CategoryId): string {
    const cat = this.categories().find(c => c.id === catId);
    return cat ? cat.label : '';
  }

  // Gibt die "Hauptkategorie" eines Nodes zurück (erste die nicht strategie ist, sonst strategie)
  getPrimaryCategory(node: Node): CategoryId {
    const nonStrategie = node.categoryIds.find(id => id !== 'strategie');
    return nonStrategie || node.categoryIds[0] || 'strategie';
  }

  // Prüft ob Node eine bestimmte Kategorie hat
  hasCategory(node: Node, catId: CategoryId): boolean {
    return node.categoryIds.includes(catId);
  }

  // --- Actions ---

  toggleCategory(catId: CategoryId) {
    if (this.activeCategory() === catId) {
      this.activeCategory.set(null);
    } else {
      this.activeCategory.set(catId);
    }
  }

  handleNodeClick(node: Node, level: number, parent?: Node) {
    if (level === 1) {
      const currentSet = new Set(this.expandedL1Set());
      if (currentSet.has(node.id)) {
        // Schließen: L1 aus Set entfernen und zugehörige L2 entfernen
        currentSet.delete(node.id);
        const currentMap = new Map(this.expandedL2Map());
        currentMap.delete(node.id);
        this.expandedL2Map.set(currentMap);
      } else {
        // Öffnen: L1 zum Set hinzufügen
        currentSet.add(node.id);
      }
      this.expandedL1Set.set(currentSet);
    } else if (level === 2 && parent) {
      const currentMap = new Map(this.expandedL2Map());
      if (currentMap.get(parent.id) === node.id) {
        // Schließen: L2 für diesen L1 entfernen
        currentMap.delete(parent.id);
      } else {
        // Öffnen: L2 für diesen L1 setzen
        currentMap.set(parent.id, node.id);
      }
      this.expandedL2Map.set(currentMap);
    }
  }

  handleBackgroundClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('mindmap-container')) {
       // Optional behavior
    }
  }

  resetView() {
    this.expandedL1Set.set(new Set());
    this.expandedL2Map.set(new Map());
    this.activeCategory.set(null);
  }

  // --- Recursive Helpers for Logic ---

  hasCategoryMatch(node: Node, catId: CategoryId): boolean {
    if (node.categoryIds.includes(catId)) return true;
    if (node.children) {
      return node.children.some(child => this.hasCategoryMatch(child, catId));
    }
    return false;
  }

  // --- View Helpers ---

  isL1Expanded(node: Node): boolean {
    const manuallyOpen = this.expandedL1Set().has(node.id);
    const activeCat = this.activeCategory();

    // Offen wenn: manuell geöffnet ODER Kategorie passt
    if (activeCat) {
      return manuallyOpen || this.hasCategoryMatch(node, activeCat);
    }
    return manuallyOpen;
  }

  isL2Expanded(node: Node, parentL1?: Node): boolean {
    const manuallyOpen = parentL1 ? this.expandedL2Map().get(parentL1.id) === node.id : false;
    const activeCat = this.activeCategory();

    // Offen wenn: manuell geöffnet ODER L3-Kinder haben die Kategorie
    if (activeCat) {
      // L3 nur zeigen wenn mindestens ein L3-Kind die Kategorie hat (nicht wenn nur L2 sie hat)
      const childrenMatch = node.children?.some(child => this.hasCategoryMatch(child, activeCat)) ?? false;
      return manuallyOpen || childrenMatch;
    }
    return manuallyOpen;
  }

  isNodeDimmed(node: Node, level: number, parentId: string | null): boolean {
    const activeCat = this.activeCategory();

    // Dimming nur bei aktivem Kategoriefilter
    if (activeCat) {
      // Level 1 wird NIE gedimmt bei Kategoriefilter
      if (level === 1) return false;

      const isMatch = node.categoryIds.includes(activeCat);
      const isPath = this.hasCategoryMatch(node, activeCat);
      if (isMatch || isPath) return false;
      return true;
    }

    // Ohne Kategoriefilter: kein Dimming
    return false;
  }

  // --- Positioning Logic ---

  private getAngle(index: number, total: number): number {
    if (total === 0) return 0;
    const step = 360 / total;
    return (index * step) - 90; 
  }

  /**
   * L2 Radius: Reduced to 110px for tighter fit
   */
  getL2Position(index: number, total: number) {
    const radius = 110; 
    const angle = this.getAngle(index, total);
    
    const rad = angle * (Math.PI / 180);
    const x = Math.round(radius * Math.cos(rad));
    const y = Math.round(radius * Math.sin(rad));

    return { x, y, angle };
  }

  getL2Style(index: number, total: number) {
    const pos = this.getL2Position(index, total);
    return {
      '--tw-translate-x': `${pos.x}px`,
      '--tw-translate-y': `${pos.y}px`,
      'z-index': 10
    };
  }

  /**
   * L3 Radius: Reduced to 85px for tighter fit
   */
  getL3Position(index: number, total: number, parentAngle: number) {
    const radius = 85; 
    
    const sector = 110; 
    const startAngle = parentAngle - (sector / 2);
    
    let effectiveAngle = parentAngle;
    
    if (total > 1) {
       const step = sector / (total - 1);
       effectiveAngle = startAngle + (index * step);
    }

    const rad = effectiveAngle * (Math.PI / 180);
    const x = Math.round(radius * Math.cos(rad));
    const y = Math.round(radius * Math.sin(rad));

    return { x, y };
  }

  getL3Style(index: number, total: number, parentAngle: number) {
    const pos = this.getL3Position(index, total, parentAngle);
    return {
      '--tw-translate-x': `${pos.x}px`,
      '--tw-translate-y': `${pos.y}px`,
      'z-index': 20
    };
  }
}