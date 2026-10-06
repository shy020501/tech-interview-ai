import 'server-only';
import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import type { Category } from '@/types/category';

export const getCategories = cache(async (): Promise<Category[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from('categories').select('id, slug, name, parent_id, description, sort_order').order('sort_order').order('id');
  if (error) throw new Error('Unable to load categories.');
  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name, parentId: row.parent_id, sortOrder: row.sort_order, ...(row.description ? { description: row.description } : {}) }));
});
