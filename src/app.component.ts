import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, Node, CategoryId, Category } from './services/data.service';
import { I18nService } from './services/i18n.service';
import { FinanzhausComponent } from './components/finanzhaus.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FinanzhausComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  private dataService = inject(DataService);
  i18n = inject(I18nService);

  // Data - computed to react to language changes
  mainNodes = computed(() => this.dataService.getTreeData());
  categories = computed(() => this.dataService.getCategories());

  // State
  activeCategory = signal<CategoryId | null>(null);
  hoveredNode = signal<Node | null>(null);
  hoveredCategories = signal<CategoryId[]>([]);
  tooltipPosition = signal<{ x: number; y: number; showBelow: boolean } | null>(null);
  finanzhausVisible = signal<boolean>(true);

  // Expanded Nodes IDs (Manual interaction)
  expandedL1Set = signal<Set<string>>(new Set());
  expandedL2Map = signal<Map<string, string>>(new Map());

  t(key: string): string {
    return this.i18n.t(key);
  }

  getCategoryLabel(catId: CategoryId): string {
    const cat = this.categories().find(c => c.id === catId);
    return cat ? cat.label : '';
  }

  getL1Transform(id: string): string {
    switch (id) {
      case 'unternehmer_privat': return 'translate(0, -220px)';
      case 'muster_gmbh': return 'translate(0, 220px)';
      case 'lieferanten': return 'translate(-420px, 0)';
      default: return 'translate(420px, 0)';
    }
  }

  getPrimaryCategory(node: Node): CategoryId {
    const nonStrategie = node.categoryIds.find(id => id !== 'strategie');
    return nonStrategie || node.categoryIds[0] || 'strategie';
  }

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
    if (this.activeCategory()) {
      this.freezeCurrentState();
      this.activeCategory.set(null);
    }

    if (level === 1) {
      const currentSet = new Set(this.expandedL1Set());
      if (currentSet.has(node.id)) {
        currentSet.delete(node.id);
        const currentMap = new Map(this.expandedL2Map());
        currentMap.delete(node.id);
        this.expandedL2Map.set(currentMap);
      } else {
        currentSet.add(node.id);
      }
      this.expandedL1Set.set(currentSet);
    } else if (level === 2 && parent) {
      const currentMap = new Map(this.expandedL2Map());
      if (currentMap.get(parent.id) === node.id) {
        currentMap.delete(parent.id);
      } else {
        currentMap.set(parent.id, node.id);
      }
      this.expandedL2Map.set(currentMap);
    }
  }

  private freezeCurrentState() {
    const activeCat = this.activeCategory();
    if (!activeCat) return;

    const newL1Set = new Set(this.expandedL1Set());
    const newL2Map = new Map(this.expandedL2Map());

    for (const l1 of this.mainNodes()) {
      if (this.isL1Expanded(l1)) {
        newL1Set.add(l1.id);

        if (l1.children) {
          for (const l2 of l1.children) {
            if (this.isL2Expanded(l2, l1) && !newL2Map.has(l1.id)) {
              const childrenMatch = l2.children?.some(child => this.hasCategoryMatch(child, activeCat)) ?? false;
              if (childrenMatch) {
                newL2Map.set(l1.id, l2.id);
              }
            }
          }
        }
      }
    }

    this.expandedL1Set.set(newL1Set);
    this.expandedL2Map.set(newL2Map);
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

    if (activeCat) {
      return manuallyOpen || this.hasCategoryMatch(node, activeCat);
    }
    return manuallyOpen;
  }

  isL2Expanded(node: Node, parentL1?: Node): boolean {
    const manuallyOpen = parentL1 ? this.expandedL2Map().get(parentL1.id) === node.id : false;
    const activeCat = this.activeCategory();

    if (activeCat) {
      const childrenMatch = node.children?.some(child => this.hasCategoryMatch(child, activeCat)) ?? false;
      return manuallyOpen || childrenMatch;
    }
    return manuallyOpen;
  }

  isNodeDimmed(node: Node, level: number, parentId: string | null): boolean {
    const activeCat = this.activeCategory();

    if (activeCat) {
      if (level === 1) return false;

      const isMatch = node.categoryIds.includes(activeCat);
      const isPath = this.hasCategoryMatch(node, activeCat);
      if (isMatch || isPath) return false;
      return true;
    }

    return false;
  }

  // --- Positioning Logic ---

  private getAngle(index: number, total: number): number {
    if (total === 0) return 0;
    const step = 360 / total;
    return (index * step) - 90;
  }

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
      '--tw-translate-y': `${pos.y}px`
    };
  }

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
      '--tw-translate-y': `${pos.y}px`
    };
  }

  // Tooltip Event Handler
  onNodeMouseEnter(event: MouseEvent, node: Node) {
    if (!this.activeCategory()) {
      this.hoveredCategories.set(node.categoryIds);
    }

    if (!node.tooltip) return;

    this.hoveredNode.set(node);

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const tooltipHeight = 200;
    const tooltipWidth = 320;

    const showBelow = rect.top < tooltipHeight + 20;

    let x = rect.left + rect.width / 2;
    if (x - tooltipWidth / 2 < 10) {
      x = tooltipWidth / 2 + 10;
    } else if (x + tooltipWidth / 2 > window.innerWidth - 10) {
      x = window.innerWidth - tooltipWidth / 2 - 10;
    }

    const y = showBelow ? rect.bottom + 16 : rect.top - 16;

    this.tooltipPosition.set({ x, y, showBelow });
  }

  onNodeMouseLeave() {
    this.hoveredNode.set(null);
    this.hoveredCategories.set([]);
    this.tooltipPosition.set(null);
  }
}
