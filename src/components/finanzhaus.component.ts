import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CategoryId } from '../services/data.service';

@Component({
  selector: 'app-finanzhaus',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="bg-transparent filter drop-shadow-xl p-2 max-w-[340px] text-xs select-none">

      <!-- Roof (Triangle) -->
      <div class="relative w-full h-16 mb-1 flex justify-center drop-shadow-sm filter">
         <div
          class="absolute bottom-0 w-full h-full cursor-pointer hover:brightness-95 transition-all"
          [style.clip-path]="'polygon(50% 0%, 0% 100%, 100% 100%)'"
          [style.background-color]="'#e2e8f0'"
          [style.outline]="activeCategory() === 'strategie' ? '3px solid #dc2626' : 'none'"
          [style.outline-offset]="'-3px'"
          (click)="selectCategory('strategie')"
        ></div>
        <div class="absolute bottom-1 text-slate-700 font-bold pointer-events-none">
          Genossenschaftliche Idee
        </div>
      </div>

      <!-- Private Finanz -->
      <div
        class="bg-[#0f172a] text-white p-2 text-center mb-0.5 cursor-pointer hover:opacity-90 transition-all"
        [style.box-shadow]="activeCategory() === 'privat_finanz' ? 'inset 0 0 0 3px #dc2626' : 'none'"
        (click)="selectCategory('privat_finanz')"
      >
        Private FinanzPlanung
      </div>

      <!-- Gründung -->
      <div
        class="bg-[#1e40af] text-white p-2 text-center mb-0.5 cursor-pointer hover:opacity-90 transition-all"
        [style.box-shadow]="activeCategory() === 'gruendung' ? 'inset 0 0 0 3px #dc2626' : 'none'"
        (click)="selectCategory('gruendung')"
      >
        Gründung und Nachfolge
      </div>

      <!-- Pillars -->
      <div class="grid grid-cols-4 gap-0.5 mb-0.5 text-center h-20 items-stretch">
        <div
          class="bg-[#ea580c] text-white p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight transition-all"
          [style.box-shadow]="activeCategory() === 'absicherung' ? 'inset 0 0 0 3px #dc2626' : 'none'"
          (click)="selectCategory('absicherung')"
        >
          Versicher-ung
        </div>
        <div
          class="bg-[#be123c] text-white p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight break-words hyphens-auto transition-all"
          [style.box-shadow]="activeCategory() === 'vorsorge' ? 'inset 0 0 0 3px #dc2626' : 'none'"
          (click)="selectCategory('vorsorge')"
        >
          Vorsorge &<br>Mitarbeiter
        </div>
        <div
          class="bg-[#4d7c0f] text-white p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight transition-all"
          [style.box-shadow]="activeCategory() === 'vermoegen' ? 'inset 0 0 0 3px #dc2626' : 'none'"
          (click)="selectCategory('vermoegen')"
        >
          Vermögen &<br>EigenKapital
        </div>
        <div
          class="bg-[#eab308] text-slate-900 p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight font-medium transition-all"
          [style.box-shadow]="activeCategory() === 'ausland' ? 'inset 0 0 0 3px #dc2626' : 'none'"
          (click)="selectCategory('ausland')"
        >
          Auslands-geschäft
        </div>
      </div>

      <!-- Foundation -->
      <div
        class="bg-[#4c1d95] text-white p-2 text-center mb-0.5 cursor-pointer hover:opacity-90 transition-all"
        [style.box-shadow]="activeCategory() === 'finanzierung' ? 'inset 0 0 0 3px #dc2626' : 'none'"
        (click)="selectCategory('finanzierung')"
      >
        Finanzierung
      </div>
      <div
        class="bg-[#0ea5e9] text-white p-2 text-center rounded-b-sm border-2 border-slate-700 cursor-pointer hover:opacity-90 transition-all"
        [style.box-shadow]="activeCategory() === 'zahlungsverkehr' ? 'inset 0 0 0 3px #dc2626' : 'none'"
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

  selectCategory(id: CategoryId) {
    this.categorySelected.emit(id);
  }
}