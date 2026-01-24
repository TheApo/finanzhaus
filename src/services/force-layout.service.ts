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
 *
 * Layout-Modi:
 * - 'simulation': Force-Simulation für dynamisches Layout (mit Wabbeln)
 * - 'static': Statische Vorberechnung ohne Simulation (sofortige Platzierung)
 */

export type LayoutMode = 'simulation' | 'static';

const CONFIG = {
  // Basis-Abstände pro Level
  BASE_DISTANCES: {
    1: 350,    // Level 1 vom Zentrum
    2: 300,    // Level 2 vom Level 1
    3: 100,    // Level 3 (Grid-Startabstand)
    4: 100,    // Level 4+
  } as Record<number, number>,

  // Zusätzlicher Abstand pro Kind für Level 2 (damit sie weiter auseinander sind)
  DISTANCE_PER_CHILD: 40,

  // Minimaler Winkel zwischen Geschwistern (in Grad) - größer = mehr Platz
  MIN_ANGLE_BETWEEN_SIBLINGS: 25,

  // Kollisions-Radien - berücksichtigt Node + Label
  COLLISION_RADII: {
    0: 100,    // Level 0
    1: 110,    // Level 1 (größere Labels)
    2: 100,    // Level 2 (mit Label darunter)
    3: 65,     // Level 3 (kleinere Nodes, gekürzte Labels)
    4: 60,     // Level 4+
  } as Record<number, number>,

  // Konzentrische Ringe: Ab dieser Kinderzahl werden Ringe verwendet
  RING_THRESHOLD: 6,
  RING_DISTANCE_FACTOR: 0.6,

  // Simulation - schneller stabilisieren
  ANCHOR_STRENGTH: 0.5,
  SECTOR_CONSTRAINT_STRENGTH: 0.98,
  COLLISION_STRENGTH: 0.8,
  ALPHA_DECAY: 0.08,  // Viel schneller beenden
  VELOCITY_DECAY: 0.6
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
  private _layoutMode = signal<LayoutMode>('static'); // Default: Static (kein Wabbeln)

  nodePositions: Signal<Map<string, { x: number; y: number }>> = this._nodePositions.asReadonly();
  isSettling: Signal<boolean> = this._isSettling.asReadonly();
  layoutMode: Signal<LayoutMode> = this._layoutMode.asReadonly();

  constructor() {
    this.destroyRef.onDestroy(() => this.destroy());
  }

  /**
   * Setzt den Layout-Modus: 'simulation' oder 'static'
   * Bei 'static' werden Positionen sofort berechnet ohne Wabbeln.
   */
  setLayoutMode(mode: LayoutMode): void {
    this._layoutMode.set(mode);
  }

  initSimulation(rootNode: Node, expandedIds: Set<string>): void {
    this.destroy();
    this.buildLayoutTree(rootNode, expandedIds);
    this.analyzeSubtrees();
    this.assignSectors();
    this.calculateIdealPositions();
    this.initializeActualPositions();

    if (this._layoutMode() === 'static') {
      // Statischer Modus: Sofortige Platzierung, keine Simulation
      this.applyStaticLayout();
    } else {
      // Simulation-Modus: Force-Simulation starten
      this.startSimulation();
    }
  }

  /**
   * Statischer Modus: Wendet die idealen Positionen direkt an
   * ohne Force-Simulation (kein Wabbeln, sofortige Platzierung)
   */
  private applyStaticLayout(): void {
    // WICHTIG: Zuerst userPositions anwenden (vom Benutzer verschobene Nodes)
    for (const node of this.layoutNodes) {
      if (node.level === 0) continue; // L0 ist immer fixiert im Zentrum

      const userPos = this.userPositions.get(node.id);
      if (userPos) {
        // Benutzer hat diesen Node verschoben - Position übernehmen
        node.idealX = userPos.x;
        node.idealY = userPos.y;
      }
    }

    // Kollisions-Auflösung: Einfacher iterativer Algorithmus
    // (Nur für Nodes ohne userPosition - die anderen bleiben fixiert)
    this.resolveCollisionsStatically();

    // Positionen übernehmen
    for (const node of this.layoutNodes) {
      node.x = node.idealX;
      node.y = node.idealY;
    }

    // Signal aktualisieren
    this.updatePositionSignal();
    this._isSettling.set(false);
  }

  /**
   * Löst Kollisionen statisch auf (ohne Simulation)
   * Iteriert mehrfach und schiebt überlappende Nodes auseinander
   * Nodes mit userPositions werden NICHT verschoben (sie sind "fixiert")
   */
  private resolveCollisionsStatically(): void {
    const iterations = 50; // Anzahl der Iterationen für Kollisions-Auflösung
    const padding = 10; // Zusätzlicher Abstand zwischen Nodes

    for (let iter = 0; iter < iterations; iter++) {
      let hasCollision = false;

      for (let i = 0; i < this.layoutNodes.length; i++) {
        const nodeA = this.layoutNodes[i];
        const radiusA = CONFIG.COLLISION_RADII[Math.min(nodeA.level, 4)] || CONFIG.COLLISION_RADII[4];
        const aIsFixed = nodeA.level === 0 || this.userPositions.has(nodeA.id);

        for (let j = i + 1; j < this.layoutNodes.length; j++) {
          const nodeB = this.layoutNodes[j];
          const radiusB = CONFIG.COLLISION_RADII[Math.min(nodeB.level, 4)] || CONFIG.COLLISION_RADII[4];
          const bIsFixed = nodeB.level === 0 || this.userPositions.has(nodeB.id);

          // Wenn beide fixiert sind, können wir nichts tun
          if (aIsFixed && bIsFixed) continue;

          const dx = nodeB.idealX - nodeA.idealX;
          const dy = nodeB.idealY - nodeA.idealY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          const minDistance = radiusA + radiusB + padding;

          if (distance < minDistance && distance > 0) {
            hasCollision = true;

            // Überlappung berechnen
            const overlap = minDistance - distance;
            const pushFactor = overlap / distance / 2;

            // Nur nicht-fixierte Nodes verschieben
            if (!aIsFixed && !bIsFixed) {
              // Beide verschieben (gleich verteilt)
              nodeA.idealX -= dx * pushFactor;
              nodeA.idealY -= dy * pushFactor;
              nodeB.idealX += dx * pushFactor;
              nodeB.idealY += dy * pushFactor;
            } else if (!aIsFixed) {
              // Nur A verschieben
              nodeA.idealX -= dx * pushFactor * 2;
              nodeA.idealY -= dy * pushFactor * 2;
            } else if (!bIsFixed) {
              // Nur B verschieben
              nodeB.idealX += dx * pushFactor * 2;
              nodeB.idealY += dy * pushFactor * 2;
            }
          }
        }
      }

      // Frühzeitig beenden wenn keine Kollisionen mehr
      if (!hasCollision) break;
    }
  }

  updateNodes(rootNode: Node, expandedIds: Set<string>): void {
    // Im statischen Modus: Immer neu initialisieren
    if (this._layoutMode() === 'static') {
      this.initSimulation(rootNode, expandedIds);
      return;
    }

    // Simulation-Modus: Falls keine Simulation existiert, initialisieren
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

  /**
   * Setzt die Position eines einzelnen Nodes zurück (löscht aus userPositions).
   * Der Node wird dann wieder an seine berechnete Ideal-Position gesetzt.
   */
  resetNodePosition(nodeId: string): void {
    this.userPositions.delete(nodeId);
    const node = this.nodeMap.get(nodeId);
    if (node) {
      // Zurück zur Ideal-Position
      node.x = node.idealX;
      node.y = node.idealY;
      node.fx = undefined;
      node.fy = undefined;
      this.updatePositionSignal();
    }
  }

  /**
   * Prüft ob ein Node mit einem anderen überlappt.
   * Verwendet die konfigurierten Kollisions-Radien.
   */
  checkCollision(nodeId1: string, nodeId2: string): boolean {
    const node1 = this.nodeMap.get(nodeId1);
    const node2 = this.nodeMap.get(nodeId2);
    if (!node1 || !node2) return false;
    if (node1.x === undefined || node1.y === undefined) return false;
    if (node2.x === undefined || node2.y === undefined) return false;

    const radius1 = CONFIG.COLLISION_RADII[Math.min(node1.level, 4)] || CONFIG.COLLISION_RADII[4];
    const radius2 = CONFIG.COLLISION_RADII[Math.min(node2.level, 4)] || CONFIG.COLLISION_RADII[4];

    const dx = node1.x - node2.x;
    const dy = node1.y - node2.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Überlappung wenn Abstand < Summe der Radien
    return distance < (radius1 + radius2);
  }

  getPosition(nodeId: string): { x: number; y: number } | undefined {
    return this._nodePositions().get(nodeId);
  }

  /**
   * Setzt Positionen für mehrere Nodes gleichzeitig (für Fokus-Modus).
   * Level 0 wird nicht verschoben.
   */
  setMultiplePositions(positions: Map<string, { x: number; y: number }>): void {
    positions.forEach((pos, nodeId) => {
      const node = this.nodeMap.get(nodeId);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
      }
    });
    this.updatePositionSignal();
  }

  /**
   * Setzt Positionen TEMPORÄR (ohne in userPositions zu speichern).
   * Für Fokus-Modus - Positionen gehen beim Defokussieren verloren.
   */
  setMultiplePositionsTemporary(positions: Map<string, { x: number; y: number }>): void {
    positions.forEach((pos, nodeId) => {
      const node = this.nodeMap.get(nodeId);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
        // NICHT in userPositions speichern!
      }
    });
    this.updatePositionSignal();
  }

  /**
   * Fokus-Modus: Fixiert bestimmte Nodes und lässt andere ausweichen (D3 Kollisionsvermeidung).
   * @param fixedPositions - Positionen der Fokus-Elemente (werden fixiert)
   * @param focusChildIds - IDs der Fokus-Kinder (werden später kreisförmig angeordnet)
   */
  applyFocusModeWithCollisionAvoidance(
    fixedPositions: Map<string, { x: number; y: number }>,
    focusChildIds: Set<string>
  ): void {
    console.log('[applyFocusModeWithCollisionAvoidance] fixedPositions:', fixedPositions.size, 'focusChildIds:', focusChildIds.size);

    // Sammle alle fixierten Node-IDs
    const fixedNodeIds = new Set<string>(fixedPositions.keys());
    focusChildIds.forEach(id => fixedNodeIds.add(id));

    // 1. Fokus-Elemente fixieren
    fixedPositions.forEach((pos, nodeId) => {
      const node = this.nodeMap.get(nodeId);
      if (node) {
        node.x = pos.x;
        node.y = pos.y;
        node.fx = pos.x;  // Fixieren für Simulation
        node.fy = pos.y;
      }
    });

    // 2. Fokus-Kinder temporär auch fixieren (werden später kreisförmig angeordnet)
    focusChildIds.forEach(childId => {
      const node = this.nodeMap.get(childId);
      if (node) {
        node.fx = node.x;
        node.fy = node.y;
      }
    });

    // 3. D3 Simulation starten für Kollisionsvermeidung
    // Größerer Radius für fixierte Nodes damit andere weggeschoben werden
    const simulation = forceSimulation<LayoutNode>(this.layoutNodes)
      .alphaDecay(0.05)  // Langsamer abklingen
      .velocityDecay(0.3)
      .force('collide', forceCollide<LayoutNode>()
        .radius(d => {
          const baseRadius = CONFIG.COLLISION_RADII[Math.min(d.level, 4)] || 65;
          // Fixierte Nodes bekommen größeren Radius um andere wegzuschieben
          if (fixedNodeIds.has(d.id)) {
            return baseRadius + 80;
          }
          return baseRadius + 20;
        })
        .strength(1.0)
        .iterations(5)
      );

    // Simulation laufen lassen (synchron, mehr Iterationen)
    simulation.tick(100);
    simulation.stop();
    console.log('[applyFocusModeWithCollisionAvoidance] simulation done');

    // 4. Fixierungen aufheben (außer L0)
    for (const node of this.layoutNodes) {
      if (node.level > 0) {
        node.fx = undefined;
        node.fy = undefined;
      }
    }

    this.updatePositionSignal();
  }

  /**
   * Fokus-Modus: Kinder kreisförmig anordnen mit Lücke LINKS.
   * ≤5 Kinder: Halbkreis RECHTS
   * >5 Kinder: Voller Kreis mit Lücke bei 180° (links)
   * Speichert NICHT in userPositions (temporär).
   */
  arrangeChildrenCircularFocusMode(parentId: string, childIds: string[]): void {
    console.log('[arrangeChildrenCircularFocusMode] parentId:', parentId, 'childIds:', childIds.length);
    const parent = this.nodeMap.get(parentId);
    if (!parent || parent.x === undefined || parent.y === undefined) {
      console.log('[arrangeChildrenCircularFocusMode] ABORT - parent not found or no position', parent);
      return;
    }
    if (childIds.length === 0) {
      console.log('[arrangeChildrenCircularFocusMode] ABORT - no children');
      return;
    }

    const parentX = parent.x;
    const parentY = parent.y;
    const count = childIds.length;
    console.log('[arrangeChildrenCircularFocusMode] parent pos:', parentX, parentY, 'count:', count);

    // Radius berechnen
    const childLevel = Math.min(parent.level + 1, 4);
    const childRadius = CONFIG.COLLISION_RADII[childLevel] || 65;
    const parentRadius = CONFIG.COLLISION_RADII[parent.level] || 100;

    let radius: number;
    if (count <= 5) {
      radius = parentRadius + childRadius + 40 + count * 25;
    } else {
      // Voller Kreis: Jedes Kind braucht ca. 90px Umfang
      const minCircumference = count * 90;
      radius = Math.max(parentRadius + childRadius + 60, minCircumference / (2 * Math.PI));
    }

    if (count <= 5) {
      // ≤5 Kinder: Halbkreis RECHTS (von oben nach unten: -90° bis +90°)
      const startAngle = -Math.PI / 2;  // -90° = oben
      const endAngle = Math.PI / 2;     // +90° = unten
      const angleStep = count > 1 ? (endAngle - startAngle) / (count - 1) : 0;

      childIds.forEach((childId, index) => {
        const node = this.nodeMap.get(childId);
        if (!node) return;

        const angle = count === 1 ? 0 : startAngle + index * angleStep;
        node.x = parentX + Math.cos(angle) * radius;
        node.y = parentY + Math.sin(angle) * radius;
        // NICHT in userPositions speichern!
      });
    } else {
      // >5 Kinder: Voller Kreis mit Lücke LINKS (bei 160°-200°)
      const GAP_START_DEG = 160;
      const GAP_END_DEG = 200;
      const gapStartRad = GAP_START_DEG * Math.PI / 180;
      const gapEndRad = GAP_END_DEG * Math.PI / 180;
      const gapSizeRad = gapEndRad - gapStartRad;

      const availableAngle = 2 * Math.PI - gapSizeRad;
      const angleStep = availableAngle / count;

      childIds.forEach((childId, index) => {
        const node = this.nodeMap.get(childId);
        if (!node) return;

        // Start bei 0° (rechts), im Uhrzeigersinn
        let angle = index * angleStep;

        // Wenn wir in den Lückenbereich kommen: überspringe die Lücke
        if (angle >= gapStartRad) {
          angle += gapSizeRad;
        }

        node.x = parentX + Math.cos(angle) * radius;
        node.y = parentY + Math.sin(angle) * radius;
        // NICHT in userPositions speichern!
      });
    }

    this.updatePositionSignal();
  }

  /**
   * Setzt alle Nodes auf ihre ursprünglichen Positionen zurück.
   * Verwendet userPositions falls vorhanden, sonst idealPositions.
   */
  resetToOriginalPositions(): void {
    for (const node of this.layoutNodes) {
      if (node.level === 0) continue;

      const userPos = this.userPositions.get(node.id);
      if (userPos) {
        node.x = userPos.x;
        node.y = userPos.y;
      } else {
        node.x = node.idealX;
        node.y = node.idealY;
      }
    }
    this.updatePositionSignal();
  }

  /**
   * Ordnet Kinder-Nodes kreisförmig um einen Parent an.
   * Verwendet konzentrische Ringe wenn zu viele Kinder für einen Ring.
   * Positioniert auch Enkel-Nodes so, dass sie vom Großeltern-Node weg zeigen.
   *
   * Spezialfall Level 1 Parent mit < 4 Kindern:
   * Kinder werden in einem Fächer weg von Level 0 positioniert (nicht voller Kreis).
   */
  arrangeChildrenCircular(parentId: string, childIds: string[]): void {
    const parent = this.nodeMap.get(parentId);
    if (!parent || parent.x === undefined || parent.y === undefined) return;
    if (childIds.length === 0) return;

    const parentX = parent.x;
    const parentY = parent.y;
    const parentLevel = parent.level;

    // Kollisions-Radius für Kinder (Level des Parents + 1)
    const childLevel = Math.min(parentLevel + 1, 4);
    const childRadius = CONFIG.COLLISION_RADII[childLevel] || 65;

    // Erster Ring-Radius: Parent-Radius + Kind-Radius + kleiner Puffer
    const parentRadius = CONFIG.COLLISION_RADII[parentLevel] || 100;
    const baseRingRadius = parentRadius + childRadius + 2;

    // Spezialfall: Level 1 oder Level 2 Parent mit weniger als 4 Kindern
    // → Fächer weg vom Großeltern statt voller Kreis
    if ((parentLevel === 1 || parentLevel === 2) && childIds.length < 4) {
      this.arrangeChildrenInFanAwayFromGrandparent(parent, childIds, baseRingRadius);
      return;
    }

    // Minimaler Abstand zwischen Kindern
    // Level 1 Parent: Engerer Abstand damit 8 Level 2 Elemente in den ersten Ring passen
    const minChildSpacing = parentLevel === 1
      ? childRadius * 1.6  // Engerer Abstand für Level 2 um Level 1
      : childRadius * 2 + 20;

    // Berechne wie viele Kinder pro Ring passen
    // Umfang = 2 * PI * ringRadius, teilen durch minChildSpacing
    const calculateNodesPerRing = (ringRadius: number): number => {
      const circumference = 2 * Math.PI * ringRadius;
      return Math.max(1, Math.floor(circumference / minChildSpacing));
    };

    const ringSpacing = childRadius + 10; // Kleinerer Abstand zwischen Ringen

    // Verteile Kinder auf Ringe
    const positions: Array<{ id: string; x: number; y: number; angle: number }> = [];
    let remainingChildren = [...childIds];
    let ringIndex = 0;

    while (remainingChildren.length > 0) {
      const ringRadius = baseRingRadius + ringIndex * ringSpacing;
      const nodesInThisRing = Math.min(
        calculateNodesPerRing(ringRadius),
        remainingChildren.length
      );

      // Kinder für diesen Ring
      const childrenForRing = remainingChildren.slice(0, nodesInThisRing);
      remainingChildren = remainingChildren.slice(nodesInThisRing);

      // Gleichmäßig auf dem Ring verteilen
      const angleStep = (2 * Math.PI) / childrenForRing.length;
      // Versatz für jeden Ring: halber Winkelschritt, damit Nodes versetzt sind
      const ringOffset = ringIndex * (angleStep / 2);
      const startAngle = -Math.PI / 2 + ringOffset;

      childrenForRing.forEach((childId, index) => {
        const angle = startAngle + index * angleStep;
        positions.push({
          id: childId,
          x: parentX + Math.cos(angle) * ringRadius,
          y: parentY + Math.sin(angle) * ringRadius,
          angle: angle // Winkel speichern für Enkel-Positionierung
        });
      });

      ringIndex++;
    }

    // Positionen anwenden und Enkel positionieren
    this.applyPositionsAndArrangeGrandchildren(positions, parentX, parentY);

    this.updatePositionSignal();
  }

  /**
   * Positioniert Kinder in einem Fächer, der vom Großeltern (L0) weg zeigt.
   * Wird verwendet wenn Level 1 Parent weniger als 4 Kinder hat.
   */
  private arrangeChildrenInFanAwayFromGrandparent(
    parent: LayoutNode,
    childIds: string[],
    ringRadius: number
  ): void {
    const parentX = parent.x!;
    const parentY = parent.y!;

    // Finde den Großeltern (Level 0)
    const grandparent = parent.parentId ? this.nodeMap.get(parent.parentId) : null;
    const grandparentX = grandparent?.x ?? 0;
    const grandparentY = grandparent?.y ?? 0;

    // Winkel von Großeltern zu Parent = "Weg-Richtung"
    const outwardAngle = Math.atan2(parentY - grandparentY, parentX - grandparentX);

    // Fächer-Winkel: 100° bei 2 Kindern, 60° bei 3 Kindern
    const anglePerChild = childIds.length === 2
      ? Math.PI * 0.56  // ~100° für 2 Kinder
      : Math.PI / 3;    // 60° für 3 Kinder
    const totalFanAngle = (childIds.length - 1) * anglePerChild;
    const startAngle = outwardAngle - totalFanAngle / 2;

    const positions: Array<{ id: string; x: number; y: number; angle: number }> = [];

    // Tatsächlicher Winkelschritt (falls totalFanAngle begrenzt wurde)
    const actualAngleStep = childIds.length > 1 ? totalFanAngle / (childIds.length - 1) : 0;

    childIds.forEach((childId, index) => {
      const angle = childIds.length === 1
        ? outwardAngle
        : startAngle + index * actualAngleStep;

      positions.push({
        id: childId,
        x: parentX + Math.cos(angle) * ringRadius,
        y: parentY + Math.sin(angle) * ringRadius,
        angle: angle
      });
    });

    // Positionen anwenden und Enkel positionieren
    this.applyPositionsAndArrangeGrandchildren(positions, parentX, parentY);

    this.updatePositionSignal();
  }

  /**
   * Wendet Positionen an und positioniert Enkel-Nodes.
   */
  private applyPositionsAndArrangeGrandchildren(
    positions: Array<{ id: string; x: number; y: number; angle: number }>,
    parentX: number,
    parentY: number
  ): void {
    for (const pos of positions) {
      const child = this.nodeMap.get(pos.id);
      if (child) {
        child.x = pos.x;
        child.y = pos.y;
        child.idealX = pos.x;
        child.idealY = pos.y;
        this.userPositions.set(pos.id, { x: pos.x, y: pos.y });

        // Enkel-Nodes positionieren (weg vom Großeltern-Node)
        if (child.children && child.children.length > 0) {
          this.arrangeGrandchildrenOutward(child, pos.angle, parentX, parentY);
        }
      }
    }
  }

  /**
   * Positioniert Enkel-Nodes in einem Fächer, der vom Großeltern weg zeigt.
   * @param childNode Der Eltern-Node der Enkel
   * @param outwardAngle Der Winkel vom Großeltern zum Eltern (Richtung "weg")
   * @param grandparentX X-Position des Großeltern
   * @param grandparentY Y-Position des Großeltern
   */
  private arrangeGrandchildrenOutward(
    childNode: LayoutNode,
    outwardAngle: number,
    grandparentX: number,
    grandparentY: number
  ): void {
    const grandchildren = childNode.children;
    if (!grandchildren || grandchildren.length === 0) return;
    if (childNode.x === undefined || childNode.y === undefined) return;

    const childX = childNode.x;
    const childY = childNode.y;

    // Kollisions-Radius für Enkel
    const grandchildLevel = Math.min(childNode.level + 1, 4);
    const grandchildRadius = CONFIG.COLLISION_RADII[grandchildLevel] || 65;

    // Abstand vom Kind-Node
    const childRadius = CONFIG.COLLISION_RADII[childNode.level] || 100;
    const distance = childRadius + grandchildRadius + 2;

    // Fächer-Winkel (abhängig von Anzahl der Enkel)
    const totalFanAngle = Math.min(Math.PI * 0.8, grandchildren.length * 0.3); // Max 144°
    const angleStep = grandchildren.length > 1
      ? totalFanAngle / (grandchildren.length - 1)
      : 0;
    const startAngle = outwardAngle - totalFanAngle / 2;

    grandchildren.forEach((grandchild, index) => {
      const angle = grandchildren.length === 1
        ? outwardAngle
        : startAngle + index * angleStep;

      const newX = childX + Math.cos(angle) * distance;
      const newY = childY + Math.sin(angle) * distance;

      grandchild.x = newX;
      grandchild.y = newY;
      grandchild.idealX = newX;
      grandchild.idealY = newY;
      this.userPositions.set(grandchild.id, { x: newX, y: newY });

      // Rekursiv: Auch Ur-Enkel positionieren
      if (grandchild.children && grandchild.children.length > 0) {
        this.arrangeGrandchildrenOutward(grandchild, angle, childX, childY);
      }
    });
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

    // Level 1 und 2: Sektor-basiert (radial um Parent)
    // Level 3+: Fächer-Layout (hinter dem Parent, vom Zentrum weg)
    if (level <= 2) {
      this.positionChildrenRadial(parent, children, level);
    } else {
      this.positionChildrenFan(parent, children, level);
    }

    // Rekursiv für alle Kinder
    for (const child of children) {
      this.calculateChildPositions(child);
    }
  }

  // Level 1 & 2: Radiale Positionierung im Sektor
  private positionChildrenRadial(parent: LayoutNode, children: LayoutNode[], level: number): void {
    const baseDistance = CONFIG.BASE_DISTANCES[level] || CONFIG.BASE_DISTANCES[4];
    const dynamicDistance = baseDistance + (children.length * CONFIG.DISTANCE_PER_CHILD);

    children.forEach(child => {
      child.idealAngle = child.sectorCenter;
      child.idealRadius = dynamicDistance;
      child.ring = 0;
      child.idealX = parent.idealX + Math.cos(child.idealAngle) * dynamicDistance;
      child.idealY = parent.idealY + Math.sin(child.idealAngle) * dynamicDistance;
    });
  }

  // Level 3+: Fächer-Layout HINTER dem Parent (weiter vom Zentrum weg)
  // Positionen sind RELATIV zum Parent, nicht absolut vom Zentrum
  private positionChildrenFan(parent: LayoutNode, children: LayoutNode[], level: number): void {
    const count = children.length;
    if (count === 0) return;

    // Sektor des Parents verwenden - Kinder bleiben in diesem Sektor
    const sectorCenter = parent.sectorCenter;
    const sectorSpan = Math.abs(parent.sectorEnd - parent.sectorStart);

    // Basis-Abstand vom Parent (NICHT vom Zentrum!)
    const baseDistance = CONFIG.BASE_DISTANCES[level] || CONFIG.BASE_DISTANCES[4];
    const rowSpacing = 70;

    // Berechne wie viele Reihen wir brauchen
    // Je mehr Kinder, desto mehr Reihen (tiefer statt breiter)
    const nodesPerRow = Math.max(3, Math.min(5, Math.ceil(Math.sqrt(count))));
    const numRows = Math.ceil(count / nodesPerRow);

    let nodeIndex = 0;
    for (let row = 0; row < numRows && nodeIndex < count; row++) {
      const nodesInThisRow = Math.min(nodesPerRow, count - nodeIndex);

      // Abstand vom Parent für diese Reihe (NICHT rowRadius vom Zentrum!)
      const distanceFromParent = baseDistance + row * rowSpacing;

      // Verfügbarer Winkelbereich: nutze nur 70% des Sektors um Überlappung zu vermeiden
      const availableAngle = sectorSpan * 0.7;

      // Winkel pro Node in dieser Reihe
      const angleStep = nodesInThisRow > 1 ? availableAngle / (nodesInThisRow - 1) : 0;
      const startAngle = sectorCenter - availableAngle / 2;

      for (let col = 0; col < nodesInThisRow && nodeIndex < count; col++) {
        const child = children[nodeIndex];

        // Winkel für diesen Node
        const angle = nodesInThisRow === 1 ? sectorCenter : startAngle + col * angleStep;

        // Position RELATIV zum Parent berechnen (wie bei positionChildrenRadial)
        child.idealAngle = angle;
        child.idealRadius = parent.idealRadius + distanceFromParent;
        child.idealX = parent.idealX + Math.cos(angle) * distanceFromParent;
        child.idealY = parent.idealY + Math.sin(angle) * distanceFromParent;
        child.ring = row;

        nodeIndex++;
      }
    }
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
   * Level 3+ haben stärkere Anker-Kraft um das Keil-Layout zu erhalten
   */
  private createAnchorForce() {
    const nodes = this.layoutNodes;
    const baseStrength = CONFIG.ANCHOR_STRENGTH;

    return () => {
      for (const node of nodes) {
        if (node.level === 0) continue;
        if (node.x === undefined || node.y === undefined) continue;

        // Level 3+ brauchen stärkere Anker um das Keil-Layout zu erhalten
        const strength = node.level >= 3 ? 0.8 : baseStrength;

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
   * NUR für Level 1 und 2 - Level 3+ verwendet das Keil-Layout
   */
  private createSectorConstraintForce() {
    const nodes = this.layoutNodes;
    const nodeMap = this.nodeMap;
    const strength = CONFIG.SECTOR_CONSTRAINT_STRENGTH;

    return () => {
      for (const node of nodes) {
        // Level 0, 1, 2: Sektor-Constraint aktiv
        // Level 3+: KEINE Sektor-Constraint - diese nutzen das Keil-Layout
        if (node.level === 0 || node.level >= 3) continue;
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
