import { createClient } from '@supabase/supabase-js';

// Supabase.com proje detaylarınızla değiştirin
const supabaseUrl = 'https://hkpxnlupufnvnjktniyh.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhrcHhubHVwdWZudm5qa3RuaXloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDI4MDQ0NDAsImV4cCI6MjA1ODM4MDQ0MH0.mC5bpDTuhCN1SfMHYTlz4UmaUfkYxPYTKoN0_7H553U';

export const supabase = createClient(supabaseUrl, supabaseKey);