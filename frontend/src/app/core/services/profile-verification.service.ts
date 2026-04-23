import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, switchMap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface ProfileStatus {
  emailVerified: boolean;
  phoneVerified: boolean;
  phoneNumberMasked: string;
  profileImageUrl: string;
  verificationStatus: 'unverified' | 'pending' | 'verified' | 'rejected';
  verificationNotes: string;
  canUsePublishing: boolean;
}

@Injectable({ providedIn: 'root' })
export class ProfileVerificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  getStatus(): Observable<ProfileStatus> {
    return this.http.get<ProfileStatus>(`${environment.apiUrl}/profile/status`);
  }

  uploadImage(file: File): Observable<{ url: string; profileImageUrl: string }> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http
      .post<{ url: string; profileImageUrl: string }>(`${environment.apiUrl}/profile/upload-image`, fd)
      .pipe(
        switchMap((r) => this.auth.refreshUser().pipe(map(() => r)))
      );
  }

  submitVerification(): Observable<{ ok: boolean; verificationStatus: string }> {
    return this.http
      .post<{ ok: boolean; verificationStatus: string }>(`${environment.apiUrl}/profile/submit-verification`, {})
      .pipe(switchMap((r) => this.auth.refreshUser().pipe(map(() => r))));
  }
}
