const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY in env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function test(email) {
  const { data, error } = await supabase.rpc('validate_member_email', { p_email: email });
  console.log('email:', email);
  console.log('data:', data);
  console.log('error:', error);
}

const email = process.argv[2] || 'someone@domain.com';
test(email).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(2); });
