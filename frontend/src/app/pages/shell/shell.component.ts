import { NgTemplateOutlet } from '@angular/common';
import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  readonly auth = inject(AuthService);

  /** Mobile menu (no Bootstrap Offcanvas JS — same nav links are used in desktop sidebar; data-bs-dismiss breaks there) */
  readonly navOpen = signal(false);

  openNav(): void {
    this.navOpen.set(true);
    this.setBodyScrollLock(true);
  }

  closeNav(): void {
    this.navOpen.set(false);
    this.setBodyScrollLock(false);
  }

  private setBodyScrollLock(locked: boolean): void {
    if (typeof document === 'undefined') {
      return;
    }
    document.body.classList.toggle('overflow-hidden', locked);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.navOpen()) {
      this.closeNav();
    }
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (typeof window !== 'undefined' && window.innerWidth >= 992) {
      this.closeNav();
    }
  }

  logout(): void {
    this.closeNav();
    this.auth.logout();
  }
}
