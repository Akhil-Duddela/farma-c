import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UploadResult {
  url: string;
  mimetype: string;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class UploadService {
  private readonly http = inject(HttpClient);

  /** Multipart field name must be "file" */
  uploadFile(file: File): Observable<UploadResult> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    return this.http.post<UploadResult>(`${environment.apiUrl}/upload`, fd);
  }
}
