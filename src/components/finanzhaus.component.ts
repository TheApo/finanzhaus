import { Component, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CategoryId } from '../services/data.service';
import { I18nService } from '../services/i18n.service';

@Component({
  selector: 'app-finanzhaus',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './finanzhaus.component.html'
})
export class FinanzhausComponent {
  i18n = inject(I18nService);

  activeCategories = input<Set<CategoryId>>(new Set());
  hoveredCategories = input<CategoryId[]>([]);
  selectedL2NodeIds = input<Set<string>>(new Set());
  hoveredL2NodeId = input<string | null>(null);
  categorySelected = output<CategoryId>();
  l2Selected = output<{ l2Id: string; fallbackCategory: CategoryId }>();

  selectCategory(id: CategoryId): void {
    this.categorySelected.emit(id);
  }

  selectL2(l2Id: string, fallbackCategory: CategoryId, event: Event): void {
    event.stopPropagation();
    this.l2Selected.emit({ l2Id, fallbackCategory });
  }

  isActive(id: CategoryId): boolean {
    return this.activeCategories().has(id);
  }

  isHovered(id: CategoryId): boolean {
    return this.hoveredCategories().includes(id);
  }

  isL2Active(l2Id: string): boolean {
    return this.selectedL2NodeIds().has(l2Id);
  }

  isL2Hovered(l2Id: string): boolean {
    return this.hoveredL2NodeId() === l2Id;
  }

  t(key: string): string {
    return this.i18n.t(key);
  }
}
