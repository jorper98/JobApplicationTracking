export interface Job {
  id: string;
  title: string;
  company: string;
  company_id?: string | null;
  description?: string;
  original_description?: string;
  description_fetch_method?: string;
  url?: string;
  location?: string;
  extracted_skills?: string[];
  note_count?: number;
  created_at?: string;
}

export interface JobPreview {
  title: string;
  company: string;
  description?: string;
  original_description?: string;
  description_fetch_method?: string;
  company_description?: string;
  url?: string;
  location?: string;
}
