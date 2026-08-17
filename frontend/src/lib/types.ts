export interface Job {
  id: string;
  title: string;
  company: string;
  company_id?: string | null;
  description?: string;
  url?: string;
  location?: string;
  extracted_skills?: string[];
  created_at?: string;
}

export interface JobPreview {
  title: string;
  company: string;
  description?: string;
  url?: string;
  location?: string;
}
