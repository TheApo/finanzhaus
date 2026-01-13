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
          (click)="selectCategory('strategie')"
        ></div>
        <span class="finanzhaus__roof-label">Genossenschaftliche Idee</span>
      </div>

      <!-- Private FinanzPlanung -->
      <div
        class="finanzhaus__section finanzhaus__section--privat"
        [class.finanzhaus__section--active]="activeCategory() === 'privat_finanz'"
        (click)="selectCategory('privat_finanz')"
      >
        Private FinanzPlanung
      </div>

      <!-- Gründung und Nachfolge -->
      <div
        class="finanzhaus__section finanzhaus__section--gruendung"
        [class.finanzhaus__section--active]="activeCategory() === 'gruendung'"
        (click)="selectCategory('gruendung')"
      >
        Gründung und Nachfolge
      </div>

      <!-- Pillars -->
      <div class="finanzhaus__pillars">
        <div
          class="finanzhaus__pillar finanzhaus__pillar--absicherung"
          [class.finanzhaus__pillar--active]="activeCategory() === 'absicherung'"
          (click)="selectCategory('absicherung')"
        >
          Versicher-ung
        </div>
        <div
          class="finanzhaus__pillar finanzhaus__pillar--vorsorge"
          [class.finanzhaus__pillar--active]="activeCategory() === 'vorsorge'"
          (click)="selectCategory('vorsorge')"
        >
          Vorsorge &amp;<br>Mitarbeiter
        </div>
        <div
          class="finanzhaus__pillar finanzhaus__pillar--vermoegen"
          [class.finanzhaus__pillar--active]="activeCategory() === 'vermoegen'"
          (click)="selectCategory('vermoegen')"
        >
          Vermögen &amp;<br>EigenKapital
        </div>
        <div
          class="finanzhaus__pillar finanzhaus__pillar--ausland"
          [class.finanzhaus__pillar--active]="activeCategory() === 'ausland'"
          (click)="selectCategory('ausland')"
        >
          Auslands-geschäft
        </div>
      </div>

      <!-- Finanzierung -->
      <div
        class="finanzhaus__section finanzhaus__section--finanzierung"
        [class.finanzhaus__section--active]="activeCategory() === 'finanzierung'"
        (click)="selectCategory('finanzierung')"
      >
        Finanzierung
      </div>

      <!-- Zahlungsverkehr -->
      <div
        class="finanzhaus__section finanzhaus__section--zahlungsverkehr"
        [class.finanzhaus__section--active]="activeCategory() === 'zahlungsverkehr'"
        (click)="selectCategory('zahlungsverkehr')"
      >
        Zahlungsverkehr
      </div>
    </div>
  `
})
export class FinanzhausComponent {
  activeCategory = input<CategoryId | null>(null);
  categorySelected = output<CategoryId>();

  selectCategory(id: CategoryId): void {
    this.categorySelected.emit(id);
  }
}
