import { Component, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, Node, CategoryId, Category } from './services/data.service';
import { I18nService } from './services/i18n.service';
import { ForceLayoutService } from './services/force-layout.service';
import { FinanzhausComponent } from './components/finanzhaus.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FinanzhausComponent],
  templateUrl: './app.component.html'
})
export class AppComponent {
  private dataService = inject(DataService);
  private forceLayout = inject(ForceLayoutService);
  i18n = inject(I18nService);

  // Data - computed to react to language changes
  rootNode = computed(() => this.dataService.getRootNode());
  mainNodes = computed(() => this.rootNode().children || []);
  categories = computed(() => this.dataService.getCategories());

  // Force layout positions
  forcePositions = this.forceLayout.nodePositions;
  isSimulating = this.forceLayout.isSettling;

  // State - Multi-Select Filter
  activeCategories = signal<Set<CategoryId>>(new Set());
  hoveredNode = signal<Node | null>(null);  // Für Tooltip
  hoveredPathNode = signal<Node | null>(null);  // Für Pfad-Highlighting und Unblur
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
  isAnimatingPan = signal<boolean>(false);
  private readonly ZOOM_MIN = 0.4;
  private readonly ZOOM_MAX = 2;
  private readonly ZOOM_STEP = 0.15;

  // Node Drag State (für Level 2+)
  draggingNode = signal<Node | null>(null);
  isActivelyDragging = signal<boolean>(false); // true erst nach 5px Bewegung
  private dragStartPos = { x: 0, y: 0 };
  private dragNodeStartPos = { x: 0, y: 0 };
  private dragMoved = false;
  private readonly DRAG_THRESHOLD = 5; // Pixel bevor Drag startet
  private dragContext: { level: number; parent: Node | null; root: Node } | null = null;

  // Expanded Nodes Set (für alle Level)
  expandedNodes = signal<Set<string>>(new Set());

  // Nodes die gerade am Einklappen sind (für Animation)
  collapsingNodes = signal<Set<string>>(new Set());

  // Gespeicherter Zustand vor dem Filtern
  private savedExpandedNodes: Set<string> | null = null;

  // Effect: Initialize and update force layout
  private forceLayoutEffect = effect(() => {
    const root = this.rootNode();
    const expanded = this.expandedNodes();
    this.forceLayout.updateNodes(root, expanded);
  });


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

  // Level 0 and Level 1 Icon Paths (spezielle Icons für Root-Nodes)
  private level1IconPaths: Record<string, string> = {
    'network': 'M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z',
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
    // Level 0 and Level 1 use special icons
    if ((numLevel === 0 || numLevel === 1) && node.icon) {
      return this.level1IconPaths[node.icon] || this.level1IconPaths['network'];
    }
    return this.getIconPath(this.getPrimaryCategory(node));
  }

  hasCategory(node: Node, catId: CategoryId): boolean {
    return node.categoryIds.includes(catId);
  }

  // --- Actions ---

  toggleCategory(catId: CategoryId) {
    const current = new Set(this.activeCategories());
    const inFocusMode = this.isInFocusMode();

    if (current.has(catId)) {
      // Kategorie entfernen
      current.delete(catId);
      this.activeCategories.set(current);

      if (current.size === 0 && !inFocusMode) {
        // Keine Filter mehr aktiv und kein Fokus → gespeicherten Zustand wiederherstellen
        if (this.savedExpandedNodes !== null) {
          this.expandedNodes.set(new Set(this.savedExpandedNodes));
          this.savedExpandedNodes = null;
        }
        this.panOffset.set({ x: 0, y: 0 });
      } else if (!inFocusMode) {
        // Noch andere Filter aktiv (kein Fokus) → auf diese zentrieren
        setTimeout(() => this.centerOnFilteredNodes(), 100);
      }
      // Im Fokus-Modus: Nur Filter ändern, nichts expandieren/zentrieren
    } else {
      // Kategorie hinzufügen
      current.add(catId);
      this.activeCategories.set(current);

      if (inFocusMode) {
        // Im Fokus-Modus: Nur Filter setzen, auf gefilterte Fokus-Nodes zentrieren
        setTimeout(() => this.centerOnFilteredFocusNodes(), 100);
      } else {
        // Erster Filter? Zustand speichern
        if (current.size === 1) {
          this.savedExpandedNodes = new Set(this.expandedNodes());
        }

        // Alle Level 1 Nodes expandieren die passende Kinder haben
        const expanded = new Set(this.expandedNodes());
        for (const level1Node of this.mainNodes()) {
          if (this.hasAnyCategoryMatch(level1Node, current)) {
            this.expandNodeAndChildren(level1Node, expanded);
          }
        }
        this.expandedNodes.set(expanded);

        // View auf passende Nodes zentrieren
        setTimeout(() => this.centerOnFilteredNodes(), 100);
      }
    }
  }

  // Zentriert die View auf gefilterte Nodes im Fokus-Pfad
  private centerOnFilteredFocusNodes(): void {
    const positions = this.forcePositions();
    const categories = this.activeCategories();
    const focused = this.focusedNode();
    if (positions.size === 0 || categories.size === 0 || !focused) return;

    // Sammle alle passenden Node-Positionen im Fokus-Pfad
    const matchingPositions: { x: number; y: number }[] = [];

    // Fokussierter Node ist immer dabei
    const focusedPos = positions.get(focused.node.id);
    if (focusedPos) {
      matchingPositions.push(focusedPos);
    }

    // Prüfe Nachkommen des fokussierten Nodes
    const collectMatchingDescendants = (node: Node) => {
      const pos = positions.get(node.id);
      if (!pos) return;

      const hasCategory = node.categoryIds.some(id => categories.has(id));
      if (hasCategory) {
        matchingPositions.push(pos);
      }

      if (node.children) {
        for (const child of node.children) {
          collectMatchingDescendants(child);
        }
      }
    };

    if (focused.node.children) {
      for (const child of focused.node.children) {
        collectMatchingDescendants(child);
      }
    }

    if (matchingPositions.length === 0) return;

    // Bounding Box berechnen
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pos of matchingPositions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    // Mittelpunkt berechnen
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // View mit Animation zentrieren
    this.animatePanTo(-centerX, -centerY);
  }

  // Zentriert die View auf alle Nodes die zum Filter passen
  private centerOnFilteredNodes(): void {
    const positions = this.forcePositions();
    const categories = this.activeCategories();
    if (positions.size === 0 || categories.size === 0) return;

    // Alle passenden Node-Positionen sammeln
    const matchingPositions: { x: number; y: number }[] = [];

    const collectMatching = (node: Node) => {
      const pos = positions.get(node.id);
      if (!pos) return;

      // Node passt wenn er eine der Kategorien hat oder passende Kinder
      const isMatch = node.categoryIds.some(id => categories.has(id));
      const hasMatchingChildren = this.hasAnyCategoryMatch(node, categories);

      if (isMatch || hasMatchingChildren) {
        matchingPositions.push(pos);
      }

      // Rekursiv durch Kinder
      if (node.children) {
        for (const child of node.children) {
          collectMatching(child);
        }
      }
    };

    // Von Root starten
    collectMatching(this.rootNode());

    if (matchingPositions.length === 0) return;

    // Bounding Box berechnen
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pos of matchingPositions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    // Mittelpunkt berechnen
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // View mit Animation zentrieren
    this.animatePanTo(-centerX, -centerY);
  }

  // Animiert das Pannen zu einer Position
  private animatePanTo(x: number, y: number): void {
    this.isAnimatingPan.set(true);
    this.panOffset.set({ x, y });

    // Animation dauert 400ms (entspricht CSS transition)
    setTimeout(() => {
      this.isAnimatingPan.set(false);
    }, 400);
  }

  handleNodeClick(node: Node, level: number | string, parent: Node | null, root: Node) {
    const numLevel = Number(level);

    const focused = this.focusedNode();

    // Im Fokus-Modus
    if (focused) {
      const role = this.getZoomRole(node);

      // Klick auf Level 0 oder Level 1 → Fokus verlassen
      if (numLevel <= 1) {
        this.exitFocusMode();
        return;
      }

      // Klick auf den fokussierten Node selbst → Fokus verlassen (ohne zu springen)
      if (role === 'focused') {
        this.exitFocusMode();
        return;
      }

      // Klick auf einen scharfen Node (Vorfahre oder Nachkomme) → neuer Fokus
      if (role === 'ancestor' || role === 'descendant') {
        const newParent = this.findParentOfNode(this.rootNode(), node);
        if (newParent) {
          this.focusedNode.set({ node, parent: newParent, root, level: numLevel });

          // Nodes expandieren damit Kinder sichtbar sind
          const expanded = new Set(this.expandedNodes());
          expanded.add(node.id);
          this.expandedNodes.set(expanded);
        }
        return;
      }

      // Klick auf geblurrten Node → Fokus auf diesen Node setzen
      if (numLevel >= 2) {
        const newParent = this.findParentOfNode(this.rootNode(), node);
        if (newParent) {
          this.focusedNode.set({ node, parent: newParent, root, level: numLevel });

          const expanded = new Set(this.expandedNodes());
          expanded.add(node.id);
          this.expandedNodes.set(expanded);
        }
      }
      return;
    }

    // Normal-Modus (kein Fokus aktiv)
    if (numLevel === 0) {
      // Level 0: Kompletter Reset - alles einklappen + Filter löschen
      if (this.expandedNodes().size > 0) {
        this.collapseAllWithAnimation();
      } else {
        // Bereits alles eingeklappt → Wobble-Animation
        this.forceLayout.wobble();
      }
      // Filter zurücksetzen
      this.activeCategories.set(new Set());
      this.panOffset.set({ x: 0, y: 0 });
      return;
    }

    if (numLevel === 1) {
      // Level 1: Toggle expand
      if (this.expandedNodes().has(node.id)) {
        // Mit Animation schließen
        this.collapseNodeWithAnimation(node);
        // Filter zurücksetzen um inkonsistente Zustände zu vermeiden
        if (this.activeCategories().size > 0) {
          this.activeCategories.set(new Set());
        }
      } else {
        const currentSet = new Set(this.expandedNodes());
        this.expandNodeAndChildren(node, currentSet);
        this.expandedNodes.set(currentSet);
      }
    } else if (numLevel >= 2 && parent) {
      // Fokus-Modus aktivieren - Expanded-State bleibt wie vom Nutzer gewählt
      this.focusedNode.set({ node, parent, root, level: numLevel });

      // Nur den fokussierten Node selbst expandieren (für seine Kinder)
      const expanded = new Set(this.expandedNodes());
      expanded.add(node.id);
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

  // Sammelt einen Node und alle seine Kinder rekursiv
  private collectNodeAndChildren(node: Node, set: Set<string>) {
    set.add(node.id);
    if (node.children) {
      for (const child of node.children) {
        this.collectNodeAndChildren(child, set);
      }
    }
  }

  // Schließt einen Node mit Animation
  private collapseNodeWithAnimation(node: Node) {
    // Sammle alle Nodes die geschlossen werden sollen
    const nodesToCollapse = new Set<string>();
    this.collectNodeAndChildren(node, nodesToCollapse);

    // Markiere sie als "collapsing" für die Animation
    const currentCollapsing = new Set(this.collapsingNodes());
    for (const id of nodesToCollapse) {
      currentCollapsing.add(id);
    }
    this.collapsingNodes.set(currentCollapsing);

    // Nach Animation tatsächlich entfernen
    setTimeout(() => {
      const currentExpanded = new Set(this.expandedNodes());
      for (const id of nodesToCollapse) {
        currentExpanded.delete(id);
      }
      this.expandedNodes.set(currentExpanded);

      // Collapsing nodes bereinigen
      const stillCollapsing = new Set(this.collapsingNodes());
      for (const id of nodesToCollapse) {
        stillCollapsing.delete(id);
      }
      this.collapsingNodes.set(stillCollapsing);
    }, 350);
  }

  // Alle Nodes mit Animation einklappen
  private collapseAllWithAnimation() {
    // Alle expandierten Nodes markieren als "collapsing"
    const currentExpanded = new Set(this.expandedNodes());
    this.collapsingNodes.set(currentExpanded);

    // Nach Animation (350ms) tatsächlich entfernen
    setTimeout(() => {
      this.expandedNodes.set(new Set());
      this.collapsingNodes.set(new Set());
    }, 350);
  }

  private freezeCurrentState() {
    const activeCategories = this.activeCategories();
    if (activeCategories.size === 0) return;

    const newSet = new Set(this.expandedNodes());

    const freezeNode = (node: Node) => {
      if (this.hasAnyCategoryMatch(node, activeCategories)) {
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

  clearAllFilters() {
    // Gespeicherten Zustand wiederherstellen
    if (this.savedExpandedNodes !== null) {
      this.expandedNodes.set(new Set(this.savedExpandedNodes));
      this.savedExpandedNodes = null;
    }
    this.activeCategories.set(new Set());
    this.panOffset.set({ x: 0, y: 0 });
  }

  resetView() {
    this.expandedNodes.set(new Set());
    this.activeCategories.set(new Set());
    this.focusedNode.set(null);
    this.panOffset.set({ x: 0, y: 0 });
    this.zoomLevel.set(1);
    // Auch alle vom Benutzer verschobenen Positionen zurücksetzen
    this.forceLayout.resetUserPositions();
  }

  // --- Pan Event Handlers (Mouse) ---

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

  // --- Touch Event Handlers (iPad/Tablet) ---

  onTouchStart(event: TouchEvent) {
    if (event.touches.length !== 1) return;

    const touch = event.touches[0];
    this.isPanning.set(true);
    this.panStart = {
      x: touch.clientX - this.panOffset().x,
      y: touch.clientY - this.panOffset().y
    };
  }

  onTouchMove(event: TouchEvent) {
    if (!this.isPanning() || event.touches.length !== 1) return;

    event.preventDefault(); // Verhindert Scrollen der Seite
    const touch = event.touches[0];
    this.panOffset.set({
      x: touch.clientX - this.panStart.x,
      y: touch.clientY - this.panStart.y
    });
  }

  onTouchEnd() {
    this.isPanning.set(false);
  }

  // --- Node Drag Handlers (Level 2+) ---

  onNodeDragStart(event: MouseEvent, node: Node, level: number, parent: Node | null, root: Node) {
    // Nur Level 1+ können gezogen werden (L0 ist fixiert)
    if (level < 1) return;
    if (event.button !== 0) return; // Nur linke Maustaste

    event.stopPropagation(); // Verhindert Pan
    event.preventDefault();

    const nodePos = this.forceLayout.getPosition(node.id);
    if (!nodePos) return;

    this.dragStartPos = { x: event.clientX, y: event.clientY };
    this.dragNodeStartPos = { x: nodePos.x, y: nodePos.y };
    this.dragMoved = false;
    this.draggingNode.set(node);
    this.dragContext = { level, parent, root };

    // Fixiere den Node während des Drags
    this.forceLayout.fixNode(node.id);
  }

  // Kombinierter Handler für Pan und Drag Move
  onGlobalMouseMove(event: MouseEvent) {
    // Zuerst Drag prüfen
    const dragNode = this.draggingNode();
    if (dragNode) {
      const dx = event.clientX - this.dragStartPos.x;
      const dy = event.clientY - this.dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Prüfe ob Threshold überschritten
      if (!this.dragMoved && distance >= this.DRAG_THRESHOLD) {
        this.dragMoved = true;
        this.isActivelyDragging.set(true); // Jetzt erst visuell draggen
      }

      if (this.dragMoved) {
        // Berechne neue Position (berücksichtige Zoom)
        const zoom = this.zoomLevel();
        const newX = this.dragNodeStartPos.x + dx / zoom;
        const newY = this.dragNodeStartPos.y + dy / zoom;

        this.forceLayout.setNodePosition(dragNode.id, newX, newY);
      }
      return; // Kein Pan während Drag
    }

    // Sonst Pan
    if (!this.isPanning()) return;

    this.panOffset.set({
      x: event.clientX - this.panStart.x,
      y: event.clientY - this.panStart.y
    });
  }

  // Kombinierter Handler für Pan und Drag End
  onGlobalMouseUp(event: MouseEvent) {
    // Zuerst Drag prüfen
    const draggedNode = this.draggingNode();
    if (draggedNode && this.dragContext) {
      if (this.dragMoved) {
        // Drag wurde durchgeführt - Node an neuer Position speichern, Simulation starten
        this.forceLayout.releaseNode(draggedNode.id);
      } else {
        // Kein Drag - war ein Klick → nur Fixierung lösen (keine Änderungen!)
        this.forceLayout.unfixNode(draggedNode.id);
        this.handleNodeClick(draggedNode, this.dragContext.level, this.dragContext.parent, this.dragContext.root);
      }

      this.draggingNode.set(null);
      this.isActivelyDragging.set(false);
      this.dragMoved = false;
      this.dragContext = null;
      return;
    }

    // Sonst Pan beenden
    this.isPanning.set(false);
  }

  // Handler für MouseLeave - beendet Drag oder Pan
  onGlobalMouseLeave() {
    // Drag abbrechen - nur Fixierung lösen, nichts speichern
    const node = this.draggingNode();
    if (node) {
      this.forceLayout.unfixNode(node.id);
      this.draggingNode.set(null);
      this.isActivelyDragging.set(false);
      this.dragMoved = false;
      this.dragContext = null;
    }

    // Pan beenden
    this.isPanning.set(false);
  }

  isDragging(): boolean {
    return this.draggingNode() !== null;
  }

  isNodeDragging(node: Node): boolean {
    if (!this.isActivelyDragging()) return false;
    const dragging = this.draggingNode();
    return dragging !== null && dragging.id === node.id;
  }

  canDragNode(level: number): boolean {
    return level >= 1; // L0 ist fixiert, L1+ sind verschiebbar
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

  // Verlässt den Fokus-Modus und expandiert bei aktivem Filter die passenden Nodes
  private exitFocusMode(): void {
    this.focusedNode.set(null);

    // Wenn Filter aktiv: Passende Nodes expandieren
    const activeCategories = this.activeCategories();
    if (activeCategories.size > 0) {
      const expanded = new Set(this.expandedNodes());
      for (const level1Node of this.mainNodes()) {
        if (this.hasAnyCategoryMatch(level1Node, activeCategories)) {
          this.expandNodeAndChildren(level1Node, expanded);
        }
      }
      this.expandedNodes.set(expanded);

      // View auf passende Nodes zentrieren
      setTimeout(() => this.centerOnFilteredNodes(), 100);
    }
  }

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
    return true;
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

  // Prüft ob ein Node ein Vorfahre des fokussierten Nodes ist
  private isAncestorOfFocused(node: Node): boolean {
    const focused = this.focusedNode();
    if (!focused) return false;

    // Finde den Pfad vom Level-0 Root zum fokussierten Node
    const root = this.rootNode();
    const pathToFocused = this.findPathToNode(root, focused.node.id);
    if (!pathToFocused) return false;

    return pathToFocused.includes(node.id) && node.id !== focused.node.id;
  }

  // Prüft ob ein Node ein Nachkomme des fokussierten Nodes ist (Kinder, Enkel, Urenkel, etc.)
  private isDescendantOfFocused(node: Node): boolean {
    const focused = this.focusedNode();
    if (!focused) return false;

    // Rekursiv prüfen ob node im Unterbaum von focused.node liegt
    const checkDescendant = (parent: Node, targetId: string): boolean => {
      if (!parent.children) return false;
      for (const child of parent.children) {
        if (child.id === targetId) return true;
        if (checkDescendant(child, targetId)) return true;
      }
      return false;
    };

    return checkDescendant(focused.node, node.id);
  }

  // Legacy-Methode für Template-Kompatibilität
  getZoomRole(node: Node): string | null {
    const focused = this.focusedNode();
    if (!focused) return null;

    if (node.id === focused.node.id) return 'focused';
    if (this.isAncestorOfFocused(node)) return 'ancestor';
    if (this.isDescendantOfFocused(node)) return 'descendant';

    return null;
  }

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

    // NEU: Im Fokus-Modus NIEMALS verstecken - stattdessen werden nicht-relevante Nodes geblurrt
    if (this.isInFocusMode()) {
      return false;
    }

    // Normal-Modus: Level 0 und Level 1 werden separat behandelt
    if (numLevel <= 1) return false;

    // Wenn Parent der fokussierte Parent ist oder in der Branch liegt,
    // verstecke alle Nodes die nicht fokussiert, Parent oder in der Branch sind
    if (parentIsParent || parentInBranch) {
      return !isThisFocused && !isThisParent && !isThisInBranch;
    }

    return false;
  }

  // --- Node Position Logic ---

  // Hole Position aus dem Force-Layout (für Template-Bindings)
  getForcePosition(node: Node): { x: number; y: number } {
    return this.forcePositions().get(node.id) || { x: 0, y: 0 };
  }

  getNodePosition(
    node: Node,
    level: number | string,
    parentNode: Node | null,
    parentAngle: number,
    inFocusMode: boolean
  ): { x: number; y: number; angle: number } {
    const numLevel = Number(level);

    // Im normalen Modus (kein Fokus): Force-Positionen verwenden
    if (!this.isInFocusMode()) {
      const forcePos = this.forcePositions().get(node.id);
      if (forcePos) {
        // Berechne Winkel basierend auf Position relativ zum Parent
        let angle = 0;
        if (parentNode) {
          const parentPos = this.forcePositions().get(parentNode.id);
          if (parentPos) {
            angle = Math.atan2(forcePos.y - parentPos.y, forcePos.x - parentPos.x) * (180 / Math.PI);
          }
        }
        return { x: forcePos.x, y: forcePos.y, angle };
      }
    }

    // Level 1: Feste Positionen (Fallback)
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

    // Force-Layout Positionen verwenden (auch im Fokus-Modus - wir pannen nur)
    const nodeForcePos = this.forcePositions().get(node.id);
    if (nodeForcePos) {
      // Level 0 verwendet absolute Position (ist im Zentrum)
      if (numLevel === 0 || !parentNode) {
        return `translate(${nodeForcePos.x}px, ${nodeForcePos.y}px)`;
      }

      // Alle anderen Level: Relative Position zum Parent
      const parentForcePos = this.forcePositions().get(parentNode.id);
      if (parentForcePos) {
        const relX = nodeForcePos.x - parentForcePos.x;
        const relY = nodeForcePos.y - parentForcePos.y;
        return `translate(${relX}px, ${relY}px)`;
      }
    }

    // Fallback: Standard-Positionen
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
    const activeCategories = this.activeCategories();

    // Mit Filter aktiv: Auch Nodes expandieren die zur Kategorie passen
    // ABER: Im Fokus-Modus nur wenn Node auf dem Fokus-Pfad liegt
    if (activeCategories.size > 0) {
      const matchesCategory = this.hasAnyCategoryMatch(node, activeCategories);

      if (this.isInFocusMode()) {
        // Im Fokus-Modus: Kategorie-Match nur für Fokus-Pfad-Nodes
        const isOnFocusPath = this.isFocusedNode(node) ||
                              this.isFocusedParent(node) ||
                              this.isInFocusedBranch(node) ||
                              this.isAncestorOfFocused(node) ||
                              this.isDescendantOfFocused(node);
        // Nur manuell expandierte Nodes ODER Kategorie-Match wenn auf Fokus-Pfad
        return manuallyOpen || (matchesCategory && isOnFocusPath);
      }

      return manuallyOpen || matchesCategory;
    }

    return manuallyOpen;
  }

  // Prüft ob ein Node gerade am Einklappen ist (Level 2+ wenn Parent kollabiert)
  isNodeCollapsing(node: Node): boolean {
    // Prüfe ob irgendeiner der Vorfahren in collapsingNodes ist
    const collapsingSet = this.collapsingNodes();
    if (collapsingSet.size === 0) return false;

    // Finde den Pfad zum Node und prüfe ob ein Vorfahre kollabiert
    const path = this.findPathToNode(this.rootNode(), node.id);
    if (!path) return false;

    // Prüfe ob irgendeiner der Vorfahren (außer dem Node selbst) kollabiert
    for (const ancestorId of path) {
      if (ancestorId !== node.id && collapsingSet.has(ancestorId)) {
        return true;
      }
    }
    return false;
  }

  // --- Recursive Helpers ---

  hasCategoryMatch(node: Node, catId: CategoryId): boolean {
    if (node.categoryIds.includes(catId)) return true;
    if (node.children) {
      return node.children.some(child => this.hasCategoryMatch(child, catId));
    }
    return false;
  }

  // Prüft ob ein Node oder seine Kinder eine der Kategorien haben
  hasAnyCategoryMatch(node: Node, categories: Set<CategoryId>): boolean {
    if (node.categoryIds.some(id => categories.has(id))) return true;
    if (node.children) {
      return node.children.some(child => this.hasAnyCategoryMatch(child, categories));
    }
    return false;
  }

  isNodeDimmed(node: Node, level: number | string, parentId: string | null): boolean {
    const numLevel = Number(level);
    const activeCategories = this.activeCategories();

    if (activeCategories.size > 0) {
      if (numLevel <= 1) return false;

      const isMatch = node.categoryIds.some(id => activeCategories.has(id));
      const isPath = this.hasAnyCategoryMatch(node, activeCategories);
      if (isMatch || isPath) return false;
      return true;
    }

    return false;
  }

  // Bestimmt ob ein Node geblurrt werden soll
  shouldBlurNode(node: Node, level: number | string, parentNode?: Node | null): boolean {
    const numLevel = Number(level);
    const activeCategories = this.activeCategories();

    // Level 0 (Root): Nie blurren
    if (numLevel === 0) return false;

    // Hover-Pfad: Node und alle Vorfahren sind scharf
    if (this.isOnHoveredPath(node)) return false;

    // Direktes Kind des gehoverten Nodes: Auch scharf (Preview der Kinder)
    if (this.isDirectChildOfHovered(node)) return false;

    // Im Fokus-Modus
    if (this.isInFocusMode()) {
      const focused = this.focusedNode();
      if (!focused) return false;

      // Der fokussierte Node selbst ist IMMER scharf (auch ohne passende Kategorie)
      if (node.id === focused.node.id) return false;

      // Prüfe ob Node auf Fokus-Pfad liegt
      const isAncestor = this.isAncestorOfFocused(node);
      const isDescendant = this.isDescendantOfFocused(node);
      const isOnFocusPath = isAncestor || isDescendant;

      // Wenn kein Filter aktiv: Standard Fokus-Verhalten
      if (activeCategories.size === 0) {
        return !isOnFocusPath;
      }

      // Filter + Fokus kombiniert:
      // Nicht auf Fokus-Pfad → immer blur
      if (!isOnFocusPath) return true;

      // Auf Fokus-Pfad: Prüfe Kategorie
      const hasCategory = node.categoryIds.some(id => activeCategories.has(id));
      const hasMatchingChildren = this.hasAnyCategoryMatch(node, activeCategories);

      // Vorfahren: Scharf wenn sie passende Nachkommen haben (Pfad zum Match)
      if (isAncestor) {
        return !hasCategory && !hasMatchingChildren;
      }

      // Nachkommen: Scharf wenn sie selbst passen oder passende Kinder haben
      return !hasCategory && !hasMatchingChildren;
    }

    // Normaler Modus mit Filter (kein Fokus)
    if (activeCategories.size > 0) {
      // Level 1: Blur wenn KEINE Kinder eine der Kategorien haben
      if (numLevel === 1) {
        return !this.hasAnyCategoryMatch(node, activeCategories);
      }
      // Level 2+: Blur wenn Node selbst nicht passt UND keine passenden Kinder hat
      const isMatch = node.categoryIds.some(id => activeCategories.has(id));
      const isPath = this.hasAnyCategoryMatch(node, activeCategories);
      return !isMatch && !isPath;
    }

    // Normal-Modus (kein Filter, kein Fokus):
    // Level 1, 2: Immer scharf
    if (numLevel <= 2) return false;

    // Level 3+: Immer geblurrt (Teaser-Zustand) bis Fokus-Modus aktiviert wird
    return true;
  }

  // --- Hover & Tooltip Event Handler ---

  onNodeMouseEnter(event: MouseEvent, node: Node) {
    // Pfad-Highlighting für Linien und Unblur
    this.hoveredPathNode.set(node);

    if (this.activeCategories().size === 0) {
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
    this.hoveredPathNode.set(null);
    this.hoveredCategories.set([]);
    this.tooltipPosition.set(null);
  }

  // Prüft ob ein Node auf dem Pfad vom gehoverten Node bis Level 0 liegt
  isOnHoveredPath(node: Node): boolean {
    const hovered = this.hoveredPathNode();
    if (!hovered) return false;

    // Der gehoverte Node selbst
    if (node.id === hovered.id) return true;

    // Ist dieser Node ein Vorfahre des gehoverten Nodes?
    const pathToHovered = this.findPathToNode(this.rootNode(), hovered.id);
    if (!pathToHovered) return false;

    return pathToHovered.includes(node.id);
  }

  // Prüft ob ein Node ein direktes Kind des gehoverten Nodes ist (für Preview)
  isDirectChildOfHovered(node: Node): boolean {
    const hovered = this.hoveredPathNode();
    if (!hovered) return false;
    if (!hovered.children) return false;

    return hovered.children.some(child => child.id === node.id);
  }

  // Prüft ob eine Verbindungslinie hervorgehoben werden soll (von Parent zu Child)
  isLineOnHoveredPath(parentNode: Node, childNode: Node): boolean {
    const hovered = this.hoveredPathNode();
    if (!hovered) return false;

    // Finde den Pfad vom Root zum gehoverten Node
    const pathToHovered = this.findPathToNode(this.rootNode(), hovered.id);
    if (!pathToHovered) return false;

    // Prüfe ob sowohl Parent als auch Child auf dem Pfad liegen
    const parentOnPath = pathToHovered.includes(parentNode.id);
    const childOnPath = pathToHovered.includes(childNode.id);

    return parentOnPath && childOnPath;
  }
}
