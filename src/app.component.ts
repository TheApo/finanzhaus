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

  // Focus Mode (Lupenfunktion) - generisch für alle Level
  // root speichert immer den Level-1-Vorfahren für die Sichtbarkeitslogik
  focusedNode = signal<{ node: Node; parent: Node; root: Node; level: number } | null>(null);

  // Pan State (Drag & Drop)
  isPanning = signal<boolean>(false);
  panOffset = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  private panStart = { x: 0, y: 0 };

  // Zoom State (Globaler Zoom)
  zoomLevel = signal<number>(1);
  private readonly ZOOM_MIN = 0.4;
  private readonly ZOOM_MAX = 2;
  private readonly ZOOM_STEP = 0.15;

  // Expanded Nodes Set (für alle Level)
  expandedNodes = signal<Set<string>>(new Set());

  t(key: string): string {
    return this.i18n.t(key);
  }

  getCategoryLabel(catId: CategoryId): string {
    const cat = this.categories().find(c => c.id === catId);
    return cat ? cat.label : '';
  }

  getPrimaryCategory(node: Node): CategoryId {
    const nonStrategie = node.categoryIds.find(id => id !== 'strategie');
    return nonStrategie || node.categoryIds[0] || 'strategie';
  }

  // Icon paths for each category
  private iconPaths: Record<CategoryId, string> = {
    strategie: 'M3.75 3v11.25A2.25 2.25 0 0 0 6 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0 1 18 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5',
    privat_finanz: 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
    gruendung: 'M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z',
    absicherung: 'M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z',
    vorsorge: 'M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z',
    vermoegen: 'M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941',
    ausland: 'M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418',
    finanzierung: 'M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75Z',
    zahlungsverkehr: 'M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z'
  };

  // Level 1 Icon Paths (spezielle Icons für Root-Nodes)
  private level1IconPaths: Record<string, string> = {
    'person': 'M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z',
    'truck': 'M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12',
    'users': 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z',
    'building': 'M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3.75h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Zm0 3h.008v.008h-.008v-.008Z'
  };

  getIconPath(categoryId: CategoryId): string {
    return this.iconPaths[categoryId] || this.iconPaths.strategie;
  }

  getNodeIconPath(node: Node, level: number | string): string {
    const numLevel = Number(level);
    if (numLevel === 1 && node.icon) {
      return this.level1IconPaths[node.icon] || this.level1IconPaths['person'];
    }
    return this.getIconPath(this.getPrimaryCategory(node));
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

  handleNodeClick(node: Node, level: number | string, parent: Node | null, root: Node) {
    const numLevel = Number(level);

    if (this.activeCategory()) {
      this.freezeCurrentState();
      this.activeCategory.set(null);
    }

    const focused = this.focusedNode();

    // Im Zoom-Modus: Spezielle Navigation
    if (focused) {
      const role = this.getZoomRole(node);

      // Klick auf Level 1 (Root) → Zoom komplett verlassen
      if (numLevel === 1) {
        this.focusedNode.set(null);
        return;
      }

      // Klick auf den fokussierten Node → Zoom verlassen
      if (role === 'focused') {
        this.focusedNode.set(null);
        return;
      }

      // Klick auf einen Ahnen → Fokus auf diesen Ahnen setzen (rauszoomen)
      if (role && role.startsWith('ancestor-')) {
        const newParent = this.findParentOfNode(root, node);
        if (newParent) {
          const newLevel = numLevel;
          this.focusedNode.set({ node, parent: newParent, root, level: newLevel });
        }
        return;
      }

      // Klick auf ein Kind → Fokus auf dieses Kind setzen (reinzoomen)
      if (role === 'child') {
        this.focusedNode.set({ node, parent: focused.node, root, level: numLevel });
        const expanded = new Set(this.expandedNodes());
        expanded.add(node.id);
        this.expandedNodes.set(expanded);
        return;
      }

      // Klick auf einen Enkel → Fokus auf diesen Enkel setzen (2 Level reinzoomen)
      if (role === 'grandchild') {
        // Finde den Parent des Enkels (ein Kind des fokussierten Nodes)
        const childParent = focused.node.children?.find(c =>
          c.children?.some(gc => gc.id === node.id)
        );
        if (childParent) {
          this.focusedNode.set({ node, parent: childParent, root, level: numLevel });
          const expanded = new Set(this.expandedNodes());
          expanded.add(node.id);
          this.expandedNodes.set(expanded);
        }
        return;
      }
    }

    // Normal-Modus (kein Fokus aktiv)
    if (numLevel === 1) {
      // Level 1: Toggle expand
      const currentSet = new Set(this.expandedNodes());
      if (currentSet.has(node.id)) {
        this.collapseNodeAndChildren(node, currentSet);
      } else {
        this.expandNodeAndChildren(node, currentSet);
      }
      this.expandedNodes.set(currentSet);
    } else if (numLevel >= 2 && parent) {
      // Fokus-Modus aktivieren
      this.focusedNode.set({ node, parent, root, level: numLevel });

      const expanded = new Set(this.expandedNodes());
      expanded.add(node.id);
      expanded.add(root.id);
      this.expandedNodes.set(expanded);
    }
  }

  // Hilfsmethode: Findet den Parent eines Nodes
  private findParentOfNode(root: Node, targetNode: Node): Node | null {
    if (root.children?.some(c => c.id === targetNode.id)) {
      return root;
    }
    if (root.children) {
      for (const child of root.children) {
        const found = this.findParentOfNode(child, targetNode);
        if (found) return found;
      }
    }
    return null;
  }

  private expandNodeAndChildren(node: Node, set: Set<string>) {
    set.add(node.id);
    if (node.children) {
      for (const child of node.children) {
        set.add(child.id);
      }
    }
  }

  private collapseNodeAndChildren(node: Node, set: Set<string>) {
    set.delete(node.id);
    if (node.children) {
      for (const child of node.children) {
        this.collapseNodeAndChildren(child, set);
      }
    }
  }

  private freezeCurrentState() {
    const activeCat = this.activeCategory();
    if (!activeCat) return;

    const newSet = new Set(this.expandedNodes());

    const freezeNode = (node: Node) => {
      if (this.hasCategoryMatch(node, activeCat)) {
        newSet.add(node.id);
        if (node.children) {
          for (const child of node.children) {
            freezeNode(child);
          }
        }
      }
    };

    for (const mainNode of this.mainNodes()) {
      freezeNode(mainNode);
    }

    this.expandedNodes.set(newSet);
  }

  handleBackgroundClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('mindmap-container')) {
      // Optional behavior
    }
  }

  resetView() {
    this.expandedNodes.set(new Set());
    this.activeCategory.set(null);
    this.focusedNode.set(null);
    this.panOffset.set({ x: 0, y: 0 });
    this.zoomLevel.set(1);
  }

  // --- Pan Event Handlers ---

  onPanStart(event: MouseEvent) {
    if (event.button !== 0) return;

    this.isPanning.set(true);
    this.panStart = {
      x: event.clientX - this.panOffset().x,
      y: event.clientY - this.panOffset().y
    };
  }

  onPanMove(event: MouseEvent) {
    if (!this.isPanning()) return;

    this.panOffset.set({
      x: event.clientX - this.panStart.x,
      y: event.clientY - this.panStart.y
    });
  }

  onPanEnd() {
    this.isPanning.set(false);
  }

  // --- Zoom Handlers ---

  zoomIn() {
    const newZoom = Math.min(this.zoomLevel() + this.ZOOM_STEP, this.ZOOM_MAX);
    this.zoomLevel.set(Math.round(newZoom * 100) / 100);
  }

  zoomOut() {
    const newZoom = Math.max(this.zoomLevel() - this.ZOOM_STEP, this.ZOOM_MIN);
    this.zoomLevel.set(Math.round(newZoom * 100) / 100);
  }

  resetZoom() {
    this.zoomLevel.set(1);
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  // --- Focus Mode Helpers ---

  isInFocusMode(): boolean {
    return this.focusedNode() !== null;
  }

  isFocusedNode(node: Node): boolean {
    const focused = this.focusedNode();
    return focused !== null && focused.node.id === node.id;
  }

  isFocusedParent(node: Node): boolean {
    const focused = this.focusedNode();
    return focused !== null && focused.parent.id === node.id;
  }

  isInFocusedBranch(node: Node): boolean {
    const focused = this.focusedNode();
    if (!focused) return false;
    if (!node.children) return false;
    return node.children.some(child =>
      child.id === focused.node.id ||
      child.id === focused.parent.id ||
      this.isInFocusedBranch(child)
    );
  }

  isRootVisibleInFocusMode(root: Node): boolean {
    const focused = this.focusedNode();
    if (!focused) return true;
    return focused.root.id === root.id;
  }

  // Findet den Pfad vom Root zum Ziel-Node (gibt Array von Node-IDs zurück)
  private findPathToNode(root: Node, targetId: string, path: string[] = []): string[] | null {
    const currentPath = [...path, root.id];

    if (root.id === targetId) {
      return currentPath;
    }

    if (root.children) {
      for (const child of root.children) {
        const result = this.findPathToNode(child, targetId, currentPath);
        if (result) return result;
      }
    }

    return null;
  }

  // Bestimmt die Rolle eines Nodes im Zoom-Modus
  // Gibt zurück: 'focused', 'child', 'grandchild', oder 'ancestor-N' (N = Distanz zum Fokus)
  getZoomRole(node: Node): string | null {
    const focused = this.focusedNode();
    if (!focused) return null;

    // Der fokussierte Node selbst
    if (node.id === focused.node.id) return 'focused';

    // Direktes Kind des fokussierten Nodes
    if (focused.node.children?.some(c => c.id === node.id)) return 'child';

    // Enkel (Kind eines Kindes des fokussierten Nodes)
    if (focused.node.children?.some(c => c.children?.some(gc => gc.id === node.id))) return 'grandchild';

    // Prüfe ob Node ein Ahne ist (im Pfad vom Root zum Fokus)
    const pathToFocused = this.findPathToNode(focused.root, focused.node.id);
    if (pathToFocused) {
      const nodeIndex = pathToFocused.indexOf(node.id);
      if (nodeIndex !== -1) {
        // Distanz = wie viele Schritte vom Fokus entfernt (rückwärts gezählt)
        const focusIndex = pathToFocused.length - 1;
        const distance = focusIndex - nodeIndex;
        return `ancestor-${distance}`;
      }
    }

    return null; // Nicht sichtbar im Zoom-Modus
  }

  // Prüft ob Node im Zoom-Modus sichtbar sein soll
  isVisibleInZoom(node: Node): boolean {
    return this.getZoomRole(node) !== null;
  }

  // --- Node Visibility & Hide Logic ---

  shouldHideNode(
    node: Node,
    level: number | string,
    parentIsParent: boolean,
    parentInBranch: boolean,
    isThisFocused: boolean,
    isThisParent: boolean,
    isThisInBranch: boolean
  ): boolean {
    const numLevel = Number(level);

    // Im Zoom-Modus: Nur Parent, Fokus, Kinder, Enkel sichtbar
    if (this.isInFocusMode()) {
      return !this.isVisibleInZoom(node);
    }

    // Normal-Modus: Level 1 wird separat behandelt
    if (numLevel === 1) return false;

    // Wenn Parent der fokussierte Parent ist oder in der Branch liegt,
    // verstecke alle Nodes die nicht fokussiert, Parent oder in der Branch sind
    if (parentIsParent || parentInBranch) {
      return !isThisFocused && !isThisParent && !isThisInBranch;
    }

    return false;
  }

  // --- Node Position Logic ---

  getNodePosition(
    node: Node,
    level: number | string,
    parentNode: Node | null,
    parentAngle: number,
    inFocusMode: boolean
  ): { x: number; y: number; angle: number } {
    const numLevel = Number(level);

    // Level 1: Feste Positionen
    if (numLevel === 1) {
      return this.getLevel1Position(node);
    }

    // Level 2: Position relativ zum Level 1
    if (numLevel === 2 && parentNode) {
      const siblings = parentNode.children || [];
      const index = siblings.findIndex(n => n.id === node.id);
      return this.getLevel2Position(index, siblings.length);
    }

    // Level 3+: Position relativ zum Parent
    if (parentNode) {
      const siblings = parentNode.children || [];
      const index = siblings.findIndex(n => n.id === node.id);
      return this.getChildPosition(index, siblings.length, parentAngle, inFocusMode);
    }

    return { x: 0, y: 0, angle: 0 };
  }

  private getLevel1Position(node: Node): { x: number; y: number; angle: number } {
    const positions: Record<string, { x: number; y: number; angle: number }> = {
      'unternehmer_privat': { x: 0, y: -280, angle: -90 },
      'muster_gmbh': { x: 0, y: 280, angle: 90 },
      'lieferanten': { x: -480, y: 0, angle: 180 },
      'kunden': { x: 480, y: 0, angle: 0 }
    };
    return positions[node.id] || { x: 0, y: 0, angle: 0 };
  }

  private getLevel2Position(index: number, total: number): { x: number; y: number; angle: number } {
    const radius = 160;
    const step = total > 0 ? 360 / total : 0;
    const angle = (index * step) - 90;

    const rad = angle * (Math.PI / 180);
    return {
      x: Math.round(radius * Math.cos(rad)),
      y: Math.round(radius * Math.sin(rad)),
      angle
    };
  }

  getChildPosition(index: number, total: number, parentAngle: number, inFocusMode: boolean): { x: number; y: number; angle: number } {
    const radius = 110;

    // Normaler Modus: Fächerform um parentAngle
    const sector = 120;
    const startAngle = parentAngle - (sector / 2);

    let effectiveAngle = parentAngle;
    if (total > 1) {
      const step = sector / (total - 1);
      effectiveAngle = startAngle + (index * step);
    }

    const rad = effectiveAngle * (Math.PI / 180);
    return {
      x: Math.round(radius * Math.cos(rad)),
      y: Math.round(radius * Math.sin(rad)),
      angle: effectiveAngle
    };
  }

  // Berechnet die RELATIVE Position eines Kindes zum Parent im Zoom-Modus
  getZoomChildRelativePosition(parentNode: Node, childNode: Node): { x: number; y: number } | null {
    if (!this.isInFocusMode()) return null;

    const parentZoomPos = this.getZoomModePosition(parentNode);
    const childZoomPos = this.getZoomModePosition(childNode);

    if (!parentZoomPos || !childZoomPos) return null;

    return {
      x: childZoomPos.x - parentZoomPos.x,
      y: childZoomPos.y - parentZoomPos.y
    };
  }

  // Bestimmt ob Verbindungen zu Kindern im Zoom-Modus gezeichnet werden sollen
  shouldDrawChildConnections(node: Node): boolean {
    if (!this.isInFocusMode()) return true; // Normal-Modus: immer zeichnen

    const role = this.getZoomRole(node);
    // Im Zoom-Modus: Nur vom fokussierten Node und von Kindern zeichnen
    return role === 'focused' || role === 'child';
  }

  // Gibt die Position für die Ahnen-Verbindungslinie zurück (zum nächsten Ahnen/Fokus)
  getAncestorConnectionTarget(node: Node): { x: number; y: number } | null {
    if (!this.isInFocusMode()) return null;

    const role = this.getZoomRole(node);
    if (!role || !role.startsWith('ancestor-')) return null;

    const focused = this.focusedNode();
    if (!focused) return null;

    // Finde den Pfad zum fokussierten Node
    const pathToFocused = this.findPathToNode(focused.root, focused.node.id);
    if (!pathToFocused) return null;

    const nodeIndex = pathToFocused.indexOf(node.id);
    if (nodeIndex === -1 || nodeIndex >= pathToFocused.length - 1) return null;

    // Der nächste Node im Pfad ist das Ziel
    const nextNodeId = pathToFocused[nodeIndex + 1];

    // Finde den nächsten Node und berechne die relative Position
    const nodePos = this.getZoomModePosition(node);
    if (!nodePos) return null;

    // Berechne die Zielposition basierend auf dem nächsten Node
    const distance = parseInt(role.split('-')[1], 10);
    const ANCESTOR_SPACING = 180;

    // Nächster Node ist einen Schritt näher am Fokus
    return { x: ANCESTOR_SPACING, y: 0 };
  }

  // --- Zoom Mode Position Logic ---

  // Berechnet die Position eines Nodes im Zoom-Modus
  getZoomModePosition(node: Node): { x: number; y: number } | null {
    const role = this.getZoomRole(node);
    if (!role) return null;

    const focused = this.focusedNode();
    if (!focused) return null;

    // Abstände für horizontale Anordnung
    const ANCESTOR_SPACING = 180; // Abstand zwischen Ahnen
    const CHILD_SPACING = 140;    // Abstand zu Kindern

    if (role === 'focused') {
      return { x: 0, y: 0 };
    }

    // Ahnen: Links vom Fokus, horizontal aufgereiht
    if (role.startsWith('ancestor-')) {
      const distance = parseInt(role.split('-')[1], 10);
      return { x: -distance * ANCESTOR_SPACING, y: 0 };
    }

    // Kinder: Rechts vom Fokus, gefächert
    if (role === 'child') {
      const children = focused.node.children || [];
      const index = children.findIndex(c => c.id === node.id);
      const total = children.length;

      if (total === 1) {
        return { x: CHILD_SPACING, y: 0 };
      }

      const sector = 90;
      const startAngle = -sector / 2;
      const step = sector / (total - 1);
      const angle = startAngle + (index * step);
      const rad = angle * (Math.PI / 180);

      return {
        x: Math.round(CHILD_SPACING * Math.cos(rad)),
        y: Math.round(CHILD_SPACING * Math.sin(rad))
      };
    }

    // Enkel: Rechts von ihrem Parent (Kind), gefächert
    if (role === 'grandchild') {
      // Finde das Eltern-Kind und dessen Position
      const children = focused.node.children || [];
      for (const child of children) {
        const grandchildren = child.children || [];
        const gcIndex = grandchildren.findIndex(gc => gc.id === node.id);
        if (gcIndex !== -1) {
          // Position des Kindes berechnen
          const childIndex = children.findIndex(c => c.id === child.id);
          const childTotal = children.length;

          let childAngle = 0;
          if (childTotal > 1) {
            const sector = 90;
            const startAngle = -sector / 2;
            const step = sector / (childTotal - 1);
            childAngle = startAngle + (childIndex * step);
          }

          const childRad = childAngle * (Math.PI / 180);
          const childX = Math.round(CHILD_SPACING * Math.cos(childRad));
          const childY = Math.round(CHILD_SPACING * Math.sin(childRad));

          // Enkel relativ zum Kind positionieren
          const gcTotal = grandchildren.length;
          let gcAngle = childAngle;
          if (gcTotal > 1) {
            const sector = 60;
            const startAngle = childAngle - sector / 2;
            const step = sector / (gcTotal - 1);
            gcAngle = startAngle + (gcIndex * step);
          }

          const gcRad = gcAngle * (Math.PI / 180);
          const gcRadius = 100;

          return {
            x: childX + Math.round(gcRadius * Math.cos(gcRad)),
            y: childY + Math.round(gcRadius * Math.sin(gcRad))
          };
        }
      }
    }

    return null;
  }

  // --- Node Transform Logic ---

  getNodeTransformForLevel(
    node: Node,
    level: number | string,
    pos: { x: number; y: number; angle: number },
    isFocused: boolean,
    isParentOfFocused: boolean,
    parentIsMoved: boolean,
    parentNode: Node | null
  ): string {
    const numLevel = Number(level);

    // Im Zoom-Modus: RELATIVE Position zum Parent berechnen
    if (this.isInFocusMode()) {
      const nodeAbsPos = this.getZoomModePosition(node);

      if (nodeAbsPos) {
        // Wenn kein Parent oder Level 1, ist die absolute Position korrekt
        if (!parentNode || numLevel === 1) {
          return `translate(${nodeAbsPos.x}px, ${nodeAbsPos.y}px)`;
        }

        // Ansonsten: Relative Position = Eigene Position - Parent Position
        const parentAbsPos = this.getZoomModePosition(parentNode);
        if (parentAbsPos) {
          const relX = nodeAbsPos.x - parentAbsPos.x;
          const relY = nodeAbsPos.y - parentAbsPos.y;
          return `translate(${relX}px, ${relY}px)`;
        }

        return `translate(${nodeAbsPos.x}px, ${nodeAbsPos.y}px)`;
      }
    }

    // Normal-Modus: Standard-Positionen
    return `translate(${pos.x}px, ${pos.y}px)`;
  }

  // --- Node Class Helpers ---

  getNodeWrapperClass(level: number | string): string {
    const numLevel = Number(level);
    return `node-wrapper node-wrapper--level-${numLevel}`;
  }

  getNodeLevelClass(level: number | string): string {
    const numLevel = Number(level);
    return `node--level-${numLevel}`;
  }

  getNodeClass(node: Node, level: number | string): string {
    const numLevel = Number(level);
    return `node node--level-${numLevel}`;
  }

  // --- Node Expansion Logic ---

  isNodeExpandedAtLevel(node: Node, level: number | string): boolean {
    const manuallyOpen = this.expandedNodes().has(node.id);
    const activeCat = this.activeCategory();

    if (activeCat) {
      return manuallyOpen || this.hasCategoryMatch(node, activeCat);
    }
    return manuallyOpen;
  }

  // --- Recursive Helpers ---

  hasCategoryMatch(node: Node, catId: CategoryId): boolean {
    if (node.categoryIds.includes(catId)) return true;
    if (node.children) {
      return node.children.some(child => this.hasCategoryMatch(child, catId));
    }
    return false;
  }

  isNodeDimmed(node: Node, level: number | string, parentId: string | null): boolean {
    const numLevel = Number(level);
    const activeCat = this.activeCategory();

    if (activeCat) {
      if (numLevel === 1) return false;

      const isMatch = node.categoryIds.includes(activeCat);
      const isPath = this.hasCategoryMatch(node, activeCat);
      if (isMatch || isPath) return false;
      return true;
    }

    return false;
  }

  // Bestimmt ob ein Node geblurrt werden soll
  shouldBlurNode(node: Node, level: number | string): boolean {
    const numLevel = Number(level);
    const activeCat = this.activeCategory();

    // Mit aktivem Filter: Blur alle die NICHT zum Filter passen
    if (activeCat) {
      if (numLevel === 1) return false;
      const isMatch = node.categoryIds.includes(activeCat);
      const isPath = this.hasCategoryMatch(node, activeCat);
      return !isMatch && !isPath; // Blur wenn kein Match
    }

    // Ohne Filter im Zoom-Modus: Nur Enkel blurren
    if (this.isInFocusMode()) {
      const role = this.getZoomRole(node);
      return role === 'grandchild';
    }

    // Ohne Filter und ohne Zoom: Kein Blur
    return false;
  }

  // --- Tooltip Event Handler ---

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
