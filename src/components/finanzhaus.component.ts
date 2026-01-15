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
  categorySelected = output<CategoryId>();

  selectCategory(id: CategoryId): void {
    this.categorySelected.emit(id);
  }

  isActive(id: CategoryId): boolean {
    return this.activeCategories().has(id);
  }

  isHovered(id: CategoryId): boolean {
    return this.hoveredCategories().includes(id);
  }

  t(key: string): string {
    return this.i18n.t(key);
  }
}
