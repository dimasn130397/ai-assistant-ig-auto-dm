export interface IgAutomation {
  id: string;
  keyword: string;
  target_url: string;
  comment_reply: string;
  gate_message: string;
  success_message: string;
  is_active: boolean;
  trigger_count: number;
  created_at: string;
  updated_at: string;
}

export interface IgUserState {
  id: string;
  ig_user_id: string;
  ig_username: string | null;
  last_automation_id: string | null;
  comment_id: string | null;
  status: 'pending' | 'verified';
  created_at: string;
  updated_at: string;
}

export interface CreateAutomationInput {
  keyword: string;
  target_url: string;
  comment_reply: string;
  gate_message: string;
  success_message: string;
}
