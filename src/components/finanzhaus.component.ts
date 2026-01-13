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
          class="absolute bottom-0 w-full h-full cursor-pointer hover:brightness-95 transition-[filter]"
          style="clip-path: polygon(50% 0%, 0% 100%, 100% 100%); background-color: #e2e8f0;"
          (click)="selectCategory('strategie')"
          [class.brightness-90]="activeCategory() === 'strategie'"
        ></div>
        <div class="absolute bottom-1 text-slate-700 font-bold pointer-events-none">
          Genossenschaftliche Idee
        </div>
      </div>

      <!-- Private Finanz -->
      <div 
        class="bg-[#0f172a] text-white p-2 text-center mb-0.5 cursor-pointer hover:opacity-90 transition-opacity"
        (click)="selectCategory('privat_finanz')"
        [class.ring-2]="activeCategory() === 'privat_finanz'"
        [class.ring-white]="activeCategory() === 'privat_finanz'"
      >
        Private FinanzPlanung
      </div>

      <!-- Gründung -->
      <div 
        class="bg-[#1e40af] text-white p-2 text-center mb-0.5 cursor-pointer hover:opacity-90 transition-opacity"
        (click)="selectCategory('gruendung')"
         [class.ring-2]="activeCategory() === 'gruendung'"
        [class.ring-white]="activeCategory() === 'gruendung'"
      >
        Gründung und Nachfolge
      </div>

      <!-- Pillars -->
      <div class="grid grid-cols-4 gap-0.5 mb-0.5 text-center h-20 items-stretch">
        <div class="bg-[#ea580c] text-white p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight" (click)="selectCategory('absicherung')" [class.ring-2]="activeCategory() === 'absicherung'" [class.ring-white]="activeCategory() === 'absicherung'">
          Versicher-ung
        </div>
        <div class="bg-[#be123c] text-white p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight break-words hyphens-auto" (click)="selectCategory('vorsorge')" [class.ring-2]="activeCategory() === 'vorsorge'" [class.ring-white]="activeCategory() === 'vorsorge'">
          Vorsorge &<br>Mitarbeiter
        </div>
        <div class="bg-[#4d7c0f] text-white p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight" (click)="selectCategory('vermoegen')" [class.ring-2]="activeCategory() === 'vermoegen'" [class.ring-white]="activeCategory() === 'vermoegen'">
          Vermögen &<br>EigenKapital
        </div>
        <div class="bg-[#eab308] text-slate-900 p-1 flex items-center justify-center cursor-pointer hover:opacity-90 leading-tight font-medium" (click)="selectCategory('ausland')" [class.ring-2]="activeCategory() === 'ausland'" [class.ring-white]="activeCategory() === 'ausland'">
          Auslands- geschäft
        </div>
      </div>

      <!-- Foundation -->
      <div 
        class="bg-[#4c1d95] text-white p-2 text-center mb-0.5 cursor-pointer hover:opacity-90 transition-opacity"
        (click)="selectCategory('finanzierung')"
        [class.ring-2]="activeCategory() === 'finanzierung'"
        [class.ring-white]="activeCategory() === 'finanzierung'"
      >
        Finanzierung
      </div>
      <div 
        class="bg-[#0ea5e9] text-white p-2 text-center rounded-b-sm border-2 border-slate-700 cursor-pointer hover:opacity-90 transition-opacity"
        (click)="selectCategory('zahlungsverkehr')"
        [class.ring-2]="activeCategory() === 'zahlungsverkehr'"
        [class.ring-white]="activeCategory() === 'zahlungsverkehr'"
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