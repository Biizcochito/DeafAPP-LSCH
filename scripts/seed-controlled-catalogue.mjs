import {writeFile} from 'node:fs/promises';
import {catalogueSeed} from '../src/training/recognitionCatalog.js';
const seed=catalogueSeed(),json=JSON.stringify(seed);
const sql=`-- Restore the historical catalogue once, preserving existing entries and decisions.
insert into deafapp_private.recognition_catalog(class_id,category,label,comparison_key,display_label,category_title,color,emoji,collection_enabled,state,activation_scope,minimum_originals,recording_goal,people_goal)
select v->>'classId',v->>'category',v->>'label',(v->>'category')||'/'||translate(v->>'label','áéíóúü','aeiouu'),v->>'displayLabel',v->>'categoryTitle',v->>'color',v->>'emoji',
  (v->>'collection')::boolean,v->>'state',v->>'activationScope',(v->>'minimum')::integer,(v->>'recordingGoal')::integer,(v->>'peopleGoal')::integer
from jsonb_array_elements($catalogue$${json}$catalogue$::jsonb) v
on conflict do nothing;
`;
await writeFile(new URL('../supabase/migrations/20261030010100_restore_recognition_catalogue.sql',import.meta.url),sql);
console.log(JSON.stringify({entries:seed.length,preservedActiveEntries:seed.filter(row=>row.state==='enabled').length,pendingEntries:seed.filter(row=>row.state==='collecting').length}));
