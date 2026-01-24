import { Component, signal, computed, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DataService, Node, CategoryId, Category, DataMode } from './services/data.service';

// Debug-Panel Größen-Einstellungen
export interface NodeSizeConfig {
  level0NodeSize: number;
  level0TextSize: number;
  level1NodeSize: number;
  level1TextSize: number;
  level2NodeSize: number;
  level2TextSize: number;
  level3NodeSize: number;
  level3TextSize: number;
}

const DEFAULT_NODE_SIZES: NodeSizeConfig = {
  level0NodeSize: 8,
  level0TextSize: 1.5,
  level1NodeSize: 7,
  level1TextSize: 0.875,
  level2NodeSize: 6,
  level2TextSize: 0.75,
  level3NodeSize: 3.5,
  level3TextSize: 0.625,
};

// Default-Positionen für Produkte-Modus (aus externer JSON-Datei)
import produkteDefaultState from './data/product_default.json';
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
  selectedL2NodeIds = signal<Set<string>>(new Set());  // Für spezifische L2-Filterung aus Finanzhaus (Multi-Select)
  hoveredNode = signal<Node | null>(null);  // Für Hover-Tooltip (nur L0-L2)
  hoveredPathNode = signal<Node | null>(null);  // Für Pfad-Highlighting und Unblur
  hoveredCategories = signal<CategoryId[]>([]);
  selectedInfoNode = signal<Node | null>(null);  // Für Click-Tooltip (L3+)
  private justClickedNode = false;  // Flag um handleBackgroundClick zu ignorieren
  private backgroundMouseDownPos: { x: number; y: number } | null = null;  // Position beim mousedown auf Hintergrund

  // Doppelklick-Erkennung (muss manuell sein, weil Drag-Handler native Events überschreibt)
  private lastClickTime = 0;
  private lastClickNodeId: string | null = null;
  private readonly DOUBLE_CLICK_THRESHOLD = 300;  // ms
  private pendingClickTimeout: ReturnType<typeof setTimeout> | null = null;
  private pendingClickData: { node: Node; level: number; parent: Node | null; root: Node } | null = null;

  // Gespeicherter Zustand vor Fokus-Modus (für Wiederherstellung)
  private expandedBeforeFocus: Set<string> | null = null;

  // Computed: Bildschirm-Position des Info-Panels (reaktiv!)
  infoPanelPosition = computed(() => {
    const node = this.selectedInfoNode();
    if (!node) return null;

    const forcePos = this.forcePositions().get(node.id);
    if (!forcePos) return null;

    const zoom = this.zoomLevel();
    const pan = this.panOffset();

    // Viewport-Mitte (Ursprung des mindmap__center)
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;

    // Node-Position auf dem Bildschirm:
    // 1. forcePos ist im Force-Koordinatensystem (Ursprung = Zentrum)
    // 2. Zoom skaliert die Force-Koordinaten
    // 3. Pan ist in Pixel-Koordinaten (nicht skaliert)
    const nodeScreenX = viewportCenterX + forcePos.x * zoom + pan.x;
    const nodeScreenY = viewportCenterY + forcePos.y * zoom + pan.y;

    return { x: nodeScreenX, y: nodeScreenY };
  });
  tooltipPosition = signal<{ x: number; y: number; showBelow: boolean } | null>(null);
  finanzhausVisible = signal<boolean>(true);

  // Focus Mode (Lupenfunktion) - generisch für alle Level
  // Multi-Fokus: Array von fokussierten Nodes (nicht im localStorage gespeichert!)
  focusedNodes = signal<Array<{ node: Node; parent: Node; root: Node; level: number }>>([]);

  // Kompatibilität: Gibt den ersten fokussierten Node zurück
  focusedNode = computed(() => {
    const nodes = this.focusedNodes();
    return nodes.length > 0 ? nodes[0] : null;
  });

  // Pan State (Drag & Drop)
  isPanning = signal<boolean>(false);
  panOffset = signal<{ x: number; y: number }>({ x: 0, y: 0 });
  private panStart = { x: 0, y: 0 };

  // Zoom State (Globaler Zoom)
  zoomLevel = signal<number>(1);
  isAnimatingPan = signal<boolean>(false);
  private readonly ZOOM_MIN = 0.1;  // Weiter rauszoomen erlaubt
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

  // Gespeicherter Zoom/Pan vor dem Fokus-Modus
  private savedZoomLevel: number | null = null;
  private savedPanOffset: { x: number; y: number } | null = null;

  // localStorage Key für Persistenz (dynamisch pro Datenmodus)
  private readonly STORAGE_KEY_PREFIX = 'finanzhaus-view-state';
  private readonly DATAMODE_STORAGE_KEY = 'finanzhaus-datamode';

  // Datenmodus (Beratung / Produkte)
  dataMode = this.dataService.dataMode;

  // Debug-Panel für Node-Größen
  debugPanelOpen = signal<boolean>(false);
  nodeSizes = signal<NodeSizeConfig>({ ...DEFAULT_NODE_SIZES });
  private readonly DEBUG_SIZES_STORAGE_KEY = 'finanzhaus-debug-sizes';

  // Flag für automatische Kreisanordnung im Beratung-Modus beim ersten Laden
  private needsBeratungInitialArrangement = false;

  constructor() {
    // Debug-Größen aus localStorage laden
    this.loadDebugSizesFromStorage();
    // Datenmodus aus localStorage laden (vor dem State laden!)
    this.loadDataModeFromStorage();
    // Zustand aus localStorage laden
    this.loadStateFromStorage();
  }

  private loadDataModeFromStorage(): void {
    try {
      const storedMode = localStorage.getItem(this.DATAMODE_STORAGE_KEY);
      if (storedMode === 'beratung' || storedMode === 'produkte') {
        this.dataService.setDataMode(storedMode);
      }
    } catch (e) {
      console.warn('Failed to load data mode from localStorage:', e);
    }
  }

  private saveDataModeToStorage(): void {
    try {
      localStorage.setItem(this.DATAMODE_STORAGE_KEY, this.dataMode());
    } catch (e) {
      console.warn('Failed to save data mode to localStorage:', e);
    }
  }

  // Debug-Panel Methoden
  private loadDebugSizesFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.DEBUG_SIZES_STORAGE_KEY);
      if (stored) {
        const sizes = JSON.parse(stored) as Partial<NodeSizeConfig>;
        this.nodeSizes.set({ ...DEFAULT_NODE_SIZES, ...sizes });
      }
    } catch (e) {
      console.warn('Failed to load debug sizes from localStorage:', e);
    }
  }

  private saveDebugSizesToStorage(): void {
    try {
      localStorage.setItem(this.DEBUG_SIZES_STORAGE_KEY, JSON.stringify(this.nodeSizes()));
    } catch (e) {
      console.warn('Failed to save debug sizes to localStorage:', e);
    }
  }

  toggleDebugPanel(): void {
    this.debugPanelOpen.set(!this.debugPanelOpen());
  }

  updateNodeSize(key: keyof NodeSizeConfig, value: number): void {
    const current = this.nodeSizes();
    this.nodeSizes.set({ ...current, [key]: value });
    this.saveDebugSizesToStorage();
  }

  resetDebugSizes(): void {
    this.nodeSizes.set({ ...DEFAULT_NODE_SIZES });
    this.saveDebugSizesToStorage();
  }

  private getStorageKey(): string {
    return `${this.STORAGE_KEY_PREFIX}-${this.dataMode()}`;
  }

  // Effect: Initialize and update force layout
  private forceLayoutEffect = effect(() => {
    const root = this.rootNode();
    const expanded = this.expandedNodes();
    const focused = this.focusedNodes();  // Track focusedNodes damit der Effect auch darauf reagiert

    console.log('[forceLayoutEffect] expanded:', expanded.size, 'focused:', focused.length);

    this.forceLayout.updateNodes(root, expanded);
    console.log('[forceLayoutEffect] updateNodes done');

    // Im Fokus-Modus: Layout berechnen NACH updateNodes
    // (damit die nodeMap synchron ist und Positionen nicht überschrieben werden)
    if (focused.length > 0) {
      console.log('[forceLayoutEffect] calling calculateFocusModeLayout');
      this.calculateFocusModeLayout();
    }

    // Beratung-Modus: Automatische Kreisanordnung beim ersten Laden
    if (this.needsBeratungInitialArrangement && root.children && root.children.length > 0) {
      this.needsBeratungInitialArrangement = false;
      // Warten bis Force-Layout initialisiert ist
      setTimeout(() => {
        this.applyInitialCircularArrangement();
      }, 100);
    }
  });

  // Effect: Zustand in localStorage speichern bei jeder Änderung
  private saveStateEffect = effect(() => {
    // Alle relevanten Signale lesen (tracked)
    const expanded = this.expandedNodes();
    const categories = this.activeCategories();
    const zoom = this.zoomLevel();
    const pan = this.panOffset();
    const focused = this.focusedNode();

    // Zustand speichern
    this.saveStateToStorage();
  });

  private loadStateFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.getStorageKey());

      // Wenn kein localStorage: Default-Verhalten je nach Modus
      if (!stored) {
        if (this.dataMode() === 'produkte') {
          // Produkte-Modus: Default-Positionen aus JSON-Datei laden
          for (const [nodeId, pos] of Object.entries(produkteDefaultState.userPositions)) {
            this.forceLayout['userPositions'].set(nodeId, pos as { x: number; y: number });
          }
          // Auto-Fit nach dem Laden der Positionen
          setTimeout(() => this.fitViewToL0L1(), 100);
        } else if (this.dataMode() === 'beratung') {
          // Beratung-Modus: Flag setzen für automatische Kreisanordnung
          // (fitViewToL0L1 wird in applyInitialCircularArrangement aufgerufen)
          this.needsBeratungInitialArrangement = true;
        }
        return;
      }

      const state = JSON.parse(stored);

      // Expanded Nodes wiederherstellen
      if (state.expandedNodes && Array.isArray(state.expandedNodes)) {
        this.expandedNodes.set(new Set(state.expandedNodes));
      }

      // Active Categories wiederherstellen
      if (state.activeCategories && Array.isArray(state.activeCategories)) {
        this.activeCategories.set(new Set(state.activeCategories));
      }

      // Zoom Level wiederherstellen
      if (typeof state.zoomLevel === 'number') {
        this.zoomLevel.set(state.zoomLevel);
      }

      // Pan Offset wiederherstellen
      if (state.panOffset && typeof state.panOffset.x === 'number') {
        this.panOffset.set(state.panOffset);
      }

      // User Positions im ForceLayout wiederherstellen
      if (state.userPositions && typeof state.userPositions === 'object') {
        for (const [nodeId, pos] of Object.entries(state.userPositions)) {
          const position = pos as { x: number; y: number };
          this.forceLayout['userPositions'].set(nodeId, position);
        }
      }
    } catch (e) {
      console.warn('Failed to load state from localStorage:', e);
    }
  }

  private saveStateToStorage(): void {
    try {
      // User Positions aus dem ForceLayout holen
      const userPositions: Record<string, { x: number; y: number }> = {};
      this.forceLayout['userPositions'].forEach((pos, nodeId) => {
        userPositions[nodeId] = pos;
      });

      const state = {
        expandedNodes: Array.from(this.expandedNodes()),
        activeCategories: Array.from(this.activeCategories()),
        zoomLevel: this.zoomLevel(),
        panOffset: this.panOffset(),
        userPositions
      };

      localStorage.setItem(this.getStorageKey(), JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save state to localStorage:', e);
    }
  }

  private clearStateFromStorage(): void {
    try {
      localStorage.removeItem(this.getStorageKey());
    } catch (e) {
      console.warn('Failed to clear state from localStorage:', e);
    }
  }

  // Wechselt zwischen Beratung und Produkte
  toggleDataMode(): void {
    // Aktuellen Zustand speichern
    this.saveStateToStorage();

    // Datenmodus wechseln
    this.dataService.toggleDataMode();

    // Neuen Datenmodus speichern
    this.saveDataModeToStorage();

    // State zurücksetzen für neue Daten
    this.expandedNodes.set(new Set());
    this.activeCategories.set(new Set());
    this.focusedNodes.set([]);
    this.selectedInfoNode.set(null);
    this.tooltipPosition.set(null);
    this.panOffset.set({ x: 0, y: 0 });
    this.zoomLevel.set(1);
    this.forceLayout.resetUserPositions();

    // Neuen Zustand laden (falls vorhanden)
    this.loadStateFromStorage();
  }


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

  // L1 Node ID → Piktogramm-Bild Mapping
  private l1ImageMap: Record<string, string> = {
    'l1_zahlungsverkehr': '/assets/10_FK_Zahlungsverkehr.png',
    'l1_finanzierung': '/assets/20_FK_Finanzierung.png',
    'l1_versicherung': '/assets/30_FK_Versicherung.png',
    'l1_vorsorge_und_mitarbeiterbindung': '/assets/40_FK_Vorsorge & Mitarbeiterbindung.png',
    'l1_vermoegen_eigenkapital': '/assets/50_FK_Vermögen & Eigenkapital.png',
    'l1_auslandsgeschaeft': '/assets/60_FK_Auslandsgeschäft.png',
    'l1_gruendung_nachfolge': '/assets/70_FK_Gründung & Nachfolge.png'
  };

  // L2 Node ID → Piktogramm-Bild Mapping
  private l2ImageMap: Record<string, string> = {
    'l2_zahlungsverkehr_zahlungsverkehr_im_sepa_raum_abwickeln': '/assets/11_FK_Zahlungsverkehr im SEPA-Raum abwickeln.png',
    'l2_zahlungsverkehr_liquiditaet_vorhalten_und_absichern': '/assets/12_FK_Liquidität absichern und vorhalten.png',
    'l2_finanzierung_investitionen_finanzieren': '/assets/21_FK_Investitionen finanzieren.png',
    'l2_finanzierung_finanzierungen_optimieren': '/assets/22_FK_Finanzierungen optimieren.png',
    'l2_versicherung_notfall_regeln': '/assets/31_FK_Notfall regeln.png',
    'l2_versicherung_sachwerte_absichern': '/assets/32_FK_Sachwerte absichern.png',
    'l2_versicherung_vermoegenswerte_absichern': '/assets/33_FK_Vermögenswerte absichern.png',
    'l2_vorsorge_und_mitarbeiterbindung_mitarbeiter_binden': '/assets/41_FK_Mitarbeiter binden.png',
    'l2_vorsorge_und_mitarbeiterbindung_betriebliche_altersvorsorge_anbieten': '/assets/42_FK_Betriebliche Altersvorsorge anbieten.png',
    'l2_vermoegen_eigenkapital_vermoegen_ek_aufbauen_und_anlegen': '/assets/51_FK_Vermögen EK aufbauen und anlegen.png',
    'l2_vermoegen_eigenkapital_vermoegen_ek_verwenden': '/assets/52_FK_Vermögen EK verwenden.png',
    'l2_auslandsgeschaeft_warengeschaefte_und_dienstleistungen_abwickeln': '/assets/61_FK_Warengeschäfte und Dienstleistungen abwickeln.png',
    'l2_auslandsgeschaeft_warengeschaefte_und_dienstleistungen_finanzieren': '/assets/62_FK_Warengeschäfte und Dienstleistungen finanzieren.png',
    'l2_auslandsgeschaeft_waehrungsschwankungen_absichern': '/assets/63_FK_Währungsschwankungen absichern.png',
    'l2_gruendung_nachfolge_existenzgruendung_finanzieren': '/assets/71_FK_Existenzgründung_finanzieren.png',
    'l2_gruendung_nachfolge_unternehmensnachfolge_regeln': '/assets/72_FK_Unternehmensnachfolge_regeln.png'
  };

  getL1ImagePath(nodeId: string): string | null {
    return this.l1ImageMap[nodeId] || null;
  }

  getL2ImagePath(nodeId: string): string | null {
    return this.l2ImageMap[nodeId] || null;
  }

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
    const currentCategories = new Set(this.activeCategories());
    const currentL2s = new Set(this.selectedL2NodeIds());
    const inFocusMode = this.isInFocusMode();

    // Finde alle L2-Nodes die zu dieser Kategorie gehören und entferne sie
    const l2sToRemove = this.getL2NodesForCategory(catId);
    for (const l2Id of l2sToRemove) {
      currentL2s.delete(l2Id);
    }
    this.selectedL2NodeIds.set(currentL2s);

    if (currentCategories.has(catId)) {
      // Kategorie entfernen
      currentCategories.delete(catId);
      this.activeCategories.set(currentCategories);

      if (currentCategories.size === 0 && currentL2s.size === 0 && !inFocusMode) {
        // Keine Filter mehr aktiv und kein Fokus → gespeicherten Zustand wiederherstellen
        if (this.savedExpandedNodes !== null) {
          this.expandedNodes.set(new Set(this.savedExpandedNodes));
          this.savedExpandedNodes = null;
        }
        // Auf alle sichtbaren Nodes zentrieren
        setTimeout(() => this.centerOnVisibleNodes(), 100);
      } else if (!inFocusMode) {
        // Noch andere Filter aktiv (kein Fokus) → auf diese zentrieren
        setTimeout(() => this.centerOnAllFilteredNodes(), 100);
      }
      // Im Fokus-Modus: Nur Filter ändern, nichts expandieren/zentrieren
    } else {
      // Kategorie hinzufügen
      currentCategories.add(catId);
      this.activeCategories.set(currentCategories);

      if (inFocusMode) {
        // Im Fokus-Modus: Nur Filter setzen, auf gefilterte Fokus-Nodes zentrieren
        setTimeout(() => this.centerOnFilteredFocusNodes(), 100);
      } else {
        // Erster Filter? Zustand speichern
        if (currentCategories.size === 1 && currentL2s.size === 0) {
          this.savedExpandedNodes = new Set(this.expandedNodes());
        }

        // Alle Level 1 Nodes expandieren die passende Kinder haben
        const expanded = new Set(this.expandedNodes());
        for (const level1Node of this.mainNodes()) {
          if (this.hasAnyCategoryMatch(level1Node, currentCategories)) {
            this.expandNodeAndChildren(level1Node, expanded);
          }
        }
        this.expandedNodes.set(expanded);

        // View auf passende Nodes zentrieren
        setTimeout(() => this.centerOnAllFilteredNodes(), 100);
      }
    }
  }

  // Hilfsmethode: Findet alle L2-Node-IDs die DIREKTE KINDER eines L1-Nodes mit dieser Kategorie sind
  // Wichtig: Prüft den L1-Node, nicht die L2-Nodes, damit L2s anderer Bereiche nicht betroffen sind
  private getL2NodesForCategory(catId: CategoryId): string[] {
    const l2Ids: string[] = [];
    const root = this.rootNode();

    // Durch alle L1-Nodes iterieren
    if (root.children) {
      for (const l1Node of root.children) {
        // Prüfen ob dieser L1-Node die Kategorie hat
        if (l1Node.categoryIds.includes(catId)) {
          // Alle L2-Kinder dieses L1 sammeln
          if (l1Node.children) {
            for (const l2Node of l1Node.children) {
              l2Ids.push(l2Node.id);
            }
          }
        }
      }
    }

    return l2Ids;
  }

  // Handler für L2-Selektion aus dem Finanzhaus
  handleL2Selection(event: { l2Id: string; fallbackCategory: CategoryId }): void {
    const { l2Id, fallbackCategory } = event;

    // Prüfe ob der L2-Node im aktuellen Baum existiert
    const l2Node = this.findNodeByIdRecursive(this.rootNode(), l2Id);

    if (l2Node) {
      const currentL2s = new Set(this.selectedL2NodeIds());
      const currentCategories = new Set(this.activeCategories());

      if (currentL2s.has(l2Id)) {
        // Toggle: L2 ist bereits selektiert → entfernen
        currentL2s.delete(l2Id);
        this.selectedL2NodeIds.set(currentL2s);

        // Wenn keine Filter mehr aktiv → Zustand wiederherstellen
        if (currentL2s.size === 0 && currentCategories.size === 0) {
          if (this.savedExpandedNodes !== null) {
            this.expandedNodes.set(new Set(this.savedExpandedNodes));
            this.savedExpandedNodes = null;
          }
          setTimeout(() => this.centerOnVisibleNodes(), 100);
        } else {
          setTimeout(() => this.centerOnAllFilteredNodes(), 100);
        }
        return;
      }

      // L2 hinzufügen
      // Erster Filter? Zustand speichern
      if (currentCategories.size === 0 && currentL2s.size === 0) {
        this.savedExpandedNodes = new Set(this.expandedNodes());
      }

      // Prüfen ob das übergeordnete L1 (via Kategorie) selektiert ist → wenn ja, entfernen
      // Das L2 ersetzt sozusagen das L1 für diesen Bereich
      for (const catId of l2Node.categoryIds) {
        if (currentCategories.has(catId)) {
          currentCategories.delete(catId);
        }
      }
      this.activeCategories.set(currentCategories);

      // L2 zum Set hinzufügen
      currentL2s.add(l2Id);
      this.selectedL2NodeIds.set(currentL2s);

      // Pfad zum L2 expandieren INKL. L2 selbst (damit Kinder sichtbar sind)
      const path = this.findPathToNode(this.rootNode(), l2Id);
      if (path) {
        const expanded = new Set(this.expandedNodes());
        for (const nodeId of path) {
          expanded.add(nodeId);
        }
        this.expandedNodes.set(expanded);
      }

      // View auf alle gefilterten Nodes zentrieren
      setTimeout(() => this.centerOnAllFilteredNodes(), 150);
    } else {
      // L2-Node nicht gefunden: Fallback auf L1-Kategorie
      this.toggleCategory(fallbackCategory);
    }
  }

  // Alle L2-Auswahl zurücksetzen
  private clearL2Selection(): void {
    this.selectedL2NodeIds.set(new Set());

    // Wenn auch keine L1-Kategorien mehr aktiv: Zustand wiederherstellen
    if (this.activeCategories().size === 0) {
      if (this.savedExpandedNodes !== null) {
        this.expandedNodes.set(new Set(this.savedExpandedNodes));
        this.savedExpandedNodes = null;
      }
      setTimeout(() => this.centerOnVisibleNodes(), 100);
    } else {
      // Noch L1-Kategorien aktiv: auf diese zentrieren
      setTimeout(() => this.centerOnAllFilteredNodes(), 100);
    }
  }

  // View auf L2-Node und dessen sichtbare Elemente zentrieren
  private centerOnL2Node(l2Id: string): void {
    const positions = this.forcePositions();
    const l2Node = this.findNodeByIdRecursive(this.rootNode(), l2Id);
    if (!l2Node) return;

    // Alle sichtbaren Node-Positionen sammeln:
    // 1. Pfad zum L2 (L0, L1)
    // 2. L2 selbst
    // 3. Alle Kinder des L2
    const visiblePositions: { x: number; y: number }[] = [];

    // Pfad zum L2-Node (L0 und L1)
    const path = this.findPathToNode(this.rootNode(), l2Id);
    if (path) {
      for (const nodeId of path) {
        const pos = positions.get(nodeId);
        if (pos) visiblePositions.push(pos);
      }
    }

    // Kinder des L2-Nodes rekursiv sammeln
    const collectChildren = (node: Node) => {
      const pos = positions.get(node.id);
      if (pos) visiblePositions.push(pos);

      if (node.children) {
        for (const child of node.children) {
          collectChildren(child);
        }
      }
    };

    if (l2Node.children) {
      for (const child of l2Node.children) {
        collectChildren(child);
      }
    }

    if (visiblePositions.length === 0) return;

    // Zentrier- und Zoom-Funktion aufrufen
    this.centerAndZoomToFit(visiblePositions);
  }

  // Hilfsmethode: Findet einen Node rekursiv im Baum
  private findNodeByIdRecursive(node: Node, targetId: string): Node | null {
    if (node.id === targetId) {
      return node;
    }
    if (node.children) {
      for (const child of node.children) {
        const found = this.findNodeByIdRecursive(child, targetId);
        if (found) return found;
      }
    }
    return null;
  }

  // Hilfsmethode: Prüft ob ein Node ein Nachkomme eines anderen ist
  private isDescendantOf(node: Node, ancestor: Node): boolean {
    if (!ancestor.children) return false;
    for (const child of ancestor.children) {
      if (child.id === node.id) return true;
      if (this.isDescendantOf(node, child)) return true;
    }
    return false;
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

  // Zentriert die View auf alle Nodes die zum Filter passen (nur L1-Kategorien)
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

    // Zentrier- und Zoom-Funktion aufrufen
    this.centerAndZoomToFit(matchingPositions);
  }

  /**
   * Zentriert die View auf alle Nodes die durch L1-Kategorien ODER L2-IDs gefiltert sind.
   * Kombiniert beide Filter-Typen für Multi-Select.
   */
  private centerOnAllFilteredNodes(): void {
    const positions = this.forcePositions();
    const categories = this.activeCategories();
    const selectedL2Ids = this.selectedL2NodeIds();

    if (positions.size === 0) return;
    if (categories.size === 0 && selectedL2Ids.size === 0) return;

    const matchingPositions: { x: number; y: number }[] = [];

    // Sammle alle Nodes die durch L1-Kategorien passen
    const collectByCategory = (node: Node) => {
      const pos = positions.get(node.id);
      if (!pos) return;

      const isMatch = node.categoryIds.some(id => categories.has(id));
      const hasMatchingChildren = this.hasAnyCategoryMatch(node, categories);

      if (isMatch || hasMatchingChildren) {
        matchingPositions.push(pos);
      }

      if (node.children) {
        for (const child of node.children) {
          collectByCategory(child);
        }
      }
    };

    // Sammle alle Nodes die durch L2-IDs passen (L2 selbst + Pfad + Kinder)
    const collectByL2 = (l2Id: string) => {
      const l2Node = this.findNodeByIdRecursive(this.rootNode(), l2Id);
      if (!l2Node) return;

      // Pfad zum L2 (inkl. L2 selbst)
      const path = this.findPathToNode(this.rootNode(), l2Id);
      if (path) {
        for (const nodeId of path) {
          const pos = positions.get(nodeId);
          if (pos) matchingPositions.push(pos);
        }
      }

      // Kinder des L2 rekursiv
      const collectChildren = (node: Node) => {
        if (node.children) {
          for (const child of node.children) {
            const pos = positions.get(child.id);
            if (pos) matchingPositions.push(pos);
            collectChildren(child);
          }
        }
      };
      collectChildren(l2Node);
    };

    // L1-Kategorien sammeln
    if (categories.size > 0) {
      collectByCategory(this.rootNode());
    }

    // L2-IDs sammeln
    for (const l2Id of selectedL2Ids) {
      collectByL2(l2Id);
    }

    if (matchingPositions.length === 0) return;

    this.centerAndZoomToFit(matchingPositions);
  }

  /**
   * Zentriert die View auf alle aktuell sichtbaren Nodes.
   * Sammelt alle Nodes die expandiert/sichtbar sind und ruft centerAndZoomToFit auf.
   */
  private centerOnVisibleNodes(): void {
    const positions = this.forcePositions();
    const expanded = this.expandedNodes();
    const visiblePositions: { x: number; y: number }[] = [];

    // Alle sichtbaren Nodes sammeln (rekursiv)
    // level: 0 = Root, 1 = L1, 2 = L2, etc.
    const collectVisible = (node: Node, level: number, parentExpanded: boolean) => {
      // Node ist sichtbar wenn:
      // - Level 0 oder 1 (immer sichtbar)
      // - Oder Parent ist expandiert
      const isVisible = level <= 1 || parentExpanded;

      if (isVisible) {
        const pos = positions.get(node.id);
        if (pos) visiblePositions.push(pos);
      }

      // Kinder durchlaufen wenn dieser Node expandiert ist
      if (node.children) {
        const thisNodeExpanded = expanded.has(node.id);
        for (const child of node.children) {
          collectVisible(child, level + 1, thisNodeExpanded);
        }
      }
    };

    // Von Root starten
    const root = this.rootNode();
    collectVisible(root, 0, true);

    if (visiblePositions.length === 0) return;

    this.centerAndZoomToFit(visiblePositions);
  }

  /**
   * Zentriert die View auf die gegebenen Positionen und passt den Zoom an,
   * sodass alle Positionen sichtbar sind.
   *
   * Koordinatensystem-Logik:
   * nodeScreenX = viewportCenterX + forcePos.x * zoom + pan.x
   *
   * Um einen Punkt (centerX, centerY) in der Viewport-Mitte zu haben:
   * pan.x = -centerX * zoom
   * pan.y = -centerY * zoom
   */
  private centerAndZoomToFit(positions: { x: number; y: number }[]): void {
    if (positions.length === 0) return;

    // Bounding Box berechnen (im Force-Koordinatensystem)
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pos of positions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    // Mittelpunkt im Force-Koordinatensystem
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Bounding-Box-Größe (mit Padding für Node-Größen, ca. 100px pro Seite)
    const NODE_PADDING = 100;
    const boxWidth = (maxX - minX) + NODE_PADDING * 2;
    const boxHeight = (maxY - minY) + NODE_PADDING * 2;

    // Viewport-Größe (mit Margin für UI-Elemente wie Finanzhaus, Toolbar)
    const VIEWPORT_MARGIN = 0.80; // 80% des Viewports nutzen
    const viewportWidth = window.innerWidth * VIEWPORT_MARGIN;
    const viewportHeight = window.innerHeight * VIEWPORT_MARGIN;

    // Benötigten Zoom berechnen, sodass die Bounding-Box in den Viewport passt
    let newZoom: number;

    if (boxWidth <= 0 || boxHeight <= 0) {
      // Einzelner Punkt oder sehr kleine Box: Zoom 1 verwenden
      newZoom = 1;
    } else {
      const zoomX = viewportWidth / boxWidth;
      const zoomY = viewportHeight / boxHeight;
      newZoom = Math.min(zoomX, zoomY);
    }

    // Zoom auf Grenzen beschränken
    newZoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, newZoom));

    // Nicht weiter reinzoomen als nötig (max 1.0 für Filter-Ansicht)
    newZoom = Math.min(newZoom, 1.0);

    // Pan berechnen: Um centerX/centerY in der Viewport-Mitte zu haben
    // Formel: nodeScreenX = viewportCenterX + forcePos.x * zoom + pan.x
    // Für centerX in Mitte: viewportCenterX = viewportCenterX + centerX * zoom + pan.x
    // => pan.x = -centerX * zoom
    const panX = -centerX * newZoom;
    const panY = -centerY * newZoom;

    // Mit Animation anwenden
    this.animateZoomAndPanTo(newZoom, panX, panY);
  }

  // Animiert Zoom und Pan gleichzeitig
  private animateZoomAndPanTo(zoom: number, panX: number, panY: number): void {
    this.isAnimatingPan.set(true);
    this.zoomLevel.set(zoom);
    this.panOffset.set({ x: panX, y: panY });

    // Animation dauert 400ms (entspricht CSS transition)
    setTimeout(() => {
      this.isAnimatingPan.set(false);
    }, 400);
  }

  // Animiert das Pannen zu einer Position (ohne Zoom-Änderung)
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
    console.log('=== SINGLE CLICK ===', { nodeId: node.id, level: numLevel });

    // Bei Klick auf L0-L2: Offenen Info-Tooltip schließen
    if (numLevel < 3 && this.selectedInfoNode()) {
      this.selectedInfoNode.set(null);
      this.tooltipPosition.set(null);
    }

    // Level 3+: Info-Tooltip öffnen/schließen
    if (numLevel >= 3) {
      this.justClickedNode = true;

      if (this.selectedInfoNode()?.id === node.id) {
        this.selectedInfoNode.set(null);
      } else {
        this.selectedInfoNode.set(node);
      }
      return;
    }

    // Level 0-2: Expand/Collapse
    this.executeNodeClick(node, numLevel);
  }

  // Tatsächliche Click-Logik
  private executeNodeClick(node: Node, numLevel: number): void {
    // Im Fokus-Modus: L0/L1/L2 können NICHT ein-/ausgeklappt werden
    if (this.isInFocusMode() && numLevel <= 2) {
      console.log('[executeNodeClick] IGNORED - focus mode active, level:', numLevel);
      return;
    }

    if (numLevel === 0) {
      if (this.expandedNodes().size > 0) {
        // Etwas ist expandiert → alles einklappen + Filter löschen
        this.collapseAllWithAnimation();
        this.activeCategories.set(new Set());
        this.animatePanTo(0, 0);
      } else {
        // Nichts expandiert (nur L1 sichtbar) → alle L1 Nodes expandieren
        this.expandAllLevel1Nodes();
      }
      return;
    }

    if (numLevel === 1 || numLevel === 2) {
      // Level 1 und 2: Toggle expand (ohne Fokus-Logik)
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
    }
  }

  // Doppelklick-Handler für Fokus-Modus
  handleNodeDoubleClick(event: MouseEvent, node: Node, level: number, parent: Node | null, root: Node): void {
    console.log('=== DOUBLE CLICK ===', { nodeId: node.id, level });
    event.stopPropagation();
    event.preventDefault();

    const numLevel = Number(level);

    // Level 0: Fokus beenden (falls aktiv)
    if (numLevel === 0) {
      if (this.isInFocusMode()) {
        this.exitFocusMode();
      }
      return;
    }

    // Level 1+: Fokus-Logik
    const actualParent = parent || this.findParentOfNode(this.rootNode(), node);
    if (!actualParent && numLevel > 1) return;

    // Normaler Doppelklick
    if (this.isNodeInFocus(node) && this.focusedNodes().length === 1) {
      // Doppelklick auf einzigen fokussierten Node → Fokus beenden
      console.log('[handleNodeDoubleClick] exit focus mode');
      this.exitFocusMode();
      return;
    }

    // Expanded-Zustand speichern VOR dem Fokussieren (nur beim ersten Mal)
    if (!this.isInFocusMode()) {
      this.expandedBeforeFocus = new Set(this.expandedNodes());
      console.log('[handleNodeDoubleClick] saved expandedBeforeFocus:', this.expandedBeforeFocus.size);
    }

    // ERST expandieren damit Kinder in nodeMap sind BEVOR Fokus gesetzt wird!
    console.log('[handleNodeDoubleClick] expanding node:', node.id);
    const expanded = new Set(this.expandedNodes());
    expanded.add(node.id);
    this.expandedNodes.set(expanded);
    console.log('[handleNodeDoubleClick] expandedNodes set, now setting focus');

    // DANN Fokus setzen - der effect läuft mit bereits expandierten Kindern
    this.setFocusedNodeSingle(node, actualParent || this.rootNode(), root, numLevel);
    console.log('[handleNodeDoubleClick] DONE');
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

  /**
   * Expandiert alle Level 1 Nodes (zeigt alle Level 2 Kinder)
   * Wird aufgerufen wenn auf Level 0 geklickt wird und nichts expandiert ist
   */
  private expandAllLevel1Nodes(): void {
    const expanded = new Set<string>();
    const level1Nodes = this.mainNodes();

    for (const l1Node of level1Nodes) {
      this.expandNodeAndChildren(l1Node, expanded);
    }

    this.expandedNodes.set(expanded);
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

    // Falls Info-Tooltip zu einem der kollabierenden Nodes gehört, schließen
    const selectedInfo = this.selectedInfoNode();
    if (selectedInfo && nodesToCollapse.has(selectedInfo.id)) {
      this.selectedInfoNode.set(null);
      this.tooltipPosition.set(null);
    }

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
    // Wenn gerade ein Node geklickt wurde, ignorieren
    if (this.justClickedNode) {
      this.justClickedNode = false;
      return;
    }

    // Prüfe ob es ein Drag war (Maus bewegt seit mousedown)
    if (this.backgroundMouseDownPos) {
      const dx = event.clientX - this.backgroundMouseDownPos.x;
      const dy = event.clientY - this.backgroundMouseDownPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance > 5) {
        // War ein Drag, nicht schließen
        return;
      }
    }

    // War ein Click auf Hintergrund → Panel schließen
    if (this.selectedInfoNode()) {
      this.selectedInfoNode.set(null);
    }
  }

  clearAllFilters() {
    // Gespeicherten Zustand wiederherstellen
    if (this.savedExpandedNodes !== null) {
      this.expandedNodes.set(new Set(this.savedExpandedNodes));
      this.savedExpandedNodes = null;
    }
    this.activeCategories.set(new Set());
    this.selectedInfoNode.set(null);
    this.tooltipPosition.set(null);
    this.animatePanTo(0, 0);
  }

  resetView() {
    // 1. Alle User-Positionen zurücksetzen
    this.forceLayout.resetUserPositions();

    // 2. localStorage löschen
    this.clearStateFromStorage();

    // 3. Standard-Positionen je nach Datenmodus setzen (VOR den Signal-Änderungen!)
    if (this.dataMode() === 'produkte') {
      // Produkte-Modus: Default-Positionen aus JSON-Datei laden
      for (const [nodeId, pos] of Object.entries(produkteDefaultState.userPositions)) {
        this.forceLayout['userPositions'].set(nodeId, pos as { x: number; y: number });
      }
    }

    // 4. State und View zurücksetzen
    this.activeCategories.set(new Set());
    this.focusedNodes.set([]);
    this.selectedInfoNode.set(null);
    this.tooltipPosition.set(null);

    // 5. Beratung-Modus: Direkt die korrekten expandedNodes setzen und Kreisanordnung anwenden
    if (this.dataMode() === 'beratung') {
      // Alle L1 und L2 Nodes als expanded setzen (damit L3 sichtbar wird)
      const expanded = new Set<string>();
      const root = this.rootNode();
      for (const l1Node of root.children || []) {
        expanded.add(l1Node.id);
        for (const l2Node of l1Node.children || []) {
          expanded.add(l2Node.id);
        }
      }
      this.expandedNodes.set(expanded);

      // Kreisanordnung anwenden nachdem Layout aktualisiert ist
      setTimeout(() => {
        for (const l1Node of root.children || []) {
          if (l1Node.children && l1Node.children.length > 0) {
            const childIds = l1Node.children.map(child => child.id);
            this.forceLayout.arrangeChildrenCircular(l1Node.id, childIds);
          }
        }
        // Auto-Fit nach Kreisanordnung
        this.fitViewToL0L1();
        this.saveStateToStorage();
      }, 200);
    } else {
      // Produkte-Modus: Einfach zurücksetzen und Auto-Fit
      this.expandedNodes.set(new Set());
      // Warten bis Force-Layout die Positionen hat
      setTimeout(() => {
        this.fitViewToL0L1();
        this.saveStateToStorage();
      }, 100);
    }
  }

  /**
   * Berechnet Zoom und Pan so, dass L0 und alle L1 Nodes sichtbar sind.
   * Berücksichtigt Force-Layout, userPositions und Default-Werte.
   */
  fitViewToL0L1(): void {
    const root = this.rootNode();
    const l1Nodes = root.children || [];
    if (l1Nodes.length === 0) return;

    // Sammle alle L1 Positionen aus verschiedenen Quellen
    const positions: { x: number; y: number }[] = [];

    // L0 ist immer bei (0, 0)
    positions.push({ x: 0, y: 0 });

    for (const l1Node of l1Nodes) {
      // Priorität: 1. userPositions, 2. Force-Layout, 3. Default
      const userPos = this.forceLayout['userPositions'].get(l1Node.id);
      if (userPos) {
        positions.push(userPos);
        continue;
      }

      const forcePos = this.forcePositions().get(l1Node.id);
      if (forcePos) {
        positions.push(forcePos);
        continue;
      }

      // Fallback: Default-Positionen für Produkte-Modus
      if (this.dataMode() === 'produkte') {
        const defaultPos = (produkteDefaultState.userPositions as Record<string, { x: number; y: number }>)[l1Node.id];
        if (defaultPos) {
          positions.push(defaultPos);
        }
      }
    }

    if (positions.length <= 1) return; // Nur L0, keine L1 gefunden

    // Bounding Box berechnen
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pos of positions) {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y);
    }

    // Padding für Node-Größen hinzufügen (L1 Nodes sind ~7rem = ~112px)
    const nodePadding = 150;
    minX -= nodePadding;
    maxX += nodePadding;
    minY -= nodePadding;
    maxY += nodePadding;

    const boxWidth = maxX - minX;
    const boxHeight = maxY - minY;
    const boxCenterX = (minX + maxX) / 2;
    const boxCenterY = (minY + maxY) / 2;

    // Viewport-Größe ermitteln (mit etwas Margin für UI-Elemente)
    const viewportWidth = window.innerWidth * 0.85;
    const viewportHeight = window.innerHeight * 0.85;

    // Zoom berechnen der die Box reinpasst
    const zoomX = viewportWidth / boxWidth;
    const zoomY = viewportHeight / boxHeight;
    let newZoom = Math.min(zoomX, zoomY);

    // Zoom-Grenzen einhalten
    newZoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, newZoom));
    newZoom = Math.round(newZoom * 100) / 100;

    // Pan berechnen um Box zu zentrieren
    const panX = -boxCenterX;
    const panY = -boxCenterY;

    // Anwenden
    this.zoomLevel.set(newZoom);
    this.panOffset.set({ x: panX, y: panY });
  }

  // --- Pan Event Handlers (Mouse) ---

  onPanStart(event: MouseEvent) {
    if (event.button !== 0) return;

    // Speichere Position für Click vs Drag Erkennung
    this.backgroundMouseDownPos = { x: event.clientX, y: event.clientY };

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

  // Pinch-to-Zoom State
  private isPinching = false;
  private initialPinchDistance = 0;
  private initialPinchZoom = 1;

  onTouchStart(event: TouchEvent) {
    // Pinch-to-Zoom: 2 Finger
    if (event.touches.length === 2) {
      event.preventDefault();
      this.isPinching = true;
      this.isPanning.set(false);
      this.initialPinchDistance = this.getTouchDistance(event.touches);
      this.initialPinchZoom = this.zoomLevel();
      return;
    }

    // Pan: 1 Finger
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      this.isPanning.set(true);
      this.panStart = {
        x: touch.clientX - this.panOffset().x,
        y: touch.clientY - this.panOffset().y
      };
    }
  }

  onTouchMove(event: TouchEvent) {
    // Pinch-to-Zoom
    if (this.isPinching && event.touches.length === 2) {
      event.preventDefault();
      const currentDistance = this.getTouchDistance(event.touches);
      const scale = currentDistance / this.initialPinchDistance;
      let newZoom = this.initialPinchZoom * scale;

      // Zoom-Grenzen einhalten
      newZoom = Math.max(this.ZOOM_MIN, Math.min(this.ZOOM_MAX, newZoom));
      this.zoomLevel.set(Math.round(newZoom * 100) / 100);
      return;
    }

    // Node Drag (Touch)
    const dragNode = this.draggingNode();
    if (dragNode && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      const dx = touch.clientX - this.dragStartPos.x;
      const dy = touch.clientY - this.dragStartPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Prüfe ob Threshold überschritten
      if (!this.dragMoved && distance >= this.DRAG_THRESHOLD) {
        this.dragMoved = true;
        this.isActivelyDragging.set(true);
      }

      if (this.dragMoved) {
        const zoom = this.zoomLevel();
        const newX = this.dragNodeStartPos.x + dx / zoom;
        const newY = this.dragNodeStartPos.y + dy / zoom;
        this.forceLayout.setNodePosition(dragNode.id, newX, newY);
      }
      return;
    }

    // Pan
    if (this.isPanning() && event.touches.length === 1) {
      event.preventDefault();
      const touch = event.touches[0];
      this.panOffset.set({
        x: touch.clientX - this.panStart.x,
        y: touch.clientY - this.panStart.y
      });
    }
  }

  onTouchEnd(event: TouchEvent) {
    // Node Drag beenden (Touch)
    const draggedNode = this.draggingNode();
    if (draggedNode && this.dragContext) {
      if (this.dragMoved) {
        // Drag wurde durchgeführt
        // Level 1 Kollisionserkennung: Prüfe ob Level 1 auf Level 2 liegt
        if (this.dragContext.level === 1 && this.hasCollisionWithChildren(draggedNode)) {
          // Kollision! Position zurücksetzen
          this.forceLayout.resetNodePosition(draggedNode.id);
        } else if (this.isInFocusMode()) {
          // Im Fokus-Modus: Nur Fixierung lösen, NICHT speichern (temporär)
          this.forceLayout.unfixNode(draggedNode.id);
        } else {
          // Normal-Modus: Position permanent speichern
          this.forceLayout.releaseNode(draggedNode.id);
          this.saveStateToStorage();
        }
      } else {
        // Kein Drag - war ein Tap → Node-Klick auslösen
        this.forceLayout.unfixNode(draggedNode.id);
        this.handleNodeClick(draggedNode, this.dragContext.level, this.dragContext.parent, this.dragContext.root);
      }

      this.draggingNode.set(null);
      this.isActivelyDragging.set(false);
      this.dragMoved = false;
      this.dragContext = null;
      return;
    }

    // Wenn noch Finger übrig: Prüfen ob wir zu Pan wechseln
    if (event.touches.length === 1 && this.isPinching) {
      this.isPinching = false;
      const touch = event.touches[0];
      this.isPanning.set(true);
      this.panStart = {
        x: touch.clientX - this.panOffset().x,
        y: touch.clientY - this.panOffset().y
      };
      return;
    }

    // Alle Finger weg
    if (event.touches.length === 0) {
      this.isPinching = false;
      this.isPanning.set(false);
    }
  }

  // Touch-Start auf einem Node (für Drag & Drop)
  onNodeTouchStart(event: TouchEvent, node: Node, level: number, parent: Node | null, root: Node) {
    if (level < 1) return; // L0 ist fixiert
    if (event.touches.length !== 1) return;

    event.stopPropagation();
    event.preventDefault(); // Verhindert simulierte Mouse-Events nach Touch

    const touch = event.touches[0];
    const nodePos = this.forceLayout.getPosition(node.id);
    if (!nodePos) return;

    this.dragStartPos = { x: touch.clientX, y: touch.clientY };
    this.dragNodeStartPos = { x: nodePos.x, y: nodePos.y };
    this.dragMoved = false;
    this.draggingNode.set(node);
    this.dragContext = { level, parent, root };

    this.forceLayout.fixNode(node.id);
  }

  private getTouchDistance(touches: TouchList): number {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // --- Node Drag Handlers (Level 2+) ---

  onNodeDragStart(event: MouseEvent, node: Node, level: number, parent: Node | null, root: Node) {
    // Nur Level 1+ können gezogen werden (L0 ist fixiert)
    if (level < 1) return;
    if (event.button !== 0) return; // Nur linke Maustaste

    event.stopPropagation(); // Verhindert Pan
    // KEIN preventDefault() - das blockiert dblclick!

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
        // Drag wurde durchgeführt
        if (this.dragContext.level === 1 && this.hasCollisionWithChildren(draggedNode)) {
          this.forceLayout.resetNodePosition(draggedNode.id);
        } else if (this.isInFocusMode()) {
          // Im Fokus-Modus: Nur Fixierung lösen, NICHT speichern (temporär)
          this.forceLayout.unfixNode(draggedNode.id);
        } else {
          // Normal-Modus: Position permanent speichern
          this.forceLayout.releaseNode(draggedNode.id);
          this.saveStateToStorage();
        }
      } else {
        // Kein Drag - war ein Klick
        // Doppelklick-Erkennung mit verzögertem Einzelklick
        const now = Date.now();
        const isDoubleClick = (
          this.lastClickNodeId === draggedNode.id &&
          (now - this.lastClickTime) < this.DOUBLE_CLICK_THRESHOLD
        );

        this.lastClickTime = now;
        this.lastClickNodeId = draggedNode.id;

        this.forceLayout.unfixNode(draggedNode.id);

        if (isDoubleClick) {
          // Doppelklick erkannt! Pending Einzelklick abbrechen
          if (this.pendingClickTimeout) {
            clearTimeout(this.pendingClickTimeout);
            this.pendingClickTimeout = null;
            this.pendingClickData = null;
          }
          console.log('=== DOUBLE CLICK DETECTED ===', { nodeId: draggedNode.id, level: this.dragContext.level });
          this.handleNodeDoubleClick(
            event,
            draggedNode,
            this.dragContext.level,
            this.dragContext.parent,
            this.dragContext.root
          );
        } else {
          // Erster Klick - verzögern um auf möglichen Doppelklick zu warten
          this.pendingClickData = {
            node: draggedNode,
            level: this.dragContext.level,
            parent: this.dragContext.parent,
            root: this.dragContext.root
          };
          this.pendingClickTimeout = setTimeout(() => {
            if (this.pendingClickData) {
              console.log('=== SINGLE CLICK (delayed) ===', { nodeId: this.pendingClickData.node.id });
              this.handleNodeClick(
                this.pendingClickData.node,
                this.pendingClickData.level,
                this.pendingClickData.parent,
                this.pendingClickData.root
              );
              this.pendingClickData = null;
            }
            this.pendingClickTimeout = null;
          }, this.DOUBLE_CLICK_THRESHOLD);
        }
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

  /**
   * Prüft ob ein Level 1 Node mit seinen Level 2 Kindern kollidiert.
   * Wird nach dem Drag aufgerufen um zu verhindern, dass Level 1 auf Level 2 landet.
   */
  private hasCollisionWithChildren(node: Node): boolean {
    if (!node.children) return false;

    for (const child of node.children) {
      if (this.forceLayout.checkCollision(node.id, child.id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Rechtsklick auf Level 1 oder 2 Node: Ordnet Kinder kreisförmig an.
   */
  onNodeContextMenu(event: MouseEvent, node: Node, level: number): void {
    // Nur für Level 1 und 2 mit Kindern
    if ((level !== 1 && level !== 2) || !node.children || node.children.length === 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    this.arrangeChildrenCircular(node, event);
  }

  /**
   * Ordnet Level 3 Kinder eines Level 2 Nodes kreisförmig an.
   * Wird vom Button oder Rechtsklick aufgerufen.
   * Im Fokus-Modus: Halbkreis rechts / Kreis mit Lücke links (temporär).
   * Im Normal-Modus: Voller Kreis (permanent gespeichert).
   */
  arrangeChildrenCircular(node: Node, event?: Event): void {
    if (!node.children || node.children.length === 0) {
      return;
    }

    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    console.log('[arrangeChildrenCircular] node:', node.id, 'children:', node.children.length);

    // Node muss expandiert sein damit Kinder sichtbar sind
    // NUR setzen wenn noch nicht expandiert (verhindert Endlosschleife im effect)
    if (!this.expandedNodes().has(node.id)) {
      console.log('[arrangeChildrenCircular] expanding node:', node.id);
      const expanded = new Set(this.expandedNodes());
      expanded.add(node.id);
      this.expandedNodes.set(expanded);
    }

    // Kinder-IDs sammeln
    const childIds = node.children.map(child => child.id);
    console.log('[arrangeChildrenCircular] childIds:', childIds);

    if (this.isInFocusMode()) {
      // Fokus-Modus: Halbkreis rechts / Kreis mit Lücke links (temporär)
      console.log('[arrangeChildrenCircular] FOCUS MODE - calling arrangeChildrenCircularFocusMode');
      this.forceLayout.arrangeChildrenCircularFocusMode(node.id, childIds);
      // NICHT speichern - Fokus-Modus ist temporär!
    } else {
      // Normal-Modus: Voller Kreis (permanent)
      console.log('[arrangeChildrenCircular] NORMAL MODE - calling arrangeChildrenCircular');
      this.forceLayout.arrangeChildrenCircular(node.id, childIds);
      this.saveStateToStorage();
    }
    console.log('[arrangeChildrenCircular] DONE');
  }

  /**
   * Wendet automatisch Kreisanordnung auf alle L1 Nodes an.
   * Wird beim ersten Laden im Beratung-Modus aufgerufen.
   */
  private applyInitialCircularArrangement(): void {
    const root = this.rootNode();
    if (!root.children || root.children.length === 0) {
      return;
    }

    // Alle L1 UND L2 Nodes expandieren (damit L3 Kinder sichtbar werden)
    const expanded = new Set(this.expandedNodes());
    for (const l1Node of root.children) {
      expanded.add(l1Node.id);
      // Auch alle L2 Kinder expandieren
      if (l1Node.children) {
        for (const l2Node of l1Node.children) {
          expanded.add(l2Node.id);
        }
      }
    }
    this.expandedNodes.set(expanded);

    // Warten bis alle Nodes im Layout sind (L1, L2 und L3)
    setTimeout(() => {
      // Kreisanordnung für jede L1 Node anwenden (positioniert L2 UND L3)
      for (const l1Node of root.children!) {
        if (l1Node.children && l1Node.children.length > 0) {
          const childIds = l1Node.children.map(child => child.id);
          this.forceLayout.arrangeChildrenCircular(l1Node.id, childIds);
        }
      }
      // Auto-Fit nach Kreisanordnung
      this.fitViewToL0L1();
      // Zustand speichern
      this.saveStateToStorage();
    }, 150);
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

  // Verlässt den Fokus-Modus und setzt Positionen zurück
  private exitFocusMode(): void {
    console.log('[exitFocusMode] exiting...');
    this.focusedNodes.set([]);

    // Positionen auf Original zurücksetzen (mit Animation durch CSS transition)
    this.forceLayout.resetToOriginalPositions();

    // Gespeicherten Zoom/Pan wiederherstellen (mit Animation)
    if (this.savedZoomLevel !== null && this.savedPanOffset !== null) {
      this.isAnimatingPan.set(true);
      this.zoomLevel.set(this.savedZoomLevel);
      this.panOffset.set(this.savedPanOffset);

      // Animation beenden nach Transition
      setTimeout(() => {
        this.isAnimatingPan.set(false);
      }, 500);

      // Gespeicherte Werte zurücksetzen
      this.savedZoomLevel = null;
      this.savedPanOffset = null;
    }

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
    } else if (this.expandedBeforeFocus) {
      // Kein Filter aktiv: Gespeicherten expanded-Zustand wiederherstellen
      console.log('[exitFocusMode] restoring expandedBeforeFocus:', this.expandedBeforeFocus.size);
      this.expandedNodes.set(this.expandedBeforeFocus);
    }

    // Gespeicherten expanded-Zustand zurücksetzen
    this.expandedBeforeFocus = null;
    console.log('[exitFocusMode] DONE');
  }

  isInFocusMode(): boolean {
    return this.focusedNode() !== null;
  }

  isFocusedNode(node: Node): boolean {
    const focused = this.focusedNode();
    return focused !== null && focused.node.id === node.id;
  }

  // Multi-Fokus Hilfsmethoden
  isNodeInFocus(node: Node): boolean {
    return this.focusedNodes().some(f => f.node.id === node.id);
  }

  private toggleNodeFocus(node: Node, parent: Node, root: Node, level: number): void {
    const current = this.focusedNodes();
    const existingIndex = current.findIndex(f => f.node.id === node.id);

    if (existingIndex >= 0) {
      // Node entfernen
      this.focusedNodes.set(current.filter((_, i) => i !== existingIndex));
    } else {
      // Node hinzufügen
      this.focusedNodes.set([...current, { node, parent, root, level }]);
    }
  }

  private setFocusedNodeSingle(node: Node, parent: Node, root: Node, level: number): void {
    this.focusedNodes.set([{ node, parent, root, level }]);
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
    const selectedL2Ids = this.selectedL2NodeIds();

    // Level 0 (Root): Nie blurren
    if (numLevel === 0) return false;

    // L3+ mit offenem Info-Tooltip: Nie blurren (highlighted)
    const selectedInfo = this.selectedInfoNode();
    if (selectedInfo && node.id === selectedInfo.id) return false;

    // Hover-Pfad: Node und alle Vorfahren sind scharf
    if (this.isOnHoveredPath(node)) return false;

    // Direktes Kind des gehoverten Nodes: Auch scharf (Preview der Kinder)
    if (this.isDirectChildOfHovered(node)) return false;

    // Wenn über L1 gehovert wird: Alle Nachkommen dieses L1 sind scharf
    if (this.isDescendantOfHoveredL1(node)) return false;

    // Multi-Select Filter aktiv (L1-Kategorien und/oder L2-IDs)
    const hasL1Filter = activeCategories.size > 0;
    const hasL2Filter = selectedL2Ids.size > 0;

    if (hasL1Filter || hasL2Filter) {
      // Prüfe ob Node durch L2-Filter sichtbar ist
      if (hasL2Filter) {
        for (const l2Id of selectedL2Ids) {
          // L2 selbst: nie blurren
          if (node.id === l2Id) return false;

          // Pfad zum L2: nie blurren
          const pathToL2 = this.findPathToNode(this.rootNode(), l2Id);
          if (pathToL2 && pathToL2.includes(node.id)) return false;

          // Kinder des L2: nie blurren
          const l2Node = this.findNodeByIdRecursive(this.rootNode(), l2Id);
          if (l2Node && this.isDescendantOf(node, l2Node)) return false;
        }
      }

      // Prüfe ob Node durch L1-Kategorie-Filter sichtbar ist
      if (hasL1Filter) {
        const hasCategory = node.categoryIds.some(id => activeCategories.has(id));
        const hasMatchingChildren = this.hasAnyCategoryMatch(node, activeCategories);
        if (hasCategory || hasMatchingChildren) return false;
      }

      // Weder durch L1 noch durch L2 sichtbar: blurren
      return true;
    }

    // Im Multi-Fokus-Modus
    if (this.isInFocusMode()) {
      const focusedList = this.focusedNodes();
      if (focusedList.length === 0) return false;

      // Fokussierte Nodes: nie blurren
      if (this.isNodeInFocus(node)) return false;

      // Vorfahren eines fokussierten Nodes: nie blurren
      for (const f of focusedList) {
        const path = this.findPathToNode(this.rootNode(), f.node.id);
        if (path && path.includes(node.id)) return false;
      }

      // Direkte Kinder eines fokussierten Nodes: nie blurren
      for (const f of focusedList) {
        if (f.node.children?.some(c => c.id === node.id)) return false;
      }

      // Wenn Filter aktiv: Zusätzliche Prüfung
      if (activeCategories.size > 0) {
        const hasCategory = node.categoryIds.some(id => activeCategories.has(id));
        const hasMatchingChildren = this.hasAnyCategoryMatch(node, activeCategories);
        // Blur wenn keine passende Kategorie
        if (!hasCategory && !hasMatchingChildren) return true;
      }

      // Alle anderen: blurren
      return true;
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

  onNodeMouseEnter(event: MouseEvent, node: Node, level: number = 0) {
    // Pfad-Highlighting für Linien und Unblur
    this.hoveredPathNode.set(node);

    if (this.activeCategories().size === 0) {
      this.hoveredCategories.set(node.categoryIds);
    }

    // L3+ zeigt Tooltip nur per Click, nicht per Hover
    if (level >= 3 || !node.tooltip) return;

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
    // Tooltip-Position nur löschen wenn kein Info-Tooltip offen ist
    if (!this.selectedInfoNode()) {
      this.tooltipPosition.set(null);
    }
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

  // Prüft ob der gehoverte Node SELBST ein L1 ist und der aktuelle Node ein Nachkomme davon ist
  isDescendantOfHoveredL1(node: Node): boolean {
    const hovered = this.hoveredPathNode();
    if (!hovered) return false;

    // Finde Pfad zum gehoverten Node
    const pathToHovered = this.findPathToNode(this.rootNode(), hovered.id);
    if (!pathToHovered) return false;

    // Der gehoverte Node muss SELBST L1 sein (Pfadlänge = 2: [Root, L1])
    if (pathToHovered.length !== 2) return false;

    const l1Id = hovered.id;

    // Prüfe ob L1 expandiert ist
    if (!this.expandedNodes().has(l1Id)) return false;

    // Finde Pfad zum aktuellen Node
    const pathToNode = this.findPathToNode(this.rootNode(), node.id);
    if (!pathToNode || pathToNode.length < 2) return false;

    // Prüfe ob der Node ein Nachkomme dieses L1 ist
    return pathToNode[1] === l1Id;
  }

  // --- Fokus-Modus Layout-Berechnung ---

  private calculateFocusModeLayout(): void {
    const focused = this.focusedNodes();
    if (focused.length === 0) return;

    // Zoom/Pan speichern beim ersten Fokussieren
    if (this.savedZoomLevel === null) {
      this.savedZoomLevel = this.zoomLevel();
      this.savedPanOffset = { ...this.panOffset() };
    }

    const positions = new Map<string, { x: number; y: number }>();
    const rootNode = this.rootNode();
    const focusInfo = focused[0];

    // Kinder-Radius berechnen (bestimmt den Mindestabstand L1↔L2)
    const childCount = focusInfo.node.children?.length || 0;
    const CHILD_RADIUS = this.calculateChildRadius(childCount);

    // Abstände
    const L1_TO_FOCUS_SPACING = Math.max(400, CHILD_RADIUS + 180);
    const L0_TO_L1_SPACING = 350;

    // L0 Position (links vom Fokus)
    const l0X = -(L0_TO_L1_SPACING + L1_TO_FOCUS_SPACING);
    positions.set(rootNode.id, { x: l0X, y: 0 });

    // Fokussiertes Element in der Mitte (x=0)
    const focusX = 0;
    const focusY = 0;
    positions.set(focusInfo.node.id, { x: focusX, y: focusY });

    // Eltern-Kette nach links
    const path = this.findPathToNode(rootNode, focusInfo.node.id);

    if (focusInfo.level === 1) {
      // L1 fokussiert: L1 ist in der Mitte, L0 links davon
    } else if (focusInfo.level === 2 && path && path.length >= 2) {
      // L2 fokussiert: L1 zwischen L0 und L2
      positions.set(path[1], { x: -L1_TO_FOCUS_SPACING, y: focusY });
    } else if (focusInfo.level >= 3 && path) {
      // L3+ fokussiert
      if (path.length >= 2) {
        positions.set(path[1], { x: l0X + L0_TO_L1_SPACING, y: 0 });
      }
      if (path.length >= 3) {
        positions.set(path[2], { x: -L1_TO_FOCUS_SPACING, y: focusY });
      }
    }

    // Kinder-Positionen VORHER berechnen (für Kollisionsvermeidung)
    const focusChildIds = new Set<string>();
    if (focusInfo.node.children && focusInfo.node.children.length > 0 &&
        this.expandedNodes().has(focusInfo.node.id)) {
      const children = focusInfo.node.children;
      const count = children.length;

      // Kinder-Positionen berechnen (gleiche Logik wie arrangeChildrenCircularFocusMode)
      if (count <= 5) {
        // Halbkreis RECHTS
        const startAngle = -Math.PI / 2;
        const endAngle = Math.PI / 2;
        const angleStep = count > 1 ? (endAngle - startAngle) / (count - 1) : 0;

        children.forEach((child, index) => {
          const angle = count === 1 ? 0 : startAngle + index * angleStep;
          positions.set(child.id, {
            x: focusX + Math.cos(angle) * CHILD_RADIUS,
            y: focusY + Math.sin(angle) * CHILD_RADIUS
          });
          focusChildIds.add(child.id);
        });
      } else {
        // Voller Kreis mit Lücke LINKS (160°-200°)
        const GAP_START_DEG = 160;
        const GAP_END_DEG = 200;
        const gapStartRad = GAP_START_DEG * Math.PI / 180;
        const gapSizeRad = (GAP_END_DEG - GAP_START_DEG) * Math.PI / 180;
        const availableAngle = 2 * Math.PI - gapSizeRad;
        const angleStep = availableAngle / count;

        children.forEach((child, index) => {
          let angle = index * angleStep;
          if (angle >= gapStartRad) {
            angle += gapSizeRad;
          }
          positions.set(child.id, {
            x: focusX + Math.cos(angle) * CHILD_RADIUS,
            y: focusY + Math.sin(angle) * CHILD_RADIUS
          });
          focusChildIds.add(child.id);
        });
      }
    }

    console.log('[calculateFocusModeLayout] positions (inkl. Kinder):', positions.size);

    // Positionen anwenden MIT Kollisionsvermeidung für andere Nodes
    // Jetzt sind auch die Kinder-Positionen bekannt!
    console.log('[calculateFocusModeLayout] applying with collision avoidance');
    this.forceLayout.applyFocusModeWithCollisionAvoidance(positions, focusChildIds);
    console.log('[calculateFocusModeLayout] collision avoidance applied');

    // Auto-Zoom
    this.applyInitialFocusZoom(l0X, CHILD_RADIUS);
    console.log('[calculateFocusModeLayout] DONE');
  }

  // Einmaliger Auto-Zoom für Fokus-Modus
  private applyInitialFocusZoom(l0X: number, childRadius: number): void {
    const leftEdge = l0X - 80;
    const rightEdge = childRadius + 100;
    const totalWidth = rightEdge - leftEdge;
    const viewportWidth = window.innerWidth * 0.85;

    let newZoom = viewportWidth / totalWidth;
    newZoom = Math.max(0.25, Math.min(1.0, newZoom));

    const centerX = (leftEdge + rightEdge) / 2;
    const panX = -centerX * newZoom;

    this.zoomLevel.set(newZoom);
    this.panOffset.set({ x: panX, y: 0 });
  }

  // Berechnet den Radius für Kinder basierend auf der Anzahl
  private calculateChildRadius(childCount: number): number {
    if (childCount === 0) return 100;
    if (childCount <= 5) {
      return 140 + childCount * 30;
    } else {
      const minCircumference = childCount * 90;
      return Math.max(200, minCircumference / (2 * Math.PI));
    }
  }

  // Prüft ob eine Verbindungslinie hervorgehoben werden soll (von Parent zu Child)
  isLineOnHoveredPath(parentNode: Node, childNode: Node, level: number): boolean {
    const hovered = this.hoveredPathNode();
    if (!hovered) return false;

    const root = this.rootNode();

    // Wenn L0 gehovert wird: ALLE sichtbaren Linien hervorheben
    // (CSS filtert geblurrte Linien aus)
    if (hovered.id === root.id) {
      return true;
    }

    // Wenn der gehoverte Node selbst der Parent ist, alle Linien zu Kindern hervorheben
    // Gilt für L1→L2
    if (hovered.id === parentNode.id && level === 1) {
      return true;
    }

    // Finde den Pfad vom Root zum gehoverten Node
    const pathToHovered = this.findPathToNode(root, hovered.id);
    if (!pathToHovered) return false;

    // Prüfe ob sowohl Parent als auch Child auf dem Pfad liegen
    const parentOnPath = pathToHovered.includes(parentNode.id);
    const childOnPath = pathToHovered.includes(childNode.id);

    return parentOnPath && childOnPath;
  }
}
