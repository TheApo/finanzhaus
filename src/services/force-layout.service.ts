import { Injectable, signal, Signal, inject, DestroyRef } from '@angular/core';
import {
  forceSimulation,
  forceCollide,
  Simulation,
  SimulationNodeDatum
} from 'd3-force';
import { Node } from './data.service';

/**
 * Hybrides Layout:
 * 1. Deterministische Basis-Positionen (für Hierarchie-Richtung)
 * 2. Force-Simulation NUR für Kollisionsvermeidung
 */

const CONFIG = {
  // Abstände pro Level (großzügig - Zoom ist möglich)
  LEVEL_DISTANCES: {
    1: 380,    // Level 1 vom Zentrum
    2: 280,    // Level 2 vom Level 1
    3: 220,    // Level 3
    4: 180,    // Level 4+
  } as Record<number, number>,

  // Kollisions-Radien (größer = mehr Abstand untereinander)
  COLLISION_RADII: {
    0: 90,     // Level 0
    1: 85,     // Level 1
    2: 75,     // Level 2
    3: 65,     // Level 3+
  } as Record<number, number>,

  // Fächer-Winkel pro Level
  SECTOR_CONFIG: {
    2: { base: 60, min: 30, max: 180 },   // Level 2 (Kinder von Level 1)
    3: { base: 30, min: 15, max: 90 },    // Level 3+
  } as Record<number, { base: number; min: number; max: number }>,

  // Simulation
  ANCHOR_STRENGTH: 0.3,  // Wie stark Nodes zu ihrer Ideal-Position gezogen werden
  COLLISION_STRENGTH: 1,
  ALPHA_DECAY: 0.02,
  VELOCITY_DECAY: 0.4
};

interface LayoutNode extends SimulationNodeDatum {
  id: string;
  level: number;
  parentId: string | null;
  children: LayoutNode[];
  nodeRef: Node;
  // Ideal-Position (deterministisch berechnet)
  idealX: number;
  idealY: number;
  idealAngle: number;
}

@Injectable({
  providedIn: 'root'
})
export class ForceLayoutService {
  private destroyRef = inject(DestroyRef);
  private simulation: Simulation<LayoutNode, never> | null = null;
  private layoutNodes: LayoutNode[] = [];
  private nodeMap = new Map<string, LayoutNode>();

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
    this.calculateIdealPositions();
    this.initializeActualPositions();
    this.startSimulation();
  }

  updateNodes(rootNode: Node, expandedIds: Set<string>): void {
    if (!this.simulation) {
      this.initSimulation(rootNode, expandedIds);
      return;
    }

    // Alte Positionen speichern
    const oldPositions = new Map<string, { x: number; y: number }>();
    for (const node of this.layoutNodes) {
      if (node.x !== undefined && node.y !== undefined) {
        oldPositions.set(node.id, { x: node.x, y: node.y });
      }
    }

    // Neu bauen
    this.buildLayoutTree(rootNode, expandedIds);
    this.calculateIdealPositions();

    // Alte Positionen wiederherstellen oder Ideal-Position nutzen
    for (const node of this.layoutNodes) {
      const oldPos = oldPositions.get(node.id);
      if (oldPos) {
        node.x = oldPos.x;
        node.y = oldPos.y;
      } else {
        node.x = node.idealX;
        node.y = node.idealY;
      }
    }

    // Root fixieren
    const root = this.layoutNodes.find(n => n.level === 0);
    if (root) {
      root.fx = 0;
      root.fy = 0;
    }

    // Simulation aktualisieren
    this.simulation.nodes(this.layoutNodes);
    this.simulation.force('anchor', this.createAnchorForce());
    this.simulation.force('collide', this.createCollideForce());

    this._isSettling.set(true);
    this.simulation.alpha(0.5).restart();
  }

  wobble(): void {
    if (!this.simulation) return;

    for (const node of this.layoutNodes) {
      if (node.level !== 0 && node.x !== undefined && node.y !== undefined) {
        node.vx = (node.vx || 0) + (Math.random() - 0.5) * 10;
        node.vy = (node.vy || 0) + (Math.random() - 0.5) * 10;
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
  }

  getPosition(nodeId: string): { x: number; y: number } | undefined {
    return this._nodePositions().get(nodeId);
  }

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
        idealX: 0,
        idealY: 0,
        idealAngle: 0,
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

  /**
   * Berechnet die IDEALEN Positionen (deterministisch, hierarchisch)
   */
  private calculateIdealPositions(): void {
    const root = this.layoutNodes.find(n => n.level === 0);
    if (!root) return;

    root.idealX = 0;
    root.idealY = 0;
    root.idealAngle = 0;

    // Level 1: Gleichmäßig im Kreis
    const level1 = root.children;
    if (level1.length > 0) {
      const angleStep = (2 * Math.PI) / level1.length;
      const distance = CONFIG.LEVEL_DISTANCES[1];

      level1.forEach((child, index) => {
        const angle = -Math.PI / 2 + index * angleStep;
        child.idealX = Math.cos(angle) * distance;
        child.idealY = Math.sin(angle) * distance;
        child.idealAngle = angle;
      });
    }

    // Level 2+: Rekursiv nach außen
    for (const l1 of root.children) {
      this.calculateChildrenIdealPositions(l1);
    }
  }

  private calculateChildrenIdealPositions(parent: LayoutNode): void {
    const children = parent.children;
    if (children.length === 0) return;

    const level = parent.level + 1;
    const distance = CONFIG.LEVEL_DISTANCES[Math.min(level, 4)] || 110;
    const parentAngle = parent.idealAngle;

    // Level-spezifische Fächer-Konfiguration
    const sectorConfig = CONFIG.SECTOR_CONFIG[Math.min(level, 3)] || CONFIG.SECTOR_CONFIG[3];

    // Dynamischer Sektor basierend auf Kinderzahl
    const anglePerChild = Math.max(
      sectorConfig.min,
      sectorConfig.base / Math.pow(children.length, 0.3)
    );
    const totalSector = Math.min(
      anglePerChild * children.length,
      sectorConfig.max
    ) * (Math.PI / 180);

    const startAngle = parentAngle - totalSector / 2;

    children.forEach((child, index) => {
      let childAngle: number;

      if (children.length === 1) {
        childAngle = parentAngle;
      } else {
        const step = totalSector / (children.length - 1);
        childAngle = startAngle + index * step;
      }

      child.idealX = parent.idealX + Math.cos(childAngle) * distance;
      child.idealY = parent.idealY + Math.sin(childAngle) * distance;
      child.idealAngle = childAngle;

      this.calculateChildrenIdealPositions(child);
    });
  }

  private initializeActualPositions(): void {
    for (const node of this.layoutNodes) {
      node.x = node.idealX;
      node.y = node.idealY;
    }
  }

  private startSimulation(): void {
    // Root fixieren
    const root = this.layoutNodes.find(n => n.level === 0);
    if (root) {
      root.fx = 0;
      root.fy = 0;
    }

    this.simulation = forceSimulation<LayoutNode>(this.layoutNodes)
      .alphaDecay(CONFIG.ALPHA_DECAY)
      .velocityDecay(CONFIG.VELOCITY_DECAY)
      // Kollisionsvermeidung - WICHTIG!
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
      .radius(d => CONFIG.COLLISION_RADII[Math.min(d.level, 3)] || 40)
      .strength(CONFIG.COLLISION_STRENGTH)
      .iterations(3);
  }

  /**
   * Anker-Kraft: Zieht Nodes zu ihrer idealen hierarchischen Position
   */
  private createAnchorForce() {
    const nodes = this.layoutNodes;
    const strength = CONFIG.ANCHOR_STRENGTH;

    return () => {
      for (const node of nodes) {
        if (node.level === 0) continue;
        if (node.x === undefined || node.y === undefined) continue;

        // Kraft Richtung Ideal-Position
        const dx = node.idealX - node.x;
        const dy = node.idealY - node.y;

        node.vx = (node.vx || 0) + dx * strength;
        node.vy = (node.vy || 0) + dy * strength;
      }
    };
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
