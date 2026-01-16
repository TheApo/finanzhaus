import { Injectable, signal, Signal, inject, DestroyRef } from '@angular/core';
import {
  forceSimulation,
  forceCollide,
  Simulation,
  SimulationNodeDatum
} from 'd3-force';
import { Node } from './data.service';

/**
 * Intelligentes Sektor-basiertes Layout:
 * 1. Subtree-Analyse: Berechnet Gewicht jedes Branches
 * 2. Dynamische Sektorverteilung: Branches mit mehr Kindern bekommen mehr Platz
 * 3. Rekursive Sektor-Vererbung: Kinder bleiben im Sektor des Parents
 * 4. Force-Simulation mit Sektor-Constraints: Nodes verlassen ihren Sektor nicht
 *
 * Vorteile:
 * - Keine Linienkreuzungen zwischen verschiedenen Branches
 * - Übersichtliche, logische Struktur
 * - Skaliert mit beliebig vielen Kindern
 */

const CONFIG = {
  // Basis-Abstände pro Level
  BASE_DISTANCES: {
    1: 240,    // Level 1 vom Zentrum (war 380)
    2: 180,    // Level 2 vom Level 1 (war 260)
    3: 140,    // Level 3 (war 200)
    4: 120,    // Level 4+ (war 170)
  } as Record<number, number>,

  // Zusätzlicher Abstand pro Kind (dynamisch)
  DISTANCE_PER_CHILD: 12,

  // Minimaler Winkel zwischen Geschwistern (in Grad)
  MIN_ANGLE_BETWEEN_SIBLINGS: 18,

  // Kollisions-Radien - berücksichtigt Node + Label (Label ist ca. 80-120px breit)
  COLLISION_RADII: {
    0: 80,     // Level 0
    1: 90,     // Level 1 (größere Labels)
    2: 85,     // Level 2 (mit Label darunter)
    3: 80,     // Level 3
    4: 75,     // Level 4+
  } as Record<number, number>,

  // Konzentrische Ringe: Ab dieser Kinderzahl werden 2 Ringe verwendet
  RING_THRESHOLD: 6,
  RING_DISTANCE_FACTOR: 0.65, // Innerer Ring ist X% des äußeren

  // Simulation
  ANCHOR_STRENGTH: 0.5,
  SECTOR_CONSTRAINT_STRENGTH: 0.9,
  COLLISION_STRENGTH: 1,
  ALPHA_DECAY: 0.03,
  VELOCITY_DECAY: 0.5
};

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  level: number;
  parentId: string | null;
  children: LayoutNode[];
  nodeRef: Node;

  // Subtree-Analyse
  descendantCount: number;
  maxDepth: number;
  weight: number;

  // Sektor-Zuweisung (in Radians)
  sectorStart: number;
  sectorEnd: number;
  sectorCenter: number;

  // Ideal-Position
  idealX: number;
  idealY: number;
  idealAngle: number;
  idealRadius: number;

  // Ring (bei konzentrischen Ringen)
  ring: number; // 0 = normal/äußerer Ring, 1 = innerer Ring
}

@Injectable({
  providedIn: 'root'
})
export class ForceLayoutService {
  private destroyRef = inject(DestroyRef);
  private simulation: Simulation<LayoutNode, never> | null = null;
  private layoutNodes: LayoutNode[] = [];
  private nodeMap = new Map<string, LayoutNode>();

  // Speichert vom Benutzer verschobene Positionen (überleben updateNodes)
  private userPositions = new Map<string, { x: number; y: number }>();

  private _nodePositions = signal<Map<string, { x: number; y: number }>>(new Map());
  private _isSettling = signal<boolean>(false);

  nodePositions: Signal<Map<string, { x: number; y: number }>> = this._nodePositions.asReadonly();
  isSettling: Signal<boolean> = this._isSettling.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.destroy());
  }

  initSimulation(rootNode: Node, expandedIds: Set<string>): void {
    this.destroy();
    this.buildLayoutTree(rootNode, expandedIds);
    this.analyzeSubtrees();
    this.assignSectors();
    this.calculateIdealPositions();
    this.initializeActualPositions();
    this.startSimulation();
  }

  updateNodes(rootNode: Node, expandedIds: Set<string>): void {
    if (!this.simulation) {
      this.initSimulation(rootNode, expandedIds);
      return;
    }

    // Alte Positionen speichern (für Nodes die nicht in userPositions sind)
    const oldPositions = new Map<string, { x: number; y: number }>();
    for (const node of this.layoutNodes) {
      if (node.x !== undefined && node.y !== undefined) {
        oldPositions.set(node.id, { x: node.x, y: node.y });
      }
    }

    // Neu bauen
    this.buildLayoutTree(rootNode, expandedIds);
    this.analyzeSubtrees();
    this.assignSectors();
    this.calculateIdealPositions();

    // Positionen wiederherstellen: userPositions > oldPositions > idealPosition
    for (const node of this.layoutNodes) {
      // Nur L0 ist fixiert
      if (node.level === 0) {
        continue; // Wird von fixLevel0Node gesetzt
      }

      // 1. Priorität: Vom Benutzer verschobene Position
      const userPos = this.userPositions.get(node.id);
      if (userPos) {
        node.x = userPos.x;
        node.y = userPos.y;
        node.idealX = userPos.x;
        node.idealY = userPos.y;
        continue;
      }

      // 2. Priorität: Alte Position (vor diesem Update)
      const oldPos = oldPositions.get(node.id);
      if (oldPos) {
        node.x = oldPos.x;
        node.y = oldPos.y;
      } else {
        // 3. Neue Nodes: Ideal-Position verwenden
        node.x = node.idealX;
        node.y = node.idealY;
      }
    }

    // L0 und L1 Nodes fixieren
    this.fixLevel0Node();

    // Simulation aktualisieren
    this.simulation.nodes(this.layoutNodes);
    this.simulation.force('anchor', this.createAnchorForce());
    this.simulation.force('sectorConstraint', this.createSectorConstraintForce());
    this.simulation.force('collide', this.createCollideForce());

    this._isSettling.set(true);
    this.simulation.alpha(0.5).restart();
  }

  wobble(): void {
    if (!this.simulation) return;

    for (const node of this.layoutNodes) {
      if (node.level !== 0 && node.x !== undefined && node.y !== undefined) {
        // Wobble nur innerhalb des Sektors
        const angleRange = (node.sectorEnd - node.sectorStart) * 0.1;
        node.vx = (node.vx || 0) + (Math.random() - 0.5) * 8;
        node.vy = (node.vy || 0) + (Math.random() - 0.5) * 8;
      }
    }

    this._isSettling.set(true);
    this.simulation.alpha(0.3).restart();
  }

  destroy(): void {
    if (this.simulation) {
      this.simulation.stop();
      this.simulation = null;
    }
    this.layoutNodes = [];
    this.nodeMap.clear();
    // userPositions werden NICHT gelöscht - sie überleben einen Destroy/Init-Zyklus
  }

  /**
   * Setzt alle vom Benutzer verschobenen Positionen zurück.
   * Wird beim kompletten Reset aufgerufen.
   */
  resetUserPositions(): void {
    this.userPositions.clear();
  }

  getPosition(nodeId: string): { x: number; y: number } | undefined {
    return this._nodePositions().get(nodeId);
  }

  /**
   * Setzt die Position eines Nodes während des Drags.
   * Der Node und alle seine Nachkommen werden relativ verschoben.
   */
  setNodePosition(nodeId: string, x: number, y: number): void {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.level === 0) return; // Nur L0 nicht verschiebbar

    const dx = x - (node.x || 0);
    const dy = y - (node.y || 0);

    // Node und alle Nachkommen verschieben
    this.moveNodeAndDescendants(node, dx, dy);
    this.updatePositionSignal();
  }

  private moveNodeAndDescendants(node: LayoutNode, dx: number, dy: number): void {
    node.x = (node.x || 0) + dx;
    node.y = (node.y || 0) + dy;

    for (const child of node.children) {
      this.moveNodeAndDescendants(child, dx, dy);
    }
  }

  /**
   * Fixiert einen Node an seiner aktuellen Position (für Drag).
   * Stoppt die Simulation damit der Drag sofort sichtbar ist.
   */
  fixNode(nodeId: string): void {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.level === 0) return; // Nur L0 nicht verschiebbar

    node.fx = node.x;
    node.fy = node.y;

    // Simulation stoppen damit Drag sofort sichtbar ist
    if (this.simulation) {
      this.simulation.stop();
      this._isSettling.set(false);
    }
  }

  /**
   * Löst die Fixierung eines Nodes OHNE zu speichern (für abgebrochenen Drag/Klick).
   */
  unfixNode(nodeId: string): void {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.level === 0) return; // Nur L0 nicht verschiebbar

    node.fx = undefined;
    node.fy = undefined;
  }

  /**
   * Löst die Fixierung eines Nodes (nach erfolgreichem Drag).
   * Speichert die Position dauerhaft und startet die Simulation neu.
   */
  releaseNode(nodeId: string): void {
    const node = this.nodeMap.get(nodeId);
    if (!node || node.level === 0) return; // Nur L0 nicht verschiebbar

    // Fixierung lösen
    node.fx = undefined;
    node.fy = undefined;

    // Position dauerhaft speichern (überlebt updateNodes)
    const currentX = node.x || 0;
    const currentY = node.y || 0;
    this.userPositions.set(nodeId, { x: currentX, y: currentY });

    // Ideale Position auf aktuelle Position setzen
    node.idealX = currentX;
    node.idealY = currentY;

    // Auch für alle Nachkommen speichern
    this.saveDescendantPositions(node);

    // Simulation neu starten um Kollisionen zu beheben
    if (this.simulation) {
      this._isSettling.set(true);
      this.simulation.alpha(0.3).restart();
    }
  }

  /**
   * Speichert die Positionen aller Nachkommen eines Nodes.
   */
  private saveDescendantPositions(node: LayoutNode): void {
    for (const child of node.children) {
      const childX = child.x || 0;
      const childY = child.y || 0;
      this.userPositions.set(child.id, { x: childX, y: childY });
      child.idealX = childX;
      child.idealY = childY;
      this.saveDescendantPositions(child);
    }
  }

  private updateIdealPositionsFromCurrent(node: LayoutNode): void {
    for (const child of node.children) {
      child.idealX = child.x || 0;
      child.idealY = child.y || 0;
      this.updateIdealPositionsFromCurrent(child);
    }
  }

  /**
   * Prüft ob ein Node verschiebbar ist (Level 2+).
   */
  isDraggable(nodeId: string): boolean {
    const node = this.nodeMap.get(nodeId);
    return node !== undefined && node.level >= 2;
  }

  // ============================================================
  // PHASE 1: Baum aufbauen
  // ============================================================

  private buildLayoutTree(rootNode: Node, expandedIds: Set<string>): void {
    this.layoutNodes = [];
    this.nodeMap.clear();

    const buildNode = (node: Node, level: number, parentId: string | null): LayoutNode => {
      const layoutNode: LayoutNode = {
        id: node.id,
        level,
        parentId,
        children: [],
        nodeRef: node,
        // Werden später berechnet
        descendantCount: 0,
        maxDepth: 0,
        weight: 0,
        sectorStart: 0,
        sectorEnd: 2 * Math.PI,
        sectorCenter: 0,
        idealX: 0,
        idealY: 0,
        idealAngle: 0,
        idealRadius: 0,
        ring: 0,
        x: 0,
        y: 0
      };

      this.layoutNodes.push(layoutNode);
      this.nodeMap.set(node.id, layoutNode);

      const shouldShowChildren = level < 1 || expandedIds.has(node.id);
      if (shouldShowChildren && node.children) {
        for (const child of node.children) {
          const childNode = buildNode(child, level + 1, node.id);
          layoutNode.children.push(childNode);
        }
      }

      return layoutNode;
    };

    buildNode(rootNode, 0, null);
  }

  // ============================================================
  // PHASE 2: Subtree-Analyse
  // ============================================================

  private analyzeSubtrees(): void {
    const analyze = (node: LayoutNode): { descendants: number; depth: number } => {
      if (node.children.length === 0) {
        node.descendantCount = 0;
        node.maxDepth = 0;
        node.weight = 1;
        return { descendants: 0, depth: 0 };
      }

      let totalDescendants = 0;
      let maxChildDepth = 0;

      for (const child of node.children) {
        const result = analyze(child);
        totalDescendants += 1 + result.descendants;
        maxChildDepth = Math.max(maxChildDepth, result.depth + 1);
      }

      node.descendantCount = totalDescendants;
      node.maxDepth = maxChildDepth;
      // Gewicht basiert auf Nachkommen + Tiefe
      node.weight = totalDescendants + (maxChildDepth * 2) + 1;

      return { descendants: totalDescendants, depth: maxChildDepth };
    };

    const root = this.layoutNodes.find(n => n.level === 0);
    if (root) {
      analyze(root);
    }
  }

  // ============================================================
  // PHASE 3: Sektor-Zuweisung
  // ============================================================

  private assignSectors(): void {
    const root = this.layoutNodes.find(n => n.level === 0);
    if (!root) return;

    // Root hat den gesamten Kreis
    root.sectorStart = 0;
    root.sectorEnd = 2 * Math.PI;
    root.sectorCenter = 0;

    // Level 1: FESTE gleichmäßige Verteilung (unabhängig von Kindern)
    // Das stellt sicher, dass L1 Nodes sich nie bewegen
    this.assignLevel1Sectors(root);

    // Level 2+: Dynamische Sektorverteilung basierend auf Gewicht
    for (const l1Node of root.children) {
      this.assignChildSectors(l1Node);
    }
  }

  /**
   * Level 1 Nodes bekommen feste, gleichmäßige Sektoren.
   * Diese ändern sich NIE, egal welche Kinder expandiert sind.
   */
  private assignLevel1Sectors(root: LayoutNode): void {
    const children = root.children;
    if (children.length === 0) return;

    const anglePerChild = (2 * Math.PI) / children.length;
    const startAngle = -Math.PI / 2; // Start oben

    children.forEach((child, index) => {
      child.sectorStart = startAngle + index * anglePerChild;
      child.sectorEnd = startAngle + (index + 1) * anglePerChild;
      child.sectorCenter = startAngle + (index + 0.5) * anglePerChild;
    });
  }

  private assignChildSectors(parent: LayoutNode): void {
    const children = parent.children;
    if (children.length === 0) return;

    // Gesamtgewicht berechnen
    const totalWeight = children.reduce((sum, child) => sum + child.weight, 0);

    // Verfügbarer Winkelbereich (mit Padding)
    const availableSector = parent.sectorEnd - parent.sectorStart;
    let availableAngle = availableSector * 0.9;

    // Minimaler Winkel pro Kind
    const minAnglePerChild = (CONFIG.MIN_ANGLE_BETWEEN_SIBLINGS * Math.PI) / 180;
    const minTotalAngle = minAnglePerChild * children.length;

    // Wenn verfügbarer Winkel zu klein, erweitern
    if (availableAngle < minTotalAngle) {
      availableAngle = minTotalAngle;
    }

    // Sektoren zuweisen (zentriert im Parent-Sektor)
    const padding = (availableSector - availableAngle) / 2;
    let currentAngle = parent.sectorStart + padding;

    for (const child of children) {
      const childAngle = (child.weight / totalWeight) * availableAngle;
      const actualAngle = Math.max(childAngle, minAnglePerChild);

      child.sectorStart = currentAngle;
      child.sectorEnd = currentAngle + actualAngle;
      child.sectorCenter = currentAngle + actualAngle / 2;

      currentAngle += actualAngle;

      // Rekursiv für Kinder
      this.assignChildSectors(child);
    }
  }

  // ============================================================
  // PHASE 4: Ideale Positionen berechnen
  // ============================================================

  private calculateIdealPositions(): void {
    const root = this.layoutNodes.find(n => n.level === 0);
    if (!root) return;

    root.idealX = 0;
    root.idealY = 0;
    root.idealAngle = 0;
    root.idealRadius = 0;

    this.calculateChildPositions(root);
  }

  private calculateChildPositions(parent: LayoutNode): void {
    const children = parent.children;
    if (children.length === 0) return;

    const level = parent.level + 1;
    const baseDistance = CONFIG.BASE_DISTANCES[Math.min(level, 4)] || CONFIG.BASE_DISTANCES[4];

    // Dynamischer Abstand basierend auf Kinderzahl
    const dynamicDistance = baseDistance + (children.length * CONFIG.DISTANCE_PER_CHILD);

    // Konzentrische Ringe bei vielen Kindern
    const useRings = children.length >= CONFIG.RING_THRESHOLD;

    if (useRings) {
      this.positionChildrenInRings(parent, children, dynamicDistance);
    } else {
      this.positionChildrenSingleRing(parent, children, dynamicDistance);
    }

    // Rekursiv für alle Kinder
    for (const child of children) {
      this.calculateChildPositions(child);
    }
  }

  private positionChildrenSingleRing(parent: LayoutNode, children: LayoutNode[], distance: number): void {
    children.forEach((child, index) => {
      // Position im Sektor
      child.idealAngle = child.sectorCenter;
      child.idealRadius = distance;
      child.ring = 0;

      // Absolute Position berechnen
      child.idealX = parent.idealX + Math.cos(child.idealAngle) * distance;
      child.idealY = parent.idealY + Math.sin(child.idealAngle) * distance;
    });
  }

  private positionChildrenInRings(parent: LayoutNode, children: LayoutNode[], outerDistance: number): void {
    const innerDistance = outerDistance * CONFIG.RING_DISTANCE_FACTOR;

    // Sortiere Kinder nach Gewicht (große Subtrees außen)
    const sortedChildren = [...children].sort((a, b) => b.weight - a.weight);

    // Verteile auf Ringe: Schwere außen, leichte innen
    const outerRing: LayoutNode[] = [];
    const innerRing: LayoutNode[] = [];

    sortedChildren.forEach((child, index) => {
      if (index % 2 === 0) {
        outerRing.push(child);
      } else {
        innerRing.push(child);
      }
    });

    // Positioniere äußeren Ring
    this.positionRingChildren(parent, outerRing, outerDistance, 0);

    // Positioniere inneren Ring (versetzt)
    this.positionRingChildren(parent, innerRing, innerDistance, 1);
  }

  private positionRingChildren(parent: LayoutNode, ringChildren: LayoutNode[], distance: number, ringIndex: number): void {
    if (ringChildren.length === 0) return;

    // Sortiere nach Sektor-Center um die Reihenfolge beizubehalten
    ringChildren.sort((a, b) => a.sectorCenter - b.sectorCenter);

    ringChildren.forEach(child => {
      child.idealAngle = child.sectorCenter;
      child.idealRadius = distance;
      child.ring = ringIndex;

      child.idealX = parent.idealX + Math.cos(child.idealAngle) * distance;
      child.idealY = parent.idealY + Math.sin(child.idealAngle) * distance;
    });
  }

  // ============================================================
  // PHASE 5: Simulation
  // ============================================================

  private initializeActualPositions(): void {
    for (const node of this.layoutNodes) {
      node.x = node.idealX;
      node.y = node.idealY;
    }
  }

  /**
   * Fixiert nur L0 Node an seiner idealen Position.
   * L1+ können vom Benutzer verschoben werden.
   */
  private fixLevel0Node(): void {
    for (const node of this.layoutNodes) {
      if (node.level === 0) {
        node.fx = node.idealX;
        node.fy = node.idealY;
        node.x = node.idealX;
        node.y = node.idealY;
      }
    }
  }

  private startSimulation(): void {
    // L0 und L1 Nodes fixieren - sie bewegen sich nie
    this.fixLevel0Node();

    this.simulation = forceSimulation<LayoutNode>(this.layoutNodes)
      .alphaDecay(CONFIG.ALPHA_DECAY)
      .velocityDecay(CONFIG.VELOCITY_DECAY)
      // Sektor-Constraint: Hält Nodes in ihrem Sektor
      .force('sectorConstraint', this.createSectorConstraintForce())
      // Kollisionsvermeidung
      .force('collide', this.createCollideForce())
      // Anker-Kraft: Zieht Nodes zu ihrer Ideal-Position
      .force('anchor', this.createAnchorForce());

    this._isSettling.set(true);

    this.simulation.on('tick', () => {
      this.updatePositionSignal();
    });

    this.simulation.on('end', () => {
      this._isSettling.set(false);
    });

    this.simulation.alpha(1).restart();
  }

  /**
   * Kollisions-Kraft: Verhindert Überlappungen
   */
  private createCollideForce() {
    return forceCollide<LayoutNode>()
      .radius(d => CONFIG.COLLISION_RADII[Math.min(d.level, 4)] || CONFIG.COLLISION_RADII[4])
      .strength(CONFIG.COLLISION_STRENGTH)
      .iterations(3);
  }

  /**
   * Anker-Kraft: Zieht Nodes zu ihrer idealen Position
   */
  private createAnchorForce() {
    const nodes = this.layoutNodes;
    const strength = CONFIG.ANCHOR_STRENGTH;

    return () => {
      for (const node of nodes) {
        if (node.level === 0) continue;
        if (node.x === undefined || node.y === undefined) continue;

        const dx = node.idealX - node.x;
        const dy = node.idealY - node.y;

        node.vx = (node.vx || 0) + dx * strength;
        node.vy = (node.vy || 0) + dy * strength;
      }
    };
  }

  /**
   * Sektor-Constraint: Hält Nodes innerhalb ihres zugewiesenen Sektors
   * Verhindert Linienkreuzungen zwischen verschiedenen Branches
   */
  private createSectorConstraintForce() {
    const nodes = this.layoutNodes;
    const nodeMap = this.nodeMap;
    const strength = CONFIG.SECTOR_CONSTRAINT_STRENGTH;

    return () => {
      for (const node of nodes) {
        if (node.level === 0) continue;
        if (node.x === undefined || node.y === undefined) continue;

        const parent = node.parentId ? nodeMap.get(node.parentId) : null;
        if (!parent || parent.x === undefined || parent.y === undefined) continue;

        // Relative Position zum Parent
        const relX = node.x - parent.x;
        const relY = node.y - parent.y;
        const currentAngle = Math.atan2(relY, relX);
        const currentRadius = Math.sqrt(relX * relX + relY * relY);

        // Prüfe ob Node außerhalb seines Sektors ist
        let targetAngle = currentAngle;

        // Normalisiere Winkel für Vergleich
        const normalizedCurrent = this.normalizeAngle(currentAngle);
        const normalizedStart = this.normalizeAngle(node.sectorStart);
        const normalizedEnd = this.normalizeAngle(node.sectorEnd);

        // Prüfe ob außerhalb des Sektors
        if (!this.isAngleInSector(normalizedCurrent, normalizedStart, normalizedEnd)) {
          // Finde nächsten Punkt im Sektor
          const distToStart = this.angleDifference(normalizedCurrent, normalizedStart);
          const distToEnd = this.angleDifference(normalizedCurrent, normalizedEnd);

          if (distToStart < distToEnd) {
            targetAngle = node.sectorStart;
          } else {
            targetAngle = node.sectorEnd;
          }

          // Kraft Richtung Sektor-Grenze
          const targetX = parent.x + Math.cos(targetAngle) * currentRadius;
          const targetY = parent.y + Math.sin(targetAngle) * currentRadius;

          node.vx = (node.vx || 0) + (targetX - node.x) * strength;
          node.vy = (node.vy || 0) + (targetY - node.y) * strength;
        }
      }
    };
  }

  private normalizeAngle(angle: number): number {
    while (angle < 0) angle += 2 * Math.PI;
    while (angle >= 2 * Math.PI) angle -= 2 * Math.PI;
    return angle;
  }

  private isAngleInSector(angle: number, start: number, end: number): boolean {
    // Handle wrap-around
    if (start <= end) {
      return angle >= start && angle <= end;
    } else {
      return angle >= start || angle <= end;
    }
  }

  private angleDifference(a: number, b: number): number {
    let diff = Math.abs(a - b);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    return diff;
  }

  private updatePositionSignal(): void {
    const positions = new Map<string, { x: number; y: number }>();

    for (const node of this.layoutNodes) {
      if (node.x !== undefined && node.y !== undefined) {
        positions.set(node.id, {
          x: Math.round(node.x),
          y: Math.round(node.y)
        });
      }
    }

    this._nodePositions.set(positions);
  }
}
