import { Injectable } from '@angular/core';

export interface CreatePostPrefill {
  /** Main body (script + optional caption) */
  content: string;
  /** #tag list as in create form */
  hashtagsText: string;
}

@Injectable({ providedIn: 'root' })
export class CreatePostPrefillService {
  private pending: CreatePostPrefill | null = null;

  /** Called from AI enhancer "Use for Post" */
  setForCreatePost(p: { caption: string; script: string; hashtags: string[] }): void {
    const parts = [p.caption?.trim(), p.script?.trim()].filter(Boolean);
    this.pending = {
      content: parts.join('\n\n'),
      hashtagsText: (p.hashtags || [])
        .map((t) => t.replace(/^#/, '').trim())
        .filter(Boolean)
        .map((t) => `#${t}`)
        .join(' '),
    };
  }

  /** Create-post card reads once, then clears */
  consume(): CreatePostPrefill | null {
    const p = this.pending;
    this.pending = null;
    return p;
  }
}
