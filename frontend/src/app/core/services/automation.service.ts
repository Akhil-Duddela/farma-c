import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface RunAutomationBody {
  input: string;
  platforms?: { instagram: boolean; youtube: boolean };
  instagramAccountId?: string;
  youtubeAccountId?: string;
}

export interface RunAutomationRes {
  postId: string;
  message: string;
  status: { pipelineStatus?: string; step?: string };
}

@Injectable({ providedIn: 'root' })
export class AutomationService {
  private readonly http = inject(HttpClient);

  run(body: RunAutomationBody): Observable<RunAutomationRes> {
    return this.http.post<RunAutomationRes>(`${environment.apiUrl}/automation/run`, body);
  }
}
