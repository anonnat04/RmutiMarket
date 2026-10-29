const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { supabase } = require('../config/db');

async function inspectTriggers() {
  const { data, error } = await supabase.rpc('exec_sql', {
    query: "SELECT tgname, proname FROM pg_trigger JOIN pg_proc ON pg_trigger.tgfoid = pg_proc.oid WHERE tgrelid = 'public.transactions'::regclass;"
  });
  console.log('Triggers on transactions:', data, error);
}
inspectTriggers();
