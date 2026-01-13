import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CategoryId } from '../services/data.service';

@Component({
  selector: 'app-finanzhaus',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="finanzhaus">
      <!-- Roof (Triangle) -->
      <div class="finanzhaus__roof">
        <div
          class="finanzhaus__roof-shape"
          [class.finanzhaus__roof-shape--active]="activeCategory() === 'strategie'"
          [class.finanzhaus__roof-shape--hovered]="isHovered('strategie')"
          (click)="selectCategory('strategie')"
        ></div>
        <span class="finanzhaus__roof-label">Genossenschaftliche Idee</span>
      </div>

      <!-- Private FinanzPlanung -->
      <div
        class="finanzhaus__section finanzhaus__section--privat"
        [class.finanzhaus__section--active]="activeCategory() === 'privat_finanz'"
        [class.finanzhaus__section--hovered]="isHovered('privat_finanz')"
        (click)="selectCategory('privat_finanz')"
      >
        Private FinanzPlanung
      </div>

      <!-- Gründung und Nachfolge -->
      <div
        class="finanzhaus__section finanzhaus__section--gruendung"
        [class.finanzhaus__section--active]="activeCategory() === 'gruendung'"
        [class.finanzhaus__section--hovered]="isHovered('gruendung')"
        (click)="selectCategory('gruendung')"
      >
        Gründung und Nachfolge
      </div>

      <!-- Pillars -->
      <div class="finanzhaus__pillars">
        <div
          class="finanzhaus__pillar finanzhaus__pillar--absicherung"
          [class.finanzhaus__pillar--active]="activeCategory() === 'absicherung'"
          [class.finanzhaus__pillar--hovered]="isHovered('absicherung')"
          (click)="selectCategory('absicherung')"
        >
          Versicher-ung
        </div>
        <div
          class="finanzhaus__pillar finanzhaus__pillar--vorsorge"
          [class.finanzhaus__pillar--active]="activeCategory() === 'vorsorge'"
          [class.finanzhaus__pillar--hovered]="isHovered('vorsorge')"
          (click)="selectCategory('vorsorge')"
        >
          Vorsorge &amp;<br>Mitarbeiter
        </div>
        <div
          class="finanzhaus__pillar finanzhaus__pillar--vermoegen"
          [class.finanzhaus__pillar--active]="activeCategory() === 'vermoegen'"
          [class.finanzhaus__pillar--hovered]="isHovered('vermoegen')"
          (click)="selectCategory('vermoegen')"
        >
          Vermögen &amp;<br>EigenKapital
        </div>
        <div
          class="finanzhaus__pillar finanzhaus__pillar--ausland"
          [class.finanzhaus__pillar--active]="activeCategory() === 'ausland'"
          [class.finanzhaus__pillar--hovered]="isHovered('ausland')"
          (click)="selectCategory('ausland')"
        >
          Auslands-geschäft
        </div>
      </div>

      <!-- Finanzierung -->
      <div
        class="finanzhaus__section finanzhaus__section--finanzierung"
        [class.finanzhaus__section--active]="activeCategory() === 'finanzierung'"
        [class.finanzhaus__section--hovered]="isHovered('finanzierung')"
        (click)="selectCategory('finanzierung')"
      >
        Finanzierung
      </div>

      <!-- Zahlungsverkehr -->
      <div
        class="finanzhaus__section finanzhaus__section--zahlungsverkehr"
        [class.finanzhaus__section--active]="activeCategory() === 'zahlungsverkehr'"
        [class.finanzhaus__section--hovered]="isHovered('zahlungsverkehr')"
        (click)="selectCategory('zahlungsverkehr')"
      >
        Zahlungsverkehr
      </div>
    </div>
  `
})
export class FinanzhausComponent {
  activeCategory = input<CategoryId | null>(null);
  hoveredCategories = input<CategoryId[]>([]);
  categorySelected = output<CategoryId>();

  selectCategory(id: CategoryId): void {
    this.categorySelected.emit(id);
  }

  isHovered(id: CategoryId): boolean {
    return this.hoveredCategories().includes(id);
  }
}
