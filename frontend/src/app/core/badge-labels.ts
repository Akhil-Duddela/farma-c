const LABELS: Record<string, string> = {
  verified_creator: 'Verified Creator',
  top_performer: 'Top Performer',
  consistent_poster: 'Consistent Poster',
  new_creator: 'New Creator',
};

export function badgeLabel(id: string | undefined | null): string {
  if (!id) {
    return '';
  }
  return LABELS[id] || id.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function creatorLevelLabel(slug: string | undefined | null): string {
  if (!slug) {
    return '';
  }
  const m: Record<string, string> = {
    beginner: 'Beginner',
    active_creator: 'Active Creator',
    pro_creator: 'Pro Creator',
    /** Same slug as the badge; rank tier, not the badge list only */
    verified_creator: 'Verified Creator ⭐',
  };
  return m[slug] || slug;
}
