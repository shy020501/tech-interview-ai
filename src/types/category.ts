/** IDs are stable references; names are English display text, not identifiers. */
export interface Category {
  id: string;
  slug: string;
  name: string;
  parentId: string | null;
  description?: string;
  sortOrder?: number;
}

export interface Competency {
  id: string;
  name: string;
}
