import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AdminVerificationUser {
  id: string;
  name: string;
  email: string;
  profileImageUrl: string;
  verificationStatus: string;
  verificationScore?: number;
  verificationNotes?: string;
  createdAt: string;
}

export interface AdminVerificationsRes {
  page: number;
  limit: number;
  total: number;
  items: AdminVerificationUser[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  listVerifications(status: string = 'queue', page = 1, limit = 30): Observable<AdminVerificationsRes> {
    const p = new HttpParams().set('status', status).set('page', String(page)).set('limit', String(limit));
    return this.http.get<AdminVerificationsRes>(`${environment.apiUrl}/admin/verifications`, { params: p });
  }

  approveUser(userId: string, notes?: string): Observable<{ ok: boolean; verificationStatus: string }> {
    return this.http.post<{ ok: boolean; verificationStatus: string }>(
      `${environment.apiUrl}/admin/verify/${userId}`,
      { notes: notes || '' }
    );
  }

  rejectUser(userId: string, reason: string): Observable<{ ok: boolean; verificationStatus: string }> {
    return this.http.post<{ ok: boolean; verificationStatus: string }>(
      `${environment.apiUrl}/admin/reject/${userId}`,
      { reason }
    );
  }
}
