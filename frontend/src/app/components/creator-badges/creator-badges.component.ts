import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';
import { badgeLabel } from '../../core/badge-labels';

@Component({
  selector: 'app-creator-badges',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (list().length) {
      <ul class="list-unstyled d-flex flex-wrap gap-1 align-items-center mb-0" [class.small]="compact()">
        @for (b of list(); track b) {
          <li>
            <span
              class="badge rounded-pill"
              [ngClass]="classFor(b)"
              [attr.title]="b"
              >{{ label(b) }}</span
            >
          </li>
        }
      </ul>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class CreatorBadgesComponent {
  readonly ids = input<string[]>([]);
  readonly compact = input(false);
  label = badgeLabel;
  list(): string[] {
    return this.ids() || [];
  }
  classFor(b: string): string {
    const m: Record<string, string> = {
      verified_creator: 'text-bg-info text-dark',
      new_creator: 'text-bg-warning text-dark',
      consistent_poster: 'text-bg-warning text-dark',
      top_performer: 'text-bg-primary',
    };
    return m[b] || 'text-bg-success';
  }
}
