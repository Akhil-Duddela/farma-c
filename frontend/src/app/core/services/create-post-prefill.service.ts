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
  setForCreatePost(p: {
    caption: string;
    script: string;
    hashtags: string[];
    title?: string;
    description?: string;
  }): void {
    const header: string[] = [];
    if (p.title?.trim()) header.push(p.title.trim());
    if (p.description?.trim()) header.push(p.description.trim());
    const main = [p.caption?.trim(), p.script?.trim()].filter(Boolean);
    const content = [header.join('\n\n'), main.join('\n\n')].filter(Boolean).join('\n\n');
    this.pending = {
      content,
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
