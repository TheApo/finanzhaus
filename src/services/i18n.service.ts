import { Injectable, signal } from '@angular/core';

import de from '../i18n/de.json';
import en from '../i18n/en.json';

export type Language = 'de' | 'en';

type TranslationData = typeof de;

const translations: Record<Language, TranslationData> = { de, en };

@Injectable({
  providedIn: 'root'
})
export class I18nService {
  private currentLang = signal<Language>(this.detectLanguage());

  get language() {
    return this.currentLang.asReadonly();
  }

  private detectLanguage(): Language {
    const browserLang = navigator.language.split('-')[0].toLowerCase();
    return browserLang === 'de' ? 'de' : 'en';
  }

  setLanguage(lang: Language): void {
    this.currentLang.set(lang);
  }

  t(key: string): string {
    const keys = key.split('.');
    let value: any = translations[this.currentLang()];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return key;
      }
    }

    return typeof value === 'string' ? value : key;
  }
}
